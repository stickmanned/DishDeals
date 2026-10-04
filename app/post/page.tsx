"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Post } from "@/components/frontend/Post";
function Source() { const params = useSearchParams(); const job = params.get("job"); return <Post editId={params.get("edit") || undefined} jobId={job && /^[a-zA-Z0-9_-]{1,128}$/.test(job) ? job : undefined} />; }
export default function Page() { return <Suspense fallback={<p>Loading submission…</p>}><Source /></Suspense>; }
