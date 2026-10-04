/**
 * Deal draft state machine and publish validation.
 *
 * Runtime-independent, pure immutable reducer and validation helpers for deal drafts.
 * Supports Instagram extraction suggestions, manual editing overrides,
 * explicit review of omitted optional data, Pinyuan-provided coordinate confirmation,
 * sidecar manualReview tracking, and canonical Convex publish field serialization
 * with null-to-undefined conversion.
 */

export const CANONICAL_WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export type Weekday = (typeof CANONICAL_WEEKDAYS)[number];

export function isCanonicalWeekday(day: unknown): day is Weekday {
  return typeof day === "string" && (CANONICAL_WEEKDAYS as readonly string[]).includes(day);
}

/**
 * Model confidence self-assessments.
 * Canonical keys from Deal schema: restaurant, priceCad, hours, expiresOn.
 * These are model self-assessments rather than true probabilities; no default 0.5.
 */
export interface ConfidenceScores {
  restaurant?: number;
  priceCad?: number;
  hours?: number;
  expiresOn?: number;
}

export interface FieldSuggestion<T> {
  value: T;
  confidence?: number;
}

export interface FieldState<T> {
  value: T;
  isManuallyEdited: boolean;
  suggestion?: FieldSuggestion<T>;
  isReviewed: boolean;
}

export interface ConfirmedLocation {
  lat: number;
  lng: number;
  confirmed: boolean;
}

export type ManualReviewCode =
  | "FUTURE_START"
  | "UNSUPPORTED_CONSTRAINT"
  | "CURRENCY_UNVERIFIED";

export interface ManualReviewNote {
  dealIndex?: number;
  code: ManualReviewCode;
  detail: string;
  originalAmount?: string | number;
  blocking?: boolean;
}

export interface ReviewIssue {
  id: string;
  dealIndex?: number;
  code: ManualReviewCode;
  detail: string;
  resolved: boolean;
  resolutionNote?: string;
  originalAmount?: string | number;
  blocking: boolean;
}

export interface DealOffer {
  restaurant: string;
  address: string | null;
  dealText: string;
  priceCad: number | null;
  validDays: Weekday[];
  validStart: string | null;
  validEnd: string | null;
  expiresOn: string | null;
  conditions: string[];
  confidence?: ConfidenceScores;
  originalAmount?: string | number;
}

export interface ExtractionState {
  status: "idle" | "pending" | "success" | "no_deal_detected" | "error" | "canceled";
  currentRequestId: string | null;
  sourceRevision: number;
  error?: string;
  unselectedOffers?: DealOffer[];
  selectedOfferIndex?: number;
  pendingManualReview?: ManualReviewNote[];
}

export interface DealDraftFields {
  restaurant: FieldState<string | null>;
  address: FieldState<string | null>;
  dealText: FieldState<string | null>;
  priceCad: FieldState<number | null>;
  validDays: FieldState<Weekday[]>;
  validStart: FieldState<string | null>;
  validEnd: FieldState<string | null>;
  expiresOn: FieldState<string | null>;
  conditions: FieldState<string[]>;
}

export interface DealDraft {
  fields: DealDraftFields;
  location: ConfirmedLocation | null;
  imageId: string | null;
  sourceUrl: string | null;
  extraction: ExtractionState;
  reviewIssues: ReviewIssue[];
}

export type DraftFieldKey = keyof DealDraftFields;
export type OmissibleFieldKey =
  | "address"
  | "priceCad"
  | "hours"
  | "expiresOn"
  | "validDays"
  | "conditions";

export interface PublishFields {
  restaurant: string;
  address?: string;
  dealText: string;
  priceCad?: number;
  validDays: Weekday[];
  validStart?: string;
  validEnd?: string;
  expiresOn?: string;
  conditions: string[];
  lat: number;
  lng: number;
  imageId?: string;
  sourceUrl?: string;
}

export class DraftValidationError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(`Draft validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "DraftValidationError";
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Helpers: Validation
// ---------------------------------------------------------------------------

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates strict "HH:MM" (00:00 to 23:59).
 */
export function isValidTimeString(time: string): boolean {
  return TIME_REGEX.test(time);
}

/**
 * Validates strict "YYYY-MM-DD" and ensures it represents a genuine calendar date.
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [yStr, mStr, dStr] = dateStr.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validates safe source URL: http(s) only without credentials;
 * rejects javascript:, data:, file:, etc.
 */
export function isValidSourceUrl(urlStr: string): boolean {
  if (typeof urlStr !== "string" || urlStr.trim().length === 0) return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    return true;
  } catch {
    return false;
  }
}

export function validateCoordinates(lat: number, lng: number): void {
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError(`lat must be a finite number between -90 and 90, got: ${lat}`);
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError(`lng must be a finite number between -180 and 180, got: ${lng}`);
  }
}

// ---------------------------------------------------------------------------
// Draft Creation
// ---------------------------------------------------------------------------

function createField<T>(initialValue: T): FieldState<T> {
  return {
    value: initialValue,
    isManuallyEdited: false,
    suggestion: undefined,
    isReviewed: false,
  };
}

export interface InitialDraftValues {
  restaurant?: string | null;
  address?: string | null;
  dealText?: string | null;
  priceCad?: number | null;
  validDays?: Weekday[];
  validStart?: string | null;
  validEnd?: string | null;
  expiresOn?: string | null;
  conditions?: string[];
  imageId?: string | null;
  sourceUrl?: string | null;
}

export function createDraft(initial?: InitialDraftValues): DealDraft {
  return {
    fields: {
      restaurant: createField(initial?.restaurant ?? null),
      address: createField(initial?.address ?? null),
      dealText: createField(initial?.dealText ?? null),
      priceCad: createField(initial?.priceCad ?? null),
      validDays: createField(initial?.validDays ? [...initial.validDays] : []),
      validStart: createField(initial?.validStart ?? null),
      validEnd: createField(initial?.validEnd ?? null),
      expiresOn: createField(initial?.expiresOn ?? null),
      conditions: createField(initial?.conditions ? [...initial.conditions] : []),
    },
    location: null,
    imageId: initial?.imageId ?? null,
    sourceUrl: initial?.sourceUrl ?? null,
    extraction: {
      status: "idle",
      currentRequestId: null,
      sourceRevision: 0,
    },
    reviewIssues: [],
  };
}

// ---------------------------------------------------------------------------
// Actions & Reducer
// ---------------------------------------------------------------------------

export type SetFieldAction = {
  [K in DraftFieldKey]: {
    type: "SET_FIELD";
    field: K;
    value: DealDraftFields[K]["value"];
  };
}[DraftFieldKey];

export type DealDraftAction =
  | {
      type: "START_EXTRACTION";
      requestId: string;
      sourceUrl?: string;
      imageId?: string;
    }
  | {
      type: "CANCEL_EXTRACTION";
      requestId?: string;
    }
  | {
      type: "FINISH_EXTRACTION_SUCCESS";
      requestId: string;
      sourceRevision: number;
      result: {
        isDeal: boolean;
        deals: DealOffer[];
        manualReview?: ManualReviewNote[];
      };
    }
  | {
      type: "FINISH_EXTRACTION_ERROR";
      requestId: string;
      sourceRevision: number;
      error: string;
    }
  | {
      type: "SELECT_OFFER";
      offerIndex: number;
    }
  | SetFieldAction
  | {
      type: "ACCEPT_SUGGESTION";
      field: DraftFieldKey;
    }
  | {
      type: "REJECT_SUGGESTION";
      field: DraftFieldKey;
    }
  | {
      type: "ACCEPT_ALL_SUGGESTIONS";
    }
  | {
      type: "REVIEW_OMISSION";
      field: OmissibleFieldKey;
    }
  | {
      type: "REVIEW_FIELD";
      field: DraftFieldKey;
    }
  | {
      type: "RESOLVE_REVIEW_ISSUE";
      issueId: string;
      resolutionNote: string;
    }
  | {
      type: "INVALIDATE_SOURCE_CONTEXT";
      reason?: string;
    }
  | {
      type: "CONFIRM_LOCATION";
      lat: number;
      lng: number;
    }
  | {
      type: "SET_IMAGE_ID";
      imageId: string | null;
    }
  | {
      type: "SET_SOURCE_URL";
      sourceUrl: string | null;
    };

/**
 * Applies suggestions from a single DealOffer to untouched fields in the draft.
 * Deep-clones arrays. Never overwrites manually edited fields.
 */
function applyOfferSuggestions(draft: DealDraft, offer: DealOffer): DealDraft {
  const fields = { ...draft.fields };

  function applySuggestion<K extends DraftFieldKey>(
    key: K,
    val: DealDraftFields[K]["value"],
    confidence?: number
  ) {
    const cur = fields[key];
    if (cur.isManuallyEdited) return;

    fields[key] = {
      ...cur,
      suggestion: {
        value: val,
        ...(confidence !== undefined ? { confidence } : {}),
      },
    } as DealDraftFields[K];
  }

  const conf = offer.confidence;

  applySuggestion("restaurant", offer.restaurant, conf?.restaurant);
  applySuggestion("address", offer.address, undefined);
  applySuggestion("dealText", offer.dealText, undefined);
  applySuggestion("priceCad", offer.priceCad, conf?.priceCad);
  applySuggestion("validDays", offer.validDays ? [...offer.validDays] : [], undefined);
  applySuggestion("validStart", offer.validStart, conf?.hours);
  applySuggestion("validEnd", offer.validEnd, conf?.hours);
  applySuggestion("expiresOn", offer.expiresOn, conf?.expiresOn);
  applySuggestion("conditions", offer.conditions ? [...offer.conditions] : [], undefined);

  return {
    ...draft,
    fields,
  };
}

function clearFieldSuggestion<T>(field: FieldState<T>): FieldState<T> {
  return field.suggestion ? { ...field, suggestion: undefined } : field;
}

function clearPendingSuggestions(draft: DealDraft): DealDraftFields {
  return {
    restaurant: clearFieldSuggestion(draft.fields.restaurant),
    address: clearFieldSuggestion(draft.fields.address),
    dealText: clearFieldSuggestion(draft.fields.dealText),
    priceCad: clearFieldSuggestion(draft.fields.priceCad),
    validDays: clearFieldSuggestion(draft.fields.validDays),
    validStart: clearFieldSuggestion(draft.fields.validStart),
    validEnd: clearFieldSuggestion(draft.fields.validEnd),
    expiresOn: clearFieldSuggestion(draft.fields.expiresOn),
    conditions: clearFieldSuggestion(draft.fields.conditions),
  };
}

function mergeReviewIssues(
  existing: ReviewIssue[],
  notes: ManualReviewNote[] | undefined,
  offerIndex: number
): ReviewIssue[] {
  if (!notes || notes.length === 0) return existing;
  const filtered = notes.filter((n) => n.dealIndex === undefined || n.dealIndex === offerIndex);
  const updated = [...existing];
  for (const n of filtered) {
    const found = updated.find((iss) => iss.code === n.code && iss.detail === n.detail);
    if (!found) {
      updated.push({
        id: `issue-${n.code}-${n.dealIndex ?? offerIndex}-${updated.length}`,
        dealIndex: n.dealIndex ?? offerIndex,
        code: n.code,
        detail: n.detail,
        resolved: false,
        originalAmount: n.originalAmount,
        blocking: n.blocking ?? true,
      });
    }
  }
  return updated;
}

/**
 * Creates independent editable DealDraft instances for each offer in an extraction result.
 * Clones arrays, binds offer-specific manualReview notes, and ensures edits to one draft
 * do not mutate any other.
 */
export function createDraftsFromOffers(
  offers: DealOffer[],
  options?: {
    sourceUrl?: string | null;
    imageId?: string | null;
    manualReview?: ManualReviewNote[];
  }
): DealDraft[] {
  return offers.map((offer, index) => {
    let draft = createDraft({
      sourceUrl: options?.sourceUrl ?? null,
      imageId: options?.imageId ?? null,
    });
    draft = applyOfferSuggestions(draft, {
      ...offer,
      validDays: [...offer.validDays],
      conditions: [...offer.conditions],
    });

    if (options?.manualReview) {
      const issues: ReviewIssue[] = options.manualReview
        .filter((n) => n.dealIndex === undefined || n.dealIndex === index)
        .map((n, i) => ({
          id: `issue-${n.code}-${index}-${i}`,
          dealIndex: index,
          code: n.code,
          detail: n.detail,
          resolved: false,
          originalAmount: n.originalAmount,
          blocking: n.blocking ?? true,
        }));
      draft = { ...draft, reviewIssues: issues };
    }
    return draft;
  });
}

export function dealDraftReducer(state: DealDraft, action: DealDraftAction): DealDraft {
  switch (action.type) {
    case "START_EXTRACTION": {
      const nextRevision = state.extraction.sourceRevision + 1;
      // Invalidate pending suggestions and offer choices from previous runs, preserving manual edits
      const clearedFields = clearPendingSuggestions(state);
      return {
        ...state,
        fields: clearedFields,
        imageId: action.imageId !== undefined ? action.imageId : state.imageId,
        sourceUrl: action.sourceUrl !== undefined ? action.sourceUrl : state.sourceUrl,
        extraction: {
          status: "pending",
          currentRequestId: action.requestId,
          sourceRevision: nextRevision,
          error: undefined,
          unselectedOffers: undefined,
          selectedOfferIndex: undefined,
          pendingManualReview: undefined,
        },
      };
    }

    case "CANCEL_EXTRACTION": {
      if (action.requestId && action.requestId !== state.extraction.currentRequestId) {
        return state;
      }
      return {
        ...state,
        extraction: {
          ...state.extraction,
          status: "canceled",
          currentRequestId: null,
        },
      };
    }

    case "FINISH_EXTRACTION_SUCCESS": {
      // Must be pending and match both currentRequestId and sourceRevision unconditionally
      if (
        state.extraction.status !== "pending" ||
        action.requestId !== state.extraction.currentRequestId ||
        action.sourceRevision !== state.extraction.sourceRevision
      ) {
        return state;
      }

      if (!action.result.isDeal || !action.result.deals || action.result.deals.length === 0) {
        return {
          ...state,
          extraction: {
            ...state.extraction,
            status: "no_deal_detected",
            currentRequestId: null,
            unselectedOffers: undefined,
            selectedOfferIndex: undefined,
            pendingManualReview: undefined,
          },
        };
      }

      // If multiple deals are detected, store them for explicit user selection; never silently take the first.
      if (action.result.deals.length > 1) {
        return {
          ...state,
          extraction: {
            ...state.extraction,
            status: "success",
            currentRequestId: null,
            unselectedOffers: action.result.deals.map((d) => ({
              ...d,
              validDays: [...d.validDays],
              conditions: [...d.conditions],
            })),
            selectedOfferIndex: undefined,
            pendingManualReview: action.result.manualReview
              ? [...action.result.manualReview]
              : undefined,
          },
        };
      }

      // Exactly one deal detected: propose suggestions to untouched fields
      const deal = action.result.deals[0];
      const next = applyOfferSuggestions(state, {
        ...deal,
        validDays: [...deal.validDays],
        conditions: [...deal.conditions],
      });

      // Merge manualReview issues for deal 0, never dropping existing unresolved issues
      const mergedIssues = mergeReviewIssues(state.reviewIssues, action.result.manualReview, 0);

      return {
        ...next,
        reviewIssues: mergedIssues,
        extraction: {
          ...state.extraction,
          status: "success",
          currentRequestId: null,
          unselectedOffers: undefined,
          selectedOfferIndex: 0,
          pendingManualReview: undefined,
        },
      };
    }

    case "SELECT_OFFER": {
      const offers = state.extraction.unselectedOffers;
      if (!offers || action.offerIndex < 0 || action.offerIndex >= offers.length) {
        return state;
      }
      const selectedOffer = offers[action.offerIndex];
      let next = applyOfferSuggestions(state, {
        ...selectedOffer,
        validDays: [...selectedOffer.validDays],
        conditions: [...selectedOffer.conditions],
      });

      // Bind manualReview issues for the selected offer index, merging with existing
      const mergedIssues = mergeReviewIssues(
        state.reviewIssues,
        state.extraction.pendingManualReview,
        action.offerIndex
      );
      next = { ...next, reviewIssues: mergedIssues };

      return {
        ...next,
        extraction: {
          ...next.extraction,
          selectedOfferIndex: action.offerIndex,
        },
      };
    }

    case "FINISH_EXTRACTION_ERROR": {
      if (
        state.extraction.status !== "pending" ||
        action.requestId !== state.extraction.currentRequestId ||
        action.sourceRevision !== state.extraction.sourceRevision
      ) {
        return state;
      }

      return {
        ...state,
        extraction: {
          ...state.extraction,
          status: "error",
          currentRequestId: null,
          error: action.error,
        },
      };
    }

    case "SET_FIELD": {
      const fieldKey = action.field;
      const prevField = state.fields[fieldKey];

      // Address or restaurant change invalidates confirmed location
      let nextLocation = state.location;
      if (fieldKey === "restaurant" || fieldKey === "address") {
        if (prevField.value !== action.value) {
          nextLocation = null;
        }
      }

      // Clone array values to prevent external mutation leaks
      const nextValue = Array.isArray(action.value) ? [...action.value] : action.value;

      return {
        ...state,
        location: nextLocation,
        fields: {
          ...state.fields,
          [fieldKey]: {
            value: nextValue,
            isManuallyEdited: true,
            isReviewed: true,
            suggestion: undefined,
          },
        },
      };
    }

    case "ACCEPT_SUGGESTION": {
      const fieldKey = action.field;
      const field = state.fields[fieldKey];
      if (!field.suggestion) return state;

      let nextLocation = state.location;
      if (fieldKey === "restaurant" || fieldKey === "address") {
        if (field.value !== field.suggestion.value) {
          nextLocation = null;
        }
      }

      const nextValue = Array.isArray(field.suggestion.value)
        ? [...field.suggestion.value]
        : field.suggestion.value;

      return {
        ...state,
        location: nextLocation,
        fields: {
          ...state.fields,
          [fieldKey]: {
            value: nextValue,
            isManuallyEdited: false,
            isReviewed: true,
            suggestion: undefined,
          },
        },
      };
    }

    case "REJECT_SUGGESTION": {
      const fieldKey = action.field;
      const field = state.fields[fieldKey];
      if (!field.suggestion) return state;

      return {
        ...state,
        fields: {
          ...state.fields,
          [fieldKey]: {
            ...field,
            suggestion: undefined,
          },
        },
      };
    }

    case "ACCEPT_ALL_SUGGESTIONS": {
      let nextState: DealDraft = state;
      const keys: DraftFieldKey[] = [
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
      for (const key of keys) {
        if (nextState.fields[key].suggestion && !nextState.fields[key].isManuallyEdited) {
          nextState = dealDraftReducer(nextState, {
            type: "ACCEPT_SUGGESTION",
            field: key,
          });
        }
      }
      return nextState;
    }

    case "REVIEW_OMISSION": {
      switch (action.field) {
        case "hours":
          return {
            ...state,
            fields: {
              ...state.fields,
              validStart: { ...state.fields.validStart, isReviewed: true },
              validEnd: { ...state.fields.validEnd, isReviewed: true },
            },
          };
        case "address":
          return {
            ...state,
            fields: {
              ...state.fields,
              address: { ...state.fields.address, isReviewed: true },
            },
          };
        case "priceCad":
          return {
            ...state,
            fields: {
              ...state.fields,
              priceCad: { ...state.fields.priceCad, isReviewed: true },
            },
          };
        case "expiresOn":
          return {
            ...state,
            fields: {
              ...state.fields,
              expiresOn: { ...state.fields.expiresOn, isReviewed: true },
            },
          };
        case "validDays":
          return {
            ...state,
            fields: {
              ...state.fields,
              validDays: { ...state.fields.validDays, isReviewed: true },
            },
          };
        case "conditions":
          return {
            ...state,
            fields: {
              ...state.fields,
              conditions: { ...state.fields.conditions, isReviewed: true },
            },
          };
        default:
          return state;
      }
    }

    case "REVIEW_FIELD": {
      const fieldKey = action.field;
      return {
        ...state,
        fields: {
          ...state.fields,
          [fieldKey]: {
            ...state.fields[fieldKey],
            isReviewed: true,
          },
        },
      };
    }

    case "RESOLVE_REVIEW_ISSUE": {
      const target = state.reviewIssues.find((iss) => iss.id === action.issueId);
      if (!target) return state;

      // FUTURE_START cannot be resolved through this adapter (named hard blocker until date/runtime agreement)
      if (target.code === "FUTURE_START") {
        return state;
      }

      // UNSUPPORTED_CONSTRAINT requires a non-empty resolution note
      if (target.code === "UNSUPPORTED_CONSTRAINT") {
        if (!action.resolutionNote || action.resolutionNote.trim().length === 0) {
          return state;
        }
      }

      // CURRENCY_UNVERIFIED cannot be resolved via generic action; requires manual price confirmation
      if (target.code === "CURRENCY_UNVERIFIED") {
        return state;
      }

      return {
        ...state,
        reviewIssues: state.reviewIssues.map((issue) =>
          issue.id === action.issueId
            ? { ...issue, resolved: true, resolutionNote: action.resolutionNote.trim() }
            : issue
        ),
      };
    }

    case "INVALIDATE_SOURCE_CONTEXT": {
      const nextRevision = state.extraction.sourceRevision + 1;
      return {
        ...state,
        fields: clearPendingSuggestions(state),
        extraction: {
          ...state.extraction,
          status: state.extraction.status === "pending" ? "canceled" : state.extraction.status,
          currentRequestId: null,
          sourceRevision: nextRevision,
          unselectedOffers: undefined,
          selectedOfferIndex: undefined,
          pendingManualReview: undefined,
        },
        // Preserve unresolved reviewIssues: accepted fields must not bypass known constraints
      };
    }

    case "CONFIRM_LOCATION": {
      validateCoordinates(action.lat, action.lng);
      return {
        ...state,
        location: {
          lat: action.lat,
          lng: action.lng,
          confirmed: true,
        },
      };
    }

    case "SET_IMAGE_ID": {
      if (action.imageId === state.imageId) return state;
      const nextRevision = state.extraction.sourceRevision + 1;
      return {
        ...state,
        imageId: action.imageId,
        fields: clearPendingSuggestions(state),
        extraction: {
          ...state.extraction,
          status: state.extraction.status === "pending" ? "canceled" : state.extraction.status,
          currentRequestId: null,
          sourceRevision: nextRevision,
          unselectedOffers: undefined,
          selectedOfferIndex: undefined,
          pendingManualReview: undefined,
        },
        // Preserve unresolved reviewIssues: accepted fields must not bypass known constraints
      };
    }

    case "SET_SOURCE_URL": {
      if (action.sourceUrl === state.sourceUrl) return state;
      const nextRevision = state.extraction.sourceRevision + 1;
      return {
        ...state,
        sourceUrl: action.sourceUrl,
        fields: clearPendingSuggestions(state),
        extraction: {
          ...state.extraction,
          status: state.extraction.status === "pending" ? "canceled" : state.extraction.status,
          currentRequestId: null,
          sourceRevision: nextRevision,
          unselectedOffers: undefined,
          selectedOfferIndex: undefined,
          pendingManualReview: undefined,
        },
        // Preserve unresolved reviewIssues: accepted fields must not bypass known constraints
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Publish Validation & Serialization
// ---------------------------------------------------------------------------

/**
 * Validates whether the draft is ready for publishing.
 * Collects all validation errors across:
 * - In-progress extraction blocking
 * - Required review state on ALL fields (initial, derived, or omitted)
 * - Safe sourceUrl validation
 * - Unresolved manual review issues (FUTURE_START hard blocker, UNSUPPORTED_CONSTRAINT, CURRENCY_UNVERIFIED)
 * - Pending unaccepted suggestions
 * - Unselected multi-deal offers
 * - Strict formats (24h time, real calendar date, finite nonnegative price, coords)
 */
export function validateForPublish(draft: DealDraft): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 1. Block publishing while extraction is still in flight
  if (draft.extraction.status === "pending") {
    errors.push(
      "Cannot publish while extraction is in progress; wait for completion or cancel extraction."
    );
  }

  // 2. Validate safe sourceUrl if present (reject javascript:, data:, file:, credentials)
  if (draft.sourceUrl !== null && draft.sourceUrl.trim().length > 0) {
    if (!isValidSourceUrl(draft.sourceUrl)) {
      errors.push("sourceUrl must be a valid http or https URL without user credentials.");
    }
  }

  // 3. Check for pending unaccepted suggestions
  const pendingKeys: string[] = [];
  (Object.keys(draft.fields) as DraftFieldKey[]).forEach((key) => {
    if (draft.fields[key].suggestion !== undefined) {
      pendingKeys.push(key);
    }
  });
  if (pendingKeys.length > 0) {
    errors.push(
      `Pending suggestions must be accepted or rejected before publishing: ${pendingKeys.join(", ")}`
    );
  }

  // 4. Multiple unselected offers
  if (
    draft.extraction.unselectedOffers &&
    draft.extraction.unselectedOffers.length > 1 &&
    draft.extraction.selectedOfferIndex === undefined
  ) {
    errors.push("Multiple extracted deals detected; an offer must be selected before publishing.");
  }

  // 5. Unresolved / blocking review issues from sidecar
  for (const issue of draft.reviewIssues) {
    if (issue.code === "FUTURE_START") {
      // Named hard blocker: never allowed to publish through this adapter
      errors.push(
        `Hard blocker: future-start deal (${issue.detail}) cannot publish until supported canonical date/runtime agreement.`
      );
    } else if (issue.code === "UNSUPPORTED_CONSTRAINT") {
      if (!issue.resolved) {
        errors.push(
          `Unresolved provider constraint: ${issue.detail}. Must be explicitly resolved with a non-empty resolution note.`
        );
      }
    } else if (issue.code === "CURRENCY_UNVERIFIED") {
      // Must be manually confirmed via SET_FIELD (or reviewed omission)
      if (!draft.fields.priceCad.isManuallyEdited) {
        errors.push(
          `Currency is unverified (${issue.detail}); price must be manually confirmed or explicitly omitted.`
        );
      }
    }
  }

  const f = draft.fields;

  // 6. Review state for ALL fields (initial, derived, or omitted)
  // Required: restaurant
  const restaurantVal = f.restaurant.value;
  if (!restaurantVal || restaurantVal.trim().length === 0) {
    errors.push("Restaurant name is required.");
  } else if (!f.restaurant.isReviewed) {
    errors.push("Restaurant name must be explicitly reviewed or confirmed.");
  }

  // Required: dealText
  const dealTextVal = f.dealText.value;
  if (!dealTextVal || dealTextVal.trim().length === 0) {
    errors.push("Deal text is required.");
  } else if (!f.dealText.isReviewed) {
    errors.push("Deal text must be explicitly reviewed or confirmed.");
  }

  // Address
  if (!f.address.isReviewed) {
    errors.push("Address must be explicitly reviewed (or confirmed as omitted).");
  }

  // Price
  if (!f.priceCad.isReviewed) {
    errors.push("Price must be explicitly reviewed (or confirmed as omitted/varies).");
  } else if (f.priceCad.value !== null) {
    if (
      typeof f.priceCad.value !== "number" ||
      !Number.isFinite(f.priceCad.value) ||
      f.priceCad.value < 0
    ) {
      errors.push(`priceCad must be a finite non-negative number, got: ${f.priceCad.value}`);
    }
  }

  // Start & End hours
  if (!f.validStart.isReviewed) {
    errors.push("Start time must be explicitly reviewed (or confirmed as all-day).");
  } else if (f.validStart.value !== null && !isValidTimeString(f.validStart.value)) {
    errors.push(`validStart must be formatted as "HH:MM", got: "${f.validStart.value}"`);
  }

  if (!f.validEnd.isReviewed) {
    errors.push("End time must be explicitly reviewed (or confirmed as all-day).");
  } else if (f.validEnd.value !== null && !isValidTimeString(f.validEnd.value)) {
    errors.push(`validEnd must be formatted as "HH:MM", got: "${f.validEnd.value}"`);
  }

  // Expiration
  if (!f.expiresOn.isReviewed) {
    errors.push("Expiration date must be explicitly reviewed (or confirmed as ongoing).");
  } else if (f.expiresOn.value !== null) {
    if (!isValidCalendarDate(f.expiresOn.value)) {
      errors.push(
        `expiresOn must be a valid real calendar date formatted as "YYYY-MM-DD", got: "${f.expiresOn.value}"`
      );
    }
  }

  // Valid days
  if (!f.validDays.isReviewed) {
    errors.push("Valid days must be explicitly reviewed or confirmed.");
  } else if (f.validDays.value.length > 0) {
    const invalidDays = f.validDays.value.filter((d) => !isCanonicalWeekday(d));
    if (invalidDays.length > 0) {
      errors.push(`Invalid weekdays specified: ${invalidDays.join(", ")}`);
    }
  }

  // Conditions
  if (!f.conditions.isReviewed) {
    errors.push("Conditions must be explicitly reviewed or confirmed.");
  }

  // 7. Location: must be confirmed with finite coords in bounds
  if (!draft.location || !draft.location.confirmed) {
    errors.push("Coordinates (lat, lng) must be explicitly confirmed by user/map.");
  } else {
    const { lat, lng } = draft.location;
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.push(`Confirmed lat must be a finite number between -90 and 90, got: ${lat}`);
    }
    if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.push(`Confirmed lng must be a finite number between -180 and 180, got: ${lng}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates the draft and serializes canonical create fields for the `deals.create` mutation.
 *
 * Rules:
 * - Rejects missing/unchecked required fields, pending suggestions, unconfirmed location,
 *   pending extraction, or unresolved provider restrictions.
 * - Converts null optional values to undefined (omitted from serialized object).
 * - Never includes backend-controlled fields (authorId, stillOnCount, expiredCount) or draft state.
 *
 * @throws DraftValidationError if the draft is not valid for publishing.
 */
export function buildPublishFields(draft: DealDraft): PublishFields {
  const { valid, errors } = validateForPublish(draft);
  if (!valid) {
    throw new DraftValidationError(errors);
  }

  const f = draft.fields;
  const loc = draft.location!;

  const result: PublishFields = {
    restaurant: f.restaurant.value!.trim(),
    dealText: f.dealText.value!.trim(),
    validDays: [...f.validDays.value],
    conditions: [...f.conditions.value],
    lat: loc.lat,
    lng: loc.lng,
  };

  // Convert null / empty optional values to undefined (omitted)
  if (f.address.value !== null && f.address.value.trim().length > 0) {
    result.address = f.address.value.trim();
  }

  if (f.priceCad.value !== null) {
    result.priceCad = f.priceCad.value;
  }

  if (f.validStart.value !== null) {
    result.validStart = f.validStart.value;
  }

  if (f.validEnd.value !== null) {
    result.validEnd = f.validEnd.value;
  }

  if (f.expiresOn.value !== null) {
    result.expiresOn = f.expiresOn.value;
  }

  if (draft.imageId !== null && draft.imageId.trim().length > 0) {
    result.imageId = draft.imageId.trim();
  }

  if (draft.sourceUrl !== null && draft.sourceUrl.trim().length > 0) {
    result.sourceUrl = draft.sourceUrl.trim();
  }

  return result;
}
