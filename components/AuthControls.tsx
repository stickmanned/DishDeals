"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import Link from "next/link";

function ConfiguredControls() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  if (isLoading) return <p role="status">Checking session…</p>;
  if (!isAuthenticated) return <Link href="/signin">Sign in</Link>;
  return (
    <nav aria-label="Account">
      <Link href="/profile">Profile</Link>{" "}
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </nav>
  );
}

export function AuthControls() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;
  return <ConfiguredControls />;
}
