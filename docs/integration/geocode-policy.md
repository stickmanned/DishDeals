# Geocoding Policy & Transport Core Specification (T-08G-CORE)

This document establishes the architecture, policy compliance rules, geographic constraints, and integration contracts for geocoding in DishDeals.

---

## 1. Architectural Overview & Responsibility Separation

Geocoding in DishDeals is divided into two distinct layers:

1. **Deterministic Policy & Transport Core (`lib/geocodeCore.ts`):**
   - Headless, pure TypeScript library.
   - Enforces OpenStreetMap / Nominatim usage policies.
   - Validates and normalizes user queries (public restaurant/place search only).
   - Enforces geographic bounding box (Metro Vancouver envelope).
   - Injects global slot reservation, cache retrieval/storage, and HTTP transport.
   - Provides deterministic error handling (`RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INVALID_QUERY`, etc.).
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
- **Policy Rule:** Provide a valid HTTP `User-Agent` identifying the application and including a valid contact email or domain. Generic headers (e.g. `curl`, `Mozilla/5.0`, `python`) are explicitly forbidden.
- **Implementation:**
  - `GeocodePolicyConfig` strictly requires a populated `userAgent` string.
  - `validateConfig()` rejects empty or generic User-Agent strings, requiring a contact email (`@`) or contact URL (`http://`, `https://`).
  - Default configured User-Agent: `DishDeals-StormHacks/1.0 (contact@dishdeals.app)`.

### C. Attribution
- **Policy Rule:** Prominently display OpenStreetMap attribution and copyright.
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
- Seed data (`fixtures/seed.json`) is pre-geocoded to ensure the demo and onboarding never generate unnecessary Nominatim requests.

### F. Heavy Caching Requirement
- **Policy Rule:** Repeated queries must be cached locally to minimize traffic to OSM servers.
- **Implementation:**
  - `geocodeCore` integrates `cacheGet` and `cachePut`.
  - Cache keys are normalized (`geocode:v1:<hostname>:<normalized_query>`).
  - Cache hits bypass global slot reservation and network transport entirely.
  - Default recommended TTL is 7 days (`604,800,000 ms`).

### G. Server-Configurable Provider Switching
- The service endpoint is configurable via `GeocodePolicyConfig.endpoint`.
- Allows transparent switching between:
  - Official Nominatim (`https://nominatim.openstreetmap.org/search`)
  - Self-hosted private Nominatim instance
  - Photon / Komoot geocoder
  - LocationIQ / commercial proxy
- Public endpoints must strictly use HTTPS.

---

## 3. Geographic Envelope: Metro Vancouver Bounding Box

To ensure search queries like "Pho Hoa" or "Tentatsu" resolve to local establishments rather than businesses in other provinces or countries, queries are strictly constrained to Metro Vancouver:

### A. Comparison with Original Plan Sketch
- **Original Plan Sketch:** `viewbox: "-123.30,49.40,-122.70,49.00", bounded: "1"`
- **Calibrated Envelope (`METRO_VANCOUVER_BBOX`):**
  ```ts
  export const METRO_VANCOUVER_BBOX: BoundingBox = {
    minLng: -123.35, // West: Bowen Island / Point Grey waters
    minLat: 49.00,  // South: 49th Parallel / US-Canada border (White Rock / Tsawwassen)
    maxLng: -122.55, // East: Langley / Maple Ridge regional boundaries
    maxLat: 49.45,  // North: North Shore mountains / Lions Bay / Belcarra
  };
  ```

### B. Double-Validation Contract
1. **URL Constraint:** The Nominatim request includes `viewbox=<minLng>,<maxLat>,<maxLng>,<minLat>` and `bounded=1`.
2. **Result Validation:** `parseAndValidateProviderResponse()` independently re-checks the latitude and longitude of every item returned by the provider. If the provider returns a point outside `METRO_VANCOUVER_BBOX`, it is discarded.

---

## 4. Query Validation & Sanitization

User query inputs are validated against strict criteria:
- **Length Bounds:** Minimum 2 characters, maximum 120 characters.
- **Control Characters:** Rejects ASCII `0x00`–`0x1F`, `0x7F`–`0x9F`, newlines, carriage returns, tabs, and null bytes.
- **Injection Prevention:** Rejects URL schemes (`http:`, `https:`, `javascript:`, `data:`) and HTML tags (`<`, `>`).
- **Alphanumeric Requirement:** Requires at least one letter or digit (rejects punctuation-only input like `???`).
- **Whitespace Normalization:** Trims leading/trailing whitespace and collapses internal multiple spaces.

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
