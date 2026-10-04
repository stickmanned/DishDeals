import type {CSSProperties} from "react";
/** Provider-independent deal coordinates. Longitude comes first in map centers. */
export interface MapDeal {
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
}
export interface DraftLocation {
  latitude: number;
  longitude: number;
  confirmed?: boolean;
  label?: string;
}
export interface MapViewport {
  west: number; east: number; south: number; north: number;
  center: [longitude:number,latitude:number]; zoom: number;
}
export type MapEngine="maplibre"|"raster";
export interface DealMapProps {
  deals: readonly MapDeal[];
  /** Undefined uses internal selection; null explicitly clears controlled selection. */
  selectedId?: string|null;
  onSelect?: (deal:MapDeal)=>void;
  onViewportChange?: (viewport:MapViewport)=>void;
  onReady?: (engine:MapEngine)=>void;
  onError?: (message:string)=>void;
  initialCenter?: [longitude:number,latitude:number];
  initialZoom?: number;
  /** Increment to frame the current deals again. */
  fitKey?: string|number;
  fitOnLoad?: boolean;
  /** Auto uses MapLibre and switches to raster if WebGL initialization fails. */
  engine?: "auto"|MapEngine;
  tileUrl?: string;
  tileAttribution?: string;
  /** Optional MapLibre style URL. Otherwise use the built-in vector streets, or tileUrl if supplied. */
  mapStyleUrl?: string;
  showLocateControl?: boolean;
  /** Disable when the host app provides its own selected-offer panel. */
  showDealCard?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  /** Draft unconfirmed/confirmed location pin separate from published deals. */
  draftLocation?: DraftLocation | null;
  /** Called when the draft marker is dragged or map is clicked to propose a location. */
  onDraftLocationChange?: (location: { latitude: number; longitude: number }) => void;
  /** Whether the draft marker is draggable (default true). */
  isDraftDraggable?: boolean;
  /** Optional direct map click callback. */
  onMapClick?: (coordinates: { latitude: number; longitude: number }) => void;
}
