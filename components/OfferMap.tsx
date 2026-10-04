"use client";

import dynamic from "next/dynamic";

export const OfferMap = dynamic(
  () => import("@restaurant-deals/map").then((module) => module.DealMap),
  { ssr: false, loading: () => <div className="map-loading">Loading map…</div> },
);
