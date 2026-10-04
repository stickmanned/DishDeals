"use client";

import React, { useState, type ReactNode } from "react";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { Doc } from "../../convex/_generated/dataModel";

export type MyPublishedDeal = Doc<"deals"> & {
  imageUrl: string | null;
};

// Typed function reference for Loom's deals.listMine({ limit: number }) query.
// Consumed via makeFunctionReference until generated modules are updated at integration.
export const listMineRef = makeFunctionReference<
  "query",
  { limit: number },
  MyPublishedDeal[]
>("deals:listMine");

export type SourceClassification =
  | { kind: "instagram_reel"; label: "Instagram Reel"; url?: string }
  | { kind: "instagram_post"; label: "Instagram Post"; url?: string }
  | { kind: "instagram_generic"; label: "Instagram source"; url?: string }
  | { kind: "external_link"; label: "External link"; url?: string }
  | { kind: "direct_post"; label: "Direct post"; url?: string };

/**
 * Classifies the source of a deal from its sourceUrl.
 * Exact source regex anchored:
 * - Reels: ^\/(?:reel|reels)\/([A-Za-z0-9_-]{5,64})\/?$
 * - Posts: ^\/p\/([A-Za-z0-9_-]{5,64})\/?$
 * Disallows extra path suffixes, credentials, ports, and non-HTTPS schemes.
 * Invalid or non-HTTPS URLs never become clickable hrefs.
 */
export function classifyDealSource(sourceUrl?: string | null): SourceClassification {
  if (!sourceUrl || typeof sourceUrl !== "string") {
    return { kind: "direct_post", label: "Direct post" };
  }
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return { kind: "direct_post", label: "Direct post" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // Malformed URLs never become clickable hrefs
    return { kind: "direct_post", label: "Direct post" };
  }

  // Enforce credential-free HTTPS; no javascript:, data:, http:, credentials, or port tricks
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) {
    return { kind: "direct_post", label: "Direct post" };
  }

  const host = parsed.hostname.toLowerCase();
  const isInstagramHost =
    host === "instagram.com" ||
    host === "www.instagram.com" ||
    host === "m.instagram.com";

  if (isInstagramHost) {
    // Anchored /reel|reels/[A-Za-z0-9_-]{5,64}/?$, no path suffix
    const reelMatch = /^\/(?:reel|reels)\/([A-Za-z0-9_-]{5,64})\/?$/.exec(parsed.pathname);
    if (reelMatch) {
      return { kind: "instagram_reel", label: "Instagram Reel", url: parsed.href };
    }
    // Anchored /p/[A-Za-z0-9_-]{5,64}/?$, no path suffix
    const postMatch = /^\/p\/([A-Za-z0-9_-]{5,64})\/?$/.exec(parsed.pathname);
    if (postMatch) {
      return { kind: "instagram_post", label: "Instagram Post", url: parsed.href };
    }
    return { kind: "instagram_generic", label: "Instagram source", url: parsed.href };
  }

  // Safe external HTTPS link
  return { kind: "external_link", label: "External link", url: parsed.href };
}

export type DealExpiryDisplay = {
  hasExpiry: boolean;
  expiresOnVerbatim?: string;
  policyText: string;
};

/**
 * Formats deal expiry and confirmed 7-calendar-day auto-deletion policy:
 * - Shows expiresOn verbatim when present.
 * - Confirms published deal auto-deletion occurs 7 calendar days after expiry in America/Vancouver.
 * - Missing or empty expiry is retained indefinitely.
 * Authoritative date math is owned by Loom in lib/dealRetention.ts, not duplicated here.
 */
export function formatDealExpiryPolicy(expiresOn?: string | null): DealExpiryDisplay {
  if (!expiresOn || typeof expiresOn !== "string" || !expiresOn.trim()) {
    return {
      hasExpiry: false,
      policyText: "No expiration date (retained indefinitely)",
    };
  }
  const trimmed = expiresOn.trim();
  return {
    hasExpiry: true,
    expiresOnVerbatim: trimmed,
    policyText: `Expires on ${trimmed} (auto-deleted 7 calendar days after expiry in America/Vancouver)`,
  };
}

interface ErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * React Error Boundary isolating failures in the live authored deals list.
 * Displays a generic error message with Retry button, preventing query throws
 * from crashing the canonical /post page or losing the user's creation form draft.
 */
export class PublishedDealsErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    // Isolated to the authored list; keeps sibling CanonicalPost creation form intact.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" className="panel form-stack error-state" style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <h3>Couldn’t load your published deals</h3>
          <p className="muted">Please check your connection and try again.</p>
          <div style={{ marginTop: "0.5rem" }}>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                this.setState({ hasError: false });
                this.props.onRetry?.();
              }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Root component for "Your published deals".
 * Unconfigured backend guard runs BEFORE any Convex hook.
 */
export function MyPublishedDeals() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <section id="your-posts" className="narrow-page my-published-deals" aria-label="Your published deals">
        <div className="panel form-stack">
          <div className="page-heading" style={{ marginBottom: "0.5rem" }}>
            <h2>Your published deals</h2>
            <p className="muted">
              The live deal service is not connected here, so published deals cannot be loaded.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="your-posts" className="narrow-page my-published-deals" aria-label="Your published deals">
      <div className="panel form-stack">
        <div className="page-heading" style={{ marginBottom: "0.5rem" }}>
          <h2>Your published deals</h2>
          <p className="muted">
            Deals you published to the community map and detail page. These are public and visible to everyone.
          </p>
        </div>

        <div
          className="private-reels-callout"
          style={{
            padding: "0.85rem 1rem",
            backgroundColor: "var(--stone-light, #f6f5f3)",
            borderRadius: "6px",
            fontSize: "0.9rem",
            marginBottom: "1rem",
          }}
        >
          <p style={{ margin: 0 }}>
            Looking for your private saved reels? Go to{" "}
            <Link href="/reels" style={{ fontWeight: 600 }}>
              Saved Instagram posts/Reels
            </Link>
            . Private saves are separate from public deals and are only visible to your account until you publish them.
          </p>
        </div>

        <PublishedDealsListHost />
      </div>
    </section>
  );
}

function PublishedDealsListHost() {
  const [retryKey, setRetryKey] = useState(0);

  return (
    <PublishedDealsErrorBoundary key={retryKey} onRetry={() => setRetryKey((k) => k + 1)}>
      <LivePublishedDealsList />
    </PublishedDealsErrorBoundary>
  );
}

function LivePublishedDealsList() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  // Read-only signed-in query; skipped when signed out.
  const deals = useQuery(listMineRef, isAuthenticated ? { limit: 50 } : "skip");

  if (authLoading) {
    return <p role="status">Checking your session…</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="signed-out-prompt" style={{ textAlign: "center", padding: "1.5rem 0" }}>
        <h3>Sign in to see your published deals</h3>
        <p className="muted">Deals you share are saved to your account so you can review or edit them later.</p>
        <Link className="button primary" href="/signin?next=/post" style={{ marginTop: "0.5rem" }}>
          Sign in
        </Link>
      </div>
    );
  }

  if (deals === undefined) {
    return <p role="status">Loading your published deals…</p>;
  }

  if (deals.length === 0) {
    return (
      <div className="empty-state" style={{ textAlign: "center", padding: "1.5rem 0" }}>
        <h3>You haven’t published any deals yet</h3>
        <p className="muted">
          Use the form above to post a deal from a screenshot, flyer, or text. Once published, your deal will appear here and on the community map and detail page.
        </p>
      </div>
    );
  }

  return (
    <div className="published-deals-list" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {deals.map((deal) => {
        const source = classifyDealSource(deal.sourceUrl);
        const expiry = formatDealExpiryPolicy(deal.expiresOn);

        return (
          <article
            key={deal._id}
            className="panel deal-item"
            style={{
              border: "1px solid var(--stone, #e2dfd9)",
              borderRadius: "8px",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem" }}>{deal.restaurant}</h3>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span
                    className="badge badge-public"
                    style={{
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      backgroundColor: "var(--green-light, #e6f4ea)",
                      color: "var(--green-dark, #137333)",
                      borderRadius: "12px",
                      fontWeight: 600,
                    }}
                  >
                    Public deal
                  </span>
                  <span
                    className="badge badge-source"
                    style={{
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      backgroundColor: "var(--blue-light, #e8f0fe)",
                      color: "var(--blue-dark, #1a73e8)",
                      borderRadius: "12px",
                      fontWeight: 600,
                    }}
                  >
                    {source.label}
                  </span>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      referrerPolicy="no-referrer"
                      style={{ fontSize: "0.8rem", color: "var(--muted)" }}
                    >
                      Source link
                    </a>
                  )}
                </div>
              </div>
              <span style={{ fontWeight: 700, fontSize: "1.1rem", whiteSpace: "nowrap" }}>
                {deal.priceCad !== undefined && deal.priceCad !== null
                  ? `$${Number(deal.priceCad).toFixed(2)} CAD`
                  : "Price varies"}
              </span>
            </div>

            <p style={{ margin: "0.25rem 0", color: "var(--char, #333)" }}>{deal.dealText}</p>

            <div
              style={{
                fontSize: "0.85rem",
                backgroundColor: "var(--stone-light, #fbfaf8)",
                padding: "0.5rem 0.75rem",
                borderRadius: "4px",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {expiry.expiresOnVerbatim ? `Expires: ${expiry.expiresOnVerbatim}` : "No expiration date"}
              </span>
              <p style={{ margin: "2px 0 0 0", color: "var(--muted)", fontSize: "0.8rem" }}>
                {expiry.policyText}
              </p>
            </div>

            {/* Read-only navigation links: detail and edit. Author deletion is owned by the existing detail page. */}
            <div
              className="deal-actions"
              style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.5rem" }}
            >
              <Link href={`/deal/${deal._id}`} className="button secondary">
                View deal
              </Link>
              <Link href={`/deal/${deal._id}/edit`} className="button secondary">
                Edit deal
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
