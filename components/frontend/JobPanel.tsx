"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { GenericId } from "convex/values";
import {
  jobSchema,
  retryAllowed,
  workflowApi,
  type JobData,
} from "@/lib/frontend/workflow";
import { Icon } from "./Icon";
import { useClock } from "./useClock";
import { OfferMap } from "@/components/OfferMap";

export function JobPanel({
  jobId,
  duplicate,
  onNew,
}: {
  jobId: string;
  duplicate: boolean;
  onNew: () => void;
}) {
  const raw = useQuery(workflowApi.get, { jobId: jobId as GenericId<"workflowJobs"> });
  const retry = useMutation(workflowApi.retry);
  const { now } = useClock();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const parsed = useMemo(
    () => (raw === undefined ? undefined : jobSchema.safeParse(raw)),
    [raw],
  );
  if (parsed === undefined)
    return (
      <div className="panel job-status" aria-busy="true">
        <div className="processing-icon">
          <Icon name="refresh" />
        </div>
        <h2>Finding your submission…</h2>
        <p>You can keep this page open while we check.</p>
      </div>
    );
  if (!parsed.success)
    return (
      <div className="panel empty-state">
        <h2>This submission isn’t available.</h2>
        <p>
          It may belong to another session, or its details couldn’t be loaded.
        </p>
        <button className="button secondary" onClick={onNew}>
          Back to your source
        </button>
      </div>
    );
  const job = parsed.data;
  const processing = job.status === "queued" || job.status === "processing";
  return (
    <div className="panel">
      <div className="job-status" role="status">
        {processing && (
          <div className="processing-icon">
            <Icon name="refresh" />
          </div>
        )}
        <p className="eyebrow">
          {duplicate ? "ALREADY SUBMITTED · EXISTING JOB" : "YOUR SUBMISSION"}
        </p>
        <h2>
          {job.status === "queued"
            ? "Your find is in the queue."
            : job.status === "processing"
              ? "Taking a look at your find."
              : job.status === "failed"
                ? "We couldn’t read this find."
                : job.deals.length
                  ? "Here’s what we found."
                  : "No deal found."}
        </h2>
        <p>
          {processing
            ? "Checking the offer and its restaurant. It can take a few minutes. There’s no need to submit it again."
            : job.status === "failed"
              ? (job.error && typeof job.error === "object" && "message" in job.error && typeof job.error.message === "string"
                ? job.error.message : "Add the post text or an optional image, then try again.")
              : job.deals.length
                ? "Each offer has its own status. Review the details before approving."
                : (job.result?.rejectionReason ??
                  "Try a clearer screenshot or the restaurant’s offer text.")}
        </p>
      </div>
      <details className="help-details">
        <summary>Processing diagnostics</summary>
        <p>Backend job: {job.jobId}</p>
        <p>Status: {job.status}. Last update: {new Date(job.updatedAt).toLocaleString("en-CA", { timeZone: "America/Vancouver" })} (Vancouver).</p>
        {!!job.error && typeof job.error === "object" && "code" in job.error && typeof job.error.code === "string" && <p>Error code: {job.error.code}</p>}
        <p>Offers: {job.deals.length}; published: {job.deals.filter(offer => offer.status === "published").length}; awaiting review: {job.deals.filter(offer => offer.status === "needs_review").length}.</p>
      </details>
      {job.result?.source?.publishedAt && (
        <p className="quiet-note">
          Original post: {job.result.source.publishedAt}
        </p>
      )}
      {job.deals.map((offer) => (
        <ReviewCard
          key={offer.dealId}
          offer={offer}
          originalDate={job.result?.source?.publishedAt}
          onNew={onNew}
        />
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        {retryAllowed(job, now.getTime()) && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await retry({ jobId: jobId as GenericId<"workflowJobs"> });
              } catch {
                setError(
                  "This submission couldn’t be retried. It may already be running or reviewed, or the hourly limit may have been reached.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Retrying…" : "Retry processing"}
          </button>
        )}
        <button className="button outline" onClick={onNew}>
          Add details or try another source
        </button>
      </div>
      <Link href="/" className="text-link" style={{ marginTop: 20 }}>
        Back to Discover
      </Link>
    </div>
  );
}

function ReviewCard({
  offer,
  originalDate,
  onNew,
}: {
  offer: JobData["deals"][number];
  originalDate?: string | null;
  onNew: () => void;
}) {
  const review = useMutation(workflowApi.review);
  const places = offer.restaurant
    ? [
        offer.restaurant,
        ...offer.candidates.filter(
          (p) => p.placeId !== offer.restaurant?.placeId,
        ),
      ]
    : offer.candidates;
  const [selected, setSelected] = useState(
      offer.restaurant?.placeId ??
        (places.length === 1 ? places[0].placeId : ""),
    ),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const p = places.find((p) => p.placeId === selected);
  const d = offer.deal;
  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError("");
    try {
      const result = await review({
        dealId: offer.dealId as GenericId<"workflowDeals">,
        decision,
        ...(offer.candidates.some((c) => c.placeId === selected)
          ? { placeId: selected }
          : {}),
      });
      setMessage(
        result.status === "published"
          ? "The offer is published."
          : "The offer was rejected.",
      );
    } catch {
      setError(
        "We couldn’t save this decision. Check your session, connection, and whether the offer has already been reviewed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="result-card">
      <span className={`result-status ${offer.status}`}>
        {offer.status === "needs_review"
          ? "Needs your review"
          : offer.status === "published"
            ? "Published"
            : "Rejected"}
      </span>
      <h3>{d.restaurantName}</h3>
      <p>{d.title}</p>
      <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>
        {d.description}
      </p>
      <div className="offer">
        {d.price !== null && d.currency
          ? `${d.currency} ${d.price.toFixed(2)}`
          : "Price / currency unknown"}
      </div>
      <dl className="readonly-list">
        <dt>Days</dt>
        <dd>{d.days.length ? d.days.join(", ") : "Days not listed"}</dd>
        <dt>Hours</dt>
        <dd>
          {d.startTime ?? "Not listed"} – {d.endTime ?? "Not listed"}
        </dd>
        <dt>Dates</dt>
        <dd>
          {d.startDate ?? "Start not listed"} →{" "}
          {d.endDate ?? "No expiry listed"}
        </dd>
        <dt>Conditions</dt>
        <dd>
          {d.conditions.length ? d.conditions.join(" · ") : "None listed"}
        </dd>
        <dt>Confidence</dt>
        <dd>{Math.round(d.confidence * 100)}% overall extraction confidence</dd>
      </dl>
      <blockquote>“{d.evidence}”</blockquote>
      {!originalDate && (
        <p className="notice">
          The original post date is unknown. Check that this offer is current.
        </p>
      )}
      {[...offer.reviewReasons, ...d.warnings].length > 0 && (
        <ul
          className="quiet-note"
          style={{ paddingLeft: 20, margin: "16px 0" }}
        >
          {[...new Set([...offer.reviewReasons, ...d.warnings])].map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {offer.status === "needs_review" && (
        <>
          <h3 className="detail-subheading" style={{ marginTop: 24 }}>
            Confirm the restaurant.
          </h3>
          {places.length ? (
            <fieldset style={{ padding: 0, border: 0 }}>
              <legend className="quiet-note">
                Choose a verified branch from this submission.
              </legend>
              {places.map((place) => (
                <label className="candidate" key={place.placeId}>
                  <input
                    type="radio"
                    name={`place-${offer.dealId}`}
                    value={place.placeId}
                    checked={selected === place.placeId}
                    onChange={() => {
                      setSelected(place.placeId);
                      setConfirmed(false);
                    }}
                  />
                  <span>
                    {place.name}
                    <small>{place.address}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="notice">
              No verified restaurant was found. Use a clearer source with the
              branch address.
            </p>
          )}
          {p && (
            <div className="location-panel">
              <OfferMap
                key={p.placeId}
                deals={[{ id: p.placeId, restaurantName: p.name, title: "Restaurant candidate",
                  latitude: p.latitude, longitude: p.longitude, address: p.address }]}
                initialCenter={[p.longitude, p.latitude]}
                initialZoom={14}
                showLocateControl={false}
                showDealCard={false}
                ariaLabel={`${p.name} candidate location`}
                style={{ height: 320 }}
              />
              <p className="quiet-note">
                © OpenStreetMap contributors · Restaurant candidate from this
                submission.
              </p>
            </div>
          )}
          <label className="check-row" style={{ marginTop: 20 }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={!p}
            />
            <span>
              I checked the offer and this branch.
              <small>
                Approval confirms the price, conditions, dates, and restaurant.
              </small>
            </span>
          </label>
          <p className="quiet-note" style={{ marginTop: 16 }}>
            These extracted fields can’t be edited here. Correct the source and
            submit again if something is wrong.
          </p>
          <div className="form-actions">
            <button
              className="button outline"
              disabled={busy}
              onClick={() => void decide("reject")}
            >
              Reject offer
            </button>
            <button
              className="button primary"
              disabled={busy || !confirmed || !p}
              onClick={() => void decide("approve")}
            >
              {busy ? "Saving…" : "Approve offer"}
              <Icon name="check" size={18} />
            </button>
          </div>
          <button
            className="text-link"
            style={{ marginTop: 16 }}
            onClick={onNew}
          >
            Correct source and resubmit
          </button>
        </>
      )}
      {offer.status === "published" && (
        <Link
          className="button secondary"
          href={`/deal?id=${encodeURIComponent(offer.dealId)}`}
        >
          View published offer <Icon name="arrow" size={18} />
        </Link>
      )}
      {error && (
        <p role="alert" className="form-error" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-success" style={{ marginTop: 16 }}>
          {message}
        </p>
      )}
    </article>
  );
}
