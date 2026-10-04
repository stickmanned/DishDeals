import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";
import { v } from "convex/values";
const app = defineApp({ env: {
  REEL_PROVIDER_USAGE_AUTHORIZED: v.optional(v.string()),
  SCRAPECREATORS_API_KEY: v.optional(v.string()),
  GEMINI_API_KEY: v.optional(v.string()),
  GEMINI_REEL_MODEL: v.optional(v.string()),
} });
app.use(workflow);
export default app;
