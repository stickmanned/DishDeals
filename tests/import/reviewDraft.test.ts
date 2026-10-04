/**
 * Tests for Reel draft initialization, serialization, and publish validation (N-FORM-B).
 *
 * Verifies:
 * - Multi-offer serialization to strict ReelDraft[] and initialization to DealDraft[].
 * - Non-CAD / unverified currency handling (tracked via review issue, not assumed CAD).
 * - Preservation of user edits across status updates, retries, and reloads.
 * - Reload invariant: populated values start unreviewed (isReviewed = false) and require confirmation.
 * - Location is null on reload and requires explicit map confirmation before publish.
 * - Serialization preserves null/unknown arrays unless reviewed as every-day / no-conditions.
 * - Model review issues survive Save/reload; count changes fail closed; no guessed correspondence.
 * - Publish uses the canonical validateForPublish/buildPublishFields gate only.
 * - Late extraction is planned separately and never touches existing edits.
 */

import { describe, expect, it } from "vitest";
import { LEGACY_CONSTRAINT_REVIEW_DETAIL } from "../../lib/reels/toDealDraft";
import {
  buildPublishFields,
  createDraft,
  dealDraftReducer,
  validateForPublish,
  type DealDraft,
  type DealDraftAction,
  type Weekday,
} from "../../lib/dealDraft";
import {
  confirmationActions,
  initDraftsFromReelItem,
  isPristineDraft,
  planLateExtraction,
  serializeDraftsToReelDrafts,
  type DraftItem,
} from "../../lib/reels/reviewDraft";

describe("N-FORM-B: Reel Review Draft Helpers and Lifecycle", () => {
  describe("serializeDraftsToReelDrafts", () => {
    it("serializes valid DealDraft instances into strict ReelDraft[]", () => {
      const draft = createDraft({
        restaurant: "Chinatown BBQ",
        address: "130 E Pender St",
        dealText: "Crispy pork combo with iced tea",
        priceCad: 14.99,
        validDays: ["mon", "wed", "fri"],
        validStart: "11:30",
        validEnd: "14:30",
        expiresOn: "2026-12-31",
        conditions: ["Cash only"],
      });
      // Mark as reviewed
      draft.fields.restaurant.isReviewed = true;
      draft.fields.dealText.isReviewed = true;
      draft.fields.validDays.isReviewed = true;
      draft.fields.conditions.isReviewed = true;

      const serialized = serializeDraftsToReelDrafts([draft]);
      expect(serialized).toHaveLength(1);
      expect(serialized[0]).toEqual({
        restaurant: "Chinatown BBQ",
        address: "130 E Pender St",
        dealText: "Crispy pork combo with iced tea",
        price: 14.99,
        currency: "CAD",
        validDays: ["mon", "wed", "fri"],
        validStart: "11:30",
        validEnd: "14:30",
        expiresOn: "2026-12-31",
        conditions: ["Cash only"],
      });
    });

    it("serializes unreviewed empty arrays as null (unknown), but reviewed empty arrays as [] (every-day/no-conditions)", () => {
      // Draft 1: unreviewed empty arrays -> unknown in ReelDraft
      const unreviewedDraft = createDraft({
        restaurant: "Noodle King",
        dealText: "Beef noodle soup",
      });

      const serialized1 = serializeDraftsToReelDrafts([unreviewedDraft]);
      expect(serialized1[0].validDays).toBeNull();
      expect(serialized1[0].conditions).toBeNull();

      // Draft 2: reviewed empty arrays -> confirmed every-day and no-conditions
      const reviewedDraft = createDraft({
        restaurant: "Noodle King",
        dealText: "Beef noodle soup",
      });
      reviewedDraft.fields.validDays.isReviewed = true;
      reviewedDraft.fields.conditions.isReviewed = true;

      const serialized2 = serializeDraftsToReelDrafts([reviewedDraft]);
      expect(serialized2[0].validDays).toEqual([]);
      expect(serialized2[0].conditions).toEqual([]);
    });

    it("serializes multiple offers independently up to 10 offers", () => {
      const drafts: DealDraft[] = [];
      for (let i = 1; i <= 3; i++) {
        const d = createDraft({
          restaurant: `Restaurant ${i}`,
          dealText: `Offer number ${i}`,
          priceCad: 10 + i,
        });
        d.fields.restaurant.isReviewed = true;
        d.fields.dealText.isReviewed = true;
        drafts.push(d);
      }

      const serialized = serializeDraftsToReelDrafts(drafts);
      expect(serialized).toHaveLength(3);
      expect(serialized[0].restaurant).toBe("Restaurant 1");
      expect(serialized[1].restaurant).toBe("Restaurant 2");
      expect(serialized[2].restaurant).toBe("Restaurant 3");
    });

    it("rejects empty draft list or more than 10 drafts", () => {
      expect(() => serializeDraftsToReelDrafts([])).toThrow("At least one draft is required");

      const excessDrafts = Array.from({ length: 11 }, (_, i) =>
        createDraft({ restaurant: `R${i}`, dealText: `D${i}` })
      );
      expect(() => serializeDraftsToReelDrafts(excessDrafts)).toThrow("Cannot save more than 10 offers");
    });
  });

  describe("initDraftsFromReelItem", () => {
    it("initializes drafts from stored draftJson with all fields initially unreviewed", () => {
      const storedReels = [
        {
          restaurant: "Pho 99",
          address: "123 Main St",
          dealText: "Large Pho for $10",
          price: 10,
          currency: "CAD",
          validDays: ["mon", "tue"] as Weekday[],
          validStart: "11:00",
          validEnd: "15:00",
          expiresOn: null,
          conditions: ["Dine-in only"],
        },
      ];

      const item: DraftItem = {
        draftJson: JSON.stringify(storedReels),
        draftEdited: true,
        generation: 1,
        draftRevision: 2,
        status: "ready",
      };

      const drafts = initDraftsFromReelItem(item);
      expect(drafts).toHaveLength(1);
      const d = drafts[0];

      // Values populated
      expect(d.fields.restaurant.value).toBe("Pho 99");
      expect(d.fields.address.value).toBe("123 Main St");
      expect(d.fields.dealText.value).toBe("Large Pho for $10");
      expect(d.fields.priceCad.value).toBe(10);
      expect(d.fields.validDays.value).toEqual(["mon", "tue"]);
      expect(d.fields.conditions.value).toEqual(["Dine-in only"]);

      // Unreviewed on reload invariant
      expect(d.fields.restaurant.isReviewed).toBe(false);
      expect(d.fields.dealText.isReviewed).toBe(false);
      expect(d.fields.priceCad.isReviewed).toBe(false);
      expect(d.fields.validDays.isReviewed).toBe(false);
      expect(d.fields.conditions.isReviewed).toBe(false);

      // Location is not stored in ReelDraft and requires re-confirmation
      expect(d.location).toBeNull();
    });

    it("tracks non-CAD currency as CURRENCY_UNVERIFIED review issue without assuming CAD", () => {
      const storedReels = [
        {
          restaurant: "Tokyo Bistro",
          address: null,
          dealText: "Ramen bowl",
          price: 1200,
          currency: "JPY",
          validDays: null,
          validStart: null,
          validEnd: null,
          expiresOn: null,
          conditions: null,
        },
      ];

      const item: DraftItem = {
        draftJson: JSON.stringify(storedReels),
        generation: 1,
      };

      const drafts = initDraftsFromReelItem(item);
      expect(drafts).toHaveLength(1);
      const d = drafts[0];

      // priceCad is null because JPY is non-CAD
      expect(d.fields.priceCad.value).toBeNull();
      expect(d.reviewIssues).toHaveLength(1);
      expect(d.reviewIssues[0].code).toBe("CURRENCY_UNVERIFIED");
      expect(d.reviewIssues[0].originalAmount).toBe(1200);
      expect(d.reviewIssues[0].resolved).toBe(false);
    });

    it("falls back to model extractionJson when stored draftJson is absent", () => {
      const extraction = {
        isDeal: true,
        drafts: [
          {
            restaurant: "Model Ramen",
            address: null,
            dealText: "Shoyu Ramen for $12",
            price: 12,
            currency: "CAD",
            validDays: ["wed"],
            validStart: null,
            validEnd: null,
            expiresOn: null,
            conditions: null,
          },
        ],
        evidence: [],
        transcript: "Shoyu ramen on Wednesday for twelve dollars.",
        warnings: [],
      };

      const item: DraftItem = {
        extractionJson: JSON.stringify(extraction),
        status: "ready",
      };

      const drafts = initDraftsFromReelItem(item);
      expect(drafts).toHaveLength(1);
      expect(drafts[0].fields.restaurant.suggestion?.value).toBe("Model Ramen");
      expect(drafts[0].fields.dealText.suggestion?.value).toBe("Shoyu Ramen for $12");
      expect(drafts[0].fields.priceCad.suggestion?.value).toBe(12);
    });

    it("provides a clean blank draft when neither draftJson nor extractionJson is present (manual editing in all states)", () => {
      const failedItem: DraftItem = {
        status: "failed",
      };

      const drafts = initDraftsFromReelItem(failedItem, "https://instagram.com/reel/xyz/");
      expect(drafts).toHaveLength(1);
      expect(drafts[0].fields.restaurant.value).toBeNull();
      expect(drafts[0].fields.dealText.value).toBeNull();
      expect(drafts[0].sourceUrl).toBe("https://instagram.com/reel/xyz/");
    });
  });

  describe("canonical publish gate on reloaded drafts", () => {
    const offer = (over: Record<string, unknown> = {}) => ({
      restaurant: "Gastown Pizza",
      address: null,
      dealText: "Two slices and pop for $8",
      price: 8,
      currency: "CAD",
      validDays: ["mon", "tue"],
      validStart: null,
      validEnd: null,
      expiresOn: null,
      conditions: [],
      ...over,
    });

    function readyToPublish(draft: DealDraft): DealDraft {
      let d = draft;
      for (const action of confirmationActions(d)) d = dealDraftReducer(d, action);
      d = dealDraftReducer(d, { type: "CONFIRM_LOCATION", lat: 49.2827, lng: -123.107 });
      for (const field of ["address", "hours", "expiresOn", "validDays", "conditions", "priceCad"] as const) {
        d = dealDraftReducer(d, { type: "REVIEW_OMISSION", field });
      }
      return d;
    }

    it("publishes a reloaded saved draft only after explicit confirmation, location and omission review", () => {
      const [saved] = initDraftsFromReelItem({
        draftJson: JSON.stringify([offer()]),
        draftEdited: true,
      });
      expect(validateForPublish(saved).valid).toBe(false);
      const fields = buildPublishFields(readyToPublish(saved));
      expect(fields).toEqual({
        restaurant: "Gastown Pizza",
        dealText: "Two slices and pop for $8",
        priceCad: 8,
        validDays: ["mon", "tue"],
        conditions: [],
        lat: 49.2827,
        lng: -123.107,
      });
      expect(fields.address).toBeUndefined();
      expect(fields.expiresOn).toBeUndefined();
    });

    it("does not treat the old manually-edited flag as review (unreviewed + manuallyEdited is rejected)", () => {
      const [saved] = initDraftsFromReelItem({
        draftJson: JSON.stringify([offer()]),
        draftEdited: true,
      });
      expect(saved.fields.restaurant.isManuallyEdited).toBe(true);
      expect(saved.fields.restaurant.isReviewed).toBe(false);
      const errors = validateForPublish(saved).errors.join(" | ");
      expect(errors).toContain("Restaurant name must be explicitly reviewed");
      expect(errors).toContain("Deal text must be explicitly reviewed");
    });

    it("a resolved FUTURE_START note still hard-blocks publish", () => {
      let d = readyToPublish(initDraftsFromReelItem({ draftJson: JSON.stringify([offer()]), draftEdited: true })[0]);
      d = {
        ...d,
        reviewIssues: [
          { id: "f1", code: "FUTURE_START", detail: "Starts next month", resolved: true, blocking: true },
        ],
      };
      expect(() => buildPublishFields(d)).toThrow(/future-start/);
    });

    it("rejects publish when location is unconfirmed or was invalidated", () => {
      let d = readyToPublish(initDraftsFromReelItem({ draftJson: JSON.stringify([offer()]), draftEdited: true })[0]);
      expect(() => buildPublishFields(d)).not.toThrow();
      d = dealDraftReducer(d, { type: "INVALIDATE_LOCATION" });
      expect(() => buildPublishFields(d)).toThrow(/explicitly confirmed/);
    });

    it("a saved non-CAD price cannot satisfy the currency gate through an omission review", () => {
      const [saved] = initDraftsFromReelItem({
        draftJson: JSON.stringify([offer({ price: 1200, currency: "JPY" })]),
        draftEdited: true,
      });
      expect(saved.fields.priceCad.isManuallyEdited).toBe(false);
      const errors = validateForPublish(readyToPublish(saved)).errors.join(" | ");
      expect(errors).toContain("Currency is unverified");
    });
  });

  describe("confirmationActions", () => {
    it("confirms only populated or known-empty saved fields, never unknown/omitted ones", () => {
      const [d] = initDraftsFromReelItem({
        draftJson: JSON.stringify([
          {
            restaurant: "Noodle King",
            address: null,
            dealText: "Soup",
            price: null,
            currency: null,
            validDays: [],
            validStart: null,
            validEnd: null,
            expiresOn: null,
            conditions: null,
          },
        ]),
        draftEdited: true,
      });
      const fields = confirmationActions(d).map((a) => (a as Extract<DealDraftAction, { type: "REVIEW_FIELD" }>).field);
      expect(fields.sort()).toEqual(["dealText", "restaurant", "validDays"]);
      const next = confirmationActions(d).reduce(dealDraftReducer, d);
      expect(next.fields.restaurant.isReviewed).toBe(true);
      expect(next.fields.validDays.isReviewed).toBe(true);
      // Unknown conditions/address/price remain unreviewed.
      expect(next.fields.conditions.isReviewed).toBe(false);
      expect(next.fields.address.isReviewed).toBe(false);
      expect(serializeDraftsToReelDrafts([next])[0].conditions).toBeNull();
      expect(serializeDraftsToReelDrafts([next])[0].validDays).toEqual([]);
    });

    it("never marks unaccepted model suggestions as reviewed", () => {
      const [d] = initDraftsFromReelItem({
        extractionJson: JSON.stringify({
          isDeal: true,
          drafts: [{ restaurant: "Model Ramen", address: null, dealText: "Ramen", price: 12, currency: "CAD", validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null }],
          evidence: [],
          transcript: "",
          warnings: [],
        }),
      });
      expect(d.fields.restaurant.suggestion?.value).toBe("Model Ramen");
      expect(confirmationActions(d)).toEqual([]);
    });
  });

  describe("model review issues survive Save and reload", () => {
    const base = (over: Record<string, unknown> = {}) => ({
      restaurant: "Mine",
      address: null,
      dealText: "My deal",
      price: null,
      currency: null,
      validDays: null,
      validStart: null,
      validEnd: null,
      expiresOn: null,
      conditions: null,
      ...over,
    });
    const extraction = (offers: unknown[], warnings: string[]) =>
      JSON.stringify({ isDeal: true, drafts: offers, evidence: [], transcript: "synthetic", warnings });

    it("binds model warnings by index only for an UNEDITED saved draft with the same count", () => {
      const [d] = initDraftsFromReelItem({
        draftJson: JSON.stringify([base()]),
        draftEdited: false,
        extractionJson: extraction([base()], ["Students only"]),
      });
      expect(d.reviewIssues).toHaveLength(2);
      expect(d.reviewIssues).toContainEqual(expect.objectContaining({ detail: LEGACY_CONSTRAINT_REVIEW_DETAIL, blocking: true, resolved: false }));
      expect(d.reviewIssues).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_CONSTRAINT", detail: "Students only", resolved: false, blocking: true }));
      expect(d.fields.restaurant.suggestion?.value).toBe("Mine");
      expect(validateForPublish(d).errors.join("|")).toContain("Unresolved provider constraint");
    });

    it("treats an edited saved draft as unaligned even at the same count: warnings stay with a source-review note", () => {
      const [d] = initDraftsFromReelItem({
        draftJson: JSON.stringify([base()]),
        draftEdited: true,
        extractionJson: extraction([base()], ["Students only"]),
      });
      const details = d.reviewIssues.map((i) => i.detail).join("|");
      expect(details).toContain("Students only");
      expect(details).toContain("cannot be matched automatically");
      expect(d.reviewIssues.every((i) => i.blocking && !i.resolved)).toBe(true);
      expect(Object.values(d.fields).every((f) => f.suggestion === undefined)).toBe(true);
      expect(validateForPublish(d).valid).toBe(false);
    });

    it("regression: same-count edited reorder cannot make a typed FUTURE_START disappear", () => {
      // Model: offer 0 (A) starts in the future; offer 1 (B) is ordinary.
      const modelJson = JSON.stringify({
        isDeal: true,
        drafts: [base({ restaurant: "A" }), base({ restaurant: "B" })],
        evidence: [{ draftIndex: 0, field: "hours", channel: "caption", quote: "starts next month", timestampSeconds: null }],
        transcript: "synthetic transcript",
        warnings: [],
        manualReview: [{ code: "FUTURE_START", dealIndex: 0, detail: "A starts next month", blocking: true }],
      });
      // User reorders (B first, A second) and saves: count is still 2, draftEdited true.
      const reordered = JSON.stringify([base({ restaurant: "B" }), base({ restaurant: "A" })]);
      const drafts = initDraftsFromReelItem({ draftJson: reordered, draftEdited: true, extractionJson: modelJson });
      expect(drafts.map((d) => d.fields.restaurant.value)).toEqual(["B", "A"]);
      for (const d of drafts) {
        const future = d.reviewIssues.filter((i) => i.code === "FUTURE_START");
        expect(future).toHaveLength(1);
        expect(future[0]).toMatchObject({ detail: "A starts next month", blocking: true, resolved: false });
        expect(d.reviewIssues.some((i) => i.detail.includes("cannot be matched automatically"))).toBe(true);
        // Everything else is confirmed and located, yet publish is still hard-blocked.
        let ready = d;
        for (const action of confirmationActions(ready)) ready = dealDraftReducer(ready, action);
        ready = dealDraftReducer(ready, { type: "CONFIRM_LOCATION", lat: 49.28, lng: -123.1 });
        for (const field of ["address", "hours", "expiresOn", "validDays", "conditions", "priceCad"] as const) {
          ready = dealDraftReducer(ready, { type: "REVIEW_OMISSION", field });
        }
        expect(() => buildPublishFields(ready)).toThrow(/future-start/);
      }
      // The note cannot be resolved away through the reducer.
      const id = drafts[0].reviewIssues.find((i) => i.code === "FUTURE_START")!.id;
      const attempted = dealDraftReducer(drafts[0], { type: "RESOLVE_REVIEW_ISSUE", issueId: id, resolutionNote: "fine" });
      expect(attempted.reviewIssues.find((i) => i.id === id)?.resolved).toBe(false);
    });

    it("a typed FUTURE_START also reaches first-load model drafts and unedited saved drafts", () => {
      const withFuture = JSON.stringify({
        isDeal: true,
        drafts: [base()],
        evidence: [],
        transcript: "",
        warnings: [],
        manualReview: [{ code: "FUTURE_START", detail: "Starts later", blocking: false }],
      });
      for (const item of [{ extractionJson: withFuture }, { extractionJson: withFuture, draftJson: JSON.stringify([base()]) }]) {
        const [d] = initDraftsFromReelItem(item);
        const f = d.reviewIssues.find((i) => i.code === "FUTURE_START");
        expect(f).toMatchObject({ blocking: true, resolved: false });
      }
    });

    it("ignores malformed typed notes and never alters the immutable extraction JSON", () => {
      const raw = JSON.stringify({
        isDeal: true,
        drafts: [base()],
        evidence: [],
        transcript: "",
        warnings: [],
        manualReview: [{ code: "BOGUS", detail: "x" }, { code: "FUTURE_START", detail: "  " }, 7],
      });
      const [d] = initDraftsFromReelItem({ extractionJson: raw });
      expect(d.reviewIssues).toEqual([expect.objectContaining({ code: "UNSUPPORTED_CONSTRAINT", detail: LEGACY_CONSTRAINT_REVIEW_DETAIL, blocking: true, resolved: false })]);
      expect(JSON.parse(raw).manualReview).toHaveLength(3);
    });

    it("keeps one model currency note (no duplicate) when the saved price is still non-CAD", () => {
      const jpy = base({ price: 1200, currency: "JPY" });
      const [d] = initDraftsFromReelItem({
        draftJson: JSON.stringify([jpy]),
        draftEdited: true,
        extractionJson: extraction([jpy], []),
      });
      expect(d.reviewIssues.filter((i) => i.code === "CURRENCY_UNVERIFIED")).toHaveLength(1);
    });

    it("fails closed when the saved offer count differs from the model: no guessed matching", () => {
      const jpy = base({ price: 1200, currency: "JPY" });
      const drafts = initDraftsFromReelItem({
        draftJson: JSON.stringify([base({ restaurant: "A" }), base({ restaurant: "B" })]),
        draftEdited: true,
        extractionJson: extraction([jpy], ["Students only"]),
      });
      expect(drafts).toHaveLength(2);
      for (const d of drafts) {
        const details = d.reviewIssues.map((i) => i.detail).join("|");
        expect(details).toContain("Students only");
        expect(details).toContain("cannot be matched automatically");
        expect(d.reviewIssues.some((i) => i.code === "CURRENCY_UNVERIFIED")).toBe(false);
        expect(d.reviewIssues.every((i) => !i.resolved)).toBe(true);
        // No suggestions are attached by index when correspondence is unknown.
        expect(Object.values(d.fields).every((f) => f.suggestion === undefined)).toBe(true);
      }
      expect(new Set(drafts[0].reviewIssues.map((i) => i.id)).size).toBe(drafts[0].reviewIssues.length);
    });

    it("manual flow with no model extraction manufactures no constraints", () => {
      const [saved] = initDraftsFromReelItem({ draftJson: JSON.stringify([base()]), draftEdited: true });
      expect(saved.reviewIssues).toEqual([]);
      const [blank] = initDraftsFromReelItem({ status: "failed" });
      expect(blank.reviewIssues).toEqual([]);
    });
  });

  describe("planLateExtraction", () => {
    const model = JSON.stringify({
      isDeal: true,
      drafts: [
        { restaurant: "Late A", address: null, dealText: "A", price: null, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null },
        { restaurant: "Late B", address: null, dealText: "B", price: null, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null },
      ],
      evidence: [],
      transcript: "",
      warnings: [],
    });

    it("replaces only entirely pristine offers, as tentative suggestions", () => {
      const plan = planLateExtraction([createDraft()], model);
      expect(plan?.mode).toBe("replace");
      expect(plan?.drafts).toHaveLength(2);
      expect(plan?.drafts[0].fields.restaurant.value).toBeNull();
      expect(plan?.drafts[0].fields.restaurant.suggestion?.value).toBe("Late A");
    });

    it("appends after edits and preserves edited values and partial review state exactly", () => {
      let mine = createDraft();
      mine = dealDraftReducer(mine, { type: "SET_FIELD", field: "restaurant", value: "My Edit" });
      mine = dealDraftReducer(mine, { type: "SET_FIELD", field: "priceCad", value: 7.5 });
      expect(isPristineDraft(mine)).toBe(false);
      const plan = planLateExtraction([mine], model);
      expect(plan?.mode).toBe("append");
      expect(plan?.drafts[0]).toBe(mine);
      expect(plan?.drafts).toHaveLength(3);
      expect(plan?.drafts[1].fields.restaurant.isReviewed).toBe(false);
    });

    it("caps at 10 offers and reports truncation", () => {
      const nine = Array.from({ length: 9 }, () =>
        dealDraftReducer(createDraft(), { type: "SET_FIELD", field: "restaurant", value: "x" })
      );
      const plan = planLateExtraction(nine, model);
      expect(plan?.drafts).toHaveLength(10);
      expect(plan?.truncated).toBe(true);
    });

    it("returns null for no-deal, corrupt, or missing extraction", () => {
      expect(planLateExtraction([createDraft()], undefined)).toBeNull();
      expect(planLateExtraction([createDraft()], "{not json")).toBeNull();
      expect(
        planLateExtraction([createDraft()], JSON.stringify({ isDeal: false, drafts: [], evidence: [], transcript: "", warnings: [] }))
      ).toBeNull();
    });
  });
});

describe("Northstar combined private-constraint integration (synthetic)", () => {
  const offer = (dealText: string) => ({ restaurant: "Synthetic restaurant", address: null, dealText, price: null, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null });
  const model = JSON.stringify({ isDeal: true, drafts: [offer("A"), offer("B")], evidence: [], transcript: "", warnings: [], constraints: [
    { draftIndex: 0, code: "FUTURE_START", detail: "Starts November 10, 2026", startsOn: "2026-11-10", channel: "caption", quote: "Starts November 10, 2026", timestampSeconds: null },
    { draftIndex: 1, code: "UNSUPPORTED_CONSTRAINT", detail: "Members only", startsOn: null, channel: "caption", quote: "Members only", timestampSeconds: null },
  ] });
  it("the actual private constraints array survives same-count edited reorder and another serialize/reload", () => {
    const saved = { extractionJson: model, draftJson: JSON.stringify([offer("B edited"), offer("A edited")]), draftEdited: true };
    const first = initDraftsFromReelItem(saved);
    const second = initDraftsFromReelItem({ ...saved, draftJson: JSON.stringify(serializeDraftsToReelDrafts(first)) });
    for (const drafts of [first, second]) for (const draft of drafts) {
      expect(draft.reviewIssues.some(issue => issue.code === "FUTURE_START" && issue.blocking && !issue.resolved)).toBe(true);
      expect(draft.reviewIssues.some(issue => issue.detail === "Members only" && issue.blocking && !issue.resolved)).toBe(true);
      expect(draft.fields.restaurant.isReviewed).toBe(false);
      expect(draft.location).toBeNull();
      const future = draft.reviewIssues.find(issue => issue.code === "FUTURE_START")!;
      const tried = dealDraftReducer(draft, { type: "RESOLVE_REVIEW_ISSUE", issueId: future.id, resolutionNote: "Synthetic attempt to bypass" });
      expect(tried.reviewIssues.find(issue => issue.id === future.id)?.resolved).toBe(false);
      expect(() => buildPublishFields(tried)).toThrow();
    }
  });
  it("unedited saved offers bind the real typed restrictions by index rather than dropping them", () => {
    const [a, b] = initDraftsFromReelItem({ extractionJson: model, draftJson: JSON.stringify([offer("A"), offer("B")]), draftEdited: false });
    expect(a.reviewIssues.some(issue => issue.code === "FUTURE_START")).toBe(true);
    expect(b.reviewIssues.some(issue => issue.code === "FUTURE_START")).toBe(false);
    expect(b.reviewIssues.some(issue => issue.detail === "Members only")).toBe(true);
  });
});
