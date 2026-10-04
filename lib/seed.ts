// Pure validation for the canonical seed manifest (T-12A). No Convex imports.
// Reuses the canonical publish validation; there is no parallel deal schema.
//
// IMPORTANT: these checks are syntactic. A non-empty reviewer name, a parseable timestamp or a base58
// wallet does NOT prove that a human reviewed the deal, confirmed the pin, or owns the wallet. The
// fixture's truth rests on the people who fill it in.
import { WriteError, isRealIsoDate, validatePublishFields, type CleanPublishFields, type RawPublishFields } from "./dealWrite";
import { validateDisplayName } from "./profile";
import { validateSolanaAddress } from "./tipRequest";

export const SEED_PROFILE_COUNT = 2;
export const SEED_DEAL_COUNT = 10;
export const SEED_MAX_AUTHOR_SCAN = 200;

export type SeedErrorCode =
  | "incomplete_fixture" | "malformed_fixture" | "missing_user" | "profile_conflict"
  | "deal_conflict" | "scan_limit";

export class SeedError extends Error {
  constructor(readonly code: SeedErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "SeedError";
  }
}

export type SeedProfile = { userId: string; displayName: string; walletAddress: string };
export type SeedEvidence = {
  sourceUrl: string; reviewedBy: string; reviewedAt: string;
  currencyConfirmed?: "CAD"; locationConfirmedBy: string; locationConfirmedAt: string;
};
export type SeedDeal = { authorUserId: string; deal: CleanPublishFields; evidence: SeedEvidence };
export type SeedManifest = { version: 1; profiles: SeedProfile[]; deals: SeedDeal[] };

const bad = (message: string): never => { throw new SeedError("malformed_fixture", message); };
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function exactKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string) {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) bad(`${where} has unknown field "${key}".`);
}

function nonEmpty(value: unknown, where: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim() !== value) bad(`${where} must be a non-empty trimmed string.`);
  return value as string;
}

// Real, parseable ISO-8601 timestamp with an explicit zone; rejects overflow dates such as 2026-02-30.
export function isRealIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  return m !== null && isRealIsoDate(m[1]) && Number.isFinite(Date.parse(value));
}

const OPTIONAL_DEAL_KEYS = ["address", "priceCad", "validStart", "validEnd", "expiresOn", "sourceUrl"] as const;
const DEAL_KEYS = ["restaurant", "dealText", "validDays", "conditions", "lat", "lng", ...OPTIONAL_DEAL_KEYS];

// null => undefined only for the optional canonical fields, then the existing canonical validator runs.
function adaptDeal(raw: Record<string, unknown>, where: string): CleanPublishFields {
  exactKeys(raw, DEAL_KEYS, where);
  const input: Record<string, unknown> = { ...raw };
  for (const key of OPTIONAL_DEAL_KEYS) if (input[key] === null) delete input[key];
  try {
    return validatePublishFields(input as unknown as RawPublishFields);
  } catch (e) {
    if (e instanceof WriteError) return bad(`${where}: ${e.message}`);
    throw e;
  }
}

export const dealIdentity = (authorUserId: string, d: { restaurant: string; dealText: string; sourceUrl?: string }) =>
  JSON.stringify([authorUserId, d.restaurant, d.dealText, d.sourceUrl ?? null]);

/** Throws SeedError. The fixture must contain exactly 2 profiles and 10 valid, unique, evidenced deals. */
export function parseSeedManifest(raw: unknown): SeedManifest {
  if (!isObject(raw)) return bad("Seed fixture must be an object.");
  exactKeys(raw, ["version", "profiles", "deals"], "Fixture");
  if (raw.version !== 1) bad("Fixture version must be 1.");
  if (!Array.isArray(raw.profiles) || !Array.isArray(raw.deals)) return bad("Fixture profiles and deals must be arrays.");
  if (raw.profiles.length !== SEED_PROFILE_COUNT || raw.deals.length !== SEED_DEAL_COUNT) {
    throw new SeedError("incomplete_fixture",
      `Need exactly ${SEED_PROFILE_COUNT} real existing user profiles and ${SEED_DEAL_COUNT} reviewed deals; the fixture has ${raw.profiles.length} and ${raw.deals.length}. Nothing was written. See fixtures/seed.README.md.`);
  }

  const userIds = new Set<string>(), wallets = new Set<string>();
  const profiles: SeedProfile[] = raw.profiles.map((p: unknown, i: number) => {
    const where = `profiles[${i}]`;
    if (!isObject(p)) return bad(`${where} must be an object.`);
    exactKeys(p, ["userId", "displayName", "walletAddress"], where);
    const userId = nonEmpty(p.userId, `${where}.userId`);
    if (typeof p.displayName !== "string") bad(`${where}.displayName must be a string.`);
    let displayName: string;
    try { displayName = validateDisplayName(p.displayName as string); } catch (e) { return bad(`${where}: ${(e as Error).message}`); }
    if (displayName !== p.displayName) bad(`${where}.displayName must not have surrounding spaces.`);
    const walletAddress = nonEmpty(p.walletAddress, `${where}.walletAddress`);
    try { validateSolanaAddress(walletAddress, `${where}.walletAddress`); } catch (e) { return bad((e as Error).message); }
    if (userIds.has(userId)) bad(`${where}.userId repeats.`);
    if (wallets.has(walletAddress)) bad(`${where}.walletAddress repeats.`);
    userIds.add(userId); wallets.add(walletAddress);
    return { userId, displayName, walletAddress };
  });

  const identities = new Set<string>();
  const deals: SeedDeal[] = raw.deals.map((d: unknown, i: number) => {
    const where = `deals[${i}]`;
    if (!isObject(d)) return bad(`${where} must be an object.`);
    exactKeys(d, ["authorUserId", "deal", "evidence"], where);
    const authorUserId = nonEmpty(d.authorUserId, `${where}.authorUserId`);
    if (!userIds.has(authorUserId)) bad(`${where}.authorUserId is not one of the fixture profiles.`);
    if (!isObject(d.deal)) return bad(`${where}.deal must be an object.`);
    if (!isObject(d.evidence)) return bad(`${where}.evidence must be an object.`);
    const deal = adaptDeal(d.deal, `${where}.deal`);

    const e = d.evidence;
    exactKeys(e, ["sourceUrl", "reviewedBy", "reviewedAt", "currencyConfirmed", "locationConfirmedBy", "locationConfirmedAt"], `${where}.evidence`);
    const sourceUrl = nonEmpty(e.sourceUrl, `${where}.evidence.sourceUrl`);
    if (deal.sourceUrl === undefined || deal.sourceUrl !== sourceUrl) bad(`${where}: deal.sourceUrl must be present and equal evidence.sourceUrl.`);
    const reviewedBy = nonEmpty(e.reviewedBy, `${where}.evidence.reviewedBy`);
    const locationConfirmedBy = nonEmpty(e.locationConfirmedBy, `${where}.evidence.locationConfirmedBy`);
    if (!isRealIsoTimestamp(e.reviewedAt)) bad(`${where}.evidence.reviewedAt must be a real ISO timestamp with a zone.`);
    if (!isRealIsoTimestamp(e.locationConfirmedAt)) bad(`${where}.evidence.locationConfirmedAt must be a real ISO timestamp with a zone.`);
    const currency = e.currencyConfirmed === null ? undefined : e.currencyConfirmed;
    if (deal.priceCad !== undefined && currency !== "CAD") bad(`${where}: a known price needs evidence.currencyConfirmed "CAD".`);
    if (deal.priceCad === undefined && currency !== undefined) bad(`${where}: currencyConfirmed is only valid when a price is given.`);

    const identity = dealIdentity(authorUserId, deal);
    if (identities.has(identity)) bad(`${where} repeats another deal (same author, restaurant, deal text and source).`);
    identities.add(identity);
    return {
      authorUserId, deal,
      evidence: {
        sourceUrl, reviewedBy, reviewedAt: e.reviewedAt as string, locationConfirmedBy, locationConfirmedAt: e.locationConfirmedAt as string,
        ...(currency === "CAD" ? { currencyConfirmed: "CAD" as const } : {}),
      },
    };
  });
  return { version: 1, profiles, deals };
}

/** Full-field equality between a stored deal and the cleaned fixture deal (no image, optionals absent == absent). */
export function storedDealMatches(stored: Record<string, unknown>, clean: CleanPublishFields): boolean {
  const scalar = ["restaurant", "dealText", "lat", "lng", ...OPTIONAL_DEAL_KEYS] as const;
  for (const key of scalar) if ((stored[key] ?? undefined) !== (clean as Record<string, unknown>)[key]) return false;
  if (stored.imageId !== undefined) return false;
  const same = (a: unknown, b: string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);
  return same(stored.validDays, clean.validDays) && same(stored.conditions, clean.conditions);
}
