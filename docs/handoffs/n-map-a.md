# N-MAP-A Handoff: Published Map Location & Controlled Picker (Second Review Corrections)

## Ticket Summary
- **Ticket ID**: N-MAP-A
- **Worker**: Cinder (temporal / logic / map integration)
- **Worktree**: `/Users/william/Code/DishDeals-worktrees/published-map-location`
- **Branch**: `t-08-published-map-location`
- **Pinned Base**: `1eb2e7cb4f094aa1a7a460889686fdf31e8355aa`
- **Incorporated Source**: Pinyuan's `map-component` from `34c622c228e58e083e2aa2e9ffe630efcf97e09e` via `git archive`

---

## Second Review Corrections Implemented

1. **Preserving Proposals on Parent Invalidation (`location` prop → `null`)**:
   - Implemented and exported `resolveLocationPropUpdate(currentProposedPoint, newLocation)`.
   - When parent responds to `onInvalidate` by setting `location = null` or `confirmed = false`, the active `proposedPoint` is preserved in local component state with `isConfirmed: false`. Newly dragged/clicked proposals are no longer erased by parent confirmation clearance.
   - Proposals are strictly cleared when `restaurant` or `address` changes.

2. **Form Context Invalidation & Input Edit Reset**:
   - `useEffect` listening to `[restaurant, address]` executes `searchGuard.current.invalidate()`.
   - Search promise resolution checks `searchGuard.current.isCurrent(reqId)` against the live ref, safely discarding out-of-order responses from prior form contexts.
   - `handleSearchQueryChange` resets `isSearching: false`, clears `candidates: []`, and calls `searchGuard.current.invalidate()`, preventing lingering spinners or disabled search buttons after ignored requests.
   - Implemented and exported `resetFormContextState(restaurant, address)`.

3. **Deterministic Clean Setup & Build (Child Prerequisite Management)**:
   - Added root script: `"setup:map": "npm --prefix map-component ci --cache /tmp/dishdeals-npm-cache --prefer-offline --no-audit --no-fund"`.
   - Updated root build script: `"build:map": "npm run setup:map && npm --prefix map-component run build"` and `"build": "npm run build:map && next build"`.
   - Added explicit build tooling to root `devDependencies`: `"vite": "8.0.13"`, `"@types/leaflet": "^1.9.21"`.
   - **Clean-Clone Setup Proof**: Created a temporary clean directory (`/tmp/dishdeals-clean-test`), extracted tree via `git archive`, ran clean root `npm ci`, and verified `npm run build` cleanly executed `setup:map`, compiled `map-component/dist` in 523ms, and finished Next.js 16 production build in 1.8s with 8/8 routes generated.
   - Tested and verified clean without relying on inherited `node_modules`.

4. **Actionable Import Failure UI in Both Wrappers**:
   - `PublishedDealMap` and `DealLocationPicker` both present an actionable user-facing error message with styled alert containers if dynamic loading of `@restaurant-deals/map` fails.
   - Removed raw console error dumping.

5. **Tested Production Helpers**:
   - `tests/map/dealLocationPicker.test.ts` directly exercises `resolveLocationPropUpdate`, `resetFormContextState`, `isValidLocationPoint`, `filterValidCandidates`, `LocationSearchGuard`, `applyNewProposal`, and `confirmProposal`.
   - All 15 tests in `dealLocationPicker.test.ts` and 9 tests in `mapAdapter.test.ts` pass (24/24).

---

## Verification & Checks Executed

1. **Map Component Tests**:
   `npm --prefix map-component run test`
   Result: **PASS** (3/3 tests)

2. **Clean Checkout Proof**:
   `/tmp/dishdeals-clean-test`: `npm ci` + `npm run build`
   Result: **PASS** (Child dependencies installed via `setup:map`, Vite + tsc bundle generated, Next.js 16 compiled 8/8 static routes)

3. **Root Typecheck**:
   `npm run typecheck`
   Result: **PASS** (`tsc --noEmit`, 0 errors)

4. **Root Lint**:
   `npm run lint`
   Result: **PASS** (`eslint .`, 0 errors, 0 warnings)

5. **Map Unit Test Suite**:
   `npx vitest run tests/map`
   Result: **PASS** (2 test files, 24 tests passed)

6. **Agent Workflow Verification**:
   `npm run test:workflow`
   Result: **PASS** (23 tests passed)

7. **Central Ownership Guard**:
   `node /tmp/dishdeals-owner-check.mjs N-MAP-A`
   Result: **PASS** (approved centralized packet ownership)

---

## Pending Items (Outside Ticket Boundary)
- **Live Tile Rendering / WKWebView / Native Execution**: Real WebGL vector tiles and WKWebView bridge execution require a live device or simulator runtime test; local browser execution was not run.
- **Route Mounting**: Wrapper components are export-ready and tested; mounting to user-facing intake screens belongs to Harry's frontend ownership.
