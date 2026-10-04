import { describe, expect, it } from "vitest";
import {
  reelExtractionToDealDrafts,
  ReelDraftAdapterError,
  REEL_EXTRACTION_CONTRACT_GAPS,
  LEGACY_CONSTRAINT_REVIEW_DETAIL,
} from "../../lib/reels/toDealDraft";
import {
  dealDraftReducer,
  buildPublishFields,
  validateForPublish,
  DraftValidationError,
} from "../../lib/dealDraft";
import type { DealDraft } from "../../lib/dealDraft";
import type { ReelExtraction } from "../../lib/reels/contract";

// These fixtures omit `constraints` (legacy output), so every offer carries an explicit blocking
// legacy source-review note. A human resolves it with a non-empty note after checking the source.
function resolveLegacyReview(draft: DealDraft): DealDraft {
  const legacy = draft.reviewIssues.find((i) => i.detail === LEGACY_CONSTRAINT_REVIEW_DETAIL);
  expect(legacy).toBeDefined();
  return dealDraftReducer(draft, {
    type: "RESOLVE_REVIEW_ISSUE",
    issueId: legacy!.id,
    resolutionNote: "Checked the source: no future start date or restriction",
  });
}

// ---------------------------------------------------------------------------
// Synthetic test fixtures (clearly labeled, no live extraction or network)
// ---------------------------------------------------------------------------

function makeSyntheticReelExtraction(
  overrides: Partial<ReelExtraction> = {}
): ReelExtraction {
  return {
    isDeal: true,
    drafts: [
      {
        restaurant: "Ramen Danbo",
        address: "1333 Robson St, Vancouver, BC",
        dealText: "Gyoza combo special $12.50",
        price: 12.5,
        currency: "CAD",
        validDays: ["mon", "tue", "wed", "thu", "fri"],
        validStart: "11:00",
        validEnd: "15:00",
        expiresOn: "2026-12-31",
        conditions: ["dine-in only"],
      },
    ],
    evidence: [
      {
        draftIndex: 0,
        field: "restaurant",
        channel: "caption",
        quote: "Ramen Danbo",
        timestampSeconds: null,
      },
      {
        draftIndex: 0,
        field: "dealText",
        channel: "caption",
        quote: "Gyoza combo special",
        timestampSeconds: null,
      },
      {
        draftIndex: 0,
        field: "price",
        channel: "caption",
        quote: "$12.50",
        timestampSeconds: null,
      },
    ],
    transcript: "Welcome to Ramen Danbo for lunch specials.",
    warnings: [],
    ...overrides,
  };
}

describe("Reel-to-DealDraft adapter (N-FORM-A)", () => {
  describe("schema validation & rejection", () => {
    it("rejects invalid or malformed extraction payloads with ReelDraftAdapterError", () => {
      expect(() => reelExtractionToDealDrafts(null)).toThrow(ReelDraftAdapterError);
      expect(() => reelExtractionToDealDrafts(undefined)).toThrow(ReelDraftAdapterError);
      expect(() => reelExtractionToDealDrafts({ isDeal: true, drafts: [] })).toThrow(
        ReelDraftAdapterError
      );
      expect(() => reelExtractionToDealDrafts("not-an-object")).toThrow(
        ReelDraftAdapterError
      );
    });

    it("handles non-deal extraction without lying", () => {
      const nonDeal = makeSyntheticReelExtraction({
        isDeal: false,
        drafts: [],
        evidence: [],
      });

      const { drafts, sidecar } = reelExtractionToDealDrafts(nonDeal);
      expect(drafts).toHaveLength(1);
      expect(drafts[0].extraction.status).toBe("no_deal_detected");
      expect(sidecar.evidence).toEqual([]);
      expect(sidecar.transcript).toBe(nonDeal.transcript);
      expect(sidecar.contractGaps).toEqual(REEL_EXTRACTION_CONTRACT_GAPS);
    });
  });

  describe("no unknown array suggestion (no unknownarraysuggestion)", () => {
    it("never creates accept-able [] suggestions when validDays or conditions is null", () => {
      const extractionWithNullArrays = makeSyntheticReelExtraction({
        drafts: [
          {
            restaurant: "Sushi Bar",
            address: null,
            dealText: "Omakase lunch",
            price: 25,
            currency: "CAD",
            validDays: null, // UNKNOWN schedule from video
            validStart: null,
            validEnd: null,
            expiresOn: null,
            conditions: null, // UNKNOWN conditions from video
          },
        ],
      });

      const { drafts, sidecar } = reelExtractionToDealDrafts(extractionWithNullArrays);
      const draft = drafts[0];

      // validDays must NOT have a [] suggestion
      expect(draft.fields.validDays.suggestion).toBeUndefined();
      expect(draft.fields.validDays.value).toEqual([]);
      expect(draft.fields.validDays.isReviewed).toBe(false);

      // conditions must NOT have a [] suggestion
      expect(draft.fields.conditions.suggestion).toBeUndefined();
      expect(draft.fields.conditions.value).toEqual([]);
      expect(draft.fields.conditions.isReviewed).toBe(false);

      // Missing fields metadata must explicitly record them
      expect(sidecar.missingFieldsByDraft[0]).toContain("validDays");
      expect(sidecar.missingFieldsByDraft[0]).toContain("conditions");

      // ACCEPT_ALL_SUGGESTIONS does not mark them reviewed
      const afterAcceptAll = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      expect(afterAcceptAll.fields.validDays.isReviewed).toBe(false);
      expect(afterAcceptAll.fields.conditions.isReviewed).toBe(false);

      // Publishing must be blocked because validDays and conditions are unreviewed
      const validation = validateForPublish(afterAcceptAll);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Valid days must be explicitly reviewed"),
          expect.stringContaining("Conditions must be explicitly reviewed"),
        ])
      );
    });
  });

  describe("known array confirmation (knownarrayconfirmation)", () => {
    it("keeps known arrays tentative until explicit user acceptance", () => {
      const extractionWithKnownArrays = makeSyntheticReelExtraction({
        drafts: [
          {
            restaurant: "Taco Shop",
            address: "100 Commercial Dr",
            dealText: "Taco Tuesday",
            price: 3,
            currency: "CAD",
            validDays: ["tue"], // KNOWN single day
            validStart: "12:00",
            validEnd: "22:00",
            expiresOn: null,
            conditions: ["dine-in only"], // KNOWN condition
          },
        ],
      });

      const { drafts } = reelExtractionToDealDrafts(extractionWithKnownArrays);
      let draft = drafts[0];

      // Suggestions exist and are tentative
      expect(draft.fields.validDays.suggestion?.value).toEqual(["tue"]);
      expect(draft.fields.validDays.isReviewed).toBe(false);
      expect(draft.fields.conditions.suggestion?.value).toEqual(["dine-in only"]);
      expect(draft.fields.conditions.isReviewed).toBe(false);

      // Explicitly accept validDays suggestion
      draft = dealDraftReducer(draft, {
        type: "ACCEPT_SUGGESTION",
        field: "validDays",
      });
      expect(draft.fields.validDays.value).toEqual(["tue"]);
      expect(draft.fields.validDays.isReviewed).toBe(true);
      expect(draft.fields.validDays.suggestion).toBeUndefined();

      // Explicitly accept conditions suggestion
      draft = dealDraftReducer(draft, {
        type: "ACCEPT_SUGGESTION",
        field: "conditions",
      });
      expect(draft.fields.conditions.value).toEqual(["dine-in only"]);
      expect(draft.fields.conditions.isReviewed).toBe(true);
      expect(draft.fields.conditions.suggestion).toBeUndefined();
    });

    it("handles explicit known empty arrays [] from source as tentative suggestions", () => {
      const extractionKnownEmpty = makeSyntheticReelExtraction({
        drafts: [
          {
            restaurant: "Everyday Diner",
            address: null,
            dealText: "All day breakfast",
            price: 10,
            currency: "CAD",
            validDays: [], // Source explicitly confirmed all days
            validStart: null,
            validEnd: null,
            expiresOn: null,
            conditions: [], // Source explicitly confirmed no restrictions
          },
        ],
      });

      const { drafts } = reelExtractionToDealDrafts(extractionKnownEmpty);
      let draft = drafts[0];

      // Tentative suggestions exist for known []
      expect(draft.fields.validDays.suggestion?.value).toEqual([]);
      expect(draft.fields.validDays.isReviewed).toBe(false);
      expect(draft.fields.conditions.suggestion?.value).toEqual([]);
      expect(draft.fields.conditions.isReviewed).toBe(false);

      // Accept them
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      expect(draft.fields.validDays.isReviewed).toBe(true);
      expect(draft.fields.conditions.isReviewed).toBe(true);
    });
  });

  describe("null restaurant (nullrestaurant)", () => {
    it("leaves restaurant blank and unreviewed without emitting a false no-deal status", () => {
      const extractionNullRestaurant = makeSyntheticReelExtraction({
        drafts: [
          {
            restaurant: null, // Restaurant not named in reel video
            address: "Somewhere on Main St",
            dealText: "$5 burger special",
            price: 5,
            currency: "CAD",
            validDays: ["mon"],
            validStart: null,
            validEnd: null,
            expiresOn: null,
            conditions: [],
          },
        ],
      });

      const { drafts, sidecar } = reelExtractionToDealDrafts(extractionNullRestaurant);
      let draft = drafts[0];

      // It IS a deal; no "no_deal_detected" lie
      expect(draft.extraction.status).not.toBe("no_deal_detected");

      // Restaurant is blank, unreviewed, with no suggestion
      expect(draft.fields.restaurant.value).toBeNull();
      expect(draft.fields.restaurant.suggestion).toBeUndefined();
      expect(draft.fields.restaurant.isReviewed).toBe(false);

      // Missing fields records restaurant
      expect(sidecar.missingFieldsByDraft[0]).toContain("restaurant");

      // Cannot publish while restaurant is missing
      expect(validateForPublish(draft).valid).toBe(false);
      expect(validateForPublish(draft).errors).toEqual(
        expect.arrayContaining([expect.stringContaining("Restaurant name is required")])
      );

      // User manually enters restaurant
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Discovered Burger Joint",
      });
      expect(draft.fields.restaurant.value).toBe("Discovered Burger Joint");
      expect(draft.fields.restaurant.isManuallyEdited).toBe(true);
      expect(draft.fields.restaurant.isReviewed).toBe(true);
    });
  });

  describe("original amount and currency (originalamountcurrency)", () => {
    it("never maps non-CAD amounts into priceCad and creates indexed CURRENCY_UNVERIFIED issue", () => {
      const extractionUsd = makeSyntheticReelExtraction({
        drafts: [
          {
            restaurant: "Border Wings",
            address: "100 Border Rd",
            dealText: "Half price wings $14.99 USD",
            price: 14.99,
            currency: "USD", // Non-CAD
            validDays: ["wed"],
            validStart: null,
            validEnd: null,
            expiresOn: null,
            conditions: [],
          },
        ],
      });

      const { drafts, sidecar } = reelExtractionToDealDrafts(extractionUsd);
      let draft = drafts[0];

      // priceCad must NOT receive the USD amount
      expect(draft.fields.priceCad.value).toBeNull();
      expect(draft.fields.priceCad.suggestion).toBeUndefined();

      // Review issue must be created with originalAmount
      expect(draft.reviewIssues).toHaveLength(2);
      expect(draft.reviewIssues.filter((i) => i.code === "UNSUPPORTED_CONSTRAINT" && i.blocking && i.detail === LEGACY_CONSTRAINT_REVIEW_DETAIL)).toHaveLength(1);
      const currencyIssue = draft.reviewIssues.find((i) => i.code === "CURRENCY_UNVERIFIED")!;
      expect(currencyIssue.code).toBe("CURRENCY_UNVERIFIED");
      expect(currencyIssue.originalAmount).toBe(14.99);
      expect(currencyIssue.detail).toContain("USD");
      expect(currencyIssue.blocking).toBe(false);

      // Missing fields reflects unverified priceCad
      expect(sidecar.missingFieldsByDraft[0]).toContain("priceCad");

      // Accept suggestions and confirm location
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "address" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "hours" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "expiresOn" });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.002,
        lng: -122.756,
      });

      // Cannot publish because CURRENCY_UNVERIFIED requires manual price edit or omission
      expect(validateForPublish(draft).valid).toBe(false);
      expect(validateForPublish(draft).errors).toEqual(
        expect.arrayContaining([expect.stringContaining("Currency is unverified")])
      );

      // Manually set confirmed CAD price
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "priceCad",
        value: 20.5,
      });

      // The unresolved legacy source review still blocks until a human resolves it
      expect(validateForPublish(draft).valid).toBe(false);
      draft = resolveLegacyReview(draft);
      expect(validateForPublish(draft).valid).toBe(true);
      expect(buildPublishFields(draft).priceCad).toBe(20.5);
    });

    it("treats CAD price as tentative suggestion until user acceptance", () => {
      const extractionCad = makeSyntheticReelExtraction();
      const { drafts } = reelExtractionToDealDrafts(extractionCad);
      const draft = drafts[0];

      expect(draft.fields.priceCad.value).toBeNull();
      expect(draft.fields.priceCad.suggestion?.value).toBe(12.5);
      expect(draft.fields.priceCad.isReviewed).toBe(false);
      expect(draft.reviewIssues).toHaveLength(1);
      expect(draft.reviewIssues[0]).toMatchObject({ code: "UNSUPPORTED_CONSTRAINT", blocking: true, resolved: false, detail: LEGACY_CONSTRAINT_REVIEW_DETAIL });
    });
  });

  describe("warnings and indexed issues (warnings/indexedissues)", () => {
    it("retains all non-empty warnings as blocking UNSUPPORTED_CONSTRAINT review notes", () => {
      const extractionWithWarnings = makeSyntheticReelExtraction({
        warnings: [
          "Must show valid student ID at cashier",
          "Beverage purchase required per table",
        ],
      });

      const { drafts } = reelExtractionToDealDrafts(extractionWithWarnings);
      let draft = drafts[0];

      // Legacy source-review note first, then one note per warning
      expect(draft.reviewIssues).toHaveLength(3);
      expect(draft.reviewIssues[0].detail).toBe(LEGACY_CONSTRAINT_REVIEW_DETAIL);
      for (const issue of draft.reviewIssues) {
        expect(issue.code).toBe("UNSUPPORTED_CONSTRAINT");
        expect(issue.blocking).toBe(true);
      }
      expect(draft.reviewIssues[1].detail).toBe("Must show valid student ID at cashier");
      expect(draft.reviewIssues[2].detail).toBe("Beverage purchase required per table");

      // Does not invent FUTURE_START from guessed language
      expect(draft.reviewIssues.some((iss) => iss.code === "FUTURE_START")).toBe(false);

      // Accept suggestions & confirm location
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "hours" });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.2827,
        lng: -123.1207,
      });

      // Unresolved warnings block publishing
      expect(validateForPublish(draft).valid).toBe(false);
      expect(validateForPublish(draft).errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Unresolved provider constraint"),
        ])
      );

      // Resolving with empty note is refused
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: draft.reviewIssues[1].id,
        resolutionNote: "   ",
      });
      expect(draft.reviewIssues[1].resolved).toBe(false);

      // Resolving with meaningful notes succeeds
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: draft.reviewIssues[1].id,
        resolutionNote: "Verified student promo active all term",
      });
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: draft.reviewIssues[2].id,
        resolutionNote: "Added drink requirement to conditions",
      });

      expect(draft.reviewIssues[1].resolved).toBe(true);
      expect(draft.reviewIssues[2].resolved).toBe(true);
      // The legacy review note is still open and still blocks
      expect(draft.reviewIssues[0].resolved).toBe(false);
      expect(validateForPublish(draft).valid).toBe(false);

      draft = resolveLegacyReview(draft);
      expect(validateForPublish(draft).valid).toBe(true);
    });
  });

  describe("manual edits survive integration use (allmanualeditedvalues survive integration use)", () => {
    it("preserves manual edits when user overrides fields before/during integration", () => {
      const extraction = makeSyntheticReelExtraction();
      const { drafts } = reelExtractionToDealDrafts(extraction);
      let draft = drafts[0];

      // User manually sets custom restaurant name and price
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "My Favorite Noodle House",
      });
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "priceCad",
        value: 11.0,
      });

      expect(draft.fields.restaurant.value).toBe("My Favorite Noodle House");
      expect(draft.fields.restaurant.isManuallyEdited).toBe(true);
      expect(draft.fields.priceCad.value).toBe(11.0);
      expect(draft.fields.priceCad.isManuallyEdited).toBe(true);

      // Calling ACCEPT_ALL_SUGGESTIONS does NOT overwrite manual edits
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      expect(draft.fields.restaurant.value).toBe("My Favorite Noodle House");
      expect(draft.fields.priceCad.value).toBe(11.0);
    });
  });

  describe("no unchecked publish / unknown pin (no uncheckedpublish/unknownpin)", () => {
    it("strictly blocks publishing without explicit location confirmation and resets pin on address edit", () => {
      const extraction = makeSyntheticReelExtraction();
      const { drafts } = reelExtractionToDealDrafts(extraction);
      let draft = drafts[0];

      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });

      // No pin confirmed yet -> publishing strictly fails
      expect(draft.location).toBeNull();
      expect(validateForPublish(draft).valid).toBe(false);
      expect(validateForPublish(draft).errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Coordinates (lat, lng) must be explicitly confirmed"),
        ])
      );
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);

      // Confirm valid coordinates
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.2827,
        lng: -123.1207,
      });
      expect(draft.location?.confirmed).toBe(true);
      // Confirmed pin alone is not enough: the legacy source review is still open
      expect(validateForPublish(draft).valid).toBe(false);
      draft = resolveLegacyReview(draft);
      expect(validateForPublish(draft).valid).toBe(true);

      // Editing address invalidates confirmed pin
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "address",
        value: "1400 Robson St",
      });
      expect(draft.location).toBeNull();
      expect(validateForPublish(draft).valid).toBe(false);
    });
  });

  describe("separate multi-offers (separatemulti-offers)", () => {
    it("creates isolated drafts with distinct review issues for multi-deal reels", () => {
      const multiDealExtraction = makeSyntheticReelExtraction({
        drafts: [
          {
            restaurant: "Pub Deal 0",
            address: "100 Main St",
            dealText: "Afternoon wings $5",
            price: 5,
            currency: "CAD",
            validDays: ["mon", "tue"],
            validStart: "14:00",
            validEnd: "17:00",
            expiresOn: null,
            conditions: [],
          },
          {
            restaurant: "Pub Deal 1",
            address: "100 Main St",
            dealText: "Late night nachos $10 USD",
            price: 10,
            currency: "USD", // Unverified currency
            validDays: ["fri", "sat"],
            validStart: "22:00",
            validEnd: "23:59",
            expiresOn: null,
            conditions: [],
          },
        ],
      });

      const { drafts } = reelExtractionToDealDrafts(multiDealExtraction);
      expect(drafts).toHaveLength(2);
      const [draft0, draft1] = drafts;

      // Draft 0: CAD price, no currency issue
      expect(draft0.fields.dealText.suggestion?.value).toBe("Afternoon wings $5");
      expect(draft0.fields.priceCad.suggestion?.value).toBe(5);
      expect(draft0.reviewIssues.map((i) => i.detail)).toEqual([LEGACY_CONSTRAINT_REVIEW_DETAIL]);

      // Draft 1: USD price, has CURRENCY_UNVERIFIED issue
      expect(draft1.fields.dealText.suggestion?.value).toBe("Late night nachos $10 USD");
      expect(draft1.fields.priceCad.suggestion).toBeUndefined();
      expect(draft1.reviewIssues).toHaveLength(2);
      expect(draft1.reviewIssues.map((i) => i.code).sort()).toEqual(["CURRENCY_UNVERIFIED", "UNSUPPORTED_CONSTRAINT"]);
      expect(draft1.reviewIssues.find((i) => i.detail === LEGACY_CONSTRAINT_REVIEW_DETAIL)?.dealIndex).toBe(1);

      // Mutating Draft 0 does NOT touch Draft 1
      const modifiedDraft0 = dealDraftReducer(draft0, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Modified Restaurant 0",
      });
      expect(modifiedDraft0.fields.restaurant.value).toBe("Modified Restaurant 0");
      expect(draft1.fields.restaurant.suggestion?.value).toBe("Pub Deal 1");
      expect(draft1.fields.restaurant.value).toBeNull();
    });
  });

  describe("immutable evidence sidecar (immutableevidence)", () => {
    it("preserves cloned evidence sidecar without fake confidence and reports contract gaps", () => {
      const extraction = makeSyntheticReelExtraction();
      const { drafts, sidecar } = reelExtractionToDealDrafts(extraction, {
        sourceUrl: "https://instagram.com/reel/C123fakeReel/",
        imageId: "img_reel_999",
      });

      const draft = drafts[0];

      // NO fake four-zero or 0.5 confidence scores
      expect(draft.fields.restaurant.suggestion?.confidence).toBeUndefined();
      expect(draft.fields.priceCad.suggestion?.confidence).toBeUndefined();
      expect(draft.fields.validStart.suggestion?.confidence).toBeUndefined();
      expect(draft.fields.expiresOn.suggestion?.confidence).toBeUndefined();

      // Sidecar has evidence, transcript, and explicit contract gaps
      expect(sidecar.evidence).toEqual(extraction.evidence);
      expect(sidecar.transcript).toBe(extraction.transcript);
      expect(sidecar.contractGaps).toEqual(REEL_EXTRACTION_CONTRACT_GAPS);

      // Provenance passed through
      expect(draft.sourceUrl).toBe("https://instagram.com/reel/C123fakeReel/");
      expect(draft.imageId).toBe("img_reel_999");

      // Modifying sidecar does not mutate the original extraction
      sidecar.warnings.push("new warning");
      expect(extraction.warnings).toHaveLength(0);
    });
  });
});
