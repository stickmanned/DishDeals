"use node";
import { GoogleGenAI } from "@google/genai";
import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { RetrievalError } from "../lib/reels/provider";
import { runReelExtraction } from "../lib/reels/contract";
import { extractionBlock } from "../lib/reels/nativeContext";
const args = { itemId: v.id("reelItems"), generation: v.number() };
// Supplied recordings use only the Gemini gate; the resolver gate and key stay untouched.
function configuredForSupplied() {
  if (env.REEL_MEDIA_USAGE_AUTHORIZED !== "true") throw new RetrievalError("CONFIGURATION", "Video analysis is disabled until model usage is authorized. You can still edit by hand.");
  if (!env.GEMINI_API_KEY || !env.GEMINI_REEL_MODEL) throw new RetrievalError("CONFIGURATION", "Video analysis credentials or model are not configured.");
}
// Legacy resolver gate, still read only by the extractor for a pre-existing non-supplied row (none can be created now).
function configured() {
  if (env.REEL_PROVIDER_USAGE_AUTHORIZED !== "true") throw new RetrievalError("CONFIGURATION", "Reel processing is disabled until provider usage is authorized.");
  if (!env.SCRAPECREATORS_API_KEY || !env.GEMINI_API_KEY || !env.GEMINI_REEL_MODEL)
    throw new RetrievalError("CONFIGURATION", "Reel retrieval or extraction credentials are missing.");
}
// The link resolver is permanently retired: no network, no key and no environment flag can bring it back. A link
// alone is never fetched; the user attaches their own recording or edits by hand.
export const retrieve = internalAction({ args, returns: v.boolean(), handler: async (ctx, args): Promise<boolean> => {
  const item: Doc<"reelItems"> | null = await ctx.runQuery(internal.reels.workItem, args);
  if (!item) return false;
  await ctx.runMutation(internal.reels.fail, { ...args, code: "UNAVAILABLE",
    message: "Reels are not fetched from links. Attach your own recording of this Reel, or edit the draft by hand." });
  return false;
} });
export const extract = internalAction({ args, returns: v.null(), handler: async (ctx, args): Promise<null> => {
  const item: Doc<"reelItems"> | null = await ctx.runQuery(internal.reels.workSource, args);
  if (!item?.videoId) return null;
  const supplied = item.sourceKind === "supplied";
  // Truncated supplied text blocks automatic extraction before any configuration read, download or model call.
  const blocked = extractionBlock(item);
  if (blocked) { await ctx.runMutation(internal.reels.fail, { ...args, ...blocked }); return null; }
  try {
    if (supplied) configuredForSupplied(); else configured();
    const video = await ctx.storage.get(item.videoId);
    if (!video) throw new Error("Video missing");
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: 90000 } });
    const result = await runReelExtraction(ai, { model: env.GEMINI_REEL_MODEL!, mimeType: item.mediaMime ?? "video/mp4",
      videoBase64: Buffer.from(await video.arrayBuffer()).toString("base64"), caption: item.caption ?? "", publishedAt: item.publishedAt ?? null,
      duration: item.duration ?? null, nativeContext: item.nativeContext ?? null, ...(supplied ? { supplied: { sourceUrl: item.sourceUrl } } : {}) }, item.duration ?? 0);
    await ctx.runMutation(internal.reels.finish, { ...args, extractionJson: JSON.stringify(result) });
  } catch (error) {
    await ctx.runMutation(internal.reels.fail, { ...args, code: error instanceof RetrievalError ? error.code : "EXTRACTION_FAILED",
      message: error instanceof RetrievalError ? error.message : "The video could not produce a validated draft. Retry or use your own caption/screenshot." });
  }
  return null;
} });
