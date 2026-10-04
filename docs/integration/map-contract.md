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
  className?: string;
  style?: CSSProperties;
  engine?: "auto" | "maplibre" | "raster";
}
```

#### Behavior & Safety Invariants:
1. **Burnaby Context Initial Viewport**: Initial map viewport is fixed to Burnaby context (`center: [-122.9805, 49.2488]`, `zoom: 12`), not pre-focused on unconfirmed user guesses.
2. **Controlled Draft Location Isolation**: Draft pins are displayed via `draftLocation` on `DealMap`. The map's `deals` array is empty during picker mode, ensuring draft pins remain strictly isolated from published deals.
3. **Explicit Search Action**: Search is triggered ONLY on clicking the explicit "Search" button (never on keystrokes or Nominatim autocomplete).
4. **Candidate Proposal & Attribution**: Candidate results display label and attribution. Clicking a candidate proposes an unconfirmed draft pin on the map; it is not confirmed until the user explicitly confirms it.
5. **No Built-in Network Calls**: When `search` prop is omitted, the component indicates search is unavailable without making unauthorized network requests.
6. **Async Request Identity Guard**: Uses a monotonic request counter (`searchRequestId`) to discard slow or out-of-order search responses after new searches, input edits, or unmounting.
7. **Form Edit Reset**: Changing `restaurant` or `address` clears stale candidate lists, pending searches, and unconfirmed proposals.
8. **Permission-Based Browser Location**: "Use my location" queries `navigator.geolocation` as an unconfirmed hint only. It never bypasses explicit confirmation.
9. **Separate Explicit Confirmation**: The user must click "Confirm location" to invoke `onConfirm({ lat, lng })`. Map click and marker dragging only propose unconfirmed points.
