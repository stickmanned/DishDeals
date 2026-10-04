# Handoff: N-MAP-B — Saved-Deal Map Route and Canonical Detail Controls

- **Ticket**: N-MAP-B
- **Worker**: Cinder (temporal / logic / map integration specialist)
- **Worktree**: `/Users/william/Code/DishDeals-worktrees/map-route-bindings`
- **Branch**: `t-21-saved-deal-map`
- **Base Commit**: `44133042340c5d4a140453a63aa445edc163e637`
- **Status**: Completed and verified

---

## 1. Scope & Implementation Summary

In accordance with central task packet `workflow/docs/tasks/N-MAP-B.md` and authorized writable paths:

1. **Pure Selection & ID Validation (`lib/mapPage.ts` & `tests/map/mapPage.test.ts`)**:
   - `selectDeals`: Client-side filtering and sorting engine for canonical deals.
     - Price filters: `any`, `under5`, `under10`, `under15`. Deals with unlisted prices (`priceCad === undefined || priceCad === null`) are explicitly included across all filters per specification.
     - Time filters: `all` and `valid-now`. Valid now uses client-side America/Vancouver temporal engine [`validNow`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/lib/validNow.ts).
     - Sorting: `newest` (by `_creationTime` desc), `price` (low to high, unlisted at end), `time` (valid deals first ending soonest by `minutesLeft`), `distance` (Haversine distance via `distanceKm`).
     - Distance fallback: When user location is absent, denied, or invalid, distance sort truthfully falls back to `newest` without inventing fake coordinates or mock distances.
   - `isValidDealId`: Rejects empty strings, path traversal (`../`), script tags, spaces, and demo IDs.
   - `isDemoDealId`: Identifies `demo-*` IDs.
   - `safeSourceUrl`: Validates HTTP/HTTPS source URLs (length ≤ 2048, no credentials, valid hostname).
   - `formatValidityLabel`: Formats user-facing validity strings and remaining minutes.

2. **Map Route (`app/map/page.tsx` & `components/maps/CanonicalDealMapPage.tsx`)**:
   - Reactive Convex query: `api.deals.listRecent({ limit: 50 })`.
   - Map section dominates the viewport with embedded [`PublishedDealMap`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/maps/PublishedDealMap.tsx).
   - User-triggered location hint with 10s finite timeout; displays clear fallback alert if denied or unavailable.
   - Truthful notice: "Showing up to 50 recent deals across Metro Vancouver." No claim of complete spatial index or cross-device nearby acceptance.
   - Supporting minimal deal list below the map synchronized with marker selection (`selectedId`).
   - Clicking deal cards or map markers routes to `/deal/[id]`.

3. **Canonical Deal Details & Route (`app/deal/[id]/page.tsx` & `components/deals/CanonicalDealDetails.tsx`)**:
   - In `app/deal/[id]/page.tsx`: Retains Harry's preview component [`DealDetails`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/components/frontend/DealDetails.tsx) for all `demo-*` IDs.
   - Validates live IDs with `isValidDealId`. Invalid or non-existent IDs render clean 404 empty states.
   - Queries `api.deals.get({ dealId })` and `api.users.me()`.
   - Author controls: Enabled when `me.userId === deal.authorId`. Clicking edit or delete displays non-intrusive status notes stating backend operations are pending integration (no fake success).
   - Community voting: Calls `api.votes.cast({ dealId, value })` with duplicate prevention (`votingBusy`) and retryable error state on mutation failure. Unauthenticated viewers are linked to `/signin?next=/deal/[id]`.
   - Embedded confirmed location map: Deals with confirmed coordinates render `PublishedDealMap` centered on the deal location with external directions link.

4. **Navigation Integration (`components/frontend/Shell.tsx`)**:
   - Added `/map` link to desktop navigation (`<Link href="/map">Map</Link>`).
   - Added `/map` link to mobile navigation (`<Link href="/map"><Icon name="pin" /><span>Map</span></Link>`).
   - Preserved all existing layout classes, styling, Discover, Share a deal, and Saved Reels entries.

5. **Worker Asset Packaging & Turbopack Compatibility (`map-component/vite.config.ts` & `scripts/map-assets.mjs`)**:
   - Added `sanitizeTurbopackDynamicUrl` Rollup plugin in `map-component/vite.config.ts` to sanitize dynamic `new URL(identifier, import.meta.url)` calls in MapLibre dependencies, preventing Next.js Turbopack AST analyzer errors.
   - Verified that Next.js Turbopack emits the real MapLibre worker bytes into `.next/static/media/maplibre-gl-worker-CsdWlX0D.0107s-ze5jc6m.js` (510,000 bytes).
   - Created [`scripts/map-assets.mjs`](file:///Users/william/Code/DishDeals-worktrees/map-route-bindings/scripts/map-assets.mjs) inspection script, verifying both the child distribution worker and Next.js static media worker.

---

## 2. Modified & Created Paths

All changes strictly conform to the allowed writable paths for N-MAP-B:
- `lib/mapPage.ts` (created)
- `tests/map/mapPage.test.ts` (created)
- `components/maps/CanonicalDealMapPage.tsx` (created)
- `app/map/page.tsx` (created)
- `components/deals/CanonicalDealDetails.tsx` (created)
- `app/deal/[id]/page.tsx` (modified)
- `components/frontend/Shell.tsx` (modified)
- `map-component/vite.config.ts` (modified)
- `scripts/map-assets.mjs` (created)
- `docs/integration/map-route.md` (created)
- `docs/handoffs/n-map-b.md` (created)

---

## 3. Verification Commands & Evidence

1. **Central Ownership Check**:
   ```bash
   node /tmp/dishdeals-owner-check.mjs N-MAP-B
   # Output: approved centralized packet ownership PASS
   ```

2. **Child Map Component Tests**:
   ```bash
   npm --prefix map-component run test
   # Output: pass 3, fail 0
   ```

3. **Map Unit Tests**:
   ```bash
   npx vitest run tests/map
   # Output: 3 test files passed (mapAdapter.test.ts, mapPage.test.ts, dealLocationPicker.test.ts), 40 tests passed
   ```

4. **Map Worker Asset Packaging Verification**:
   ```bash
   node scripts/map-assets.mjs
   # Output:
   # PASS: Found child worker asset: maplibre-gl-worker-CsdWlX0D.js (510000 bytes)
   # PASS: Found Next.js static media worker: maplibre-gl-worker-CsdWlX0D.0107s-ze5jc6m.js (510000 bytes)
   # PASS: Worker bytes verified (509720 characters). Next.js serves real worker bytes at /_next/static/media/maplibre-gl-worker-CsdWlX0D.0107s-ze5jc6m.js
   # All MapLibre asset packaging checks passed.
   ```

5. **Full Quality Gate (`npm run check`)**:
   ```bash
   npm run check
   # 1. npm run build:map -> Vite built client environment in 319ms
   # 2. npm run typecheck -> tsc --noEmit exited 0
   # 3. npm run lint -> eslint . exited 0
   # 4. npm run test -> 28 test files passed (678 passed)
   # 5. npm run test:workflow -> 23 tests passed
   # 6. npm run build -> Compiled successfully in 724ms; generated static pages for ○ /map and ƒ /deal/[id]
   ```

---

## 4. Pending / Deferred Verification

- **Live Browser Interactivity / Real Tile Rendering**: Not executed due to browser sandbox restrictions; verified via component structure, synthetic unit tests, and production build artifact checks.
- **Physical iOS Device / WKWebView**: Native execution and real device location permissions remain pending coordinator device QA.
- **Nearby Index API**: Currently utilizes the truthful `listRecent(50)` fallback; future nearby indexing and pagination will be integrated under an assigned ticket.

---

## 5. Teammate Reconciliation Report (`origin/t-21-frontend-integration3b0a034`, `origin/t-22-smart-sharing0a73f3e`, `origin/t-23-web-discoveryf05e09d`)

1. **Map Package Consistency**:
   - Both lines use `@restaurant-deals/map@0.2.0` (commit `34c622c` of `map-component`).
   - Pinyuan's `components/OfferMap.tsx` provides a simple dynamic loader for `DealMap`.
   - Our canonical `PublishedDealMap.tsx` provides a full pure adapter layer (`toCanonicalMapDeals`), error boundaries, controlled selection, and Web Mercator bounds validation.
   - `CanonicalDealDetails.tsx` adopts Pinyuan's verified location panel styling pattern (`initialZoom={14}`, `fitOnLoad={false}`, `style={{ height: 320 }}`, ariaLabel "verified location").

2. **Backend Contract Integrity**:
   - Pinyuan's branches introduce experimental workflow tables (`workflowDeals`, `workflowRestaurants`, `workflowJobs`, `workflowLimits`, `workflowSearchLimits`) and anonymous guest auth sessions for `/tools/`.
   - Per Northstar and coordinator rules, these APIs are not the canonical backend. The canonical DishDeals backend relies on the authoritative `deals`, `profiles`, and `votes` tables with authenticated user sessions (`getAuthUserId(ctx)`).
   - Our map and detail routes strictly consume the canonical backend (`api.deals.listRecent`, `api.deals.get`, `api.votes.cast`, `api.users.me`), preserving schema integrity and real user attribution without adopting anonymous session workarounds.

3. **Routing Model**:
   - Pinyuan introduced query-string routing `/deal?id=...` and `/tools` for static GitHub Pages export.
   - The authoritative StormHacks project plan and N-MAP-B packet require canonical `/map` and dynamic `/deal/[id]` routes.
   - `app/deal/[id]/page.tsx` cleanly branches `demo-*` mock deals to Harry's preview component and real database IDs to `CanonicalDealDetails`.
   - `CanonicalDeal` in `lib/mapPage.ts` supports both `_id` and optional `id` fields to ensure compatibility if records are shared across boundaries.

---

## 6. Next Steps
- Scoped local commit on `t-21-saved-deal-map`.
- Direct handoff to Northstar for integration review.

