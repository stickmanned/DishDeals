import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";
import geospatial from "@convex-dev/geospatial/convex.config.js";
import { v } from "convex/values";
const app = defineApp({ env: {
  REEL_PROVIDER_USAGE_AUTHORIZED: v.optional(v.string()),
  SCRAPECREATORS_API_KEY: v.optional(v.string()),
  GEMINI_API_KEY: v.optional(v.string()),
  GEMINI_REEL_MODEL: v.optional(v.string()),
  REEL_MEDIA_USAGE_AUTHORIZED: v.optional(v.string()),
  REEL_WEB_ORIGIN: v.optional(v.string()),
  IMAGE_PROVIDER_USAGE_AUTHORIZED: v.optional(v.string()),
  GEMINI_IMAGE_MODEL: v.optional(v.string()),
  GEMINI_IMAGE_FALLBACK_MODEL: v.optional(v.string()),
  GEOCODE_USAGE_AUTHORIZED: v.optional(v.string()),
  GEOCODE_USER_AGENT: v.optional(v.string()),
  GEOCODE_ENDPOINT: v.optional(v.string()),
  // Published teammate workflow (names only; values stay in the deployment).
  GEOAPIFY_API_KEY: v.optional(v.string()),
  GEMINI_MODEL: v.optional(v.string()),
  GEMINI_FALLBACK_MODEL: v.optional(v.string()),
  GEMINI_SEARCH_MODEL: v.optional(v.string()),
  GEMINI_WEB_SEARCH_MODEL: v.optional(v.string()),
  GEMINI_COMPARISON_MODEL: v.optional(v.string()),
  WORKFLOW_API_TOKEN: v.optional(v.string()),
  WORKFLOW_PROVIDER_USAGE_AUTHORIZED: v.optional(v.string()),
} });
app.use(workflow);
app.use(geospatial);
export default app;
