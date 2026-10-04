"use client";

import { useAuthToken } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { postNativeMessage, sessionMessageFor } from "@/lib/nativeSession";

// Mounted once inside the canonical root auth provider so the native app gets
// the session on every route, including sign-out (token -> null). Renders
// nothing and never logs the token.
export function CanonicalSessionBridge() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const token = useAuthToken();
  useEffect(() => {
    const token_ = sessionMessageFor({ isLoading, isAuthenticated, token });
    if (token_ !== undefined) postNativeMessage({ type: "session", token: token_ });
  }, [isLoading, isAuthenticated, token]);
  return null;
}
