import Link from "next/link";
import { CanonicalDealEdit } from "@/components/deals/CanonicalDealEdit";
import { isDemoDealId } from "@/lib/mapPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Preview demo deals are not stored, so there is nothing to edit.
  if (isDemoDealId(id)) {
    return (
      <div className="narrow-page panel empty-state" style={{ marginTop: 40 }}>
        <h1 style={{ fontSize: 32 }}>Preview deals can’t be edited</h1>
        <p>This is a sample deal. Only saved community deals can be edited.</p>
        <Link className="button secondary" href={`/deal/${id}`}>
          Back to the deal
        </Link>
      </div>
    );
  }

  return <CanonicalDealEdit id={id} />;
}
