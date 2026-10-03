"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Component, ReactNode } from "react";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <p role="alert">Convex query failed: {this.state.error.message}</p>;
    }
    return this.props.children;
  }
}

function PingResultView() {
  const result = useQuery(api.test.ping, {});
  if (result === undefined) return <p>Loading Convex test query…</p>;
  return (
    <p>Convex says: {result.message}</p>
  );
}

export function ConvexTestResult() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <p role="status">
        Convex is not configured: NEXT_PUBLIC_CONVEX_URL is unset. Run
        `npx convex dev` and see README.md.
      </p>
    );
  }
  return (
    <ErrorBoundary>
      <PingResultView />
    </ErrorBoundary>
  );
}
