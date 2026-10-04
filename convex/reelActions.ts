"use node";
import { GoogleGenAI } from "@google/genai";
import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { retrieveReel, RetrievalError } from "../lib/reels/provider";
import { ReelExtractionError, runReelExtraction } from "../lib/reels/contract";
import { isUploadType } from "../lib/dealImageUpload";
import { extractionBlock } from "../lib/reels/nativeContext";
const args = { itemId: v.id("reelItems"), generation: v.number() };
// Supplied recordings use only the Gemini gate; the resolver gate and key stay untouched.
function configuredForSupplied() {
  if (env.REEL_MEDIA_USAGE_AUTHORIZED !== "true") throw new RetrievalError("CONFIGURATION", "Video analysis is disabled until model usage is authorized. You can still edit by hand.");
  if (!env.GEMINI_API_KEY || !env.GEMINI_REEL_MODEL) throw new RetrievalError("CONFIGURATION", "Video analysis credentials or model are not configured.");
}
// Link retrieval gate: the provider key and usage flag are server-side only. Both must be set before any request is made.
function configured() {
  if (env.REEL_PROVIDER_USAGE_AUTHORIZED !== "true") throw new RetrievalError("CONFIGURATION", "Reel retrieval is not enabled on this server. Attach your own recording of this Reel, or edit the draft by hand.");
  if (!env.SCRAPECREATORS_API_KEY || !env.GEMINI_API_KEY || !env.GEMINI_REEL_MODEL)
    throw new RetrievalError("CONFIGURATION", "Reel retrieval is not configured on this server. Attach your own recording of this Reel, or edit the draft by hand.");
}
// Retrieves the Reel a user shared by link (William authorized this: a link is the only way to read a Reel's contents).
// A missing gate or key fails closed before any network call. The provider client allow-lists the video host, caps size
// and duration, and checks the shortcode matches the shared link. A user-attached recording is the fallback for a
// private or removed Reel. The downloaded media is deleted once a draft exists (reels.finish).
export const retrieve = internalAction({ args, returns: v.boolean(), handler: async (ctx, args): Promise<boolean> => {
  const item: Doc<"reelItems"> | null = await ctx.runQuery(internal.reels.workItem, args);
  if (!item) return false;
  let videoId: Id<"_storage"> | undefined;
  try {
    configured();
    await ctx.runMutation(internal.reels.markRetrieving, args);
    const media = await retrieveReel(item.sourceUrl, env.SCRAPECREATORS_API_KEY!);
    videoId = await ctx.storage.store(media.blob);
    return await ctx.runMutation(internal.reels.attachMedia, { ...args, videoId, caption: media.caption, duration: media.duration, publishedAt: media.publishedAt, mediaMime: isUploadType(media.blob.type) ? media.blob.type : "video/mp4" });
  } catch (error) {
    if (videoId) await ctx.storage.delete(videoId);
    const known = error instanceof RetrievalError;
    // Fixed fields only: the failure code and, for a schema mismatch, the field paths (never provider values).
    // A gated-off or unconfigured server is an expected state, not a failure worth logging.
    if (!known || error.code !== "CONFIGURATION")
      console.warn(JSON.stringify({ event: "reel_retrieve_failed", code: known ? error.code : "OTHER", detail: known ? error.detail ?? null : null }));
    await ctx.runMutation(internal.reels.fail, { ...args,
      code: known ? error.code : "RETRIEVAL_FAILED",
      message: known ? error.message : "The retrieval service could not download this Reel. Retry later, attach your own recording, or edit by hand." });
    return false;
  }
} });
export const extract = internalAction({ args, returns: v.null(), handler: async (ctx, args): Promise<null> => {
  const item: Doc<"reelItems"> | null = await ctx.runQuery(internal.reels.workSource, args);
  if (!item?.videoId) return null;
  const image = isUploadType(item.mediaMime);
  const supplied = item.sourceKind === "supplied";
  // Truncated supplied text blocks automatic extraction before any configuration read, download or model call.
  const blocked = extractionBlock(item);
  if (blocked) { await ctx.runMutation(internal.reels.fail, { ...args, ...blocked }); return null; }
  try {
    if (supplied) configuredForSupplied(); else configured();
    if (image && (env.IMAGE_PROVIDER_USAGE_AUTHORIZED !== "true" || !env.GEMINI_IMAGE_MODEL)) throw new RetrievalError("CONFIGURATION", "Photo analysis is not enabled on this server. You can still edit by hand.");
    const video = await ctx.storage.get(item.videoId);
    if (!video) throw new Error("Video missing");
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: 90000 } });
    const result = await runReelExtraction(ai, { model: image ? env.GEMINI_IMAGE_MODEL! : env.GEMINI_REEL_MODEL!, mimeType: item.mediaMime ?? "video/mp4",
      videoBase64: Buffer.from(await video.arrayBuffer()).toString("base64"), caption: item.caption ?? "", publishedAt: item.publishedAt ?? null,
      duration: item.duration ?? null, nativeContext: item.nativeContext ?? null, ...(supplied ? { supplied: { sourceUrl: item.sourceUrl } } : {}) }, item.duration ?? 0);
    await ctx.runMutation(internal.reels.finish, { ...args, extractionJson: JSON.stringify(result) });
  } catch (error) {
    if (!(error instanceof RetrievalError)) {
      // Fixed fields only: failure kind, HTTP status and a short reason with the key removed. Never the video, caption or model text.
      const key = env.GEMINI_API_KEY ?? "";
      const reason = (error instanceof Error ? error.message : "").split(key || "\u0000").join("[key]").replace(/\s+/g, " ").slice(0, 200);
      console.warn(JSON.stringify({ event: "reel_extract_failed", kind: error instanceof ReelExtractionError ? error.kind : "other", status: error instanceof ReelExtractionError ? error.status ?? null : null, reason, model: (image ? env.GEMINI_IMAGE_MODEL : env.GEMINI_REEL_MODEL) ?? null, durationSeconds: item.duration ?? null }));
    }
    await ctx.runMutation(internal.reels.fail, { ...args, code: error instanceof RetrievalError ? error.code : "EXTRACTION_FAILED",
      message: error instanceof RetrievalError ? error.message : "The source could not produce a validated draft. Retry or use your own caption/screenshot." });
  }
  return null;
} });
