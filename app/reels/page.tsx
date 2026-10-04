import { ReelIntake } from "@/components/reels/ReelIntake";
export const metadata = { title: "Private Reel saves", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ searchParams }: { searchParams: Promise<{ item?: string; shared?: string }> }) {
  const p = await searchParams;
  return <ReelIntake itemId={typeof p.item === "string" && /^[a-zA-Z0-9]{1,128}$/.test(p.item) ? p.item : undefined}
    shared={typeof p.shared === "string" ? p.shared.slice(0, 4096) : undefined} />;
}
