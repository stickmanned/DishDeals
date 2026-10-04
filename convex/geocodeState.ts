import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { METRO_VANCOUVER_BBOX, NOMINATIM_DEFAULTS, parseAndValidateProviderResponse } from "../lib/geocodeCore";

// Private durable state for the geocode wrapper. Everything here is internal: signed-in callers can
// neither read nor change the gate or the cache directly. No query text or provider body is ever logged.

export const GATE_KEY = "nominatim";
export const MIN_INTERVAL_MS = 1000; // at most one provider request per application per second
const MAX_CLEANUP = 5; // expired cache rows removed per write, so maintenance stays bounded

const candidate = v.object({ lat: v.number(), lng: v.number(), label: v.string() });

/**
 * Reserve the single application-wide provider slot. The grant time lives in one durable row; mutations
 * serialize, so concurrent users and actions can never both win inside the same second. A request is
 * granted when at least 1000 ms have passed since the last grant (exactly 1000 ms is allowed). A clock that
 * reads earlier than the last grant fails closed: nothing is granted, the stored time is not changed, and the
 * caller is told to retry in at most 1000 ms, so a backwards clock can never bypass the one-per-second limit.
 */
export const reserveSlot = internalMutation({
  args: {},
  returns: v.union(v.object({ granted: v.literal(true) }), v.object({ granted: v.literal(false), retryAfterMs: v.number() })),
  handler: async (ctx) => {
    const now = Date.now();
    const row = await ctx.db.query("geocodeGate").withIndex("by_key", q => q.eq("key", GATE_KEY)).unique(); // a duplicate row throws
    if (row === null) {
      await ctx.db.insert("geocodeGate", { key: GATE_KEY, lastGrantedAt: now });
      return { granted: true as const };
    }
    const elapsed = now - row.lastGrantedAt; // negative when the clock went backwards
    if (elapsed < MIN_INTERVAL_MS) return { granted: false as const, retryAfterMs: Math.min(MIN_INTERVAL_MS, Math.max(1, MIN_INTERVAL_MS - elapsed)) };
    await ctx.db.patch(row._id, { lastGrantedAt: now });
    return { granted: true as const };
  },
});

/** Unexpired cached candidates for a hashed core cache key, or null. Expired rows are ignored. */
export const cacheGet = internalQuery({
  args: { cacheKey: v.string() },
  returns: v.union(v.array(candidate), v.null()),
  handler: async (ctx, { cacheKey }) => {
    if (!/^[0-9a-f]{64}$/.test(cacheKey)) return null;
    const row = (await ctx.db.query("geocodeCache").withIndex("by_key", q => q.eq("cacheKey", cacheKey)).take(1))[0];
    return row && row.expiresAt > Date.now() ? row.results : null;
  },
});

/**
 * Store validated candidates for a key. The row for the same key is reused (never appended); stray duplicate
 * rows and up to MAX_CLEANUP expired rows are removed. Input is re-validated with the core's own parser.
 */
export const cachePut = internalMutation({
  args: { cacheKey: v.string(), results: v.array(candidate), ttlMs: v.number() },
  returns: v.null(),
  handler: async (ctx, { cacheKey, results, ttlMs }) => {
    if (!/^[0-9a-f]{64}$/.test(cacheKey)) throw new ConvexError("Invalid cache key.");
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > NOMINATIM_DEFAULTS.maxCacheTtlMs) throw new ConvexError("Invalid cache lifetime.");
    if (results.length > NOMINATIM_DEFAULTS.limit) throw new ConvexError("Too many cached candidates.");
    const valid = parseAndValidateProviderResponse(results, METRO_VANCOUVER_BBOX, NOMINATIM_DEFAULTS.limit);
    if (valid.length !== results.length) throw new ConvexError("Invalid cached candidates."); // nothing outside the envelope is stored
    const now = Date.now();
    const rows = await ctx.db.query("geocodeCache").withIndex("by_key", q => q.eq("cacheKey", cacheKey)).take(5);
    const [keep, ...extras] = rows;
    for (const extra of extras) await ctx.db.delete(extra._id);
    if (keep) await ctx.db.patch(keep._id, { results: valid, expiresAt: now + ttlMs });
    else await ctx.db.insert("geocodeCache", { cacheKey, results: valid, expiresAt: now + ttlMs });
    for (const old of await ctx.db.query("geocodeCache").withIndex("by_expiry", q => q.lt("expiresAt", now)).take(MAX_CLEANUP)) {
      if (old._id !== keep?._id) await ctx.db.delete(old._id);
    }
    return null;
  },
});
