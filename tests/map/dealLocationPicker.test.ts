import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DealLocationPicker,
  isValidLocationPoint,
  filterValidCandidates,
  LocationSearchGuard,
  applyNewProposal,
  confirmProposal,
  resolveLocationPropUpdate,
  resetFormContextState,
  type DealLocationPickerProps,
  type GeocodeCandidate,
  type DealLocationPickerLocation,
  BURNABY_CENTER,
  BURNABY_ZOOM,
} from "../../components/maps/DealLocationPicker";

describe("DealLocationPicker production bounds validation", () => {
  it("validates realistic Vancouver and Web Mercator coordinates", () => {
    expect(isValidLocationPoint(49.2488, -122.9805)).toBe(true);
    expect(isValidLocationPoint(0, 0)).toBe(true);
    expect(isValidLocationPoint(85.05112878, 180)).toBe(true);
    expect(isValidLocationPoint(-85.05112878, -180)).toBe(true);
  });

  it("rejects points outside geographic or Web Mercator bounds", () => {
    expect(isValidLocationPoint(85.051129, -122.98)).toBe(false);
    expect(isValidLocationPoint(-85.051129, -122.98)).toBe(false);
    expect(isValidLocationPoint(49.25, 180.0001)).toBe(false);
    expect(isValidLocationPoint(49.25, -180.0001)).toBe(false);
    expect(isValidLocationPoint(NaN, -122.98)).toBe(false);
    expect(isValidLocationPoint(49.25, Infinity)).toBe(false);
    expect(isValidLocationPoint("49.25", "-122.98")).toBe(false);
    expect(isValidLocationPoint(null, undefined)).toBe(false);
  });

  it("filters candidate lists, rejecting invalid coordinates or blank labels", () => {
    const raw: GeocodeCandidate[] = [
      { lat: 49.2488, lng: -122.9805, label: "Crystal Mall, Burnaby" },
      { lat: 999, lng: -122.9805, label: "Invalid Lat Candidate" },
      { lat: 49.2488, lng: -122.9805, label: "   " },
      // @ts-expect-error test non-object
      null,
      { lat: 49.2781, lng: -123.1207, label: "Robson St, Vancouver" },
    ];

    const filtered = filterValidCandidates(raw);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].label).toBe("Crystal Mall, Burnaby");
    expect(filtered[1].label).toBe("Robson St, Vancouver");
  });
});

describe("DealLocationPicker production state transitions (helpers used by component)", () => {
  it("preserves active dragged/clicked proposal when parent clears confirmation or passes null", () => {
    const activeProposal = { lat: 49.2501, lng: -122.9815 };

    // Parent responds to onInvalidate by setting location = null or confirmed = false
    const transitionNull = resolveLocationPropUpdate(activeProposal, null);
    expect(transitionNull).toEqual({
      proposedPoint: { lat: 49.2501, lng: -122.9815 },
      isConfirmed: false,
    });

    const transitionUnconfirmed = resolveLocationPropUpdate(activeProposal, {
      lat: 49.2501,
      lng: -122.9815,
      confirmed: false,
    });
    expect(transitionUnconfirmed).toEqual({
      proposedPoint: { lat: 49.2501, lng: -122.9815 },
      isConfirmed: false,
    });
  });

  it("adopts new coordinates when parent passes a confirmed location", () => {
    const activeProposal = { lat: 49.2501, lng: -122.9815 };
    const newLocation = { lat: 49.2827, lng: -123.1207, confirmed: true };

    const result = resolveLocationPropUpdate(activeProposal, newLocation);
    expect(result).toEqual({
      proposedPoint: { lat: 49.2827, lng: -123.1207 },
      isConfirmed: true,
    });
  });

  it("clears old proposals and candidates when restaurant or address changes", () => {
    const reset = resetFormContextState("New Ramen", "123 Main St");
    expect(reset.proposedPoint).toBeNull();
    expect(reset.isConfirmed).toBe(false);
    expect(reset.candidates).toEqual([]);
    expect(reset.isSearching).toBe(false);
    expect(reset.searchQuery).toBe("123 Main St");
  });

  it("invokes onInvalidate immediately when an unconfirmed proposal is applied", () => {
    const onInvalidate = vi.fn();
    const result = applyNewProposal({ lat: 49.2501, lng: -122.9815 }, onInvalidate);

    expect(onInvalidate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      proposedPoint: { lat: 49.2501, lng: -122.9815 },
      isConfirmed: false,
    });
  });

  it("refuses to apply proposals with invalid coordinates and does not invoke onInvalidate", () => {
    const onInvalidate = vi.fn();
    const result = applyNewProposal({ lat: 90, lng: -122.9815 }, onInvalidate);

    expect(onInvalidate).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("confirms valid proposal, passing validated coordinates to onConfirm", () => {
    const onConfirm = vi.fn();
    const success = confirmProposal({ lat: 49.2488, lng: -122.9805 }, onConfirm);

    expect(success).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ lat: 49.2488, lng: -122.9805 });
  });

  it("refuses to confirm null or out-of-bounds proposals", () => {
    const onConfirm = vi.fn();
    expect(confirmProposal(null, onConfirm)).toBe(false);
    expect(confirmProposal({ lat: 100, lng: -122.98 }, onConfirm)).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("LocationSearchGuard production async race & edit invalidation", () => {
  it("discards out-of-order stale search results using monotonic request IDs", async () => {
    const guard = new LocationSearchGuard();
    let finalCandidates: GeocodeCandidate[] = [];

    // Simulate search 1: slow network response (50ms)
    const req1 = guard.startSearch();
    const search1 = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (guard.isCurrent(req1)) {
          finalCandidates = [{ lat: 49.1, lng: -123.1, label: "Stale Search 1" }];
        }
        resolve();
      }, 50);
    });

    // Simulate search 2: triggered shortly after, fast response (10ms)
    const req2 = guard.startSearch();
    const search2 = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (guard.isCurrent(req2)) {
          finalCandidates = [{ lat: 49.2488, lng: -122.9805, label: "Fresh Search 2" }];
        }
        resolve();
      }, 10);
    });

    await Promise.all([search1, search2]);

    expect(finalCandidates).toHaveLength(1);
    expect(finalCandidates[0].label).toBe("Fresh Search 2");
  });

  it("invalidates in-flight search requests when search query or form fields are edited", async () => {
    const guard = new LocationSearchGuard();
    let finalCandidates: GeocodeCandidate[] = [];

    const reqId = guard.startSearch();
    const searchPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (guard.isCurrent(reqId)) {
          finalCandidates = [{ lat: 49.25, lng: -122.98, label: "Late Search Response" }];
        }
        resolve();
      }, 30);
    });

    // User types in search input or edits restaurant: invalidate immediately
    guard.invalidate();

    await searchPromise;

    // Response must be discarded
    expect(finalCandidates).toEqual([]);
  });

  it("guards against late geolocation callbacks arriving after context edits", async () => {
    const guard = new LocationSearchGuard();
    let appliedHint: { lat: number; lng: number } | null = null;

    // Browser location requested at reqId
    const geoReqId = guard.getRequestId();
    const geoCallback = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (guard.isCurrent(geoReqId)) {
          appliedHint = { lat: 49.2, lng: -123.0 };
        }
        resolve();
      }, 40);
    });

    // User changes address before geolocation callback arrives
    guard.invalidate();

    await geoCallback;

    expect(appliedHint).toBeNull();
  });
});

describe("DealLocationPicker contract & default configuration", () => {
  it("initializes viewport to Burnaby context", () => {
    expect(BURNABY_CENTER).toEqual([-122.9805, 49.2488]);
    expect(BURNABY_ZOOM).toBe(12);
  });

  it("exports required DealLocationPickerProps contract including onInvalidate", () => {
    const onInvalidate = vi.fn();
    const onConfirm = vi.fn();
    const loc: DealLocationPickerLocation = {
      lat: 49.2488,
      lng: -122.9805,
      confirmed: false,
    };

    const props: DealLocationPickerProps = {
      restaurant: "Burnaby Noodle House",
      address: "4500 Kingsway",
      location: loc,
      onConfirm,
      onInvalidate,
    };

    expect(props.restaurant).toBe("Burnaby Noodle House");
    expect(typeof props.onInvalidate).toBe("function");
  });
});

describe("address-first location search", () => {
  it("uses the street address without the restaurant branding", () => {
    expect(resetFormContextState("Phở Hòa + jázen tea", "6516 Kingsway, Burnaby, BC").searchQuery)
      .toBe("6516 Kingsway, Burnaby, BC");
  });
  it("cleans a saved address that already includes restaurant branding", () => {
    expect(resetFormContextState("Phở Hòa + jázen tea", "Phở Hòa + jázen tea, 6516 Kingsway, Burnaby, BC").searchQuery)
      .toBe("6516 Kingsway, Burnaby, BC");
  });
});


it("renders the user's street address in the actual location search input", () => {
  const html = renderToStaticMarkup(createElement(DealLocationPicker, {
    restaurant: "Phở Hòa + jázen tea",
    address: "Phở Hòa + jázen tea, 6516 Kingsway, Burnaby, BC",
    location: null, onConfirm: vi.fn(), onInvalidate: vi.fn(),
  }));
  const input = html.match(/<input[^>]*aria-label="Location search query"[^>]*>/)?.[0];
  expect(input).toContain('value="6516 Kingsway, Burnaby, BC"');
  expect(input).not.toContain("Phở Hòa");
});
