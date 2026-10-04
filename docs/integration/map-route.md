# Map Route and Canonical Deal Controls Integration

## Overview

This document specifies the integration of the canonical `/map` route, the interactive restaurant deal map, navigation bindings, and the canonical `/deal/[id]` route controls for DishDeals.

---

## 1. Route Specifications

### `/map` — Interactive Deal Map
- **Component**: [`CanonicalDealMapPage`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/maps/CanonicalDealMapPage.tsx)
- **Data Source**: Reactive Convex query `api.deals.listRecent({ limit: 50 })`.
- **Filtering & Sorting Engine**: [`selectDeals`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/lib/mapPage.ts)
  - **Price Filters**: `any`, `under5` (≤ $5 CAD), `under10` (≤ $10 CAD), `under15` (≤ $15 CAD). Deals with unlisted prices (`priceCad === undefined || priceCad === null`) are explicitly included in all filters.
  - **Hours / Time Filters**: `all` (all recent deals) and `valid-now` (client-evaluated America/Vancouver validity via [`validNow`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/lib/validNow.ts)).
  - **Sorting**:
    - `newest`: Sorted by `_creationTime` descending.
    - `price`: Sorted by `priceCad` ascending (unlisted prices placed at the end).
    - `time`: Valid deals sorted first (ending soonest first by `minutesLeft`), followed by later today, unlisted hours, not today, and expired.
    - `distance`: Sorted by Haversine distance (`distanceKm`) relative to browser-provided coordinates. When user location is denied, unavailable, or times out, the engine truthfully falls back to `newest` without inventing fake coordinates or mock distances.
- **Location Hint**:
  - User-triggered "Near me" button requests browser geolocation with a 10-second finite timeout.
  - When permission is denied or times out, a clear non-blocking status message is displayed informing the user that newest sorting is used.
- **Map & List Synchronization**:
  - The map dominates the route viewport using [`PublishedDealMap`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/maps/PublishedDealMap.tsx).
  - A supporting list displays the exact same filtered records below the map.
  - Marker clicks synchronize with list selection, and selecting an item in the list highlights its pin on the map.
  - Both cards and map markers route to `/deal/[id]`.
- **Fallback Notice**:
  - Explicitly states: "Showing up to 50 recent deals across Metro Vancouver." No claim of complete spatial index or cross-device nearby acceptance is made.

---

### `/deal/[id]` — Canonical & Preview Deal Details
- **Routing**: [`app/deal/[id]/page.tsx`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/app/deal/%5Bid%5D/page.tsx)
  - Demo IDs (`demo-*` via [`isDemoDealId`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/lib/mapPage.ts)): Retains Harry's original preview component [`DealDetails`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/frontend/DealDetails.tsx).
  - Real database IDs: Handled by [`CanonicalDealDetails`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/deals/CanonicalDealDetails.tsx).
- **Validation**:
  - Database IDs are validated with [`isValidDealId`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/lib/mapPage.ts) (alphanumeric identifier guard). Malformed IDs, traversal patterns, or invalid characters render a clean 404 empty state rather than querying the backend with corrupt arguments.
- **Data Source**:
  - `api.deals.get({ dealId })`: Enriched canonical deal with `authorName`, `authorWallet`, `imageUrl`, and `viewerVote`.
  - `api.users.me()`: Authenticated viewer profile.
- **Author Controls**:
  - Author identity verified by comparing `me.userId === deal.authorId`.
  - Author edit/delete actions display non-intrusive notifications stating that live edit/delete operations are pending upcoming backend integration (no fake success messages).
- **Community Voting**:
  - Calls `api.votes.cast({ dealId, value: "still_on" | "expired" })`.
  - Unauthenticated users are redirected to `/signin?next=/deal/[id]`.
  - Genuine network or mutation failures display retryable error feedback while preserving current vote counts.
  - Busy guard prevents duplicate concurrent submissions.
- **Embedded Location Map**:
  - Deals with confirmed coordinates embed [`PublishedDealMap`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/maps/PublishedDealMap.tsx) showing the single confirmed location.
  - Directions link safely opens OpenStreetMap for external navigation.

---

## 2. Navigation Updates

In [`components/frontend/Shell.tsx`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/frontend/Shell.tsx):
- **Desktop Navigation**: Added `<Link href="/map">Map</Link>` between Discover and Share a deal.
- **Mobile Navigation**: Added `<Link href="/map"><Icon name="pin" /><span>Map</span></Link>`.
- Existing Saved Reels entry, Discover, Post, and Profile links and Harry's layout classes remain completely intact.

---

## 3. Worker Asset Packaging & Turbopack Compatibility

- In `@restaurant-deals/map` (`map-component/vite.config.ts`), a custom Rollup plugin (`sanitizeTurbopackDynamicUrl`) ensures dynamic MapLibre worker expressions in bundled dependencies are sanitized to avoid triggering Turbopack's static analysis errors.
- Turbopack resolves the worker asset `maplibre-gl-worker-CsdWlX0D.js` and emits it into `.next/static/media/` (510,000 bytes).
- The asset verification script [`scripts/map-assets.mjs`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/scripts/map-assets.mjs) confirms the presence and integrity of both the child distribution worker and the Next.js static media worker.

---

## 4. Teammate Branch Reconciliation (Read-Only Inspection)

Inspection of `origin/t-21-frontend-integration` (`3b0a034`), `origin/t-22-smart-sharing` (`0a73f3e`), and `origin/t-23-web-discovery` (`f05e09d`):

1. **Map Component Version**:
   - Both lines of work use `@restaurant-deals/map@0.2.0` (commit `34c622c` of `map-component`). No map divergence exists.
   - Pinyuan's `components/OfferMap.tsx` wraps `@restaurant-deals/map` with a simple dynamic loader (`dynamic(() => import(...).then(m => m.DealMap), { ssr: false })`).
   - Our canonical [`PublishedDealMap.tsx`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/maps/PublishedDealMap.tsx) provides a full pure adapter layer (`toCanonicalMapDeals`), error boundaries, controlled selection, and Web Mercator bounds validation.
   - In [`CanonicalDealDetails.tsx`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/deals/CanonicalDealDetails.tsx), we aligned the embedded map panel styling and configuration with Pinyuan's `OfferMap` verified location pattern (`initialZoom={14}`, `fitOnLoad={false}`, `style={{ height: 320 }}`, ariaLabel "verified location").

2. **Backend & Data Boundary Preservation**:
   - Pinyuan's branches introduce workflow-specific tables (`workflowOffers`, `workflowJobs`, `workflowDrafts`) and anonymous guest auth sessions for experimental AI tools (`/tools`).
   - Per Northstar and coordinator rules, these APIs are not the canonical backend. The canonical DishDeals backend relies on the authoritative `deals`, `profiles`, and `votes` tables with authenticated user sessions (`getAuthUserId(ctx)`).
   - Our map and detail routes strictly consume the canonical backend (`api.deals.listRecent`, `api.deals.get`, `api.votes.cast`, `api.users.me`), preserving schema integrity and real user attribution without adopting anonymous session workarounds.

3. **Routing Separation**:
   - Pinyuan introduced `/deal?id=...` and `/tools` for static GitHub Pages builds.
   - The authoritative StormHacks project plan and N-MAP-B packet specify canonical `/map` and dynamic `/deal/[id]` routes.
   - In [`app/deal/[id]/page.tsx`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/app/deal/%5Bid%5D/page.tsx), `demo-*` mock deals continue using Harry's preview component while real database IDs use `CanonicalDealDetails`.
   - `CanonicalDeal` in `lib/mapPage.ts` supports both `_id` and optional `id` fields to ensure compatibility if records are shared across boundaries.

