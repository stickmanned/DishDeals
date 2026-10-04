import { describe, expect, it } from "vitest";
import {
  buildPublishFields,
  createDraft,
  createDraftsFromOffers,
  dealDraftReducer,
  DealDraft,
  DealOffer,
  DraftValidationError,
  isValidCalendarDate,
  isValidSourceUrl,
  isValidTimeString,
  validateCoordinates,
  validateForPublish,
} from "./dealDraft";

const syntheticOffer1: DealOffer = {
  restaurant: "Synthetic Sushi",
  address: "123 Main St, Vancouver",
  dealText: "Buy 1 roll get 1 free roll",
  priceCad: 15.5,
  validDays: ["mon", "wed", "fri"],
  validStart: "11:30",
  validEnd: "14:30",
  expiresOn: "2026-12-31",
  conditions: ["Dine in only"],
  confidence: {
    restaurant: 0.95,
    priceCad: 0.88,
    hours: 0.75,
    expiresOn: 0.6,
  },
};

const syntheticOffer2: DealOffer = {
  restaurant: "Synthetic Taco Bar",
  address: "456 Oak St, Burnaby",
  dealText: "$3 Tacos all day",
  priceCad: 3.0,
  validDays: ["tue"],
  validStart: "12:00",
  validEnd: "22:00",
  expiresOn: "2026-11-30",
  conditions: ["Beverage purchase required"],
  confidence: {
    restaurant: 0.9,
    priceCad: 0.92,
    hours: 0.8,
    expiresOn: 0.5,
  },
};

function createValidConfirmedDraft(): DealDraft {
  let draft = createDraft();
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "restaurant",
    value: "Valid Cafe",
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "dealText",
    value: "Half price coffee",
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "address",
    value: "789 Pine St",
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "priceCad",
    value: 2.5,
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "validDays",
    value: ["mon", "tue", "wed"],
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "validStart",
    value: "08:00",
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "validEnd",
    value: "11:00",
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "expiresOn",
    value: "2026-10-31",
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "conditions",
    value: ["One per customer"],
  });
  draft = dealDraftReducer(draft, {
    type: "CONFIRM_LOCATION",
    lat: 49.2827,
    lng: -123.1207,
  });
  return draft;
}

describe("dealDraft", () => {
  describe("pure helpers: calendar, time, source URL, coordinates", () => {
    it("validates strict 24-hour time strings (HH:MM)", () => {
      expect(isValidTimeString("00:00")).toBe(true);
      expect(isValidTimeString("09:30")).toBe(true);
      expect(isValidTimeString("14:45")).toBe(true);
      expect(isValidTimeString("23:59")).toBe(true);

      expect(isValidTimeString("24:00")).toBe(false);
      expect(isValidTimeString("12:60")).toBe(false);
      expect(isValidTimeString("9:30")).toBe(false);
      expect(isValidTimeString("invalid")).toBe(false);
    });

    it("validates strict real calendar dates (YYYY-MM-DD)", () => {
      expect(isValidCalendarDate("2026-12-31")).toBe(true);
      expect(isValidCalendarDate("2024-02-29")).toBe(true); // 2024 is leap year
      expect(isValidCalendarDate("2026-02-28")).toBe(true);

      // 2026 is NOT a leap year
      expect(isValidCalendarDate("2026-02-29")).toBe(false);
      // April has only 30 days
      expect(isValidCalendarDate("2026-04-31")).toBe(false);
      expect(isValidCalendarDate("2026-13-01")).toBe(false);
      expect(isValidCalendarDate("invalid-date")).toBe(false);
    });

    it("validates safe source URL (http/https only, no credentials, no javascript/data/file)", () => {
      expect(isValidSourceUrl("https://instagram.com/p/C3fakePost")).toBe(true);
      expect(isValidSourceUrl("http://example.com/deals/1")).toBe(true);

      expect(isValidSourceUrl("javascript:alert(1)")).toBe(false);
      expect(isValidSourceUrl("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBe(
        false
      );
      expect(isValidSourceUrl("file:///etc/passwd")).toBe(false);
      expect(isValidSourceUrl("https://user:password@example.com/post")).toBe(false);
      expect(isValidSourceUrl("not-a-url")).toBe(false);
    });

    it("validates finite coordinate boundaries with RangeError", () => {
      expect(() => validateCoordinates(49.2827, -123.1207)).not.toThrow();
      expect(() => validateCoordinates(90, 180)).not.toThrow();
      expect(() => validateCoordinates(-90, -180)).not.toThrow();

      expect(() => validateCoordinates(90.1, 0)).toThrow(RangeError);
      expect(() => validateCoordinates(-90.1, 0)).toThrow(RangeError);
      expect(() => validateCoordinates(0, 180.1)).toThrow(RangeError);
      expect(() => validateCoordinates(0, -180.1)).toThrow(RangeError);
      expect(() => validateCoordinates(NaN, 0)).toThrow(RangeError);
      expect(() => validateCoordinates(0, Infinity)).toThrow(RangeError);
    });
  });

  describe("reviewer blocker 1: populated initial fields require explicit review", () => {
    it("blocks an entirely prefilled unreviewed draft from publishing even with confirmed pin", () => {
      let prefilled = createDraft({
        restaurant: "Prefilled Restaurant",
        dealText: "Prefilled Deal",
        address: "100 Initial St",
        priceCad: 12.0,
        validDays: ["mon", "tue"],
        validStart: "10:00",
        validEnd: "14:00",
        expiresOn: "2026-12-31",
        conditions: ["Dine in"],
      });
      // Confirm location
      prefilled = dealDraftReducer(prefilled, {
        type: "CONFIRM_LOCATION",
        lat: 49.28,
        lng: -123.12,
      });

      // Must fail because NONE of the prefilled fields have been reviewed
      const validation = validateForPublish(prefilled);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Restaurant name must be explicitly reviewed"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Deal text must be explicitly reviewed"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Address must be explicitly reviewed"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Price must be explicitly reviewed"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Start time must be explicitly reviewed"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("End time must be explicitly reviewed"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Expiration date must be explicitly reviewed"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Valid days must be explicitly reviewed"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Conditions must be explicitly reviewed"))).toBe(true);
      expect(() => buildPublishFields(prefilled)).toThrow(DraftValidationError);

      // Explicitly reviewing the prefilled fields allows publishing
      let reviewed = prefilled;
      const keys = [
        "restaurant",
        "dealText",
        "address",
        "priceCad",
        "validStart",
        "validEnd",
        "expiresOn",
        "validDays",
        "conditions",
      ] as const;
      for (const k of keys) {
        reviewed = dealDraftReducer(reviewed, { type: "REVIEW_FIELD", field: k });
      }

      expect(validateForPublish(reviewed).valid).toBe(true);
      expect(() => buildPublishFields(reviewed)).not.toThrow();
    });
  });

  describe("reviewer blocker 2: source revision and context invalidation", () => {
    it("pins async results to both requestId and sourceRevision; rejects reused ID with stale revision", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-fixed-id",
      });
      expect(draft.extraction.sourceRevision).toBe(1);

      // Context changes (e.g. caption updated), incrementing revision to 2
      draft = dealDraftReducer(draft, {
        type: "INVALIDATE_SOURCE_CONTEXT",
        reason: "User changed Instagram caption text",
      });
      expect(draft.extraction.sourceRevision).toBe(2);

      // Late response arrives with same requestId but stale revision 1
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-fixed-id",
        sourceRevision: 1,
        result: { isDeal: true, deals: [syntheticOffer1] },
      });

      // Stale revision must be ignored!
      expect(draft.fields.restaurant.suggestion).toBeUndefined();
    });

    it("invalidates in-flight extraction and clears unaccepted suggestions when imageId or sourceUrl changes", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-1",
        result: { isDeal: true, deals: [syntheticOffer1] },
      });
      expect(draft.fields.restaurant.suggestion?.value).toBe(syntheticOffer1.restaurant);

      // User changes image
      draft = dealDraftReducer(draft, {
        type: "SET_IMAGE_ID",
        imageId: "storage_new_image_123",
      });

      // Pending suggestions from old image are cleared
      expect(draft.fields.restaurant.suggestion).toBeUndefined();
      expect(draft.extraction.sourceRevision).toBe(2);
    });

    it("preserves manually edited and accepted values across source context invalidations", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Confirmed Manual Cafe",
      });

      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      draft = dealDraftReducer(draft, {
        type: "INVALIDATE_SOURCE_CONTEXT",
      });

      expect(draft.fields.restaurant.value).toBe("Confirmed Manual Cafe");
      expect(draft.fields.restaurant.isManuallyEdited).toBe(true);
    });
  });

  describe("reviewer blocker 3: validateForPublish blocks pending extraction", () => {
    it("blocks publishing while extraction status is pending", () => {
      let draft = createValidConfirmedDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-in-flight",
      });

      const validation = validateForPublish(draft);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Cannot publish while extraction is in progress"))).toBe(true);
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);

      // Canceling extraction allows publishing
      draft = dealDraftReducer(draft, {
        type: "CANCEL_EXTRACTION",
      });
      expect(validateForPublish(draft).valid).toBe(true);
      expect(() => buildPublishFields(draft)).not.toThrow();
    });
  });

  describe("reviewer blocker 4: manualReview sidecar preserves future-start and unsupported constraints", () => {
    it("blocks publish on unresolved FUTURE_START and UNSUPPORTED_CONSTRAINT issues; accept-all cannot override", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-sidecar",
      });
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-sidecar",
        result: {
          isDeal: true,
          deals: [syntheticOffer1],
          manualReview: [
            {
              dealIndex: 0,
              code: "FUTURE_START",
              detail: "Deal starts next month (2026-11-01)",
            },
            {
              dealIndex: 0,
              code: "UNSUPPORTED_CONSTRAINT",
              detail: "Requires showing student ID and paying cash",
            },
          ],
        },
      });

      // Accept all suggestions
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.28,
        lng: -123.12,
      });

      // Even with all suggestions accepted and location confirmed, reviewIssues block publish
      const validation = validateForPublish(draft);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Unresolved future-start restriction"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Unresolved provider constraint"))).toBe(true);

      // Explicit resolution of review issues allows publishing
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        code: "FUTURE_START",
        resolutionNote: "Acknowledged future start",
      });
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        code: "UNSUPPORTED_CONSTRAINT",
        resolutionNote: "Added conditions to conditions list",
      });

      expect(validateForPublish(draft).valid).toBe(true);
    });

    it("requires manual price confirmation when CURRENCY_UNVERIFIED is flagged", () => {
      let draft = createValidConfirmedDraft();
      draft = {
        ...draft,
        reviewIssues: [
          {
            code: "CURRENCY_UNVERIFIED",
            detail: "Model unverified CAD symbol",
            resolved: false,
          },
        ],
      };

      // Since priceCad was already set manually in createValidConfirmedDraft, it passes
      expect(validateForPublish(draft).valid).toBe(true);

      // But if priceCad was NOT manually edited (e.g. from suggestion), it blocks
      draft = {
        ...draft,
        fields: {
          ...draft.fields,
          priceCad: { ...draft.fields.priceCad, isManuallyEdited: false },
        },
      };

      const validation = validateForPublish(draft);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Currency is unverified"))).toBe(true);
    });
  });

  describe("reviewer blocker 5: multiple offers produce independent editable drafts", () => {
    it("createDraftsFromOffers creates isolated draft instances where editing one does not affect others", () => {
      const drafts = createDraftsFromOffers([syntheticOffer1, syntheticOffer2], {
        sourceUrl: "https://instagram.com/p/multiple",
        manualReview: [
          { dealIndex: 1, code: "FUTURE_START", detail: "Offer 2 future start" },
        ],
      });

      expect(drafts.length).toBe(2);
      expect(drafts[0].fields.restaurant.suggestion?.value).toBe(syntheticOffer1.restaurant);
      expect(drafts[1].fields.restaurant.suggestion?.value).toBe(syntheticOffer2.restaurant);

      // Offer 1 has no review issues; Offer 2 has the FUTURE_START issue
      expect(drafts[0].reviewIssues.length).toBe(0);
      expect(drafts[1].reviewIssues.length).toBe(1);
      expect(drafts[1].reviewIssues[0].code).toBe("FUTURE_START");

      // Mutate draft 0 by accepting suggestions and setting field
      const mutatedDraft0 = dealDraftReducer(drafts[0], {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Mutated Draft 0 Only",
      });

      // Draft 1 remains untouched
      expect(mutatedDraft0.fields.restaurant.value).toBe("Mutated Draft 0 Only");
      expect(drafts[1].fields.restaurant.value).toBeNull();
      expect(drafts[1].fields.restaurant.suggestion?.value).toBe(syntheticOffer2.restaurant);
    });
  });

  describe("reviewer blocker 6: safe sourceUrl validation", () => {
    it("rejects dangerous or malformed source URLs during publish validation", () => {
      let draft = createValidConfirmedDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_SOURCE_URL",
        sourceUrl: "javascript:evil()",
      });

      const validation = validateForPublish(draft);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("sourceUrl must be a valid http or https URL"))).toBe(true);
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);

      // Safe URL passes
      draft = dealDraftReducer(draft, {
        type: "SET_SOURCE_URL",
        sourceUrl: "https://instagram.com/p/safe_post_123",
      });
      expect(validateForPublish(draft).valid).toBe(true);
      const fields = buildPublishFields(draft);
      expect(fields.sourceUrl).toBe("https://instagram.com/p/safe_post_123");
    });
  });

  describe("address and restaurant edits invalidate confirmed location", () => {
    it("invalidates location when address is edited", () => {
      let draft = createValidConfirmedDraft();
      expect(draft.location?.confirmed).toBe(true);

      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "address",
        value: "999 Changed Ave",
      });

      expect(draft.location).toBeNull();
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);
    });

    it("invalidates location when restaurant is edited", () => {
      let draft = createValidConfirmedDraft();
      expect(draft.location?.confirmed).toBe(true);

      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Different Restaurant",
      });

      expect(draft.location).toBeNull();
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);
    });
  });
});
