"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import type { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

// Token storage defaults to localStorage (web). Native needs a different
// storage implementation once the native runtime is chosen.
export function AuthProvider({
  client,
  children,
}: {
  client: ConvexReactClient;
  children: ReactNode;
}) {
  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
