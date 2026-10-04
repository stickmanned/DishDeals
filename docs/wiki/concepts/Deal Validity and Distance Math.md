---
title: "Deal Validity and Distance Math"
type: concept
tags: [time, validity, distance, dst]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["lib/validNow.ts", "lib/vancouverTime.ts", "lib/distance.ts", "lib/dealSelection.ts", "lib/mapPage.ts"]
---

# Deal Validity and Distance Math

## Overview

The deterministic, pure logic that decides whether a deal is "on right now" and how far away it is. Both are injected-clock pure functions (never query "now" internally), so they are fully unit-testable and reusable from the native iOS shell's own logic if needed.

## How It Works

**Validity (`lib/validNow.ts#validNow(deal, now)`):**

- Computed entirely in America/Vancouver local time via `lib/vancouverTime.ts#formatVancouverParts`.
- Rules (deliberately exhaustive, see the file's own header comment): missing `expiresOn` → `"unknown"`; expiry is an **inclusive** calendar date, after which status is `"expired"`; empty/missing `validDays` means every day; missing both hours means all day (`00:00`–`24:00`); one missing boundary means start/end of day; **equal** non-missing start/end is ambiguous → `"unknown"`; an overnight window (`end < start`) belongs to the *previous* weekday and is clamped so it can never extend past an inclusive expiry date; the window is start-inclusive, end-exclusive.
- **DST correctness**: `getVancouverInstants`/`resolveBoundaryInstant` (lines 149, 189) explicitly handle both DST transitions — a spring-forward gap hour (02:00–02:59 on the transition day) yields `"unknown"` since that local time never occurred; a fall-back repeated hour (01:00–01:59) resolves to the first matching UTC instant *after* the window's start, so the end boundary is captured as soon as the clock reaches it rather than 25 hours later.
- `lib/vancouverTime.ts` separately encodes a real-world fact: Vancouver's IANA zone data is treated as permanently fixed at UTC-7 after March 8, 2026 (`PERMANENT_PACIFIC_START`, citing a BC government source) to work around stale ICU/tzdb data that would otherwise apply a November 2026 DST fallback that isn't actually happening.

**Distance (`lib/distance.ts#distanceKm(a, b)`):**

- Standard haversine great-circle formula, mean Earth radius `6371.0088 km`.
- `validatePoint` throws `RangeError` for any non-finite or out-of-range (`lat ∉ [-90,90]`, `lng ∉ [-180,180]`) coordinate — this function never silently returns a wrong distance for bad input.
- Fast path for identical points (including identical points straddling the antimeridian); clamps the intermediate haversine term to `[0, 1]` to guard against floating-point error on near-antipodal points.

## Where It Lives

- `lib/validNow.ts` — the validity engine.
- `lib/vancouverTime.ts` — timezone-correct part formatting.
- `lib/distance.ts` — the haversine function.
- `lib/dealSelection.ts#selectDeals` — the shared feed/map filter+sort engine: price filter (strict `<` threshold; a missing price always counts as included, never excluded), validity via `validNow`, optional distance via `distanceKm`, deterministic sort (valid-first → nearest-first → newest → id tie-break).
- `lib/mapPage.ts#selectDeals` — wraps `dealSelection.ts`'s version and layers UI-level sort overrides (`sortByNewest`/`sortByPrice`/`sortByDistance`/`sortByTime`) and a "valid now" time filter on top.
- `lib/dealWrite.ts#rankByDistance` — the server-side nearby-query ranking, also built on `distanceKm` (see [[Canonical Deal Publishing]]).

## Key Details

- The same `validNow` function backs both the feed's "valid now" badge and the map page's filtering — there is exactly one validity implementation in the whole app, not one per UI surface.
- `lib/mapPage.ts#viewerLocation` uses the same Web Mercator latitude bound (±85.05112878°) as the map package's own validator (`map-component/src/data.ts`) and the real `deals.listNearby` query — kept consistent across three independent call sites.

## Sources

- [[Source - Project Process Docs]]
