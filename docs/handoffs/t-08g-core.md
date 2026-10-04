# T-08G-CORE Handoff · Bounded Geocode Policy & Transport Core

- **Status**: Complete and verified locally; ready for coordination review.
- **Owner**: Prism (Gemini / Antigravity Research Specialist)
- **Branch**: `t-08-geocode-policy-core`
- **Worktree**: `/Users/william/Code/DishDeals-worktrees/geocode-policy-core`
- **Base SHA**: `1eb2e7cb4f094aa1a7a460889686fdf31e8355aa` (origin/main)
- **Scope and Allowed Paths**:
  - `lib/geocodeCore.ts`
  - `tests/geocode/`
  - `docs/integration/geocode-policy.md`
  - `docs/handoffs/t-08g-core.md`

---

## 1. Summary of Deliverables

1. **Deterministic Geocoding Policy & Transport Core (`lib/geocodeCore.ts`):**
   - Implements the headless geocoding engine strictly conforming to OpenStreetMap / Nominatim usage policies.
   - Enforces query validation (2–120 characters, alphanumeric requirement, rejects control characters, newlines, null bytes, URLs, and HTML tags).
   - Enforces identifying `User-Agent` with contact information per Nominatim policy.
   - Enforces HTTPS on public endpoints with server-configurable provider switching.
   - Enforces Metro Vancouver bounding box (`METRO_VANCOUVER_BBOX`: -123.35 to -122.55 lng, 49.00 to 49.45 lat), double-validating raw provider coordinates.
   - Injects global rate-limit slot reservation (`reserveGlobalSlot`) coordinating application-wide max 1 req/sec without assuming shared process memory.
   - Injects cache get/put abstractions; cache hits bypass slot reservation and network calls entirely.
   - Returns actionable `retryAfterMs` on slot reservation denial without executing provider requests or creating duplicate queued calls.
   - Exports required OpenStreetMap copyright attribution (`OSM_ATTRIBUTION`).
   - Pure headless library: **zero Convex imports, zero schema changes, zero UI modifications**.

2. **Comprehensive Unit Test Suite (`tests/geocode/geocodeCore.test.ts`):**
   - 27 unit tests covering query validation, User-Agent policy, Metro Vancouver bounding box, cache hit bypassing, global slot denial handling, HTTP 429 Retry-After parsing, HTTP 503/500/timeout handling, malformed JSON body handling, out-of-bounds coordinate filtering, and zero-guess empty results.
   - Deterministic in-memory mocks: **zero real network requests to Nominatim, zero external accounts**.

3. **Policy Documentation (`docs/integration/geocode-policy.md`):**
   - Documents Nominatim usage policy compliance, rate limits, User-Agent standards, attribution, no-autocomplete rules, caching, bounding box comparison, and primary source URLs.

4. **Ticket Handoff (`docs/handoffs/t-08g-core.md`):**
   - This document.

---

## 2. Checks Actually Run

| Command / Check | Result | Evidence / Notes |
| :--- | :--- | :--- |
| **Central Ownership Guard** | **PASS (exit 0)** | `node /tmp/dishdeals-owner-check.mjs T-08G-CORE` approved centralized packet ownership. |
| **New Geocode Test Suite** | **PASS (27/27 passed)** | `npm test -- --environment node tests/geocode/geocodeCore.test.ts` executed cleanly in 81ms. |
| **Full Local Test Suite** | **PASS (162/162 passed)** | `npm test -- --environment node lib/*.test.ts tests/geocode/*.test.ts` (8 test suites, 0 failures). |
| **TypeScript Compilation** | **PASS (0 errors)** | `npx tsc --noEmit --target ES2022 --moduleResolution bundler --module ESNext lib/geocodeCore.ts tests/geocode/geocodeCore.test.ts`. |
| **ESLint Validation** | **PASS (0 errors, 0 warnings)** | `npx eslint lib/geocodeCore.ts tests/geocode/geocodeCore.test.ts`. |
| **Workflow Integrity Test** | **PASS (23/23 passed)** | `npm run test:workflow` (`node --test scripts/agent-workflow.test.mjs`). |
| **Git Working Tree Inspection** | **PASS (Clean)** | All created/modified files strictly within `allowedPaths`. |

---

## 3. Unrun Checks & Why

- **Live Nominatim Requests:** Unrun. OpenStreetMap policy prohibits unnecessary automated testing against public donation-funded servers; all adapter tests use deterministic mocked transports.
- **Convex Action Wrapper:** Unrun. Authentication check (`getAuthUserId`) and durable database slot lease / cache table implementation belong to the downstream schema writer handoff.
- **Interactive Map Pin UI:** Unrun. Frontend draggable pin interaction and Leaflet component belong to teammate Harry / map integration.
- **Phone / Device Acceptance:** Unrun. Device-level posting flow belongs to downstream integration.

---

## 4. Contractual Disclosures & Downstream Pending Scope

1. **No Coordinates Synthesized:** `geocodeCore` proposes candidates returned by the provider. If no candidates match, it returns `[]` without fabricating fake pins.
2. **Auth Layer Decoupled:** `geocodeCore` is a transport and policy engine; authentication enforcement is performed at the Convex action boundary (`convex/geocode.ts`).
3. **Durable Coordination:** Distributed rate limiting (max 1 req/sec) and durable caching will be wired by Northstar in the Convex action wrapper using database state.
