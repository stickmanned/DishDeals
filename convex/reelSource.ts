import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { httpAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  MAX_MEDIA_BYTES, classifyMedia, corsHeaders, isDeclaredType, originAllowed, parseConfiguredOrigin, parseUploadQuery,
} from "../lib/reels/suppliedMedia";

// POST /reel-source: the only way a recording enters a private Reel item.
// Storage ownership is established here, on the server, after authentication;
// a client never supplies an existing _storage id. No provider is called.

const json = (status: number, body: object, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

export const preflight = httpAction(async (_ctx, request) => {
  const configured = parseConfiguredOrigin(env.REEL_WEB_ORIGIN);
  const origin = request.headers.get("Origin");
  if (!configured.ok || !originAllowed(origin, configured)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(configured.origin) });
});

export const upload = httpAction(async (ctx, request) => {
  const configured = parseConfiguredOrigin(env.REEL_WEB_ORIGIN);
  if (!configured.ok) return json(503, { error: "not_configured" });
  if (!originAllowed(request.headers.get("Origin"), configured)) return json(403, { error: "origin" });
  const cors = corsHeaders(configured.origin);
  const fail = (status: number, error: string) => json(status, { error }, cors);

  const ownerId = await getAuthUserId(ctx);
  if (ownerId === null) return fail(401, "auth");

  // Cheap rejections first, all before any body read or storage write.
  const query = parseUploadQuery(new URL(request.url));
  if (!query) return fail(400, "metadata");
  const declared = request.headers.get("Content-Type")?.toLowerCase().trim();
  if (!isDeclaredType(declared)) return fail(415, "type");
  const lengthHeader = request.headers.get("Content-Length");
  if (!lengthHeader || !/^\d{1,9}$/.test(lengthHeader)) return fail(411, "length");
  const declaredLength = Number(lengthHeader);
  if (declaredLength < 16) return fail(400, "empty");
  if (declaredLength > MAX_MEDIA_BYTES) return fail(413, "too_large");

  let target: { generation: number } | null;
  try { target = await ctx.runQuery(internal.reels.sourceTarget, { itemId: query.itemId as Id<"reelItems">, ownerId }); }
  catch { return fail(400, "metadata"); }
  if (!target) return fail(404, "not_found");

  // The Content-Length header can lie: enforce the cap while reading.
  const reader = request.body?.getReader();
  if (!reader) return fail(400, "empty");
  const bytes = new Uint8Array(declaredLength);
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > declaredLength || size > MAX_MEDIA_BYTES) { await reader.cancel(); return fail(413, "too_large"); }
    bytes.set(value, size - value.byteLength);
  }
  if (size !== declaredLength) return fail(400, "length");
  const media = classifyMedia(bytes);
  if (!media || media.declared !== declared) return fail(415, "type");

  const videoId = await ctx.storage.store(new Blob([bytes], { type: declared }));
  try {
    const result = await ctx.runMutation(internal.reels.attachSupplied, {
      itemId: query.itemId as Id<"reelItems">, ownerId, expectedGeneration: target.generation, videoId,
      mediaMime: media.providerMime, mediaBytes: size, duration: query.duration,
      caption: query.caption ?? null, publishedAt: query.publishedAt ?? null,
    });
    if (result.attached) return json(200, { status: "attached", generation: result.generation }, cors);
    await ctx.storage.delete(videoId); // rejected: never leave an orphan
    if (result.reason === "rate_limited") return fail(429, "rate_limited");
    return fail(result.reason === "not_found" ? 404 : 409, result.reason);
  } catch {
    await ctx.storage.delete(videoId);
    return fail(500, "unexpected");
  }
});
