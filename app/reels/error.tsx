"use client";
import Link from "next/link";
export default function Error({ reset }: { reset: () => void }) {
  return <div className="narrow-page panel"><h1>Save unavailable</h1><p>This private save may have been deleted, expired, or belong to another account.</p><button className="button secondary" onClick={reset}>Try again</button> <Link href="/reels">Your saved Reels</Link></div>;
}
