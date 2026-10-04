"use client";

import { useMemo, useState, type FormEvent } from "react";
import { DealReviewForm } from "../deals/DealReviewForm";
import { DealLocationPicker } from "../maps/DealLocationPicker";
import {
  buildPublishFields,
  dealDraftReducer,
  type DealDraft,
  type DealDraftAction,
  type PublishFields,
  createDraft,
} from "../../lib/dealDraft";
import {
  afterOwnSave,
  versionStatus,
} from "../../lib/reels/draftRevision";
import {
  reelExtraction,
  type ReelExtraction,
} from "../../lib/reels/contract";
import {
  confirmationActions,
  initDraftsFromReelItem,
  planLateExtraction,
  serializeDraftsToReelDrafts,
  type DraftItem,
} from "../../lib/reels/reviewDraft";

export interface CanonicalReelReviewProps {
  item: DraftItem;
  onSave: (
    draftJson: string,
    expected: { generation: number; revision: number }
  ) => Promise<unknown>;
  onPublish?: (fields: PublishFields) => Promise<void>;
  publishUnavailableReason?: string;
  sourceUrl?: string | null;
}

export function CanonicalReelReview({
  item,
  onSave,
  onPublish,
  publishUnavailableReason = "Community deal publishing will be available once deal creation is integrated (T-09C). You can save this draft privately now.",
  sourceUrl,
}: CanonicalReelReviewProps) {
  // Provenance extraction
  const extracted = useMemo<ReelExtraction | null>(() => {
    try {
      return item.extractionJson ? reelExtraction.parse(JSON.parse(item.extractionJson)) : null;
    } catch {
      return null;
    }
  }, [item.extractionJson]);

  // Drafts state initialized per item
  const [drafts, setDrafts] = useState<DealDraft[]>(() =>
    initDraftsFromReelItem(item, sourceUrl)
  );
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);
  // Bumped whenever drafts are replaced wholesale so the form's local price text re-initializes.
  const [formEpoch, setFormEpoch] = useState(0);
  // The extraction the current drafts already reflect; a different one is offered, never auto-applied.
  const [seenExtraction, setSeenExtraction] = useState<string | undefined>(item.extractionJson);

  // Optimistic version tracking
  const [expected, setExpected] = useState(() => ({
    generation: item.generation ?? 0,
    revision: item.draftRevision ?? 0,
  }));

  const [saveMessage, setSaveMessage] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  const changed =
    !busy &&
    versionStatus(expected, {
      generation: item.generation ?? 0,
      draftRevision: item.draftRevision,
    }) === "changed";

  const latest = {
    generation: item.generation ?? 0,
    revision: item.draftRevision ?? 0,
  };

  const activeDraft = drafts[activeOfferIndex] ?? drafts[0];
  const pendingConfirmations = confirmationActions(activeDraft);

  const lateExtraction = useMemo(
    () =>
      item.extractionJson !== undefined && item.extractionJson !== seenExtraction
        ? planLateExtraction(drafts, item.extractionJson, sourceUrl)
        : null,
    [item.extractionJson, seenExtraction, drafts, sourceUrl]
  );

  function handleAction(action: DealDraftAction) {
    setSaveMessage("");
    setSaveError("");
    setDrafts((prev) =>
      prev.map((d, idx) => (idx === activeOfferIndex ? dealDraftReducer(d, action) : d))
    );
  }

  function handleConfirmSaved() {
    setSaveMessage("");
    setSaveError("");
    setDrafts((prev) =>
      prev.map((d, idx) =>
        idx === activeOfferIndex
          ? confirmationActions(d).reduce((acc, action) => dealDraftReducer(acc, action), d)
          : d
      )
    );
  }

  function handleApplyLateExtraction() {
    if (!lateExtraction) return;
    setDrafts(lateExtraction.drafts);
    if (lateExtraction.mode === "replace") setActiveOfferIndex(0);
    setSeenExtraction(item.extractionJson);
    setFormEpoch((n) => n + 1);
    setSaveMessage(
      lateExtraction.mode === "replace"
        ? "Model suggestions loaded. Nothing is confirmed until you review it."
        : "Model offers added as new unreviewed offers. Your edits are unchanged."
    );
  }

  function handleLoadLatest() {
    try {
      setDrafts(initDraftsFromReelItem(item, sourceUrl));
      setSeenExtraction(item.extractionJson);
      setFormEpoch((n) => n + 1);
      setActiveOfferIndex(0);
      setExpected(latest);
      setSaveMessage("Loaded the latest saved draft.");
      setSaveError("");
    } catch {
      setSaveError("The latest draft could not be loaded.");
    }
  }

  function handleKeepMine() {
    setExpected(latest);
    setSaveMessage("Your edits are kept. Saving will replace the latest saved version.");
    setSaveError("");
  }

  async function handleSavePrivate(e?: FormEvent) {
    if (e) e.preventDefault();
    if (changed || busy) return;
    setBusy(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const serialized = serializeDraftsToReelDrafts(drafts);
      await onSave(JSON.stringify(serialized), expected);
      const next = afterOwnSave(expected);
      if (next) {
        setExpected(next);
        setSaveMessage("Draft saved privately.");
      } else {
        setSaveMessage("Draft saved. Reload the latest draft before editing again.");
      }
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Could not save. Check the fields; if the draft changed elsewhere, use the choices above."
      );
    } finally {
      setBusy(false);
    }
  }

  function handleAddOffer() {
    if (drafts.length >= 10) return;
    setDrafts((prev) => [...prev, createDraft({ sourceUrl: sourceUrl ?? null })]);
    setActiveOfferIndex(drafts.length);
  }

  function handleRemoveOffer(index: number) {
    if (drafts.length <= 1) return;
    setDrafts((prev) => prev.filter((_, i) => i !== index));
    setFormEpoch((n) => n + 1);
    if (activeOfferIndex >= index && activeOfferIndex > 0) {
      setActiveOfferIndex(activeOfferIndex - 1);
    }
  }

  async function handleInternalPublish(fields: PublishFields): Promise<void> {
    if (!onPublish) {
      throw new Error(publishUnavailableReason);
    }
    if (changed) {
      throw new Error("This draft changed elsewhere. Choose Load latest or Keep my edits first.");
    }
    // Re-run the canonical gate (review state, FUTURE_START, issues, location) on the live draft;
    // throws DraftValidationError when anything is unconfirmed. The built fields supersede the argument.
    void fields;
    await onPublish(buildPublishFields(activeDraft));
  }

  return (
    <div className="panel form-stack">
      <h2>Review the draft</h2>
      {!!item.status && ["queued", "retrieving", "extracting", "failed", "no_deal"].includes(item.status) && (
        <p role="status" className="muted">
          {item.status === "failed"
            ? "Processing needs attention. You can edit and save your draft by hand."
            : item.status === "no_deal"
            ? "No automatic deal was detected from the recording. You can enter deal details manually."
            : "Processing is not finished. Your manual edits and saved draft are kept."}
        </p>
      )}

      {changed && (
        <div role="alert" className="form-stack">
          <p>
            <b>This draft was changed by another save or retry.</b> Your edits on this screen are
            unchanged and cannot be saved until you choose.
          </p>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={handleLoadLatest}>
              Load the latest saved draft
            </button>
            <button type="button" className="text-button" onClick={handleKeepMine}>
              Keep my edits and replace the latest
            </button>
          </div>
        </div>
      )}

      {/* Multi-offer switcher */}
      {drafts.length > 1 && (
        <div className="form-actions" role="tablist" aria-label="Offer tabs">
          {drafts.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === activeOfferIndex}
              className={i === activeOfferIndex ? "button primary" : "button secondary"}
              onClick={() => setActiveOfferIndex(i)}
            >
              Offer {i + 1}
            </button>
          ))}
          {drafts.length < 10 && (
            <button type="button" className="text-button" onClick={handleAddOffer}>
              + Add offer
            </button>
          )}
        </div>
      )}

      {drafts.length > 1 && (
        <div className="form-actions">
          <button
            type="button"
            className="text-button"
            onClick={() => handleRemoveOffer(activeOfferIndex)}
          >
            Remove offer {activeOfferIndex + 1}
          </button>
        </div>
      )}

      <p className="muted">
        Blank fields are unknown. Currency stays unknown unless confirmed as CAD. Times use
        America/Vancouver. Unconfirmed model suggestions and map pins require explicit confirmation.
      </p>

      {/* Reusable canonical review form */}
      {lateExtraction && (
        <div role="note" className="form-stack">
          <p>
            <b>A new model extraction is available.</b>{" "}
            {lateExtraction.mode === "replace"
              ? "You have not entered anything yet, so its suggestions can fill this form."
              : "Your edits stay as they are; its offers can be added as separate new offers."}
            {lateExtraction.truncated ? " Only the offers that fit within 10 are added." : ""}
          </p>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={handleApplyLateExtraction}>
              {lateExtraction.mode === "replace" ? "Use model suggestions" : "Add model offers"}
            </button>
            <button type="button" className="text-button" onClick={() => setSeenExtraction(item.extractionJson)}>
              Ignore
            </button>
          </div>
        </div>
      )}

      {pendingConfirmations.length > 0 && (
        <div role="note" className="form-stack">
          <p>
            Saved values on this offer are not confirmed after reload. Confirm them to include them in a
            published deal; blank or omitted fields still need their own confirmation.
          </p>
          <button type="button" className="button secondary" onClick={handleConfirmSaved}>
            Confirm saved values ({pendingConfirmations.length})
          </button>
        </div>
      )}

      <DealReviewForm
        key={`${activeOfferIndex}:${formEpoch}`}
        draft={activeDraft}
        onAction={handleAction}
        onPublish={onPublish ? handleInternalPublish : undefined}
        publishUnavailableReason={publishUnavailableReason}
        busy={busy}
        renderLocation={({ draft, onConfirm }) => (
          <DealLocationPicker
            restaurant={draft.fields.restaurant.value ?? ""}
            address={draft.fields.address.value}
            location={draft.location}
            onConfirm={onConfirm}
            onInvalidate={() => handleAction({ type: "INVALIDATE_LOCATION" })}
          />
        )}
      />

      {/* Save draft privately controls */}
      <div className="form-actions" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="button secondary"
          disabled={busy || changed}
          onClick={() => void handleSavePrivate()}
        >
          {busy ? "Saving…" : "Save draft privately"}
        </button>
        {drafts.length === 1 && (
          <button type="button" className="text-button" onClick={handleAddOffer}>
            + Add another offer
          </button>
        )}
      </div>

      {saveMessage && <p role="status">{saveMessage}</p>}
      {saveError && (
        <p role="alert" className="field-error">
          {saveError}
        </p>
      )}

      {/* Separate model suggestions if manual edits were saved */}
      {item.draftEdited && extracted && (
        <details>
          <summary>Model suggestion (not applied)</summary>
          <p className="muted">
            This is the model’s separate suggestion. It never replaces your values.
          </p>
          {extracted.drafts.map((d, i) => (
            <p key={i}>
              <b>Offer {i + 1}</b>: {d.restaurant ?? "restaurant unknown"} ·{" "}
              {d.dealText ?? "deal unknown"}
              {d.price !== null ? ` · ${d.price} ${d.currency ?? "currency unknown"}` : ""}
            </p>
          ))}
        </details>
      )}

      {/* Source evidence & transcript */}
      <details>
        <summary>Source evidence</summary>
        {extracted &&
          extracted.evidence.map((e, i) => (
            <p key={i}>
              <b>
                Offer {e.draftIndex + 1}, {e.field} · {e.channel}
                {e.timestampSeconds !== null ? ` at ${e.timestampSeconds}s` : ""}
              </b>
              <br />
              {e.quote}
            </p>
          ))}
        {extracted?.warnings.map((w, i) => (
          <p key={i}>{w}</p>
        ))}
        <h3>Caption</h3>
        <p>{item.caption || "No caption"}</p>
        <h3>Relevant audio transcript</h3>
        <p>{extracted ? extracted.transcript || "No intelligible offer speech" : "No extraction yet"}</p>
      </details>

      <p className="muted">
        Edits leave the original extraction and evidence intact. This private draft is saved
        separately from the community feed.
      </p>
    </div>
  );
}
