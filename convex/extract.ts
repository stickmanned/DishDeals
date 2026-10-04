"use node";
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { ExtractError, extractDealCore, type ExtractOutcome } from "../lib/extractCore";
import { classifyUploadImage, MAX_IMAGE_BYTES } from "../lib/dealImageUpload";

// Public `extract.extractDeal`: owner-checked images and/or supplied text in, the reviewed extractCore envelope out.
// The envelope is {result: DealResult, manualReview, requiresBlockingReview, model}, not a bare DealResult:
// blocking notes (FUTURE_START, UNSUPPORTED_CONSTRAINT) must reach the form. Every field is a suggestion.
// No URL is ever fetched; `provenanceUrl` is provenance only (the core does not even send it to the model).

const nullableString = v.union(v.string(), v.null());
const deal = v.object({
  restaurant: v.string(), address: nullableString, dealText: v.string(), priceCad: v.union(v.number(), v.null()),
  validDays: v.array(v.union(v.literal("mon"), v.literal("tue"), v.literal("wed"), v.literal("thu"), v.literal("fri"), v.literal("sat"), v.literal("sun"))),
  validStart: nullableString, validEnd: nullableString, expiresOn: nullableString, conditions: v.array(v.string()),
  confidence: v.object({ restaurant: v.number(), priceCad: v.number(), hours: v.number(), expiresOn: v.number() }),
});
export const outcome = v.object({
  result: v.object({ isDeal: v.boolean(), deals: v.array(deal) }),
  manualReview: v.array(v.object({
    dealIndex: v.number(),
    code: v.union(v.literal("FUTURE_START"), v.literal("UNSUPPORTED_CONSTRAINT"), v.literal("CURRENCY_UNVERIFIED")),
    blocking: v.boolean(), detail: v.string(), originalAmount: v.optional(v.number()),
  })),
  requiresBlockingReview: v.boolean(),
  model: v.string(),
});

// Fixed, sanitized errors: only the core's code and safe message ever leave the server.
const fail = (code: string, message: string, retryable = false) => new ConvexError({ code, message, retryable });

// Eligibility only: links are provenance, never source content to retrieve. Keep the original supplied
// caption/text for the core's bounded, untrusted evidence input; this helper does not fetch or rewrite it.
function hasSourceText(value: string | undefined): boolean {
  return (value ?? "").split(/\s+/u).some(part => {
    const token = part.replace(/^[([{<"'“‘]+|[)\]}>"'”’,;.!?]+$/gu, "");
    if (!/[\p{L}\p{N}]/u.test(token)) return false;
    const link = /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:mailto|tel|data|javascript):|\/\/|www\.)/i.test(token)
      || /^(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?:[/:?#]|$)/u.test(token);
    return !link;
  });
}

export const extractDeal = action({
  args: {
    imageIds: v.array(v.id("_storage")),
    caption: v.optional(v.string()),
    text: v.optional(v.string()),
    provenanceUrl: v.optional(v.string()),
    publishedAt: v.optional(v.string()),
  },
  returns: outcome,
  handler: async (ctx, args): Promise<ExtractOutcome> => {
    const ownerId = await getAuthUserId(ctx);
    if (ownerId === null) throw fail("NOT_SIGNED_IN", "Not signed in");
    const textOnly = args.imageIds.length === 0;
    if (args.imageIds.length > 8 || new Set(args.imageIds).size !== args.imageIds.length) {
      throw fail("INVALID_INPUT", "Send at most 8 different images.");
    }
    if (textOnly && !hasSourceText(args.caption) && !hasSourceText(args.text)) {
      throw fail("INVALID_INPUT", "Supply an image or paste the actual caption/post text; a link alone cannot be read.");
    }
    // The provider gate and explicit server-only configuration come before any bytes are read.
    if (env.IMAGE_PROVIDER_USAGE_AUTHORIZED !== "true" || !env.GEMINI_API_KEY || !env.GEMINI_IMAGE_MODEL) {
      throw fail("CONFIGURATION", "Image analysis is not enabled on this server.");
    }
    // Private owner validation first (registry row, owner, expiry, size, type); bytes are read only afterwards.
    const owned = () => ctx.runQuery(internal.dealUploads.checkOwned, { ownerId, storageIds: args.imageIds });
    if (!textOnly) {
      try { await owned(); } catch { throw fail("IMAGE_NOT_AVAILABLE", "One of the images is not available to you."); }
    }

    const images: { mimeType: string; bytes: Uint8Array }[] = [];
    for (const id of args.imageIds) {
      const blob = await ctx.storage.get(id);
      if (!blob || blob.size > MAX_IMAGE_BYTES) throw fail("IMAGE_NOT_AVAILABLE", "One of the images is not available to you.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mimeType = classifyUploadImage(bytes); // the real format, not the stored label
      if (!mimeType) throw fail("INVALID_IMAGE", "Unsupported image type.");
      images.push({ mimeType, bytes });
    }
    // The file may have expired or been removed while it was being read.
    if (!textOnly) {
      try { await owned(); } catch { throw fail("IMAGE_NOT_AVAILABLE", "One of the images is not available to you."); }
    }

    try {
      const extracted = await extractDealCore(
        { images, caption: args.caption, text: args.text, provenanceUrl: args.provenanceUrl, publishedAt: args.publishedAt },
        // Models are always explicit; with no fallback configured the primary is simply tried again.
        { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_IMAGE_MODEL, fallbackModel: env.GEMINI_IMAGE_FALLBACK_MODEL || env.GEMINI_IMAGE_MODEL },
      );
      if (!textOnly) return extracted;
      // Text can omit restrictions shown or spoken in the post. Preserve every existing sidecar and all
      // four model confidence values; partial source is a blocking review note, never a probability.
      const manualReview = [...extracted.manualReview, ...extracted.result.deals.map((_, dealIndex) => ({
        dealIndex, code: "UNSUPPORTED_CONSTRAINT" as const, blocking: true,
        detail: "Only supplied caption/text was examined; video and audio were not examined. Verify all fields and any restrictions missing from this partial source before publishing.",
      }))];
      return { ...extracted, manualReview, requiresBlockingReview: manualReview.some(note => note.blocking) };
    } catch (error) {
      if (error instanceof ExtractError) throw fail(error.code, error.message, error.retryable);
      throw fail("EXTRACTION_FAILED", "Extraction failed. Try again.", true);
    }
  },
});
