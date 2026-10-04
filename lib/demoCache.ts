import { z } from "zod";
import { validateExtractOutcome } from "./extractionDraft";
import type { ExtractOutcome } from "./extractCore";
import { RESPONSE_JSON_SCHEMA, SYSTEM_PROMPT, buildContextText } from "./prompt";

// Browser-safe cache preparation. Metadata records an operator's provenance
// assertion; validation cannot prove a provider call occurred. Never treat
// cached replay as live extraction or automatically confirmed deal fields.
export type DemoInput = {
  original: Uint8Array;
  images: { bytes: Uint8Array; mimeType: string }[];
  caption?: string;
  text?: string;
  provenanceUrl?: string;
  publishedAt?: string;
  promptVersion: string;
};
export type DemoKey = { sourceSha256: string; requestSha256: string; promptVersion: string };
const SHA = /^[a-f0-9]{64}$/;
const MAX_JSON = 2 * 1024 * 1024;
const fixtureSchema = z.strictObject({
  version: z.literal(1),
  sourceSha256: z.string().regex(SHA),
  requestSha256: z.string().regex(SHA),
  promptVersion: z.string().min(1).max(100),
  provenance: z.strictObject({
    kind: z.literal("live-provider-capture"),
    capturedAt: z.iso.datetime(),
    evidenceReference: z.string().min(1).max(300),
    model: z.string().min(1).max(100),
  }),
  outcome: z.unknown(),
});
async function sha(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hash = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
/**
 * What a key needs from the actual bytes, kept as hashes only: the original source file and every prepared
 * (resized, uploaded) image in upload order. Computed once per selected source so a retry or a later toggle never
 * needs the bytes again and nothing large stays in memory.
 */
export type DemoMaterial = { sourceSha256: string; images: { sha256: string; mimeType: string }[] };
export type DemoContext = { caption?: string; text?: string; provenanceUrl?: string; publishedAt?: string };

export async function demoMaterial(original: Uint8Array, images: { bytes: Uint8Array; mimeType: string }[]): Promise<DemoMaterial> {
  if (!original.length || original.length > 20 * 1024 * 1024 || !images.length || images.length > 8) throw new Error("Invalid demo source.");
  const hashed = [];
  for (const image of images) {
    if (!image.bytes.length || image.bytes.length > 5 * 1024 * 1024 || !IMAGE_MIMES.includes(image.mimeType)) throw new Error("Invalid demo image.");
    hashed.push({ sha256: await sha(image.bytes), mimeType: image.mimeType });
  }
  return { sourceSha256: await sha(original), images: hashed };
}
export async function demoKeyFromMaterial(material: DemoMaterial, context: DemoContext, promptVersion: string): Promise<DemoKey> {
  if (!SHA.test(material.sourceSha256) || !material.images.length || material.images.length > 8 || !promptVersion.trim() || promptVersion.length > 100) throw new Error("Invalid demo source.");
  for (const image of material.images) if (!SHA.test(image.sha256) || !IMAGE_MIMES.includes(image.mimeType)) throw new Error("Invalid demo image.");
  for (const value of [context.caption, context.text, context.provenanceUrl, context.publishedAt]) {
    if (value !== undefined && (typeof value !== "string" || value.length > 20000)) throw new Error("Invalid source context.");
  }
  const requestSha256 = await sha(new TextEncoder().encode(JSON.stringify({
    sourceSha256: material.sourceSha256, images: material.images.map(i => ({ sha256: i.sha256, mimeType: i.mimeType })),
    caption: context.caption ?? null, text: context.text ?? null,
    provenanceUrl: context.provenanceUrl ?? null, publishedAt: context.publishedAt ?? null,
    promptVersion,
  })));
  return { sourceSha256: material.sourceSha256, requestSha256, promptVersion };
}
export async function demoKey(input: DemoInput): Promise<DemoKey> {
  if (!input.promptVersion.trim() || input.promptVersion.length > 100) throw new Error("Invalid demo source.");
  const material = await demoMaterial(input.original, input.images);
  return demoKeyFromMaterial(material, input, input.promptVersion);
}

/** Bump when the extraction-outcome envelope (model, result, manualReview, requiresBlockingReview) changes shape. */
export const EXTRACT_ENVELOPE_CONTRACT = "extract-outcome-v1";
/**
 * The prompt/contract version a genuine capture must have been made under: a digest of the CURRENT system prompt,
 * response schema and context builder (lib/prompt.ts) plus the envelope contract. Editing the prompt or schema
 * changes this value, so every older fixture becomes a miss instead of replaying stale behavior.
 */
export async function currentPromptVersion(): Promise<string> {
  const digest = await sha(new TextEncoder().encode(JSON.stringify([
    SYSTEM_PROMPT, RESPONSE_JSON_SCHEMA, buildContextText({ imageCount: 0 }), EXTRACT_ENVELOPE_CONTRACT,
  ])));
  return `${EXTRACT_ENVELOPE_CONTRACT}:${digest.slice(0, 24)}`;
}
export type DemoCacheResult =
  | { status: "hit"; outcome: ExtractOutcome; provenance: z.infer<typeof fixtureSchema>["provenance"] }
  | { status: "miss"; reason: "missing" | "invalid" | "unavailable" | "canceled" };

// Reader cap applies even with no Content-Length. Explicit deadline races both
// headers and body; abort alone cannot bound an injected/nonsettling transport.
export async function loadDemoFixture(
  key: DemoKey,
  options: { fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<DemoCacheResult> {
  if (!SHA.test(key.sourceSha256) || !SHA.test(key.requestSha256) || !key.promptVersion.trim() || key.promptVersion.length > 100) return { status: "miss", reason: "invalid" };
  const timeoutMs = options.timeoutMs ?? 3000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000) return { status: "miss", reason: "invalid" };
  if (options.signal?.aborted) return { status: "miss", reason: "canceled" };
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let rejectStop: (error: Error) => void = () => {};
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
  const stop = () => { controller.abort(); rejectStop(new Error("stopped")); };
  options.signal?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, timeoutMs);
  try {
    const response = await Promise.race([(options.fetch ?? fetch)(`/fixtures/demo/${key.sourceSha256}.json`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" }), stopped]);
    if (response.status === 404) return { status: "miss", reason: "missing" };
    if (!response.ok) return { status: "miss", reason: "unavailable" };
    const length = response.headers.get("Content-Length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_JSON)) return { status: "miss", reason: "invalid" };
    reader = response.body?.getReader();
    if (!reader) return { status: "miss", reason: "invalid" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await Promise.race([reader.read(), stopped]);
      if (part.done) break;
      size += part.value.length;
      if (size > MAX_JSON) return { status: "miss", reason: "invalid" };
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    const fixture = fixtureSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (fixture.sourceSha256 !== key.sourceSha256 || fixture.requestSha256 !== key.requestSha256 || fixture.promptVersion !== key.promptVersion) return { status: "miss", reason: "invalid" };
    validateExtractOutcome(fixture.outcome);
    if (fixture.provenance.model !== fixture.outcome.model || fixture.outcome.result.deals.length > 10) return { status: "miss", reason: "invalid" };
    for (const deal of fixture.outcome.result.deals) {
      if (Object.values(deal.confidence).some(score => !Number.isFinite(score) || score < 0 || score > 1)) return { status: "miss", reason: "invalid" };
    }
    return { status: "hit", outcome: fixture.outcome, provenance: fixture.provenance };
  } catch {
    return { status: "miss", reason: options.signal?.aborted ? "canceled" : "unavailable" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", stop);
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}
