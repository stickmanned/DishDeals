"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PublishedDealMap } from "@/components/maps/PublishedDealMap";
import { isValidDealId, safeSourceUrl, formatValidityLabel } from "@/lib/mapPage";
import { validNow } from "@/lib/validNow";
import { useClock } from "@/components/frontend/useClock";
import { Icon } from "@/components/frontend/Icon";
import { Dialog } from "@/components/frontend/Dialog";
import { canEditDeal, submitDealDelete } from "@/lib/dealEdit";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class DealDetailsErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="narrow-page panel empty-state" style={{ marginTop: 40 }}>
          <Icon name="search" size={32} />
          <h1 style={{ fontSize: 32 }}>We couldn’t load this deal.</h1>
          <p>Check your connection and try again.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
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
            <Link className="button primary" href="/">
              Back to Discover
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function CanonicalDealDetails({ id }: { id: string }) {
  // Check backend configuration
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <div className="narrow-page panel empty-state" style={{ marginTop: 40 }}>
        <Icon name="pin" size={32} />
        <h1 style={{ fontSize: 32 }}>Backend unconfigured</h1>
        <p role="status">The live deal service is unavailable here. Please return when it is connected.</p>
        <Link className="button secondary" href="/">
          Back to Discover
        </Link>
      </div>
    );
  }

  // Validate database ID format
  if (!isValidDealId(id)) {
    return (
      <div className="narrow-page panel empty-state" style={{ marginTop: 40 }}>
        <Icon name="search" size={32} />
        <h1 style={{ fontSize: 32 }}>Invalid deal link</h1>
        <p>The deal identifier is invalid or malformed.</p>
        <Link className="button secondary" href="/">
          Back to Discover
        </Link>
      </div>
    );
  }

  return (
    <DealDetailsErrorBoundary key={id}>
      <CanonicalDealDetailsContent dealId={id as Id<"deals">} />
    </DealDetailsErrorBoundary>
  );
}

function CanonicalDealDetailsContent({ dealId }: { dealId: Id<"deals"> }) {
  const router = useRouter();
  const { now, ready: clockReady } = useClock();
  const { isAuthenticated } = useConvexAuth();

  const deal = useQuery(api.deals.get, { dealId });
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const castVote = useMutation(api.votes.cast);
  const removeDeal = useMutation(api.deals.remove);

  const [votingBusy, setVotingBusy] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);

  // Loading state
  if (deal === undefined) {
    return (
      <div className="medium-page">
        <div className="skeleton-card" aria-label="Loading deal" aria-busy="true">
          <div />
          <span />
        </div>
      </div>
    );
  }

  // Not found state
  if (deal === null) {
    return (
      <div className="narrow-page panel empty-state" style={{ marginTop: 40 }}>
        <Icon name="search" size={32} />
        <h1 style={{ fontSize: 32 }}>This deal isn’t on the menu.</h1>
        <p>It may have been removed, or it may no longer be in the public feed.</p>
        <Link className="button secondary" href="/">
          Back to Discover
        </Link>
      </div>
    );
  }

  // Real signed-in userId vs canonical authorId only; the backend authorizes again on every write.
  const isAuthor = canEditDeal(me, deal);
  const source = safeSourceUrl(deal.sourceUrl);
  const val = validNow(deal, now);
  const valDisplay = clockReady ? formatValidityLabel(val) : { label: "Checking hours…", isValid: false };

  const handleVote = async (value: "still_on" | "expired") => {
    if (!isAuthenticated) {
      router.push(`/signin?next=${encodeURIComponent(`/deal/${dealId}`)}`);
      return;
    }

    if (votingBusy) return;

    setVotingBusy(true);
    setVoteError(null);

    try {
      await castVote({ dealId, value });
    } catch {
      setVoteError("Could not submit feedback. Please check your connection and try again.");
    } finally {
      setVotingBusy(false);
    }
  };

  const handleDelete = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const outcome = await submitDealDelete(removeDeal, dealId);
    if (outcome.ok) {
      // Navigate only after the server confirmed the removal.
      router.push("/map");
      return;
    }
    setDeleteError(outcome.message);
    setDeleteBusy(false);
  };

  return (
    <div className="medium-page">
      {/* Top back navigation and author controls */}
      <div className="page-tools">
        <Link href="/" className="back-link">
          <Icon name="back" size={16} /> Back to Discover
        </Link>
        {isAuthor && (
          <div className="inline-actions">
            <Link
              href={`/deal/${dealId}/edit`}
              className="icon-button"
              aria-label="Edit deal"
            >
              <Icon name="edit" size={20} />
            </Link>
            <button
              type="button"
              className="icon-button"
              aria-label="Delete deal"
              disabled={deleteBusy}
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              <Icon name="trash" size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Main details grid */}
      <div className="detail-grid">
        <button
          type="button"
          className="detail-photo"
          onClick={() => deal.imageUrl && setImageOpen(true)}
          disabled={!deal.imageUrl}
          aria-label={deal.imageUrl ? "Open full deal image" : "Deal image not available"}
        >
          {deal.imageUrl ? (
            <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 280 }}>
              <Image
                src={deal.imageUrl}
                alt={`${deal.restaurant} deal photograph`}
                fill
                sizes="(max-width: 700px) 100vw, 450px"
                style={{ objectFit: "cover" }}
                priority
              />
            </div>
          ) : (
            <div className="image-fallback">
              <Icon name="photo" size={36} />
              <span>No image provided</span>
            </div>
          )}
        </button>

        <div className="detail-info">
          <span className={`time-badge ${valDisplay.isValid ? "is-valid" : ""}`}>
            <span className="status-dot" />
            {valDisplay.label}
          </span>

          <h1>{deal.restaurant}</h1>
          <p className="card-description">{deal.dealText}</p>

          <div className="offer">
            <span>
              {deal.priceCad !== undefined && deal.priceCad !== null
                ? `$${Number(deal.priceCad).toFixed(2)} CAD`
                : "Price varies"}
            </span>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Where</dt>
              <dd>{deal.address ?? "Address not listed"}</dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>
                {Array.isArray(deal.validDays) && deal.validDays.length > 0
                  ? deal.validDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(" · ")
                  : "Every day"}
                <br />
                {deal.validStart || deal.validEnd
                  ? `${deal.validStart ?? "Open"} – ${deal.validEnd ?? "Close"}`
                  : "Hours not listed"}
              </dd>
            </div>
            <div>
              <dt>Until</dt>
              <dd>{deal.expiresOn ?? "No expiry date listed"}</dd>
            </div>
            {Array.isArray(deal.conditions) && deal.conditions.length > 0 && (
              <div>
                <dt>Conditions</dt>
                <dd>
                  <ul>
                    {deal.conditions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {deal.authorName && (
              <div>
                <dt>Found by</dt>
                <dd>
                  {deal.authorName}
                  {deal.authorWallet && (
                    <span style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)" }}>
                      Devnet wallet: {deal.authorWallet.slice(0, 6)}…{deal.authorWallet.slice(-4)}
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>

          {/* Community feedback / voting */}
          <section className="community-panel">
            <h2 className="detail-subheading">Still on the menu?</h2>
            <div className="vote-buttons">
              <button
                type="button"
                aria-pressed={deal.viewerVote === "still_on"}
                onClick={() => handleVote("still_on")}
                disabled={votingBusy}
                aria-label={`Vote still on the menu (${deal.stillOnCount ?? 0} votes)`}
              >
                <Icon name="thumb" size={18} /> Still on <span>{deal.stillOnCount ?? 0}</span>
              </button>
              <button
                type="button"
                aria-pressed={deal.viewerVote === "expired"}
                onClick={() => handleVote("expired")}
                disabled={votingBusy}
                aria-label={`Vote expired (${deal.expiredCount ?? 0} votes)`}
              >
                <Icon name="clock" size={18} /> Expired <span>{deal.expiredCount ?? 0}</span>
              </button>
            </div>

            {voteError && (
              <p className="quiet-note" role="alert" style={{ color: "#c41e3a", marginTop: 8 }}>
                {voteError}
              </p>
            )}

            {!isAuthenticated && (
              <p className="quiet-note" style={{ marginTop: 8 }}>
                <Link href={`/signin?next=${encodeURIComponent(`/deal/${dealId}`)}`} style={{ textDecoration: "underline" }}>
                  Sign in
                </Link>{" "}
                to cast community votes.
              </p>
            )}
          </section>

          {/* Action links */}
          <div className="detail-bottom">
            {source && (
              <a className="button outline" href={source} target="_blank" rel="noopener noreferrer">
                View source <Icon name="external" size={18} />
              </a>
            )}
            {typeof deal.lat === "number" && Number.isFinite(deal.lat) && typeof deal.lng === "number" && Number.isFinite(deal.lng) && (
              <a
                className="button primary"
                href={`https://www.openstreetmap.org/?mlat=${deal.lat}&mlon=${deal.lng}#map=17/${deal.lat}/${deal.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions <Icon name="pin" size={18} />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Embedded Location Map with confirmed deal location */}
      {typeof deal.lat === "number" && Number.isFinite(deal.lat) && typeof deal.lng === "number" && Number.isFinite(deal.lng) && (
        <section className="location-panel panel" style={{ marginTop: 32 }}>
          <h2 className="detail-subheading">The place behind the offer</h2>
          <div style={{ height: 320, width: "100%", borderRadius: 12, overflow: "hidden", position: "relative" }}>
            <PublishedDealMap
              deals={[deal]}
              selectedId={deal._id}
              initialCenter={[deal.lng, deal.lat]}
              initialZoom={14}
              fitOnLoad={false}
              ariaLabel={`${deal.restaurant} verified location`}
              style={{ height: "100%", width: "100%" }}
            />
          </div>
          <p className="quiet-note" style={{ marginTop: 8 }}>
            Location confirmed by community contributor. Map data © OpenStreetMap contributors.
          </p>
        </section>
      )}

      {/* Explicit destructive confirmation (author only) */}
      {isAuthor && (
        <Dialog
          title="Delete this deal?"
          open={deleteOpen}
          onClose={() => {
            if (!deleteBusy) setDeleteOpen(false);
          }}
        >
          <div className="form-stack">
            <p>
              This permanently removes “{deal.restaurant}” and its votes from the published map.
              This cannot be undone.
            </p>
            {deleteError && (
              <p role="alert" className="field-error">
                {deleteError}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={deleteBusy}
                onClick={() => setDeleteOpen(false)}
              >
                Keep deal
              </button>
              <button
                type="button"
                className="button primary"
                disabled={deleteBusy}
                onClick={() => void handleDelete()}
              >
                {deleteBusy ? "Deleting…" : "Delete deal"}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Image Modal Dialog */}
      {deal.imageUrl && (
        <Dialog title="Deal photograph" open={imageOpen} onClose={() => setImageOpen(false)}>
          <div style={{ position: "relative", width: "100%", minHeight: 360 }}>
            <Image
              src={deal.imageUrl}
              alt={`${deal.restaurant} deal photograph full`}
              width={800}
              height={600}
              style={{ width: "100%", height: "auto", borderRadius: 8 }}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}
