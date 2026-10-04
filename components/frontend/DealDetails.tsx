"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeSourceUrl } from "@/lib/frontend/workflow";
import { useFrontend } from "./FrontendProvider";
import { DealImage, Price, TimeBadge } from "./DealCard";
import { Icon } from "./Icon";
import { Dialog } from "./Dialog";
import { PreviewNote } from "./Shell";
import { useClock } from "./useClock";
export function DealDetails({ id }: { id: string }) {
  const app = useFrontend();
  const router = useRouter();
  const { now, ready } = useClock();
  const [imageOpen, setImageOpen] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [message, setMessage] = useState("");
  const deal = app.deals.find((d) => d.id === id);
  const isOwn =
    app.mode === "preview" && app.previewPosts.some((d) => d.id === id);
  if (app.loading)
    return (
      <div className="medium-page">
        <div
          className="skeleton-card"
          aria-label="Loading deal"
          aria-busy="true"
        >
          <div />
          <span />
        </div>
      </div>
    );
  if (!deal)
    return (
      <div className="narrow-page panel empty-state" style={{ marginTop: 40 }}>
        <Icon name="search" size={32} />
        <h1 style={{ fontSize: 32 }}>This deal isn’t on the menu.</h1>
        <p>
          It may have been removed, or it may no longer be in the public feed.
        </p>
        <Link className="button secondary" href="/">
          Back to Discover
        </Link>
      </div>
    );
  const source = safeSourceUrl(deal.sourceUrl);
  const selected = app.votes[id];
  function vote(value: "still_on" | "expired") {
    if (!app.authenticated) {
      router.push(`/signin?next=${encodeURIComponent(`/deal/${id}`)}`);
      return;
    }
    app.votePreview(id, value);
    setMessage("Preview feedback updated. No live vote was cast.");
  }
  return (
    <div className="medium-page">
      <div className="page-tools">
        <Link href="/" className="back-link">
          <Icon name="back" size={16} /> Back to Discover
        </Link>
        {isOwn && (
          <div className="inline-actions">
            <Link
              href={`/post?edit=${encodeURIComponent(id)}`}
              className="icon-button"
              aria-label="Edit preview deal"
            >
              <Icon name="edit" size={20} />
            </Link>
            <button
              className="icon-button"
              aria-label="Delete preview deal"
              onClick={() => setDeleteOpen(true)}
            >
              <Icon name="trash" size={20} />
            </button>
          </div>
        )}
      </div>
      <PreviewNote short />
      <div className="detail-grid">
        <button
          className="detail-photo"
          onClick={() => deal.imageUrl && setImageOpen(true)}
          disabled={!deal.imageUrl}
          aria-label="Open deal image"
        >
          <DealImage deal={deal} priority />
        </button>
        <div className="detail-info">
          {ready && <TimeBadge deal={deal} now={now} />}
          <h1>{deal.restaurant}</h1>
          <p className="card-description">{deal.dealText}</p>
          <p className="muted" style={{ fontSize: 15 }}>
            {deal.description}
          </p>
          <div className="offer">
            <span>
              <Price deal={deal} />
            </span>
            {deal.originalPrice && <del>${deal.originalPrice.toFixed(2)}</del>}
          </div>
          <dl className="detail-list">
            <div>
              <dt>Where</dt>
              <dd>{deal.address ?? "Address not listed"}</dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>
                {deal.validDays.length
                  ? deal.validDays
                      .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
                      .join(" · ")
                  : "Every day"}
                <br />
                {deal.validStart || deal.validEnd
                  ? `${deal.validStart ?? "No start time"} – ${deal.validEnd ?? "No end time"}`
                  : "Hours not listed"}
              </dd>
            </div>
            <div>
              <dt>Until</dt>
              <dd>
                {deal.expiresOn ?? "No expiry listed"}
                {deal.startsOn && (
                  <>
                    <br />
                    Starts {deal.startsOn}
                  </>
                )}
              </dd>
            </div>
            {deal.conditions.length > 0 && (
              <div>
                <dt>The details</dt>
                <dd>
                  <ul>
                    {deal.conditions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {deal.authorName && (
              <div>
                <dt>Found by</dt>
                <dd>{deal.authorName}</dd>
              </div>
            )}
          </dl>
          <section className="community-panel">
            <h2 className="detail-subheading">Still on the menu?</h2>
            {app.mode === "preview" ? (
              <>
                <div className="vote-buttons">
                  <button
                    aria-pressed={selected === "still_on"}
                    onClick={() => vote("still_on")}
                  >
                    <Icon name="thumb" size={18} /> Still on{" "}
                    <span>
                      {(deal.stillOnCount ?? 0) +
                        (selected === "still_on" ? 1 : 0)}
                    </span>
                  </button>
                  <button
                    aria-pressed={selected === "expired"}
                    onClick={() => vote("expired")}
                  >
                    <Icon name="clock" size={18} /> Expired{" "}
                    <span>
                      {(deal.expiredCount ?? 0) +
                        (selected === "expired" ? 1 : 0)}
                    </span>
                  </button>
                </div>
                <p className="quiet-note" role="status">
                  {message ||
                    "Try the feedback controls. These are example counts."}
                </p>
              </>
            ) : (
              <p className="quiet-note">
                Community voting isn’t available in this version yet.
              </p>
            )}
          </section>
          <div className="detail-bottom">
            {source && (
              <a
                className="button outline"
                href={source}
                target="_blank"
                rel="noopener noreferrer"
              >
                View source <Icon name="external" size={18} />
              </a>
            )}
            {deal.lat !== undefined && deal.lng !== undefined && (
              <a
                className="button primary"
                href={`https://www.openstreetmap.org/?mlat=${deal.lat}&mlon=${deal.lng}#map=17/${deal.lat}/${deal.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View location <Icon name="pin" size={18} />
              </a>
            )}
          </div>
        </div>
      </div>
      {deal.lat !== undefined && deal.lng !== undefined && (
        <section className="location-panel panel">
          <h2 className="detail-subheading">The place behind the offer</h2>
          <iframe
            loading="lazy"
            title={`${deal.restaurant} verified location`}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${deal.lng - 0.005}%2C${deal.lat - 0.003}%2C${deal.lng + 0.005}%2C${deal.lat + 0.003}&layer=mapnik&marker=${deal.lat}%2C${deal.lng}`}
          />
          <p className="quiet-note">
            Map data © OpenStreetMap contributors. Location supplied by the
            verified workflow record.
          </p>
        </section>
      )}
      <Dialog
        title="Deal image"
        open={imageOpen}
        onClose={() => setImageOpen(false)}
      >
        <div className="full-image">
          <DealImage deal={deal} />
        </div>
      </Dialog>
      <Dialog
        title="Delete this preview?"
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
      >
        <p className="muted">
          {deal.restaurant} will be removed from this tab’s preview. No shared
          post will be deleted.
        </p>
        <div className="form-actions">
          <button
            className="button secondary"
            onClick={() => setDeleteOpen(false)}
          >
            Keep it
          </button>
          <button
            className="button danger"
            onClick={() => {
              app.removePreviewPost(id);
              setDeleteOpen(false);
              router.push("/profile");
            }}
          >
            Delete preview
          </button>
        </div>
      </Dialog>
    </div>
  );
}
