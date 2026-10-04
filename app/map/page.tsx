import type { Metadata } from "next";
import { CanonicalDealMapPage } from "@/components/maps/CanonicalDealMapPage";
import { mapSelectionFromQuery } from "@/lib/mapPage";

export const metadata: Metadata = {
  title: "Deals Map",
  description: "Browse published restaurant deals across Vancouver on an interactive map.",
};

export default async function MapRoute({ searchParams }: { searchParams: Promise<{ deal?: string | string[] }> }) {
  const { deal } = await searchParams;
  const selected = mapSelectionFromQuery(deal);
  return <CanonicalDealMapPage key={selected ?? "recent"} initialDealId={selected ?? undefined} />;
}
