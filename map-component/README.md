# Restaurant deal map component

An embeddable React component for your team's existing frontend. It contains only the map surface, deal markers, map controls, and selection/viewport callbacks. All built-in UI, errors, and documentation are in English. It does not deploy a website or require an AI API key.

## Install and use

Requires React 18.2+ or React 19. From your teammate's application:

```sh
npm install /absolute/path/to/map-component
```

For a portable handoff, run `npm run build` and `npm pack` in this folder, then install the resulting `.tgz` in the application. React stays a peer dependency, so the library uses the application's React instance.

Import the stylesheet once (in a Next.js root layout, or a Vite entrypoint):

```tsx
import '@restaurant-deals/map/styles.css';
```

Embed the component in a client component:

```tsx
'use client';
import { DealMap, type MapDeal } from '@restaurant-deals/map';

export function RestaurantMap({ deals }: { deals: MapDeal[] }) {
  return (
    <div style={{ height: 480 }}>
      <DealMap
        deals={deals}
        onSelect={(deal) => console.log('Selected deal', deal.id)}
        onViewportChange={(viewport) => console.log('Map bounds', viewport)}
      />
    </div>
  );
}
```

Give the parent an explicit height. The map fills its parent and has a minimum height of 280px. The built library preserves the `use client` directive; map engines load only in the browser, so Next.js server rendering does not access `window` or `document`.

Use the built package rather than copying raw source into Next.js: the build includes a self-contained MapLibre worker and a relative worker asset URL. Keep all files in `dist/` together. A strict Content Security Policy must permit the configured tile source and the map worker (including `blob:` if required by the renderer). MapLibre's bundler setup is documented in its [installation guide](https://maplibre.org/maplibre-gl-js/docs/).

## Shared data contract

```ts
type MapDeal = {
  id: string;
  restaurantName: string;
  title: string;
  latitude: number;
  longitude: number;
  address?: string;
  price?: number;
  currency?: string;
  discountPercent?: number;
  sourceUrl?: string;
  expiresAt?: string;
  isDemo?: boolean;
};
```

Coordinates must come from your geocoder or verified restaurant records. The map does not guess locations or call Gemini. `initialCenter` uses **[longitude, latitude]**; deal records use named fields to avoid coordinate-order confusion. Deal IDs must be stable and unique. For multiple deals at one restaurant, aggregate them in your data layer if you want a single restaurant pin; identical coordinates otherwise overlap.

The `deals` prop is validated. Invalid coordinates, duplicate IDs, invalid numeric values, and unsafe source URL protocols throw clear errors. Call `parseMapDeals(rawRecords)` in your data adapter and handle errors there or with your application's error boundary. Unknown fields are stripped from the normalized map records. The component does not open source URLs or render user input as HTML.

## Teammate / Convex integration

Keep Convex, Gemini, Geoapify, secrets, persistence, and authentication in your existing application. Feed the result of a Convex query into this component; each new `deals` array updates the map markers without recreating the map. A Convex document can be adapted as follows:

```ts
const mapDeals = parseMapDeals(
  records.map(({ _id, ...record }) => ({ ...record, id: _id }))
);
```

Use `selectedId` and `onSelect` to link the map to the team's existing list or detail panel. `onSelect` returns the normalized deal record. Selecting a marker or changing `selectedId` centers the map on that deal. If `selectedId` is omitted, the component manages selection internally. Pass `null` to clear controlled selection.

Use `onViewportChange` and `isDealInViewport(deal, viewport)` to filter an existing list or query deals in the current map area. Viewports emit after map movement finishes; the helper supports antimeridian crossings. Remove expired deals in your backend/query adapter; the component renders exactly the records it receives.

See `examples/TeamIntegration.tsx` for a copy-ready integration example. Import the stylesheet once in the host application.

## Options

| Prop | Default | Purpose |
| --- | --- | --- |
| `deals` | Required | Validated, provider-independent records |
| `selectedId` | Internal selection | Controlled selected deal ID; `null` clears it |
| `onSelect` | None | Returns the selected `MapDeal` |
| `onViewportChange` | None | Returns bounds, center, and zoom |
| `onReady` | None | Reports `maplibre` or `raster` |
| `onError` | None | Reports an English map or location error |
| `initialCenter` | `[-123.117, 49.278]` | Initial Vancouver center; applied at mount |
| `initialZoom` | `12` | Initial zoom; applied at mount |
| `fitOnLoad` | `true` | Frames the first nonempty dataset |
| `fitKey` | None | Change to frame the current dataset again |
| `engine` | `auto` | MapLibre, with Leaflet raster fallback if WebGL initialization fails |
| `tileUrl` | OpenStreetMap for raster fallback | Supplying a URL switches MapLibre to your raster basemap; also used by the fallback |
| `tileAttribution` | OpenStreetMap attribution | Attribution for your raster provider; trusted developer configuration only |
| `mapStyleUrl` | Built-in vector street style | Optional MapLibre style URL; takes precedence over `tileUrl` in MapLibre |
| `showLocateControl` | `false` | Opt-in location button; requests permission only when clicked |
| `showDealCard` | `true` | Compact selected-offer card with prices and directions; disable if your app has its own details panel |
| `className`, `style` | None | Host application layout integration |
| `ariaLabel` | `Restaurant deals map` | Accessible region label |

Changing the style URL, tile URL, attribution, or requested engine recreates the map. Data and selection updates do not. Map resize follows the parent size. Buttons and markers support keyboard activation.

The map uses crisp vector streets, pale blue water, green parks, white controls, red restaurant pins and a blue selected pin. Place cards have blue directions buttons and retain the listed price currency; missing currencies are labelled instead of assuming CAD. This visual direction is inspired by familiar map interfaces; it does not use Google tiles, branding or an assumed Google API key. Demo records remain labelled as demos. Cards link to coordinate-based directions and, when supplied, the original offer. Give the component about 480 px of height for comfortable map-and-card viewing; in smaller embeds the card can scroll. Styles respond to the component's width. On mobile, unselected pins omit names to reduce clutter, and selection moves the pin above the card. Set `showDealCard={false}` to use your existing detail UI.

## Basemap and operational boundaries

MapLibre GL JS renders the default custom vector street style from `src/streetStyle.ts` using OpenFreeMap's OpenMapTiles source and hosted fonts. The public service requires no API key; its attribution is retained. See [OpenFreeMap's official integration guide](https://openfreemap.org/quick_start/). Labels prefer English names where available and fall back to local proper names. The custom style is original; it does not import Google's map data.

Leaflet provides a raster compatibility path for browsers without WebGL. That fallback retains the OpenStreetMap raster source and does not reproduce the vector cartography. A custom `mapStyleUrl` applies only to MapLibre; set `tileUrl` and `tileAttribution` for a corresponding raster fallback. Supplying only `tileUrl` explicitly selects raster cartography in MapLibre as well. This component does **not** include restaurant search or address geocoding; those belong in the team's Geoapify integration.

The default public OpenStreetMap tile service is best-effort and subject to its usage policy. Keep attribution visible, preserve the browser Referer, do not bulk download/prefetch tiles, and use a suitable tile provider for higher traffic. Configure both `tileUrl` and `tileAttribution` when switching providers. Browser-visible tile tokens must be scoped/restricted according to the provider; never put Gemini or server-side secrets in component props.

- [MapLibre marker documentation](https://maplibre.org/maplibre-gl-js/docs/API/classes/Marker/)
- [Leaflet documentation](https://leafletjs.com/reference.html)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

## Local checks

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

`dev/` is a minimal local verification harness with three fictional, explicitly marked demo deals. It is excluded from the package and is not a standalone product frontend. The component contains no demo data itself. The map needs network access to its configured tile provider. Geolocation is optional and requires browser permission; no location is sent to an AI service by this component.
