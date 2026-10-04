"use client";

import React, { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PublishedDealMap } from "./PublishedDealMap";
import {
  selectDeals,
  formatValidityLabel,
  type CanonicalDeal,
  type PriceFilter,
  type TimeFilter,
  type SortOption,
} from "@/lib/mapPage";
import { validNow } from "@/lib/validNow";
import { distanceKm, type LatLng } from "@/lib/distance";
import { useClock } from "@/components/frontend/useClock";
import { Icon } from "@/components/frontend/Icon";

export function CanonicalDealMapPage() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return (
      <div className="page-width" style={{ marginTop: 32, marginBottom: 48 }}>
        <div className="panel empty-state">
          <Icon name="pin" size={32} />
          <h1>Live map feed unavailable</h1>
          <p>Convex backend is not configured in this environment (NEXT_PUBLIC_CONVEX_URL is unset).</p>
          <Link href="/" className="button secondary">
            Back to Discover
          </Link>
        </div>
      </div>
    );
  }

  return <CanonicalDealMapContent />;
}

function CanonicalDealMapContent() {
  const { now, ready: clockReady } = useClock();

  // Canonical reactive query: latest 50 published deals
  const rawDeals = useQuery(api.deals.listRecent, { limit: 50 });

  const [priceFilter, setPriceFilter] = useState<PriceFilter>("any");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  // Request browser location hint (finite timeout, truthful fallback)
  const handleRequestLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationMessage("Geolocation is not supported by your browser. Showing newest deals.");
      return;
    }

    setLocating(true);
    setLocationMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const coords: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLocation(coords);
        setSortOption("distance");
        setLocationMessage(null);
      },
      (err) => {
        setLocating(false);
        setUserLocation(null);
        if (sortOption === "distance") {
          setSortOption("newest");
        }
        if (err.code === 1) {
          setLocationMessage("Location permission denied. Showing deals sorted by newest.");
        } else if (err.code === 3) {
          setLocationMessage("Location request timed out. Showing deals sorted by newest.");
        } else {
          setLocationMessage("Location is currently unavailable. Showing deals sorted by newest.");
        }
      },
      {
        timeout: 10000,
        enableHighAccuracy: true,
        maximumAge: 60000,
      }
    );
  }, [sortOption]);

  // Client-side filtering and sorting
  const filteredDeals = useMemo<CanonicalDeal[]>(() => {
    if (!rawDeals) return [];
    return selectDeals(rawDeals as CanonicalDeal[], {
      price: priceFilter,
      time: timeFilter,
      sort: sortOption,
      userLocation,
      now,
    });
  }, [rawDeals, priceFilter, timeFilter, sortOption, userLocation, now]);

  const handleResetFilters = () => {
    setPriceFilter("any");
    setTimeFilter("all");
    setSortOption("newest");
    setSelectedId(null);
  };

  return (
    <div className="page-width" style={{ marginTop: 24, marginBottom: 56 }}>
      {/* Header & Truthful Notice */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: "2rem", margin: 0, fontWeight: 700 }}>Vancouver Deals Map</h1>
        <p style={{ margin: "6px 0 0 0", color: "var(--muted)", fontSize: "0.95rem" }}>
          Showing up to 50 recent deals across Metro Vancouver. Filter by price, valid hours, or distance.
        </p>
      </div>

      {/* Filter and Sort Toolbar */}
      <div
        className="panel"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          padding: "12px 16px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {/* Price Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label htmlFor="map-price-filter" style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 600 }}>
              Price:
            </label>
            <select
              id="map-price-filter"
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value as PriceFilter)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--stone)",
                background: "var(--plate)",
                fontSize: "0.9rem",
              }}
            >
              <option value="any">All prices</option>
              <option value="under5">Under $5</option>
              <option value="under10">Under $10</option>
              <option value="under15">Under $15</option>
            </select>
          </div>

          {/* Time Filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label htmlFor="map-time-filter" style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 600 }}>
              Hours:
            </label>
            <select
              id="map-time-filter"
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--stone)",
                background: "var(--plate)",
                fontSize: "0.9rem",
              }}
            >
              <option value="all">All hours</option>
              <option value="valid-now">Valid now</option>
            </select>
          </div>

          {/* Sort Order */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label htmlFor="map-sort-option" style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 600 }}>
              Sort:
            </label>
            <select
              id="map-sort-option"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--stone)",
                background: "var(--plate)",
                fontSize: "0.9rem",
              }}
            >
              <option value="newest">Newest first</option>
              <option value="price">Price: low to high</option>
              <option value="time">Valid now / ending soon</option>
              <option value="distance">Distance: nearest</option>
            </select>
          </div>
        </div>

        {/* Location Hint Button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="button secondary"
            onClick={handleRequestLocation}
            disabled={locating}
            style={{ padding: "6px 14px", fontSize: "0.88rem" }}
            aria-label="Use my location for distance sorting"
          >
            <Icon name="pin" size={16} />
            {locating ? "Locating…" : userLocation ? "Location enabled" : "Near me"}
          </button>
        </div>
      </div>

      {/* Location Notice (if denied / unavailable) */}
      {locationMessage && (
        <div
          role="status"
          style={{
            padding: "10px 16px",
            marginBottom: 16,
            borderRadius: 8,
            background: "#fff8e1",
            color: "#8d6e63",
            border: "1px solid #ffe082",
            fontSize: "0.9rem",
          }}
        >
          {locationMessage}
        </div>
      )}

      {/* Map Section (Dominates layout) */}
      <section
        style={{
          height: "500px",
          width: "100%",
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid var(--stone)",
          marginBottom: 24,
          position: "relative",
          background: "var(--oat)",
        }}
        aria-label="Interactive restaurant deals map"
      >
        <PublishedDealMap
          deals={filteredDeals}
          selectedId={selectedId}
          onSelectDeal={(deal) => setSelectedId(deal?._id ?? null)}
          ariaLabel="Published restaurant deals in Vancouver"
          fitOnLoad
          style={{ height: "100%", width: "100%" }}
        />
      </section>

      {/* Loading Skeleton */}
      {rawDeals === undefined && (
        <div className="skeleton-card" aria-label="Loading deals" aria-busy="true">
          <div />
          <span />
        </div>
      )}

      {/* Empty State */}
      {rawDeals !== undefined && filteredDeals.length === 0 && (
        <div className="panel empty-state" style={{ marginTop: 20 }}>
          <Icon name="search" size={32} />
          <h2>No deals found</h2>
          <p>None of the recent deals match your selected filters.</p>
          <button type="button" className="button secondary" onClick={handleResetFilters}>
            Reset filters
          </button>
        </div>
      )}

      {/* Supporting Minimal Deal List */}
      {filteredDeals.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <h2 style={{ fontSize: "1.25rem", margin: 0, fontWeight: 700 }}>
              Deals in view ({filteredDeals.length})
            </h2>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Select a deal to view details
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {filteredDeals.map((deal) => {
              const isSelected = deal._id === selectedId;
              const val = validNow(deal, now);
              const valDisplay = clockReady
                ? formatValidityLabel(val)
                : { label: "Checking hours…", isValid: false };

              let distanceLabel: string | null = null;
              if (userLocation && typeof deal.lat === "number" && typeof deal.lng === "number") {
                try {
                  const km = distanceKm(userLocation, { lat: deal.lat, lng: deal.lng });
                  distanceLabel = `${km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)} km`}`;
                } catch {
                  // Coordinate out of range or calculation error: omit distance
                }
              }

              return (
                <div
                  key={deal._id}
                  className={`panel ${isSelected ? "selected-deal" : ""}`}
                  style={{
                    padding: 16,
                    borderRadius: 12,
                    border: isSelected
                      ? "2px solid var(--char)"
                      : "1px solid var(--stone)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 10,
                    background: "var(--plate)",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease",
                  }}
                  onClick={() => setSelectedId(deal._id)}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span
                        className={`time-badge ${valDisplay.isValid ? "is-valid" : ""}`}
                        style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                      >
                        <span className="status-dot" />
                        {valDisplay.label}
                      </span>
                      {distanceLabel && (
                        <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 600 }}>
                          {distanceLabel}
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: "1.1rem", margin: "8px 0 4px 0", fontWeight: 700 }}>
                      {deal.restaurant}
                    </h3>

                    <p style={{ margin: 0, fontSize: "0.92rem", color: "var(--char)" }}>
                      {deal.dealText}
                    </p>

                    {deal.address && (
                      <p style={{ margin: "4px 0 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
                        {deal.address}
                      </p>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: 8,
                      borderTop: "1px solid var(--stone)",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: "1rem" }}>
                      {deal.priceCad !== undefined && deal.priceCad !== null
                        ? `$${Number(deal.priceCad).toFixed(2)} CAD`
                        : "Price varies"}
                    </span>
                    <Link
                      href={`/deal/${deal._id}`}
                      className="button outline"
                      style={{ padding: "4px 10px", fontSize: "0.82rem" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      View deal <Icon name="arrow" size={14} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
