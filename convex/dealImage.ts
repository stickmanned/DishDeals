import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { httpAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { originAllowed, parseConfiguredOrigin } from "../lib/reels/suppliedMedia";
import { MAX_IMAGE_BYTES, READ_DEADLINE_MS, classifyUploadImage, imageCorsHeaders, isUploadType, parseDeclaredLength } from "../lib/dealImageUpload";

// POST /deal-image: the only way an image enters the private upload registry. The user is derived from the
// Bearer token, the file format from its leading bytes, and the owner row is created by the server after the
// file is stored. No URL is ever fetched. Every response after the origin check carries CORS headers.

const json = (status: number, body: object, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

export const preflight = httpAction(async (_ctx, request) => {
  const configured = parseConfiguredOrigin(env.REEL_WEB_ORIGIN);
  if (!configured.ok || !originAllowed(request.headers.get("Origin"), configured)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: imageCorsHeaders(configured.origin) });
});

type Read = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; status: number; error: string };

// Missing Content-Length is allowed (browsers cannot set it); the cap applies to the streamed bytes, a present
// header must agree with them, and the whole read has a deadline. Cancellation is never awaited.
async function readCapped(request: Request, declared: number | null): Promise<Read> {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400, error: "empty" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">(resolve => { timer = setTimeout(() => resolve("timeout"), READ_DEADLINE_MS); });
  const stop = () => { void reader.cancel().catch(() => {}); };
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next === "timeout") { stop(); return { ok: false, status: 408, error: "timeout" }; }
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_IMAGE_BYTES || (declared !== null && size > declared)) { stop(); return { ok: false, status: 413, error: "too_large" }; }
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
  const cors = imageCorsHeaders(configured.origin);
  const fail = (status: number, error: string) => json(status, { error }, cors);

  let storageId: Id<"_storage"> | undefined;
  try {
    const ownerId = await getAuthUserId(ctx);
    if (ownerId === null) return fail(401, "auth");
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].length > 0) return fail(400, "query"); // nothing is read from the URL
    const declared = request.headers.get("Content-Type")?.toLowerCase().trim();
    if (!isUploadType(declared)) return fail(415, "type");
    const length = parseDeclaredLength(request.headers.get("Content-Length"));
    if (length === "invalid") return fail(400, "length");
    if (length !== null && length < 16) return fail(400, "empty");
    if (length !== null && length > MAX_IMAGE_BYTES) return fail(413, "too_large");

    const read = await readCapped(request, length);
    if (!read.ok) return fail(read.status, read.error);
    // File-format evidence only: the declared type must match the leading bytes. HEIC/HEIF are not accepted.
    if (classifyUploadImage(read.bytes) !== declared) return fail(415, "type");

    storageId = await ctx.storage.store(new Blob([read.bytes], { type: declared }));
    await ctx.runMutation(internal.dealUploads.register, { ownerId, storageId });
    return json(200, { storageId }, cors);
  } catch {
    // Unexpected failure (including a registry write failure): remove the orphan, answer with CORS, log nothing.
    if (storageId) { try { await ctx.storage.delete(storageId); } catch { /* best effort */ } }
    return fail(500, "unexpected");
  }
});
