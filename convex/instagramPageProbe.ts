"use node";
import { GoogleGenAI } from "@google/genai";
import { ConvexError, v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { INSTAGRAM_PROBE_URL, PROBE_INSTRUCTIONS, PROBE_TIMEOUT_MS, interpretPageProbe, type PageProbeOutcome } from "../lib/instagramPageProbe";

const fail = (code: string, message: string) => new ConvexError({ code, message });

// Server/admin-only diagnostic. No public action, user-data reads, stored result,
// canonical extraction changes, automatic publication, resolver or direct fetch.
export const probe = internalAction({
  args: { url: v.string() },
  returns: v.object({
    sourceUrl: v.literal(INSTAGRAM_PROBE_URL),
    status: v.union(v.literal("retrieved"), v.literal("unsupported")),
    retrieval: v.union(v.null(), v.object({
      url: v.literal(INSTAGRAM_PROBE_URL),
      status: v.union(v.literal("success"), v.literal("error"), v.literal("paywall"), v.literal("unsafe"), v.literal("unknown")),
    })),
    text: v.string(), unconfirmed: v.literal(true), videoExamined: v.literal(false), notice: v.string(),
  }),
  handler: async (_ctx, { url }): Promise<PageProbeOutcome> => {
    if (url !== INSTAGRAM_PROBE_URL) throw fail("INVALID_URL", "This diagnostic accepts only the approved public page URL.");
    if (env.IMAGE_PROVIDER_USAGE_AUTHORIZED !== "true" || !env.GEMINI_API_KEY?.trim() || !env.GEMINI_IMAGE_MODEL?.trim()) {
      throw fail("CONFIGURATION", "The page diagnostic is not enabled on this server.");
    }
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, vertexai: false });
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error("Diagnostic deadline")); }, PROBE_TIMEOUT_MS);
      });
      const response = await Promise.race([
        client.interactions.create({
          model: env.GEMINI_IMAGE_MODEL,
          input: `Read only this approved public page: ${INSTAGRAM_PROBE_URL}`,
          system_instruction: PROBE_INSTRUCTIONS,
          tools: [{ type: "url_context" }],
          generation_config: { max_output_tokens: 600 },
          stream: false, background: false, store: false,
        }, { timeout_ms: PROBE_TIMEOUT_MS, retries: { strategy: "none" }, signal: controller.signal }),
        deadline,
      ]);
      return interpretPageProbe(response);
    } catch {
      // Provider exception/header/request details and server key never leave here.
      throw timedOut
        ? fail("TIMEOUT", "The page diagnostic timed out. No retry was attempted.")
        : fail("PROVIDER_ERROR", "The page diagnostic failed. No retry was attempted.");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  },
});
