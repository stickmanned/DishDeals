// Synthetic fixtures only. The users, wallets, restaurants and sources below are made up for tests and are
// NOT real team profiles or real deals. Pure validation only: no Convex runtime, not proof of any human review.
import { describe, expect, it } from "vitest";
import { SEED_DEAL_COUNT, SEED_PROFILE_COUNT, SeedError, isRealIsoTimestamp, parseSeedManifest, storedDealMatches } from "../../lib/seed";
import { encodeBase58 } from "../../lib/tipRequest";
import empty from "../../fixtures/seed.json";

const wallet = (n: number) => encodeBase58(Uint8Array.from({ length: 32 }, (_, i) => (i === 0 ? 1 : 0) + n * 3 + i));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests deliberately corrupt this shape
export function syntheticManifest(): any {
  const deals = Array.from({ length: SEED_DEAL_COUNT }, (_, i) => ({
    authorUserId: i % 2 === 0 ? "user-a" : "user-b",
    deal: {
      restaurant: `Synthetic Diner ${i}`, dealText: `Synthetic special ${i}`, validDays: [], conditions: [],
      lat: 49.25 + i * 0.001, lng: -123.1 + i * 0.001, sourceUrl: `https://example.invalid/post/${i}`,
      ...(i % 3 === 0 ? { priceCad: 9.5 } : {}),
    },
    evidence: {
      sourceUrl: `https://example.invalid/post/${i}`, reviewedBy: "Synthetic Reviewer", reviewedAt: "2026-10-04T10:00:00-07:00",
      ...(i % 3 === 0 ? { currencyConfirmed: "CAD" } : {}),
      locationConfirmedBy: "Synthetic Reviewer", locationConfirmedAt: "2026-10-04T10:05:00Z",
    },
  }));
  return {
    version: 1,
    profiles: [
      { userId: "user-a", displayName: "Synthetic A", walletAddress: wallet(1) },
      { userId: "user-b", displayName: "Synthetic B", walletAddress: wallet(2) },
    ],
    deals,
  };
}

const expectCode = (raw: unknown, code: string, text?: RegExp) => {
  try { parseSeedManifest(raw); } catch (e) {
    expect(e).toBeInstanceOf(SeedError);
    expect((e as SeedError).code).toBe(code);
    if (text) expect((e as Error).message).toMatch(text);
    return;
  }
  throw new Error("expected rejection");
};

describe("seed manifest validation", () => {
  it("rejects the shipped empty fixture as incomplete, never success", () => {
    expect(empty.profiles).toHaveLength(0);
    expect(empty.deals).toHaveLength(0);
    expectCode(empty, "incomplete_fixture", /Nothing was written/);
  });

  it("accepts a complete synthetic manifest and normalizes optionals", () => {
    const m = parseSeedManifest(syntheticManifest());
    expect(m.profiles).toHaveLength(SEED_PROFILE_COUNT);
    expect(m.deals).toHaveLength(SEED_DEAL_COUNT);
    expect(m.deals[1].deal).not.toHaveProperty("priceCad");
    expect(m.deals[0].evidence.currencyConfirmed).toBe("CAD");
  });

  it("converts null optionals to undefined but never required nulls", () => {
    const raw = syntheticManifest();
    Object.assign(raw.deals[1].deal, { priceCad: null, address: null, validStart: null, validEnd: null, expiresOn: null });
    expect(parseSeedManifest(raw).deals[1].deal).not.toHaveProperty("address");
    const req = syntheticManifest(); req.deals[0].deal.restaurant = null;
    expectCode(req, "malformed_fixture");
  });

  it("rejects wrong counts, bad version, unknown fields", () => {
    const few = syntheticManifest(); few.deals.pop(); expectCode(few, "incomplete_fixture");
    const prof = syntheticManifest(); prof.profiles.pop(); expectCode(prof, "incomplete_fixture");
    const ver = syntheticManifest(); ver.version = 2; expectCode(ver, "malformed_fixture");
    const extra = syntheticManifest(); extra.deals[0].deal.rating = 5; expectCode(extra, "malformed_fixture", /unknown field/);
    const top = syntheticManifest(); top.extra = 1; expectCode(top, "malformed_fixture");
    expectCode(null, "malformed_fixture");
  });

  it("rejects bad profiles: wallet syntax, duplicates, name, missing wallet", () => {
    const w = syntheticManifest(); w.profiles[0].walletAddress = "not-a-wallet"; expectCode(w, "malformed_fixture");
    const none = syntheticManifest(); delete none.profiles[0].walletAddress; expectCode(none, "malformed_fixture");
    const dupW = syntheticManifest(); dupW.profiles[1].walletAddress = dupW.profiles[0].walletAddress; expectCode(dupW, "malformed_fixture", /repeats/);
    const dupU = syntheticManifest(); dupU.profiles[1].userId = "user-a"; expectCode(dupU, "malformed_fixture", /repeats/);
    const name = syntheticManifest(); name.profiles[0].displayName = "x"; expectCode(name, "malformed_fixture");
    const space = syntheticManifest(); space.profiles[0].displayName = " Synthetic A"; expectCode(space, "malformed_fixture");
  });

  it("rejects unknown author, missing/mismatched source, pending evidence", () => {
    const author = syntheticManifest(); author.deals[0].authorUserId = "ghost"; expectCode(author, "malformed_fixture", /not one of/);
    const nosrc = syntheticManifest(); delete nosrc.deals[0].deal.sourceUrl; expectCode(nosrc, "malformed_fixture", /sourceUrl/);
    const diff = syntheticManifest(); diff.deals[0].evidence.sourceUrl = "https://example.invalid/other"; expectCode(diff, "malformed_fixture", /equal/);
    for (const key of ["reviewedBy", "locationConfirmedBy", "reviewedAt", "locationConfirmedAt"]) {
      const miss = syntheticManifest(); delete miss.deals[0].evidence[key]; expectCode(miss, "malformed_fixture");
      const blank = syntheticManifest(); blank.deals[0].evidence[key] = "  "; expectCode(blank, "malformed_fixture");
    }
    const pending = syntheticManifest(); pending.deals[0].evidence.locationConfirmedAt = "pending"; expectCode(pending, "malformed_fixture", /ISO/);
    const nonzone = syntheticManifest(); nonzone.deals[0].evidence.reviewedAt = "2026-10-04T10:00:00"; expectCode(nonzone, "malformed_fixture");
    const overflow = syntheticManifest(); overflow.deals[0].evidence.reviewedAt = "2026-02-30T10:00:00Z"; expectCode(overflow, "malformed_fixture");
  });

  it("requires CAD confirmation exactly when a price is given", () => {
    const noCur = syntheticManifest(); delete noCur.deals[0].evidence.currencyConfirmed; expectCode(noCur, "malformed_fixture", /CAD/);
    const usd = syntheticManifest(); usd.deals[0].evidence.currencyConfirmed = "USD"; expectCode(usd, "malformed_fixture", /CAD/);
    const stray = syntheticManifest(); stray.deals[1].evidence.currencyConfirmed = "CAD"; expectCode(stray, "malformed_fixture", /only valid/);
  });

  it("rejects invalid canonical fields through the shared validator", () => {
    const lat = syntheticManifest(); lat.deals[0].deal.lat = 95; expectCode(lat, "malformed_fixture");
    const day = syntheticManifest(); day.deals[0].deal.validDays = ["funday"]; expectCode(day, "malformed_fixture");
    const half = syntheticManifest(); half.deals[0].deal.validStart = "10:00"; expectCode(half, "malformed_fixture");
  });

  it("rejects duplicate deal identities", () => {
    const dup = syntheticManifest(); dup.deals[2] = structuredClone({ ...dup.deals[0] }); expectCode(dup, "malformed_fixture", /repeats another/);
  });

  it("checks timestamps strictly", () => {
    expect(isRealIsoTimestamp("2026-10-04T10:00:00.123Z")).toBe(true);
    expect(isRealIsoTimestamp("2026-10-04 10:00:00Z")).toBe(false);
    expect(isRealIsoTimestamp(5)).toBe(false);
  });

  it("compares stored deals field by field", () => {
    const { deal } = parseSeedManifest(syntheticManifest()).deals[0];
    const stored = { ...deal, authorId: "u", stillOnCount: 4, expiredCount: 1 };
    expect(storedDealMatches(stored, deal)).toBe(true);
    expect(storedDealMatches({ ...stored, priceCad: 1 }, deal)).toBe(false);
    expect(storedDealMatches({ ...stored, imageId: "img" }, deal)).toBe(false);
    expect(storedDealMatches({ ...stored, conditions: ["x"] }, deal)).toBe(false);
    expect(storedDealMatches({ ...stored, lat: stored.lat + 0.1 }, deal)).toBe(false);
  });
});
