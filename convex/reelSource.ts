import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { httpAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  META_HEADER, MAX_MEDIA_BYTES, READ_DEADLINE_MS, classifyMedia, corsHeaders, isDeclaredType, originAllowed, parseConfiguredOrigin, parseUploadRequest,
} from "../lib/reels/suppliedMedia";

// POST /reel-source: the only way a recording enters a private Reel item.
// Storage ownership is established here, on the server, after authentication;
// a client never supplies an existing _storage id. No provider is called.
// Every response after the origin check carries CORS headers, including errors.

const json = (status: number, body: object, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

export const preflight = httpAction(async (_ctx, request) => {
  const configured = parseConfiguredOrigin(env.REEL_WEB_ORIGIN);
  const origin = request.headers.get("Origin");
  if (!configured.ok || !originAllowed(origin, configured)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(configured.origin) });
});

type Read = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; status: number; error: string };

// Browsers cannot set Content-Length and proxy forwarding is not guaranteed, so
// a missing header is allowed; the cap applies to the streamed bytes in every
// case, a present header must agree with them, and the whole read has a deadline.
async function readCapped(request: Request, declared: number | null): Promise<Read> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, error: "empty" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">(resolve => { timer = setTimeout(() => resolve("timeout"), READ_DEADLINE_MS); });
  const stop = () => { void reader.cancel().catch(() => {}); }; // never await: a stalled source may not settle
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next === "timeout") { stop(); return { ok: false, status: 408, error: "timeout" }; }
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_MEDIA_BYTES || (declared !== null && size > declared)) { stop(); return { ok: false, status: 413, error: "too_large" }; }
      chunks.push(next.value);
    }
  } catch {
    stop();
    return { ok: false, status: 400, error: "aborted" };
  } finally {
    clearTimeout(timer);
  }
  if (size < 16 || (declared !== null && size !== declared)) return { ok: false, status: 400, error: "length" };
  const bytes = new Uint8Array(new ArrayBuffer(size));
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return { ok: true, bytes };
}

export const upload = httpAction(async (ctx, request) => {
  const configured = parseConfiguredOrigin(env.REEL_WEB_ORIGIN);
  if (!configured.ok) return json(503, { error: "not_configured" });
  if (!originAllowed(request.headers.get("Origin"), configured)) return json(403, { error: "origin" });
  const cors = corsHeaders(configured.origin);
  const fail = (status: number, error: string) => json(status, { error }, cors);

  // Nothing below may leave the browser without a CORS-bearing response.
  let videoId: Id<"_storage"> | undefined;
  try {
    const ownerId = await getAuthUserId(ctx);
    if (ownerId === null) return fail(401, "auth");

    // Cheap rejections first, all before any body read or storage write.
    const query = parseUploadRequest(new URL(request.url), request.headers.get(META_HEADER));
    if (!query) return fail(400, "metadata");
    const declared = request.headers.get("Content-Type")?.toLowerCase().trim();
    if (!isDeclaredType(declared)) return fail(415, "type");
    const lengthHeader = request.headers.get("Content-Length");
    let declaredLength: number | null = null;
    if (lengthHeader !== null) {
      if (!/^\d{1,9}$/.test(lengthHeader)) return fail(400, "length");
      declaredLength = Number(lengthHeader);
      if (declaredLength < 16) return fail(400, "empty");
      if (declaredLength > MAX_MEDIA_BYTES) return fail(413, "too_large");
    }

    let target: { generation: number } | null;
    try { target = await ctx.runQuery(internal.reels.sourceTarget, { itemId: query.itemId as Id<"reelItems">, ownerId }); }
    catch { return fail(400, "metadata"); }
    if (!target) return fail(404, "not_found");

    const read = await readCapped(request, declaredLength);
    if (!read.ok) return fail(read.status, read.error);
    const media = classifyMedia(read.bytes);
    if (!media || media.declared !== declared) return fail(415, "type");

    videoId = await ctx.storage.store(new Blob([read.bytes], { type: declared }));
    const result = await ctx.runMutation(internal.reels.attachSupplied, {
      itemId: query.itemId as Id<"reelItems">, ownerId, expectedGeneration: target.generation, videoId,
      mediaMime: media.providerMime, mediaBytes: read.bytes.length, duration: query.duration,
      caption: query.caption ?? null, publishedAt: query.publishedAt ?? null,
    });
    if (result.attached) return json(200, { status: "attached", generation: result.generation }, cors);
    await ctx.storage.delete(videoId); // rejected: never leave an orphan
    videoId = undefined;
    if (result.reason === "rate_limited") return fail(429, "rate_limited");
    return fail(result.reason === "not_found" ? 404 : 409, result.reason);
  } catch {
    // Unexpected failure: remove any upload that was not associated, answer with CORS, log nothing.
    if (videoId) { try { await ctx.storage.delete(videoId); } catch { /* best effort */ } }
    return fail(500, "unexpected");
  }
});
