"use client";

import React, { useMemo, useState, useEffect } from "react";
import type { CSSProperties, ComponentType } from "react";
import type { DealMapProps, MapDeal } from "@restaurant-deals/map";
import { toCanonicalMapDeals, type CanonicalSavedDeal } from "@/lib/mapAdapter";
import "@restaurant-deals/map/styles.css";

export interface PublishedDealMapProps {
  deals: readonly CanonicalSavedDeal[];
  /** Controlled selected deal ID (_id from canonical saved deals). */
  selectedId?: string | null;
  /** Callback fired when a deal is selected or deselected. */
  onSelectDeal?: (deal: CanonicalSavedDeal | null) => void;
  className?: string;
  style?: CSSProperties;
  initialCenter?: [longitude: number, latitude: number];
  initialZoom?: number;
  engine?: "auto" | "maplibre" | "raster";
  ariaLabel?: string;
  fitKey?: string | number;
  fitOnLoad?: boolean;
}

export function PublishedDealMap(props: PublishedDealMapProps) {
  const {
    deals,
    selectedId,
    onSelectDeal,
    className,
    style,
    initialCenter = [-123.117, 49.278],
    initialZoom = 12,
    engine = "auto",
    ariaLabel = "Published restaurant deals map",
    fitKey,
    fitOnLoad,
  } = props;

  const [DealMapComponent, setDealMapComponent] = useState<ComponentType<DealMapProps> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    import("@restaurant-deals/map")
      .then((mod) => {
        if (mounted) {
          setDealMapComponent(() => mod.DealMap);
        }
      })
      .catch(() => {
        if (mounted) {
          setLoadError("The map renderer could not load. Please reload or check your connection.");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const mapDeals = useMemo(() => toCanonicalMapDeals(deals), [deals]);

  const dealLookup = useMemo(() => {
    const map = new Map<string, CanonicalSavedDeal>();
    for (const d of deals) {
      if (d && typeof d._id === "string") {
        map.set(d._id, d);
      }
    }
    return map;
  }, [deals]);

  const handleSelect = (mapDeal: MapDeal) => {
    const matched = dealLookup.get(mapDeal.id) ?? null;
    onSelectDeal?.(matched);
  };

  if (loadError) {
    return (
      <div
        className={`bitemap bitemap-error-container ${className ?? ""}`}
        style={style}
        role="region"
        aria-label={ariaLabel}
      >
        <div
          className="bitemap-error"
          role="alert"
          style={{ padding: "16px", color: "#b3261e", background: "#fce8e6", borderRadius: "8px" }}
        >
          {loadError}
        </div>
      </div>
    );
  }

  if (!DealMapComponent) {
    return (
      <div
        className={`bitemap bitemap-loading-container ${className ?? ""}`}
        style={style}
        role="region"
        aria-label={ariaLabel}
      >
        <div className="bitemap-status" role="status">
          <span className="bitemap-loading-dot" />
          Loading map…
        </div>
      </div>
    );
  }

  return (
    <DealMapComponent
      deals={mapDeals}
      selectedId={selectedId}
      onSelect={handleSelect}
      className={className}
      style={style}
      initialCenter={initialCenter}
      initialZoom={initialZoom}
      engine={engine}
      ariaLabel={ariaLabel}
      fitKey={fitKey}
      fitOnLoad={fitOnLoad}
    />
  );
}
