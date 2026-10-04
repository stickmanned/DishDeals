// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the REAL public geocode.geocode action and its internal durable gate/cache
// helpers, with a scripted fake transport (vi.stubGlobal fetch). All users, queries and provider answers
// are SYNTHETIC. No Nominatim request is ever made, so this is NOT evidence about the real provider,
// the Find button, a WKWebView, the map or a phone.
import { vi } from "vitest";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { NOMINATIM_DEFAULTS } from "../../lib/geocodeCore";

const modules = import.meta.glob("../../convex/**/*.ts");
const UA = "DishDeals-Test/1.0 (synthetic-contact@example.invalid)";
const T0 = new Date("2026-10-04T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

const hit = (name: string, lat = 49.2827, lon = -123.1207) => ({ lat: String(lat), lon: String(lon), display_name: name });
const answer = (items: unknown[], status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(items), { status, headers });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(T0);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("unexpected network call"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const enable = (over: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries({ GEOCODE_USAGE_AUTHORIZED: "true", GEOCODE_USER_AGENT: UA, ...over })) vi.stubEnv(k, v);
};
const network = (steps: (Response | (() => Response | Promise<Response>))[]) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    return typeof step === "function" ? step() : step.clone();
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
};

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await Promise.all([0, 1, 2, 3].map(() => t.run(ctx => ctx.db.insert("users", {}))));
  const users = ids.map(id => t.withIdentity({ subject: `${id}|session` }));
  const gate = () => t.run(ctx => ctx.db.query("geocodeGate").collect());
  const cache = () => t.run(ctx => ctx.db.query("geocodeCache").collect());
  return { t, users, user: users[0], gate, cache };
}
const code = (e: unknown) => (e as { data?: { code?: string; message?: string; retryAfterMs?: number } }).data;
const failure = async (p: Promise<unknown>) => { try { await p; } catch (e) { return code(e); } throw new Error("expected rejection"); };
const find = (s: Awaited<ReturnType<typeof setup>>, query: string, who = 0) => s.users[who].action(api.geocode.geocode, { query });

describe("access, configuration and query validation (no provider, no gate use)", () => {
  it("rejects signed-out callers before the cache or the provider", async () => {
    const s = await setup(); enable();
    expect((await failure(s.t.action(api.geocode.geocode, { query: "Pho Hoa" })))?.code).toBe("NOT_SIGNED_IN");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await s.gate()).toHaveLength(0);
  });
  it.each([
    ["gate not true", { GEOCODE_USAGE_AUTHORIZED: "false" }], ["gate empty", { GEOCODE_USAGE_AUTHORIZED: "" }], ["no User-Agent", { GEOCODE_USER_AGENT: "" }],
    ["User-Agent without contact", { GEOCODE_USER_AGENT: "DishDeals-Test/1.0" }], ["generic curl agent", { GEOCODE_USER_AGENT: "curl/8.0 (me@example.invalid)" }],
    ["non-https remote endpoint", { GEOCODE_ENDPOINT: "http://nominatim.example.invalid/search" }], ["endpoint with credentials", { GEOCODE_ENDPOINT: "https://u:p@nominatim.example.invalid/search" }],
  ])("fails closed with %s", async (_n, over) => {
    const s = await setup(); enable(over);
    expect((await failure(find(s, "Pho Hoa")))?.code).toBe("CONFIGURATION_ERROR");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await s.gate()).toHaveLength(0);
  });
  it("refuses even a cached query when the server gate is off", async () => {
    const s = await setup(); enable(); network([answer([hit("Pho Hoa, Vancouver")])]);
    await find(s, "Pho Hoa");
    vi.stubEnv("GEOCODE_USAGE_AUTHORIZED", "false");
    expect((await failure(find(s, "Pho Hoa")))?.code).toBe("CONFIGURATION_ERROR");
  });
  it.each(["", " ", "a", "x".repeat(121), "https://example.invalid/x", "<script>alert(1)</script>", "bad\u0000byte", "!!!"])("rejects invalid query %j without using the gate", async query => {
    const s = await setup(); enable();
    expect((await failure(find(s, query)))?.code).toBe("INVALID_QUERY");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(await s.gate()).toHaveLength(0);
  });
});

describe("a granted lookup", () => {
  it("calls the configured provider once with the policy request, returns validated candidates, and caches them", async () => {
    const s = await setup(); enable();
    const net = network([answer([hit("Pho Hoa, Vancouver"), hit("Far away", 40.0, -100.0), hit("Second", 49.25, -123.0), { lat: "x", lon: "y", display_name: "bad" }])]);
    const out = await find(s, "  Pho   Hoa ");
    expect(out).toEqual([{ lat: 49.2827, lng: -123.1207, label: "Pho Hoa, Vancouver" }, { lat: 49.25, lng: -123, label: "Second" }]); // outside-envelope and malformed hits are dropped
    expect(net.calls).toHaveLength(1);
    const url = new URL(net.calls[0].url);
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("bounded")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("viewbox")).toBe("-123.35,49.45,-122.55,49");
    expect(url.searchParams.get("q")).toBe("Pho Hoa");
    expect((net.calls[0].init.headers as Record<string, string>)["User-Agent"]).toBe(UA);
    const rows = await s.cache();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ results: out, expiresAt: T0 + NOMINATIM_DEFAULTS.cacheTtlMs });
    expect(rows[0].cacheKey).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].cacheKey).not.toMatch(/pho|nominatim/i); // the key stores neither the query nor the endpoint in clear
  });
  it("returns at most 5 candidates and a genuine empty list when nothing matches (no guessed pin)", async () => {
    const s = await setup(); enable();
    network([answer(Array.from({ length: 9 }, (_, i) => hit(`Place ${i}`, 49.2 + i / 100)))]);
    expect(await find(s, "many places")).toHaveLength(5);
    network([answer([])]);
    vi.setSystemTime(T0 + 2000);
    expect(await find(s, "nowhere at all")).toEqual([]);
  });
  it("serves a repeat (case/whitespace variants, any user) from the cache with no network and no gate use", async () => {
    const s = await setup(); enable(); const net = network([answer([hit("Pho Hoa, Vancouver")])]);
    const first = await find(s, "Pho Hoa");
    const gateBefore = await s.gate();
    expect(await find(s, "  pho   HOA ", 1)).toEqual(first);
    expect(await find(s, "PHO HOA", 2)).toEqual(first);
    expect(net.calls).toHaveLength(1);
    expect(await s.gate()).toEqual(gateBefore);
    expect(await s.cache()).toHaveLength(1);
  });
  it("ignores an expired entry, refetches, and reuses the same row instead of appending", async () => {
    const s = await setup(); enable(); const net = network([answer([hit("Old answer")]), answer([hit("New answer")])]);
    await find(s, "Pho Hoa");
    const [row] = await s.cache();
    vi.setSystemTime(T0 + NOMINATIM_DEFAULTS.cacheTtlMs); // exactly at expiry: expired
    const out = await find(s, "Pho Hoa");
    expect(out[0].label).toBe("New answer");
    expect(net.calls).toHaveLength(2);
    const rows = await s.cache();
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(row._id);
    expect(rows[0].expiresAt).toBe(T0 + 2 * NOMINATIM_DEFAULTS.cacheTtlMs);
  });
  it("keeps entries valid for a full seven days minus one millisecond", async () => {
    const s = await setup(); enable(); const net = network([answer([hit("Pho Hoa, Vancouver")])]);
    await find(s, "Pho Hoa");
    vi.setSystemTime(T0 + 7 * DAY - 1);
    await find(s, "Pho Hoa");
    expect(net.calls).toHaveLength(1);
  });
  it("bounds maintenance: a write removes at most 5 expired rows", async () => {
    const s = await setup(); enable(); network([answer([hit("Pho Hoa, Vancouver")])]);
    await s.t.run(async ctx => { for (let i = 0; i < 9; i++) await ctx.db.insert("geocodeCache", { cacheKey: String(i).padStart(64, "a"), results: [], expiresAt: T0 - 1 - i }); });
    await find(s, "Pho Hoa");
    expect((await s.cache()).length).toBe(9 - 5 + 1);
  });
  it("scopes the cache by endpoint: a different endpoint never sees another endpoint's entry", async () => {
    const s = await setup(); enable(); const net = network([answer([hit("Default endpoint")]), answer([hit("Other endpoint")])]);
    await find(s, "Pho Hoa");
    vi.stubEnv("GEOCODE_ENDPOINT", "https://nominatim.example.invalid/custom/search");
    vi.setSystemTime(T0 + 2000);
    const out = await find(s, "Pho Hoa");
    expect(out[0].label).toBe("Other endpoint");
    expect(new URL(net.calls[1].url).origin).toBe("https://nominatim.example.invalid");
    expect(await s.cache()).toHaveLength(2);
  });
});

describe("the durable application-wide gate", () => {
  it("allows exactly one request per second across users: 999 ms is refused, 1000 ms is granted", async () => {
    const s = await setup(); enable(); const net = network([answer([hit("A")]), answer([hit("B")]), answer([hit("C")])]);
    await find(s, "first query", 0);
    vi.setSystemTime(T0 + 999);
    const denied = await failure(find(s, "second query", 1)); // a different user, an uncached query
    expect(denied).toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 1 });
    expect(net.calls).toHaveLength(1);
    vi.setSystemTime(T0 + 1000);
    await find(s, "second query", 1);
    expect(net.calls).toHaveLength(2);
    vi.setSystemTime(T0 + 1500);
    expect((await failure(find(s, "third query", 2)))?.retryAfterMs).toBe(500);
  });
  it("lets concurrent users and actions through one at a time: eight simultaneous lookups make one provider request", async () => {
    const s = await setup(); enable(); const net = network([answer([hit("Only one")])]);
    const outcomes = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => find(s, `query number ${i}`, i % 4)));
    expect(net.calls).toHaveLength(1);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === "rejected");
    expect(rejected).toHaveLength(7);
    for (const r of rejected) expect(code(r.reason)).toMatchObject({ code: "RATE_LIMITED" });
    const gate = await s.gate();
    expect(gate).toHaveLength(1); // a single singleton row
    expect(gate[0]).toMatchObject({ key: "nominatim", lastGrantedAt: T0 });
  });
  it("direct reservation: exactly one grant among concurrent calls and a singleton row", async () => {
    const s = await setup();
    const results = await Promise.all(Array.from({ length: 10 }, () => s.t.mutation(internal.geocodeState.reserveSlot, {})));
    expect(results.filter(r => r.granted)).toHaveLength(1);
    expect(await s.gate()).toHaveLength(1);
    vi.setSystemTime(T0 + 999);
    expect(await s.t.mutation(internal.geocodeState.reserveSlot, {})).toEqual({ granted: false, retryAfterMs: 1 });
    vi.setSystemTime(T0 + 1000);
    expect(await s.t.mutation(internal.geocodeState.reserveSlot, {})).toEqual({ granted: true });
  });
  it("a backwards clock fails closed: no grant, lastGrantedAt untouched, bounded retry, recovery only at the real boundary", async () => {
    const s = await setup();
    expect(await s.t.mutation(internal.geocodeState.reserveSlot, {})).toEqual({ granted: true });
    const granted = (await s.gate())[0];
    expect(granted.lastGrantedAt).toBe(T0);
    for (const back of [1, 500, 60_000, 3_600_000]) {
      vi.setSystemTime(T0 - back);
      expect(await s.t.mutation(internal.geocodeState.reserveSlot, {})).toEqual({ granted: false, retryAfterMs: 1000 }); // bounded and actionable, never huge
      expect(await s.gate()).toEqual([granted]); // the row did not advance or move backwards
    }
    vi.setSystemTime(T0); // the clock is back at the grant time: still inside the second
    expect(await s.t.mutation(internal.geocodeState.reserveSlot, {})).toEqual({ granted: false, retryAfterMs: 1000 });
    vi.setSystemTime(T0 + 999);
    expect(await s.t.mutation(internal.geocodeState.reserveSlot, {})).toEqual({ granted: false, retryAfterMs: 1 });
    expect(await s.gate()).toEqual([granted]);
    vi.setSystemTime(T0 + 1000);
    expect(await s.t.mutation(internal.geocodeState.reserveSlot, {})).toEqual({ granted: true });
    expect((await s.gate())[0].lastGrantedAt).toBe(T0 + 1000);
  });
  it("a backwards clock cannot bring a second provider request through the action", async () => {
    const s = await setup(); enable(); const net = network([answer([hit("A")]), answer([hit("B")])]);
    await find(s, "first query", 0);
    const granted = await s.gate();
    vi.setSystemTime(T0 - 30_000);
    const denied = await failure(find(s, "second query", 1));
    expect(denied).toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 1000 });
    expect(net.calls).toHaveLength(1);
    expect(await s.gate()).toEqual(granted);
    expect(await s.cache()).toHaveLength(1); // nothing new was cached
    vi.setSystemTime(T0 + 1000);
    await find(s, "second query", 1);
    expect(net.calls).toHaveLength(2);
  });
  it("a failed provider request still consumed its slot", async () => {
    const s = await setup(); enable(); const net = network([new Response("", { status: 503 })]);
    expect((await failure(find(s, "first query")))?.code).toBe("PROVIDER_UNAVAILABLE");
    expect((await failure(find(s, "second query", 1)))?.code).toBe("RATE_LIMITED");
    expect(net.calls).toHaveLength(1);
  });
});

describe("provider failures are typed, sanitized and never cached", () => {
  const run = async (step: Response | (() => Response | Promise<Response>), expected: string, extra?: (s: Awaited<ReturnType<typeof setup>>) => Promise<void>) => {
    const s = await setup(); enable(); network([step]);
    const logs = (["log", "error", "warn"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    const err = await failure(find(s, "private-ish place query"));
    expect(err?.code).toBe(expected);
    const text = JSON.stringify(err);
    for (const secret of ["private-ish", UA, "nominatim", "synthetic-contact"]) expect(text).not.toContain(secret);
    expect(Object.keys(err!).every(k => ["code", "message", "retryAfterMs"].includes(k))).toBe(true);
    expect(await s.cache()).toHaveLength(0);
    for (const l of logs) expect(l).not.toHaveBeenCalled();
    await extra?.(s);
    return err;
  };
  it("HTTP 503", () => run(new Response("", { status: 503 }), "PROVIDER_UNAVAILABLE"));
  it("HTTP 400", () => run(new Response("secret provider body", { status: 400 }), "PROVIDER_ERROR"));
  it("HTTP 429 with Retry-After", async () => {
    const err = await run(new Response("", { status: 429, headers: { "Retry-After": "3" } }), "RATE_LIMITED");
    expect(err?.retryAfterMs).toBe(3000);
  });
  it("malformed JSON", () => run(new Response("not json", { status: 200 }), "INVALID_RESPONSE"));
  it("a non-array answer", () => run(new Response(JSON.stringify({ error: "x" }), { status: 200 }), "INVALID_RESPONSE"));
  it("a response body over the size cap", () => run(new Response(JSON.stringify([hit("x".repeat(NOMINATIM_DEFAULTS.maxResponseBytes))]), { status: 200 }), "INVALID_RESPONSE"));
  it("a network error", () => run(() => { throw new Error("socket reset with the query inside"); }, "PROVIDER_UNAVAILABLE"));
  it("a hung request ends in a typed timeout at the 8 s deadline", async () => {
    const s = await setup(); enable();
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => (init.signal as AbortSignal).addEventListener("abort", () => void Promise.resolve().then(() => rej(new Error("aborted")))))));
    const pending = find(s, "slow place").then(() => null, (e: unknown) => code(e));
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(500); // the deadline timer starts after the gate step settles
    expect((await pending)?.code).toBe("PROVIDER_TIMEOUT");
    expect(await s.cache()).toHaveLength(0);
  });
  it("a stalled response body ends in a typed timeout", async () => {
    const s = await setup(); enable();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start() { /* headers arrive, body never does */ } }), { status: 200 })));
    const pending = find(s, "stalled place").then(() => null, (e: unknown) => code(e));
    for (let i = 0; i < 40; i++) await vi.advanceTimersByTimeAsync(500); // the deadline timer starts after the gate step settles
    expect((await pending)?.code).toBe("PROVIDER_TIMEOUT");
  });
  it("every candidate outside the Metro Vancouver envelope yields an empty list, never a guessed pin", async () => {
    const s = await setup(); enable(); network([answer([hit("Toronto", 43.65, -79.38), hit("Nowhere", 0, 0)])]);
    expect(await find(s, "somewhere far")).toEqual([]);
  });
});

describe("helpers are private and validate their input", () => {
  it("the gate and cache helpers are registered as internal functions, so they have no public entry point", async () => {
    const state = (await import("../../convex/geocodeState")) as unknown as Record<string, { isInternal?: boolean; isPublic?: boolean }>;
    for (const name of ["reserveSlot", "cacheGet", "cachePut"]) {
      expect(state[name].isInternal, name).toBe(true);
      expect(state[name].isPublic, name).toBeUndefined();
    }
    const pub = (await import("../../convex/geocode")) as unknown as Record<string, { isPublic?: boolean }>;
    expect(pub.geocode.isPublic).toBe(true);
  });
  it("the module exposes only geocode publicly", async () => {
    expect(Object.keys(await import("../../convex/geocode")).sort()).toEqual(["geocode"]);
  });
  it("cachePut rejects malformed keys, lifetimes and candidates, storing nothing", async () => {
    const s = await setup();
    const good = { lat: 49.28, lng: -123.12, label: "Ok" };
    const key = "b".repeat(64);
    const bad: [string, unknown][] = [
      ["short key", { cacheKey: "abc", results: [good], ttlMs: 1000 }], ["upper-case key", { cacheKey: "B".repeat(64), results: [good], ttlMs: 1000 }],
      ["zero ttl", { cacheKey: key, results: [good], ttlMs: 0 }], ["over 30 days", { cacheKey: key, results: [good], ttlMs: 31 * DAY }], ["NaN ttl", { cacheKey: key, results: [good], ttlMs: NaN }],
      ["6 candidates", { cacheKey: key, results: Array.from({ length: 6 }, () => good), ttlMs: 1000 }],
      ["outside the envelope", { cacheKey: key, results: [{ lat: 40, lng: -100, label: "far" }], ttlMs: 1000 }],
      ["blank label", { cacheKey: key, results: [{ lat: 49.28, lng: -123.12, label: "  " }], ttlMs: 1000 }],
      ["NaN coordinate", { cacheKey: key, results: [{ lat: NaN, lng: -123.12, label: "x" }], ttlMs: 1000 }],
    ];
    for (const [, args] of bad) await expect(s.t.mutation(internal.geocodeState.cachePut, args as never)).rejects.toThrow();
    expect(await s.cache()).toHaveLength(0);
    await s.t.mutation(internal.geocodeState.cachePut, { cacheKey: key, results: [good], ttlMs: 1000 });
    expect(await s.t.query(internal.geocodeState.cacheGet, { cacheKey: key })).toEqual([good]);
    expect(await s.t.query(internal.geocodeState.cacheGet, { cacheKey: "not-a-key" })).toBeNull();
  });
  it("cachePut collapses duplicate rows for a key into one", async () => {
    const s = await setup(); const key = "c".repeat(64);
    await s.t.run(async ctx => { for (let i = 0; i < 3; i++) await ctx.db.insert("geocodeCache", { cacheKey: key, results: [], expiresAt: T0 + 1e6 }); });
    await s.t.mutation(internal.geocodeState.cachePut, { cacheKey: key, results: [{ lat: 49.28, lng: -123.12, label: "Ok" }], ttlMs: 1000 });
    expect(await s.cache()).toHaveLength(1);
  });
  it("a duplicate gate row is reported as an error instead of choosing one", async () => {
    const s = await setup();
    await s.t.run(async ctx => { await ctx.db.insert("geocodeGate", { key: "nominatim", lastGrantedAt: 1 }); await ctx.db.insert("geocodeGate", { key: "nominatim", lastGrantedAt: 2 }); });
    await expect(s.t.mutation(internal.geocodeState.reserveSlot, {})).rejects.toThrow();
  });
});
