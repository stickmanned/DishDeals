"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ReactNode, useMemo } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  // Without a URL we render children with no provider; ConvexTestResult
  // reports the unconfigured state instead of the client throwing at build.
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [],
  );
  if (!client) return <>{children}</>;
  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>;
}
