"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DealDetails } from "@/components/frontend/DealDetails";
function Details() { const params = useSearchParams(); return <DealDetails id={params.get("id") || ""} />; }
export default function Page() { return <Suspense fallback={<p>Loading offer…</p>}><Details /></Suspense>; }
