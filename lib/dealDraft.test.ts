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

  describe("SET_FIELD array cloning", () => {
    it("clones incoming array values so caller mutation does not leak into draft state", () => {
      const initialDays: ("mon" | "wed" | "fri")[] = ["mon", "wed"];
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "validDays",
        value: initialDays,
      });

      expect(draft.fields.validDays.value).toEqual(["mon", "wed"]);

      // Mutate original array
      initialDays.push("fri");

      // Draft state must remain unaffected
      expect(draft.fields.validDays.value).toEqual(["mon", "wed"]);
    });
  });

  describe("reviewer blocker: populated initial fields require explicit review", () => {
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
      prefilled = dealDraftReducer(prefilled, {
        type: "CONFIRM_LOCATION",
        lat: 49.28,
        lng: -123.12,
      });

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

  describe("reviewer blocker: unconditional sourceRevision and pending status checks", () => {
    it("rejects finish actions when extraction is not in pending status", () => {
      let draft = createDraft();
      // Extraction status is idle (not pending)
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-idle",
        sourceRevision: 0,
        result: { isDeal: true, deals: [syntheticOffer1] },
      });

      expect(draft.fields.restaurant.suggestion).toBeUndefined();
      expect(draft.extraction.status).toBe("idle");
    });

    it("rejects finish actions when sourceRevision does not match current revision", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      expect(draft.extraction.sourceRevision).toBe(1);

      // User changes context, bumping revision to 2
      draft = dealDraftReducer(draft, {
        type: "INVALIDATE_SOURCE_CONTEXT",
      });
      expect(draft.extraction.sourceRevision).toBe(2);

      // Re-trigger start extraction with same requestId
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      expect(draft.extraction.sourceRevision).toBe(3);

      // Stale finish action with old revision 1 is rejected
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-1",
        sourceRevision: 1,
        result: { isDeal: true, deals: [syntheticOffer1] },
      });
      expect(draft.fields.restaurant.suggestion).toBeUndefined();

      // Current revision 3 succeeds
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-1",
        sourceRevision: 3,
        result: { isDeal: true, deals: [syntheticOffer1] },
      });
      expect(draft.fields.restaurant.suggestion?.value).toBe(syntheticOffer1.restaurant);
    });

    it("START_EXTRACTION with changed image or sourceUrl invalidates suggestions and choices while preserving manual edits", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Manually Entered Diner",
      });

      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
        imageId: "img_first",
      });
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-1",
        sourceRevision: draft.extraction.sourceRevision,
        result: { isDeal: true, deals: [syntheticOffer1, syntheticOffer2] },
      });

      expect(draft.extraction.unselectedOffers?.length).toBe(2);

      // New extraction starts with a different image
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-2",
        imageId: "img_second",
      });

      // Previous offer choices and suggestions cleared, manual edit preserved
      expect(draft.extraction.unselectedOffers).toBeUndefined();
      expect(draft.fields.restaurant.value).toBe("Manually Entered Diner");
      expect(draft.fields.restaurant.isManuallyEdited).toBe(true);
      expect(draft.imageId).toBe("img_second");
    });
  });

  describe("reviewer blocker: preservation of unresolved reviewIssues", () => {
    it("does not drop unresolved review issues when source changes, retry returns no-deal, or extraction omits notes", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-with-issues",
      });
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-with-issues",
        sourceRevision: draft.extraction.sourceRevision,
        result: {
          isDeal: true,
          deals: [syntheticOffer1],
          manualReview: [
            {
              dealIndex: 0,
              code: "UNSUPPORTED_CONSTRAINT",
              detail: "Cash only and student badge required",
            },
          ],
        },
      });

      expect(draft.reviewIssues.length).toBe(1);
      const originalIssueId = draft.reviewIssues[0].id;

      // Source URL changes
      draft = dealDraftReducer(draft, {
        type: "SET_SOURCE_URL",
        sourceUrl: "https://instagram.com/p/new_url_999",
      });
      expect(draft.reviewIssues.length).toBe(1);
      expect(draft.reviewIssues[0].id).toBe(originalIssueId);

      // Retry returns no deal
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-retry",
      });
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-retry",
        sourceRevision: draft.extraction.sourceRevision,
        result: { isDeal: false, deals: [] },
      });
      expect(draft.reviewIssues.length).toBe(1);

      // New extraction succeeds but omits notes
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-notes-omitted",
      });
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-notes-omitted",
        sourceRevision: draft.extraction.sourceRevision,
        result: { isDeal: true, deals: [syntheticOffer2] },
      });

      // Existing constraint issue is strictly preserved
      expect(draft.reviewIssues.some((iss) => iss.code === "UNSUPPORTED_CONSTRAINT")).toBe(true);
    });
  });

  describe("reviewer blocker: RESOLVE_REVIEW_ISSUE redesign and FUTURE_START hard blocker", () => {
    it("refuses to resolve FUTURE_START issues (named hard blocker that prevents publishing)", () => {
      let draft = createValidConfirmedDraft();
      draft = {
        ...draft,
        reviewIssues: [
          {
            id: "issue-future-start-1",
            code: "FUTURE_START",
            detail: "Starts 2026-12-01",
            resolved: false,
            blocking: true,
          },
        ],
      };

      // Attempting to resolve FUTURE_START is refused
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: "issue-future-start-1",
        resolutionNote: "Attempt to override future start",
      });

      expect(draft.reviewIssues[0].resolved).toBe(false);

      const validation = validateForPublish(draft);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Hard blocker: future-start deal"))).toBe(true);
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);
    });

    it("requires a non-empty resolution note to resolve UNSUPPORTED_CONSTRAINT", () => {
      let draft = createValidConfirmedDraft();
      draft = {
        ...draft,
        reviewIssues: [
          {
            id: "issue-unsupported-1",
            code: "UNSUPPORTED_CONSTRAINT",
            detail: "Must show app on entry",
            resolved: false,
            blocking: true,
          },
        ],
      };

      // Attempting to resolve with empty note is rejected
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: "issue-unsupported-1",
        resolutionNote: "   ",
      });
      expect(draft.reviewIssues[0].resolved).toBe(false);

      // Resolving with meaningful note succeeds
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: "issue-unsupported-1",
        resolutionNote: "Added rule to condition list",
      });
      expect(draft.reviewIssues[0].resolved).toBe(true);
      expect(draft.reviewIssues[0].resolutionNote).toBe("Added rule to condition list");
      expect(validateForPublish(draft).valid).toBe(true);
    });

    it("does not allow generic resolve to bypass CURRENCY_UNVERIFIED manual price confirmation", () => {
      let draft = createValidConfirmedDraft();
      draft = {
        ...draft,
        fields: {
          ...draft.fields,
          priceCad: { ...draft.fields.priceCad, isManuallyEdited: false },
        },
        reviewIssues: [
          {
            id: "issue-curr-1",
            code: "CURRENCY_UNVERIFIED",
            detail: "Currency sign missing or ambiguous",
            resolved: false,
            blocking: true,
          },
        ],
      };

      // Generic resolve action on CURRENCY_UNVERIFIED is refused
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: "issue-curr-1",
        resolutionNote: "I think it is CAD",
      });
      expect(draft.reviewIssues[0].resolved).toBe(false);
      expect(validateForPublish(draft).valid).toBe(false);

      // Explicit manual confirmation of price satisfies requirement
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "priceCad",
        value: 14.5,
      });
      expect(validateForPublish(draft).valid).toBe(true);
    });
  });

  describe("reviewer blocker: multiple offers produce independent editable drafts", () => {
    it("createDraftsFromOffers creates isolated draft instances with cloned arrays and bound review notes", () => {
      const drafts = createDraftsFromOffers([syntheticOffer1, syntheticOffer2], {
        sourceUrl: "https://instagram.com/p/multiple",
        manualReview: [
          { dealIndex: 1, code: "FUTURE_START", detail: "Offer 2 future start" },
        ],
      });

      expect(drafts.length).toBe(2);
      expect(drafts[0].fields.restaurant.suggestion?.value).toBe(syntheticOffer1.restaurant);
      expect(drafts[1].fields.restaurant.suggestion?.value).toBe(syntheticOffer2.restaurant);

      expect(drafts[0].reviewIssues.length).toBe(0);
      expect(drafts[1].reviewIssues.length).toBe(1);
      expect(drafts[1].reviewIssues[0].code).toBe("FUTURE_START");

      // Mutate draft 0 by accepting suggestions and setting field
      const mutatedDraft0 = dealDraftReducer(drafts[0], {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Mutated Draft 0 Only",
      });

      // Draft 1 remains completely isolated
      expect(mutatedDraft0.fields.restaurant.value).toBe("Mutated Draft 0 Only");
      expect(drafts[1].fields.restaurant.value).toBeNull();
      expect(drafts[1].fields.restaurant.suggestion?.value).toBe(syntheticOffer2.restaurant);
    });
  });

  describe("regression coverage: confidence scores", () => {
    it("retains only canonical confidence scores and keeps absent scores absent (no default 0.5)", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-conf",
      });
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-conf",
        sourceRevision: draft.extraction.sourceRevision,
        result: { isDeal: true, deals: [syntheticOffer1] },
      });

      expect(draft.fields.restaurant.suggestion?.confidence).toBe(0.95);
      expect(draft.fields.priceCad.suggestion?.confidence).toBe(0.88);
      expect(draft.fields.validStart.suggestion?.confidence).toBe(0.75);
      expect(draft.fields.expiresOn.suggestion?.confidence).toBe(0.6);

      // Fields without canonical confidence stay undefined
      expect(draft.fields.address.suggestion?.confidence).toBeUndefined();
      expect(draft.fields.dealText.suggestion?.confidence).toBeUndefined();
      expect(draft.fields.validDays.suggestion?.confidence).toBeUndefined();
      expect(draft.fields.conditions.suggestion?.confidence).toBeUndefined();
    });
  });

  describe("regression coverage: manual edits survive late results and retries", () => {
    it("never overwrites manual edits made before extraction completes", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "User Owned Restaurant",
      });

      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-1",
        sourceRevision: draft.extraction.sourceRevision,
        result: {
          isDeal: true,
          deals: [syntheticOffer1],
        },
      });

      expect(draft.fields.restaurant.value).toBe("User Owned Restaurant");
      expect(draft.fields.restaurant.isManuallyEdited).toBe(true);
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
        sourceRevision: draft.extraction.sourceRevision,
        error: "Network timeout",
      });

      expect(draft.fields.restaurant.value).toBe("Resilient Diner");
      expect(draft.extraction.status).toBe("error");
      expect(draft.extraction.error).toBe("Network timeout");
    });
  });

  describe("regression coverage: canonical serialization and null conversion", () => {
    it("produces canonical create fields only; converts null to undefined; omits draft markers", () => {
      const draft = createValidConfirmedDraft();
      const fields = buildPublishFields(draft);

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

      expect("authorId" in fields).toBe(false);
      expect("stillOnCount" in fields).toBe(false);
      expect("expiredCount" in fields).toBe(false);
      expect("confidence" in fields).toBe(false);
      expect("isDraft" in fields).toBe(false);
      expect("fields" in fields).toBe(false);
      expect("extraction" in fields).toBe(false);
    });

    it("converts reviewed empty optional fields to undefined (omitted) in publish output", () => {
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
    it("invalidates location when address or restaurant is edited", () => {
      let draft = createValidConfirmedDraft();
      expect(draft.location?.confirmed).toBe(true);

      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "address",
        value: "999 Changed Ave",
      });

      expect(draft.location).toBeNull();
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);

      // Re-confirm
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.2,
        lng: -123.1,
      });
      expect(draft.location?.confirmed).toBe(true);

      // Restaurant change also invalidates
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "New Restaurant Name",
      });
      expect(draft.location).toBeNull();
    });
  });
});
