import { z } from "zod";
import { normalizeInstagramUrl } from "./contract";
export class RetrievalError extends Error {
  /** `detail` is for server logs only (field paths, never provider values) and is never shown to users. */
  constructor(public code: "CONFIGURATION" | "UNAVAILABLE" | "RATE_LIMITED" | "RETRIEVAL_FAILED" | "MEDIA_UNSUPPORTED", message: string, public detail?: string) { super(message); }
}
// The provider documents these fields as nullable (photo posts, removed media, no caption), so null
// means "absent" rather than "malformed". Anything else off-contract is still rejected.
const response = z.object({ success: z.boolean(), data: z.object({ xdt_shortcode_media: z.object({
  shortcode: z.string(), video_url: z.string().nullish(), video_duration: z.number().finite().nullish(),
  taken_at_timestamp: z.number().nullish(),
  edge_media_to_caption: z.object({ edges: z.array(z.object({ node: z.object({ text: z.string().nullish() }) })) }).nullish(),
}).nullish() }).nullish() });
export function safeMediaUrl(value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port ||
    !["cdninstagram.com", "fbcdn.net"].some(host => u.hostname.endsWith(`.${host}`)))
    throw new RetrievalError("MEDIA_UNSUPPORTED", "The provider returned an unsupported video host.");
  return u.href;
}
export async function retrieveReel(url: string, apiKey: string, fetcher: typeof fetch = fetch) {
  if (!apiKey) throw new RetrievalError("CONFIGURATION", "Retrieval is not configured.");
  const sourceUrl = normalizeInstagramUrl(url);
  const res = await fetcher(`https://api.scrapecreators.com/v1/instagram/post?url=${encodeURIComponent(sourceUrl)}&include_play_count=false`, {
    headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(45000), redirect: "error",
  });
  if ([403, 404].includes(res.status)) throw new RetrievalError("UNAVAILABLE", "This Reel is private, removed, or unavailable to the provider. Upload a screenshot or paste its caption instead.");
  if (res.status === 429) throw new RetrievalError("RATE_LIMITED", "The retrieval provider is busy. Retry later.");
  if (!res.ok) throw new RetrievalError("RETRIEVAL_FAILED", "The retrieval provider could not read this Reel.");
  const parsed = response.safeParse(await res.json());
  if (!parsed.success) throw new RetrievalError("RETRIEVAL_FAILED", "The retrieval provider returned unexpected data.",
    parsed.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.code}`).join("; "));
  const media = parsed.data.data?.xdt_shortcode_media;
  if (!parsed.data.success || !media?.video_url) throw new RetrievalError("UNAVAILABLE", "No accessible video was found. Use a public Reel or upload your own source.");
  if (!sourceUrl.includes(`/${media.shortcode}/`)) throw new RetrievalError("RETRIEVAL_FAILED", "The retrieved video does not match the shared link.");
  if (!media.video_duration || media.video_duration <= 0 || media.video_duration > 180) throw new RetrievalError("MEDIA_UNSUPPORTED", "Use a Reel up to three minutes long.");
  const video = await fetcher(safeMediaUrl(media.video_url), { signal: AbortSignal.timeout(45000), redirect: "error" });
  if (!video.ok) throw new RetrievalError("UNAVAILABLE", "The video download is unavailable. Retry to retrieve a fresh link.");
  if (video.headers.get("content-type")?.split(";")[0] !== "video/mp4") throw new RetrievalError("MEDIA_UNSUPPORTED", "The video content type is unsupported.");
  // Base64 expansion plus the prompt must stay under Gemini's inline request limit.
  const maxBytes = 12 * 1024 * 1024;
  if (Number(video.headers.get("content-length")) > maxBytes) throw new RetrievalError("MEDIA_UNSUPPORTED", "The Reel is larger than 12 MB.");
  const reader = video.body?.getReader();
  if (!reader) throw new RetrievalError("RETRIEVAL_FAILED", "The video download was empty.");
  const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new RetrievalError("MEDIA_UNSUPPORTED", "The Reel is larger than 12 MB."); }
    chunks.push(new Uint8Array(value));
  }
  const blob = new Blob(chunks, { type: "video/mp4" });
  if (!size) throw new RetrievalError("RETRIEVAL_FAILED", "The video download was empty.");
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (header.length < 12 || String.fromCharCode(...header.slice(4, 8)) !== "ftyp") throw new RetrievalError("MEDIA_UNSUPPORTED", "The downloaded file is not an MP4 video.");
  return { blob, caption: (media.edge_media_to_caption?.edges.flatMap(e => e.node.text ?? []).join("\n") ?? "").slice(0, 30000),
    duration: media.video_duration, publishedAt: media.taken_at_timestamp ? new Date(media.taken_at_timestamp * 1000).toISOString() : null };
}
