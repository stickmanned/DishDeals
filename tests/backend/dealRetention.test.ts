/// <reference types="vite/client" />
// Synthetic in-memory scheduled mutations and actual geospatial component.
import { vi } from "vitest";
vi.hoisted(() => { (globalThis as Record<string, unknown>).Convex = {}; });
import { convexTest } from "convex-test";
import geospatial from "@convex-dev/geospatial/test";
import { GeospatialIndex } from "@convex-dev/geospatial";
import { makeFunctionReference } from "convex/server";
import { afterEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api, components } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_VOTES_PER_DELETE } from "../../lib/dealWrite";

const modules = import.meta.glob("../../convex/**/*.ts");
const sweep = makeFunctionReference<"mutation", { cursor: string | null; sweepStartedAt?: number }, { scanned: number; queued: number; nextCursor: string | null }>("deals:sweepExpired");
const removeExpired = makeFunctionReference<"mutation", { dealId: Id<"deals"> }, boolean>("deals:removeExpired");
const fields = { restaurant: "Fixture", dealText: "Offer", validDays: [] as string[], conditions: [] as string[], lat: 49.25, lng: -122.95 };
const cutoff = Date.parse("2026-10-12T07:00:00.000Z");
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function setup() {
  vi.useFakeTimers(); vi.setSystemTime(cutoff);
  const t = convexTest(schema, modules); geospatial.register(t);
  const authorId = await t.run(ctx => ctx.db.insert("users", {}));
  await t.run(ctx => ctx.db.insert("profiles", { userId: authorId, displayName: "Fixture" }));
  const author = t.withIdentity({ subject: `${authorId}|session` });
  const index = new GeospatialIndex<Id<"deals">, Record<string, never>>(components.geospatial);
  const create = (extra = {}) => author.mutation(api.deals.create, { ...fields, expiresOn: "2026-10-04", ...extra });
  const get = (dealId: Id<"deals">) => t.run(ctx => ctx.db.get(dealId));
  const point = (dealId: Id<"deals">) => t.run(ctx => index.get(ctx, dealId));
  return { t, authorId, author, create, get, point };
}
describe("canonical published deal cleanup", () => {
  it("never deletes before cutoff and deletes exactly at cutoff", async () => {
    const s = await setup(); const id = await s.create();
    vi.setSystemTime(cutoff - 1);
    expect(await s.t.mutation(removeExpired, { dealId: id })).toBe(false);
    expect(await s.get(id)).not.toBeNull();
    vi.setSystemTime(cutoff);
    expect(await s.t.mutation(removeExpired, { dealId: id })).toBe(true);
    expect(await s.get(id)).toBeNull(); expect(await s.point(id)).toBeNull();
  });
  it("stale queued jobs re-read extended/cleared/malformed expiry and skip removed deals", async () => {
    const s = await setup();
    const [extended, cleared, malformed, removed] = await Promise.all([s.create(), s.create(), s.create(), s.create()]);
    vi.setSystemTime(cutoff + 1); // fixture insert times increase by fractional milliseconds
    expect((await s.t.mutation(sweep, { cursor: null })).queued).toBe(4);
    await s.author.mutation(api.deals.update, { dealId: extended, ...fields, expiresOn: "2026-12-31" });
    await s.author.mutation(api.deals.update, { dealId: cleared, ...fields });
    await s.t.run(ctx => ctx.db.patch(malformed, { expiresOn: "2026-02-30" }));
    await s.author.mutation(api.deals.remove, { dealId: removed });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const id of [extended, cleared, malformed]) expect(await s.get(id)).not.toBeNull();
    expect(await s.get(removed)).toBeNull();
  });
  it("uses execution time even if a queued job executes with an earlier clock", async () => {
    const s = await setup(); const id = await s.create();
    vi.setSystemTime(cutoff + 1);
    expect((await s.t.mutation(sweep, { cursor: null })).queued).toBe(1);
    vi.setSystemTime(cutoff - 1000);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await s.get(id)).not.toBeNull();
  });
  it("pages beyond retained rows and schedules one-deal transactions without starvation", async () => {
    const s = await setup();
    await s.t.run(async ctx => { for (let i = 0; i < 60; i++) await ctx.db.insert("deals", { ...fields, authorId: s.authorId, stillOnCount: 0, expiredCount: 0 }); });
    const expired = await s.create();
    vi.setSystemTime(cutoff + 1);
    const first = await s.t.mutation(sweep, { cursor: null });
    expect(first.scanned).toBeLessThanOrEqual(25); expect(first.queued).toBe(0); expect(first.nextCursor).not.toBeNull();
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await s.get(expired)).toBeNull();
    expect(await s.t.run(ctx => ctx.db.query("deals").collect())).toHaveLength(60);
  });
  it("cleans only own votes/index and releases an image only after its final deal reference", async () => {
    const s = await setup();
    const imageId = await s.t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob(["fixture"], { type: "image/png" }));
      await ctx.db.insert("dealUploads", { ownerId: s.authorId, storageId, expiresAt: cutoff + 1000, published: false }); return storageId;
    });
    const a = await s.create({ imageId }); const b = await s.create({ imageId, expiresOn: "2026-12-31" });
    await s.t.run(async ctx => { for (const dealId of [a, b]) await ctx.db.insert("votes", { dealId, userId: s.authorId, value: "still_on" }); });
    await s.t.mutation(removeExpired, { dealId: a });
    expect(await s.point(a)).toBeNull(); expect(await s.point(b)).not.toBeNull();
    expect(await s.t.run(ctx => ctx.storage.getUrl(imageId))).not.toBeNull();
    expect((await s.t.run(ctx => ctx.db.query("votes").collect())).map(v => v.dealId)).toEqual([b]);
    await s.t.run(ctx => ctx.db.patch(b, { expiresOn: "2026-10-04" }));
    await s.t.mutation(removeExpired, { dealId: b });
    expect(await s.t.run(ctx => ctx.storage.getUrl(imageId))).toBeNull();
    expect(await s.t.run(ctx => ctx.db.query("dealUploads").collect())).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.query("votes").collect())).toEqual([]);
  });
  it("continues across deleted pages and excludes publications created after the sweep began", async () => {
    const s = await setup();
    const existing: Id<"deals">[] = [];
    for (let i = 0; i < 55; i++) existing.push(await s.create());
    vi.setSystemTime(cutoff + 100);
    const first = await s.t.mutation(sweep, { cursor: null });
    expect(first.scanned).toBe(25); expect(first.queued).toBe(25); expect(first.nextCursor).not.toBeNull();
    vi.setSystemTime(cutoff + 200);
    const later = await s.create();
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const id of existing) { expect(await s.get(id)).toBeNull(); expect(await s.point(id)).toBeNull(); }
    expect(await s.get(later)).not.toBeNull();
    await s.t.mutation(sweep, { cursor: null });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await s.get(later)).toBeNull();
  });
  it("retains unknown/malformed expiry and never touches private reel retention", async () => {
    const s = await setup();
    const unknown = await s.create({ expiresOn: undefined });
    const malformed = await s.create();
    const privateId = await s.t.run(async ctx => {
      await ctx.db.patch(malformed, { expiresOn: "bad legacy date" });
      await ctx.db.patch(unknown, { expiredCount: 99 }); // expired votes are not deletion authority
      return ctx.db.insert("reelItems", { ownerId: s.authorId, sourceUrl: "https://www.instagram.com/reel/PRIVATE/", status: "ready", generation: 1, attempts: 0, updatedAt: 0, expiresAt: 1 });
    });
    const privateBefore = await s.t.run(ctx => ctx.db.get(privateId));
    vi.setSystemTime(cutoff + 1);
    const result = await s.t.mutation(sweep, { cursor: null });
    expect(result.scanned).toBe(2); expect(result.queued).toBe(0);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await s.get(unknown)).not.toBeNull(); expect(await s.get(malformed)).not.toBeNull();
    expect(await s.t.run(ctx => ctx.db.get(privateId))).toEqual(privateBefore);
    // Explicit owner removal is still available without known expiry.
    await s.author.mutation(api.deals.remove, { dealId: unknown });
    expect(await s.get(unknown)).toBeNull();
  });
  it("retains everything atomically if geospatial deletion fails or vote limit is exceeded", async () => {
    const s = await setup(); const id = await s.create();
    await s.t.run(ctx => ctx.db.insert("votes", { dealId: id, userId: s.authorId, value: "expired" }));
    vi.spyOn(GeospatialIndex.prototype, "remove").mockRejectedValueOnce(new Error("index down"));
    await expect(s.t.mutation(removeExpired, { dealId: id })).rejects.toThrow("index down");
    expect(await s.get(id)).not.toBeNull(); expect(await s.point(id)).not.toBeNull();
    await s.t.run(async ctx => { for (let i = 0; i < MAX_VOTES_PER_DELETE; i++) await ctx.db.insert("votes", { dealId: id, userId: s.authorId, value: "expired" }); });
    await expect(s.t.mutation(removeExpired, { dealId: id })).rejects.toThrow("too many votes");
    expect(await s.get(id)).not.toBeNull(); expect(await s.point(id)).not.toBeNull();
    expect(await s.t.run(ctx => ctx.db.query("votes").collect())).toHaveLength(MAX_VOTES_PER_DELETE + 1);
  });
  it("registers both cleanup entry points as internal-only", async () => {
    const functions = await import("../../convex/deals");
    expect(functions.removeExpired.isInternal).toBe(true); expect(functions.sweepExpired.isInternal).toBe(true);
    const { default: crons } = await import("../../convex/crons");
    const jobs = JSON.parse((crons as unknown as { export: () => string }).export());
    expect(jobs["clean canonical published deals after retention"]).toMatchObject({ name: "deals:sweepExpired", args: [{ cursor: null }] });
    expect(jobs["Remove expired deals from realtime maps"]).toBeDefined();
  });
});
