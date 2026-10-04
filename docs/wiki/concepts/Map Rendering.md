---
title: "Map Rendering"
type: concept
tags: [map, maplibre, leaflet, package]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["map-component/", "components/maps/", "lib/mapAdapter.ts", "lib/mapPage.ts"]
---

# Map Rendering

## Overview

Map rendering is implemented as a standalone local workspace package, `@restaurant-deals/map` (`map-component/`, `file:./map-component` in `package.json`), consumed by the canonical app through a thin, lazily-loaded wrapper. The package name says "Leaflet" is involved, but the **primary** renderer is MapLibre GL; Leaflet is a WebGL-less fallback.

## How It Works

- **Package entry** (`map-component/src/index.ts`): exports the `DealMap` component, data helpers `parseMapDeals`/`isDealInViewport`/`DEFAULT_TILE_URL`/`DEFAULT_ATTRIBUTION`, marker helpers `makePin`/`makeDraftPin`, and types `MapDeal`/`MapViewport`/`DealMapProps`/`MapEngine`/`DraftLocation`.
- **`DealMap.tsx`** (orchestrator): validates incoming `deals` via `parseMapDeals` (which strips unknown fields like Convex's `_id` and enforces valid Web-Mercator-range coordinates, non-negative price/discount, absolute http(s) `sourceUrl`), manages selection state, and decides `maplibre` vs `raster` engine — falling back automatically if WebGL/style init throws (`onUnsupported`).
- **`MapLibreView.tsx`** (primary): lazy-imports `maplibre-gl`; uses a custom-bundled worker asset (`?worker&url` Vite import) so the shipped package is self-contained; renders either a custom vector style (`streetStyle.ts`, OpenFreeMap/OpenMapTiles — "no Google data") or a raster-tile style; reconciles deal markers incrementally (`makePin` + a `WeakMap`-based `pinMatches` check to skip rebuilding unchanged pins — this is the only "diffing," there is no real marker clustering); implements draft-pin dragging via a `maplibre-gl` `Marker` whose `dragend` event calls `onDraftLocationChange`.
- **`RasterView.tsx`** (fallback): the same contract (viewport change, click, draft-pin drag) implemented with Leaflet instead, used when MapLibre is unavailable.
- **`data.ts`**: `parseMapDeals` (strict validator/normalizer) and `isDealInViewport` (viewport filtering, handling antimeridian wraparound) — the package's only tested logic (`map-component/tests/data.test.ts`); there are no component/DOM tests for the map views themselves.
- **App integration**: `components/maps/PublishedDealMap.tsx` (read-only, shows published deals, adapts data via `lib/mapAdapter.ts`) and `components/maps/DealLocationPicker.tsx` (shows only a draggable draft pin, no published deals, used while posting/editing to confirm a restaurant's coordinates) both `import("@restaurant-deals/map")` lazily inside a `useEffect` to keep the heavy map code client-only and code-split.

## Where It Lives

- `map-component/src/index.ts`, `types.ts`, `data.ts`, `markers.ts`, `DealMap.tsx`, `MapLibreView.tsx`, `RasterView.tsx`, `streetStyle.ts`, `DealCard.tsx` — the package itself.
- `map-component/README.md` — usage docs (install, `MapDeal` contract, props table, basemap/licensing notes).
- `map-component/examples/TeamIntegration.tsx` — copy-ready integration snippet.
- `map-component/dev/` — standalone manual-QA dev harness (excluded from the published package).
- `scripts/map-assets.mjs` — a build-time check that the MapLibre worker asset is packaged correctly end-to-end (asserts byte-identical copies exist in both `map-component/dist/` and the Next.js production `.next/static/media/` output, and that both bundles reference the real emitted filename) — guards against the classic "worker URL resolves to 404 after bundling" failure.
- `lib/mapAdapter.ts#toCanonicalMapDeal(s)` — converts a canonical `deals` row into the package's `MapDeal` shape (never invents currency/expiry; only sets `currency: "CAD"` if `priceCad` is a finite non-negative number).
- `lib/mapPage.ts` — UI-level filter/sort/selection wrapper around [[Deal Validity and Distance Math]]'s `selectDeals`, plus `mapSelectionFromQuery` (a URL-selected deal id is only honored if it's in the currently visible/filtered set).
- `components/maps/CanonicalDealMapPage.tsx`, `PublishedDealMap.tsx`, `DealLocationPicker.tsx`.

## Key Details

- There are **two** independent adapters from app data to the map package's `MapDeal`: `lib/mapAdapter.ts` (canonical pipeline) and `lib/workflow/search-map.ts#toMapDeals` (teammate workflow pipeline, see [[Teammate Workflow Pipeline]]) — each pipeline has its own.
- Basemap licensing is deliberate: OpenFreeMap vector streets + OSM raster fallback, explicitly no Google Maps tiles or API keys (`map-component/README.md`).

## Sources

- [[Canonical Deal Publishing]], [[Teammate Workflow Pipeline]]
