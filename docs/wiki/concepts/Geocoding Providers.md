---
title: "Geocoding Providers"
type: concept
tags: [geocoding, nominatim, geoapify, rate-limit]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/geocode.ts", "convex/geocodeState.ts", "lib/geocodeCore.ts", "lib/workflow/geoapify.ts"]
---

# Geocoding Providers

## Overview

Two unrelated geocoding integrations exist, one per pipeline — they are not interchangeable and do not share code:

| | Canonical path | Teammate workflow path |
|---|---|---|
| Provider | Nominatim (OpenStreetMap) | Geoapify |
| Used by | `convex/geocode.ts`, triggered by an explicit "Find" button in the post/edit UI | `lib/workflow/geoapify.ts#findRestaurant`, called automatically during extraction |
| Scope | Metro Vancouver bounding box only | City-boundary lookup, then a restaurant-category search within it |
| Rate limit | App-wide, 1 request/second, durable gate | None visible at this layer (handled by the shared `fetchJson` retry/backoff in `lib/workflow/network.ts`) |
| Caching | SHA-256-keyed result cache in Convex (`geocodeCache` table) | Per-run in-memory `Map` cache keyed by restaurant/location hint (`lib/workflow/workflow.ts`) |

## How It Works (canonical / Nominatim)

1. `convex/geocode.ts#geocode` (public action) requires sign-in and the `GEOCODE_USAGE_AUTHORIZED`/`GEOCODE_USER_AGENT` env gate (see [[Environment Gated Providers]]).
2. It hashes the query (`sha256Hex`) so **raw query text is never stored**, and delegates to `lib/geocodeCore.ts#geocodeCore`, injecting `reserveGlobalSlot`/`cacheGet`/`cachePut` backed by `convex/geocodeState.ts`.
3. `geocodeCore` checks the cache first (a cache hit bypasses the rate limit entirely); on a miss it calls `reserveGlobalSlot` (below), then does a capped/timed fetch, then validates/sanitizes the response (`parseAndValidateProviderResponse`, bbox-checked) before caching and returning.
4. **The rate-limit gate** (`convex/geocodeState.ts#reserveSlot`): a single durable row (`geocodeGate`, key `"nominatim"`) holds `lastGrantedAt`; Convex mutation serialization means concurrent requests from different users can never both win inside the same second. A clock that reads *earlier* than the last grant fails closed — nothing is granted, nothing is changed — rather than risk bypassing the limit.
5. `lib/geocodeCore.ts#validateConfig` requires a genuine identifying `User-Agent` (rejects generic `curl`/`python`/`wget`/browser-default strings) per Nominatim's usage policy, cited directly in `convex/geocode.ts:8-12`.

## How It Works (teammate workflow / Geoapify)

1. `lib/workflow/geoapify.ts#findRestaurant`: geocodes the deal's `locationHint` (or the context's `city`) to a **city boundary** via Geoapify `/v1/geocode/search` (`type: city`), retrying with the context city if the hint fails.
2. Rejects if the resolved boundary's country doesn't match the expected context.
3. Queries `/v2/places` (`categories: catering`, `name: deal.restaurantName`) filtered to that city boundary, limit 20.
4. Scores candidates: `nameScore * 0.85 + (addressMatches ? 0.15 : 0)` (via `normalizeName`/`similarity`/`addressMatches`), discards score < 0.5, returns the top 5.

## Where It Lives

- `convex/geocode.ts`, `convex/geocodeState.ts` — canonical path.
- `lib/geocodeCore.ts` — `METRO_VANCOUVER_BBOX`, `NOMINATIM_DEFAULTS`, `validateAndNormalizeQuery`, `validateConfig`, `buildNominatimUrl`, `parseAndValidateProviderResponse`, `geocodeCore`.
- `lib/workflow/geoapify.ts` — the teammate-workflow path, also exports `normalizeName` (reused by `lib/workflow/search.ts` for cuisine/city matching).
- `convex/schema.ts:34-44` — `geocodeGate`/`geocodeCache` tables (private, internal-only; no public read/write).

## Key Details

- Both providers' results ultimately feed a user-confirmable draggable pin (`components/maps/DealLocationPicker.tsx`) — geocoding never silently commits a coordinate; see [[Map Rendering]].
- The canonical cache's `cachePut` re-validates candidates with the same bbox/limit checks as a live response before storing — a corrupted or out-of-bounds cache write is refused, not silently accepted.

## Sources

- [[Source - Project Process Docs]]
