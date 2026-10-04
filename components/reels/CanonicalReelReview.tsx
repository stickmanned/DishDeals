"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { DealReviewForm } from "../deals/DealReviewForm";
import { DealLocationPicker, type GeocodeCandidate } from "../maps/DealLocationPicker";
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
  MAX_OFFERS,
  activeAfterRemove,
  appendOffers,
  applyLatePlan,
  liveDraft,
  offerListFrom,
  publishPreconditionError,
  removeOffer,
  replaceOffers,
  updateOffer,
  type OfferList,
  type PublishReceipt,
} from "../../lib/reels/publish";
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
  /**
   * Community publish of one offer's canonical fields. It must resolve with a genuine receipt (a created
   * deal id) or throw; the review shows the receipt's links and never navigates before it exists.
   */
  onPublish?: (fields: PublishFields) => Promise<PublishReceipt | void>;
  publishUnavailableReason?: string;
  /** Explicit "Find" geocoder for the location picker. Absent means the picker reports search unavailable. */
  search?: (query: string) => Promise<GeocodeCandidate[]>;
  sourceUrl?: string | null;
}

export function CanonicalReelReview({
  item,
  onSave,
  onPublish,
  publishUnavailableReason = "Community deal publishing is not available in this view. You can save this draft privately.",
  search,
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

  // One keyed entry per offer. Keys never change for an existing offer, so each offer's review form (and its
  // uncommitted price text and notes) stays mounted across switching, adding and removing other offers.
  const [list, setList] = useState<OfferList>(() => offerListFrom(initDraftsFromReelItem(item, sourceUrl)));
  const listRef = useRef(list);
  listRef.current = list;
  const drafts = useMemo(() => list.entries.map((e) => e.draft), [list]);
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);
  // The extraction the current drafts already reflect; a different one is offered, never auto-applied.
  const [seenExtraction, setSeenExtraction] = useState<string | undefined>(item.extractionJson);
  // One community publish at a time, and a genuine receipt per published offer.
  const publishing = useRef(false);
  const [publishingNow, setPublishingNow] = useState(false);
  const [receipts, setReceipts] = useState<Record<string, PublishReceipt>>({});

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

  const activeEntry = list.entries[activeOfferIndex] ?? list.entries[0];
  const activeDraft = activeEntry.draft;
  const pendingConfirmations = confirmationActions(activeDraft);

  const lateExtraction = useMemo(
    () =>
      item.extractionJson !== undefined && item.extractionJson !== seenExtraction
        ? planLateExtraction(drafts, item.extractionJson, sourceUrl)
        : null,
    [item.extractionJson, seenExtraction, drafts, sourceUrl]
  );

  // Every callback targets an offer by key and reads the latest list, never a stale active index.
  function updateByKey(key: string, change: (draft: DealDraft) => DealDraft) {
    setSaveMessage("");
    setSaveError("");
    setList((prev) => updateOffer(prev, key, change));
  }

  function handleActionFor(key: string, action: DealDraftAction) {
    updateByKey(key, (d) => dealDraftReducer(d, action));
  }

  function handleConfirmSaved() {
    updateByKey(activeEntry.key, (d) =>
      confirmationActions(d).reduce((acc, action) => dealDraftReducer(acc, action), d)
    );
  }

  function handleApplyLateExtraction() {
    if (!lateExtraction) return;
    const before = listRef.current;
    const next = applyLatePlan(before, lateExtraction);
    setList(next);
    if (lateExtraction.mode === "replace") setActiveOfferIndex(0);
    setSeenExtraction(item.extractionJson);
    setSaveMessage(
      lateExtraction.mode === "replace"
        ? "Model suggestions loaded. Nothing is confirmed until you review it."
        : "Model offers added as new unreviewed offers. Your edits are unchanged."
    );
  }

  function handleLoadLatest() {
    try {
      // Deliberate replacement: every offer form is re-created from the saved draft (disclosed to the user).
      setList((prev) => replaceOffers(prev, initDraftsFromReelItem(item, sourceUrl)));
      setReceipts({});
      setSeenExtraction(item.extractionJson);
      setActiveOfferIndex(0);
      setExpected(latest);
      setSaveMessage("Loaded the latest saved draft. Unsaved typing on every offer was replaced.");
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
    if (listRef.current.entries.length >= MAX_OFFERS) return;
    setList((prev) => appendOffers(prev, [createDraft({ sourceUrl: sourceUrl ?? null })]));
    setActiveOfferIndex(listRef.current.entries.length);
  }

  function handleRemoveOffer(key: string) {
    const current = listRef.current;
    if (current.entries.length <= 1) return;
    const index = current.entries.findIndex((e) => e.key === key);
    if (index < 0) return;
    setList(removeOffer(current, key));
    setActiveOfferIndex(activeAfterRemove(activeOfferIndex, index, current.entries.length - 1));
    setReceipts((prev) => {
      const { [key]: _gone, ...rest } = prev;
      void _gone;
      return rest;
    });
  }

  // Publishes the offer with this key from its LIVE draft. The canonical gate (review state, FUTURE_START and
  // unsupported restrictions, open issues, confirmed location) runs on that draft; the argument is only the
  // form's snapshot. The backend re-authorizes and re-validates independently.
  async function handlePublishFor(key: string): Promise<void> {
    const draft = liveDraft(listRef.current, key);
    const blocked = publishPreconditionError({
      available: !!onPublish, unavailableReason: publishUnavailableReason, alreadyPublished: !!receipts[key],
      versionChanged: changed, inFlight: publishing.current, offerExists: !!draft,
    });
    if (blocked || !onPublish || !draft) throw new Error(blocked ?? publishUnavailableReason);
    const fields = buildPublishFields(draft); // throws DraftValidationError with the unresolved items
    publishing.current = true;
    setPublishingNow(true);
    try {
      const receipt = await onPublish(fields);
      if (receipt) setReceipts((prev) => ({ ...prev, [key]: receipt }));
    } finally {
      publishing.current = false;
      setPublishingNow(false);
    }
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
          {list.entries.map((entry, i) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={i === activeOfferIndex}
              className={i === activeOfferIndex ? "button primary" : "button secondary"}
              onClick={() => setActiveOfferIndex(i)}
            >
              Offer {i + 1}
            </button>
          ))}
          {drafts.length < MAX_OFFERS && (
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
            onClick={() => handleRemoveOffer(activeEntry.key)}
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

      {/* Every offer keeps its own mounted form; only the active one is visible and focusable. */}
      {list.entries.map((entry, i) => {
        const isActive = i === activeOfferIndex;
        const receipt = receipts[entry.key];
        return (
          <div key={entry.key} hidden={!isActive} inert={!isActive} aria-hidden={!isActive} data-offer-key={entry.key}>
            <DealReviewForm
              draft={entry.draft}
              onAction={(action) => handleActionFor(entry.key, action)}
              onPublish={onPublish ? () => handlePublishFor(entry.key) : undefined}
              publishUnavailableReason={publishUnavailableReason}
              busy={busy || publishingNow}
              renderLocation={({ draft, onConfirm }) => (
                <DealLocationPicker
                  restaurant={draft.fields.restaurant.value ?? ""}
                  address={draft.fields.address.value}
                  location={draft.location}
                  search={search}
                  onConfirm={onConfirm}
                  onInvalidate={() => handleActionFor(entry.key, { type: "INVALIDATE_LOCATION" })}
                />
              )}
            />
            {receipt && (
              <div role="status" className="panel form-stack">
                <p>
                  <b>Published to the community.</b> This is your private Reel save&rsquo;s own offer; the
                  private save is unchanged.
                </p>
                <p>
                  <Link href={receipt.dealPath}>Open the deal</Link> · <Link href={receipt.mapPath}>See it on the map</Link>
                </p>
              </div>
            )}
          </div>
        );
      })}

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
