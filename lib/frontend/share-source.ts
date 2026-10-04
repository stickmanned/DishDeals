import { safeSourceUrl, type WorkflowSource } from "./workflow";

export function sharedLink(text: string) {
  const match = text.trim().match(/(?:https?:\/\/|www\.)[^\s<>]+/i);
  if (!match) return null;
  const raw = match[0].replace(/[.,!?)\]，。！）]+$/, "");
  const valid = safeSourceUrl(raw.startsWith("www.") ? `https://${raw}` : raw);
  if (!valid) throw new Error("Use a public HTTPS link without account details or a custom port.");
  const url = new URL(valid);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|igsh|igshid|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  }
  return { url: url.href, caption: text.replace(match[0], "").trim() };
}

export function buildSharedSource({ text, image, sourceUrl, publishedAt }: {
  text: string; image?: string; sourceUrl?: string; publishedAt?: string;
}): WorkflowSource {
  const link = sharedLink(text);
  const attribution = sourceUrl ? safeSourceUrl(sourceUrl) : link?.url;
  if (sourceUrl && !attribution) throw new Error("Use a public HTTPS source link.");
  const provenance = { ...(attribution ? { sourceUrl: attribution } : {}), ...(publishedAt ? { publishedAt } : {}) };
  if (image) {
    if (!image.startsWith("data:image/jpeg;base64,")) throw new Error("Choose your image again before submitting.");
    if (text.length > 10000) throw new Error("Keep image details under 10,000 characters.");
    return { type: "image", mimeType: "image/jpeg", data: image.split(",")[1], ...(text.trim() ? { caption: text.trim() } : {}), ...provenance };
  }
  if (link) {
    if (link.caption.length > 10000) throw new Error("Keep link details under 10,000 characters.");
    return { type: "url", url: link.url, ...(link.caption ? { caption: link.caption } : {}), ...provenance };
  }
  if (text.trim().length < 10) throw new Error("Paste a link, add an image, or tell us a little more about the offer.");
  if (text.length > 30000) throw new Error("Keep the offer text under 30,000 characters.");
  return { type: "text", text: text.trim(), ...provenance };
}
