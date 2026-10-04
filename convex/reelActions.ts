"use node";
import { GoogleGenAI } from "@google/genai";
import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { retrieveReel, RetrievalError } from "../lib/reels/provider";
import { runReelExtraction } from "../lib/reels/contract";
const args = { itemId: v.id("reelItems"), generation: v.number() };
// Supplied recordings use only the Gemini gate; the resolver gate and key stay untouched.
function configuredForSupplied() {
  if (env.REEL_MEDIA_USAGE_AUTHORIZED !== "true") throw new RetrievalError("CONFIGURATION", "Video analysis is disabled until model usage is authorized. You can still edit by hand.");
  if (!env.GEMINI_API_KEY || !env.GEMINI_REEL_MODEL) throw new RetrievalError("CONFIGURATION", "Video analysis credentials or model are not configured.");
}
function configured() {
  if (env.REEL_PROVIDER_USAGE_AUTHORIZED !== "true") throw new RetrievalError("CONFIGURATION", "Reel processing is disabled until provider usage is authorized.");
  if (!env.SCRAPECREATORS_API_KEY || !env.GEMINI_API_KEY || !env.GEMINI_REEL_MODEL)
    throw new RetrievalError("CONFIGURATION", "Reel retrieval or extraction credentials are missing.");
}
export const retrieve = internalAction({ args, returns: v.boolean(), handler: async (ctx, args): Promise<boolean> => {
  const item: Doc<"reelItems"> | null = await ctx.runQuery(internal.reels.workItem, args);
  if (!item) return false;
  let videoId: Id<"_storage"> | undefined;
  try {
    configured(); await ctx.runMutation(internal.reels.markRetrieving, args);
    const media = await retrieveReel(item.sourceUrl, env.SCRAPECREATORS_API_KEY!);
    videoId = await ctx.storage.store(media.blob);
    return await ctx.runMutation(internal.reels.attachMedia, { ...args, videoId, caption: media.caption, duration: media.duration, publishedAt: media.publishedAt });
  } catch (error) {
    if (videoId) await ctx.storage.delete(videoId);
    await ctx.runMutation(internal.reels.fail, { ...args,
      code: error instanceof RetrievalError ? error.code : "RETRIEVAL_FAILED",
      message: error instanceof RetrievalError ? error.message : "The retrieval service could not download this Reel. Retry later." });
    return false;
  }
} });
export const extract = internalAction({ args, returns: v.null(), handler: async (ctx, args): Promise<null> => {
  const item: Doc<"reelItems"> | null = await ctx.runQuery(internal.reels.workItem, args);
  if (!item?.videoId) return null;
  const supplied = item.sourceKind === "supplied";
  try {
    if (supplied) configuredForSupplied(); else configured();
    const video = await ctx.storage.get(item.videoId);
    if (!video) throw new Error("Video missing");
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: 90000 } });
    const result = await runReelExtraction(ai, { model: env.GEMINI_REEL_MODEL!, mimeType: item.mediaMime ?? "video/mp4",
      videoBase64: Buffer.from(await video.arrayBuffer()).toString("base64"), caption: item.caption ?? "", publishedAt: item.publishedAt ?? null,
      duration: item.duration ?? null, ...(supplied ? { supplied: { sourceUrl: item.sourceUrl } } : {}) }, item.duration ?? 0);
    await ctx.runMutation(internal.reels.finish, { ...args, extractionJson: JSON.stringify(result) });
  } catch (error) {
    await ctx.runMutation(internal.reels.fail, { ...args, code: error instanceof RetrievalError ? error.code : "EXTRACTION_FAILED",
      message: error instanceof RetrievalError ? error.message : "The video could not produce a validated draft. Retry or use your own caption/screenshot." });
  }
  return null;
} });
