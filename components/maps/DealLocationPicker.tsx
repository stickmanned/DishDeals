"use client";

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
  className?: string;
  style?: CSSProperties;
  engine?: "auto" | "maplibre" | "raster";
}

/** Burnaby context viewport center and zoom */
const BURNABY_CENTER: [number, number] = [-122.9805, 49.2488];
const BURNABY_ZOOM = 12;

export function DealLocationPicker(props: DealLocationPickerProps) {
  const {
    restaurant,
    address,
    location,
    search,
    onConfirm,
    className,
    style,
    engine = "auto",
  } = props;

  const [DealMapComponent, setDealMapComponent] = useState<ComponentType<DealMapProps> | null>(null);

  // Proposed point on the map (unconfirmed until explicit user confirmation)
  const [proposedPoint, setProposedPoint] = useState<{ lat: number; lng: number } | null>(
    location ? { lat: location.lat, lng: location.lng } : null
  );
  const [isConfirmed, setIsConfirmed] = useState<boolean>(location ? location.confirmed : false);

  // Search input and candidate state
  const defaultQuery = [restaurant, address].filter(Boolean).join(", ");
  const [searchQuery, setSearchQuery] = useState(defaultQuery);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  // Safe async request identity guard
  const searchRequestId = useRef(0);
  const isMounted = useRef(true);

  // Track previous restaurant and address to clear stale candidates and proposals
  const prevRestaurant = useRef(restaurant);
  const prevAddress = useRef(address);

  // Client-only lazy load of DealMap
  useEffect(() => {
    isMounted.current = true;
    import("@restaurant-deals/map")
      .then((mod) => {
        if (isMounted.current) {
          setDealMapComponent(() => mod.DealMap);
        }
      })
      .catch((err) => {
        console.error("Failed to load map module", err);
      });
    return () => {
      isMounted.current = false;
      searchRequestId.current++;
    };
  }, []);

  // Update proposed point when parent location prop changes
  useEffect(() => {
    if (location) {
      setProposedPoint({ lat: location.lat, lng: location.lng });
      setIsConfirmed(location.confirmed);
    } else {
      setProposedPoint(null);
      setIsConfirmed(false);
    }
  }, [location]);

  // Restaurant or address edits clear stale candidates, messages, and in-flight searches
  useEffect(() => {
    const restaurantChanged = prevRestaurant.current !== restaurant;
    const addressChanged = prevAddress.current !== address;

    if (restaurantChanged || addressChanged) {
      prevRestaurant.current = restaurant;
      prevAddress.current = address;

      // Invalidate in-flight search requests
      searchRequestId.current++;

      // Clear stale candidates and status
      setCandidates([]);
      setSearchMessage(null);
      setGeoMessage(null);
      setIsSearching(false);

      // Reset query to new restaurant/address
      const newQuery = [restaurant, address].filter(Boolean).join(", ");
      setSearchQuery(newQuery);

      // If location wasn't already confirmed, clear proposed point
      if (!location?.confirmed) {
        setProposedPoint(null);
        setIsConfirmed(false);
      }
    }
  }, [restaurant, address, location]);

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

    const reqId = ++searchRequestId.current;
    setIsSearching(true);
    setSearchMessage(null);

    search(query)
      .then((results) => {
        if (!isMounted.current || searchRequestId.current !== reqId) return;
        setIsSearching(false);
        setCandidates(results);
        if (results.length === 0) {
          setSearchMessage("No matching locations found. Click or drag directly on the map to set a location.");
        }
      })
      .catch((err) => {
        if (!isMounted.current || searchRequestId.current !== reqId) return;
        setIsSearching(false);
        setSearchMessage("Search failed. Please try again or place pin on the map.");
        console.error("Geocoding search failed", err);
      });
  };

  const handleSelectCandidate = (candidate: GeocodeCandidate) => {
    // Propose location from candidate (unconfirmed until user confirms)
    setProposedPoint({ lat: candidate.lat, lng: candidate.lng });
    setIsConfirmed(false);
  };

  const handleMapLocationChange = (coords: { latitude: number; longitude: number }) => {
    // Propose unconfirmed location on map click or marker drag
    setProposedPoint({ lat: coords.latitude, lng: coords.longitude });
    setIsConfirmed(false);
  };

  const handleBrowserLocationHint = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMessage("Geolocation is not supported by your browser.");
      return;
    }

    setGeoMessage("Requesting device location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMounted.current) return;
        setProposedPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsConfirmed(false); // Hint only! Never automatically confirmed.
        setGeoMessage("Location proposed as hint. Please adjust and confirm.");
      },
      (err) => {
        if (!isMounted.current) return;
        setGeoMessage(err.message || "Location permission denied or unavailable.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirm = () => {
    if (!proposedPoint) return;
    setIsConfirmed(true);
    onConfirm({ lat: proposedPoint.lat, lng: proposedPoint.lng });
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
          onChange={(e) => setSearchQuery(e.target.value)}
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
            Attribution: Search results provided by search provider
          </div>
        </div>
      )}

      <div className="picker-map-viewport" style={{ position: "relative", height: "340px", marginBottom: "12px" }}>
        {!DealMapComponent ? (
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
