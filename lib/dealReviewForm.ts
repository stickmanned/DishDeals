/**
 * Deal review form pure helpers and business logic (N-FORM-UI).
 *
 * Provides view model computation, input validation, omission semantics,
 * and review issue evaluation for DealReviewForm without React DOM dependencies.
 */

import {
  dealDraftReducer,
  validateForPublish,
  type DealDraft,
  type FieldState,
  type OmissibleFieldKey,
  type ReviewIssue,
  type Weekday,
} from "./dealDraft";

/**
 * Human-readable explanations for omitting optional fields.
 * Clarifies all-day and every-day canonical semantics without asserting duration.
 */
export const OMISSION_SEMANTICS: Record<OmissibleFieldKey, { label: string; explanation: string }> = {
  address: {
    label: "Confirm no specific address",
    explanation: "Online offer, food truck, or multiple locations.",
  },
  priceCad: {
    label: "Confirm price varies / unknown",
    explanation: "Price varies by item or size; shown as 'Price varies'.",
  },
  hours: {
    label: "Confirm all-day hours",
    explanation: "Offer runs all day during normal open hours (00:00 – 24:00).",
  },
  expiresOn: {
    label: "Confirm no expiry listed",
    explanation: "No expiration date listed in source; expiry is unlisted or unknown.",
  },
  validDays: {
    label: "Confirm available every day",
    explanation: "No weekday restrictions; available Monday through Sunday.",
  },
  conditions: {
    label: "Confirm no special conditions",
    explanation: "No fine print or restrictions mentioned.",
  },
};

/**
 * Formats a model confidence self-assessment as a human-readable percentage.
 * Rejects and hides values outside 0..1, NaN, or non-numbers without fabricating.
 */
export function formatConfidence(confidence: number | undefined): string | null {
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return null;
  }
  return `Model assessment: ${Math.round(confidence * 100)}%`;
}

/**
 * Strict decimal price grammar parser.
 * Disallows scientific notation (1e3), hex (0x10), incomplete decimals (1.),
 * and negative numbers (-5).
 * Blank input returns { valid: true, value: null }.
 */
export function parsePriceInput(raw: string): {
  valid: boolean;
  value: number | null;
  error?: string;
} {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { valid: true, value: null };
  }

  // Reject incomplete decimal point at end (e.g. "1.")
  if (trimmed.endsWith(".")) {
    return {
      valid: false,
      value: null,
      error: "Incomplete price (trailing decimal point).",
    };
  }

  // Restrict to standard decimal price grammar: non-negative digits with optional decimal point and digits
  const DECIMAL_PRICE_REGEX = /^\d+(\.\d+)?$/;
  if (!DECIMAL_PRICE_REGEX.test(trimmed)) {
    return {
      valid: false,
      value: null,
      error: "Please enter a valid numeric price (e.g. 12.50).",
    };
  }

  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) {
    return {
      valid: false,
      value: null,
      error: "Price must be a valid non-negative number.",
    };
  }

  return { valid: true, value: num };
}

/**
 * Computes the price display string when "Accept All Suggestions" is executed.
 * Returns the suggested price if available, otherwise retains or reflects canonical price.
 */
export function getPriceDisplayOnAcceptAll(draft: DealDraft): string {
  const accepted = dealDraftReducer(draft, { type: "ACCEPT_ALL_SUGGESTIONS" });
  const price = accepted.fields.priceCad.value;
  return price !== null ? String(price) : "";
}

/**
 * Pure transition helper for weekday selection.
 * Prevents unchecking the last weekday from silently confirming every-day.
 * Switching to every-day requires deliberate action.
 */
export function transitionWeekdaySelection(
  currentDays: Weekday[],
  day: Weekday
): {
  nextDays: Weekday[];
  blocked: boolean;
  message?: string;
} {
  const isSelected = currentDays.includes(day);
  if (isSelected) {
    if (currentDays.length === 1) {
      return {
        nextDays: currentDays,
        blocked: true,
        message: "Cannot uncheck the last weekday. Use 'Available every day' to remove weekday restrictions.",
      };
    }
    return {
      nextDays: currentDays.filter((d) => d !== day),
      blocked: false,
    };
  }
  return {
    nextDays: [...currentDays, day],
    blocked: false,
  };
}

/**
 * Checks whether an extraction review issue can be resolved through user action.
 */
export function evaluateIssueResolution(issue: ReviewIssue): {
  canResolve: boolean;
  reason?: string;
} {
  if (issue.code === "FUTURE_START") {
    return {
      canResolve: false,
      reason: "Hard blocker: future-start deal cannot be published until canonical date agreement.",
    };
  }

  if (issue.code === "CURRENCY_UNVERIFIED") {
    return {
      canResolve: false,
      reason: "Currency unverified: edit price in CAD or confirm price omission to resolve.",
    };
  }

  return { canResolve: true };
}

/**
 * Evaluates whether the draft is currently ready to publish according to
 * the canonical validateForPublish function and local form input validation.
 *
 * Blocks publishing if local price input has parse errors, incomplete decimals,
 * or uncommitted changes that differ from canonical draft.fields.priceCad.value.
 */
export function getDraftPublishReadiness(
  draft: DealDraft,
  localPrice?: string
): {
  canPublish: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // If localPrice string is provided, validate it against local parse and canonical sync
  if (localPrice !== undefined) {
    const trimmed = localPrice.trim();
    if (trimmed !== "") {
      const parsed = parsePriceInput(trimmed);
      if (!parsed.valid) {
        errors.push(parsed.error ?? "Invalid price input.");
      } else if (parsed.value !== draft.fields.priceCad.value) {
        errors.push("Price input has uncommitted changes.");
      }
    } else {
      // Local input is empty; if canonical priceCad is not null, there is a mismatch
      if (draft.fields.priceCad.value !== null) {
        errors.push("Price input has uncommitted changes.");
      }
    }
  }

  const result = validateForPublish(draft);
  if (!result.valid) {
    errors.push(...result.errors);
  }

  return {
    canPublish: errors.length === 0,
    errors,
  };
}

export const validateReviewFormSubmission = getDraftPublishReadiness;

/**
 * Returns true if any field in the draft has an unaccepted suggestion.
 */
export function hasPendingSuggestions(draft: DealDraft): boolean {
  return Object.values(draft.fields).some((f) => f.suggestion !== undefined);
}

/**
 * Formats a weekday abbreviation to its display label.
 */
export function formatWeekday(day: Weekday): string {
  const map: Record<Weekday, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  return map[day];
}

/**
 * Checks whether a field state is reviewed.
 */
export function isFieldReviewed<T>(fieldState: FieldState<T>): boolean {
  return fieldState.isReviewed;
}
