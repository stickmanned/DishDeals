import { describe, expect, it } from "vitest";
import {
  extractOutcomeToDrafts,
  applyOutcomeToDraft,
  applyOutcomeErrorToDraft,
  validateExtractOutcome,
  ExtractionDraftAdapterError,
} from "../../lib/extractionDraft";
import {
  createDraft,
  dealDraftReducer,
  buildPublishFields,
  validateForPublish,
  DraftValidationError,
  type Weekday,
} from "../../lib/dealDraft";
import {
  extractDealCore,
  type ExtractConfig,
  type ExtractOutcome,
} from "../../lib/extractCore";
import { validNow } from "../../lib/validNow";
import { selectDeals } from "../../lib/dealSelection";

// ---------------------------------------------------------------------------
// Synthetic test fixtures & mock transport (no live network / provider)
// ---------------------------------------------------------------------------

const SYNTHETIC_API_KEY = "test-synthetic-gemini-key";
const SYNTHETIC_NOW = () => new Date("2026-10-03T20:00:00Z"); // Vancouver local time 13:00 Saturday

function createSyntheticCandidateBody(payload: unknown, finishReason = "STOP") {
  return {
    candidates: [
      {
        finishReason,
        content: {
          parts: [{ text: JSON.stringify(payload) }],
        },
      },
    ],
  };
}

function createSyntheticTransport(payload: unknown, status = 200) {
  const responseBody = createSyntheticCandidateBody(payload);
  const fetchFn = (async () => {
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;

  const config: ExtractConfig = {
    apiKey: SYNTHETIC_API_KEY,
    fetch: fetchFn,
    now: SYNTHETIC_NOW,
    sleep: async () => {},
  };

  return { config };
}

function makeValidSyntheticOutcome(overrides: Partial<ExtractOutcome> = {}): ExtractOutcome {
  return {
    result: {
      isDeal: true,
      deals: [
        {
          restaurant: "Ramen Danbo",
          address: "1333 Robson St, Vancouver, BC",
          dealText: "Gyoza combo special $12.50",
          priceCad: 12.5,
          validDays: ["mon", "tue", "wed", "thu", "fri"],
          validStart: "11:00",
          validEnd: "15:00",
          expiresOn: "2026-12-31",
          conditions: ["dine-in only"],
          confidence: {
            restaurant: 0.95,
            priceCad: 0.9,
            hours: 0.85,
            expiresOn: 0.7,
          },
        },
      ],
    },
    manualReview: [],
    requiresBlockingReview: false,
    model: "gemini-3.8-flash",
    ...overrides,
  };
}

describe("extractionDraft adapter (T-07D)", () => {
  describe("envelope validation and rejection", () => {
    it("rejects non-object or null outcome envelopes", () => {
      expect(() => validateExtractOutcome(null)).toThrow(ExtractionDraftAdapterError);
      expect(() => validateExtractOutcome(undefined)).toThrow(ExtractionDraftAdapterError);
      expect(() => validateExtractOutcome("string")).toThrow(ExtractionDraftAdapterError);
    });

    it("rejects envelope when result does not conform to DealResult schema", () => {
      const invalid = {
        result: { isDeal: "not-a-bool", deals: [] },
        manualReview: [],
        requiresBlockingReview: false,
        model: "test-model",
      };
      expect(() => validateExtractOutcome(invalid)).toThrow(ExtractionDraftAdapterError);
    });

    it("rejects envelope when requiresBlockingReview contradicts manualReview notes", () => {
      // Case 1: notes contain blocking note, but requiresBlockingReview is false
      const inconsistent1 = makeValidSyntheticOutcome({
        manualReview: [
          {
            dealIndex: 0,
            code: "FUTURE_START",
            blocking: true,
            detail: "Starts in 2 weeks",
          },
        ],
        requiresBlockingReview: false,
      });
      expect(() => validateExtractOutcome(inconsistent1)).toThrow(
        /does not match sidecar manualReview notes/
      );

      // Case 2: notes have no blocking note, but requiresBlockingReview is true
      const inconsistent2 = makeValidSyntheticOutcome({
        manualReview: [
          {
            dealIndex: 0,
            code: "CURRENCY_UNVERIFIED",
            blocking: false,
            detail: "Price stated as $10 without currency proof",
            originalAmount: 10,
          },
        ],
        requiresBlockingReview: true,
      });
      expect(() => validateExtractOutcome(inconsistent2)).toThrow(
        /does not match sidecar manualReview notes/
      );
    });

    it("rejects manualReview note with out-of-range dealIndex", () => {
      const invalidDealIndex = makeValidSyntheticOutcome({
        manualReview: [
          {
            dealIndex: 99, // only 1 deal exists at index 0
            code: "UNSUPPORTED_CONSTRAINT",
            blocking: true,
            detail: "Constraint on non-existent deal",
          },
        ],
        requiresBlockingReview: true,
      });
      expect(() => validateExtractOutcome(invalidDealIndex)).toThrow(
        /out-of-range dealIndex/
      );

      const negativeDealIndex = makeValidSyntheticOutcome({
        manualReview: [
          {
            dealIndex: -1,
            code: "UNSUPPORTED_CONSTRAINT",
            blocking: true,
            detail: "Negative dealIndex",
          },
        ],
        requiresBlockingReview: true,
      });
      expect(() => validateExtractOutcome(negativeDealIndex)).toThrow(
        /out-of-range dealIndex/
      );
    });

    it("rejects manualReview note with invalid code or empty detail", () => {
      const invalidCode = makeValidSyntheticOutcome({
        manualReview: [
          {
            dealIndex: 0,
            code: "UNKNOWN_CODE" as unknown as "FUTURE_START",
            blocking: true,
            detail: "Something unknown",
          },
        ],
        requiresBlockingReview: true,
      });
      expect(() => validateExtractOutcome(invalidCode)).toThrow(/invalid code/);

      const emptyDetail = makeValidSyntheticOutcome({
        manualReview: [
          {
            dealIndex: 0,
            code: "UNSUPPORTED_CONSTRAINT",
            blocking: true,
            detail: "   ",
          },
        ],
        requiresBlockingReview: true,
      });
      expect(() => validateExtractOutcome(emptyDetail)).toThrow(/non-empty detail/);
    });

    it("rejects deal with non-canonical weekday strings", () => {
      const nonCanonicalWeekday = {
        result: {
          isDeal: true,
          deals: [
            {
              restaurant: "Test Bistro",
              address: null,
              dealText: "Special",
              priceCad: null,
              validDays: ["monday"] as unknown as Weekday[], // non-canonical format (should be "mon")
              validStart: null,
              validEnd: null,
              expiresOn: null,
              conditions: [],
              confidence: { restaurant: 0.8, priceCad: 0.8, hours: 0.8, expiresOn: 0.8 },
            },
          ],
        },
        manualReview: [],
        requiresBlockingReview: false,
        model: "test-model",
      };
      expect(() => validateExtractOutcome(nonCanonicalWeekday)).toThrow(
        ExtractionDraftAdapterError
      );
    });

    it("rejects envelope with missing, empty, or non-string model (missingmodel)", () => {
      const base = makeValidSyntheticOutcome();

      // Missing model key
      const missingModel = {
        result: base.result,
        manualReview: base.manualReview,
        requiresBlockingReview: base.requiresBlockingReview,
      };
      expect(() => validateExtractOutcome(missingModel)).toThrow(/missing required key: "model"/);

      // Empty or whitespace model
      expect(() => validateExtractOutcome({ ...base, model: "" })).toThrow(/non-empty string/);
      expect(() => validateExtractOutcome({ ...base, model: "   " })).toThrow(/non-empty string/);

      // Non-string model
      expect(() =>
        validateExtractOutcome({ ...base, model: 123 as unknown as string })
      ).toThrow(/non-empty string/);
    });

    it("rejects envelope with unexpected envelope keys", () => {
      const base = makeValidSyntheticOutcome();
      expect(() => validateExtractOutcome({ ...base, unexpectedProp: true })).toThrow(
        /unexpected key: "unexpectedProp"/
      );
    });

    it("rejects deal with unexpected keys like startDate (unexpectedconfidence/startDate key)", () => {
      const base = makeValidSyntheticOutcome();
      const dealWithStartDate = {
        ...base.result.deals[0],
        startDate: "2026-11-01",
      };
      const outcome = {
        ...base,
        result: {
          isDeal: true,
          deals: [dealWithStartDate],
        },
      };
      expect(() => validateExtractOutcome(outcome)).toThrow(ExtractionDraftAdapterError);
    });

    it("rejects deal with unexpected confidence dimension keys", () => {
      const base = makeValidSyntheticOutcome();
      const dealWithExtraConfidence = {
        ...base.result.deals[0],
        confidence: {
          ...base.result.deals[0].confidence,
          extraMetric: 0.8,
        },
      };
      const outcome = {
        ...base,
        result: {
          isDeal: true,
          deals: [dealWithExtraConfidence],
        },
      };
      expect(() => validateExtractOutcome(outcome)).toThrow(ExtractionDraftAdapterError);
    });

    it("rejects inconsistent isDeal and deals pairing (falseisDealwithdeals)", () => {
      const base = makeValidSyntheticOutcome();

      // isDeal: false with deals present
      const falseWithDeals = {
        ...base,
        result: {
          isDeal: false,
          deals: base.result.deals,
        },
      };
      expect(() => validateExtractOutcome(falseWithDeals)).toThrow(/inconsistent isDeal/);

      // isDeal: true with empty deals
      const trueWithEmptyDeals = {
        ...base,
        result: {
          isDeal: true,
          deals: [],
        },
      };
      expect(() => validateExtractOutcome(trueWithEmptyDeals)).toThrow(/inconsistent isDeal/);
    });

    it("rejects manualReview note with invalid originalAmount (invalidamount)", () => {
      const base = makeValidSyntheticOutcome();

      // string originalAmount
      const stringAmount = {
        ...base,
        manualReview: [
          {
            dealIndex: 0,
            code: "CURRENCY_UNVERIFIED" as const,
            blocking: false,
            detail: "Unverified price",
            originalAmount: "10.00" as unknown as number,
          },
        ],
        requiresBlockingReview: false,
      };
      expect(() => validateExtractOutcome(stringAmount)).toThrow(/invalid originalAmount/);

      // NaN originalAmount
      const nanAmount = {
        ...base,
        manualReview: [
          {
            dealIndex: 0,
            code: "CURRENCY_UNVERIFIED" as const,
            blocking: false,
            detail: "Unverified price",
            originalAmount: Number.NaN,
          },
        ],
        requiresBlockingReview: false,
      };
      expect(() => validateExtractOutcome(nanAmount)).toThrow(/invalid originalAmount/);

      // Infinity originalAmount
      const infAmount = {
        ...base,
        manualReview: [
          {
            dealIndex: 0,
            code: "CURRENCY_UNVERIFIED" as const,
            blocking: false,
            detail: "Unverified price",
            originalAmount: Number.POSITIVE_INFINITY,
          },
        ],
        requiresBlockingReview: false,
      };
      expect(() => validateExtractOutcome(infAmount)).toThrow(/invalid originalAmount/);

      // Negative originalAmount
      const negAmount = {
        ...base,
        manualReview: [
          {
            dealIndex: 0,
            code: "CURRENCY_UNVERIFIED" as const,
            blocking: false,
            detail: "Unverified price",
            originalAmount: -10,
          },
        ],
        requiresBlockingReview: false,
      };
      expect(() => validateExtractOutcome(negAmount)).toThrow(/invalid originalAmount/);
    });

    it("rejects manualReview note with wrong blocking flag for its code (wrongblockingflag)", () => {
      const base = makeValidSyntheticOutcome();

      // FUTURE_START must have blocking: true
      const futureNonBlocking = {
        ...base,
        manualReview: [
          {
            dealIndex: 0,
            code: "FUTURE_START" as const,
            blocking: false,
            detail: "Starts later",
          },
        ],
        requiresBlockingReview: false,
      };
      expect(() => validateExtractOutcome(futureNonBlocking)).toThrow(
        /must have blocking: true/
      );

      // UNSUPPORTED_CONSTRAINT must have blocking: true
      const constraintNonBlocking = {
        ...base,
        manualReview: [
          {
            dealIndex: 0,
            code: "UNSUPPORTED_CONSTRAINT" as const,
            blocking: false,
            detail: "Must show ID",
          },
        ],
        requiresBlockingReview: false,
      };
      expect(() => validateExtractOutcome(constraintNonBlocking)).toThrow(
        /must have blocking: true/
      );

      // CURRENCY_UNVERIFIED must have blocking: false
      const currencyBlocking = {
        ...base,
        manualReview: [
          {
            dealIndex: 0,
            code: "CURRENCY_UNVERIFIED" as const,
            blocking: true,
            detail: "Unverified currency",
            originalAmount: 10,
          },
        ],
        requiresBlockingReview: true,
      };
      expect(() => validateExtractOutcome(currencyBlocking)).toThrow(
        /must have blocking: false/
      );
    });

    it("does not expose a bare DealResult convenience path", () => {
      // Ensure all draft conversion requires full ExtractOutcome envelope
      const rawDealResult = makeValidSyntheticOutcome().result;
      expect(() => validateExtractOutcome(rawDealResult)).toThrow(
        ExtractionDraftAdapterError
      );
    });
  });

  describe("end-to-end integration with extractDealCore using synthetic transport", () => {
    it("extracts outcome and produces independent deal drafts with suggestions", async () => {
      const modelDealOutput = {
        isDeal: true,
        deals: [
          {
            restaurant: "Marutama Ra-men",
            address: "780 Bidwell St, Vancouver, BC",
            dealText: "Cha-shu ramen $14",
            statedPrice: 14,
            cadEvidence: "14 CAD",
            validDays: ["mon", "wed", "fri"],
            validStart: "11:30",
            validEnd: "21:00",
            expiresOn: "2026-11-30",
            startDate: null,
            conditions: ["dine-in only"],
            unsupportedConstraints: [],
            confidence: {
              restaurant: 0.96,
              priceCad: 0.92,
              hours: 0.88,
              expiresOn: 0.75,
            },
          },
        ],
      };

      const { config } = createSyntheticTransport(modelDealOutput);
      const outcome = await extractDealCore({ text: "Marutama deal post: Cha-shu ramen 14 CAD" }, config);

      expect(outcome.result.isDeal).toBe(true);
      expect(outcome.requiresBlockingReview).toBe(false);

      const drafts = extractOutcomeToDrafts(outcome, {
        sourceUrl: "https://instagram.com/p/syntheticPost1",
        imageId: "img_synth_123",
      });

      expect(drafts).toHaveLength(1);
      const draft = drafts[0];

      // Verifies all extracted fields are suggestions, not auto-accepted
      expect(draft.fields.restaurant.value).toBeNull();
      expect(draft.fields.restaurant.suggestion?.value).toBe("Marutama Ra-men");
      expect(draft.fields.restaurant.suggestion?.confidence).toBe(0.96);
      expect(draft.fields.restaurant.isReviewed).toBe(false);

      expect(draft.fields.priceCad.value).toBeNull();
      expect(draft.fields.priceCad.suggestion?.value).toBe(14);
      expect(draft.fields.priceCad.suggestion?.confidence).toBe(0.92);

      expect(draft.fields.validDays.value).toEqual([]);
      expect(draft.fields.validDays.suggestion?.value).toEqual(["mon", "wed", "fri"]);

      expect(draft.sourceUrl).toBe("https://instagram.com/p/syntheticPost1");
      expect(draft.imageId).toBe("img_synth_123");
      expect(draft.location).toBeNull();
      expect(draft.reviewIssues).toEqual([]);
    });

    it("applies extracted outcome to an existing in-flight draft via applyOutcomeToDraft", async () => {
      const modelDealOutput = {
        isDeal: true,
        deals: [
          {
            restaurant: "Japadog",
            address: "899 Robson St",
            dealText: "Kurobuta Terimayo $9.99",
            statedPrice: 9.99,
            cadEvidence: "9.99 CAD",
            validDays: ["sat", "sun"],
            validStart: "12:00",
            validEnd: "18:00",
            expiresOn: null,
            startDate: null,
            conditions: [],
            unsupportedConstraints: [],
            confidence: {
              restaurant: 0.99,
              priceCad: 0.95,
              hours: 0.9,
              expiresOn: 0.5,
            },
          },
        ],
      };

      const { config } = createSyntheticTransport(modelDealOutput);
      const outcome = await extractDealCore({ text: "Japadog weekend special: Kurobuta Terimayo 9.99 CAD" }, config);

      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-japadog-1",
      });

      expect(draft.extraction.status).toBe("pending");
      const token = {
        requestId: "req-japadog-1",
        sourceRevision: draft.extraction.sourceRevision,
      };

      draft = applyOutcomeToDraft(draft, outcome, token);

      expect(draft.extraction.status).toBe("success");
      expect(draft.fields.restaurant.suggestion?.value).toBe("Japadog");
      expect(draft.fields.priceCad.suggestion?.value).toBe(9.99);
      expect(draft.fields.validDays.suggestion?.value).toEqual(["sat", "sun"]);
    });
  });

  describe("confidence scores handling", () => {
    it("preserves exact canonical keys and never invents 0.5 scores for absent confidence", () => {
      const outcome = makeValidSyntheticOutcome();
      // Deal has restaurant, priceCad, hours, expiresOn
      outcome.result.deals[0].confidence = {
        restaurant: 0.88,
        priceCad: 0.77,
        hours: 0.66,
        expiresOn: 0.55,
      };

      const drafts = extractOutcomeToDrafts(outcome);
      const draft = drafts[0];

      expect(draft.fields.restaurant.suggestion?.confidence).toBe(0.88);
      expect(draft.fields.priceCad.suggestion?.confidence).toBe(0.77);
      expect(draft.fields.validStart.suggestion?.confidence).toBe(0.66);
      expect(draft.fields.validEnd.suggestion?.confidence).toBe(0.66);
      expect(draft.fields.expiresOn.suggestion?.confidence).toBe(0.55);

      // Address and dealText never carry fabricated confidence
      expect(draft.fields.address.suggestion?.confidence).toBeUndefined();
      expect(draft.fields.dealText.suggestion?.confidence).toBeUndefined();
    });
  });

  describe("sidecar review notes: FUTURE_START hard blocker", () => {
    it("carries FUTURE_START note, blocks publish, refuses resolve, and survives source changes", async () => {
      const modelDealOutput = {
        isDeal: true,
        deals: [
          {
            restaurant: "Future Cafe",
            address: "100 Future Way",
            dealText: "Grand opening deal $5",
            statedPrice: 5,
            cadEvidence: "5 CAD",
            validDays: ["mon"],
            validStart: "10:00",
            validEnd: "14:00",
            expiresOn: "2026-12-31",
            startDate: "2026-11-01", // Future relative to Vancouver 2026-10-03
            conditions: [],
            unsupportedConstraints: [],
            confidence: { restaurant: 0.9, priceCad: 0.9, hours: 0.9, expiresOn: 0.9 },
          },
        ],
      };

      const { config } = createSyntheticTransport(modelDealOutput);
      const outcome = await extractDealCore({ text: "Opening Nov 1st: Grand opening deal 5 CAD" }, config);

      expect(outcome.requiresBlockingReview).toBe(true);
      expect(outcome.manualReview).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "FUTURE_START", blocking: true }),
        ])
      );

      const drafts = extractOutcomeToDrafts(outcome);
      let draft = drafts[0];

      expect(draft.reviewIssues).toHaveLength(1);
      const futureIssue = draft.reviewIssues[0];
      expect(futureIssue.code).toBe("FUTURE_START");
      expect(futureIssue.blocking).toBe(true);

      // Attempting to resolve FUTURE_START is rejected by reducer
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: futureIssue.id,
        resolutionNote: "User insists it is valid now",
      });
      expect(draft.reviewIssues[0].resolved).toBe(false);

      // Accept suggestions and confirm location
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.2827,
        lng: -123.1207,
      });

      // validateForPublish reports hard blocker
      const validation = validateForPublish(draft);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("Hard blocker: future-start deal")])
      );
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);

      // Verify FUTURE_START issue survives sourceUrl change and extraction cancel
      draft = dealDraftReducer(draft, {
        type: "SET_SOURCE_URL",
        sourceUrl: "https://instagram.com/p/newUrl123",
      });
      expect(draft.reviewIssues[0].code).toBe("FUTURE_START");
      expect(draft.reviewIssues[0].resolved).toBe(false);
    });
  });

  describe("sidecar review notes: UNSUPPORTED_CONSTRAINT", () => {
    it("carries unsupported constraint, blocks publish until resolved with a non-empty note", async () => {
      const modelDealOutput = {
        isDeal: true,
        deals: [
          {
            restaurant: "Student Union Pub",
            address: "6138 Student Union Blvd",
            dealText: "Burger & fries $8",
            statedPrice: 8,
            cadEvidence: "8 CAD",
            validDays: ["thu"],
            validStart: "16:00",
            validEnd: "20:00",
            expiresOn: null,
            startDate: null,
            conditions: ["must show valid student ID at counter"],
            unsupportedConstraints: ["must show valid student ID at counter"],
            confidence: { restaurant: 0.9, priceCad: 0.9, hours: 0.9, expiresOn: 0.5 },
          },
        ],
      };

      const { config } = createSyntheticTransport(modelDealOutput);
      const outcome = await extractDealCore({ text: "Student burger night: Burger & fries 8 CAD" }, config);

      expect(outcome.requiresBlockingReview).toBe(true);

      const drafts = extractOutcomeToDrafts(outcome);
      let draft = drafts[0];

      expect(draft.reviewIssues).toHaveLength(1);
      const constraintIssue = draft.reviewIssues[0];
      expect(constraintIssue.code).toBe("UNSUPPORTED_CONSTRAINT");
      expect(constraintIssue.blocking).toBe(true);

      // Accept suggestions & confirm location
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "expiresOn" });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.2606,
        lng: -123.246,
      });

      // Still invalid because constraint is unresolved
      expect(validateForPublish(draft).valid).toBe(false);

      // Resolving with empty string is rejected
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: constraintIssue.id,
        resolutionNote: "   ",
      });
      expect(draft.reviewIssues[0].resolved).toBe(false);

      // Resolving with a meaningful note succeeds
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: constraintIssue.id,
        resolutionNote: "Confirmed open to all student cardholders on Thursdays",
      });
      expect(draft.reviewIssues[0].resolved).toBe(true);

      const publishFields = buildPublishFields(draft);
      expect(publishFields.restaurant).toBe("Student Union Pub");
      expect(publishFields.dealText).toBe("Burger & fries $8");
    });
  });

  describe("sidecar review notes: CURRENCY_UNVERIFIED", () => {
    it("preserves originalAmount, keeps canonical priceCad null, and requires manual confirmation", async () => {
      const modelDealOutput = {
        isDeal: true,
        deals: [
          {
            restaurant: "Border Taco",
            address: "Peace Arch",
            dealText: "3 tacos for $10",
            statedPrice: 10,
            cadEvidence: null, // The source names US dollars at the border
            validDays: ["tue"],
            validStart: "12:00",
            validEnd: "20:00",
            expiresOn: null,
            startDate: null,
            conditions: [],
            unsupportedConstraints: [],
            confidence: { restaurant: 0.9, priceCad: 0.3, hours: 0.8, expiresOn: 0.4 },
          },
        ],
      };

      const { config } = createSyntheticTransport(modelDealOutput);
      const outcome = await extractDealCore({ text: "Taco Tuesday US$10" }, config);

      expect(outcome.requiresBlockingReview).toBe(false); // Non-blocking sidecar
      expect(outcome.manualReview).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "CURRENCY_UNVERIFIED",
            blocking: false,
            originalAmount: 10,
          }),
        ])
      );

      const drafts = extractOutcomeToDrafts(outcome);
      let draft = drafts[0];

      // Canonical priceCad suggestion must be null; originalAmount preserved as hint
      expect(draft.fields.priceCad.suggestion?.value).toBeNull();
      const currencyIssue = draft.reviewIssues.find((i) => i.code === "CURRENCY_UNVERIFIED");
      expect(currencyIssue).toBeDefined();
      expect(currencyIssue?.originalAmount).toBe(10);

      // Accept suggestions and confirm location
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "expiresOn" });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.002,
        lng: -122.756,
      });

      // Cannot resolve CURRENCY_UNVERIFIED with RESOLVE_REVIEW_ISSUE action
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: currencyIssue!.id,
        resolutionNote: "It is CAD",
      });
      expect(draft.reviewIssues.find((i) => i.code === "CURRENCY_UNVERIFIED")?.resolved).toBe(
        false
      );

      // Validation fails until price is manually confirmed or explicitly omitted
      expect(validateForPublish(draft).valid).toBe(false);
      expect(validateForPublish(draft).errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Currency is unverified"),
        ])
      );

      // Manually confirm price in CAD
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "priceCad",
        value: 13.5, // converted or confirmed CAD price
      });

      expect(validateForPublish(draft).valid).toBe(true);
      const fields = buildPublishFields(draft);
      expect(fields.priceCad).toBe(13.5);
    });
  });

  describe("multi-offer isolation", () => {
    it("produces independent drafts for multiple offers with distinct review issues", async () => {
      const modelDealOutput = {
        isDeal: true,
        deals: [
          {
            restaurant: "Multi Pub",
            address: "123 Main St",
            dealText: "Offer 0: Happy Hour Tacos $3",
            statedPrice: 3,
            cadEvidence: "3 CAD",
            validDays: ["mon", "tue"],
            validStart: "15:00",
            validEnd: "18:00",
            expiresOn: "2026-12-31",
            startDate: null,
            conditions: ["with drink purchase"],
            unsupportedConstraints: ["with drink purchase"],
            confidence: { restaurant: 0.9, priceCad: 0.9, hours: 0.9, expiresOn: 0.9 },
          },
          {
            restaurant: "Multi Pub",
            address: "123 Main St",
            dealText: "Offer 1: Late Night Wings $9",
            statedPrice: 9,
            cadEvidence: "9 CAD",
            validDays: ["fri", "sat"],
            validStart: "22:00",
            validEnd: "23:59",
            expiresOn: "2026-12-31",
            startDate: "2026-11-15", // Future start
            conditions: [],
            unsupportedConstraints: [],
            confidence: { restaurant: 0.9, priceCad: 0.9, hours: 0.9, expiresOn: 0.9 },
          },
        ],
      };

      const { config } = createSyntheticTransport(modelDealOutput);
      const outcome = await extractDealCore({ text: "Two deals at Multi Pub: Tacos 3 CAD and Wings 9 CAD" }, config);

      expect(outcome.result.deals).toHaveLength(2);
      expect(outcome.requiresBlockingReview).toBe(true);

      const drafts = extractOutcomeToDrafts(outcome, {
        sourceUrl: "https://instagram.com/p/multiOfferPost",
      });

      expect(drafts).toHaveLength(2);
      const [draft0, draft1] = drafts;

      // Draft 0 checks
      expect(draft0.fields.dealText.suggestion?.value).toBe("Offer 0: Happy Hour Tacos $3");
      expect(draft0.reviewIssues).toHaveLength(1);
      expect(draft0.reviewIssues[0].code).toBe("UNSUPPORTED_CONSTRAINT");
      expect(draft0.reviewIssues[0].dealIndex).toBe(0);

      // Draft 1 checks
      expect(draft1.fields.dealText.suggestion?.value).toBe("Offer 1: Late Night Wings $9");
      expect(draft1.reviewIssues).toHaveLength(1);
      expect(draft1.reviewIssues[0].code).toBe("FUTURE_START");
      expect(draft1.reviewIssues[0].dealIndex).toBe(1);

      // Independence: editing Draft 0 does NOT touch Draft 1
      const editedDraft0 = dealDraftReducer(draft0, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Customized Pub 0",
      });
      expect(editedDraft0.fields.restaurant.value).toBe("Customized Pub 0");
      expect(draft1.fields.restaurant.value).toBeNull();
    });

    it("applies multi-deal extraction to in-flight draft and requires explicit offer selection", () => {
      const outcome = makeValidSyntheticOutcome({
        result: {
          isDeal: true,
          deals: [
            {
              restaurant: "Tavern A",
              address: null,
              dealText: "Deal A",
              priceCad: 5,
              validDays: ["mon"],
              validStart: null,
              validEnd: null,
              expiresOn: null,
              conditions: [],
              confidence: { restaurant: 0.9, priceCad: 0.9, hours: 0.9, expiresOn: 0.9 },
            },
            {
              restaurant: "Tavern B",
              address: null,
              dealText: "Deal B",
              priceCad: 10,
              validDays: ["tue"],
              validStart: null,
              validEnd: null,
              expiresOn: null,
              conditions: [],
              confidence: { restaurant: 0.9, priceCad: 0.9, hours: 0.9, expiresOn: 0.9 },
            },
          ],
        },
      });

      let draft = createDraft();
      draft = dealDraftReducer(draft, { type: "START_EXTRACTION", requestId: "req-multi-1" });
      const token = { requestId: "req-multi-1", sourceRevision: draft.extraction.sourceRevision };

      draft = applyOutcomeToDraft(draft, outcome, token);

      expect(draft.extraction.status).toBe("success");
      expect(draft.extraction.unselectedOffers).toHaveLength(2);
      expect(draft.extraction.selectedOfferIndex).toBeUndefined();

      // Publishing is blocked while multi-deal selection is pending
      expect(validateForPublish(draft).errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Multiple extracted deals detected"),
        ])
      );

      // Select offer 1
      draft = dealDraftReducer(draft, { type: "SELECT_OFFER", offerIndex: 1 });
      expect(draft.extraction.selectedOfferIndex).toBe(1);
      expect(draft.fields.dealText.suggestion?.value).toBe("Deal B");
    });
  });

  describe("lifecycle regressions: stale tokens, error handling, and manual edit preservation", () => {
    it("preserves manual edits when late extraction completes", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, { type: "START_EXTRACTION", requestId: "req-late" });
      const token = { requestId: "req-late", sourceRevision: draft.extraction.sourceRevision };

      // User manually types restaurant name before extraction finishes
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "My Hand-Typed Restaurant",
      });

      const outcome = makeValidSyntheticOutcome();
      draft = applyOutcomeToDraft(draft, outcome, token);

      // Manual edit is preserved, suggestion is not applied over manual edit
      expect(draft.fields.restaurant.value).toBe("My Hand-Typed Restaurant");
      expect(draft.fields.restaurant.isManuallyEdited).toBe(true);
      // Other fields still received suggestions
      expect(draft.fields.dealText.suggestion?.value).toBe("Gyoza combo special $12.50");
    });

    it("ignores results arriving with mismatched sourceRevision or requestId", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, { type: "START_EXTRACTION", requestId: "req-v1" });
      const staleToken = { requestId: "req-v1", sourceRevision: draft.extraction.sourceRevision };

      // User alters imageId, bumping revision and cancelling req-v1
      draft = dealDraftReducer(draft, { type: "SET_IMAGE_ID", imageId: "img_new_456" });
      expect(draft.extraction.sourceRevision).toBe(staleToken.sourceRevision + 1);

      const outcome = makeValidSyntheticOutcome();
      const afterStale = applyOutcomeToDraft(draft, outcome, staleToken);

      // State is untouched by the stale response
      expect(afterStale).toEqual(draft);
    });

    it("applies error with matching token and preserves manual fields", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, { type: "START_EXTRACTION", requestId: "req-err-1" });
      const token = { requestId: "req-err-1", sourceRevision: draft.extraction.sourceRevision };

      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Preserved Restaurant",
      });

      draft = applyOutcomeErrorToDraft(draft, "Rate limit reached", token);

      expect(draft.extraction.status).toBe("error");
      expect(draft.extraction.error).toBe("Rate limit reached");
      expect(draft.fields.restaurant.value).toBe("Preserved Restaurant");
    });

    it("blocks publishing while extraction is pending", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, { type: "START_EXTRACTION", requestId: "req-pending-1" });

      expect(validateForPublish(draft).valid).toBe(false);
      expect(validateForPublish(draft).errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Cannot publish while extraction is in progress"),
        ])
      );
    });

    it("handles non-deal extraction output", () => {
      const nonDealOutcome = makeValidSyntheticOutcome({
        result: {
          isDeal: false,
          deals: [],
        },
      });

      // extractOutcomeToDrafts returns a single draft with no_deal_detected status
      const drafts = extractOutcomeToDrafts(nonDealOutcome);
      expect(drafts).toHaveLength(1);
      expect(drafts[0].extraction.status).toBe("no_deal_detected");

      // In-flight draft updates status to no_deal_detected
      let draft = createDraft();
      draft = dealDraftReducer(draft, { type: "START_EXTRACTION", requestId: "req-nodeal" });
      const token = { requestId: "req-nodeal", sourceRevision: draft.extraction.sourceRevision };

      draft = applyOutcomeToDraft(draft, nonDealOutcome, token);
      expect(draft.extraction.status).toBe("no_deal_detected");
    });
  });

  describe("publish serialization, location confirmation, and downstream integration", () => {
    it("serializes valid publish fields omitting null optional properties", () => {
      const outcome = makeValidSyntheticOutcome();
      const [draft] = extractOutcomeToDrafts(outcome, {
        sourceUrl: "https://instagram.com/p/testPost",
        imageId: "img_test_1",
      });

      let ready = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      ready = dealDraftReducer(ready, {
        type: "CONFIRM_LOCATION",
        lat: 49.2827,
        lng: -123.1207,
      });

      const fields = buildPublishFields(ready);

      expect(fields.restaurant).toBe("Ramen Danbo");
      expect(fields.dealText).toBe("Gyoza combo special $12.50");
      expect(fields.priceCad).toBe(12.5);
      expect(fields.lat).toBe(49.2827);
      expect(fields.lng).toBe(-123.1207);
      expect(fields.sourceUrl).toBe("https://instagram.com/p/testPost");
      expect(fields.imageId).toBe("img_test_1");

      // Verify no backend-controlled fields are present
      expect("authorId" in fields).toBe(false);
      expect("stillOnCount" in fields).toBe(false);
      expect("expiredCount" in fields).toBe(false);
    });

    it("editing address or restaurant invalidates confirmed location", () => {
      const outcome = makeValidSyntheticOutcome();
      let draft = extractOutcomeToDrafts(outcome)[0];
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.2827,
        lng: -123.1207,
      });

      expect(draft.location?.confirmed).toBe(true);

      // Change restaurant name
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Changed Restaurant Name",
      });

      expect(draft.location).toBeNull();
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);

      // Re-confirm location
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.28,
        lng: -123.12,
      });
      expect(draft.location?.confirmed).toBe(true);
      expect(buildPublishFields(draft).restaurant).toBe("Changed Restaurant Name");
    });

    it("integrates published deal with validNow and selectDeals", () => {
      const outcome = makeValidSyntheticOutcome({
        result: {
          isDeal: true,
          deals: [
            {
              restaurant: "Saturday Bistro",
              address: "Vancouver Downtown",
              dealText: "Weekend Special $10",
              priceCad: 10,
              validDays: ["sat"],
              validStart: "12:00",
              validEnd: "16:00",
              expiresOn: "2026-12-31",
              conditions: [],
              confidence: { restaurant: 0.9, priceCad: 0.9, hours: 0.9, expiresOn: 0.9 },
            },
          ],
        },
      });

      let draft = extractOutcomeToDrafts(outcome)[0];
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.2827,
        lng: -123.1207,
      });

      const published = buildPublishFields(draft);

      // Test with validNow at Saturday 13:00 local time
      const testDate = new Date("2026-10-03T20:00:00Z"); // Sat 13:00 PDT
      const validity = validNow(published, testDate);
      expect(validity.status).toBe("valid");
      expect(validity.minutesLeft).toBe(180); // 13:00 to 16:00 = 180 min

      // Test with selectDeals (mocking stored deal shape with _id and _creationTime)
      const storedDeal = {
        _id: "deal_synth_1",
        _creationTime: 1700000000000,
        ...published,
      };

      const selected = selectDeals([storedDeal], {
        now: testDate,
        priceFilter: 15,
        userLocation: { lat: 49.28, lng: -123.12 },
      });

      expect(selected).toHaveLength(1);
      expect(selected[0].validity.status).toBe("valid");
      expect(selected[0].distanceKm).toBeDefined();
      expect(selected[0].distanceKm!).toBeGreaterThan(0);
      expect(selected[0].distanceKm!).toBeLessThan(1);
    });
  });
});
