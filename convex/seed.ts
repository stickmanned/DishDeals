import { GeospatialIndex } from "@convex-dev/geospatial";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import seedFixture from "../fixtures/seed.json";
import {
  SEED_MAX_AUTHOR_SCAN, SeedError, dealIdentity, parseSeedManifest, storedDealMatches, type SeedManifest,
} from "../lib/seed";

// Same index the canonical deals.create writes: key = deal id, no filter keys, sort key = creation time.
const geospatial = new GeospatialIndex<Id<"deals">, Record<string, never>>(components.geospatial);
const toPoint = (lat: number, lng: number) => ({ latitude: lat, longitude: lng });

export type SeedSummary = {
  dryRun: boolean; profilesToCreate: number; profilesExisting: number; dealsToCreate: number; dealsExisting: number;
};

/**
 * Validates everything first (fixture, users, profiles, existing deals), then writes in the caller's
 * single transaction: any later failure, including the geospatial insert, rolls back every write.
 * Never creates users, never overwrites a profile or deal, never touches votes or counters.
 */
export async function runSeed(ctx: MutationCtx, rawManifest: unknown, dryRun: boolean): Promise<SeedSummary> {
  const manifest: SeedManifest = parseSeedManifest(rawManifest);

  const users = new Map<string, Id<"users">>();
  for (const p of manifest.profiles) {
    const id = ctx.db.normalizeId("users", p.userId);
    if (id === null || (await ctx.db.get("users", id)) === null) throw new SeedError("missing_user", `User ${p.userId} does not exist; seeding never creates accounts.`);
    users.set(p.userId, id);
  }

  const newProfiles: { userId: Id<"users">; displayName: string; walletAddress: string }[] = [];
  let profilesExisting = 0;
  for (const p of manifest.profiles) {
    const userId = users.get(p.userId)!;
    const rows = await ctx.db.query("profiles").withIndex("by_user", q => q.eq("userId", userId)).take(2);
    if (rows.length > 1) throw new SeedError("profile_conflict", `User ${p.userId} has more than one profile.`);
    if (rows.length === 1) {
      if (rows[0].displayName !== p.displayName || rows[0].walletAddress !== p.walletAddress) {
        throw new SeedError("profile_conflict", `User ${p.userId} already has a different profile; it is never overwritten.`);
      }
      profilesExisting++;
    } else {
      newProfiles.push({ userId, displayName: p.displayName, walletAddress: p.walletAddress });
    }
  }

  const scans = new Map<string, Awaited<ReturnType<typeof scanAuthor>>>();
  async function scanAuthor(authorId: Id<"users">) {
    const rows = await ctx.db.query("deals").withIndex("by_author", q => q.eq("authorId", authorId)).take(SEED_MAX_AUTHOR_SCAN + 1);
    if (rows.length > SEED_MAX_AUTHOR_SCAN) throw new SeedError("scan_limit", `Author ${authorId} has more than ${SEED_MAX_AUTHOR_SCAN} deals; refusing an unbounded scan.`);
    return rows;
  }
  const newDeals: { authorId: Id<"users">; deal: SeedManifest["deals"][number]["deal"] }[] = [];
  let dealsExisting = 0;
  for (const d of manifest.deals) {
    const authorId = users.get(d.authorUserId)!;
    if (!scans.has(d.authorUserId)) scans.set(d.authorUserId, await scanAuthor(authorId));
    const identity = dealIdentity(d.authorUserId, d.deal);
    const matches = scans.get(d.authorUserId)!.filter(r => dealIdentity(d.authorUserId, r) === identity);
    if (matches.length > 1) throw new SeedError("deal_conflict", `Several stored deals match ${d.deal.restaurant}; resolve by hand.`);
    if (matches.length === 1) {
      if (!storedDealMatches(matches[0], d.deal)) throw new SeedError("deal_conflict", `Stored deal for ${d.deal.restaurant} differs from the fixture; it is never overwritten.`);
      dealsExisting++;
    } else {
      newDeals.push({ authorId, deal: d.deal });
    }
  }

  const summary: SeedSummary = { dryRun, profilesToCreate: newProfiles.length, profilesExisting, dealsToCreate: newDeals.length, dealsExisting };
  if (dryRun) return summary;

  for (const p of newProfiles) await ctx.db.insert("profiles", p);
  for (const { authorId, deal } of newDeals) {
    const dealId = await ctx.db.insert("deals", { ...deal, authorId, stillOnCount: 0, expiredCount: 0 });
    const created = (await ctx.db.get("deals", dealId))!;
    await geospatial.insert(ctx, dealId, toPoint(deal.lat, deal.lng), {}, created._creationTime);
  }
  return summary;
}

// Internal only. A real insert needs an explicit dryRun: false from a future, separately authorized run.
export const seedDeals = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    dryRun: v.boolean(), profilesToCreate: v.number(), profilesExisting: v.number(), dealsToCreate: v.number(), dealsExisting: v.number(),
  }),
  handler: async (ctx, args) => runSeed(ctx, seedFixture, args.dryRun ?? true),
});
