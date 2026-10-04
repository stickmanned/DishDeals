# N-MAP-A Handoff: Published Map Location & Controlled Picker (Post-Review Corrections)

## Ticket Summary
- **Ticket ID**: N-MAP-A
- **Worker**: Cinder (temporal / logic / map integration)
- **Worktree**: `/Users/william/Code/DishDeals-worktrees/published-map-location`
- **Branch**: `t-08-published-map-location`
- **Pinned Base**: `1eb2e7cb4f094aa1a7a460889686fdf31e8355aa`
- **Incorporated Source**: Pinyuan's `map-component` from `34c622c228e58e083e2aa2e9ffe630efcf97e09e` via `git archive`

---

## Corrections Implemented (Review Findings Addressed)

1. **Replaced Synthetic Test Stand-ins with Exported Production Helpers**:
   - `tests/map/dealLocationPicker.test.ts` now imports and directly exercises the exact production logic exported from `components/maps/DealLocationPicker.tsx`: `isValidLocationPoint`, `filterValidCandidates`, `LocationSearchGuard`, `applyNewProposal`, and `confirmProposal`.
   - Tested candidate filtering, out-of-bounds geographic rejection, async search race conditions, search input edit invalidation, late geolocation guard, proposal invalidation lifecycle, and confirmation.

2. **Explicit Required `onInvalidate` Callback Contract**:
   - Added `onInvalidate?: () => void` to `DealLocationPickerProps`.
   - Invoked immediately whenever a new proposal is created via marker drag, canvas click, candidate selection, or browser location arrival.
   - Documented contract ensures parent form clears confirmation so unconfirmed/moved pins cannot be published inadvertently.

3. **Preserving Proposal Point When Confirmation is Cleared**:
   - When parent updates `location.confirmed` from `true` to `false` (following `onInvalidate`), the current coordinates are preserved in local state so the user can inspect or fine-tune them.
   - Proposals are strictly cleared when the user edits `restaurant` or `address` or parent explicitly passes `null`.

4. **Search Input Edit & Geolocation Context Guard**:
   - Typing in the search query input immediately invalidates previous search requests.
   - Browser geolocation callbacks check against the active monotonic search request ID and context epoch; late geolocation arrivals after form edits are safely discarded.

5. **Finite Geographic Bounds Validation**:
   - All proposed points and candidate coordinates are bounds-checked (`|lat| <= 85.05112878`, `|lng| <= 180`, finite numbers) before being accepted as proposals or confirmed.

6. **Actionable Import Error Handling**:
   - Both `PublishedDealMap` and `DealLocationPicker` show a clear, user-facing error message if dynamic loading of the map module fails, instead of hanging on a permanent "Loading map…" spinner.
   - Removed raw console error dumps.

7. **OpenStreetMap Attribution**:
   - Candidate search attribution now explicitly references and links OpenStreetMap contributors: `Search data © <a href="https://www.openstreetmap.org/copyright" ...>OpenStreetMap contributors</a>`.

8. **Deterministic Build & Clean-Clone Setup**:
   - Updated root `package.json` scripts:
     - `"build": "npm run build:map && next build"`
     - `"check": "npm run build:map && npm run typecheck && npm run lint && npm run test && npm run test:workflow && npm run build"`
   - Verified clean rebuild: moved `map-component/dist` away, executed `npm run build`, and verified `dist/` is automatically built via Vite + tsc before Next.js compiles.
   - Noted limitation: Because wrapper components are unmounted from live app routes (Harry owns frontend mounting), Next production build confirms TypeScript/bundler/worker syntax compatibility, not live interactive browser UI proof.

9. **Isolation of Confirmed Pins from Feed**:
   - `DealLocationPicker` strictly passes `deals={[]}` to `DealMap` so draft and manual confirmation pins remain isolated from the published feed.

---

## Verification & Checks Executed

1. **Map Component Tests**:
   `npm --prefix map-component run test`
   Result: **PASS** (3/3 tests passed in 91ms)

2. **Map Component Package Build & Types**:
   `npm --prefix map-component run build && npm --prefix map-component run typecheck`
   Result: **PASS** (Vite build in 228ms, tsc emitted type definitions cleanly)

3. **Clean Build Rebuild Test**:
   `mv map-component/dist /tmp/... && npm run build`
   Result: **PASS** (Vite + tsc ran first via `build:map`, Next.js 16 compiled 8/8 routes)

4. **Root Typecheck**:
   `npm run typecheck`
   Result: **PASS** (`tsc --noEmit`, 0 errors)

5. **Root Lint**:
   `npm run lint`
   Result: **PASS** (`eslint .`, 0 errors, 0 warnings)

6. **Root Test Suite**:
   `npm run test`
   Result: **PASS** (23 test files, 517 tests passed, including 12 dealLocationPicker tests)

7. **Agent Workflow Verification**:
   `npm run test:workflow`
   Result: **PASS** (23 tests passed)

8. **Central Ownership Guard**:
   `node /tmp/dishdeals-owner-check.mjs N-MAP-A`
   Result: **PASS** (approved centralized packet ownership)

---

## Pending Items (Outside Ticket Boundary)
- **Live Tile Rendering / WKWebView / Native Execution**: Real WebGL vector tiles and WKWebView bridge execution require a live device or simulator runtime test.
- **Geocoding Backend Integration**: Geocoding provider resolution remains to be configured in a subsequent task.
- **Route Mounting / Form Integration**: Mounting `DealLocationPicker` to user-facing intake screens belongs to Harry's frontend ownership.
