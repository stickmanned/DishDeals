// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the REAL POST /deal-image HTTP action, deals.generateUploadUrl, the private
// registry helpers, the cleanup mutation and the cron definition. Images are SYNTHETIC bytes with real
// format signatures; identities are synthetic. Not a deployed backend, real photo, picker or phone, and a
// signature proves file FORMAT only, not that the image decodes.
import { vi } from "vitest";
vi.hoisted(() => { (globalThis as Record<string, unknown>).Convex = {}; });
import { convexTest } from "convex-test";
import geospatial from "@convex-dev/geospatial/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import crons from "../../convex/crons";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CLEANUP_BATCH, MAX_IMAGE_BYTES, PUBLISHED_EXPIRY, READ_DEADLINE_MS, REGISTRY_TTL_MS } from "../../lib/dealImageUpload";

const modules = import.meta.glob("../../convex/**/*.ts");
const ORIGIN = "https://app.example.test";
const SITE = "https://synthetic-deployment.convex.site";
const T0 = new Date("2026-10-04T12:00:00Z").getTime();

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); vi.stubEnv("REEL_WEB_ORIGIN", ORIGIN); vi.stubEnv("CONVEX_SITE_URL", SITE); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const HEADS: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], jpeg: [0xff, 0xd8, 0xff, 0xe0], webp: [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")],
  heic: [0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0, ...Buffer.from("heicmif1")], html: [...Buffer.from("<html><body>x")], mp4: [0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 0, 0],
};
const file = (kind: keyof typeof HEADS, size = 2048) => { const b = new Uint8Array(Math.max(size, HEADS[kind].length)); b.set(HEADS[kind]); b.fill(7, HEADS[kind].length); return b; };
const TYPE: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic", html: "text/html", mp4: "video/mp4" };

async function setup() {
  const t = convexTest(schema, modules);
  geospatial.register(t);
  const [aId, bId] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  await t.run(async ctx => { await ctx.db.insert("profiles", { userId: aId, displayName: "Alice" }); });
  const alice = t.withIdentity({ subject: `${aId}|session` });
  const bob = t.withIdentity({ subject: `${bId}|session` });
  const registry = () => t.run(ctx => ctx.db.query("dealUploads").collect());
  const stored = () => t.run(ctx => ctx.db.system.query("_storage").collect());
  const bytesOf = (id: Id<"_storage">) => t.run(async ctx => { const b = await ctx.storage.get(id); return b ? Array.from(new Uint8Array(await b.arrayBuffer())) : null; });
  type Opts = { type?: string | null; length?: string | null; origin?: string | null; query?: string };
  const post = (caller: { fetch: typeof t.fetch }, body: Uint8Array | ReadableStream<Uint8Array> | null, o: Opts = {}) => {
    const headers: Record<string, string> = {};
    if (o.origin !== null) headers.Origin = o.origin ?? ORIGIN;
    if (o.type !== null) headers["Content-Type"] = o.type ?? "image/png";
    const bytes = body instanceof Uint8Array ? body : null;
    const len = o.length === undefined ? (bytes ? String(bytes.length) : null) : o.length;
    if (len !== null) headers["Content-Length"] = len;
    const init: RequestInit & { duplex?: string } = { method: "POST", headers, body: (body ?? undefined) as BodyInit | undefined };
    if (body && !(body instanceof Uint8Array)) init.duplex = "half";
    return caller.fetch(`/deal-image${o.query ?? ""}`, init);
  };
  return { t, aId, bId, alice, bob, registry, stored, bytesOf, post };
}
type S = Awaited<ReturnType<typeof setup>>;
const untouched = async (s: S) => { expect(await s.registry()).toHaveLength(0); expect(await s.stored()).toHaveLength(0); };
const streamOf = (chunks: Uint8Array[], then: "close" | "stall" | "error") => {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) { c.enqueue(chunks[i++]); return; }
      if (then === "close") c.close(); else if (then === "error") c.error(new Error("aborted")); else return new Promise<void>(() => {});
    },
  });
};

describe("deals.generateUploadUrl", () => {
  it("requires sign-in and returns only the authenticated /deal-image URL", async () => {
    const s = await setup();
    await expect(s.t.mutation(api.deals.generateUploadUrl, {})).rejects.toThrow("Not signed in");
    expect(await s.alice.mutation(api.deals.generateUploadUrl, {})).toBe(`${SITE}/deal-image`);
    vi.stubEnv("CONVEX_SITE_URL", `${SITE}///`);
    expect(await s.alice.mutation(api.deals.generateUploadUrl, {})).toBe(`${SITE}/deal-image`);
  });
  it("fails clearly when the site URL is not configured, and creates no registry row", async () => {
    const s = await setup();
    vi.stubEnv("CONVEX_SITE_URL", "");
    await expect(s.alice.mutation(api.deals.generateUploadUrl, {})).rejects.toThrow("not configured");
    expect(await s.registry()).toHaveLength(0);
  });
});

describe("CORS and configuration", () => {
  it("answers the preflight for the one configured origin only (no wildcard, no credentials flag)", async () => {
    const s = await setup();
    const ok = await s.t.fetch("/deal-image", { method: "OPTIONS", headers: { Origin: ORIGIN } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(ok.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(ok.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
    for (const origin of ["https://evil.example", "http://app.example.test", "null"]) expect((await s.t.fetch("/deal-image", { method: "OPTIONS", headers: { Origin: origin } })).status).toBe(403);
    expect((await s.t.fetch("/deal-image", { method: "OPTIONS" })).status).toBe(403);
  });
  it.each([undefined, "*", "http://app.example.test", "https://app.example.test/path"])("an invalid REEL_WEB_ORIGIN (%s) fails closed", async value => {
    const s = await setup();
    vi.stubEnv("REEL_WEB_ORIGIN", value as string);
    if (value === undefined) delete process.env.REEL_WEB_ORIGIN;
    expect((await s.post(s.alice as never, file("png"))).status).toBe(503);
    await untouched(s);
  });
});

describe("authentication and validation, all before storage", () => {
  it("rejects a wrong or missing Origin, signed-out callers and query parameters", async () => {
    const s = await setup();
    for (const origin of ["https://evil.example", null]) expect((await s.post(s.alice as never, file("png"), { origin })).status).toBe(403);
    const signedOut = await s.post(s.t as never, file("png"));
    expect(signedOut.status).toBe(401);
    expect(signedOut.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect((await s.post(s.alice as never, file("png"), { query: "?storageId=abc" })).status).toBe(400);
    expect((await s.post(s.alice as never, file("png"), { query: "?url=https://example.invalid/x.png" })).status).toBe(400);
    await untouched(s);
  });
  const cases: [string, (s: S) => Promise<Response>, number][] = [
    ["html content type", s => s.post(s.alice as never, file("png"), { type: "text/html" }), 415],
    ["octet-stream content type", s => s.post(s.alice as never, file("png"), { type: "application/octet-stream" }), 415],
    ["missing content type", s => s.post(s.alice as never, file("png"), { type: null }), 415],
    ["declared HEIC", s => s.post(s.alice as never, file("heic"), { type: "image/heic" }), 415],
    ["HEIC bytes declared as JPEG", s => s.post(s.alice as never, file("heic"), { type: "image/jpeg" }), 415],
    ["PNG bytes declared as JPEG", s => s.post(s.alice as never, file("png"), { type: "image/jpeg" }), 415],
    ["JPEG bytes declared as WebP", s => s.post(s.alice as never, file("jpeg"), { type: "image/webp" }), 415],
    ["HTML bytes declared as PNG", s => s.post(s.alice as never, file("html"), { type: "image/png" }), 415],
    ["MP4 bytes declared as PNG", s => s.post(s.alice as never, file("mp4"), { type: "image/png" }), 415],
    ["malformed Content-Length", s => s.post(s.alice as never, file("png"), { length: "12abc" }), 400],
    ["negative Content-Length", s => s.post(s.alice as never, file("png"), { length: "-5" }), 400],
    ["tiny Content-Length", s => s.post(s.alice as never, file("png"), { length: "4" }), 400],
    ["Content-Length over 5 MiB", s => s.post(s.alice as never, file("png"), { length: String(MAX_IMAGE_BYTES + 1) }), 413],
    ["body longer than declared", s => s.post(s.alice as never, file("png", 3000), { length: "2048" }), 413],
    ["body shorter than declared", s => s.post(s.alice as never, file("png", 2000), { length: "2048" }), 400],
    ["no body", s => s.post(s.alice as never, null, { length: null }), 400],
  ];
  it.each(cases)("%s -> %s", async (_n, run, status) => {
    const s = await setup();
    const r = await run(s);
    expect(r.status).toBe(status);
    expect((await r.json()).storageId).toBeUndefined();
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    await untouched(s);
  });
  it("enforces the 5 MiB cap on header-less streams, exactly at the limit and one byte over", async () => {
    const s = await setup();
    expect((await s.post(s.alice as never, file("jpeg", MAX_IMAGE_BYTES), { type: "image/jpeg", length: null })).status).toBe(200);
    const s2 = await setup();
    const over = file("png", MAX_IMAGE_BYTES + 1);
    const r = await s2.post(s2.alice as never, streamOf([over.slice(0, 3_000_000), over.slice(3_000_000)], "close"));
    expect(r.status).toBe(413);
    await untouched(s2);
  });
});

describe("streams: deadline, abort and optional length", () => {
  it("accepts a chunked body with no Content-Length", async () => {
    const s = await setup(); const b = file("webp", 9000);
    const r = await s.post(s.alice as never, streamOf([b.slice(0, 4000), b.slice(4000)], "close"), { type: "image/webp" });
    expect(r.status).toBe(200);
    expect((await s.registry())).toHaveLength(1);
  });
  it("times out a stalled upload with a CORS-bearing 408 and stores nothing", async () => {
    const s = await setup();
    const pending = s.post(s.alice as never, streamOf([file("png", 1000)], "stall"));
    await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS + 1000);
    const r = await pending;
    expect(r.status).toBe(408);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    await untouched(s);
  });
  it("a stream that errors gets a CORS-bearing 400 and nothing is stored", async () => {
    const s = await setup();
    const r = await s.post(s.alice as never, streamOf([file("png", 1000)], "error"));
    expect(r.status).toBe(400);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    await untouched(s);
  });
});

describe("registration", () => {
  it.each(["png", "jpeg", "webp"] as const)("stores a %s and registers it to the caller, unpublished, expiring in 24 hours", async kind => {
    const s = await setup(); const b = file(kind, 4096);
    const r = await s.post(s.alice as never, b, { type: TYPE[kind] });
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    const { storageId } = await r.json();
    expect(await s.bytesOf(storageId)).toEqual(Array.from(b));
    expect(await s.registry()).toEqual([expect.objectContaining({ ownerId: s.aId, storageId, published: false, expiresAt: T0 + REGISTRY_TTL_MS })]);
  });
  it("the owner is the server-derived caller, and the file is usable by the owner only", async () => {
    const s = await setup();
    const { storageId } = await (await s.post(s.alice as never, file("png"))).json();
    const deal = { restaurant: "Cafe", dealText: "Offer", validDays: [], conditions: [], lat: 49.25, lng: -122.95, imageId: storageId };
    await expect(s.bob.mutation(api.deals.create, deal)).rejects.toThrow(); // bob has no profile and is not the owner
    const id = await s.alice.mutation(api.deals.create, deal);
    expect((await s.t.run(ctx => ctx.db.get("deals", id)))!.imageId).toBe(storageId);
    expect(await s.registry()).toEqual([expect.objectContaining({ published: true, expiresAt: PUBLISHED_EXPIRY })]);
  });
  it("two uploads of the same bytes are two independent registry rows", async () => {
    const s = await setup();
    const a = await (await s.post(s.alice as never, file("png"))).json();
    const b = await (await s.post(s.alice as never, file("png"))).json();
    expect(a.storageId).not.toBe(b.storageId);
    expect(await s.registry()).toHaveLength(2);
  });
  it("removes the orphan and answers with CORS when registration fails", async () => {
    const s = await setup();
    // Make only the registry insert fail: with a non-numeric clock the row's `expiresAt` violates the schema.
    // (Narrow, deliberate sabotage of the real internal mutation; the HTTP route itself is unmodified.)
    vi.spyOn(Date, "now").mockReturnValue("0" as unknown as number);
    const r = await s.post(s.alice as never, file("png"));
    vi.restoreAllMocks();
    expect(r.status).toBe(500);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(await r.json()).toEqual({ error: "unexpected" });
    expect(await s.stored()).toHaveLength(0); // the orphan was deleted
    expect(await s.registry()).toHaveLength(0);
  });
  it("makes no outside request and logs nothing", async () => {
    const s = await setup();
    const net = vi.spyOn(globalThis, "fetch");
    const logs = (["log", "error", "warn"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    await s.post(s.alice as never, file("png"));
    expect(net).not.toHaveBeenCalled();
    for (const l of logs) expect(l).not.toHaveBeenCalled();
  });
});

describe("private registry helpers have no public entry point", () => {
  it("the public API exposes no register or claim function", async () => {
    const keys = Object.keys(await import("../../convex/deals")).sort();
    expect(keys).toEqual(["create", "generateUploadUrl", "get", "listNearby", "listRecent", "remove", "update"]);
    const uploads = await import("../../convex/dealUploads");
    // everything registered there is internal: none of it appears under the public `api`
    expect(Object.keys((api as unknown as Record<string, object>).dealUploads ?? {})).toEqual([]);
    expect(Object.keys(uploads)).toContain("register");
  });
  it("register rejects a storage id that is already registered", async () => {
    const s = await setup();
    const { storageId } = await (await s.post(s.alice as never, file("png"))).json();
    await expect(s.t.mutation(internal.dealUploads.register, { ownerId: s.bId, storageId })).rejects.toThrow("already registered");
    expect(await s.registry()).toHaveLength(1);
  });
});

describe("hourly bounded cleanup", () => {
  const seed = async (s: S, o: { owner?: Id<"users">; expiresAt: number; published?: boolean; bytes?: number }) =>
    s.t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob([new Uint8Array(o.bytes ?? 50).fill(7)], { type: "image/png" }));
      await ctx.db.insert("dealUploads", { ownerId: o.owner ?? s.aId, storageId, expiresAt: o.expiresAt, published: o.published ?? false });
      return storageId;
    });
  const exists = (s: S, id: Id<"_storage">) => s.t.run(async ctx => (await ctx.db.system.get("_storage", id)) !== null);
  const rowFor = (s: S, id: Id<"_storage">) => s.t.run(ctx => ctx.db.query("dealUploads").withIndex("by_storage", q => q.eq("storageId", id)).collect());

  it("is registered as a real hourly cron and preserves no other job", () => {
    const names = Object.keys((crons as unknown as { crons: Record<string, unknown> }).crons);
    expect(names).toEqual(["clean expired deal image uploads"]);
    expect(JSON.stringify((crons as unknown as { crons: Record<string, unknown> }).crons[names[0]])).toContain("dealUploads");
  });
  it("deletes expired unpublished unreferenced uploads and their files, and nothing else", async () => {
    const s = await setup();
    const gone = await seed(s, { expiresAt: T0 - 1 });
    const fresh = await seed(s, { expiresAt: T0 + 1000 });
    const published = await seed(s, { expiresAt: T0 - 5, published: true });
    const result = await s.t.mutation(internal.dealUploads.cleanupExpired, {});
    expect(result).toEqual({ examined: 2, deletedFiles: 1, kept: 1 });
    expect(await exists(s, gone)).toBe(false);
    expect(await rowFor(s, gone)).toHaveLength(0);
    expect(await exists(s, fresh)).toBe(true);
    expect(await rowFor(s, fresh)).toHaveLength(1);
    expect(await exists(s, published)).toBe(true);
    expect(await rowFor(s, published)).toEqual([expect.objectContaining({ published: true, expiresAt: PUBLISHED_EXPIRY })]);
  });
  it("never deletes a file a saved deal references, even if its row is unpublished and expired", async () => {
    const s = await setup();
    const id = await seed(s, { expiresAt: T0 - 1 });
    await s.t.run(ctx => ctx.db.insert("deals", { authorId: s.aId, restaurant: "X", dealText: "Y", validDays: [], conditions: [], lat: 49, lng: -123, imageId: id, stillOnCount: 0, expiredCount: 0 }));
    await s.t.mutation(internal.dealUploads.cleanupExpired, {});
    expect(await exists(s, id)).toBe(true);
    expect(await rowFor(s, id)).toEqual([expect.objectContaining({ published: true, expiresAt: PUBLISHED_EXPIRY })]);
  });
  it("keeps a shared file when another registry row for it is published", async () => {
    const s = await setup();
    const id = await seed(s, { expiresAt: T0 - 1 });
    await s.t.run(ctx => ctx.db.insert("dealUploads", { ownerId: s.aId, storageId: id, expiresAt: PUBLISHED_EXPIRY, published: true }));
    await s.t.mutation(internal.dealUploads.cleanupExpired, {});
    expect(await exists(s, id)).toBe(true);
    expect(await rowFor(s, id)).toEqual([expect.objectContaining({ published: true })]);
  });
  it("tolerates a registry row whose file is already gone", async () => {
    const s = await setup();
    const id = await seed(s, { expiresAt: T0 - 1 });
    await s.t.run(ctx => ctx.storage.delete(id));
    expect(await s.t.mutation(internal.dealUploads.cleanupExpired, {})).toEqual({ examined: 1, deletedFiles: 0, kept: 0 });
    expect(await rowFor(s, id)).toHaveLength(0);
  });
  it("examines at most 100 rows per run and continues on its own", async () => {
    const s = await setup();
    for (let i = 0; i < CLEANUP_BATCH + 30; i++) await seed(s, { expiresAt: T0 - 1000 + i, bytes: 20 });
    const first = await s.t.mutation(internal.dealUploads.cleanupExpired, {});
    expect(first.examined).toBe(CLEANUP_BATCH);
    expect(await s.registry()).toHaveLength(30);
    await vi.advanceTimersByTimeAsync(1000);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await s.registry()).toHaveLength(0);
    expect(await s.stored()).toHaveLength(0);
  });
  it("expired published rows cannot starve the batch: they leave the scan so later rows are reached", async () => {
    const s = await setup();
    for (let i = 0; i < CLEANUP_BATCH + 20; i++) await seed(s, { expiresAt: T0 - 100000 + i, published: true, bytes: 20 });
    const doomed = await seed(s, { expiresAt: T0 - 1 });
    let guard = 0;
    while ((await rowFor(s, doomed)).length > 0 && guard++ < 5) await s.t.mutation(internal.dealUploads.cleanupExpired, {});
    expect(await rowFor(s, doomed)).toHaveLength(0);
    expect(await exists(s, doomed)).toBe(false);
    expect((await s.registry()).filter(r => r.published)).toHaveLength(CLEANUP_BATCH + 20);
    expect((await s.stored()).length).toBe(CLEANUP_BATCH + 20); // every published file still exists
  });
});
