import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { GeocodeError, geocodeCore, type GeocodeErrorCode, type GeocodeResult } from "../lib/geocodeCore";

// Public `geocode.geocode({query})`: up to 5 {lat, lng, label} candidates inside the Metro Vancouver envelope.
// It only proposes pins; a person must still confirm the location. Called only from an explicit Find button
// (never autocomplete, reverse grids or bulk seeding). Policy: https://operations.osmfoundation.org/policies/nominatim/
// (one request per second for the whole application, identifying User-Agent, cache, no personal queries) and
// https://nominatim.org/release-docs/latest/api/Search/. Results derive from OpenStreetMap data (c) OpenStreetMap
// contributors, ODbL 1.0: the UI must show that attribution.

const resultShape = v.object({ lat: v.number(), lng: v.number(), label: v.string() });

// Fixed messages only: no query text, User-Agent, endpoint, provider body or internals ever reach a caller.
const MESSAGES: Record<GeocodeErrorCode | "NOT_SIGNED_IN" | "GEOCODE_FAILED", string> = {
  NOT_SIGNED_IN: "Not signed in.",
  INVALID_QUERY: "Enter a place name or address of 2 to 120 characters.",
  CONFIGURATION_ERROR: "Location search is not enabled on this server.",
  RATE_LIMITED: "Location search is busy. Try again shortly.",
  PROVIDER_TIMEOUT: "Location search timed out. Try again.",
  PROVIDER_UNAVAILABLE: "Location search is unavailable. Try again later.",
  PROVIDER_ERROR: "Location search could not complete.",
  INVALID_RESPONSE: "Location search returned an unusable answer.",
  GEOCODE_FAILED: "Location search failed.",
};
const fail = (code: keyof typeof MESSAGES, retryAfterMs?: number) =>
  new ConvexError({ code, message: MESSAGES[code], ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export const geocode = action({
  args: { query: v.string() },
  returns: v.array(resultShape),
  handler: async (ctx, { query }): Promise<GeocodeResult[]> => {
    if ((await getAuthUserId(ctx)) === null) throw fail("NOT_SIGNED_IN");
    // Explicit server gate and a genuine identifying User-Agent (no default, no invented contact) come before
    // the cache and the provider; the core re-validates the User-Agent and endpoint.
    const userAgent = env.GEOCODE_USER_AGENT?.trim();
    if (env.GEOCODE_USAGE_AUTHORIZED !== "true" || !userAgent) throw fail("CONFIGURATION_ERROR");
    try {
      return await geocodeCore({ query }, { userAgent, ...(env.GEOCODE_ENDPOINT ? { endpoint: env.GEOCODE_ENDPOINT } : {}) }, {
        // The durable, application-wide gate: one provider request per second across all users and actions.
        reserveGlobalSlot: () => ctx.runMutation(internal.geocodeState.reserveSlot, {}),
        // The core's cache key already scopes endpoint, search envelope and result limit; it is hashed so the
        // raw query text is not stored.
        cacheGet: async key => ctx.runQuery(internal.geocodeState.cacheGet, { cacheKey: await sha256Hex(key) }),
        cachePut: async (key, results, ttlMs) => {
          await ctx.runMutation(internal.geocodeState.cachePut, { cacheKey: await sha256Hex(key), results, ttlMs: ttlMs ?? 7 * 24 * 60 * 60 * 1000 });
        },
      });
    } catch (error) {
      if (error instanceof GeocodeError) throw fail(error.code, error.code === "RATE_LIMITED" ? error.retryAfterMs : undefined);
      throw fail("GEOCODE_FAILED");
    }
  },
});
