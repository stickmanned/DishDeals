/**
 * Deal review form pure helpers and business logic (N-FORM-UI).
 *
 * Provides view model computation, input validation, omission semantics,
 * and review issue evaluation for DealReviewForm without React DOM dependencies.
 */

import {
  validateForPublish,
  type DealDraft,
  type FieldState,
  type OmissibleFieldKey,
  type ReviewIssue,
  type Weekday,
} from "./dealDraft";

/**
 * Human-readable explanations for omitting optional fields.
 * Clarifies all-day and every-day canonical semantics.
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
    label: "Confirm ongoing offer",
    explanation: "No listed expiration date; ongoing until discontinued.",
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
 * Never invents probability or default 0.5.
 */
export function formatConfidence(confidence: number | undefined): string | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return null;
  }
  const clamped = Math.max(0, Math.min(1, confidence));
  return `Model assessment: ${Math.round(clamped * 100)}%`;
}

/**
 * Strict price input parser that handles partial or invalid numbers.
 * Retains user keystrokes without coercing blank or invalid strings to zero.
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

  // Reject negative signs or letters
  if (trimmed.startsWith("-")) {
    return { valid: false, value: null, error: "Price cannot be negative." };
  }

  const num = Number(trimmed);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return { valid: false, value: null, error: "Please enter a valid numeric price." };
  }

  if (num < 0) {
    return { valid: false, value: null, error: "Price must be non-negative." };
  }

  return { valid: true, value: num };
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
 * the canonical validateForPublish function.
 */
export function getDraftPublishReadiness(draft: DealDraft): {
  canPublish: boolean;
  errors: string[];
} {
  const result = validateForPublish(draft);
  return {
    canPublish: result.valid,
    errors: result.errors,
  };
}

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
