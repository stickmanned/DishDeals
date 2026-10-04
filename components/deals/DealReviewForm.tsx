"use client";

import { useState, type ReactNode, type FormEvent } from "react";
import {
  buildPublishFields,
  validateForPublish,
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
  hasPendingSuggestions,
  OMISSION_SEMANTICS,
  parsePriceInput,
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
}

export function DealReviewForm({
  draft,
  onAction,
  onPublish,
  publishUnavailableReason,
  renderLocation,
  busy = false,
}: DealReviewFormProps) {
  const [publishErrors, setPublishErrors] = useState<string[]>([]);
  const [publishRejection, setPublishRejection] = useState<string>("");
  const [isPublishing, setIsPublishing] = useState<boolean>(false);

  // Local state for price input to retain invalid/partial text
  const [localPrice, setLocalPrice] = useState<string>(
    draft.fields.priceCad.value !== null ? draft.fields.priceCad.value.toString() : ""
  );
  const [priceInputError, setPriceInputError] = useState<string>("");

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPublishErrors([]);
    setPublishRejection("");

    if (!onPublish) {
      return;
    }

    const { valid, errors } = validateForPublish(draft);
    if (!valid) {
      setPublishErrors(errors);
      return;
    }

    setIsPublishing(true);
    try {
      const publishFields = buildPublishFields(draft);
      await onPublish(publishFields);
    } catch (err) {
      setPublishRejection(err instanceof Error ? err.message : "Publish request failed.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <form className="form-stack panel" onSubmit={handleSubmit} noValidate>
      <div className="review-header">
        <div>
          <h2>Review Deal Draft</h2>
          <p className="quiet-note">
            Review suggestions and confirm details before publishing. Every field must be
            explicitly checked.
          </p>
        </div>
      </div>

      {/* Provenance */}
      {(draft.sourceUrl || draft.imageId) && (
        <div className="quiet-note" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {draft.sourceUrl && (
            <span>
              Source:{" "}
              <a href={draft.sourceUrl} target="_blank" rel="noreferrer">
                {draft.sourceUrl}
              </a>
            </span>
          )}
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
          <div className="form-actions" style={{ flexWrap: "wrap" }}>
            {draft.extraction.unselectedOffers.map((offer, idx) => (
              <button
                key={idx}
                type="button"
                className={`button ${draft.extraction.selectedOfferIndex === idx ? "primary" : "secondary"}`}
                onClick={() => onAction({ type: "SELECT_OFFER", offerIndex: idx })}
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
                  borderLeft: issue.blocking ? "4px solid #e53e3e" : "4px solid #dd6b20",
                  padding: "0.75rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{issue.code}</strong>
                  <span className="quiet-note">{issue.blocking ? "Blocking" : "Warning"}</span>
                </div>
                <p>{issue.detail}</p>
                {issue.originalAmount !== undefined && (
                  <p className="quiet-note">Extracted amount: {issue.originalAmount}</p>
                )}

                {issue.resolved ? (
                  <p className="quiet-note" style={{ color: "#38a169" }}>
                    ✓ Resolved: {issue.resolutionNote}
                  </p>
                ) : (
                  <div>
                    {!evaluation.canResolve ? (
                      <p className="quiet-note" style={{ color: "#e53e3e" }}>
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
            onClick={() => onAction({ type: "ACCEPT_ALL_SUGGESTIONS" })}
          >
            Accept All Suggestions
          </button>
        </div>
      )}

      {/* Restaurant Field */}
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label htmlFor="restaurant-input">Restaurant Name *</label>
          <span className="quiet-note">
            {f.restaurant.isReviewed ? "Reviewed ✓" : "Needs review"}
          </span>
        </div>
        <input
          id="restaurant-input"
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
          <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
            <span>Suggestion: &ldquo;{f.restaurant.suggestion.value}&rdquo; </span>
            {formatConfidence(f.restaurant.suggestion.confidence) && (
              <span>({formatConfidence(f.restaurant.suggestion.confidence)}) </span>
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "ACCEPT_SUGGESTION", field: "restaurant" })}
            >
              Accept
            </button>{" "}
            |{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "REJECT_SUGGESTION", field: "restaurant" })}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Deal Text Field */}
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label htmlFor="dealText-input">Offer Description *</label>
          <span className="quiet-note">
            {f.dealText.isReviewed ? "Reviewed ✓" : "Needs review"}
          </span>
        </div>
        <textarea
          id="dealText-input"
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
          <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
            <span>Suggestion: &ldquo;{f.dealText.suggestion.value}&rdquo; </span>
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "ACCEPT_SUGGESTION", field: "dealText" })}
            >
              Accept
            </button>{" "}
            |{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "REJECT_SUGGESTION", field: "dealText" })}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Price and Expiry */}
      <div className="field-row">
        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label htmlFor="price-input">Price (CAD)</label>
            <span className="quiet-note">
              {f.priceCad.isReviewed ? "Reviewed ✓" : "Needs review"}
            </span>
          </div>
          <input
            id="price-input"
            inputMode="decimal"
            value={localPrice}
            onChange={(e) => handlePriceChange(e.target.value)}
            placeholder="e.g. 12.50 (blank if varies)"
          />
          {priceInputError && <p className="form-error" role="alert">{priceInputError}</p>}
          {f.priceCad.suggestion !== undefined && (
            <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
              <span>Suggested: ${f.priceCad.suggestion.value} </span>
              {formatConfidence(f.priceCad.suggestion.confidence) && (
                <span>({formatConfidence(f.priceCad.suggestion.confidence)}) </span>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  onAction({ type: "ACCEPT_SUGGESTION", field: "priceCad" });
                  if (f.priceCad.suggestion?.value !== undefined && f.priceCad.suggestion.value !== null) {
                    setLocalPrice(f.priceCad.suggestion.value.toString());
                  }
                }}
              >
                Accept
              </button>{" "}
              |{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => onAction({ type: "REJECT_SUGGESTION", field: "priceCad" })}
              >
                Dismiss
              </button>
            </div>
          )}
          {f.priceCad.value === null && !f.priceCad.isReviewed && (
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "REVIEW_OMISSION", field: "priceCad" })}
            >
              {OMISSION_SEMANTICS.priceCad.label}
            </button>
          )}
        </div>

        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label htmlFor="expiresOn-input">Expiry Date</label>
            <span className="quiet-note">
              {f.expiresOn.isReviewed ? "Reviewed ✓" : "Needs review"}
            </span>
          </div>
          <input
            id="expiresOn-input"
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
            <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
              <span>Suggested: {f.expiresOn.suggestion.value} </span>
              {formatConfidence(f.expiresOn.suggestion.confidence) && (
                <span>({formatConfidence(f.expiresOn.suggestion.confidence)}) </span>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => onAction({ type: "ACCEPT_SUGGESTION", field: "expiresOn" })}
              >
                Accept
              </button>{" "}
              |{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => onAction({ type: "REJECT_SUGGESTION", field: "expiresOn" })}
              >
                Dismiss
              </button>
            </div>
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
          <label htmlFor="address-input">Address</label>
          <span className="quiet-note">
            {f.address.isReviewed ? "Reviewed ✓" : "Needs review"}
          </span>
        </div>
        <input
          id="address-input"
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
          <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
            <span>Suggestion: &ldquo;{f.address.suggestion.value}&rdquo; </span>
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "ACCEPT_SUGGESTION", field: "address" })}
            >
              Accept
            </button>{" "}
            |{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "REJECT_SUGGESTION", field: "address" })}
            >
              Dismiss
            </button>
          </div>
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
            {f.validDays.isReviewed ? "Reviewed ✓" : "Needs review"}
          </span>
        </div>
        <div className="weekdays" style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
          {CANONICAL_WEEKDAYS.map((day: Weekday) => {
            const active = f.validDays.value.includes(day);
            return (
              <button
                key={day}
                type="button"
                className={`button ${active ? "primary" : "secondary"}`}
                aria-pressed={active}
                onClick={() => {
                  const updated = active
                    ? f.validDays.value.filter((d) => d !== day)
                    : [...f.validDays.value, day];
                  onAction({
                    type: "SET_FIELD",
                    field: "validDays",
                    value: updated,
                  });
                }}
              >
                {day.toUpperCase()}
              </button>
            );
          })}
        </div>
        {f.validDays.suggestion !== undefined && (
          <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
            <span>
              Suggested days:{" "}
              {f.validDays.suggestion.value.length === 0
                ? "Every day"
                : f.validDays.suggestion.value.map(formatWeekday).join(", ")}
            </span>{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "ACCEPT_SUGGESTION", field: "validDays" })}
            >
              Accept
            </button>{" "}
            |{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "REJECT_SUGGESTION", field: "validDays" })}
            >
              Dismiss
            </button>
          </div>
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
            <label htmlFor="validStart-input">Valid From (HH:MM)</label>
            <span className="quiet-note">
              {f.validStart.isReviewed ? "Reviewed ✓" : "Needs review"}
            </span>
          </div>
          <input
            id="validStart-input"
            type="time"
            value={f.validStart.value ?? ""}
            onChange={(e) =>
              onAction({
                type: "SET_FIELD",
                field: "validStart",
                value: e.target.value || null,
              })
            }
          />
          {f.validStart.suggestion !== undefined && (
            <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
              <span>Suggested start: {f.validStart.suggestion.value} </span>
              {formatConfidence(f.validStart.suggestion.confidence) && (
                <span>({formatConfidence(f.validStart.suggestion.confidence)}) </span>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => onAction({ type: "ACCEPT_SUGGESTION", field: "validStart" })}
              >
                Accept
              </button>{" "}
              |{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => onAction({ type: "REJECT_SUGGESTION", field: "validStart" })}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        <div className="field">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <label htmlFor="validEnd-input">Valid Until (HH:MM)</label>
            <span className="quiet-note">
              {f.validEnd.isReviewed ? "Reviewed ✓" : "Needs review"}
            </span>
          </div>
          <input
            id="validEnd-input"
            type="time"
            value={f.validEnd.value ?? ""}
            onChange={(e) =>
              onAction({
                type: "SET_FIELD",
                field: "validEnd",
                value: e.target.value || null,
              })
            }
          />
          {f.validEnd.suggestion !== undefined && (
            <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
              <span>Suggested end: {f.validEnd.suggestion.value} </span>
              {formatConfidence(f.validEnd.suggestion.confidence) && (
                <span>({formatConfidence(f.validEnd.suggestion.confidence)}) </span>
              )}
              <button
                type="button"
                className="text-button"
                onClick={() => onAction({ type: "ACCEPT_SUGGESTION", field: "validEnd" })}
              >
                Accept
              </button>{" "}
              |{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => onAction({ type: "REJECT_SUGGESTION", field: "validEnd" })}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
      {f.validStart.value === null && f.validEnd.value === null && (!f.validStart.isReviewed || !f.validEnd.isReviewed) && (
        <button
          type="button"
          className="text-button"
          onClick={() => onAction({ type: "REVIEW_OMISSION", field: "hours" })}
        >
          {OMISSION_SEMANTICS.hours.label}
        </button>
      )}

      {/* Conditions */}
      <div className="field">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <label htmlFor="conditions-input">Conditions & Restrictions</label>
          <span className="quiet-note">
            {f.conditions.isReviewed ? "Reviewed ✓" : "Needs review"}
          </span>
        </div>
        <textarea
          id="conditions-input"
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
          <div className="panel quiet-note" style={{ marginTop: "0.25rem" }}>
            <span>
              Suggested conditions:{" "}
              {f.conditions.suggestion.value.length === 0
                ? "No special conditions"
                : f.conditions.suggestion.value.join("; ")}
            </span>{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "ACCEPT_SUGGESTION", field: "conditions" })}
            >
              Accept
            </button>{" "}
            |{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => onAction({ type: "REJECT_SUGGESTION", field: "conditions" })}
            >
              Dismiss
            </button>
          </div>
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
              <p>Confirmed coordinates: {draft.location.lat.toFixed(4)}, {draft.location.lng.toFixed(4)}</p>
            ) : (
              <p>Coordinates are currently unconfirmed.</p>
            )}
          </div>
        )}
      </div>

      {/* Validation / Rejection Notices */}
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
            {isPublishing ? "Publishing…" : "Publish Deal"}
          </button>
        )}
      </div>
    </form>
  );
}
