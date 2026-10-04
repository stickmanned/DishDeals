/**
 * Deal draft state machine and publish validation.
 *
 * Runtime-independent, pure immutable reducer and validation helpers for deal drafts.
 * Supports Instagram extraction suggestions, manual editing overrides,
 * explicit review of omitted optional data, Pinyuan-provided coordinate confirmation,
 * and canonical Convex publish field serialization with null-to-undefined conversion.
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
}

export interface ExtractionState {
  status: "idle" | "pending" | "success" | "no_deal_detected" | "error" | "canceled";
  currentRequestId: string | null;
  sourceRevision: number;
  error?: string;
  unselectedOffers?: DealOffer[];
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
      result: {
        isDeal: boolean;
        deals: DealOffer[];
      };
    }
  | {
      type: "FINISH_EXTRACTION_ERROR";
      requestId: string;
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
 * Never overwrites manually edited fields.
 */
function applyOfferSuggestions(draft: DealDraft, offer: DealOffer): DealDraft {
  const fields = { ...draft.fields };

  function applySuggestion<K extends DraftFieldKey>(
    key: K,
    val: DealDraftFields[K]["value"],
    confidence?: number
  ) {
    const cur = fields[key];
    // Known manually edited values remain authoritative; never overwrite them.
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

export function dealDraftReducer(state: DealDraft, action: DealDraftAction): DealDraft {
  switch (action.type) {
    case "START_EXTRACTION": {
      return {
        ...state,
        imageId: action.imageId !== undefined ? action.imageId : state.imageId,
        sourceUrl: action.sourceUrl !== undefined ? action.sourceUrl : state.sourceUrl,
        extraction: {
          status: "pending",
          currentRequestId: action.requestId,
          sourceRevision: state.extraction.sourceRevision + 1,
          error: undefined,
          unselectedOffers: undefined,
        },
      };
    }

    case "CANCEL_EXTRACTION": {
      // If a specific requestId is given, verify it matches the active extraction
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
      // Ignore superseded, late, or canceled extractions
      if (
        action.requestId !== state.extraction.currentRequestId ||
        state.extraction.status === "canceled"
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
            unselectedOffers: action.result.deals,
          },
        };
      }

      // Exactly one deal detected: propose suggestions to untouched fields
      const next = applyOfferSuggestions(state, action.result.deals[0]);
      return {
        ...next,
        extraction: {
          ...state.extraction,
          status: "success",
          currentRequestId: null,
          unselectedOffers: undefined,
        },
      };
    }

    case "SELECT_OFFER": {
      const offers = state.extraction.unselectedOffers;
      if (!offers || action.offerIndex < 0 || action.offerIndex >= offers.length) {
        return state;
      }
      const selectedOffer = offers[action.offerIndex];
      const next = applyOfferSuggestions(state, selectedOffer);
      return {
        ...next,
        extraction: {
          ...next.extraction,
          unselectedOffers: undefined,
        },
      };
    }

    case "FINISH_EXTRACTION_ERROR": {
      // Ignore superseded or canceled extractions
      if (
        action.requestId !== state.extraction.currentRequestId ||
        state.extraction.status === "canceled"
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

      return {
        ...state,
        location: nextLocation,
        fields: {
          ...state.fields,
          [fieldKey]: {
            value: action.value,
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

      return {
        ...state,
        location: nextLocation,
        fields: {
          ...state.fields,
          [fieldKey]: {
            value: field.suggestion.value,
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
      return {
        ...state,
        imageId: action.imageId,
      };
    }

    case "SET_SOURCE_URL": {
      return {
        ...state,
        sourceUrl: action.sourceUrl,
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
 * Collects all validation errors across required fields, pending suggestions,
 * unreviewed omissions, invalid formats, and location confirmation.
 */
export function validateForPublish(draft: DealDraft): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 1. Check for pending suggestions
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

  // 2. Multiple unselected offers
  if (draft.extraction.unselectedOffers && draft.extraction.unselectedOffers.length > 1) {
    errors.push("Multiple extracted deals detected; an offer must be selected before publishing.");
  }

  const f = draft.fields;

  // 3. Required: restaurant
  const restaurantVal = f.restaurant.value;
  if (!restaurantVal || restaurantVal.trim().length === 0) {
    errors.push("Restaurant name is required.");
  }

  // 4. Required: dealText
  const dealTextVal = f.dealText.value;
  if (!dealTextVal || dealTextVal.trim().length === 0) {
    errors.push("Deal text is required.");
  }

  // 5. Optional address: if null/empty, must be reviewed
  if (!f.address.value || f.address.value.trim().length === 0) {
    if (!f.address.isReviewed) {
      errors.push("Missing address must be explicitly reviewed or acknowledged.");
    }
  }

  // 6. Optional priceCad: if null, must be reviewed; if present, must be non-negative finite number
  if (f.priceCad.value === null) {
    if (!f.priceCad.isReviewed) {
      errors.push("Missing price must be explicitly reviewed or marked as varies.");
    }
  } else {
    if (
      typeof f.priceCad.value !== "number" ||
      !Number.isFinite(f.priceCad.value) ||
      f.priceCad.value < 0
    ) {
      errors.push(`priceCad must be a finite non-negative number, got: ${f.priceCad.value}`);
    }
  }

  // 7. Optional hours (validStart, validEnd)
  const hasHours = f.validStart.value !== null || f.validEnd.value !== null;
  if (!hasHours) {
    if (!f.validStart.isReviewed || !f.validEnd.isReviewed) {
      errors.push("Missing hours must be explicitly reviewed or marked as all-day.");
    }
  } else {
    if (f.validStart.value !== null && !isValidTimeString(f.validStart.value)) {
      errors.push(`validStart must be formatted as "HH:MM", got: "${f.validStart.value}"`);
    }
    if (f.validEnd.value !== null && !isValidTimeString(f.validEnd.value)) {
      errors.push(`validEnd must be formatted as "HH:MM", got: "${f.validEnd.value}"`);
    }
  }

  // 8. Optional expiresOn
  if (f.expiresOn.value === null) {
    if (!f.expiresOn.isReviewed) {
      errors.push("Missing expiration date must be explicitly reviewed or marked as ongoing.");
    }
  } else {
    if (!isValidCalendarDate(f.expiresOn.value)) {
      errors.push(
        `expiresOn must be a valid real calendar date formatted as "YYYY-MM-DD", got: "${f.expiresOn.value}"`
      );
    }
  }

  // 9. Valid days: if empty array (meaning every day), must be reviewed
  if (!f.validDays.value || f.validDays.value.length === 0) {
    if (!f.validDays.isReviewed) {
      errors.push("Empty weekdays (all days) must be acknowledged when evidence is missing.");
    }
  } else {
    const invalidDays = f.validDays.value.filter((d) => !isCanonicalWeekday(d));
    if (invalidDays.length > 0) {
      errors.push(`Invalid weekdays specified: ${invalidDays.join(", ")}`);
    }
  }

  // 10. Conditions: if empty array, must be reviewed
  if (!f.conditions.value || f.conditions.value.length === 0) {
    if (!f.conditions.isReviewed) {
      errors.push("Empty conditions must be acknowledged when evidence is missing.");
    }
  }

  // 11. Location: must be confirmed with finite coords in bounds
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
 * - Rejects missing/unchecked required fields, pending suggestions, and unconfirmed location.
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
