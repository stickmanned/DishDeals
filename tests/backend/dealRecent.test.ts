// In-memory synthetic data exercises the real Convex query; no live feed claim.
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");
const fields = {
  restaurant: "Synthetic restaurant", dealText: "Synthetic offer",
  validDays: [], conditions: [], lat: 49.25, lng: -122.95,
  stillOnCount: 0, expiredCount: 0,
};
async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {
    email: "private@example.invalid", phone: "+10000000000",
  }));
  return { t, userId, insert: (extra = {}) => t.run((ctx) =>
    ctx.db.insert("deals", { ...fields, authorId: userId, ...extra })) };
}
afterEach(() => vi.useRealTimers());

describe("deals.listRecent published fallback", () => {
  it("returns an empty array signed out when no published deals exist", async () => {
    const { t } = await setup();
    expect(await t.query(api.deals.listRecent, { limit: 50 })).toEqual([]);
  });
  it("limits results in descending creation order and retains all canonical fields", async () => {
    const s = await setup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    const first = await s.insert();
    vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
    const second = await s.insert({ address: "Synthetic address", priceCad: 9, sourceUrl: "https://example.invalid/source" });
    vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
    const third = await s.insert();
    const got = await s.t.query(api.deals.listRecent, { limit: 2 });
    expect(got.map((d) => d._id)).toEqual([third, second]);
    expect(got.every((d) => d._id !== first)).toBe(true);
    const stored = await s.t.run((ctx) => ctx.db.get(second));
    expect(stored).not.toBeNull();
    expect(got[1]).toMatchObject(stored!);
    expect(got[1].imageUrl).toBeNull();
  });
  it("returns author display name and storage URL without private auth or wallet data", async () => {
    const s = await setup();
    const imageId = await s.t.run((ctx) => ctx.storage.store(new Blob(["synthetic"], { type: "image/png" })));
    await s.t.run((ctx) => ctx.db.insert("profiles", { userId: s.userId, displayName: "Fixture author", walletAddress: "private-list-wallet" }));
    await s.insert({ imageId });
    const [deal] = await s.t.query(api.deals.listRecent, { limit: 1 });
    expect(deal.authorName).toBe("Fixture author");
    expect(deal.imageUrl).toBe(await s.t.run((ctx) => ctx.storage.getUrl(imageId)));
    for (const key of ["email", "phone", "walletAddress", "authorWallet", "distanceKm", "viewerVote", "status"]) {
      expect(key in deal).toBe(false);
    }
  });
  it("omits missing profile data rather than inventing an author name", async () => {
    const s = await setup(); await s.insert();
    const [deal] = await s.t.query(api.deals.listRecent, { limit: 1 });
    expect("authorName" in deal).toBe(false);
  });
  it("fails on duplicate author profiles rather than selecting an arbitrary identity", async () => {
    const s = await setup(); await s.insert();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("profiles", { userId: s.userId, displayName: "One" });
      await ctx.db.insert("profiles", { userId: s.userId, displayName: "Two" });
    });
    await expect(s.t.query(api.deals.listRecent, { limit: 1 })).rejects.toThrow();
  });
  it("excludes private reel drafts even when they have content and coordinates in text", async () => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.insert("reelItems", {
      ownerId: s.userId, sourceUrl: "https://www.instagram.com/reel/SYNTHETIC/",
      status: "ready", generation: 1, attempts: 1, updatedAt: Date.now(), expiresAt: Date.now() + 60000,
      draftJson: JSON.stringify([{ ...fields, restaurant: "Unpublished private draft" }]),
    }));
    expect(await s.t.query(api.deals.listRecent, { limit: 50 })).toEqual([]);
  });
  it("does not write data and remains the same for an authenticated viewer", async () => {
    const s = await setup(); const dealId = await s.insert();
    const before = await s.t.run((ctx) => ctx.db.get(dealId));
    const anonymous = await s.t.query(api.deals.listRecent, { limit: 1 });
    const signedIn = await s.t.withIdentity({ subject: `${s.userId}|session` }).query(api.deals.listRecent, { limit: 1 });
    expect(signedIn).toEqual(anonymous);
    expect(await s.t.run((ctx) => ctx.db.get(dealId))).toEqual(before);
  });
  it.each([0, -1, 51, 1.5, NaN, Infinity])("rejects invalid limit %s", async (limit) => {
    const s = await setup();
    await expect(s.t.query(api.deals.listRecent, { limit })).rejects.toThrow();
  });
  it("rejects unexpected arguments and wrong types", async () => {
    const s = await setup();
    for (const args of [{}, { limit: "2" }, { limit: 1, userId: s.userId }]) {
      await expect(s.t.query(api.deals.listRecent, args as never)).rejects.toThrow();
    }
  });
});
