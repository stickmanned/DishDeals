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
   - Enforces genuine identifying `User-Agent` per Nominatim policy; includes contact information as DishDeals operational policy.
   - Validates endpoints (HTTPS public, explicit HTTP localhost/loopback, rejects credentials, hash fragments, and non-HTTP schemes like `ftp://localhost`).
   - Validates bounding box coordinates (finite, valid geographic ranges, strictly ordered `minLng < maxLng` and `minLat < maxLat`).
   - Validates timeouts (100ms..60,000ms) and cache TTL (positive, finite, max 30 days).
   - Maintains a single finite deadline through full capped response streaming and parsing (`readCappedResponseBody`), actively cancelling stream if provider stalls or exceeds 256 KB.
   - Strictly parses coordinates via `parseNumericCoordinate`, explicitly preventing `Number(null)`, `Number(false)`, or blanks from fabricating 0 coordinates.
   - Sanitizes candidate labels: strips ASCII control characters (0x00..0x1F, 0x7F..0x9F) and null bytes, collapses internal spaces, and caps length to 300 characters.
   - Scopes cache keys to full provider endpoint (protocol, host, port, path, sorted search parameters), geographic search envelope, max results limit, and normalized query.
   - Emits privacy-preserving generic errors that never leak user queries or raw URLs into error messages or logs.
   - Injects global rate-limit slot reservation (`reserveGlobalSlot`) coordinating application-wide max 1 req/sec without assuming shared process memory.
   - Injects cache get/put abstractions; cache hits bypass slot reservation and network calls entirely.
   - Exports required OpenStreetMap copyright attribution (`OSM_ATTRIBUTION`).
   - Pure headless library: **zero Convex imports, zero schema changes, zero UI modifications**.

2. **Comprehensive Unit Test Suite (`tests/geocode/geocodeCore.test.ts`):**
   - 28 unit tests across 8 suites covering:
     1. Query validation and normalization (whitespace, control characters, URLs, HTML tags, punctuation).
     2. Configuration, endpoint, and bounds validation (identifying User-Agent, HTTPS/localhost, rejection of ftp/credentials/hashes, timeout/cache bounds, inverted bounding boxes).
     3. Search envelope constraints (inside/outside Metro Vancouver, Nominatim URL formation).
     4. Injected cache behavior (hit bypasses slot and transport, miss proceeds to slot/transport, safe cache failure).
     5. Global slot rate-limit gate (max 1 req/sec denial handling with retryAfterMs, zero network calls).
     6. Stalled stream deadline, timeouts, body capping (256 KB limit, stalled stream timeout, 429 Retry-After, 503, non-JSON, and safe generic error privacy verification).
     7. Strict numeric coordinate parsing, label sanitization, out-of-envelope filtering, and max result capping.
     8. Attribution and cache key scope (path, port, query params, bounds, and limits).

3. **Policy Documentation (`docs/integration/geocode-policy.md`):**
   - Documents Nominatim usage policy compliance, rate limits, User-Agent standards, attribution, no-autocomplete rules, caching, search envelope definition, and primary source URLs.

4. **Ticket Handoff (`docs/handoffs/t-08g-core.md`):**
   - This document.

---

## 2. Checks Actually Run

| Command / Check | Result | Evidence / Notes |
| :--- | :--- | :--- |
| **Central Ownership Guard** | **PASS (exit 0)** | `node /tmp/dishdeals-owner-check.mjs T-08G-CORE` approved centralized packet ownership. |
| **Targeted Geocode Test Suite** | **PASS (28/28 passed)** | `npm test tests/geocode/geocodeCore.test.ts` using local locked dependencies. |
| **Full Local Test Suite** | **PASS (524/524 passed)** | `npm run test` (22 test files, 0 failures across codebase). |
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
