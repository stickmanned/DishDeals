import { describe, expect, it } from "vitest";
import {
  createDraft,
  dealDraftReducer,
  buildPublishFields,
  validateForPublish,
  DraftValidationError,
  type DealDraft,
  type DealDraftAction,
  type ReviewIssue,
} from "../../lib/dealDraft";
import {
  formatConfidence,
  formatWeekday,
  getDraftPublishReadiness,
  hasPendingSuggestions,
  OMISSION_SEMANTICS,
  parsePriceInput,
  evaluateIssueResolution,
} from "../../lib/dealReviewForm";

function makeSyntheticReadyDraft(): DealDraft {
  let draft = createDraft();
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "restaurant",
    value: "Chambar Restaurant",
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "dealText",
    value: "Moules frites special $24",
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "priceCad",
    value: 24,
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "validDays",
    value: ["mon", "tue", "wed"],
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "validStart",
    value: "16:00",
  });
  draft = dealDraftReducer(draft, {
    type: "SET_FIELD",
    field: "validEnd",
    value: "18:00",
  });
  draft = dealDraftReducer(draft, {
    type: "REVIEW_OMISSION",
    field: "address",
  });
  draft = dealDraftReducer(draft, {
    type: "REVIEW_OMISSION",
    field: "expiresOn",
  });
  draft = dealDraftReducer(draft, {
    type: "REVIEW_OMISSION",
    field: "conditions",
  });
  draft = dealDraftReducer(draft, {
    type: "CONFIRM_LOCATION",
    lat: 49.281,
    lng: -123.109,
  });
  return draft;
}

describe("dealReviewForm pure helpers and state machine (N-FORM-UI)", () => {
  describe("strict price input parsing (parsePriceInput)", () => {
    it("handles empty or blank input without coercing to zero", () => {
      expect(parsePriceInput("")).toEqual({ valid: true, value: null });
      expect(parsePriceInput("   ")).toEqual({ valid: true, value: null });
    });

    it("parses valid non-negative numbers accurately", () => {
      expect(parsePriceInput("0")).toEqual({ valid: true, value: 0 });
      expect(parsePriceInput("12")).toEqual({ valid: true, value: 12 });
      expect(parsePriceInput("12.50")).toEqual({ valid: true, value: 12.5 });
      expect(parsePriceInput("99.99")).toEqual({ valid: true, value: 99.99 });
    });

    it("rejects negative numbers and retains error message", () => {
      const res = parsePriceInput("-5");
      expect(res.valid).toBe(false);
      expect(res.value).toBeNull();
      expect(res.error).toContain("negative");
    });

    it("rejects non-numeric characters and partial invalid text", () => {
      expect(parsePriceInput("abc").valid).toBe(false);
      expect(parsePriceInput("12.3.4").valid).toBe(false);
      expect(parsePriceInput("$12").valid).toBe(false);
    });
  });

  describe("model confidence self-assessment formatting (formatConfidence)", () => {
    it("formats valid confidence scores as percentage without inventing probability", () => {
      expect(formatConfidence(0.95)).toBe("Model assessment: 95%");
      expect(formatConfidence(0.8)).toBe("Model assessment: 80%");
      expect(formatConfidence(0)).toBe("Model assessment: 0%");
      expect(formatConfidence(1)).toBe("Model assessment: 100%");
    });

    it("returns null for undefined, NaN, or non-finite inputs", () => {
      expect(formatConfidence(undefined)).toBeNull();
      expect(formatConfidence(Number.NaN)).toBeNull();
      expect(formatConfidence(Number.POSITIVE_INFINITY)).toBeNull();
    });
  });

  describe("omission semantics and explanations (OMISSION_SEMANTICS)", () => {
    it("provides explicit explanations for all omissible fields", () => {
      expect(OMISSION_SEMANTICS.address.explanation).toContain("food truck");
      expect(OMISSION_SEMANTICS.priceCad.explanation).toContain("Price varies");
      expect(OMISSION_SEMANTICS.hours.explanation).toContain("00:00 – 24:00");
      expect(OMISSION_SEMANTICS.expiresOn.explanation).toContain("ongoing");
      expect(OMISSION_SEMANTICS.validDays.explanation).toContain("Monday through Sunday");
      expect(OMISSION_SEMANTICS.conditions.explanation).toContain("No fine print");
    });

    it("marks omitted fields as reviewed in the draft reducer", () => {
      let draft = createDraft();
      expect(draft.fields.address.isReviewed).toBe(false);
      expect(draft.fields.priceCad.isReviewed).toBe(false);

      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "address" });
      draft = dealDraftReducer(draft, { type: "REVIEW_OMISSION", field: "priceCad" });

      expect(draft.fields.address.isReviewed).toBe(true);
      expect(draft.fields.priceCad.isReviewed).toBe(true);
      expect(draft.fields.address.value).toBeNull();
      expect(draft.fields.priceCad.value).toBeNull();
    });
  });

  describe("review issue resolution evaluation (evaluateIssueResolution)", () => {
    it("marks FUTURE_START as unresolvable hard blocker", () => {
      const issue: ReviewIssue = {
        id: "issue-1",
        code: "FUTURE_START",
        detail: "Starts in November",
        resolved: false,
        blocking: true,
      };
      const evaluation = evaluateIssueResolution(issue);
      expect(evaluation.canResolve).toBe(false);
      expect(evaluation.reason).toContain("Hard blocker");
    });

    it("marks CURRENCY_UNVERIFIED as requiring manual price confirmation", () => {
      const issue: ReviewIssue = {
        id: "issue-2",
        code: "CURRENCY_UNVERIFIED",
        detail: "Price $10 USD not confirmed as CAD",
        resolved: false,
        blocking: false,
        originalAmount: 10,
      };
      const evaluation = evaluateIssueResolution(issue);
      expect(evaluation.canResolve).toBe(false);
      expect(evaluation.reason).toContain("Currency unverified");
    });

    it("allows resolving UNSUPPORTED_CONSTRAINT with a resolution note", () => {
      const issue: ReviewIssue = {
        id: "issue-3",
        code: "UNSUPPORTED_CONSTRAINT",
        detail: "Must show student card",
        resolved: false,
        blocking: true,
      };
      const evaluation = evaluateIssueResolution(issue);
      expect(evaluation.canResolve).toBe(true);

      // Reducer requires non-empty resolution note
      let draft = createDraft();
      draft = { ...draft, reviewIssues: [issue] };

      // Empty note refused
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: "issue-3",
        resolutionNote: "   ",
      });
      expect(draft.reviewIssues[0].resolved).toBe(false);

      // Non-empty note accepted
      draft = dealDraftReducer(draft, {
        type: "RESOLVE_REVIEW_ISSUE",
        issueId: "issue-3",
        resolutionNote: "Promo applies to all student cards this week",
      });
      expect(draft.reviewIssues[0].resolved).toBe(true);
      expect(draft.reviewIssues[0].resolutionNote).toBe(
        "Promo applies to all student cards this week"
      );
    });
  });

  describe("suggestions, acceptance, and rejection", () => {
    it("correctly identifies pending suggestions", () => {
      const draft = createDraft();
      expect(hasPendingSuggestions(draft)).toBe(false);

      const draftWithSuggestion = {
        ...draft,
        fields: {
          ...draft.fields,
          restaurant: {
            ...draft.fields.restaurant,
            suggestion: { value: "Suggested Diner" },
          },
        },
      };
      expect(hasPendingSuggestions(draftWithSuggestion)).toBe(true);
    });

    it("accepts and rejects individual suggestions through reducer", () => {
      let draft = createDraft();
      draft = {
        ...draft,
        fields: {
          ...draft.fields,
          restaurant: {
            ...draft.fields.restaurant,
            suggestion: { value: "Suggested Pho", confidence: 0.9 },
          },
        },
      };

      // Accept suggestion
      draft = dealDraftReducer(draft, {
        type: "ACCEPT_SUGGESTION",
        field: "restaurant",
      });
      expect(draft.fields.restaurant.value).toBe("Suggested Pho");
      expect(draft.fields.restaurant.isReviewed).toBe(true);
      expect(draft.fields.restaurant.suggestion).toBeUndefined();

      // Set and reject address suggestion
      draft = {
        ...draft,
        fields: {
          ...draft.fields,
          address: {
            ...draft.fields.address,
            suggestion: { value: "Suggested Ave" },
          },
        },
      };
      draft = dealDraftReducer(draft, {
        type: "REJECT_SUGGESTION",
        field: "address",
      });
      expect(draft.fields.address.value).toBeNull();
      expect(draft.fields.address.suggestion).toBeUndefined();
      expect(draft.fields.address.isReviewed).toBe(false);
    });

    it("accepts all pending suggestions with ACCEPT_ALL_SUGGESTIONS", () => {
      let draft = createDraft();
      draft = {
        ...draft,
        fields: {
          ...draft.fields,
          restaurant: { ...draft.fields.restaurant, suggestion: { value: "Bistro A" } },
          dealText: { ...draft.fields.dealText, suggestion: { value: "Burger $10" } },
          priceCad: { ...draft.fields.priceCad, suggestion: { value: 10 } },
        },
      };

      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      expect(draft.fields.restaurant.value).toBe("Bistro A");
      expect(draft.fields.restaurant.isReviewed).toBe(true);
      expect(draft.fields.dealText.value).toBe("Burger $10");
      expect(draft.fields.dealText.isReviewed).toBe(true);
      expect(draft.fields.priceCad.value).toBe(10);
      expect(draft.fields.priceCad.isReviewed).toBe(true);
    });
  });

  describe("manual edits survive integration use", () => {
    it("never overwrites manual edits with late extraction results or suggestions", () => {
      let draft = createDraft();
      draft = dealDraftReducer(draft, {
        type: "START_EXTRACTION",
        requestId: "req-1",
      });
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "User Custom Name",
      });

      expect(draft.fields.restaurant.value).toBe("User Custom Name");
      expect(draft.fields.restaurant.isManuallyEdited).toBe(true);

      // Late extraction finishes
      draft = dealDraftReducer(draft, {
        type: "FINISH_EXTRACTION_SUCCESS",
        requestId: "req-1",
        sourceRevision: draft.extraction.sourceRevision,
        result: {
          isDeal: true,
          deals: [
            {
              restaurant: "Model Restaurant",
              address: null,
              dealText: "Deal text",
              priceCad: 15,
              validDays: [],
              validStart: null,
              validEnd: null,
              expiresOn: null,
              conditions: [],
            },
          ],
        },
      });

      // User custom name is completely preserved
      expect(draft.fields.restaurant.value).toBe("User Custom Name");
      expect(draft.fields.restaurant.isManuallyEdited).toBe(true);

      // Calling ACCEPT_ALL_SUGGESTIONS still preserves the manual edit
      draft = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
      expect(draft.fields.restaurant.value).toBe("User Custom Name");
    });
  });

  describe("location confirmation and invalidation", () => {
    it("invalidates confirmed location when restaurant or address is edited", () => {
      let draft = makeSyntheticReadyDraft();
      expect(draft.location?.confirmed).toBe(true);
      expect(getDraftPublishReadiness(draft).canPublish).toBe(true);

      // Edit restaurant -> location reset to null
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "restaurant",
        value: "Changed Restaurant",
      });
      expect(draft.location).toBeNull();
      expect(getDraftPublishReadiness(draft).canPublish).toBe(false);
      expect(getDraftPublishReadiness(draft).errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Coordinates (lat, lng) must be explicitly confirmed"),
        ])
      );

      // Re-confirm location
      draft = dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.2827,
        lng: -123.1207,
      });
      expect(draft.location?.confirmed).toBe(true);
      expect(getDraftPublishReadiness(draft).canPublish).toBe(true);

      // Edit address -> location reset to null
      draft = dealDraftReducer(draft, {
        type: "SET_FIELD",
        field: "address",
        value: "999 New Address",
      });
      expect(draft.location).toBeNull();
      expect(getDraftPublishReadiness(draft).canPublish).toBe(false);
    });
  });

  describe("publish readiness and error reporting", () => {
    it("reports all blocking reasons when draft is incomplete", () => {
      const draft = createDraft();
      const readiness = getDraftPublishReadiness(draft);

      expect(readiness.canPublish).toBe(false);
      expect(readiness.errors.length).toBeGreaterThan(0);
      expect(readiness.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Restaurant name is required"),
          expect.stringContaining("Deal text is required"),
          expect.stringContaining("Coordinates (lat, lng) must be explicitly confirmed"),
        ])
      );
      expect(() => buildPublishFields(draft)).toThrow(DraftValidationError);
    });

    it("builds canonical publish fields when draft is fully reviewed", () => {
      const readyDraft = makeSyntheticReadyDraft();
      const readiness = getDraftPublishReadiness(readyDraft);

      expect(readiness.canPublish).toBe(true);
      expect(readiness.errors).toEqual([]);

      const publishFields = buildPublishFields(readyDraft);
      expect(publishFields.restaurant).toBe("Chambar Restaurant");
      expect(publishFields.dealText).toBe("Moules frites special $24");
      expect(publishFields.priceCad).toBe(24);
      expect(publishFields.lat).toBe(49.281);
      expect(publishFields.lng).toBe(-123.109);
      expect(publishFields.validDays).toEqual(["mon", "tue", "wed"]);
      expect(publishFields.validStart).toBe("16:00");
      expect(publishFields.validEnd).toBe("18:00");
      expect(publishFields.address).toBeUndefined(); // null converted to undefined
      expect(publishFields.expiresOn).toBeUndefined(); // null converted to undefined
    });

    it("preserves draft state when onPublish rejects", async () => {
      const draft = makeSyntheticReadyDraft();
      const mockRejection = async () => {
        throw new Error("Convex network timeout");
      };

      let caughtError = "";
      try {
        const fields = buildPublishFields(draft);
        await mockRejection();
        void fields;
      } catch (err) {
        caughtError = (err as Error).message;
      }

      expect(caughtError).toBe("Convex network timeout");
      // Draft state was untouched
      expect(draft.fields.restaurant.value).toBe("Chambar Restaurant");
      expect(draft.fields.priceCad.value).toBe(24);
      expect(draft.location?.confirmed).toBe(true);
    });
  });

  describe("weekday format helper", () => {
    it("formats weekday codes to full day names", () => {
      expect(formatWeekday("mon")).toBe("Monday");
      expect(formatWeekday("fri")).toBe("Friday");
      expect(formatWeekday("sun")).toBe("Sunday");
    });
  });
});
