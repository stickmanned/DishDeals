/**
 * Bridge between stored private ReelDrafts and canonical DealDraft instances (N-FORM-B).
 *
 * Implements:
 * - Deterministic serialization of canonical DealDraft values to strict ReelDraft[]
 * - Initialization of DealDraft[] from stored item (draftJson or extractionJson or blank)
 * - Safe handling of unreviewed populated fields on reload (requiring re-confirmation)
 * - Carrying immutable model review issues (warnings, future start, currency) into saved drafts
 * - Explicit confirmation actions and late-extraction merging that never overwrite user edits
 *
 * Publish validation is NOT implemented here: use validateForPublish / buildPublishFields from
 * lib/dealDraft (the single canonical gate).
 */

import {
  createDraft,
  type DealDraft,
  type DealDraftAction,
  type DraftFieldKey,
  type ReviewIssue,
  type Weekday,
} from "../dealDraft";
import {
  reelDraft,
  reelExtraction,
  type ReelDraft,
  type ReelExtraction,
} from "./contract";
import {
  reelExtractionToDealDrafts,
} from "./toDealDraft";

export interface DraftItem {
  draftJson?: string;
  extractionJson?: string;
  caption?: string | null;
  generation?: number;
  draftRevision?: number;
  draftEdited?: boolean;
  status?: string;
}

/**
 * Serializes canonical DealDraft instances to strict ReelDraft[] for private saving.
 *
 * Requirements:
 * - Only priceCad is serialized to price + currency "CAD"
 * - Null/unknown arrays (validDays, conditions) remain null unless reviewed as every-day / no-conditions
 * - Blank/empty text is trimmed to null
 * - Validates output through strict reelDraft schema
 */
export function serializeDraftsToReelDrafts(drafts: DealDraft[]): ReelDraft[] {
  if (!Array.isArray(drafts) || drafts.length === 0) {
    throw new Error("Cannot serialize empty drafts array. At least one draft is required.");
  }
  if (drafts.length > 10) {
    throw new Error("Cannot save more than 10 offers in a single Reel draft.");
  }

  const rawList = drafts.map((draft) => {
    const f = draft.fields;

    const restaurant = f.restaurant.value?.trim() || null;
    const address = f.address.value?.trim() || null;
    const dealText = f.dealText.value?.trim() || null;

    let price: number | null = null;
    let currency: string | null = null;
    if (f.priceCad.value !== null && Number.isFinite(f.priceCad.value)) {
      price = f.priceCad.value;
      currency = "CAD";
    }

    // validDays: null unless reviewed as every-day (empty array) or selected days
    let validDays: Weekday[] | null = null;
    if (f.validDays.isReviewed || f.validDays.isManuallyEdited || f.validDays.value.length > 0) {
      validDays = [...f.validDays.value];
    }

    const validStart = f.validStart.value?.trim() || null;
    const validEnd = f.validEnd.value?.trim() || null;
    const expiresOn = f.expiresOn.value?.trim() || null;

    // conditions: null unless reviewed as no-conditions (empty array) or specified conditions
    let conditions: string[] | null = null;
    if (f.conditions.isReviewed || f.conditions.isManuallyEdited || f.conditions.value.length > 0) {
      conditions = [...f.conditions.value];
    }

    return {
      restaurant,
      address,
      dealText,
      price,
      currency,
      validDays,
      validStart,
      validEnd,
      expiresOn,
      conditions,
    };
  });

  return reelDraft.array().min(1).max(10).parse(rawList);
}

/**
 * Immutable model review issues (adapter-created warnings/future-start/currency notes) per
 * model offer, or null when no usable model extraction with a deal exists.
 */
function modelOffers(
  extractionJson: string | undefined,
  sourceUrl: string | null
): { drafts: DealDraft[]; extraction: ReelExtraction } | null {
  if (!extractionJson) return null;
  try {
    const raw: unknown = JSON.parse(extractionJson);
    // Additive, optional typed notes (e.g. FUTURE_START) beside the strict extraction contract.
    const notes = typedManualReview(raw);
    const base = raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "manualReview"))
      : raw;
    const extraction = reelExtraction.parse(base);
    if (!extraction.isDeal || extraction.drafts.length === 0) return null;
    const res = reelExtractionToDealDrafts(extraction, { sourceUrl });
    const drafts = res.drafts.map((d, index) => {
      const issues = [...d.reviewIssues];
      for (const n of notes) {
        if (n.dealIndex !== undefined && n.dealIndex !== index) continue;
        if (issues.some((i) => i.code === n.code && i.detail === n.detail)) continue;
        issues.push({
          id: `issue-${n.code}-${index}-typed-${issues.length}`,
          dealIndex: index,
          code: n.code,
          detail: n.detail,
          resolved: false,
          blocking: n.blocking,
        });
      }
      return { ...d, reviewIssues: issues };
    });
    return { drafts, extraction };
  } catch {
    return null;
  }
}

interface TypedNote {
  code: ReviewIssue["code"];
  detail: string;
  dealIndex?: number;
  blocking: boolean;
}

const NOTE_CODES: readonly string[] = ["FUTURE_START", "UNSUPPORTED_CONSTRAINT", "CURRENCY_UNVERIFIED"];

function typedManualReview(raw: unknown): TypedNote[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const list = (raw as { manualReview?: unknown }).manualReview;
  if (!Array.isArray(list)) return [];
  const notes: TypedNote[] = [];
  for (const entry of list) {
    if (entry === null || typeof entry !== "object") continue;
    const { code, detail, dealIndex, blocking } = entry as Record<string, unknown>;
    if (typeof code !== "string" || !NOTE_CODES.includes(code)) continue;
    if (typeof detail !== "string" || detail.trim() === "") continue;
    notes.push({
      code: code as ReviewIssue["code"],
      detail: detail.trim(),
      ...(typeof dealIndex === "number" && Number.isInteger(dealIndex) ? { dealIndex } : {}),
      // A typed future start is always blocking; other notes default to blocking unless stated.
      blocking: code === "FUTURE_START" ? true : blocking !== false,
    });
  }
  return notes;
}

function cloneIssue(issue: ReviewIssue, id: string, dealIndex: number): ReviewIssue {
  return { ...issue, id, dealIndex, resolved: false, resolutionNote: undefined };
}

/**
 * Initializes editable DealDraft instances from a stored Reel item.
 *
 * Rules:
 * 1. If stored draftJson exists, parse it strictly. Populated fields start with isReviewed = false
 *    on reload so unaccepted or unconfirmed values are never treated as reviewed; the user
 *    confirms them explicitly (see confirmationActions).
 * 2. Immutable model review issues are carried into saved/manual drafts. Saved offers have no
 *    stable model ids, so alignment is only trusted for an UNEDITED saved draft with the same
 *    offer count. For any user-edited draft (reorder/delete+append keeps the count) or a changed
 *    count, no correspondence is guessed: every blocking model constraint/warning/future-start
 *    note is attached to every offer, index-bound currency notes and suggestions are dropped,
 *    and one blocking note requires explicit manual source review.
 * 3. If stored draftJson is absent, but extractionJson is present, initialize tentative
 *    suggestions via reelExtractionToDealDrafts.
 * 4. If neither exists (or item failed/no_deal with no extraction), provide a clean
 *    editable blank draft so manual editing is always available, with no manufactured constraints.
 * 5. Location confirmation is not persisted in ReelDraft, so location is null on reload.
 */
export function initDraftsFromReelItem(
  item: DraftItem,
  sourceUrl?: string | null
): DealDraft[] {
  const source = sourceUrl ?? null;

  // Case 1: Stored draftJson is present
  if (item.draftJson !== undefined) {
    try {
      const parsedReels = reelDraft.array().min(1).max(10).parse(JSON.parse(item.draftJson));
      const model = modelOffers(item.extractionJson, source);
      const aligned =
        model !== null && !(item.draftEdited ?? false) && model.drafts.length === parsedReels.length;

      // Unique model notes that are not bound to an offer index (warnings, future start).
      const unboundModelIssues: ReviewIssue[] = [];
      if (model && !aligned) {
        for (const d of model.drafts) {
          for (const iss of d.reviewIssues) {
            if (iss.code === "CURRENCY_UNVERIFIED") continue;
            if (!unboundModelIssues.some((u) => u.code === iss.code && u.detail === iss.detail)) {
              unboundModelIssues.push(iss);
            }
          }
        }
      }

      return parsedReels.map((reel, index) => {
        const isEdited = item.draftEdited ?? false;
        const draft = createDraft({
          restaurant: reel.restaurant,
          address: reel.address,
          dealText: reel.dealText,
          priceCad: reel.currency === "CAD" ? reel.price : null,
          validDays: reel.validDays ? [...reel.validDays] : [],
          validStart: reel.validStart,
          validEnd: reel.validEnd,
          expiresOn: reel.expiresOn,
          conditions: reel.conditions ? [...reel.conditions] : [],
          sourceUrl: source,
        });

        // Saved values keep their "entered by the user" marker so model suggestions never
        // overwrite them, but every field starts UNREVIEWED: the old manual flag is not review.
        const f = draft.fields;
        if (isEdited) {
          if (reel.restaurant !== null) f.restaurant.isManuallyEdited = true;
          if (reel.address !== null) f.address.isManuallyEdited = true;
          if (reel.dealText !== null) f.dealText.isManuallyEdited = true;
          // Only a CAD price was ever entered; a non-CAD price stays unconfirmed currency.
          if (reel.price !== null && reel.currency === "CAD") f.priceCad.isManuallyEdited = true;
          if (reel.validDays !== null) f.validDays.isManuallyEdited = true;
          if (reel.validStart !== null) f.validStart.isManuallyEdited = true;
          if (reel.validEnd !== null) f.validEnd.isManuallyEdited = true;
          if (reel.expiresOn !== null) f.expiresOn.isManuallyEdited = true;
          if (reel.conditions !== null) f.conditions.isManuallyEdited = true;
        }

        const reviewIssues: ReviewIssue[] = [];
        if (model && aligned) {
          for (const iss of model.drafts[index].reviewIssues) {
            reviewIssues.push(cloneIssue(iss, iss.id, index));
          }
        } else if (model) {
          unboundModelIssues.forEach((iss, n) => {
            reviewIssues.push(cloneIssue(iss, `issue-${iss.code}-${index}-${n}`, index));
          });
          reviewIssues.push({
            id: `issue-UNSUPPORTED_CONSTRAINT-${index}-count-changed`,
            dealIndex: index,
            code: "UNSUPPORTED_CONSTRAINT",
            detail: item.draftEdited
              ? `This saved draft was edited, so its ${parsedReels.length} offer(s) cannot be matched automatically to the model's ${model.drafts.length}. All model notes apply to every offer; check the source evidence and confirm this offer manually.`
              : `The saved draft has ${parsedReels.length} offer(s) but the model found ${model.drafts.length}. Offers cannot be matched automatically; check the source evidence and confirm this offer manually.`,
            resolved: false,
            blocking: true,
          });
        }

        // A saved non-CAD price needs its own currency note unless the model already raised one.
        if (
          reel.price !== null &&
          reel.currency !== "CAD" &&
          !reviewIssues.some((iss) => iss.code === "CURRENCY_UNVERIFIED")
        ) {
          reviewIssues.push({
            id: `issue-currency-${index}`,
            dealIndex: index,
            code: "CURRENCY_UNVERIFIED",
            detail: `Stated price ${reel.price} in ${reel.currency ?? "unspecified currency"} is not confirmed as CAD. Confirm price manually.`,
            resolved: false,
            originalAmount: reel.price,
            blocking: false,
          });
        }

        // Separate model suggestions only when offers correspond by count.
        if (model && aligned) {
          const modelOffer = model.extraction.drafts[index];
          if (!f.restaurant.isManuallyEdited && modelOffer.restaurant) {
            f.restaurant.suggestion = { value: modelOffer.restaurant };
          }
          if (!f.address.isManuallyEdited && modelOffer.address) {
            f.address.suggestion = { value: modelOffer.address };
          }
          if (!f.dealText.isManuallyEdited && modelOffer.dealText) {
            f.dealText.suggestion = { value: modelOffer.dealText };
          }
          if (!f.priceCad.isManuallyEdited && modelOffer.price !== null && modelOffer.currency === "CAD") {
            f.priceCad.suggestion = { value: modelOffer.price };
          }
          if (!f.validDays.isManuallyEdited && modelOffer.validDays !== null) {
            f.validDays.suggestion = { value: [...modelOffer.validDays] };
          }
          if (!f.validStart.isManuallyEdited && modelOffer.validStart) {
            f.validStart.suggestion = { value: modelOffer.validStart };
          }
          if (!f.validEnd.isManuallyEdited && modelOffer.validEnd) {
            f.validEnd.suggestion = { value: modelOffer.validEnd };
          }
          if (!f.expiresOn.isManuallyEdited && modelOffer.expiresOn) {
            f.expiresOn.suggestion = { value: modelOffer.expiresOn };
          }
          if (!f.conditions.isManuallyEdited && modelOffer.conditions !== null) {
            f.conditions.suggestion = { value: [...modelOffer.conditions] };
          }
        }

        return { ...draft, reviewIssues };
      });
    } catch {
      // Corrupt draftJson: fall through to extraction or blank draft
    }
  }

  // Case 2: No stored draftJson, but model extractionJson is present
  const model = modelOffers(item.extractionJson, source);
  if (model) return model.drafts;
  if (item.extractionJson) {
    try {
      const res = reelExtractionToDealDrafts(JSON.parse(item.extractionJson), { sourceUrl: source });
      if (res.drafts.length > 0) {
        return res.drafts;
      }
    } catch {
      // Corrupt extractionJson: fall through to blank draft
    }
  }

  // Case 3: Neither exists or failed/no_deal: clean blank draft, no manufactured constraints
  return [createDraft({ sourceUrl: source })];
}

const REVIEWABLE_FIELDS: DraftFieldKey[] = [
  "restaurant",
  "address",
  "dealText",
  "priceCad",
  "validDays",
  "validStart",
  "validEnd",
  "expiresOn",
  "conditions",
];

/**
 * Reducer actions that explicitly confirm every populated (or previously user-entered) field
 * that is not yet reviewed. Dispatched only from a user control; unknown/omitted fields are
 * deliberately excluded so they still need their own "confirm omitted" choice.
 */
export function confirmationActions(draft: DealDraft): DealDraftAction[] {
  const actions: DealDraftAction[] = [];
  for (const key of REVIEWABLE_FIELDS) {
    const field = draft.fields[key];
    if (field.isReviewed) continue;
    const value = field.value as unknown;
    const populated = Array.isArray(value) ? value.length > 0 : value !== null && value !== "";
    const knownEmptyArray = Array.isArray(value) && field.isManuallyEdited;
    if (populated || knownEmptyArray) {
      actions.push({ type: "REVIEW_FIELD", field: key });
    }
  }
  return actions;
}

/** True when nothing has been entered, accepted, reviewed or located for this offer. */
export function isPristineDraft(draft: DealDraft): boolean {
  return (
    draft.location === null &&
    REVIEWABLE_FIELDS.every((key) => {
      const field = draft.fields[key];
      const value = field.value as unknown;
      const empty = Array.isArray(value) ? value.length === 0 : value === null || value === "";
      return empty && !field.isManuallyEdited && !field.isReviewed;
    })
  );
}

export interface LateExtractionPlan {
  /** "replace": every current offer is untouched; "append": add as extra offers. */
  mode: "replace" | "append";
  drafts: DealDraft[];
  truncated: boolean;
}

/**
 * Plans how a late or new model extraction would be applied AFTER the user chooses to.
 * Never alters existing offers' values or review state: it replaces only entirely pristine
 * offers, otherwise appends model offers as new tentative offers (capped at 10).
 * Returns null when the extraction has no usable deal.
 */
export function planLateExtraction(
  current: DealDraft[],
  extractionJson: string | undefined,
  sourceUrl?: string | null
): LateExtractionPlan | null {
  const model = modelOffers(extractionJson, sourceUrl ?? null);
  if (!model) return null;
  if (current.every(isPristineDraft)) {
    return { mode: "replace", drafts: model.drafts, truncated: false };
  }
  const room = Math.max(0, 10 - current.length);
  return {
    mode: "append",
    drafts: [...current, ...model.drafts.slice(0, room)],
    truncated: model.drafts.length > room,
  };
}
