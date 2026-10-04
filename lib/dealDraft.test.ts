import { describe, expect, it } from "vitest";
import {
  buildPublishFields,
  createDraft,
  dealDraftReducer,
  DealDraft,
  DealOffer,
  DraftValidationError,
  isValidCalendarDate,
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
  describe("pure helpers: calendar and time validation", () => {
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

  describe("late success/error preserves manual edits", () => {
    it("never overwrites manual edits made before extraction completes", () => {
      let draft = createDraft();
      // User manually enters restaurant before extraction finishes
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "User Owned Restaurant",
      });

      // Late extraction succeeds with a different restaurant
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-1",
        result: {
          isDeal: true,
          deals: [syntheticOffer1],
        },
      });

      // Restaurant must remain the manually edited value
      expect(draft.fields.restaurant.value).toBe("User Owned Restaurant");
      expect(draft.fields.restaurant.isManuallyEdited).toBe(true);
      // Untouched field (dealText) receives the suggestion
      expect(draft.fields.dealText.suggestion?.value).toBe(syntheticOffer1.dealText);
    });

    it("preserves manual edits when extraction errors arrive", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Resilient Diner",
      });

      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_ERROR",
        requestId: "req-1",
        error: "Network timeout",
      });

      expect(draft.fields.restaurant.value).toBe("Resilient Diner");
      expect(draft.extraction.status).toBe("error");
      expect(draft.extraction.error).toBe("Network timeout");
    });
  });

  describe("stale, canceled, and retried extractions", () => {
    it("ignores results from canceled extraction requests", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      draft = dealDraftReducer(draft, {
        type: "CANCEL_EXTRACTION",
        requestId: "req-1",
      });

      // Late arrival of canceled request
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-1",
        result: { isDeal: true, deals: [syntheticOffer1] },
      });

      expect(draft.fields.restaurant.suggestion).toBeUndefined();
      expect(draft.extraction.status).toBe("canceled");
    });

    it("ignores superseded results when a new request is started (retry/new-source)", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      // New extraction initiated (supersedes req-1)
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-2",
      });

      // req-1 finishes late
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-1",
        result: { isDeal: true, deals: [syntheticOffer1] },
      });

      expect(draft.fields.restaurant.suggestion).toBeUndefined();
      expect(draft.extraction.currentRequestId).toBe("req-2");

      // req-2 finishes successfully
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-2",
        result: { isDeal: true, deals: [syntheticOffer2] },
      });

      expect(draft.fields.restaurant.suggestion?.value).toBe(syntheticOffer2.restaurant);
    });
  });

  describe("multiple-deal selection and non-deal path", () => {
    it("requires explicit user selection when multiple deals are returned; never silently takes first", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-multi",
      });
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-multi",
        result: {
          isDeal: true,
          deals: [syntheticOffer1, syntheticOffer2],
        },
      });

      expect(draft.extraction.unselectedOffers?.length).toBe(2);
      // Suggestions are not yet applied because offer is not chosen
      expect(draft.fields.restaurant.suggestion).toBeUndefined();

      // User selects second offer
      draft = dealDraftReducer(draft, {
        type: "SELECT_OFFER",
        offerIndex: 1,
      });

      expect(draft.fields.restaurant.suggestion?.value).toBe(syntheticOffer2.restaurant);
      expect(draft.fields.priceCad.suggestion?.value).toBe(syntheticOffer2.priceCad);
      expect(draft.extraction.unselectedOffers).toBeUndefined();
    });

    it("handles isDeal: false by leaving manual entry fully available", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-nondeal",
      });
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-nondeal",
        result: { isDeal: false, deals: [] },
      });

      expect(draft.extraction.status).toBe("no_deal_detected");

      // Manual entry operates normally
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Manual Pizza",
      });
      expect(draft.fields.restaurant.value).toBe("Manual Pizza");
    });
  });

  describe("tentative fields and suggestion acceptance", () => {
    it("does not publish while suggestions are tentative and unaccepted", () => {
      let draft = createValidConfirmedDraft();
      // Inject an unaccepted suggestion
      draft = {
        ...draft,
        fields: {
          ...draft.fields,
          restaurant: {
            ...draft.fields.restaurant,
            suggestion: { value: "Tentative Suggestion" },
          },
        },
      };

      const validation = validateForPublish(draft);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Pending suggestions"))).toBe(true);
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);
    });

    it("allows accepting individual suggestions or all suggestions", () => {
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
      expect(draft.fields.restaurant.value).toBeNull();

      // Accept individual suggestion
      draft = dealDraftReducer(draft, {
        type: "ACCEPT_SUGGESTION",
        field: "restaurant",
      });

      expect(draft.fields.restaurant.value).toBe(syntheticOffer1.restaurant);
      expect(draft.fields.restaurant.suggestion).toBeUndefined();

      // Accept all remaining suggestions
      draft = dealDraftReducer(draft, {
        type: "ACCEPT_ALL_SUGGESTIONS",
      });

      expect(draft.fields.dealText.value).toBe(syntheticOffer1.dealText);
      expect(draft.fields.dealText.suggestion).toBeUndefined();
    });
  });

  describe("missing optional data reviewed omission", () => {
    it("rejects unreviewed missing optional fields (price, hours, expiry, empty days, empty conditions)", () => {
      const draft = createDraft();
      // Set required fields only
      const incomplete = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Minimalist Cafe",
      });
      const withText = dealDraftReducer(incomplete, {
        type: "SET_FIELD",
        field: "dealText",
        value: "Free water",
      });
      const withLoc = dealDraftReducer(withText, {
        type: "CONFIRM_LOCATION",
        lat: 49.2827,
        lng: -123.1207,
      });

      const validation = validateForPublish(withLoc);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Missing address"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Missing price"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Missing hours"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Missing expiration date"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Empty weekdays"))).toBe(true);
      expect(validation.errors.some((e) => e.includes("Empty conditions"))).toBe(true);
    });

    it("succeeds when missing optional fields are explicitly reviewed", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Food Truck",
      });
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "dealText",
        value: "Surprise special",
      });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.2827,
        lng: -123.1207,
      });

      // Explicitly review all omissible fields
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "address" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "priceCad" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "hours" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "expiresOn" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "validDays" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "conditions" });

      const fields = buildPublishFields(draft);
      expect(fields.restaurant).toBe("Food Truck");
      expect(fields.dealText).toBe("Surprise special");
      expect(fields.address).toBeUndefined();
      expect(fields.priceCad).toBeUndefined();
      expect(fields.validStart).toBeUndefined();
      expect(fields.validEnd).toBeUndefined();
      expect(fields.expiresOn).toBeUndefined();
      expect(fields.validDays).toEqual([]);
      expect(fields.conditions).toEqual([]);
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

    it("allows re-confirming coordinates after address change", () => {
      let draft = createValidConfirmedDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "address",
        value: "999 Changed Ave",
      });
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.25,
        lng: -123.1,
      });

      expect(draft.location?.confirmed).toBe(true);
      expect(draft.location?.lat).toBe(49.25);
      expect(() => buildPublishFields(draft)).not.toThrow();
    });
  });

  describe("strict field format validation", () => {
    it("rejects negative priceCad", () => {
      let draft = createValidConfirmedDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "priceCad",
        value: -10,
      });

      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);
    });

    it("rejects non-real calendar date for expiresOn", () => {
      let draft = createValidConfirmedDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "expiresOn",
        value: "2026-02-29", // 2026 is non-leap
      });

      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);
    });

    it("rejects invalid time formats", () => {
      let draft = createValidConfirmedDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "validStart",
        value: "25:00",
      });

      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);
    });

    it("accepts midnight-crossing hours (e.g. 22:00 to 02:00)", () => {
      let draft = createValidConfirmedDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "validStart",
        value: "22:00",
      });
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "validEnd",
        value: "02:00",
      });

      const fields = buildPublishFields(draft);
      expect(fields.validStart).toBe("22:00");
      expect(fields.validEnd).toBe("02:00");
    });
  });

  describe("canonical serialization and null conversion", () => {
    it("produces canonical create fields only; converts null to undefined; omits draft markers", () => {
      const draft = createValidConfirmedDraft();
      const fields = buildPublishFields(draft);

      // Verify exact keys returned
      expect(fields.restaurant).toBe("Valid Cafe");
      expect(fields.dealText).toBe("Half price coffee");
      expect(fields.address).toBe("789 Pine St");
      expect(fields.priceCad).toBe(2.5);
      expect(fields.validDays).toEqual(["mon", "tue", "wed"]);
      expect(fields.validStart).toBe("08:00");
      expect(fields.validEnd).toBe("11:00");
      expect(fields.expiresOn).toBe("2026-10-31");
      expect(fields.conditions).toEqual(["One per customer"]);
      expect(fields.lat).toBe(49.2827);
      expect(fields.lng).toBe(-123.1207);

      // Verify forbidden keys are NOT present
      expect("authorId" in fields).toBe(false);
      expect("stillOnCount" in fields).toBe(false);
      expect("expiredCount" in fields).toBe(false);
      expect("confidence" in fields).toBe(false);
      expect("isDraft" in fields).toBe(false);
      expect("fields" in fields).toBe(false);
      expect("extraction" in fields).toBe(false);
    });
  });
});
