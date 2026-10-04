import { notFound } from "next/navigation";
import { LayoutPreview } from "@/components/reels/LayoutPreview";
export default function Page() { if (process.env.NODE_ENV !== "development") notFound(); return <LayoutPreview />; }
