/**
 * Tests for location invalidation, confirmation, and DealLocationPicker integration (N-FORM-B).
 *
 * Verifies:
 * - INVALIDATE_LOCATION action sets location to null while preserving all other draft fields.
 * - INVALIDATE_LOCATION is idempotent if location is already null.
 * - CONFIRM_LOCATION validates coordinates and sets location with confirmed = true.
 * - Editing restaurant or address invalidates confirmed location to null.
 * - Editing unrelated fields (price, dealText, validDays, etc.) preserves confirmed location.
 * - Location picker onInvalidate callback triggers INVALIDATE_LOCATION on new proposal.
 * - Location picker onConfirm callback triggers CONFIRM_LOCATION.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createDraft,
  dealDraftReducer,
} from "../../lib/dealDraft";
import { applyNewProposal } from "../../components/maps/DealLocationPicker";

describe("N-FORM-B: Location Invalidation and Confirmation Reducer Rules", () => {
  it("INVALIDATE_LOCATION action resets confirmed location to null while preserving unrelated fields", () => {
    let draft = createDraft({
      restaurant: "Burnaby Noodles",
      address: "4500 Kingsway",
      dealText: "Half price bowls",
      priceCad: 12.5,
      validDays: ["mon", "tue"],
    });

    // Confirm location first
    draft = dealDraftReducer(draft, {
      type: "CONFIRM_LOCATION",
      lat: 49.2276,
      lng: -122.9998,
    });

    expect(draft.location).toEqual({
      lat: 49.2276,
      lng: -122.9998,
      confirmed: true,
    });

    // Invalidate location
    const invalidated = dealDraftReducer(draft, { type: "INVALIDATE_LOCATION" });

    expect(invalidated.location).toBeNull();
    // All other fields preserved
    expect(invalidated.fields.restaurant.value).toBe("Burnaby Noodles");
    expect(invalidated.fields.address.value).toBe("4500 Kingsway");
    expect(invalidated.fields.dealText.value).toBe("Half price bowls");
    expect(invalidated.fields.priceCad.value).toBe(12.5);
    expect(invalidated.fields.validDays.value).toEqual(["mon", "tue"]);
  });

  it("INVALIDATE_LOCATION is a safe no-op if location is already null", () => {
    const draft = createDraft({ restaurant: "Sushi Bar" });
    expect(draft.location).toBeNull();

    const result = dealDraftReducer(draft, { type: "INVALIDATE_LOCATION" });
    expect(result).toBe(draft); // referential equality preserved
    expect(result.location).toBeNull();
  });

  it("CONFIRM_LOCATION validates coordinate bounds and sets confirmed = true", () => {
    let draft = createDraft({ restaurant: "Valid Place" });

    draft = dealDraftReducer(draft, {
      type: "CONFIRM_LOCATION",
      lat: 49.25,
      lng: -123.1,
    });

    expect(draft.location).toEqual({
      lat: 49.25,
      lng: -123.1,
      confirmed: true,
    });

    // Out-of-bounds coordinates throw
    expect(() =>
      dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 91, // > 90
        lng: -123.1,
      })
    ).toThrow(RangeError);

    expect(() =>
      dealDraftReducer(draft, {
        type: "CONFIRM_LOCATION",
        lat: 49.25,
        lng: 185, // > 180
      })
    ).toThrow(RangeError);
  });

  it("editing restaurant automatically invalidates confirmed location", () => {
    let draft = createDraft({ restaurant: "Initial Name" });
    draft = dealDraftReducer(draft, {
      type: "CONFIRM_LOCATION",
      lat: 49.2,
      lng: -123.0,
    });
    expect(draft.location?.confirmed).toBe(true);

    // Edit restaurant name
    draft = dealDraftReducer(draft, {
      type: "SET_FIELD",
      field: "restaurant",
      value: "Changed Restaurant Name",
    });

    expect(draft.location).toBeNull();
  });

  it("editing address automatically invalidates confirmed location", () => {
    let draft = createDraft({ restaurant: "Taco Shop", address: "100 Main St" });
    draft = dealDraftReducer(draft, {
      type: "CONFIRM_LOCATION",
      lat: 49.2,
      lng: -123.0,
    });
    expect(draft.location?.confirmed).toBe(true);

    // Edit address
    draft = dealDraftReducer(draft, {
      type: "SET_FIELD",
      field: "address",
      value: "200 Second Ave",
    });

    expect(draft.location).toBeNull();
  });

  it("editing non-geographic fields preserves confirmed location", () => {
    let draft = createDraft({ restaurant: "Pizza Place" });
    draft = dealDraftReducer(draft, {
      type: "CONFIRM_LOCATION",
      lat: 49.25,
      lng: -123.12,
    });

    // Edit priceCad
    draft = dealDraftReducer(draft, {
      type: "SET_FIELD",
      field: "priceCad",
      value: 15,
    });
    expect(draft.location?.confirmed).toBe(true);

    // Edit dealText
    draft = dealDraftReducer(draft, {
      type: "SET_FIELD",
      field: "dealText",
      value: "Large two-topping pizza",
    });
    expect(draft.location?.confirmed).toBe(true);

    // Edit validDays
    draft = dealDraftReducer(draft, {
      type: "SET_FIELD",
      field: "validDays",
      value: ["fri", "sat"],
    });
    expect(draft.location?.confirmed).toBe(true);

    // Edit conditions
    draft = dealDraftReducer(draft, {
      type: "SET_FIELD",
      field: "conditions",
      value: ["Takeout only"],
    });
    expect(draft.location?.confirmed).toBe(true);
  });

  it("location picker applyNewProposal helper invokes onInvalidate callback immediately on new coordinates", () => {
    let draft = createDraft({ restaurant: "Test Kitchen" });
    draft = dealDraftReducer(draft, {
      type: "CONFIRM_LOCATION",
      lat: 49.28,
      lng: -123.12,
    });
    expect(draft.location?.confirmed).toBe(true);

    const onInvalidate = vi.fn(() => {
      draft = dealDraftReducer(draft, { type: "INVALIDATE_LOCATION" });
    });

    // User drags marker or clicks map to propose a new point
    const proposed = applyNewProposal({ lat: 49.2827, lng: -123.1207 }, onInvalidate);

    expect(proposed).not.toBeNull();
    expect(proposed?.proposedPoint).toEqual({ lat: 49.2827, lng: -123.1207 });
    expect(proposed?.isConfirmed).toBe(false);
    expect(onInvalidate).toHaveBeenCalledTimes(1);

    // Draft location was invalidated
    expect(draft.location).toBeNull();

    // User explicitly confirms proposal
    draft = dealDraftReducer(draft, {
      type: "CONFIRM_LOCATION",
      lat: proposed!.proposedPoint.lat,
      lng: proposed!.proposedPoint.lng,
    });

    expect(draft.location).toEqual({
      lat: 49.2827,
      lng: -123.1207,
      confirmed: true,
    });
  });
});
