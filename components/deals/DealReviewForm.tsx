"use client";

import { useState, useId, useEffect, useRef, type ReactNode, type FormEvent } from "react";
import {
  type DealDraft,
  type DealDraftAction,
  type PublishFields,
  type Weekday,
  CANONICAL_WEEKDAYS,
} from "../../lib/dealDraft";
import {
  evaluateIssueResolution,
  formatConfidence,
  formatWeekday,
  getPriceDisplayOnAcceptAll,
  hasPendingSuggestions,
  OMISSION_SEMANTICS,
  nextTimeAction,
  parsePriceInput,
  submitForPublish,
  transitionWeekdaySelection,
} from "../../lib/dealReviewForm";

export interface DealReviewFormProps {
  draft: DealDraft;
  onAction: (action: DealDraftAction) => void;
  onPublish?: (fields: PublishFields) => Promise<void>;
  publishUnavailableReason?: string;
  renderLocation?: (context: {
    draft: DealDraft;
    onConfirm: (point: { lat: number; lng: number }) => void;
  }) => ReactNode;
  busy?: boolean;
  submitLabel?: string;
  title?: string;
}

function SuggestionItem({
  label,
  valueText,
  confidence,
  onAccept,
  onDismiss,
}: {
  label?: string;
  valueText: string | null;
  confidence?: number;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const confText = formatConfidence(confidence);
  const displayVal = valueText !== null ? `“${valueText}”` : "None";
  return (
    <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
      <span>{label ?? "Suggestion"}: {displayVal} </span>
      {confText && <span>({confText}) </span>}
      <button type="button" className="text-button" onClick={onAccept}>
        Accept
      </button>{" "}
      |{" "}
      <button type="button" className="text-button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

export function DealReviewForm({
  draft,
  onAction,
  onPublish,
  publishUnavailableReason,
  renderLocation,
  busy = false,
  submitLabel = "Publish deal",
  title = "Review Deal Draft",
}: DealReviewFormProps) {
  const idPrefix = useId();
  const restaurantId = `${idPrefix}-restaurant`;
  const dealTextId = `${idPrefix}-dealText`;
  const priceId = `${idPrefix}-price`;
  const expiresOnId = `${idPrefix}-expiresOn`;
  const addressId = `${idPrefix}-address`;
  const validStartId = `${idPrefix}-validStart`;
  const validEndId = `${idPrefix}-validEnd`;
  // Read the field's real value on change, input and blur: iOS's native time picker can empty it without a change event.
  const syncTime = (field: "validStart" | "validEnd", raw: string) => {
    if (raw === (draft.fields[field].value ?? "")) return;
    onAction(nextTimeAction(field, raw, { validStart: draft.fields.validStart.value, validEnd: draft.fields.validEnd.value }));
  };
  const conditionsId = `${idPrefix}-conditions`;

  const [publishErrors, setPublishErrors] = useState<string[]>([]);
  const [publishRejection, setPublishRejection] = useState<string>("");
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  // A result that lands above the visible part of a phone screen looks like nothing happened: bring it into view.
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (publishErrors.length === 0 && !publishRejection) return;
    noticeRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    noticeRef.current?.focus({ preventScroll: true });
  }, [publishErrors, publishRejection]);

  // Local state for price input to retain invalid/partial text without overwriting canonical amount prematurely
  const [localPrice, setLocalPrice] = useState<string>(
    draft.fields.priceCad.value !== null ? draft.fields.priceCad.value.toString() : ""
  );
  const [priceInputError, setPriceInputError] = useState<string>("");

  // Weekday selection notice (e.g. reminder when trying to uncheck last weekday)
  const [weekdayNotice, setWeekdayNotice] = useState<string>("");

  // Local state for resolution notes keyed by issue id
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  const f = draft.fields;
  const anySuggestions = hasPendingSuggestions(draft);

  function handlePriceChange(val: string) {
    setLocalPrice(val);
    const parsed = parsePriceInput(val);
    if (!parsed.valid) {
      setPriceInputError(parsed.error ?? "Invalid price");
    } else {
      setPriceInputError("");
      onAction({
        type: "SET_FIELD",
        field: "priceCad",
        value: parsed.value,
      });
    }
  }

  function handleAcceptPriceSuggestion() {
    onAction({ type: "ACCEPT_SUGGESTION", field: "priceCad" });
    const sug = draft.fields.priceCad.suggestion;
    if (sug !== undefined && sug.value !== null) {
      setLocalPrice(String(sug.value));
    } else {
      setLocalPrice("");
    }
    setPriceInputError("");
  }

  function handleOmitPrice() {
    onAction({ type: "REVIEW_OMISSION", field: "priceCad" });
    setLocalPrice("");
    setPriceInputError("");
  }

  function handleAcceptAll() {
    onAction({ type: "ACCEPT_ALL_SUGGESTIONS" });
    if (draft.fields.priceCad.suggestion !== undefined) {
      setLocalPrice(getPriceDisplayOnAcceptAll(draft));
      setPriceInputError("");
    }
  }

  function handleSelectOffer(offerIndex: number) {
    onAction({ type: "SELECT_OFFER", offerIndex });
    // Selecting an offer proposes values; explicit acceptance changes inputs.
    // Preserve partial manual price text and its error until the user acts.
  }

  function handleDayToggle(day: Weekday) {
    setWeekdayNotice("");
    const transition = transitionWeekdaySelection(f.validDays.value, day);
    if (transition.blocked) {
      setWeekdayNotice(transition.message ?? "Cannot uncheck the last weekday.");
      return;
    }
    onAction({
      type: "SET_FIELD",
      field: "validDays",
      value: transition.nextDays,
    });
  }

  function handleSetEveryDay() {
    setWeekdayNotice("");
    onAction({
      type: "SET_FIELD",
      field: "validDays",
      value: [],
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPublishErrors([]);
    setPublishRejection("");

    if (!onPublish) {
      return;
    }

    setIsPublishing(true);
    try {
      // One result for every outcome: published, what still needs fixing, or a failure message (never silence).
      const outcome = await submitForPublish(draft, localPrice, onPublish);
      if (outcome.kind === "blocked") setPublishErrors(outcome.errors);
      else if (outcome.kind === "failed") setPublishRejection(outcome.message);
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <form className="form-stack panel" onSubmit={handleSubmit} noValidate>
      <div className="review-header">
        <div>
          <h2>{title}</h2>
          <p className="quiet-note">
            Review suggestions and confirm details before publishing. Every field must be
            explicitly checked.
          </p>
        </div>
      </div>

      {/* Provenance */}
      {(draft.sourceUrl || draft.imageId) && (
        <div className="quiet-note">
          {draft.sourceUrl && (
            <span>
              Source:{" "}
              <a href={draft.sourceUrl} target="_blank" rel="noreferrer">
                {draft.sourceUrl}
              </a>
            </span>
          )}
          {draft.sourceUrl && draft.imageId && <span> &bull; </span>}
          {draft.imageId && <span>Image ID: {draft.imageId}</span>}
        </div>
      )}

      {/* Extraction Status Notifications */}
      {draft.extraction.status === "pending" && (
        <div role="status" className="panel quiet-note">
          Extraction in progress… Suggestions will appear when complete.
        </div>
      )}
      {draft.extraction.status === "no_deal_detected" && (
        <div role="status" className="panel quiet-note">
          No clear dining deal was extracted. You may fill in the details manually below.
        </div>
      )}
      {draft.extraction.status === "error" && (
        <div role="alert" className="form-error">
          Extraction error: {draft.extraction.error}
        </div>
      )}
      {draft.extraction.status === "canceled" && (
        <div role="status" className="quiet-note">
          Extraction was canceled.
        </div>
      )}

      {/* Multi-Offer Selection */}
      {draft.extraction.unselectedOffers && draft.extraction.unselectedOffers.length > 1 && (
        <div className="panel form-stack">
          <h3>Multiple Offers Detected</h3>
          <p className="quiet-note">Select which offer to review for this deal:</p>
          <div className="form-actions">
            {draft.extraction.unselectedOffers.map((offer, idx) => (
              <button
                key={idx}
                type="button"
                className={`button ${draft.extraction.selectedOfferIndex === idx ? "primary" : "secondary"}`}
                onClick={() => handleSelectOffer(idx)}
              >
                Offer {idx + 1}: {offer.dealText || offer.restaurant || "Untitled"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Review Notices & Issues */}
      {draft.reviewIssues.length > 0 && (
        <div className="panel form-stack">
          <h3>Review Notices ({draft.reviewIssues.length})</h3>
          {draft.reviewIssues.map((issue) => {
            const evaluation = evaluateIssueResolution(issue);
            const noteText = resolutionNotes[issue.id] ?? "";

            return (
              <div
                key={issue.id}
                className="panel"
                style={{
                  borderLeft: issue.blocking ? "4px solid var(--red)" : "4px solid var(--warning)",
                  padding: "0.75rem",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{issue.code}</strong>
                  <span className="quiet-note">{issue.blocking ? "Blocking" : "Warning"}</span>
                </div>
                <p>{issue.detail}</p>
                {issue.originalAmount !== undefined && (
                  <p className="quiet-note">Extracted amount: {issue.originalAmount}</p>
                )}

                {issue.resolved ? (
                  <p className="quiet-note" style={{ color: "var(--basil)" }}>
                    ✓ Resolved: {issue.resolutionNote}
                  </p>
                ) : (
                  <div>
                    {!evaluation.canResolve ? (
                      <p className="quiet-note" style={{ color: "var(--red-hover)" }}>
                        {evaluation.reason}
                      </p>
                    ) : (
                      <div className="field-row" style={{ marginTop: "0.5rem" }}>
                        <input
                          placeholder="Enter resolution explanation"
                          value={noteText}
                          onChange={(e) =>
                            setResolutionNotes({
                              ...resolutionNotes,
                              [issue.id]: e.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          className="button secondary"
                          disabled={noteText.trim().length === 0}
                          onClick={() =>
                            onAction({
                              type: "RESOLVE_REVIEW_ISSUE",
                              issueId: issue.id,
                              resolutionNote: noteText,
                            })
                          }
                        >
                          Resolve Notice
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Global Suggestion Controls */}
      {anySuggestions && (
        <div className="panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>Model Suggestions Available</strong>
            <p className="quiet-note" style={{ margin: 0 }}>
              Accept suggestions to populate fields, or edit fields manually.
            </p>
          </div>
          <button
            type="button"
            className="button primary"
            onClick={handleAcceptAll}
          >
            Accept All Suggestions
          </button>
        </div>
      )}

      {/* Restaurant Field */}
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label htmlFor={restaurantId}>Restaurant Name *</label>
          <span className="quiet-note">
            {f.restaurant.isReviewed ? "Reviewed ✓" : "Needs review"}
          </span>
        </div>
        <input
          id={restaurantId}
          required
          maxLength={200}
          value={f.restaurant.value ?? ""}
          onChange={(e) =>
            onAction({
              type: "SET_FIELD",
              field: "restaurant",
              value: e.target.value || null,
            })
          }
          placeholder="The restaurant offering the deal"
        />
        {f.restaurant.suggestion !== undefined && (
          <SuggestionItem
            valueText={f.restaurant.suggestion.value}
            confidence={f.restaurant.suggestion.confidence}
            onAccept={() => onAction({ type: "ACCEPT_SUGGESTION", field: "restaurant" })}
            onDismiss={() => onAction({ type: "REJECT_SUGGESTION", field: "restaurant" })}
          />
        )}
      </div>

      {/* Deal Text Field */}
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label htmlFor={dealTextId}>Offer Description *</label>
          <span className="quiet-note">
            {f.dealText.isReviewed ? "Reviewed ✓" : "Needs review"}
          </span>
        </div>
        <textarea
          id={dealTextId}
          required
          maxLength={2000}
          value={f.dealText.value ?? ""}
          onChange={(e) =>
            onAction({
              type: "SET_FIELD",
              field: "dealText",
              value: e.target.value || null,
            })
          }
          placeholder="What is the special or promotion?"
        />
        {f.dealText.suggestion !== undefined && (
          <SuggestionItem
            valueText={f.dealText.suggestion.value}
            confidence={f.dealText.suggestion.confidence}
            onAccept={() => onAction({ type: "ACCEPT_SUGGESTION", field: "dealText" })}
            onDismiss={() => onAction({ type: "REJECT_SUGGESTION", field: "dealText" })}
          />
        )}
      </div>

      {/* Price and Expiry */}
      <div className="field-row">
        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label htmlFor={priceId}>Price (CAD)</label>
            <span className="quiet-note">
              {f.priceCad.isReviewed
                ? f.priceCad.value === null
                  ? "Price varies / unknown (reviewed ✓)"
                  : "Reviewed ✓"
                : "Needs review"}
            </span>
          </div>
          <input
            id={priceId}
            inputMode="decimal"
            value={localPrice}
            onChange={(e) => handlePriceChange(e.target.value)}
            placeholder="e.g. 12.50 (blank if varies)"
          />
          {priceInputError && <p className="form-error" role="alert">{priceInputError}</p>}
          {f.priceCad.suggestion !== undefined && (
            <SuggestionItem
              label="Suggested price"
              valueText={
                f.priceCad.suggestion.value !== null
                  ? `$${f.priceCad.suggestion.value}`
                  : "Price varies"
              }
              confidence={f.priceCad.suggestion.confidence}
              onAccept={handleAcceptPriceSuggestion}
              onDismiss={() => onAction({ type: "REJECT_SUGGESTION", field: "priceCad" })}
            />
          )}
          {f.priceCad.value === null && !f.priceCad.isReviewed && (
            <button
              type="button"
              className="text-button"
              onClick={handleOmitPrice}
            >
              {OMISSION_SEMANTICS.priceCad.label}
            </button>
          )}
        </div>

        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label htmlFor={expiresOnId}>Expiry Date</label>
            <span className="quiet-note">
              {f.expiresOn.isReviewed
                ? f.expiresOn.value === null
                  ? "No expiry listed (reviewed ✓)"
                  : "Reviewed ✓"
                : "Needs review"}
            </span>
          </div>
          <input
            id={expiresOnId}
            type="date"
            value={f.expiresOn.value ?? ""}
            onChange={(e) =>
              onAction({
                type: "SET_FIELD",
                field: "expiresOn",
                value: e.target.value || null,
              })
            }
          />
          {f.expiresOn.suggestion !== undefined && (
            <SuggestionItem
              label="Suggested expiry"
              valueText={
                f.expiresOn.suggestion.value !== null
                  ? f.expiresOn.suggestion.value
                  : "No expiry listed"
              }
              confidence={f.expiresOn.suggestion.confidence}
              onAccept={() => onAction({ type: "ACCEPT_SUGGESTION", field: "expiresOn" })}
              onDismiss={() => onAction({ type: "REJECT_SUGGESTION", field: "expiresOn" })}
            />
          )}
          {f.expiresOn.value === null && !f.expiresOn.isReviewed && (
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "REVIEW_OMISSION", field: "expiresOn" })}
            >
              {OMISSION_SEMANTICS.expiresOn.label}
            </button>
          )}
        </div>
      </div>

      {/* Address */}
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label htmlFor={addressId}>Address</label>
          <span className="quiet-note">
            {f.address.isReviewed
              ? f.address.value === null
                ? "No specific address (reviewed ✓)"
                : "Reviewed ✓"
              : "Needs review"}
          </span>
        </div>
        <input
          id={addressId}
          maxLength={500}
          value={f.address.value ?? ""}
          onChange={(e) =>
            onAction({
              type: "SET_FIELD",
              field: "address",
              value: e.target.value || null,
            })
          }
          placeholder="Location address if known"
        />
        {f.address.suggestion !== undefined && (
          <SuggestionItem
            valueText={
              f.address.suggestion.value !== null
                ? f.address.suggestion.value
                : "No specific address"
            }
            confidence={f.address.suggestion.confidence}
            onAccept={() => onAction({ type: "ACCEPT_SUGGESTION", field: "address" })}
            onDismiss={() => onAction({ type: "REJECT_SUGGESTION", field: "address" })}
          />
        )}
        {f.address.value === null && !f.address.isReviewed && (
          <button
            type="button"
            className="text-button"
            onClick={() => onAction({ type: "REVIEW_OMISSION", field: "address" })}
          >
            {OMISSION_SEMANTICS.address.label}
          </button>
        )}
      </div>

      {/* Valid Days */}
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label>Available Days</label>
          <span className="quiet-note">
            {f.validDays.isReviewed
              ? f.validDays.value.length === 0
                ? "Every day (reviewed ✓)"
                : "Reviewed ✓"
              : "Needs review"}
          </span>
        </div>
        <div className="weekdays">
          {CANONICAL_WEEKDAYS.map((day: Weekday) => {
            const active = f.validDays.value.includes(day);
            return (
              <button
                key={day}
                type="button"
                className={`button ${active ? "primary" : "secondary"}`}
                aria-pressed={active}
                onClick={() => handleDayToggle(day)}
              >
                {day.toUpperCase()}
              </button>
            );
          })}
        </div>
        {weekdayNotice && (
          <p className="quiet-note" role="status" style={{ color: "var(--deal-ink)", marginTop: "0.25rem" }}>
            {weekdayNotice}
          </p>
        )}
        {f.validDays.value.length > 0 && (
          <div style={{ marginTop: "0.25rem" }}>
            <button
              type="button"
              className="text-button"
              onClick={handleSetEveryDay}
            >
              Set to available every day
            </button>
          </div>
        )}
        {f.validDays.suggestion !== undefined && (
          <SuggestionItem
            label="Suggested days"
            valueText={
              f.validDays.suggestion.value.length === 0
                ? "Every day"
                : f.validDays.suggestion.value.map(formatWeekday).join(", ")
            }
            confidence={f.validDays.suggestion.confidence}
            onAccept={() => onAction({ type: "ACCEPT_SUGGESTION", field: "validDays" })}
            onDismiss={() => onAction({ type: "REJECT_SUGGESTION", field: "validDays" })}
          />
        )}
        {f.validDays.value.length === 0 && !f.validDays.isReviewed && (
          <button
            type="button"
            className="text-button"
            onClick={() => onAction({ type: "REVIEW_OMISSION", field: "validDays" })}
          >
            {OMISSION_SEMANTICS.validDays.label}
          </button>
        )}
      </div>

      {/* Valid Hours */}
      <div className="field-row">
        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label htmlFor={validStartId}>Valid From (HH:MM)</label>
            <span className="quiet-note">
              {f.validStart.isReviewed ? "Reviewed ✓" : "Needs review"}
            </span>
          </div>
          <input
            id={validStartId}
            type="time"
            value={f.validStart.value ?? ""}
            onChange={(e) => syncTime("validStart", e.currentTarget.value)}
            onInput={(e) => syncTime("validStart", e.currentTarget.value)}
            onBlur={(e) => syncTime("validStart", e.currentTarget.value)}
          />
          {f.validStart.suggestion !== undefined && (
            <SuggestionItem
              label="Suggested start"
              valueText={
                f.validStart.suggestion.value !== null
                  ? f.validStart.suggestion.value
                  : "None"
              }
              confidence={f.validStart.suggestion.confidence}
              onAccept={() => onAction({ type: "ACCEPT_SUGGESTION", field: "validStart" })}
              onDismiss={() => onAction({ type: "REJECT_SUGGESTION", field: "validStart" })}
            />
          )}
        </div>

        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label htmlFor={validEndId}>Valid Until (HH:MM)</label>
            <span className="quiet-note">
              {f.validEnd.isReviewed ? "Reviewed ✓" : "Needs review"}
            </span>
          </div>
          <input
            id={validEndId}
            type="time"
            value={f.validEnd.value ?? ""}
            onChange={(e) => syncTime("validEnd", e.currentTarget.value)}
            onInput={(e) => syncTime("validEnd", e.currentTarget.value)}
            onBlur={(e) => syncTime("validEnd", e.currentTarget.value)}
          />
          {f.validEnd.suggestion !== undefined && (
            <SuggestionItem
              label="Suggested end"
              valueText={
                f.validEnd.suggestion.value !== null
                  ? f.validEnd.suggestion.value
                  : "None"
              }
              confidence={f.validEnd.suggestion.confidence}
              onAccept={() => onAction({ type: "ACCEPT_SUGGESTION", field: "validEnd" })}
              onDismiss={() => onAction({ type: "REJECT_SUGGESTION", field: "validEnd" })}
            />
          )}
        </div>
      </div>
      {(f.validStart.value !== null || f.validEnd.value !== null) && (
        <button type="button" className="text-button" onClick={() => onAction({ type: "CLEAR_HOURS" })}>
          Reset times
        </button>
      )}
      {f.validStart.value === null &&
        f.validEnd.value === null &&
        (!f.validStart.isReviewed || !f.validEnd.isReviewed) && (
          <>
            <p className="quiet-note">{OMISSION_SEMANTICS.hours.explanation}</p>
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "REVIEW_OMISSION", field: "hours" })}
            >
              {OMISSION_SEMANTICS.hours.label}
            </button>
          </>
        )}

      {/* Conditions */}
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label htmlFor={conditionsId}>Conditions & Restrictions</label>
          <span className="quiet-note">
            {f.conditions.isReviewed
              ? f.conditions.value.length === 0
                ? "No special conditions (reviewed ✓)"
                : "Reviewed ✓"
              : "Needs review"}
          </span>
        </div>
        <textarea
          id={conditionsId}
          value={f.conditions.value.join("\n")}
          onChange={(e) =>
            onAction({
              type: "SET_FIELD",
              field: "conditions",
              value: e.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0),
            })
          }
          placeholder="One condition per line"
        />
        {f.conditions.suggestion !== undefined && (
          <SuggestionItem
            label="Suggested conditions"
            valueText={
              f.conditions.suggestion.value.length === 0
                ? "No special conditions"
                : f.conditions.suggestion.value.join("; ")
            }
            confidence={f.conditions.suggestion.confidence}
            onAccept={() => onAction({ type: "ACCEPT_SUGGESTION", field: "conditions" })}
            onDismiss={() => onAction({ type: "REJECT_SUGGESTION", field: "conditions" })}
          />
        )}
        {f.conditions.value.length === 0 && !f.conditions.isReviewed && (
          <button
            type="button"
            className="text-button"
            onClick={() => onAction({ type: "REVIEW_OMISSION", field: "conditions" })}
          >
            {OMISSION_SEMANTICS.conditions.label}
          </button>
        )}
      </div>

      {/* Location Section */}
      <div className="field">
        <label>Restaurant Location *</label>
        {renderLocation ? (
          renderLocation({
            draft,
            onConfirm: (point) =>
              onAction({
                type: "CONFIRM_LOCATION",
                lat: point.lat,
                lng: point.lng,
              }),
          })
        ) : (
          <div className="panel quiet-note">
            <p>Location integration pending map component.</p>
            {draft.location?.confirmed ? (
              <p>
                Confirmed coordinates: {draft.location.lat.toFixed(4)},{" "}
                {draft.location.lng.toFixed(4)}
              </p>
            ) : (
              <p>Coordinates are currently unconfirmed.</p>
            )}
          </div>
        )}
      </div>

      {/* Validation / Rejection Notices */}
      <div ref={noticeRef} tabIndex={-1} style={{ outline: "none" }}>
        {publishErrors.length > 0 && (
          <div role="alert" className="form-error">
            <p>Please resolve the following before publishing:</p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {publishErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
        {publishRejection && (
          <div role="alert" className="form-error">
            Publish failed: {publishRejection}
          </div>
        )}
      </div>

      {/* Publish Actions */}
      <div className="form-actions" style={{ marginTop: "1rem" }}>
        {publishUnavailableReason ? (
          <p className="quiet-note">{publishUnavailableReason}</p>
        ) : !onPublish ? (
          <button type="button" disabled className="button secondary">
            Publishing Unavailable
          </button>
        ) : (
          <button
            type="submit"
            className="button primary draft-submit"
            disabled={busy || isPublishing}
          >
            {isPublishing ? "Saving…" : submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}
