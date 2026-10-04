"use client";

import Link from "next/link";
import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { formatVancouverParts } from "../../lib/vancouverTime";

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
 * Accurately identifies Instagram Reels (/reel/, /reels/) and Instagram Posts (/p/)
 * without guessing original kinds on old rewritten or unidentifiable links.
 */
export function classifyDealSource(sourceUrl?: string | null): SourceClassification {
  if (!sourceUrl || typeof sourceUrl !== "string") {
    return { kind: "direct_post", label: "Direct post" };
  }
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return { kind: "direct_post", label: "Direct post" };
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isInstagram = host === "instagram.com" || host.endsWith(".instagram.com");
    if (isInstagram) {
      const pathname = parsed.pathname.toLowerCase();
      if (pathname.includes("/reel/") || pathname.includes("/reels/")) {
        return { kind: "instagram_reel", label: "Instagram Reel", url: trimmed };
      }
      if (pathname.includes("/p/")) {
        return { kind: "instagram_post", label: "Instagram Post", url: trimmed };
      }
      return { kind: "instagram_generic", label: "Instagram source", url: trimmed };
    }
    return { kind: "external_link", label: "External link", url: trimmed };
  } catch {
    return { kind: "external_link", label: "External link", url: trimmed };
  }
}

/**
 * Returns the current calendar date in America/Vancouver as YYYY-MM-DD.
 */
export function getVancouverIsoDate(date: Date): string {
  const parts = formatVancouverParts(date, "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * Adds an integer number of calendar days in UTC to an ISO YYYY-MM-DD string.
 */
function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type DealRetentionInfo = {
  hasExpiry: boolean;
  isExpired: boolean;
  isEligibleForDeletion: boolean;
  deletionDateVancouver: string | null;
  statusLabel: string;
  retentionNote: string;
};

/**
 * Computes deal retention and expiry semantics based on Vancouver local time:
 * - Expiry is inclusive through the end of expiresOn in America/Vancouver.
 * - Auto-deletion / deletion eligibility is SEVEN full calendar days after the end of expiresOn.
 * - Missing or malformed expiresOn -> unknown expiry, retained indefinitely (never auto-deleted).
 */
export function getDealRetentionInfo(
  expiresOn?: string | null,
  now = new Date(),
): DealRetentionInfo {
  if (!expiresOn || typeof expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
    return {
      hasExpiry: false,
      isExpired: false,
      isEligibleForDeletion: false,
      deletionDateVancouver: null,
      statusLabel: "No expiration date (retained)",
      retentionNote:
        "Deals without an expiration date are retained indefinitely and cannot be automatically deleted.",
    };
  }

  const vancouverToday = getVancouverIsoDate(now);
  const isExpired = vancouverToday > expiresOn;

  // Deletion is eligible 7 calendar days after the END of expiresOn, which is
  // 8 calendar days after the start of expiresOn date at 00:00 Vancouver.
  const deletionDateVancouver = addCalendarDays(expiresOn, 8);
  const isEligibleForDeletion = vancouverToday >= deletionDateVancouver;

  let statusLabel: string;
  let retentionNote: string;

  if (isEligibleForDeletion) {
    statusLabel = `Expired on ${expiresOn}`;
    retentionNote =
      "Eligible for deletion (7 calendar days have passed since expiry in America/Vancouver).";
  } else if (isExpired) {
    statusLabel = `Expired on ${expiresOn}`;
    retentionNote = `Retained until ${deletionDateVancouver} (7 calendar days after expiry in America/Vancouver).`;
  } else {
    statusLabel = `Expires on ${expiresOn}`;
    retentionNote = `Retained for 7 calendar days after expiry (until ${deletionDateVancouver} in America/Vancouver).`;
  }

  return {
    hasExpiry: true,
    isExpired,
    isEligibleForDeletion,
    deletionDateVancouver,
    statusLabel,
    retentionNote,
  };
}

export function MyPublishedDeals() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

  // Query signed-in deals; skipped when signed out.
  const deals = useQuery(listMineRef, isAuthenticated ? { limit: 50 } : "skip");
  const removeDeal = useMutation(api.deals.remove);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleConfirmDelete(dealId: Id<"deals">) {
    setDeletingId(dealId);
    setDeleteError(null);
    try {
      await removeDeal({ dealId });
      setConfirmingId(null);
    } catch {
      setDeleteError("Could not delete this deal. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="narrow-page my-published-deals" aria-label="Your published deals">
      <div className="panel form-stack">
        <div className="page-heading" style={{ marginBottom: "0.5rem" }}>
          <h2>Your published deals</h2>
          <p className="muted">
            Deals you published to the community map and feed. These are public and visible to everyone.
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

        {authLoading ? (
          <p role="status">Checking your session…</p>
        ) : !isAuthenticated ? (
          <div className="signed-out-prompt" style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <h3>Sign in to see your published deals</h3>
            <p className="muted">Deals you share are saved to your account so you can review or edit them later.</p>
            <Link className="button primary" href="/signin?next=/post" style={{ marginTop: "0.5rem" }}>
              Sign in
            </Link>
          </div>
        ) : deals === undefined ? (
          <p role="status">Loading your published deals…</p>
        ) : deals.length === 0 ? (
          <div className="empty-state" style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <h3>You haven’t published any deals yet</h3>
            <p className="muted">
              Use the form above to post a deal from a screenshot, flyer, or text. Once published, your deal will appear here and on the map.
            </p>
          </div>
        ) : (
          <div className="published-deals-list" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {deleteError && (
              <p role="alert" className="field-error" style={{ margin: 0 }}>
                {deleteError}
              </p>
            )}
            {deals.map((deal) => {
              const source = classifyDealSource(deal.sourceUrl);
              const retention = getDealRetentionInfo(deal.expiresOn);
              const isConfirming = confirmingId === deal._id;
              const isDeleting = deletingId === deal._id;

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
                    <span style={{ fontWeight: 600, color: retention.isExpired ? "var(--red, #c5221f)" : "inherit" }}>
                      {retention.statusLabel}
                    </span>
                    <p style={{ margin: "2px 0 0 0", color: "var(--muted)", fontSize: "0.8rem" }}>
                      {retention.retentionNote}
                    </p>
                  </div>

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

                    {isConfirming ? (
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <button
                          type="button"
                          className="button danger"
                          disabled={isDeleting}
                          onClick={() => handleConfirmDelete(deal._id)}
                        >
                          {isDeleting ? "Deleting…" : "Confirm delete"}
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={isDeleting}
                          onClick={() => setConfirmingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : retention.isEligibleForDeletion ? (
                      <button
                        type="button"
                        className="button danger"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmingId(deal._id);
                        }}
                      >
                        Delete deal
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button secondary"
                        disabled
                        title="Deals can only be deleted 7 calendar days after expiry (America/Vancouver). Unknown expiry is retained."
                      >
                        Delete (locked)
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
