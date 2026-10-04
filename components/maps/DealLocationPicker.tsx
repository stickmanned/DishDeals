"use client";

import { defaultLocationSearchQuery } from "../../lib/locationSearchQuery";
import React, { useState, useEffect, useRef } from "react";
import type { CSSProperties, ComponentType } from "react";
import type { DealMapProps, DraftLocation } from "@restaurant-deals/map";
import "@restaurant-deals/map/styles.css";

export interface DealLocationPickerLocation {
  lat: number;
  lng: number;
  confirmed: boolean;
}

export interface GeocodeCandidate {
  lat: number;
  lng: number;
  label: string;
}

export interface DealLocationPickerProps {
  restaurant: string;
  address: string | null;
  location: DealLocationPickerLocation | null;
  search?: (query: string) => Promise<GeocodeCandidate[]>;
  onConfirm: (point: { lat: number; lng: number }) => void;
  /**
   * Invoked immediately whenever a new proposal is created (marker drag, map click,
   * candidate selection, or device location hint) so the parent form can invalidate
   * previously confirmed coordinates and prevent publishing stale locations.
   */
  onInvalidate: () => void;
  className?: string;
  style?: CSSProperties;
  engine?: "auto" | "maplibre" | "raster";
}

/** Burnaby context viewport center and zoom */
export const BURNABY_CENTER: [number, number] = [-122.9805, 49.2488];
export const BURNABY_ZOOM = 12;

/**
 * Validates geographic coordinate bounds for Web Mercator and world coordinates.
 */
export function isValidLocationPoint(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 85.05112878) return false;
  if (Math.abs(lng) > 180) return false;
  return true;
}

/**
 * Filters candidates to ensure all have valid labels and finite coordinates.
 */
export function filterValidCandidates(candidates: readonly GeocodeCandidate[]): GeocodeCandidate[] {
  if (!Array.isArray(candidates)) return [];
  return candidates.filter(
    (c) => c && typeof c.label === "string" && c.label.trim() && isValidLocationPoint(c.lat, c.lng)
  );
}

/**
 * Manages monotonic request IDs to guard against out-of-order or stale async results.
 */
export class LocationSearchGuard {
  private requestId = 0;

  public startSearch(): number {
    return ++this.requestId;
  }

  public invalidate(): number {
    return ++this.requestId;
  }

  public isCurrent(requestId: number): boolean {
    return this.requestId === requestId;
  }

  public getRequestId(): number {
    return this.requestId;
  }
}

export interface ProposalResult {
  proposedPoint: { lat: number; lng: number };
  isConfirmed: boolean;
}

/**
 * Applies a new unconfirmed proposal after bounds validation and notifies onInvalidate.
 */
export function applyNewProposal(
  coords: { lat: number; lng: number },
  onInvalidate?: () => void
): ProposalResult | null {
  if (!isValidLocationPoint(coords.lat, coords.lng)) {
    return null;
  }
  onInvalidate?.();
  return {
    proposedPoint: { lat: coords.lat, lng: coords.lng },
    isConfirmed: false,
  };
}

/**
 * Resolves location prop updates. When parent passes null or clears confirmation
 * (e.g. in response to onInvalidate), preserves the active proposed point.
 * Explicitly clears proposals only when form context changes.
 */
export function resolveLocationPropUpdate(
  currentProposedPoint: { lat: number; lng: number } | null,
  newLocation: DealLocationPickerLocation | null
): { proposedPoint: { lat: number; lng: number } | null; isConfirmed: boolean } {
  if (newLocation && isValidLocationPoint(newLocation.lat, newLocation.lng)) {
    return {
      proposedPoint: { lat: newLocation.lat, lng: newLocation.lng },
      isConfirmed: newLocation.confirmed,
    };
  }
  // Parent cleared confirmation or passed null: preserve local proposal, mark unconfirmed
  return {
    proposedPoint: currentProposedPoint,
    isConfirmed: false,
  };
}

/**
 * Resets form state when restaurant or address changes.
 */
export function resetFormContextState(restaurant: string, address: string | null) {
  return {
    proposedPoint: null,
    isConfirmed: false,
    candidates: [] as GeocodeCandidate[],
    isSearching: false,
    searchMessage: null as string | null,
    geoMessage: null as string | null,
    searchQuery: defaultLocationSearchQuery(restaurant, address),
  };
}

/**
 * Validates and executes location confirmation.
 */
export function confirmProposal(
  proposedPoint: { lat: number; lng: number } | null,
  onConfirm: (point: { lat: number; lng: number }) => void
): boolean {
  if (!proposedPoint || !isValidLocationPoint(proposedPoint.lat, proposedPoint.lng)) {
    return false;
  }
  onConfirm({ lat: proposedPoint.lat, lng: proposedPoint.lng });
  return true;
}

export function DealLocationPicker(props: DealLocationPickerProps) {
  const {
    restaurant,
    address,
    location,
    search,
    onConfirm,
    onInvalidate,
    className,
    style,
    engine = "auto",
  } = props;

  const [DealMapComponent, setDealMapComponent] = useState<ComponentType<DealMapProps> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Proposed point on the map (unconfirmed until explicit user confirmation)
  const [proposedPoint, setProposedPoint] = useState<{ lat: number; lng: number } | null>(
    location && isValidLocationPoint(location.lat, location.lng)
      ? { lat: location.lat, lng: location.lng }
      : null
  );
  const [isConfirmed, setIsConfirmed] = useState<boolean>(location ? location.confirmed : false);

  // Search input and candidate state
  const defaultQuery = defaultLocationSearchQuery(restaurant, address);
  const [searchQuery, setSearchQuery] = useState(defaultQuery);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  // Safe async request identity guard
  const searchGuard = useRef(new LocationSearchGuard());
  const isMounted = useRef(true);

  // Client-only lazy load of DealMap
  useEffect(() => {
    isMounted.current = true;
    const guard = searchGuard.current;
    import("@restaurant-deals/map")
      .then((mod) => {
        if (isMounted.current) {
          setDealMapComponent(() => mod.DealMap);
        }
      })
      .catch(() => {
        if (isMounted.current) {
          setLoadError("The map renderer could not load. Please reload or check your connection.");
        }
      });
    return () => {
      isMounted.current = false;
      guard.invalidate();
    };
  }, []);

  // Adjust state during render when location prop changes (official React pattern)
  const [prevLocation, setPrevLocation] = useState(location);
  if (location !== prevLocation) {
    setPrevLocation(location);
    const resolved = resolveLocationPropUpdate(proposedPoint, location);
    setProposedPoint(resolved.proposedPoint);
    setIsConfirmed(resolved.isConfirmed);
  }

  // Adjust state during render when restaurant or address changes
  const [prevFormContext, setPrevFormContext] = useState({ restaurant, address });
  if (prevFormContext.restaurant !== restaurant || prevFormContext.address !== address) {
    setPrevFormContext({ restaurant, address });
    const reset = resetFormContextState(restaurant, address);
    setProposedPoint(reset.proposedPoint);
    setIsConfirmed(reset.isConfirmed);
    setCandidates(reset.candidates);
    setIsSearching(reset.isSearching);
    setSearchMessage(reset.searchMessage);
    setGeoMessage(reset.geoMessage);
    setSearchQuery(reset.searchQuery);
  }

  // Invalidate in-flight search requests when form context changes
  useEffect(() => {
    searchGuard.current.invalidate();
  }, [restaurant, address]);

  const handleSearchQueryChange = (val: string) => {
    setSearchQuery(val);
    searchGuard.current.invalidate();
    setIsSearching(false);
    setCandidates([]);
    setSearchMessage(null);
  };

  const handleSearch = () => {
    if (!search) {
      setSearchMessage("Address search is unavailable (no geocoding provider configured).");
      return;
    }

    const query = searchQuery.trim();
    if (!query) {
      setSearchMessage("Please enter a restaurant name or address to search.");
      return;
    }

    const reqId = searchGuard.current.startSearch();
    setIsSearching(true);
    setSearchMessage(null);

    search(query)
      .then((results) => {
        if (!isMounted.current || !searchGuard.current.isCurrent(reqId)) return;
        setIsSearching(false);
        const valid = filterValidCandidates(results);
        setCandidates(valid);
        if (valid.length === 0) {
          setSearchMessage("No matching locations found. Click or drag directly on the map to set a location.");
        }
      })
      .catch(() => {
        if (!isMounted.current || !searchGuard.current.isCurrent(reqId)) return;
        setIsSearching(false);
        setSearchMessage("Search failed. Please try again or place pin on the map.");
      });
  };

  const handleSelectCandidate = (candidate: GeocodeCandidate) => {
    const proposal = applyNewProposal({ lat: candidate.lat, lng: candidate.lng }, onInvalidate);
    if (proposal) {
      setProposedPoint(proposal.proposedPoint);
      setIsConfirmed(false);
    }
  };

  const handleMapLocationChange = (coords: { latitude: number; longitude: number }) => {
    const proposal = applyNewProposal({ lat: coords.latitude, lng: coords.longitude }, onInvalidate);
    if (proposal) {
      setProposedPoint(proposal.proposedPoint);
      setIsConfirmed(false);
    }
  };

  const handleBrowserLocationHint = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMessage("Geolocation is not supported by your browser.");
      return;
    }

    const reqId = searchGuard.current.getRequestId();
    setGeoMessage("Requesting device location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMounted.current || !searchGuard.current.isCurrent(reqId)) return;
        const proposal = applyNewProposal(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          onInvalidate
        );
        if (proposal) {
          setProposedPoint(proposal.proposedPoint);
          setIsConfirmed(false); // Hint only! Never automatically confirmed.
          setGeoMessage("Location proposed as hint. Please adjust and confirm.");
        } else {
          setGeoMessage("Device returned coordinates outside valid bounds.");
        }
      },
      (err) => {
        if (!isMounted.current || !searchGuard.current.isCurrent(reqId)) return;
        setGeoMessage(err.message || "Location permission denied or unavailable.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirm = () => {
    const ok = confirmProposal(proposedPoint, onConfirm);
    if (ok) {
      setIsConfirmed(true);
    }
  };

  const draft: DraftLocation | null = proposedPoint
    ? {
        latitude: proposedPoint.lat,
        longitude: proposedPoint.lng,
        confirmed: isConfirmed,
        label: restaurant || "Proposed Location",
      }
    : null;

  return (
    <div className={`deal-location-picker ${className ?? ""}`} style={style}>
      <div className="picker-search-bar" style={{ marginBottom: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchQueryChange(e.target.value)}
          placeholder="Search restaurant or address"
          aria-label="Location search query"
          style={{ flex: "1 1 200px", padding: "8px 12px", border: "1px solid #dadce0", borderRadius: "4px" }}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={isSearching}
          style={{ padding: "8px 16px", backgroundColor: "#1a73e8", color: "white", border: 0, borderRadius: "4px", cursor: "pointer" }}
        >
          {isSearching ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          onClick={handleBrowserLocationHint}
          style={{ padding: "8px 12px", backgroundColor: "#f1f3f4", color: "#3c4043", border: "1px solid #dadce0", borderRadius: "4px", cursor: "pointer" }}
          title="Use device location as unconfirmed hint"
        >
          Use my location
        </button>
      </div>

      {searchMessage && (
        <div className="picker-message" role="status" style={{ fontSize: "13px", color: "#5f6368", marginBottom: "8px" }}>
          {searchMessage}
        </div>
      )}

      {geoMessage && (
        <div className="picker-geo-message" role="status" style={{ fontSize: "13px", color: "#5f6368", marginBottom: "8px" }}>
          {geoMessage}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="picker-candidates" style={{ marginBottom: "12px", border: "1px solid #e8eaed", borderRadius: "6px", padding: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#5f6368", marginBottom: "6px" }}>
            Select a proposed location candidate:
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {candidates.map((cand, idx) => (
              <li key={`${cand.lat},${cand.lng},${idx}`} style={{ marginBottom: "4px" }}>
                <button
                  type="button"
                  onClick={() => handleSelectCandidate(cand)}
                  style={{
                    textAlign: "left",
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: "6px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: "#1a73e8",
                  }}
                >
                  📍 {cand.label}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ fontSize: "11px", color: "#70757a", marginTop: "6px" }}>
            Search data ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#1a73e8", textDecoration: "underline" }}
            >
              OpenStreetMap contributors
            </a>
          </div>
        </div>
      )}

      <div className="picker-map-viewport" style={{ position: "relative", height: "340px", marginBottom: "12px" }}>
        {loadError ? (
          <div
            className="bitemap-error"
            role="alert"
            style={{ padding: "16px", color: "#b3261e", background: "#fce8e6", borderRadius: "8px" }}
          >
            {loadError}
          </div>
        ) : !DealMapComponent ? (
          <div
            className="bitemap bitemap-loading-container"
            style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}
            role="region"
            aria-label="Location picker map"
          >
            <div className="bitemap-status" role="status">
              <span className="bitemap-loading-dot" />
              Loading map…
            </div>
          </div>
        ) : (
          <DealMapComponent
            deals={[]}
            draftLocation={draft}
            onDraftLocationChange={handleMapLocationChange}
            isDraftDraggable={true}
            initialCenter={BURNABY_CENTER}
            initialZoom={BURNABY_ZOOM}
            engine={engine}
            showLocateControl={true}
            showDealCard={false}
            ariaLabel="Deal location picker map"
          />
        )}
      </div>

      <div className="picker-action-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ fontSize: "13px", color: proposedPoint ? (isConfirmed ? "#1e8e3e" : "#b06000") : "#70757a" }}>
          {proposedPoint
            ? isConfirmed
              ? `Confirmed location: ${proposedPoint.lat.toFixed(5)}, ${proposedPoint.lng.toFixed(5)}`
              : `Proposed location: ${proposedPoint.lat.toFixed(5)}, ${proposedPoint.lng.toFixed(5)} (unconfirmed)`
            : "No location selected. Click map or search above."}
        </div>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!proposedPoint || isConfirmed}
          style={{
            padding: "8px 20px",
            backgroundColor: !proposedPoint || isConfirmed ? "#dadce0" : "#1e8e3e",
            color: "white",
            border: 0,
            borderRadius: "4px",
            fontWeight: 500,
            cursor: !proposedPoint || isConfirmed ? "default" : "pointer",
          }}
        >
          {isConfirmed ? "Location confirmed" : "Confirm location"}
        </button>
      </div>
    </div>
  );
}
