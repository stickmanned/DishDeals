import { DealDetails } from "@/components/frontend/DealDetails";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DealDetails id={id} />;
}
