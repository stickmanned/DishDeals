// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the REAL deals.listNearby query using the actual
// @convex-dev/geospatial component (meters, ordering, stale keys) and its canonical
// fallback. All data is SYNTHETIC. Not a deployed index, live map, native app or phone.
// The component client refuses to load outside Convex backend code; the test host stands in for it.
import { vi } from "vitest";
vi.hoisted(() => { (globalThis as Record<string, unknown>).Convex = {}; });
import { convexTest } from "convex-test";
import geospatial from "@convex-dev/geospatial/test";
import { GeospatialIndex } from "@convex-dev/geospatial";
import { afterEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, components } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { distanceKm } from "../../lib/distance";
import { NEARBY_FALLBACK_SCAN, NEARBY_LIMIT } from "../../lib/dealWrite";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.restoreAllMocks());

const here = { lat: 49.2827, lng: -123.1207 }; // synthetic viewer
const base = { restaurant: "Synthetic", dealText: "Offer", validDays: [] as string[], conditions: [] as string[] };

async function setup() {
  const t = convexTest(schema, modules);
  geospatial.register(t);
  const authorId = await t.run(ctx => ctx.db.insert("users", { email: "private@example.invalid", phone: "+10000000000", name: "Private Name" }));
  await t.run(ctx => ctx.db.insert("profiles", { userId: authorId, displayName: "Chef", walletAddress: "SECRET-WALLET" }));
  const author = t.withIdentity({ subject: `${authorId}|session` });
  const index = new GeospatialIndex<Id<"deals">, Record<string, never>>(components.geospatial);
  const publish = (name: string, lat: number, lng: number, extra: object = {}) => author.mutation(api.deals.create, { ...base, restaurant: name, lat, lng, ...extra });
  const nearby = (maxKm: number, center = here) => t.query(api.deals.listNearby, { ...center, maxKm });
  const direct = (lat: number, lng: number, extra: object = {}) => t.run(ctx => ctx.db.insert("deals", { ...base, authorId, lat, lng, stillOnCount: 0, expiredCount: 0, ...extra } as never));
  return { t, authorId, author, index, publish, nearby, direct };
}
// offsets in degrees of latitude: 0.01 degree is about 1.11 km
const north = (km: number) => ({ lat: here.lat + km / 111.19, lng: here.lng });

describe("deals.listNearby with the real index", () => {
  it("returns only deals inside the radius (meters = maxKm x 1000), nearest first, with true haversine distances", async () => {
    const s = await setup();
    const near = await s.publish("Near", ...(Object.values(north(0.9)) as [number, number]));
    const edge = await s.publish("Just outside", ...(Object.values(north(1.15)) as [number, number]));
    const mid = await s.publish("Mid", ...(Object.values(north(6)) as [number, number]));
    const far = await s.publish("Far", ...(Object.values(north(30)) as [number, number]));
    const at1 = await s.nearby(1);
    expect(at1.map(d => d._id)).toEqual([near]);
    const at7 = await s.nearby(7);
    expect(at7.map(d => d._id)).toEqual([near, edge, mid]);
    for (const d of at7) expect(d.distanceKm).toBeCloseTo(distanceKm(here, { lat: d.lat, lng: d.lng }), 9);
    expect((await s.nearby(50)).map(d => d._id)).toEqual([near, edge, mid, far]);
    expect((await s.nearby(1.2)).map(d => d._id)).toEqual([near, edge]);
  });
  it("is readable signed out and returns canonical fields plus authorName and imageUrl, with no private or wallet data", async () => {
    const s = await setup();
    const img = await s.t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], { type: "image/png" }));
      await ctx.db.insert("dealUploads", { ownerId: s.authorId, storageId, expiresAt: Date.now() + 1e6, published: false });
      return storageId;
    });
    await s.publish("Pic", here.lat, here.lng, { imageId: img, priceCad: 8 });
    const [d] = await s.nearby(5);
    expect(d).toMatchObject({ restaurant: "Pic", authorName: "Chef", priceCad: 8, stillOnCount: 0, distanceKm: 0 });
    expect(typeof d.imageUrl).toBe("string");
    const json = JSON.stringify(d);
    for (const secret of ["SECRET-WALLET", "private@example.invalid", "+10000000000", "Private Name"]) expect(json).not.toContain(secret);
    for (const key of ["authorWallet", "viewerVote", "status", "minutesLeft"]) expect(key in d).toBe(false);
  });
  it("returns at most 50 of the nearest", async () => {
    const s = await setup();
    for (let i = 0; i < NEARBY_LIMIT + 5; i++) await s.publish(`Deal ${i}`, ...(Object.values(north(0.1 + i * 0.05)) as [number, number]));
    const got = await s.nearby(50);
    expect(got).toHaveLength(NEARBY_LIMIT);
    expect(got.map(d => d.distanceKm)).toEqual([...got.map(d => d.distanceKm)].sort((a, b) => a - b));
    expect(got[0].restaurant).toBe("Deal 0");
    expect(got.map(d => d.restaurant)).not.toContain(`Deal ${NEARBY_LIMIT + 4}`);
  });
  it("skips an index key whose canonical deal no longer exists", async () => {
    const s = await setup();
    const live = await s.publish("Live", here.lat, here.lng);
    const ghost = await s.publish("Ghost", ...(Object.values(north(0.5)) as [number, number]));
    await s.t.run(ctx => ctx.db.delete("deals", ghost)); // stale point left behind
    expect((await s.nearby(5)).map(d => d._id)).toEqual([live]);
  });
  it("does not list a canonical deal that was never indexed (no invented index success)", async () => {
    const s = await setup();
    const indexed = await s.publish("Indexed", here.lat, here.lng);
    await s.direct(here.lat, here.lng, { restaurant: "Unindexed" });
    expect((await s.nearby(5)).map(d => d._id)).toEqual([indexed]);
  });
  it("never lists private reel drafts", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.insert("reelItems", { ownerId: s.authorId, sourceUrl: "https://www.instagram.com/reel/AbCdEf123/", status: "ready", generation: 1, attempts: 1, updatedAt: 1, expiresAt: Date.now() + 1e6, draftJson: JSON.stringify([{ restaurant: "Draft Cafe" }]) }));
    await s.publish("Published", here.lat, here.lng);
    const got = await s.nearby(5);
    expect(got.map(d => d.restaurant)).toEqual(["Published"]);
  });
  it("does not change any data", async () => {
    const s = await setup();
    await s.publish("A", here.lat, here.lng);
    const snap = () => s.t.run(async ctx => ({ d: await ctx.db.query("deals").collect(), u: await ctx.db.query("dealUploads").collect() }));
    const before = await snap();
    await s.nearby(10); await s.nearby(10);
    expect(await snap()).toEqual(before);
  });
});

describe("deals.listNearby arguments", () => {
  it.each([
    ["lat NaN", { lat: NaN, lng: 0, maxKm: 5 }], ["lat 91", { lat: 91, lng: 0, maxKm: 5 }], ["lat beyond map limit", { lat: 85.06, lng: 0, maxKm: 5 }],
    ["lng 181", { lat: 0, lng: 181, maxKm: 5 }], ["lng Infinity", { lat: 0, lng: Infinity, maxKm: 5 }],
    ["maxKm 0", { lat: 0, lng: 0, maxKm: 0 }], ["maxKm negative", { lat: 0, lng: 0, maxKm: -1 }], ["maxKm above 50", { lat: 0, lng: 0, maxKm: 50.01 }],
    ["maxKm NaN", { lat: 0, lng: 0, maxKm: NaN }], ["maxKm Infinity", { lat: 0, lng: 0, maxKm: Infinity }],
  ])("rejects %s", async (_n, args) => {
    const s = await setup();
    await expect(s.t.query(api.deals.listNearby, args)).rejects.toThrow();
  });
  it("accepts maxKm of exactly 50 and rejects extra arguments", async () => {
    const s = await setup();
    expect(await s.nearby(50)).toEqual([]);
    await expect(s.t.query(api.deals.listNearby, { ...here, maxKm: 5, limit: 99 } as never)).rejects.toThrow();
  });
});

describe("deals.listNearby canonical fallback when the component fails", () => {
  const fail = () => vi.spyOn(GeospatialIndex.prototype, "nearest").mockRejectedValue(new Error("component down"));
  it("filters the newest canonical records by true distance, ranks them, and includes unindexed deals", async () => {
    const s = await setup();
    const a = await s.direct(...(Object.values(north(3)) as [number, number]));
    const b = await s.direct(...(Object.values(north(1)) as [number, number]));
    await s.direct(...(Object.values(north(20)) as [number, number])); // outside 5 km
    fail();
    const got = await s.nearby(5);
    expect(got.map(d => d._id)).toEqual([b, a]);
    for (const d of got) expect(d.distanceKm).toBeCloseTo(distanceKm(here, { lat: d.lat, lng: d.lng }), 9);
  });
  it("breaks distance ties by id and takes 50", async () => {
    const s = await setup();
    const ids: string[] = [];
    for (let i = 0; i < NEARBY_LIMIT + 4; i++) ids.push(await s.direct(here.lat, here.lng));
    fail();
    const got = await s.nearby(5);
    expect(got).toHaveLength(NEARBY_LIMIT);
    expect(got.map(d => d._id)).toEqual([...ids].sort().slice(0, NEARBY_LIMIT));
  });
  it("scans only the 200 newest canonical records", async () => {
    const s = await setup();
    const oldest = await s.direct(here.lat, here.lng, { restaurant: "Oldest" });
    for (let i = 0; i < NEARBY_FALLBACK_SCAN; i++) await s.direct(...(Object.values(north(40)) as [number, number])); // newer, out of range
    fail();
    expect((await s.nearby(5)).map(d => d._id)).not.toContain(oldest);
  });
  it("skips a record with corrupt coordinates instead of throwing or guessing", async () => {
    const s = await setup();
    const good = await s.direct(here.lat, here.lng);
    await s.direct(95, 0);
    fail();
    expect((await s.nearby(5)).map(d => d._id)).toEqual([good]);
  });
  it("enriches fallback results the same way", async () => {
    const s = await setup();
    await s.direct(here.lat, here.lng);
    fail();
    const [d] = await s.nearby(5);
    expect(d).toMatchObject({ authorName: "Chef", imageUrl: null, distanceKm: 0 });
    expect(JSON.stringify(d)).not.toContain("SECRET-WALLET");
  });
});
