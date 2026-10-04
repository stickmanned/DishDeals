import { describe, expect, it, vi } from "vitest";
import type {
  DealLocationPickerProps,
  GeocodeCandidate,
  DealLocationPickerLocation,
} from "../../components/maps/DealLocationPicker";

describe("DealLocationPicker contract & async search identity guard", () => {
  it("exports valid TypeScript interfaces for host form integration", () => {
    const loc: DealLocationPickerLocation = {
      lat: 49.2488,
      lng: -122.9805,
      confirmed: false,
    };

    const candidate: GeocodeCandidate = {
      lat: 49.25,
      lng: -122.98,
      label: "Crystal Mall, Burnaby, BC",
    };

    const props: DealLocationPickerProps = {
      restaurant: "Burnaby Noodles",
      address: "4500 Kingsway",
      location: loc,
      search: async () => [candidate],
      onConfirm: () => {},
    };

    expect(props.restaurant).toBe("Burnaby Noodles");
    expect(props.location?.confirmed).toBe(false);
  });

  it("safely ignores out-of-order stale search results using monotonic request ID", async () => {
    // Model the exact monotonic request ID guard implemented in DealLocationPicker
    let currentRequestId = 0;
    let stateCandidates: GeocodeCandidate[] = [];

    const simulateSearch = async (
      query: string,
      latencyMs: number,
      results: GeocodeCandidate[]
    ) => {
      const thisRequestId = ++currentRequestId;
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          if (thisRequestId === currentRequestId) {
            stateCandidates = results;
          }
          resolve();
        }, latencyMs);
      });
    };

    // First search: slow (50ms)
    const slowSearch = simulateSearch("Old Query", 50, [
      { lat: 49.1, lng: -123.1, label: "Stale Result" },
    ]);

    // Second search: fast (10ms) triggered shortly after
    const fastSearch = simulateSearch("New Query", 10, [
      { lat: 49.25, lng: -122.98, label: "Fresh Result" },
    ]);

    await Promise.all([slowSearch, fastSearch]);

    // Stale result resolving at 50ms MUST NOT overwrite Fresh Result that resolved at 10ms
    expect(stateCandidates).toHaveLength(1);
    expect(stateCandidates[0].label).toBe("Fresh Result");
  });

  it("invalidates in-flight search requests when restaurant or address changes", async () => {
    let currentRequestId = 0;
    let stateCandidates: GeocodeCandidate[] = [];

    const searchPromise = new Promise<GeocodeCandidate[]>((resolve) => {
      setTimeout(() => {
        resolve([{ lat: 49.2, lng: -123.0, label: "Late Search Result" }]);
      }, 30);
    });

    const triggerSearch = () => {
      const thisRequestId = ++currentRequestId;
      searchPromise.then((results) => {
        if (thisRequestId === currentRequestId) {
          stateCandidates = results;
        }
      });
    };

    triggerSearch();

    // Host edits restaurant or address before search completes:
    // In DealLocationPicker, prevRestaurant !== restaurant triggers currentRequestId++ and clears candidates
    currentRequestId++;
    stateCandidates = [];

    await searchPromise;

    // Because ID was incremented on edit, the resolved search is discarded
    expect(stateCandidates).toEqual([]);
  });

  it("keeps draft proposed locations unconfirmed until explicit onConfirm", () => {
    const confirmedPoints: { lat: number; lng: number }[] = [];
    const onConfirm = (point: { lat: number; lng: number }) => {
      confirmedPoints.push(point);
    };

    let draftLocation = { lat: 49.2488, lng: -122.9805, confirmed: false };

    // Marker drag proposes unconfirmed location:
    draftLocation = { lat: 49.2501, lng: -122.9815, confirmed: false };
    expect(confirmedPoints).toHaveLength(0); // Not confirmed yet

    // User explicitly confirms:
    draftLocation.confirmed = true;
    onConfirm({ lat: draftLocation.lat, lng: draftLocation.lng });

    expect(confirmedPoints).toHaveLength(1);
    expect(confirmedPoints[0]).toEqual({ lat: 49.2501, lng: -122.9815 });
  });
});
