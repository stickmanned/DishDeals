// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of runSeed / seed:seedDeals with the real geospatial component registered.
// Users, wallets, restaurants and sources are SYNTHETIC. Not a deployed backend and not real team data.
import { vi } from "vitest";
vi.hoisted(() => { (globalThis as Record<string, unknown>).Convex = {}; });
import { convexTest } from "convex-test";
import geospatial from "@convex-dev/geospatial/test";
import { GeospatialIndex } from "@convex-dev/geospatial";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { components } from "../../convex/_generated/api";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { runSeed } from "../../convex/seed";
import { SEED_DEAL_COUNT } from "../../lib/seed";
import { encodeBase58 } from "../../lib/tipRequest";

// convex/_generated is generated config owned elsewhere and does not list seed.ts yet, so reference it by name.
const seedDeals = makeFunctionReference<"mutation", { dryRun?: boolean }>("seed:seedDeals");
const modules = import.meta.glob("../../convex/**/*.ts");
const wallet = (n: number) => encodeBase58(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 1 : 0) + n * 3 + i));

async function setup() {
  const t = convexTest(schema, modules);
  geospatial.register(t);
  const [a, b] = await Promise.all(["a", "b"].map(n => t.run(ctx => ctx.db.insert("users", { email: `${n}@example.invalid` }))));
  const index = new GeospatialIndex<Id<"deals">, Record<string, never>>(components.geospatial);
  type Raw = { version: number; profiles: { userId: string; displayName: string; walletAddress: string }[]; deals: { authorUserId: string; deal: Record<string, unknown> }[] };
  const manifest = (): Raw => ({
    version: 1,
    profiles: [
      { userId: a, displayName: "Synthetic A", walletAddress: wallet(1) },
      { userId: b, displayName: "Synthetic B", walletAddress: wallet(2) },
    ],
    deals: Array.from({ length: SEED_DEAL_COUNT }, (_, i) => ({
      authorUserId: i % 2 === 0 ? a : b,
      deal: {
        restaurant: `Synthetic Diner ${i}`, dealText: `Synthetic special ${i}`, validDays: [], conditions: [],
        lat: 49.25 + i * 0.001, lng: -123.1 + i * 0.001, sourceUrl: `https://example.invalid/post/${i}`,
      },
      evidence: {
        sourceUrl: `https://example.invalid/post/${i}`, reviewedBy: "Synthetic Reviewer", reviewedAt: "2026-10-04T10:00:00-07:00",
        locationConfirmedBy: "Synthetic Reviewer", locationConfirmedAt: "2026-10-04T10:05:00-07:00",
      },
    })),
  });
  const seed = (raw: unknown, dryRun: boolean) => t.run(ctx => runSeed(ctx, raw, dryRun));
  const rows = () => t.run(async ctx => ({
    profiles: await ctx.db.query("profiles").collect(), deals: await ctx.db.query("deals").collect(),
    votes: await ctx.db.query("votes").collect(), users: await ctx.db.query("users").collect(),
  }));
  const near = () => t.run(ctx => index.nearest(ctx, { point: { latitude: 49.255, longitude: -123.095 }, limit: 50, maxDistance: 50_000 }));
  return { t, a, b, manifest, seed, rows, near };
}

describe("seed backend", () => {
  it("the shipped empty fixture is rejected by seed:seedDeals and writes nothing", async () => {
    const s = await setup();
    await expect(s.t.mutation(seedDeals, {})).rejects.toThrow("incomplete_fixture");
    await expect(s.t.mutation(seedDeals, { dryRun: false })).rejects.toThrow("incomplete_fixture");
    const r = await s.rows();
    expect([r.profiles.length, r.deals.length, r.users.length]).toEqual([0, 0, 2]);
  });

  it("dry run previews and writes nothing", async () => {
    const s = await setup();
    expect(await s.seed(s.manifest(), true)).toEqual({ dryRun: true, profilesToCreate: 2, profilesExisting: 0, dealsToCreate: 10, dealsExisting: 0 });
    const r = await s.rows();
    expect([r.profiles.length, r.deals.length]).toEqual([0, 0]);
    expect(await s.near()).toHaveLength(0);
  });

  it("real run inserts profiles, deals with zero counters, and geospatial points; never users or votes", async () => {
    const s = await setup();
    expect(await s.seed(s.manifest(), false)).toMatchObject({ dryRun: false, profilesToCreate: 2, dealsToCreate: 10 });
    const r = await s.rows();
    expect(r.profiles).toHaveLength(2);
    expect(r.deals).toHaveLength(10);
    expect(r.users).toHaveLength(2);
    expect(r.votes).toHaveLength(0);
    for (const d of r.deals) {
      expect([d.stillOnCount, d.expiredCount]).toEqual([0, 0]);
      expect(d.imageId).toBeUndefined();
    }
    expect(await s.near()).toHaveLength(10);
  });

  it("is idempotent: a second run creates nothing", async () => {
    const s = await setup();
    await s.seed(s.manifest(), false);
    expect(await s.seed(s.manifest(), false)).toEqual({ dryRun: false, profilesToCreate: 0, profilesExisting: 2, dealsToCreate: 0, dealsExisting: 10 });
    const r = await s.rows();
    expect([r.profiles.length, r.deals.length]).toEqual([2, 10]);
    expect(await s.near()).toHaveLength(10);
  });

  it("rejects a missing user and writes nothing", async () => {
    const s = await setup();
    const m = s.manifest();
    await s.t.run(ctx => ctx.db.delete("users", s.b));
    await expect(s.seed(m, false)).rejects.toThrow("missing_user");
    const garbage = s.manifest(); garbage.profiles[0].userId = "not-an-id"; garbage.deals.forEach(d => { if (d.authorUserId === s.a) d.authorUserId = "not-an-id"; });
    await expect(s.seed(garbage, false)).rejects.toThrow("missing_user");
    const r = await s.rows();
    expect([r.profiles.length, r.deals.length]).toEqual([0, 0]);
  });

  it("never overwrites a different existing profile", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.insert("profiles", { userId: s.a, displayName: "Someone Else", walletAddress: wallet(9) }));
    await expect(s.seed(s.manifest(), false)).rejects.toThrow("profile_conflict");
    const r = await s.rows();
    expect(r.profiles).toHaveLength(1);
    expect(r.profiles[0].displayName).toBe("Someone Else");
    expect(r.deals).toHaveLength(0);
  });

  it("never overwrites a changed stored deal and rolls back nothing partial", async () => {
    const s = await setup();
    await s.seed(s.manifest(), false);
    const changed = s.manifest(); changed.deals[3].deal.lat = 49.3;
    await expect(s.seed(changed, false)).rejects.toThrow("deal_conflict");
    const r = await s.rows();
    expect(r.deals).toHaveLength(10);
    expect(r.deals.some(d => d.lat === 49.3)).toBe(false);
  });

  it("preserves votes and counters of already-seeded deals", async () => {
    const s = await setup();
    await s.seed(s.manifest(), false);
    const id = (await s.rows()).deals[0]._id;
    await s.t.run(ctx => ctx.db.patch("deals", id, { stillOnCount: 5, expiredCount: 2 }));
    await s.seed(s.manifest(), false);
    const d = (await s.rows()).deals.find(x => x._id === id)!;
    expect([d.stillOnCount, d.expiredCount]).toEqual([5, 2]);
  });

  it("refuses an unbounded author scan", async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      for (let i = 0; i < 201; i++) {
        await ctx.db.insert("deals", { authorId: s.a, restaurant: `Other ${i}`, dealText: "x", validDays: [], conditions: [], lat: 49, lng: -123, stillOnCount: 0, expiredCount: 0 });
      }
    });
    await expect(s.seed(s.manifest(), false)).rejects.toThrow("scan_limit");
    expect((await s.rows()).profiles).toHaveLength(0);
  });

  it("a validation failure writes nothing", async () => {
    const s = await setup();
    const m = s.manifest(); m.deals[9].deal.lat = 200;
    await expect(s.seed(m, false)).rejects.toThrow("malformed_fixture");
    const r = await s.rows();
    expect([r.profiles.length, r.deals.length]).toEqual([0, 0]);
  });
});
