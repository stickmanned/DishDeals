// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the REAL POST /reel-source HTTP action and the
// internal association/workflow wrappers. Videos are SYNTHETIC ISO-BMFF bytes,
// identities are synthetic, and the model SDK is a labeled mock. This is not a
// real recording, WKWebView picker, deployed backend, live Gemini or phone.
import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const sdk = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = sdk; } }));

const modules = import.meta.glob(["../../convex/**/*.ts", "!../../convex/**/*.test.ts"]);
const ORIGIN = "https://app.example.test";
const link = "https://www.instagram.com/reel/AbCdEf123/";
const T0 = new Date("2026-10-04T12:00:00Z").getTime();

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); vi.stubEnv("REEL_WEB_ORIGIN", ORIGIN); sdk.generateContent.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function media(brand: string, size = 4096) {
  const b = new Uint8Array(size);
  new DataView(b.buffer).setUint32(0, 24);
  b.set([..."ftyp"].map(c => c.charCodeAt(0)), 4);
  b.set([...brand].map(c => c.charCodeAt(0)), 8);
  for (let i = 24; i < size; i++) b[i] = i % 251;
  return b;
}
const mp4 = (size?: number) => media("isom", size);
const qt = (size?: number) => media("qt  ", size);

async function setup() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const [a, b] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${a}|session` });
  const bob = t.withIdentity({ subject: `${b}|session` });
  const { itemId } = await alice.mutation(api.reels.submit, { text: link });
  const item = () => t.run(ctx => ctx.db.get("reelItems", itemId));
  const stored = () => t.run(ctx => ctx.db.system.query("_storage").collect());
  const exists = (id: Id<"_storage">) => t.run(async ctx => (await ctx.storage.get(id)) !== null);
  const bytesOf = (id: Id<"_storage">) => t.run(async ctx => { const b = await ctx.storage.get(id); return b ? Array.from(new Uint8Array(await b.arrayBuffer())) : null; });
  const limits = () => t.run(ctx => ctx.db.query("reelLimits").collect());
  const post = (caller: { fetch: typeof t.fetch }, bytes: Uint8Array | null, o: { id?: string; type?: string | null; duration?: string; extra?: string; origin?: string | null; length?: string | null } = {}) => {
    const headers: Record<string, string> = {};
    if (o.origin !== null) headers.Origin = o.origin ?? ORIGIN;
    if (o.type !== null) headers["Content-Type"] = o.type ?? "video/mp4";
    const len = o.length === undefined ? (bytes ? String(bytes.length) : "0") : o.length;
    if (len !== null) headers["Content-Length"] = len;
    return caller.fetch(`/reel-source?itemId=${o.id ?? itemId}&duration=${o.duration ?? "30"}${o.extra ?? ""}`, { method: "POST", headers, body: (bytes ?? undefined) as BodyInit | undefined });
  };
  const settle = async () => { for (let i = 0; i < 40; i++) { vi.advanceTimersByTime(200); await t.finishInProgressScheduledFunctions(); } };
  return { t, alice, bob, a, b, itemId, item, stored, exists, bytesOf, limits, post, settle };
}
type S = Awaited<ReturnType<typeof setup>>;
const unchanged = async (s: S, before: unknown) => { expect(await s.item()).toEqual(before); expect(await s.stored()).toHaveLength(0); };

describe("CORS and configuration", () => {
  it("answers the preflight for the one configured origin only, with no wildcard or credentials flag", async () => {
    const s = await setup();
    const ok = await s.t.fetch("/reel-source", { method: "OPTIONS", headers: { Origin: ORIGIN } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(ok.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(ok.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
    for (const origin of ["https://evil.example", "http://app.example.test", "null"]) {
      const bad = await s.t.fetch("/reel-source", { method: "OPTIONS", headers: { Origin: origin } });
      expect(bad.status).toBe(403);
      expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
    expect((await s.t.fetch("/reel-source", { method: "OPTIONS" })).status).toBe(403);
  });
  it.each([undefined, "*", "http://app.example.test", "https://app.example.test/path", "https://app.example.test/"])("an invalid REEL_WEB_ORIGIN (%s) rejects preflight and uploads", async value => {
    const s = await setup();
    vi.stubEnv("REEL_WEB_ORIGIN", value as string);
    if (value === undefined) delete process.env.REEL_WEB_ORIGIN;
    expect((await s.t.fetch("/reel-source", { method: "OPTIONS", headers: { Origin: ORIGIN } })).status).toBe(403);
    expect((await s.post(s.alice as never, mp4())).status).toBe(503);
    expect(await s.stored()).toHaveLength(0);
  });
  it("accepts an explicitly configured localhost development origin", async () => {
    const s = await setup();
    vi.stubEnv("REEL_WEB_ORIGIN", "http://localhost:3000");
    expect((await s.post(s.alice as never, mp4(), { origin: "http://localhost:3000" })).status).toBe(200);
  });
});

describe("authentication, origin and ownership", () => {
  it("rejects a wrong or missing Origin before anything is read or stored", async () => {
    const s = await setup(); const before = await s.item();
    for (const origin of ["https://evil.example", null]) {
      expect((await s.post(s.alice as never, mp4(), { origin })).status).toBe(403);
    }
    await unchanged(s, before);
  });
  it("rejects a signed-out upload", async () => {
    const s = await setup(); const before = await s.item();
    const r = await s.post(s.t as never, mp4());
    expect(r.status).toBe(401);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    await unchanged(s, before);
  });
  it("rejects another user's item as not found, never touching it", async () => {
    const s = await setup(); const before = await s.item();
    expect((await s.post(s.bob as never, mp4())).status).toBe(404);
    await unchanged(s, before);
  });
  it("returns 400 for malformed ids and 404 for a deleted or expired item", async () => {
    const s = await setup();
    for (const id of ["short", "../etc", "%00%00%00%00%00%00%00%00%00%00%00"]) expect((await s.post(s.alice as never, mp4(), { id })).status).toBe(400);
    const r = await s.post(s.alice as never, mp4(), { id: s.a as string }); // an id from another table
    expect([400, 404]).toContain(r.status);
    expect(await s.stored()).toHaveLength(0);
    const before = await s.item();
    vi.setSystemTime(before!.expiresAt + 1);
    expect((await s.post(s.alice as never, mp4())).status).toBe(404);
    vi.setSystemTime(T0);
    await s.alice.mutation(api.reels.remove, { itemId: s.itemId });
    expect((await s.post(s.alice as never, mp4())).status).toBe(404);
    expect(await s.stored()).toHaveLength(0);
  });
});

describe("request validation happens before storage", () => {
  const cases: [string, (s: S) => Promise<Response>, number][] = [
    ["missing duration", s => s.alice.fetch(`/reel-source?itemId=${s.itemId}`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "video/mp4", "Content-Length": "4096" }, body: mp4() }), 400],
    ["zero duration", s => s.post(s.alice as never, mp4(), { duration: "0" }), 400],
    ["duration over 180", s => s.post(s.alice as never, mp4(), { duration: "181" }), 400],
    ["non-numeric duration", s => s.post(s.alice as never, mp4(), { duration: "NaN" }), 400],
    ["unknown query key", s => s.post(s.alice as never, mp4(), { extra: "&url=https://www.instagram.com/reel/x/" }), 400],
    ["repeated key", s => s.post(s.alice as never, mp4(), { extra: "&duration=31" }), 400],
    ["bad publication date", s => s.post(s.alice as never, mp4(), { extra: "&publishedAt=2026-02-30" }), 400],
    ["future publication date", s => s.post(s.alice as never, mp4(), { extra: "&publishedAt=2027-01-01" }), 400],
    ["over-long caption", s => s.post(s.alice as never, mp4(), { extra: `&caption=${"a".repeat(2201)}` }), 400],
    ["caption control character", s => s.post(s.alice as never, mp4(), { extra: "&caption=a%00b" }), 400],
    ["text/html content type", s => s.post(s.alice as never, mp4(), { type: "text/html" }), 415],
    ["octet-stream content type", s => s.post(s.alice as never, mp4(), { type: "application/octet-stream" }), 415],
    ["missing content type", s => s.post(s.alice as never, mp4(), { type: null }), 415],
    ["declared mp4 but QuickTime bytes", s => s.post(s.alice as never, qt(), { type: "video/mp4" }), 415],
    ["declared quicktime but MP4 bytes", s => s.post(s.alice as never, mp4(), { type: "video/quicktime" }), 415],
    ["HTML body", s => s.post(s.alice as never, new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(64, " "))), 415],
    ["HEIC image body", s => s.post(s.alice as never, media("heic")), 415],
    ["declared length over 12 MiB", s => s.post(s.alice as never, mp4(), { length: String(12 * 1024 * 1024 + 1) }), 413],
    ["tiny declared length", s => s.post(s.alice as never, mp4(), { length: "4" }), 400],
    ["body longer than declared", s => s.post(s.alice as never, mp4(5000), { length: "4096" }), 413],
    ["body shorter than declared", s => s.post(s.alice as never, mp4(4000), { length: "4096" }), 400],
  ];
  it.each(cases)("%s -> %s", async (_name, run, status) => {
    const s = await setup(); const before = await s.item();
    const r = await run(s);
    expect(r.status).toBe(status);
    expect((await r.json()).status).toBeUndefined(); // never an attached receipt
    await unchanged(s, before);
  });
  it("accepts an exactly 12 MiB body and rejects one byte more", async () => {
    const s = await setup();
    const exact = mp4(12 * 1024 * 1024);
    expect((await s.post(s.alice as never, exact)).status).toBe(200);
    const s2 = await setup(); const before = await s2.item();
    expect((await s2.post(s2.alice as never, mp4(12 * 1024 * 1024 + 1))).status).toBe(413);
    await unchanged(s2, before);
  });
});

describe("successful attachment", () => {
  it("stores the bytes server-side, associates them atomically and returns the receipt", async () => {
    const s = await setup();
    const bytes = mp4(8192);
    const r = await s.post(s.alice as never, bytes, { duration: "42.5", extra: "&publishedAt=2026-10-01&caption=Lunch%20special" });
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(await r.json()).toEqual({ status: "attached", generation: 2 });
    const item = (await s.item())!;
    expect(item).toMatchObject({ sourceKind: "supplied", mediaMime: "video/mp4", mediaBytes: 8192, duration: 42.5, caption: "Lunch special", publishedAt: "2026-10-01", generation: 2, status: "queued" });
    expect(await s.bytesOf(item.videoId!)).toEqual(Array.from(bytes));
    expect(await s.stored()).toHaveLength(1);
  });
  it("labels QuickTime recordings with the provider's video/mov", async () => {
    const s = await setup();
    expect((await s.post(s.alice as never, qt(), { type: "video/quicktime" })).status).toBe(200);
    expect((await s.item())!.mediaMime).toBe("video/mov");
  });
  it("makes no external call and logs nothing", async () => {
    const s = await setup();
    const net = vi.spyOn(globalThis, "fetch");
    const logs = (["log", "error", "warn"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await s.post(s.alice as never, mp4());
    await s.settle();
    expect(net).not.toHaveBeenCalled();
    expect(sdk.generateContent).not.toHaveBeenCalled();
    for (const l of logs) expect(l).not.toHaveBeenCalled();
    // the workflow library's own workpool status lines are the only permitted output
    for (const call of info.mock.calls) expect(String(call[0])).toMatch(/"component":"workpool"/);
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/instagram|Bearer|ftyp/);
  });
});

describe("race, rate-limit and orphan handling", () => {
  it("deletes the orphan when the rate limit rejects the association", async () => {
    const s = await setup(); const before = await s.item();
    await s.t.run(ctx => ctx.db.insert("reelLimits", { ownerId: before!.ownerId, windowStart: T0, count: 10 }));
    const r = await s.post(s.alice as never, mp4());
    expect(r.status).toBe(429);
    await unchanged(s, before);
  });
  it("the internal association rejects stale generations, other owners, deleted and expired items without changing anything", async () => {
    const s = await setup(); const base = (await s.item())!;
    const upload = () => s.t.run(ctx => ctx.storage.store(new Blob(["synthetic"], { type: "video/mp4" })));
    const args = (videoId: Id<"_storage">, over: object = {}) => ({ itemId: s.itemId, ownerId: base.ownerId, expectedGeneration: 1, videoId, mediaMime: "video/mp4" as const, mediaBytes: 9, duration: 5, caption: null, publishedAt: null, ...over });
    const v1 = await upload();
    expect(await s.t.mutation(internal.reels.attachSupplied, args(v1, { expectedGeneration: 7 }))).toEqual({ attached: false, reason: "stale" });
    expect(await s.t.mutation(internal.reels.attachSupplied, args(v1, { ownerId: s.b }))).toEqual({ attached: false, reason: "not_found" });
    expect(await s.item()).toEqual(base);
    vi.setSystemTime(base.expiresAt + 1);
    expect(await s.t.mutation(internal.reels.attachSupplied, args(v1))).toEqual({ attached: false, reason: "not_found" });
    vi.setSystemTime(T0);
    await s.alice.mutation(api.reels.remove, { itemId: s.itemId });
    expect(await s.t.mutation(internal.reels.attachSupplied, args(v1))).toEqual({ attached: false, reason: "not_found" });
  });
  it("the second of two racing uploads from the same generation is stale-rejected by the atomic recheck", async () => {
    const s = await setup();
    const base = (await s.item())!;
    const u1 = await s.t.run(ctx => ctx.storage.store(new Blob(["one"])));
    const u2 = await s.t.run(ctx => ctx.storage.store(new Blob(["two"])));
    const mk = (videoId: Id<"_storage">) => ({ itemId: s.itemId, ownerId: base.ownerId, expectedGeneration: 1, videoId, mediaMime: "video/mp4" as const, mediaBytes: 3, duration: 5, caption: null, publishedAt: null });
    const results = await Promise.all([s.t.mutation(internal.reels.attachSupplied, mk(u1)), s.t.mutation(internal.reels.attachSupplied, mk(u2))]);
    expect(results.filter(r => r.attached)).toHaveLength(1);
    expect(results.filter(r => !r.attached)).toEqual([{ attached: false, reason: "stale" }]);
    const winner = (await s.item())!;
    expect(winner.generation).toBe(2);
  });
  it("replacement supersedes the old recording, deletes it and fences late work", async () => {
    const s = await setup();
    await s.post(s.alice as never, mp4(4096));
    const first = (await s.item())!;
    const r = await s.post(s.alice as never, mp4(5000), { extra: "&caption=Second" });
    expect(await r.json()).toEqual({ status: "attached", generation: 3 });
    const second = (await s.item())!;
    expect(second.videoId).not.toBe(first.videoId);
    expect(await s.exists(first.videoId!)).toBe(false);
    expect(await s.stored()).toHaveLength(1);
    // late work from the superseded generation changes nothing
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 2, code: "LATE", message: "late" });
    await s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 2, extractionJson: JSON.stringify({ isDeal: false, drafts: [], evidence: [], transcript: "", warnings: [] }) });
    expect(await s.item()).toEqual(second);
  });
  it("deletion removes the recording and a late result cannot resurrect or reattach anything", async () => {
    const s = await setup();
    await s.post(s.alice as never, mp4());
    await s.alice.mutation(api.reels.remove, { itemId: s.itemId });
    expect(await s.stored()).toHaveLength(0);
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 2, code: "X", message: "m" });
    expect(await s.item()).toBeNull();
  });
});

describe("workflow source selection and retention", () => {
  it("link-only never starts a workflow or a resolver", async () => {
    const s = await setup();
    const net = vi.spyOn(globalThis, "fetch");
    await s.settle();
    expect(await s.item()).toMatchObject({ status: "queued" });
    expect((await s.item())!.workflowId).toBeUndefined();
    expect(net).not.toHaveBeenCalled();
  });
  it("with the media gate off it fails closed, calls no resolver or model, and keeps the recording for retries", async () => {
    const s = await setup();
    vi.stubEnv("SCRAPECREATORS_API_KEY", "synthetic-resolver-key");
    vi.stubEnv("REEL_PROVIDER_USAGE_AUTHORIZED", "true"); // legacy gate on must not matter for supplied media
    const net = vi.spyOn(globalThis, "fetch");
    await s.post(s.alice as never, mp4());
    await s.settle();
    const item = (await s.item())!;
    expect(item).toMatchObject({ status: "failed", error: { code: "CONFIGURATION" }, sourceKind: "supplied" });
    expect(item.error!.message).toContain("Video analysis is disabled");
    expect(item.videoId).toBeDefined();
    expect(await s.exists(item.videoId!)).toBe(true);
    expect(net).not.toHaveBeenCalled();
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });
  it("the resolver gate being the only one enabled does not enable supplied-media analysis", async () => {
    const s = await setup();
    for (const [k, v] of Object.entries({ REEL_PROVIDER_USAGE_AUTHORIZED: "true", SCRAPECREATORS_API_KEY: "k", GEMINI_API_KEY: "k", GEMINI_REEL_MODEL: "m" })) vi.stubEnv(k, v);
    await s.post(s.alice as never, mp4()); await s.settle();
    expect(await s.item()).toMatchObject({ status: "failed", error: { code: "CONFIGURATION" } });
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });
  it("sends the actual video, mime type and all context to the existing extractor (labeled mock transport) with no retrieval", async () => {
    const s = await setup();
    for (const [k, v] of Object.entries({ REEL_MEDIA_USAGE_AUTHORIZED: "true", GEMINI_API_KEY: "test", GEMINI_REEL_MODEL: "test-model" })) vi.stubEnv(k, v);
    const draft = { restaurant: null, address: null, dealText: "Lunch special", price: null, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null };
    sdk.generateContent.mockResolvedValueOnce({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify({ isDeal: true, drafts: [draft],
      evidence: [{ draftIndex: 0, field: "dealText", channel: "caption", quote: "Lunch special", timestampSeconds: null }], transcript: "", warnings: [] }) });
    const net = vi.spyOn(globalThis, "fetch");
    const bytes = qt(6000);
    await s.post(s.alice as never, bytes, { type: "video/quicktime", duration: "20", extra: "&publishedAt=2026-10-01&caption=Lunch%20special%20today" });
    await s.settle();
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
    const call = sdk.generateContent.mock.calls[0][0];
    expect(call.model).toBe("test-model");
    const [videoPart, textPart] = call.contents[0].parts;
    expect(videoPart.inlineData.mimeType).toBe("video/mov");
    expect(videoPart.inlineData.data).toBe(btoa(String.fromCharCode(...bytes)));
    const context = JSON.parse(textPart.text);
    expect(context).toMatchObject({ caption: "Lunch special today", publishedAt: "2026-10-01", timezone: "America/Vancouver", sourceUrl: link, durationSecondsBrowserSupplied: 20 });
    expect(context.sourceUrlNote).toContain("never fetch");
    expect(net).not.toHaveBeenCalled(); // no Instagram or resolver request
    const done = (await s.item())!;
    expect(done).toMatchObject({ status: "ready" });
    expect(done.videoId).toBeUndefined(); // deleted after success
    expect(await s.stored()).toHaveLength(0);
  });
  it("deleting, replacing and retrying still work after the workflow has already finished (regression: cancel of a finished workflow threw)", async () => {
    const s = await setup();
    await s.post(s.alice as never, mp4()); await s.settle();
    expect(await s.item()).toMatchObject({ status: "failed" }); // workflow completed
    await s.alice.mutation(api.reels.retry, { itemId: s.itemId });
    await s.settle();
    expect(await s.post(s.alice as never, mp4(5000))).toMatchObject({ status: 200 });
    await s.settle();
    await s.alice.mutation(api.reels.remove, { itemId: s.itemId });
    expect(await s.item()).toBeNull();
    expect(await s.stored()).toHaveLength(0);
  });
  it("a no-deal success deletes the recording too", async () => {
    const s = await setup();
    for (const [k, v] of Object.entries({ REEL_MEDIA_USAGE_AUTHORIZED: "true", GEMINI_API_KEY: "test", GEMINI_REEL_MODEL: "m" })) vi.stubEnv(k, v);
    sdk.generateContent.mockResolvedValueOnce({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify({ isDeal: false, drafts: [], evidence: [], transcript: "", warnings: [] }) });
    await s.post(s.alice as never, mp4()); await s.settle();
    expect(await s.item()).toMatchObject({ status: "no_deal" });
    expect(await s.stored()).toHaveLength(0);
  });
  it("retry keeps the supplied recording and the user's manual draft, then the new extraction cannot overwrite the edits", async () => {
    const s = await setup();
    const own = (await s.item())!.ownerId;
    const d = (over: object = {}) => ({ restaurant: "Cafe", address: null, dealText: "Meal", price: null, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null, ...over });
    // a draft exists and the user edits it
    await s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 1, extractionJson: JSON.stringify({ isDeal: true, drafts: [d()], evidence: [], transcript: "", warnings: [] }) });
    await s.alice.mutation(api.reels.saveDraft, { itemId: s.itemId, draftJson: JSON.stringify([d({ restaurant: "Mine" })]), expectedGeneration: 1, expectedRevision: 1 });
    // user attaches a recording: generation advances, edits remain
    await s.post(s.alice as never, mp4(), { extra: "&caption=Cafe%20Meal" });
    await s.settle(); // disabled gate -> failed, recording kept
    const failed = (await s.item())!;
    expect(failed).toMatchObject({ status: "failed", generation: 2, draftEdited: true, draftRevision: 2 });
    expect(JSON.parse(failed.draftJson!)[0].restaurant).toBe("Mine");
    expect(failed.videoId).toBeDefined();
    // retry keeps the recording and the draft
    await s.alice.mutation(api.reels.retry, { itemId: s.itemId });
    const retried = (await s.item())!;
    expect(retried).toMatchObject({ generation: 3, status: "queued", videoId: failed.videoId, draftJson: failed.draftJson, draftRevision: 2, draftEdited: true });
    expect(await s.exists(failed.videoId!)).toBe(true);
    // enable the model: extraction succeeds, edited draft is kept, suggestion stored separately
    for (const [k, v] of Object.entries({ REEL_MEDIA_USAGE_AUTHORIZED: "true", GEMINI_API_KEY: "t", GEMINI_REEL_MODEL: "m" })) vi.stubEnv(k, v);
    sdk.generateContent.mockResolvedValueOnce({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify({ isDeal: true, drafts: [d({ restaurant: null, dealText: "Cafe Meal" }), d({ dealText: "Cafe Meal" })],
      evidence: [{ draftIndex: 0, field: "dealText", channel: "caption", quote: "Cafe Meal", timestampSeconds: null }, { draftIndex: 1, field: "restaurant", channel: "caption", quote: "Cafe", timestampSeconds: null }, { draftIndex: 1, field: "dealText", channel: "caption", quote: "Cafe Meal", timestampSeconds: null }], transcript: "", warnings: [] }) });
    await s.settle();
    const done = (await s.item())!;
    expect(done).toMatchObject({ status: "ready", draftEdited: true, draftRevision: 2 });
    expect(JSON.parse(done.draftJson!)).toEqual([d({ restaurant: "Mine" })]);
    expect(JSON.parse(done.extractionJson!).drafts).toHaveLength(2);
    expect(own).toBeDefined();
  });
});
