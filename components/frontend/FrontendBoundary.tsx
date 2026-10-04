"use client";
import { Component, type ReactNode } from "react";
export class FrontendBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="error-fallback panel">
        <h1>We couldn’t load the feed.</h1>
        <p>
          Check your connection. If you submitted a source, check its status
          before submitting again.
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
        <button
          className="text-link"
          onClick={() =>
            window.location.assign(new URL("/", window.location.href).href)
          }
        >
          Back to Discover
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
