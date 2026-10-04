# Map Integration Contract

This document specifies the integration boundary between the `@restaurant-deals/map` package, the Next.js published deals map wrapper (`PublishedDealMap`), and the controlled location selection component (`DealLocationPicker`).

## Components and Contracts

### 1. Pure Adapter (`lib/mapAdapter.ts`)
Converts canonical saved deals into provider-independent `MapDeal` records.

```ts
export interface CanonicalSavedDeal {
  _id: string;
  restaurant: string;
  dealText: string;
  lat: number;
  lng: number;
  address?: string;
  priceCad?: number;
  validDays?: string[];
  validStart?: string;
  validEnd?: string;
  expiresOn?: string;
  conditions?: string[];
  sourceUrl?: string;
  authorId?: string;
  imageId?: string;
  stillOnCount?: number;
  expiredCount?: number;
  [key: string]: unknown;
}

export function toCanonicalMapDeal(record: CanonicalSavedDeal): MapDeal | null;
export function toCanonicalMapDeals(records: readonly CanonicalSavedDeal[]): MapDeal[];
```

#### Mapping & Invariant Rules:
- `_id` → `id` (stable identifier; no synthetic IDs generated).
- `restaurant` → `restaurantName`.
- `dealText` → `title`.
- `lat` / `lng` → `latitude` / `longitude`.
- `priceCad` → `price` with `currency: "CAD"` ONLY when `priceCad` is present as a finite, non-negative number. No fake currency or price is invented.
- `sourceUrl` → preserved when using HTTP/HTTPS protocol.
- `expiresOn` → preserved as `expiresAt`. No fake timestamp is synthesized.
- **Rejection**: Records with coordinates outside Web Mercator limits (`|lat| > 85.05112878` or `|lng| > 180`), `NaN`/infinite coordinates, or missing required strings are rejected and excluded.

---

### 2. Published Deals Map (`components/maps/PublishedDealMap.tsx`)
A client-only lazy-loaded wrapper for displaying saved deals on the map.

```ts
export interface PublishedDealMapProps {
  deals: readonly CanonicalSavedDeal[];
  /** Controlled selected deal ID (_id from canonical saved deals). */
  selectedId?: string | null;
  /** Callback fired when a deal is selected or deselected. */
  onSelectDeal?: (deal: CanonicalSavedDeal | null) => void;
  className?: string;
  style?: CSSProperties;
  initialCenter?: [longitude: number, latitude: number];
  initialZoom?: number;
  engine?: "auto" | "maplibre" | "raster";
  ariaLabel?: string;
  fitKey?: string | number;
  fitOnLoad?: boolean;
}
```

#### Behavior:
- Accepts canonical saved records (never unconfirmed draft records).
- Converts canonical records using `toCanonicalMapDeals`.
- Looks up the selected `MapDeal` by `id` and passes the original `CanonicalSavedDeal` back to `onSelectDeal`.
- Client-only lazy loading ensures Next.js SSR compatibility without bundler worker syntax errors.
- Displays an actionable error message on dynamic module import failure (no perpetual "Loading map…" state or raw console error dumps).

---

### 3. Deal Location Picker (`components/maps/DealLocationPicker.tsx`)
A controlled location picker component designed for form and intake flows.

```ts
export interface DealLocationPickerLocation {
  lat: number;
  lng: number;
  confirmed: boolean;
}

export interface GeocodeCandidate {
  lat: number;
  lng: number;
  label: string;
}

export interface DealLocationPickerProps {
  restaurant: string;
  address: string | null;
  location: DealLocationPickerLocation | null;
  search?: (query: string) => Promise<GeocodeCandidate[]>;
  onConfirm: (point: { lat: number; lng: number }) => void;
  /**
   * Invoked immediately whenever a new proposal is created (marker drag, map click,
   * candidate selection, or device location hint) so the parent form can invalidate
   * previously confirmed coordinates and prevent publishing stale locations.
   */
  onInvalidate?: () => void;
  className?: string;
  style?: CSSProperties;
  engine?: "auto" | "maplibre" | "raster";
}
```

#### Exported Production Validation & Lifecycle Helpers:
- `isValidLocationPoint(lat: unknown, lng: unknown): boolean`: Strictly validates finite numbers within Web Mercator limits (`|lat| <= 85.05112878`, `|lng| <= 180`).
- `filterValidCandidates(candidates: readonly GeocodeCandidate[]): GeocodeCandidate[]`: Cleanses external search results, eliminating invalid points or blank labels.
- `LocationSearchGuard`: Monotonic request counter guaranteeing that out-of-order slow search responses and late browser geolocation callbacks are ignored.
- `applyNewProposal(coords, onInvalidate)`: Applies candidate/drag/click/hint proposals only after bounds validation, immediately invoking `onInvalidate`.
- `confirmProposal(proposedPoint, onConfirm)`: Bounds-checks coordinates before executing `onConfirm`.

#### Safety & State Invariants:
1. **Immediate Invalidation (`onInvalidate`)**: Any new proposal (map click, pin drag, candidate click, or geolocation hint) immediately calls `onInvalidate()` so the parent form marks its location unconfirmed.
2. **Preserving Proposals When Parent Clears Confirmation**: When the parent form clears `confirmed` (sets `location.confirmed = false`), the active proposed coordinates remain visible on the map for user adjustment, rather than disappearing.
3. **Clearing on Form Context Edits**: When `restaurant` or `address` changes, stale candidates, previous proposals, in-flight searches, and geolocation hints are cleared.
4. **Search Input Edit Guard**: Typing in the search input immediately invalidates previous search requests.
5. **Burnaby Context Initial Viewport**: Initial map viewport is fixed to Burnaby context (`center: [-122.9805, 49.2488]`, `zoom: 12`).
6. **Controlled Draft Location Isolation**: Draft pins are displayed via `draftLocation` on `DealMap`. The map's `deals` array is empty during picker mode, ensuring draft pins remain strictly isolated from published deals.
7. **Explicit Search & Attribution**: Search is triggered ONLY on clicking the explicit "Search" button. Results display OpenStreetMap copyright attribution linking `https://www.openstreetmap.org/copyright`.
8. **Permission-Based Browser Location**: "Use my location" queries `navigator.geolocation` as an unconfirmed hint only.
9. **Actionable Import Failure**: If map assets fail to load, an actionable error banner is shown rather than an indefinite loading spinner.
