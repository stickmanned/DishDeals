"use client";

import { ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import { CanonicalSessionBridge } from "@/components/CanonicalSessionBridge";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  // Without a URL we render children with no provider; ConvexTestResult
  // reports the unconfigured state instead of the client throwing at build.
  const client = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [],
  );
  if (!client) return <>{children}</>;
  return (
    <AuthProvider client={client}>
      <CanonicalSessionBridge />
      {children}
    </AuthProvider>
  );
}
