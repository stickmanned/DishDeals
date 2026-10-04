import { env, query } from "./_generated/server";

// Configuration readiness only. Provider secrets never leave the backend.
export const status = query({ args: {}, handler: () => ({
  geminiConfigured: !!env.GEMINI_API_KEY?.trim(),
  geoapifyConfigured: !!env.GEOAPIFY_API_KEY?.trim(),
  reelsConfigured: env.REEL_PROVIDER_USAGE_AUTHORIZED === "true" && !!env.SCRAPECREATORS_API_KEY && !!env.GEMINI_REEL_MODEL,
}) });
