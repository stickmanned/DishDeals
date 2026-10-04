"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ReelIntake } from "@/components/reels/ReelIntake";
function Saved() { const params = useSearchParams(); const item = params.get("item"); return <ReelIntake itemId={item && /^[a-zA-Z0-9]{1,128}$/.test(item) ? item : undefined} shared={params.get("shared")?.slice(0,4096)} />; }
export default function Page() { return <Suspense fallback={<p>Loading saved Reels…</p>}><Saved /></Suspense>; }
