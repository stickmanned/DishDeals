// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the REAL deals.create/update/remove wrappers with the actual
// @convex-dev/geospatial component registered. Users, profiles, deals, votes and storage
// blobs are SYNTHETIC. Not a deployed backend, live map, native form, publish flow or phone.
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
import { MAX_IMAGE_BYTES, MAX_VOTES_PER_DELETE } from "../../lib/dealWrite";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.restoreAllMocks());

const valid = { restaurant: "Synthetic Cafe", dealText: "Synthetic 2-for-1", validDays: [] as string[], conditions: [] as string[], lat: 49.25, lng: -122.95 };
const full = {
  ...valid, address: "1 Fixture St", priceCad: 9.5, validDays: ["tue", "thu"], validStart: "11:00", validEnd: "14:00",
  expiresOn: "2026-12-31", conditions: ["dine-in only"], sourceUrl: "https://example.invalid/post",
};

async function setup() {
  const t = convexTest(schema, modules);
  geospatial.register(t);
  const mkUser = (email: string) => t.run(ctx => ctx.db.insert("users", { email }));
  const [authorId, otherId, bareId, dupId] = await Promise.all(["author", "other", "bare", "dup"].map(n => mkUser(`${n}@example.invalid`)));
  await t.run(async ctx => {
    await ctx.db.insert("profiles", { userId: authorId, displayName: "Author", walletAddress: "WALLET1" });
    await ctx.db.insert("profiles", { userId: otherId, displayName: "Other" });
    await ctx.db.insert("profiles", { userId: dupId, displayName: "Dup One" });
    await ctx.db.insert("profiles", { userId: dupId, displayName: "Dup Two" });
  });
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session-${id}` });
  const index = new GeospatialIndex<Id<"deals">, Record<string, never>>(components.geospatial);
  const point = (key: Id<"deals">) => t.run(ctx => index.get(ctx, key));
  const counts = () => t.run(async ctx => ({
    deals: (await ctx.db.query("deals").collect()).length, uploads: await ctx.db.query("dealUploads").collect(),
    votes: (await ctx.db.query("votes").collect()).length, stored: (await ctx.db.system.query("_storage").collect()).length,
  }));
  // Synthetic file bytes. convex-test does not record a content type for stored blobs, so only size,
  // existence and ownership can be exercised here (the type check on a recorded content type is not).
  const image = (owner: Id<"users">, o: { bytes?: number; expiresAt?: number; published?: boolean; register?: boolean } = {}) =>
    t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob([new Uint8Array(o.bytes ?? 100).fill(7)], { type: "image/png" }));
      if (o.register !== false) await ctx.db.insert("dealUploads", { ownerId: owner, storageId, expiresAt: o.expiresAt ?? Date.now() + 86_400_000, published: o.published ?? false });
      return storageId;
    });
  const nearAny = () => t.run(ctx => index.nearest(ctx, { point: { latitude: 49.25, longitude: -122.95 }, limit: 5, maxDistance: 50_000 }));
  const exists = (id: Id<"_storage">) => t.run(async ctx => (await ctx.db.system.get("_storage", id)) !== null);
  return { t, authorId, otherId, bareId, dupId, author: as(authorId), other: as(otherId), bare: as(bareId), dup: as(dupId), index, point, nearAny, counts, image, exists };
}
type S = Awaited<ReturnType<typeof setup>>;
const deal = (s: S, id: Id<"deals">) => s.t.run(ctx => ctx.db.get("deals", id));

describe("deals.create: identity and fields", () => {
  it("requires sign-in and exactly one profile", async () => {
    const s = await setup();
    await expect(s.t.mutation(api.deals.create, valid)).rejects.toThrow("Not signed in");
    await expect(s.bare.mutation(api.deals.create, valid)).rejects.toThrow("profile");
    await expect(s.dup.mutation(api.deals.create, valid)).rejects.toThrow(); // duplicate profiles fail, never pick one
    expect((await s.counts()).deals).toBe(0);
  });
  it("derives author and counts on the server and stores every canonical field", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    expect(await deal(s, id)).toMatchObject({ ...full, authorId: s.authorId, stillOnCount: 0, expiredCount: 0 });
  });
  it("omits optional fields entirely (no null, no guesses) and trims text", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, { ...valid, restaurant: "  Spaced  ", dealText: " Offer ", address: "   " });
    const stored = (await deal(s, id))!;
    expect(stored.restaurant).toBe("Spaced");
    expect(stored.dealText).toBe("Offer");
    for (const key of ["address", "priceCad", "validStart", "validEnd", "expiresOn", "imageId", "sourceUrl"]) expect(key in stored).toBe(false);
  });
  it("refuses client-controlled author/count fields and nulls for optionals", async () => {
    const s = await setup();
    for (const extra of [{ authorId: s.otherId }, { stillOnCount: 5 }, { expiredCount: 1 }, { confidence: { restaurant: 1 } }, { priceCad: null }, { address: null }]) {
      await expect(s.author.mutation(api.deals.create, { ...valid, ...extra } as never)).rejects.toThrow();
    }
    expect((await s.counts()).deals).toBe(0);
  });
  const bad: [string, object][] = [
    ["blank restaurant", { restaurant: "   " }], ["long restaurant", { restaurant: "x".repeat(201) }], ["blank dealText", { dealText: "" }], ["long dealText", { dealText: "x".repeat(2001) }],
    ["long address", { address: "x".repeat(501) }], ["negative price", { priceCad: -1 }], ["NaN price", { priceCad: NaN }], ["Infinity price", { priceCad: Infinity }], ["huge price", { priceCad: 100001 }],
    ["duplicate days", { validDays: ["mon", "mon"] }], ["unknown day", { validDays: ["monday"] }], ["8 days", { validDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "mon"] }],
    ["start without end", { validStart: "09:00" }], ["end without start", { validEnd: "17:00" }], ["24:00", { validStart: "09:00", validEnd: "24:00" }],
    ["unpadded time", { validStart: "9:00", validEnd: "17:00" }], ["12h time", { validStart: "9:00 AM", validEnd: "5:00 PM" }],
    ["fake date", { expiresOn: "2026-02-30" }], ["non-ISO date", { expiresOn: "10/03/2026" }], ["21 conditions", { conditions: Array.from({ length: 21 }, () => "x") }],
    ["blank condition", { conditions: ["ok", "  "] }], ["long condition", { conditions: ["x".repeat(301)] }],
    ["javascript url", { sourceUrl: "javascript:alert(1)" }], ["ftp url", { sourceUrl: "ftp://example.invalid/x" }], ["credentials url", { sourceUrl: "https://user:pw@example.invalid/x" }],
    ["spaced url", { sourceUrl: "https://example.invalid/a b" }], ["long url", { sourceUrl: `https://example.invalid/${"a".repeat(2100)}` }],
    ["lat above map limit", { lat: 85.06 }], ["lat NaN", { lat: NaN }], ["lng above 180", { lng: 180.01 }], ["lng Infinity", { lng: Infinity }],
  ];
  it.each(bad)("rejects %s without writing or indexing", async (_n, over) => {
    const s = await setup();
    await expect(s.author.mutation(api.deals.create, { ...valid, ...over } as never)).rejects.toThrow();
    expect((await s.counts()).deals).toBe(0);
    expect(await s.nearAny()).toHaveLength(0);
  });
  it("accepts the exact map limits and 00:00 to 23:59", async () => {
    const s = await setup();
    await s.author.mutation(api.deals.create, { ...valid, lat: 85.05112878, lng: -180, validStart: "00:00", validEnd: "23:59" });
    await s.author.mutation(api.deals.create, { ...valid, lat: -85.05112878, lng: 180 });
    expect((await s.counts()).deals).toBe(2);
  });
});
describe("geospatial index (actual component)", () => {
  it("inserts one point at the canonical coordinates with the deal id key and creation-time sort key", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    const stored = (await deal(s, id))!;
    expect(await s.point(id)).toEqual({ key: id, coordinates: { latitude: 49.25, longitude: -122.95 }, filterKeys: {}, sortKey: stored._creationTime });
  });
  it("rolls the whole publish back when the index write fails", async () => {
    const s = await setup();
    const img = await s.image(s.authorId);
    vi.spyOn(GeospatialIndex.prototype, "insert").mockRejectedValueOnce(new Error("index down"));
    await expect(s.author.mutation(api.deals.create, { ...valid, imageId: img })).rejects.toThrow("index down");
    const c = await s.counts();
    expect(c.deals).toBe(0);
    expect(c.uploads[0].published).toBe(false); // the registry claim rolled back too
  });
  it("update moves the point and keeps the sort key; remove deletes it", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    const before = await s.point(id);
    await s.author.mutation(api.deals.update, { dealId: id, ...full, lat: 49.3, lng: -123.1 });
    expect(await s.point(id)).toEqual({ ...before, coordinates: { latitude: 49.3, longitude: -123.1 } });
    await s.author.mutation(api.deals.remove, { dealId: id });
    expect(await s.point(id)).toBeNull();
  });
  it("update that fails the index write changes nothing", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    const before = await deal(s, id);
    vi.spyOn(GeospatialIndex.prototype, "insert").mockRejectedValueOnce(new Error("index down"));
    await expect(s.author.mutation(api.deals.update, { dealId: id, ...full, restaurant: "Changed", lat: 49.4 })).rejects.toThrow("index down");
    expect(await deal(s, id)).toEqual(before);
    expect((await s.point(id))!.coordinates.latitude).toBe(49.25);
  });
  it("remove that fails the index delete leaves the deal, votes and point intact", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    await s.t.run(ctx => ctx.db.insert("votes", { dealId: id, userId: s.otherId, value: "still_on" }));
    vi.spyOn(GeospatialIndex.prototype, "remove").mockRejectedValueOnce(new Error("index down"));
    await expect(s.author.mutation(api.deals.remove, { dealId: id })).rejects.toThrow("index down");
    expect(await deal(s, id)).not.toBeNull();
    expect((await s.counts()).votes).toBe(1);
    expect(await s.point(id)).not.toBeNull();
  });
});

describe("deals.update: author-only full replacement", () => {
  it("rejects signed-out, no-profile, non-author and missing deals without change", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    const before = await deal(s, id);
    await expect(s.t.mutation(api.deals.update, { dealId: id, ...full })).rejects.toThrow("Not signed in");
    await expect(s.bare.mutation(api.deals.update, { dealId: id, ...full })).rejects.toThrow("profile");
    await expect(s.other.mutation(api.deals.update, { dealId: id, ...full, restaurant: "Hijack" })).rejects.toThrow("Only the author");
    await s.t.run(ctx => ctx.db.delete("deals", id));
    await expect(s.author.mutation(api.deals.update, { dealId: id, ...full })).rejects.toThrow("not found");
    expect(before).not.toBeNull();
  });
  it("replaces fields, clears omitted optionals, and preserves author, counts, votes and system fields", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    await s.t.run(async ctx => { await ctx.db.patch(id, { stillOnCount: 3, expiredCount: 1 }); await ctx.db.insert("votes", { dealId: id, userId: s.otherId, value: "still_on" }); });
    const before = (await deal(s, id))!;
    await s.author.mutation(api.deals.update, { dealId: id, ...valid, restaurant: "Renamed" });
    const after = (await deal(s, id))!;
    expect(after).toMatchObject({ restaurant: "Renamed", dealText: valid.dealText, validDays: [], conditions: [], authorId: s.authorId, stillOnCount: 3, expiredCount: 1, _id: id, _creationTime: before._creationTime });
    for (const key of ["address", "priceCad", "validStart", "validEnd", "expiresOn", "sourceUrl", "imageId"]) expect(key in after).toBe(false);
    expect((await s.counts()).votes).toBe(1);
  });
  it("applies the same strict validation as create, atomically", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    const before = await deal(s, id);
    for (const over of [{ restaurant: " " }, { priceCad: -1 }, { validEnd: undefined }, { lat: 90 }, { sourceUrl: "ftp://x.invalid" }, { authorId: s.otherId }]) {
      await expect(s.author.mutation(api.deals.update, { dealId: id, ...full, ...over } as never)).rejects.toThrow();
    }
    expect(await deal(s, id)).toEqual(before);
    expect((await s.point(id))!.coordinates).toEqual({ latitude: 49.25, longitude: -122.95 });
  });
});

describe("deals.remove", () => {
  it("is author-only and signed-in-only", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    await expect(s.t.mutation(api.deals.remove, { dealId: id })).rejects.toThrow("Not signed in");
    await expect(s.other.mutation(api.deals.remove, { dealId: id })).rejects.toThrow("Only the author");
    expect(await deal(s, id)).not.toBeNull();
    expect(await s.point(id)).not.toBeNull();
  });
  it("deletes the deal, its index point and only its own votes", async () => {
    const s = await setup();
    const a = await s.author.mutation(api.deals.create, full);
    const b = await s.author.mutation(api.deals.create, { ...full, restaurant: "Other deal" });
    await s.t.run(async ctx => {
      await ctx.db.insert("votes", { dealId: a, userId: s.otherId, value: "still_on" });
      await ctx.db.insert("votes", { dealId: a, userId: s.authorId, value: "expired" });
      await ctx.db.insert("votes", { dealId: b, userId: s.otherId, value: "still_on" });
    });
    await s.author.mutation(api.deals.remove, { dealId: a });
    expect(await deal(s, a)).toBeNull();
    expect(await s.point(a)).toBeNull();
    expect(await s.point(b)).not.toBeNull();
    expect((await s.counts()).votes).toBe(1);
  });
  it("refuses, changing nothing, when there are more votes than one transaction can truthfully delete", async () => {
    const s = await setup();
    const id = await s.author.mutation(api.deals.create, full);
    await s.t.run(async ctx => { for (let i = 0; i < MAX_VOTES_PER_DELETE + 1; i++) await ctx.db.insert("votes", { dealId: id, userId: s.otherId, value: "still_on" }); });
    await expect(s.author.mutation(api.deals.remove, { dealId: id })).rejects.toThrow("too many votes");
    expect(await deal(s, id)).not.toBeNull();
    expect(await s.point(id)).not.toBeNull();
    expect((await s.counts()).votes).toBe(MAX_VOTES_PER_DELETE + 1);
  });
});

describe("private image registry", () => {
  it("attaches an owned, unexpired image and marks the registry row published atomically", async () => {
    const s = await setup(); const img = await s.image(s.authorId);
    const id = await s.author.mutation(api.deals.create, { ...valid, imageId: img });
    expect((await deal(s, id))!.imageId).toBe(img);
    expect((await s.counts()).uploads[0].published).toBe(true);
  });
  it("rejects arbitrary, other users', duplicate-row, expired, oversize, empty and deleted storage ids", async () => {
    const s = await setup();
    const cases: [string, Id<"_storage">][] = [
      ["unregistered storage id", await s.image(s.authorId, { register: false })],
      ["another user's upload", await s.image(s.otherId)],
      ["expired unpublished upload", await s.image(s.authorId, { expiresAt: Date.now() - 1 })],
      ["oversize image", await s.image(s.authorId, { bytes: MAX_IMAGE_BYTES + 1 })],
      ["empty file", await s.image(s.authorId, { bytes: 0 })],
    ];
    const dup = await s.image(s.authorId);
    await s.t.run(ctx => ctx.db.insert("dealUploads", { ownerId: s.authorId, storageId: dup, expiresAt: Date.now() + 1e6, published: false }));
    cases.push(["duplicate registry rows", dup]);
    const gone = await s.image(s.authorId);
    await s.t.run(ctx => ctx.storage.delete(gone));
    cases.push(["deleted storage", gone]);
    for (const [name, imageId] of cases) {
      await expect(s.author.mutation(api.deals.create, { ...valid, imageId }), name).rejects.toThrow();
    }
    expect((await s.counts()).deals).toBe(0);
    expect((await s.counts()).uploads.every(u => !u.published)).toBe(true);
  });
  it("accepts a 5 MiB image and a published image after its upload expired, for the same owner", async () => {
    const s = await setup();
    const big = await s.image(s.authorId, { bytes: MAX_IMAGE_BYTES });
    const first = await s.author.mutation(api.deals.create, { ...valid, imageId: big });
    await s.t.run(async ctx => { for (const u of await ctx.db.query("dealUploads").collect()) await ctx.db.patch(u._id, { expiresAt: Date.now() - 1 }); });
    const second = await s.author.mutation(api.deals.create, { ...valid, restaurant: "Second offer", imageId: big });
    expect((await deal(s, first))!.imageId).toBe(big);
    expect((await deal(s, second))!.imageId).toBe(big);
  });
  it("another user cannot reuse a published image", async () => {
    const s = await setup(); const img = await s.image(s.authorId);
    await s.author.mutation(api.deals.create, { ...valid, imageId: img });
    await expect(s.other.mutation(api.deals.create, { ...valid, imageId: img })).rejects.toThrow("not available");
  });
  it("the public API has no way to register an upload", async () => {
    const exported = Object.keys(await import("../../convex/deals")).sort();
    expect(exported).toEqual(["create", "generateUploadUrl", "get", "listMine", "listNearby", "listRecent", "remove", "removeExpired", "sweepExpired", "update"]); // generateUploadUrl only returns the authenticated /deal-image URL; cleanup is internal-only
  });
  it("update to a new owned image releases the old one only when no other deal uses it", async () => {
    const s = await setup();
    const a = await s.image(s.authorId), b = await s.image(s.authorId);
    const d1 = await s.author.mutation(api.deals.create, { ...valid, imageId: a });
    const d2 = await s.author.mutation(api.deals.create, { ...valid, restaurant: "Shares image", imageId: a });
    await s.author.mutation(api.deals.update, { dealId: d1, ...valid, imageId: b });
    expect(await s.exists(a)).toBe(true); // d2 still references it
    await s.author.mutation(api.deals.update, { dealId: d2, ...valid }); // clears the image
    expect(await s.exists(a)).toBe(false);
    expect((await s.counts()).uploads.map(u => u.storageId)).toEqual([b]);
    expect(await s.exists(b)).toBe(true);
  });
  it("deleting a deal keeps a shared image and removes an unshared one", async () => {
    const s = await setup(); const img = await s.image(s.authorId);
    const d1 = await s.author.mutation(api.deals.create, { ...valid, imageId: img });
    const d2 = await s.author.mutation(api.deals.create, { ...valid, restaurant: "Second", imageId: img });
    await s.author.mutation(api.deals.remove, { dealId: d1 });
    expect(await s.exists(img)).toBe(true);
    expect((await s.counts()).uploads).toHaveLength(1);
    await s.author.mutation(api.deals.remove, { dealId: d2 });
    expect(await s.exists(img)).toBe(false);
    expect((await s.counts()).uploads).toHaveLength(0);
  });
  it("rejects an update to someone else's image without touching the deal", async () => {
    const s = await setup(); const mine = await s.image(s.authorId), theirs = await s.image(s.otherId);
    const id = await s.author.mutation(api.deals.create, { ...valid, imageId: mine });
    await expect(s.author.mutation(api.deals.update, { dealId: id, ...valid, imageId: theirs })).rejects.toThrow("not available");
    expect((await deal(s, id))!.imageId).toBe(mine);
  });
});

describe("private drafts stay out of published data", () => {
  it("creating deals never reads or exposes reel drafts, and reel items are not deals", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.insert("reelItems", { ownerId: s.authorId, sourceUrl: "https://www.instagram.com/reel/AbCdEf123/", status: "ready", generation: 1, attempts: 1, updatedAt: 1, expiresAt: Date.now() + 1e6, draftJson: "[]" }));
    const id = await s.author.mutation(api.deals.create, full);
    expect((await s.counts()).deals).toBe(1);
    expect(JSON.stringify(await deal(s, id))).not.toContain("instagram.com/reel");
  });
});
