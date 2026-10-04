// Ordinary restrictions become visible conditions instead of blocking UNSUPPORTED_CONSTRAINT notes, and a price with no
// stated currency is CAD (docs/decisions/0007). Anything not recognised still blocks. Synthetic fixtures only: the Reel
// below mirrors the constraint wording Gemini actually returned for a real shared Reel; no network or provider call.
import { describe, expect, it } from "vitest";
import { addAsCondition, isCanadianDollar, isOrdinaryRestriction, mentionsForeignCurrency } from "../../lib/benignRestrictions";
import { reelExtractionToDealDrafts } from "../../lib/reels/toDealDraft";
import { validateModelOutput } from "../../lib/extractCore";
import type { ReelExtraction } from "../../lib/reels/contract";

const draft = (over: Record<string, unknown> = {}) => ({
  restaurant: "Cockney Kings Fish & Chips", address: null, dealText: "1 piece of cod and chips for just $1.50", price: 1.5, currency: null,
  validDays: ["sun"], validStart: "12:00", validEnd: "16:00", expiresOn: "2026-11-23", conditions: ["Limit of one per person while supplies last"], ...over,
});
const constraint = (detail: string, quote: string, code = "UNSUPPORTED_CONSTRAINT", startsOn: string | null = null) => ({ draftIndex: 0, code, detail, startsOn, channel: "caption", quote, timestampSeconds: null });
const extraction = (over: Partial<Record<string, unknown>> = {}, d = draft()) => ({
  isDeal: true, drafts: [d], evidence: [], transcript: "", warnings: [], constraints: [], ...over,
}) as unknown as ReelExtraction;

const realConstraints = [
  constraint("Event date does not include a four-digit year in the source text", "Sunday, November 23"),
  constraint("Limit of one per person", "Limit of one per person"),
  constraint("While supplies last", "while supplies last"),
  constraint("Valid only at specified locations", "Available at all locations in Burnaby, New West, and Kitsilano"),
];

describe("which restrictions count as ordinary", () => {
  it.each([
    "Limit of one per person", "Limit 1 per customer", "max 2 per table", "While supplies last", "while quantities last", "Limited quantity",
    "First come, first served", "First 50 customers only", "Dine-in only", "Takeout only", "Cash only", "Reservations required", "No substitutions", "Excludes tax and tip",
    "Valid only at specified locations", "Available at all locations in Burnaby",
  ])("%s", (text) => expect(isOrdinaryRestriction(text)).toBe(true));

  it.each([
    "Event date does not include a four-digit year in the source text", "Members only", "Must show a student ID", "Starts next Monday",
    "Requires the mobile app", "Valid for new customers only", "", "   ",
  ])("%s is not", (text) => expect(isOrdinaryRestriction(text)).toBe(false));

  it("matches on the source quote when the model's detail is vague", () => {
    expect(isOrdinaryRestriction("Some limit applies", "Limit of one per person")).toBe(true);
  });
});

describe("adding an ordinary restriction as a condition", () => {
  it("adds the verbatim quote once and recognises an existing condition that already says it", () => {
    expect(addAsCondition(["Dine-in only"], { quote: "Cash only", detail: "Cash only" })).toEqual({ conditions: ["Dine-in only", "Cash only"], absorbed: true });
    expect(addAsCondition(["Limit of one per person while supplies last"], { quote: "while supplies last", detail: "While supplies last" }))
      .toEqual({ conditions: ["Limit of one per person while supplies last"], absorbed: true });
    expect(addAsCondition(null, { quote: null, detail: "Cash only" }).conditions).toEqual(["Cash only"]);
  });

  it("refuses text that cannot fit the 300 character / 20 condition limits so it stays a blocking note", () => {
    expect(addAsCondition([], { quote: "x".repeat(301), detail: "Cash only" }).absorbed).toBe(false);
    expect(addAsCondition(Array.from({ length: 20 }, (_, i) => `condition ${i}`), { quote: "Cash only", detail: "Cash only" }).absorbed).toBe(false);
  });
});

describe("currency", () => {
  it("no stated currency or CAD is Canadian dollars; another stated currency is not", () => {
    for (const c of [null, undefined, "", "CAD", "cad"]) expect(isCanadianDollar(c)).toBe(true);
    for (const c of ["USD", "EUR", "GBP"]) expect(isCanadianDollar(c)).toBe(false);
    expect(mentionsForeignCurrency("Only US$5 today")).toBe(true);
    expect(mentionsForeignCurrency("Just $1.50, Burnaby")).toBe(false);
  });
});

describe("Reel to deal draft", () => {
  it("a real Reel's per-person, supplies and location notes no longer block; the missing-year note still does", () => {
    const [d] = reelExtractionToDealDrafts(extraction({ constraints: realConstraints })).drafts;
    const blocking = d.reviewIssues.filter((i) => i.blocking && i.code === "UNSUPPORTED_CONSTRAINT");
    expect(blocking.map((i) => i.detail)).toEqual(["Event date does not include a four-digit year in the source text"]);
    const conditions = d.fields.conditions.suggestion?.value ?? d.fields.conditions.value ?? [];
    expect(conditions).toContain("Limit of one per person while supplies last");
    expect(conditions).toContain("Available at all locations in Burnaby, New West, and Kitsilano");
    expect(conditions.filter((c: string) => /one per person/i.test(c))).toHaveLength(1);
  });

  it("an unknown restriction and a future start keep blocking", () => {
    const [d] = reelExtractionToDealDrafts(extraction({ constraints: [constraint("Members only", "Members only"), constraint("Starts June 15, 2027", "Starts June 15, 2027", "FUTURE_START", "2027-06-15")] })).drafts;
    expect(d.reviewIssues.filter((i) => i.blocking).map((i) => i.code).sort()).toEqual(["FUTURE_START", "UNSUPPORTED_CONSTRAINT"]);
  });

  it("a price with no currency is kept as CAD with no currency issue; a stated USD price still needs confirmation", () => {
    const [none] = reelExtractionToDealDrafts(extraction({}, draft({ currency: null }))).drafts;
    expect(none.reviewIssues.some((i) => i.code === "CURRENCY_UNVERIFIED")).toBe(false);
    expect(none.fields.priceCad.suggestion?.value ?? none.fields.priceCad.value).toBe(1.5);
    const [usd] = reelExtractionToDealDrafts(extraction({}, draft({ currency: "USD" }))).drafts;
    expect(usd.reviewIssues.some((i) => i.code === "CURRENCY_UNVERIFIED")).toBe(true);
  });
});

describe("screenshot / flyer path", () => {
  const model = (over: Record<string, unknown> = {}) => ({
    isDeal: true,
    deals: [{ restaurant: "Ramen Danbo", address: null, dealText: "Lunch combo", statedPrice: 12.5, cadEvidence: null, validDays: ["mon"], validStart: null, validEnd: null,
      expiresOn: null, startDate: null, conditions: [], unsupportedConstraints: [], confidence: { restaurant: 0.9, priceCad: 0.8, hours: 0.5, expiresOn: 0.5 }, ...over }],
  });
  const run = (over: Record<string, unknown> = {}, supplied = "") => validateModelOutput(model(over), "2026-10-04", supplied);

  it("a price with no currency evidence is CAD; explicit foreign currency in the source still needs confirmation", () => {
    const ok = run();
    expect(ok.result.deals[0].priceCad).toBe(12.5);
    expect(ok.manualReview.filter((n) => n.code === "CURRENCY_UNVERIFIED")).toEqual([]);
    const usd = run({}, "Lunch combo only US$12.50 today");
    expect(usd.result.deals[0].priceCad).toBeNull();
    expect(usd.manualReview.some((n) => n.code === "CURRENCY_UNVERIFIED")).toBe(true);
  });

  it("ordinary restrictions move into conditions; unknown ones still block", () => {
    const out = run({ unsupportedConstraints: ["Limit one per person", "While supplies last", "Members only"], conditions: ["Dine-in only"] });
    expect(out.result.deals[0].conditions).toEqual(["Dine-in only", "Limit one per person", "While supplies last"]);
    expect(out.manualReview.filter((n) => n.code === "UNSUPPORTED_CONSTRAINT").map((n) => n.detail)).toEqual(["Members only"]);
  });
});
