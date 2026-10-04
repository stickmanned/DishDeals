import { DealDetails } from "@/components/frontend/DealDetails";
import { CanonicalDealDetails } from "@/components/deals/CanonicalDealDetails";
import { isDemoDealId } from "@/lib/mapPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Retain Harry's preview component for demo-* IDs
  if (isDemoDealId(id)) {
    return <DealDetails id={id} />;
  }

  // Canonical live database IDs
  return <CanonicalDealDetails id={id} />;
}
