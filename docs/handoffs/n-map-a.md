# N-MAP-A Handoff: Published Map Location & Controlled Picker

## Ticket Summary
- **Ticket ID**: N-MAP-A
- **Worker**: Cinder (temporal / logic / map integration)
- **Worktree**: `/Users/william/Code/DishDeals-worktrees/published-map-location`
- **Branch**: `t-08-published-map-location`
- **Pinned Base**: `1eb2e7cb4f094aa1a7a460889686fdf31e8355aa`
- **Incorporated Source**: Pinyuan's `map-component` from `34c622c228e58e083e2aa2e9ffe630efcf97e09e` via `git archive`

---

## Changes Implemented

### 1. Reusable Map Engine Enhancements (`map-component/`)
- Preserved existing vector (`MapLibreView`) and raster (`RasterView`) fallback engines and APIs.
- Extended `types.ts` to support `DraftLocation`, `draftLocation`, `onDraftLocationChange`, `isDraftDraggable`, and `onMapClick`.
- Added `makeDraftPin` in `markers.ts` supporting unconfirmed (`.bitemap-draft-pin-proposed`) and confirmed (`.bitemap-draft-pin-confirmed`) states, with title, aria labels, and stopPropagation on clicks.
- Added draft marker lifecycle management to `MapLibreView.tsx` and `RasterView.tsx`, enabling real-time map click proposals and marker drag events that call `onDraftLocationChange`.
- Styled draft pins in `styles.css`.
- Packaged Vite distribution (`dist/index.js`, `dist/map.css`, `dist/index.d.ts`) with Next.js compatibility.

### 2. Config & Root Package Scoping
- Linked `@restaurant-deals/map: "file:./map-component"` in `package.json` with `"build:map"` script.
- Scoped root configuration to exclude `map-component` from double-checking while maintaining its own standalone checks:
  - `tsconfig.json`: Added `"map-component"` to `"exclude"`.
  - `eslint.config.mjs`: Added `"map-component/**"` to `globalIgnores`.
  - `vitest.config.ts`: Added `"map-component/**"` to `exclude`.

### 3. Pure Deal Adapter (`lib/mapAdapter.ts`)
- Implemented `toCanonicalMapDeal` and `toCanonicalMapDeals`.
- Maps `_id` → `id`, `restaurant` → `restaurantName`, `dealText` → `title`, `lat`/`lng` → `latitude`/`longitude`.
- Only attaches `currency: "CAD"` when `priceCad` is a finite, non-negative number (no invented currency).
- Preserves `sourceUrl` and `expiresOn` (as `expiresAt`) without inventing fallback timestamps.
- Enforces strict Web Mercator coordinate validation (`|lat| <= 85.05112878`, `|lng| <= 180`); rejects invalid numbers, non-strings, or empty records.
- Deduplicates deals by `_id`.

### 4. Published Deals Map Wrapper (`components/maps/PublishedDealMap.tsx`)
- Client-only lazy loaded component wrapping `DealMap`.
- Accepts canonical saved deal records and converts them with `toCanonicalMapDeals`.
- Maps deal selection callback to the original `CanonicalSavedDeal`.
- Passes through viewport and styling props.

### 5. Controlled Location Picker (`components/maps/DealLocationPicker.tsx`)
- Controlled interface: `{ restaurant, address, location, search?, onConfirm }`.
- Viewport initialized to Burnaby context (`center: [-122.9805, 49.2488]`, `zoom: 12`).
- Marker dragging and map clicking propose unconfirmed draft locations (`confirmed: false`).
- Separate explicit "Confirm location" button is required to invoke `onConfirm`.
- Explicit "Search" button (no auto-search or keystroke queries).
- Candidate results display label and search provider attribution.
- Safe async request identity guard (`searchRequestId` monotonic ref) discards stale out-of-order search results.
- Edits to `restaurant` or `address` clear stale candidates, reset search state, and cancel in-flight queries.
- "Use my location" button uses `navigator.geolocation` only as an unconfirmed hint.
- Keeps draft pins completely isolated from published deals (`deals={[]}`).

### 6. Tests (`tests/map/`)
- `tests/map/mapAdapter.test.ts`: Tests pure adapter field mapping, CAD currency rules, coordinate validation, rejection of invalid records, and deduplication.
- `tests/map/dealLocationPicker.test.ts`: Tests exported TypeScript interfaces, async monotonic request ID guard, form edit invalidation, and explicit confirmation logic.

### 7. Contract Documentation (`docs/integration/map-contract.md`)
- Documents interfaces and behavioral contracts for downstream form writers.

---

## Verification & Checks Executed

1. **Map Component Tests**:
   `npm --prefix map-component run test`
   Result: **PASS** (3/3 tests passed in 91ms)

2. **Map Component Package Build & Types**:
   `npm --prefix map-component run build && npm --prefix map-component run typecheck`
   Result: **PASS** (Vite build in 230ms, tsc emitted type definitions cleanly)

3. **Root Typecheck**:
   `npm run typecheck`
   Result: **PASS** (`tsc --noEmit`, 0 errors)

4. **Root Lint**:
   `npm run lint`
   Result: **PASS** (`eslint .`, 0 errors)

5. **Root Test Suite**:
   `npm run test`
   Result: **PASS** (23 test files, 509 tests passed)

6. **Agent Workflow Verification**:
   `npm run test:workflow`
   Result: **PASS** (23 tests passed)

7. **Production Next.js Build**:
   `npm run build`
   Result: **PASS** (Compiled successfully, static pages generated for all 8 routes)

8. **Central Ownership Guard**:
   `node /tmp/dishdeals-owner-check.mjs N-MAP-A`
   Result: **PASS** (approved centralized packet ownership)

---

## Pending Items (Outside Ticket Scope)
- **Live Tile Rendering / WKWebView / Native Execution**: Real tile loading and native webview inspection require a live device/simulator run.
- **Geocoding Backend Integration**: No third-party geocoding API or network calls were implemented; geocoding provider wiring remains to be configured in a subsequent task.
- **Route Mounting / Form Integration**: Wrapper components are export-ready and tested; mounting to user-facing intake screens belongs to frontend ownership (Harry).
