/**
 * Headless Reel-to-DealDraft Adapter (N-FORM-A).
 *
 * Bridges Harry's ReelExtraction / ReelDraft models (lib/reels/contract.ts)
 * into canonical DealDraft instances (lib/dealDraft.ts) for downstream
 * draft editing, review, and publishing workflows.
 *
 * Critical Guarantees & Constraints:
 * - NOT a DealResult: No fake four-zero confidence scores ({ restaurant: 0, ... }),
 *   no 0.5 defaults, and no probability conversion. Evidence is preserved in
 *   sidecar metadata, not converted into fabricated confidence.
 * - Quarantines toCanonical: The existing toCanonical function in contract.ts
 *   (which fabricated zero-confidence scores and threw on null fields) is
 *   quarantined and never called.
 * - Initial review state: ALL fields start with isReviewed = false.
 * - Null arrays vs known arrays: Unknown validDays/conditions (null in ReelDraft)
 *   must NEVER create accept-able [] suggestions for every-day / no-conditions.
 *   Suggestions for null arrays are stripped while preserving unreviewed fields.
 *   Known arrays (including explicit []) from source stay tentative until explicit
 *   user acceptance.
 * - Missing restaurant: If restaurant is null, it remains blank/unreviewed.
 *   Does not emit a "no-deal" false status when deals were detected.
 * - Non-CAD / Unknown currency: Non-CAD or unknown currencies never map into
 *   priceCad. The extracted price is preserved in originalAmount alongside source
 *   currency in an indexed CURRENCY_UNVERIFIED ReviewIssue, requiring manual entry.
 *   CAD prices remain tentative suggestions until user acceptance.
 * - Warnings: All non-empty warnings are preserved as blocking UNSUPPORTED_CONSTRAINT
 *   review notes requiring explicit resolution. Does not guess FUTURE_START.
 * - Typed constraints (N-SOURCE-C): extraction.constraints FUTURE_START maps to a hard-block
 *   review note; UNSUPPORTED_CONSTRAINT maps to explicit source review; evidence is kept in the
 *   sidecar and never turned into confidence. Output without a constraints array is legacy:
 *   every offer gets a blocking LEGACY_CONSTRAINT_REVIEW_DETAIL note (no bypass option) and
 *   the contract gaps stay reported.
 * - Nullable fields: Unknown nullable fields remain blank/review-pending.
 * - Deep cloning: All arrays and nested objects are cloned for complete isolation
 *   and source immutability.
 */

import { addAsCondition, isCanadianDollar, isOrdinaryRestriction, isYearlessEventDate } from "../benignRestrictions";
import {
  createDraft,
  createDraftsFromOffers,
  type DealDraft,
  type DealOffer,
  type ManualReviewNote,
  type Weekday,
} from "../dealDraft";
import {
  reelExtraction,
  type ReelDraft,
  type ReelExtraction,
  type SourceConstraint,
} from "./contract";

export class ReelDraftAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReelDraftAdapterError";
  }
}

export const REEL_EXTRACTION_CONTRACT_GAPS = [
  "ReelDraft schema lacks typed startDate / future-start field; future start dates cannot be detected in extraction output.",
  "ReelDraft schema lacks typed unsupportedConstraints field; constraints appear only as unstructured warnings strings.",
] as const;

export const LEGACY_CONSTRAINT_REVIEW_DETAIL =
  "Legacy extraction has no typed start-date or restriction check: review the source for future start dates and restrictions, or re-run extraction.";

export interface ReelDraftSidecar {
  evidence: ReelExtraction["evidence"];
  transcript: string;
  warnings: string[];
  missingFieldsByDraft: Record<number, string[]>;
  contractGaps: string[];
  constraints?: SourceConstraint[];
}

export interface ReelToDraftResult {
  drafts: DealDraft[];
  sidecar: ReelDraftSidecar;
}

export interface ReelDraftOptions {
  sourceUrl?: string | null;
  imageId?: string | null;
}

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }
  const cloned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    cloned[key] = deepClone(value);
  }
  return cloned as T;
}

/**
 * Identifies missing or unconfirmed fields for a given ReelDraft.
 */
function identifyMissingFields(draft: ReelDraft): string[] {
  const missing: string[] = [];

  if (draft.restaurant === null) missing.push("restaurant");
  if (draft.address === null) missing.push("address");
  if (draft.dealText === null) missing.push("dealText");

  if (draft.price === null) {
    missing.push("price");
  } else if (!isCanadianDollar(draft.currency)) {
    missing.push("priceCad"); // Price was extracted but currency is unconfirmed/non-CAD
  }

  if (draft.validDays === null) missing.push("validDays");
  if (draft.validStart === null && draft.validEnd === null) {
    missing.push("hours");
  } else {
    if (draft.validStart === null) missing.push("validStart");
    if (draft.validEnd === null) missing.push("validEnd");
  }

  if (draft.expiresOn === null) missing.push("expiresOn");
  if (draft.conditions === null) missing.push("conditions");

  return missing;
}

/** Move ordinary UNSUPPORTED_CONSTRAINT notes into the offer's conditions; everything else is left to block. */
function withOrdinaryRestrictionsAsConditions(extraction: ReelExtraction): ReelExtraction {
  if (extraction.constraints === undefined) return extraction;
  const drafts = extraction.drafts.map((d) => ({ ...d }));
  const kept = extraction.constraints.filter((c) => {
    const target = drafts[c.draftIndex];
    if (c.code !== "UNSUPPORTED_CONSTRAINT" || !target) return true;
    if (isYearlessEventDate(c.detail, c.quote)) return false; // the model's inferred date stays in the expiry field for review
    if (!isOrdinaryRestriction(c.detail, c.quote)) return true;
    const added = addAsCondition(target.conditions, { quote: c.quote, detail: c.detail });
    if (!added.absorbed) return true;
    target.conditions = added.conditions;
    return false;
  });
  return { ...extraction, drafts, constraints: kept };
}

/**
 * Converts a Harry ReelExtraction payload into canonical DealDraft instances
 * and an immutable source sidecar.
 *
 * @param input Raw or validated ReelExtraction payload.
 * @param options Optional sourceUrl and imageId provenance metadata.
 * @throws ReelDraftAdapterError if input fails ReelExtraction schema validation.
 */
export function reelExtractionToDealDrafts(
  input: unknown,
  options?: ReelDraftOptions
): ReelToDraftResult {
  const parsed = reelExtraction.safeParse(input);
  if (!parsed.success) {
    throw new ReelDraftAdapterError(
      `Invalid ReelExtraction payload: ${parsed.error.message}`
    );
  }
  const original = parsed.data;
  // Ordinary restrictions (per-person limits, supplies, ...) become visible conditions instead of blocking notes
  // (docs/decisions/0007). The sidecar keeps the model's original constraints and evidence untouched.
  const extraction = withOrdinaryRestrictionsAsConditions(original);

  const sidecar: ReelDraftSidecar = {
    evidence: deepClone(original.evidence),
    transcript: original.transcript,
    warnings: deepClone(original.warnings),
    missingFieldsByDraft: {},
    contractGaps: original.constraints !== undefined ? [] : [...REEL_EXTRACTION_CONTRACT_GAPS],
    ...(original.constraints !== undefined ? { constraints: deepClone(original.constraints) } : {}),
  };

  // Case 1: No deal detected or empty drafts
  if (!extraction.isDeal || extraction.drafts.length === 0) {
    const draft = createDraft({
      sourceUrl: options?.sourceUrl ?? null,
      imageId: options?.imageId ?? null,
    });
    return {
      drafts: [
        {
          ...draft,
          extraction: {
            ...draft.extraction,
            status: "no_deal_detected",
          },
        },
      ],
      sidecar,
    };
  }

  // Case 2: One or more deals detected
  const manualReviewNotes: ManualReviewNote[] = [];

  if (extraction.constraints !== undefined) {
    // Typed annotations: FUTURE_START stays a hard blocker in the canonical reducer/publish
    // validator; UNSUPPORTED_CONSTRAINT needs an explicit source-review note. Evidence rides in
    // the sidecar. An empty array is the model's "none found", which is still only an assertion.
    for (const c of extraction.constraints) {
      manualReviewNotes.push({ dealIndex: c.draftIndex, code: c.code, blocking: true, detail: c.detail });
    }
  } else {
    // No `constraints` array at all (legacy output). That is unknown, not "no restriction": block
    // every offer until a human reviews the source or a new extraction supplies typed constraints.
    for (let d = 0; d < extraction.drafts.length; d++) {
      manualReviewNotes.push({ dealIndex: d, code: "UNSUPPORTED_CONSTRAINT", blocking: true, detail: LEGACY_CONSTRAINT_REVIEW_DETAIL });
    }
  }

  // Add non-empty warnings as blocking UNSUPPORTED_CONSTRAINT review notes
  // (Never invent FUTURE_START from warning substrings)
  for (const warning of extraction.warnings) {
    const trimmed = warning.trim();
    if (trimmed.length > 0) {
      for (let d = 0; d < extraction.drafts.length; d++) {
        const alreadyExists = manualReviewNotes.some(
          (n) => n.dealIndex === d && n.detail === trimmed
        );
        if (!alreadyExists) {
          manualReviewNotes.push({
            dealIndex: d,
            code: "UNSUPPORTED_CONSTRAINT",
            blocking: true,
            detail: trimmed,
          });
        }
      }
    }
  }

  // Track whether each offer had known validDays / conditions vs unknown (null)
  const hasKnownValidDays: boolean[] = [];
  const hasKnownConditions: boolean[] = [];

  const offers: DealOffer[] = extraction.drafts.map((draft, index) => {
    sidecar.missingFieldsByDraft[index] = identifyMissingFields(draft);

    const isCad = isCanadianDollar(draft.currency);
    let priceCad: number | null = null;

    if (draft.price !== null) {
      if (isCad) {
        priceCad = draft.price;
      } else {
        // Non-CAD or unknown currency: do NOT map into priceCad.
        // Add non-blocking CURRENCY_UNVERIFIED review issue.
        const currencyLabel = draft.currency ?? "unspecified currency";
        manualReviewNotes.push({
          dealIndex: index,
          code: "CURRENCY_UNVERIFIED",
          blocking: false,
          detail: `Stated price ${draft.price} in ${currencyLabel} is not confirmed as CAD. Choose the currency and price manually.`,
          originalAmount: draft.price,
        });
      }
    }

    const validDaysKnown = draft.validDays !== null;
    const conditionsKnown = draft.conditions !== null;
    hasKnownValidDays.push(validDaysKnown);
    hasKnownConditions.push(conditionsKnown);

    const offer: DealOffer = {
      restaurant: draft.restaurant ?? "",
      address: draft.address,
      dealText: draft.dealText ?? "",
      priceCad,
      validDays: draft.validDays ? ([...draft.validDays] as Weekday[]) : [],
      validStart: draft.validStart,
      validEnd: draft.validEnd,
      expiresOn: draft.expiresOn,
      conditions: draft.conditions ? [...draft.conditions] : [],
      // NEVER fabricate four-zero or 0.5 confidence scores; leave confidence undefined
      confidence: undefined,
      ...(draft.price !== null && !isCad ? { originalAmount: draft.price } : {}),
    };

    return offer;
  });

  // Create isolated drafts using the canonical createDraftsFromOffers helper
  const drafts = createDraftsFromOffers(offers, {
    sourceUrl: options?.sourceUrl ?? null,
    imageId: options?.imageId ?? null,
    manualReview: manualReviewNotes,
  });

  // Post-process drafts to strictly uphold N-FORM-A invariants:
  // 1. Unknown validDays (null in source) must NOT have a [] suggestion
  // 2. Unknown conditions (null in source) must NOT have a [] suggestion
  // 3. Null restaurant must remain blank value: null with no suggestion
  // 4. Unknown nullable fields (address, hours, expiresOn) with null must have suggestion: undefined
  // 5. Ensure ALL isReviewed flags are false initially
  const sanitizedDrafts = drafts.map((draft, i) => {
    const rawDraft = extraction.drafts[i];
    const fields = { ...draft.fields };

    // Restaurant: if null in ReelDraft, clear value and suggestion
    if (rawDraft.restaurant === null) {
      fields.restaurant = {
        value: null,
        isManuallyEdited: false,
        suggestion: undefined,
        isReviewed: false,
      };
    } else {
      fields.restaurant = {
        ...fields.restaurant,
        isReviewed: false,
      };
    }

    // DealText: if null in ReelDraft, clear value and suggestion
    if (rawDraft.dealText === null) {
      fields.dealText = {
        value: null,
        isManuallyEdited: false,
        suggestion: undefined,
        isReviewed: false,
      };
    } else {
      fields.dealText = {
        ...fields.dealText,
        isReviewed: false,
      };
    }

    // ValidDays: If unknown (null in source), strip the [] suggestion completely.
    // The field value stays [], but suggestion is undefined and isReviewed is false.
    if (!hasKnownValidDays[i]) {
      fields.validDays = {
        value: [],
        isManuallyEdited: false,
        suggestion: undefined,
        isReviewed: false,
      };
    } else {
      fields.validDays = {
        ...fields.validDays,
        isReviewed: false,
      };
    }

    // Conditions: If unknown (null in source), strip the [] suggestion completely.
    if (!hasKnownConditions[i]) {
      fields.conditions = {
        value: [],
        isManuallyEdited: false,
        suggestion: undefined,
        isReviewed: false,
      };
    } else {
      fields.conditions = {
        ...fields.conditions,
        isReviewed: false,
      };
    }

    // Address: if null in source, ensure suggestion is undefined
    if (rawDraft.address === null) {
      fields.address = {
        value: null,
        isManuallyEdited: false,
        suggestion: undefined,
        isReviewed: false,
      };
    } else {
      fields.address = {
        ...fields.address,
        isReviewed: false,
      };
    }

    // PriceCad: if null or non-CAD, ensure suggestion is undefined
    if (rawDraft.price === null || !isCanadianDollar(rawDraft.currency)) {
      fields.priceCad = {
        value: null,
        isManuallyEdited: false,
        suggestion: undefined,
        isReviewed: false,
      };
    } else {
      fields.priceCad = {
        ...fields.priceCad,
        isReviewed: false,
      };
    }

    // Hours
    if (rawDraft.validStart === null) {
      fields.validStart = {
        value: null,
        isManuallyEdited: false,
        suggestion: undefined,
        isReviewed: false,
      };
    } else {
      fields.validStart = {
        ...fields.validStart,
        isReviewed: false,
      };
    }

    if (rawDraft.validEnd === null) {
      fields.validEnd = {
        value: null,
        isManuallyEdited: false,
        suggestion: undefined,
        isReviewed: false,
      };
    } else {
      fields.validEnd = {
        ...fields.validEnd,
        isReviewed: false,
      };
    }

    // ExpiresOn
    if (rawDraft.expiresOn === null) {
      fields.expiresOn = {
        value: null,
        isManuallyEdited: false,
        suggestion: undefined,
        isReviewed: false,
      };
    } else {
      fields.expiresOn = {
        ...fields.expiresOn,
        isReviewed: false,
      };
    }

    return {
      ...draft,
      fields,
    };
  });

  return {
    drafts: sanitizedDrafts,
    sidecar,
  };
}
