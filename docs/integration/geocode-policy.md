# Geocoding Policy & Transport Core Specification (T-08G-CORE)

This document establishes the architecture, policy compliance rules, geographic constraints, and integration contracts for geocoding in DishDeals.

---

## 1. Architectural Overview & Responsibility Separation

Geocoding in DishDeals is divided into two distinct layers:

1. **Deterministic Policy & Transport Core (`lib/geocodeCore.ts`):**
   - Headless, pure TypeScript library.
   - Enforces OpenStreetMap / Nominatim usage policies.
   - Validates and normalizes user queries (public restaurant/place search only).
   - Enforces geographic search envelope (Metro Vancouver envelope).
   - Injects global slot reservation, cache retrieval/storage, and HTTP transport.
   - Maintains a single finite deadline through full capped response streaming and JSON parsing.
   - Provides deterministic error handling (`RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INVALID_QUERY`, etc.) with safe generic errors that never leak user query strings or raw URLs.
   - Contains **no Convex imports, no schema mutations, no UI components, and no hardcoded coordinates**.

2. **Downstream Backend Wrapper (`convex/geocode.ts` — Handled Next by Schema Writer):**
   - Convex action exposing the `geocode.geocode` API contract: `{ query: string }` → `up to 5 { lat, lng, label }`.
   - Enforces authentication (`getAuthUserId(ctx)` check; rejects unauthenticated callers).
   - Implements durable database-backed global rate-limiting slot reservation (coordinating max 1 req/sec across serverless runtimes).
   - Implements durable caching layer in Convex database / key-value storage.
   - Bridges `geocodeCore` results to the post flow and map marker interface.

---

## 2. OpenStreetMap / Nominatim Public Usage Policy Compliance

DishDeals' post flow uses OpenStreetMap's Nominatim geocoding service. Because Nominatim is operated on community donations with finite server capacity, the application strictly adheres to the official [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/):

### A. Rate Limiting (Maximum 1 Request Per Second)
- **Policy Rule:** An absolute maximum of 1 request per second across the entire application.
- **Implementation:**
  - Individual serverless invocations cannot coordinate rate limits via local in-memory variables.
  - `geocodeCore` mandates an injected `reserveGlobalSlot` dependency.
  - When the global gate determines that another request occurred within the 1-second window, it denies the slot and supplies an actionable `retryAfterMs`.
  - `geocodeCore` immediately raises `GeocodeError("RATE_LIMITED", ..., retryAfterMs)` **without executing any network request to Nominatim** and without creating queued duplicate requests.

### B. Identification & User-Agent
- **Policy Rule:** Provide a valid HTTP `User-Agent` identifying the application. Generic scrapers and library defaults (e.g. `curl`, `Wget`, `python`, `Mozilla/5.0`) are explicitly forbidden.
- **Operational Rule:** DishDeals requires an identifying User-Agent that includes application contact information (an email or URL) as an operational policy to ensure responsible upstream citizenship and communication channels with OpenStreetMap administrators.
- **Implementation:**
  - `GeocodePolicyConfig` strictly requires a populated `userAgent` string.
  - `validateConfig()` rejects empty or generic User-Agent strings and requires contact info (`@`, `http://`, or `https://`).
  - Default configured User-Agent: `DishDeals-StormHacks/1.0 (contact@dishdeals.app)`.

### C. Attribution
- **Policy Rule:** Prominently display OpenStreetMap attribution and copyright (`Data © OpenStreetMap contributors`).
- **Implementation:**
  - `lib/geocodeCore.ts` exports `OSM_ATTRIBUTION`:
    ```ts
    export const OSM_ATTRIBUTION = {
      notice: "Data © OpenStreetMap contributors, ODbL 1.0.",
      licenseUrl: "https://opendatacommons.org/licenses/odbl/1.0/",
      copyrightUrl: "https://www.openstreetmap.org/copyright",
    } as const;
    ```
  - The map component and geocode result selector must render this attribution line.

### D. Prohibition of Autocomplete / Search-As-You-Type
- **Policy Rule:** Auto-complete or search-as-you-type queries submitted on every keystroke are strictly prohibited on the public Nominatim service.
- **Implementation:**
  - Geocoding is triggered **only upon explicit user action** (e.g. tapping "Find" or "Search" in the post deal form).
  - No client-side keyup / input event listeners may trigger geocoding.

### E. Prohibition of Bulk Scraping & Systematic Queries
- No batch geocoding of database records or systematic grid searches.
- Candidate lead fixtures (`fixtures/source-candidates/`) keep coordinates unpopulated until explicitly geocoded or user-confirmed.

### F. Aggressive Caching & Scoped Cache Keys
- **Policy Rule:** Repeated queries must be cached locally to minimize traffic to OSM servers.
- **Implementation:**
  - `geocodeCore` integrates `cacheGet` and `cachePut`.
  - Cache keys are scoped to the full provider endpoint (protocol, host, port, path, sorted search parameters), geographic search envelope, max results limit, and normalized query:
    `geocode:v2:<endpoint_origin_path_query>:<bbox>:<maxResults>:<normalized_query>`
  - This ensures changes in endpoint, regional bounds, or requested result limits never return incompatible cached records.
  - Cache hits bypass global slot reservation and network transport entirely.
  - Default recommended TTL is 7 days (`604,800,000 ms`), capped at 30 days.

### G. Server-Configurable Provider Switching & Strict Endpoint Validation
- The service endpoint is configurable via `GeocodePolicyConfig.endpoint`.
- Allowed endpoints:
  - HTTPS endpoints for public servers (e.g. `https://nominatim.openstreetmap.org/search`, commercial proxies, or Photon).
  - Explicit HTTP on `localhost`, `127.0.0.1`, or `[::1]` for local development and test mocks.
- Explicitly rejected:
  - Non-HTTP(S) protocols (e.g. `ftp://localhost`, `file:///etc`).
  - URLs containing embedded credentials (`https://user:pass@host`).
  - URL fragments / hashes (`#section`).
  - Non-localhost plain HTTP endpoints.

---

## 3. Geographic Search Envelope: Metro Vancouver

To ensure search queries like "Pho Hoa" or "Tentatsu" resolve to local establishments rather than businesses in other provinces or countries, queries are strictly constrained to Metro Vancouver:

### A. Operational Search Envelope (`METRO_VANCOUVER_BBOX`)
```ts
export const METRO_VANCOUVER_BBOX: BoundingBox = {
  minLng: -123.35, // West: coastal approaches / Point Grey waters
  minLat: 49.00,  // South: 49th Parallel / US border vicinity (White Rock / Tsawwassen)
  maxLng: -122.55, // East: eastern regional perimeter (Langley / Maple Ridge)
  maxLat: 49.45,  // North: North Shore slopes / Belcarra
};
```
*Note: This is an operational application search envelope designed for deal discovery bounding, not an independently surveyed or legally confirmed regional boundary definition.*

### B. Double-Validation Contract
1. **URL Constraint:** The Nominatim request includes `viewbox=<minLng>,<maxLat>,<maxLng>,<minLat>` and `bounded=1`.
2. **Strict Coordinate Parsing:** `parseNumericCoordinate()` strictly parses numeric floats, explicitly rejecting `null`, `false`, `true`, `""`, or blank whitespace so that `Number(null)` or `Number(false)` cannot fabricate finite `0` coordinates.
3. **Envelope Check:** `parseAndValidateProviderResponse()` independently re-checks the latitude and longitude of every item returned by the provider against `METRO_VANCOUVER_BBOX`. If an item falls outside the envelope, it is discarded.

---

## 4. Bounded Input, Output, and Transport Limits

To protect memory, CPU, and network resources:
- **Query Bounds:** 2–120 characters, alphanumeric requirement, rejects control characters, newlines, null bytes, URLs, and HTML tags.
- **Response Size Capping:** Responses are strictly capped at 256 KB (`NOMINATIM_DEFAULTS.maxResponseBytes`). Oversized responses trigger active stream cancellation and throw `INVALID_RESPONSE`.
- **Streaming Deadline:** A single finite timeout (`timeoutMs`, bounded between 100ms and 60,000ms) governs both initial network connection AND response body streaming/parsing. If the upstream provider stalls mid-stream, the connection is aborted cleanly.
- **Provider Record Capping:** Capped to processing a maximum of 50 records from upstream arrays.
- **Label Sanitization:** Candidate labels strip control characters (ASCII 0x00–0x1F, 0x7F–0x9F) and null bytes, collapse repeated internal spaces, and are bounded to a maximum length of 300 characters.
- **Privacy-Preserving Errors:** Error messages for network failures or unavailable providers use generic safe messages (`"Network error communicating with geocoding provider"`) to prevent sensitive place queries or user street addresses from leaking into server logs or exception causes.

---

## 5. Summary of Primary Source URLs

1. **Nominatim Usage Policy:**  
   `https://operations.osmfoundation.org/policies/nominatim/`
2. **Nominatim Search API Documentation:**  
   `https://nominatim.org/release-docs/latest/api/Search/`
3. **OpenStreetMap Copyright & License:**  
   `https://www.openstreetmap.org/copyright`
4. **Open Data Commons Open Database License (ODbL 1.0):**  
   `https://opendatacommons.org/licenses/odbl/1.0/`

---

## 6. Downstream Integration & Pending Work

The following items are explicitly decoupled from T-08G-CORE and remain pending downstream integration:

1. **Convex Action Wrapper (`convex/geocode.ts`):**
   - Must verify authenticated caller via `getAuthUserId(ctx)`.
   - Must wire the durable database lease table for application-wide rate-limit slot reservation.
   - Must wire the durable caching table.
2. **UI & Map Pin Interaction (`components/DealMap.tsx`):**
   - Renders proposed coordinates as a draggable marker.
   - Displays required OpenStreetMap attribution notice.
   - Requires explicit user pin confirmation before publishing.
3. **No Synthetic / Guessed Coordinates:**
   - When Nominatim returns 0 results, the system returns `[]`. It does **not** fabricate fake coordinates.
