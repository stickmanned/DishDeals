import type { Metadata } from "next";
import { CanonicalDealMapPage } from "@/components/maps/CanonicalDealMapPage";

export const metadata: Metadata = {
  title: "Deals Map",
  description: "Browse verified restaurant deals across Vancouver on an interactive map.",
};

export default function MapRoute() {
  return <CanonicalDealMapPage />;
}
