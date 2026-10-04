/// <reference types="vite/client" />
// Synthetic in-memory auth/query tests; no real account or deployment.
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import type { Doc } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.ts");
const mine = makeFunctionReference<"query", { limit: number }, (Doc<"deals"> & { imageUrl: string | null })[]>("deals:listMine");
const fields = { restaurant: "Fixture", dealText: "Offer", validDays: [], conditions: [], lat: 49.25, lng: -122.95, stillOnCount: 0, expiredCount: 0 };
afterEach(() => vi.useRealTimers());
async function setup() {
  const t = convexTest(schema, modules);
  const authorId = await t.run(ctx => ctx.db.insert("users", { email: "author@example.invalid" }));
  const otherId = await t.run(ctx => ctx.db.insert("users", { email: "other@example.invalid" }));
  return { t, authorId, otherId, author: t.withIdentity({ subject: `${authorId}|session` }), other: t.withIdentity({ subject: `${otherId}|session` }) };
}
describe("deals.listMine", () => {
  it("rejects anonymous callers and returns empty for a signer with no deals/profile", async () => {
    const s = await setup();
    await expect(s.t.query(mine, { limit: 50 })).rejects.toThrow("Not signed in");
    expect(await s.author.query(mine, { limit: 50 })).toEqual([]);
  });
  it("isolates signers, orders newest first, limits and preserves canonical published fields", async () => {
    const s = await setup(); vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    const first = await s.t.run(ctx => ctx.db.insert("deals", { ...fields, authorId: s.authorId }));
    vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
    const second = await s.t.run(ctx => ctx.db.insert("deals", { ...fields, authorId: s.authorId, sourceUrl: "https://www.instagram.com/reel/FIXTURE/", expiresOn: "2026-10-04" }));
    vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
    const other = await s.t.run(ctx => ctx.db.insert("deals", { ...fields, authorId: s.otherId }));
    const newest = await s.t.run(ctx => ctx.db.insert("deals", { ...fields, authorId: s.authorId, sourceUrl: "https://www.instagram.com/p/FIXTURE/" }));
    expect((await s.author.query(mine, { limit: 2 })).map(d => d._id)).toEqual([newest, second]);
    expect((await s.author.query(mine, { limit: 50 })).map(d => d._id)).toEqual([newest, second, first]);
    expect((await s.other.query(mine, { limit: 50 })).map(d => d._id)).toEqual([other]);
    expect((await s.author.query(mine, { limit: 2 }))[1]).toEqual({ ...await s.t.run(ctx => ctx.db.get(second)), imageUrl: null });
  });
  it("enriches only imageUrl and excludes private reel drafts/auth/profile data", async () => {
    const s = await setup();
    const imageId = await s.t.run(ctx => ctx.storage.store(new Blob(["fixture"])));
    const dealId = await s.t.run(async ctx => {
      await ctx.db.insert("profiles", { userId: s.authorId, displayName: "Fixture", walletAddress: "private-wallet" });
      await ctx.db.insert("reelItems", { ownerId: s.authorId, sourceUrl: "https://www.instagram.com/reel/PRIVATE/", status: "ready", generation: 1, attempts: 0, updatedAt: 0, expiresAt: 1, draftJson: "private draft" });
      return ctx.db.insert("deals", { ...fields, authorId: s.authorId, imageId });
    });
    const rows = await s.author.query(mine, { limit: 50 });
    expect(rows).toEqual([{ ...await s.t.run(ctx => ctx.db.get(dealId)), imageUrl: await s.t.run(ctx => ctx.storage.getUrl(imageId)) }]);
    expect(JSON.stringify(rows)).not.toMatch(/private draft|private-wallet|author@example/);
    await s.t.run(ctx => ctx.storage.delete(imageId));
    expect((await s.author.query(mine, { limit: 50 }))[0].imageUrl).toBeNull();
  });
  it.each([0, -1, 51, 1.5, NaN, Infinity])("rejects invalid limit %s", async limit => {
    const s = await setup(); await expect(s.author.query(mine, { limit })).rejects.toThrow();
  });
  it("accepts 1 and 50 but rejects caller authorId and wrong argument shapes", async () => {
    const s = await setup();
    for (const limit of [1, 50]) expect(await s.author.query(mine, { limit })).toEqual([]);
    for (const args of [{}, { limit: "2" }, { limit: 2, authorId: s.otherId }]) await expect(s.author.query(mine, args as never)).rejects.toThrow();
  });
});
