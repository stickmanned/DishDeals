import { query } from "./_generated/server";

// Configuration readiness only. Provider secrets never leave the backend.
export const status = query({ args: {}, handler: () => ({
  geminiConfigured: !!process.env.GEMINI_API_KEY?.trim(),
  geoapifyConfigured: !!process.env.GEOAPIFY_API_KEY?.trim(),
}) });
