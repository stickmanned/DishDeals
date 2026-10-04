/**
 * Internal extraction-to-draft adapter (T-07D).
 *
 * Provides a pure, runtime-independent bridge between the headless server-side
 * extraction outcome (ExtractOutcome) and client deal drafts (DealDraft).
 *
 * Constraints & Guarantees:
 * - Type-only import of ExtractOutcome: server extraction logic and API keys
 *   never enter client/native runtimes.
 * - Envelope enforcement: No bare result-only path is exposed; ExtractOutcome
 *   must be fully formed with exact envelope keys, non-empty model, consistent
 *   isDeal/deals relationship, and valid manualReview with matching
 *   requiresBlockingReview.
 * - Strict schema derivation: Derives strict Zod schemas from canonical Deal
 *   and DealResult (including root, deal, and confidence objects) to strictly
 *   reject unsupported fields (e.g. startDate, raw cadEvidence, unexpected
 *   confidence keys) rather than silently dropping them.
 * - Weekday validation: DealResult validDays is validated and narrowed using
 *   the canonical isCanonicalWeekday helper.
 * - Confidence preservation: Only the four canonical confidence keys
 *   (restaurant, priceCad, hours, expiresOn) are propagated; absent keys never
 *   invent synthetic 0.5 scores.
 * - Sidecar propagation: All sidecar review notes (FUTURE_START,
 *   UNSUPPORTED_CONSTRAINT, CURRENCY_UNVERIFIED) along with originalAmount and
 *   dealIndex are carried into respective draft review issues.
 * - Strict note contract: Enforces blocking: true for FUTURE_START and
 *   UNSUPPORTED_CONSTRAINT, blocking: false for CURRENCY_UNVERIFIED, and
 *   finite non-negative number for originalAmount.
 * - Reuses dealDraftReducer and createDraftsFromOffers without duplicating
 *   business logic or schemas.
 */

import { z } from "zod";
import type { ExtractOutcome, ManualReviewNote as CoreManualReviewNote } from "./extractCore";
import {
  createDraft,
  createDraftsFromOffers,
  dealDraftReducer,
  isCanonicalWeekday,
  type ConfidenceScores,
  type DealDraft,
  type DealOffer,
  type Weekday,
} from "./dealDraft";
import { Deal, DealResult } from "./dealSchema";

export class ExtractionDraftAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionDraftAdapterError";
  }
}

const EXACT_ENVELOPE_KEYS = [
  "result",
  "manualReview",
  "requiresBlockingReview",
  "model",
] as const;

const ALLOWED_MANUAL_REVIEW_CODES = [
  "FUTURE_START",
  "UNSUPPORTED_CONSTRAINT",
  "CURRENCY_UNVERIFIED",
] as const;

const ALLOWED_NOTE_KEYS = [
  "dealIndex",
  "code",
  "blocking",
  "detail",
  "originalAmount",
] as const;

/**
 * Strict validators derived directly from canonical Deal and DealResult.
 * Unlike the permissive canonical schemas which strip unknown properties,
 * these strict schemas fail validation if unexpected fields (e.g., startDate,
 * unmodeled confidence dimensions, or image claims) are supplied.
 */
export const StrictConfidence = Deal.shape.confidence.strict();
export const StrictDeal = Deal.extend({
  confidence: StrictConfidence,
}).strict();
export const StrictDealResult = DealResult.extend({
  deals: z.array(StrictDeal),
}).strict();

/**
 * Validates that an object conforms strictly to the ExtractOutcome envelope.
 * Throws ExtractionDraftAdapterError if:
 * - The object is null, undefined, or not a plain object
 * - The envelope has missing, extra, or unexpected keys
 * - model is missing, not a string, or empty/whitespace-only
 * - StrictDealResult schema validation fails (including any unexpected deal/confidence keys)
 * - isDeal does not match (deals.length > 0)
 * - manualReview is not an array or contains invalid notes
 * - Note code is invalid, or has unexpected keys
 * - Note blocking flag violates contract (true for FUTURE_START/UNSUPPORTED_CONSTRAINT, false for CURRENCY_UNVERIFIED)
 * - note.originalAmount is not a finite non-negative number
 * - requiresBlockingReview is not boolean or contradicts sidecar notes
 * - Any note dealIndex is out of bounds (negative or >= deals.length)
 * - Any weekday in validDays is not a canonical weekday
 */
export function validateExtractOutcome(outcome: unknown): asserts outcome is ExtractOutcome {
  if (typeof outcome !== "object" || outcome === null) {
    throw new ExtractionDraftAdapterError("ExtractOutcome must be a non-null object.");
  }

  const raw = outcome as Record<string, unknown>;
  const envelopeKeys = Object.keys(raw);

  // Exact envelope keys check
  for (const k of envelopeKeys) {
    if (!EXACT_ENVELOPE_KEYS.includes(k as (typeof EXACT_ENVELOPE_KEYS)[number])) {
      throw new ExtractionDraftAdapterError(
        `ExtractOutcome envelope has unexpected key: "${k}".`
      );
    }
  }
  for (const k of EXACT_ENVELOPE_KEYS) {
    if (!(k in raw)) {
      throw new ExtractionDraftAdapterError(
        `ExtractOutcome envelope is missing required key: "${k}".`
      );
    }
  }

  // Model validation
  if (typeof raw.model !== "string" || raw.model.trim().length === 0) {
    throw new ExtractionDraftAdapterError(
      "ExtractOutcome.model must be a non-empty string."
    );
  }

  if (!raw.result || typeof raw.result !== "object") {
    throw new ExtractionDraftAdapterError("ExtractOutcome must contain a valid result object.");
  }

  // Strict DealResult validation rejecting any unexpected root, deal, or confidence keys
  const parsedResult = StrictDealResult.safeParse(raw.result);
  if (!parsedResult.success) {
    throw new ExtractionDraftAdapterError(
      `Invalid DealResult in ExtractOutcome: ${parsedResult.error.message}`
    );
  }
  const result = parsedResult.data;

  // Consistency between isDeal and deals.length
  if (result.isDeal !== (result.deals.length > 0)) {
    throw new ExtractionDraftAdapterError(
      `ExtractOutcome.result has inconsistent isDeal (${result.isDeal}) and deals length (${result.deals.length}).`
    );
  }

  if (!Array.isArray(raw.manualReview)) {
    throw new ExtractionDraftAdapterError("ExtractOutcome.manualReview must be an array.");
  }

  if (typeof raw.requiresBlockingReview !== "boolean") {
    throw new ExtractionDraftAdapterError(
      "ExtractOutcome.requiresBlockingReview must be a boolean."
    );
  }

  const notes = raw.manualReview as CoreManualReviewNote[];
  const hasBlockingNote = notes.some((n) => Boolean(n && n.blocking));

  if (raw.requiresBlockingReview !== hasBlockingNote) {
    throw new ExtractionDraftAdapterError(
      `ExtractOutcome.requiresBlockingReview (${raw.requiresBlockingReview}) does not match sidecar manualReview notes (${hasBlockingNote}).`
    );
  }

  // Validate each manual review note
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (typeof note !== "object" || note === null) {
      throw new ExtractionDraftAdapterError(`ManualReviewNote at index ${i} must be an object.`);
    }

    const noteKeys = Object.keys(note);
    for (const k of noteKeys) {
      if (!ALLOWED_NOTE_KEYS.includes(k as (typeof ALLOWED_NOTE_KEYS)[number])) {
        throw new ExtractionDraftAdapterError(
          `ManualReviewNote at index ${i} has unexpected key: "${k}".`
        );
      }
    }

    if (!ALLOWED_MANUAL_REVIEW_CODES.includes(note.code as (typeof ALLOWED_MANUAL_REVIEW_CODES)[number])) {
      throw new ExtractionDraftAdapterError(
        `ManualReviewNote at index ${i} has invalid code: "${note.code}".`
      );
    }

    if (typeof note.blocking !== "boolean") {
      throw new ExtractionDraftAdapterError(
        `ManualReviewNote at index ${i} must have boolean blocking field.`
      );
    }

    // Enforce strict blocking rules per code
    if (note.code === "CURRENCY_UNVERIFIED") {
      if (note.blocking !== false) {
        throw new ExtractionDraftAdapterError(
          `ManualReviewNote at index ${i} ("CURRENCY_UNVERIFIED") must have blocking: false, got: ${note.blocking}.`
        );
      }
    } else {
      // FUTURE_START or UNSUPPORTED_CONSTRAINT
      if (note.blocking !== true) {
        throw new ExtractionDraftAdapterError(
          `ManualReviewNote at index ${i} ("${note.code}") must have blocking: true, got: ${note.blocking}.`
        );
      }
    }

    if (typeof note.detail !== "string" || note.detail.trim().length === 0) {
      throw new ExtractionDraftAdapterError(
        `ManualReviewNote at index ${i} must have a non-empty detail.`
      );
    }

    if (
      typeof note.dealIndex !== "number" ||
      !Number.isInteger(note.dealIndex) ||
      note.dealIndex < 0 ||
      note.dealIndex >= result.deals.length
    ) {
      throw new ExtractionDraftAdapterError(
        `ManualReviewNote at index ${i} has out-of-range dealIndex: ${note.dealIndex} (total deals: ${result.deals.length}).`
      );
    }

    // Validate originalAmount per CoreManualReviewNote contract: finite non-negative number only
    if (note.originalAmount !== undefined) {
      if (
        typeof note.originalAmount !== "number" ||
        !Number.isFinite(note.originalAmount) ||
        Number.isNaN(note.originalAmount) ||
        note.originalAmount < 0
      ) {
        throw new ExtractionDraftAdapterError(
          `ManualReviewNote at index ${i} has invalid originalAmount: ${note.originalAmount}. Must be a finite non-negative number.`
        );
      }
    }
  }

  // Validate canonical weekdays for each deal
  for (let d = 0; d < result.deals.length; d++) {
    const deal = result.deals[d];

    for (const day of deal.validDays) {
      if (!isCanonicalWeekday(day)) {
        throw new ExtractionDraftAdapterError(
          `Deal at index ${d} has non-canonical weekday: "${day}".`
        );
      }
    }
  }
}

/**
 * Maps DealResult deals to DealOffer objects for draft ingestion.
 * Narrows validDays to Weekday[], extracts originalAmount from manualReview,
 * and preserves confidence without inventing scores.
 */
function mapDealsToOffers(
  deals: DealResult["deals"],
  manualReview: CoreManualReviewNote[]
): DealOffer[] {
  return deals.map((deal, index) => {
    const validDays: Weekday[] = deal.validDays.filter(isCanonicalWeekday);

    let confidence: ConfidenceScores | undefined = undefined;
    if (deal.confidence && typeof deal.confidence === "object") {
      confidence = {};
      if (
        typeof deal.confidence.restaurant === "number" &&
        Number.isFinite(deal.confidence.restaurant)
      ) {
        confidence.restaurant = deal.confidence.restaurant;
      }
      if (
        typeof deal.confidence.priceCad === "number" &&
        Number.isFinite(deal.confidence.priceCad)
      ) {
        confidence.priceCad = deal.confidence.priceCad;
      }
      if (
        typeof deal.confidence.hours === "number" &&
        Number.isFinite(deal.confidence.hours)
      ) {
        confidence.hours = deal.confidence.hours;
      }
      if (
        typeof deal.confidence.expiresOn === "number" &&
        Number.isFinite(deal.confidence.expiresOn)
      ) {
        confidence.expiresOn = deal.confidence.expiresOn;
      }
    }

    // Associate originalAmount if a CURRENCY_UNVERIFIED note exists for this deal
    const noteWithAmount = manualReview.find(
      (n) => n.dealIndex === index && n.originalAmount !== undefined
    );
    const originalAmount = noteWithAmount?.originalAmount;

    const offer: DealOffer = {
      restaurant: deal.restaurant,
      address: deal.address,
      dealText: deal.dealText,
      priceCad: deal.priceCad,
      validDays,
      validStart: deal.validStart,
      validEnd: deal.validEnd,
      expiresOn: deal.expiresOn,
      conditions: [...deal.conditions],
      ...(confidence ? { confidence } : {}),
      ...(originalAmount !== undefined ? { originalAmount } : {}),
    };

    return offer;
  });
}

/**
 * Converts an ExtractOutcome envelope into independently editable DealDraft instances.
 *
 * Rules:
 * - Requires a validated ExtractOutcome (no bare-result path).
 * - If isDeal is false or deals is empty, returns a single draft with extraction.status = "no_deal_detected".
 * - If deals are present, creates an independent DealDraft per offer with isolated review issues.
 * - All extracted values are suggestions waiting for explicit acceptance.
 */
export function extractOutcomeToDrafts(
  outcome: ExtractOutcome,
  options?: {
    sourceUrl?: string | null;
    imageId?: string | null;
  }
): DealDraft[] {
  validateExtractOutcome(outcome);

  if (!outcome.result.isDeal || outcome.result.deals.length === 0) {
    const draft = createDraft({
      sourceUrl: options?.sourceUrl ?? null,
      imageId: options?.imageId ?? null,
    });
    return [
      {
        ...draft,
        extraction: {
          ...draft.extraction,
          status: "no_deal_detected",
        },
      },
    ];
  }

  const offers = mapDealsToOffers(outcome.result.deals, outcome.manualReview);

  return createDraftsFromOffers(offers, {
    sourceUrl: options?.sourceUrl ?? null,
    imageId: options?.imageId ?? null,
    manualReview: outcome.manualReview,
  });
}

/**
 * Applies an ExtractOutcome envelope to an existing in-flight DealDraft.
 *
 * Rules:
 * - Enforces ExtractOutcome envelope validation.
 * - Dispatches FINISH_EXTRACTION_SUCCESS through dealDraftReducer with the provided
 *   requestId and sourceRevision token.
 * - Stale/mismatched tokens or non-pending drafts are safely ignored by the reducer.
 * - Multiple offers are retained as unselected offers; single offers populate suggestions.
 * - Manual review notes are merged with existing review issues.
 */
export function applyOutcomeToDraft(
  draft: DealDraft,
  outcome: ExtractOutcome,
  token: {
    requestId: string;
    sourceRevision: number;
  }
): DealDraft {
  validateExtractOutcome(outcome);

  const offers = mapDealsToOffers(outcome.result.deals, outcome.manualReview);

  return dealDraftReducer(draft, {
    type: "FINISH_EXTRACTION_SUCCESS",
    requestId: token.requestId,
    sourceRevision: token.sourceRevision,
    result: {
      isDeal: outcome.result.isDeal,
      deals: offers,
      manualReview: outcome.manualReview,
    },
  });
}

/**
 * Applies an extraction error to an existing in-flight DealDraft.
 *
 * Rules:
 * - Dispatches FINISH_EXTRACTION_ERROR through dealDraftReducer with the provided
 *   requestId and sourceRevision token.
 * - Preserves existing manual edits and draft fields.
 * - Stale/mismatched tokens or non-pending drafts are safely ignored by the reducer.
 */
export function applyOutcomeErrorToDraft(
  draft: DealDraft,
  error: string,
  token: {
    requestId: string;
    sourceRevision: number;
  }
): DealDraft {
  return dealDraftReducer(draft, {
    type: "FINISH_EXTRACTION_ERROR",
    requestId: token.requestId,
    sourceRevision: token.sourceRevision,
    error,
  });
}
