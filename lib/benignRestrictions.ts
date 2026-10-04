// Ordinary restrictions a deal can already express as plain-text `conditions`, plus the currency default.
// Decision (William, Oct 4 2026, docs/decisions/0007): per-person limits, "while supplies last" and similar are
// shown to the reviewer as conditions instead of blocking publishing as UNSUPPORTED_CONSTRAINT, and a price with no
// currency stated is Canadian dollars (every venue is in Metro Vancouver). Anything not recognised here keeps
// blocking until a person reviews it, as do dates without a year, future starts and explicit non-CAD currencies.

const MAX_CONDITION_CHARS = 300;
const MAX_CONDITIONS = 20;

const BENIGN: readonly RegExp[] = [
  // "Limit of one per person", "max 2 per table"
  /\b(limit|max(imum)?)\b[^.]{0,30}\b(one|two|three|four|five|\d+)\b[^.]{0,20}\b(per|each|a|an)\b[^.]{0,15}\b(person|customer|guest|table|order|visit|party|household|account|day)\b/i,
  /\b(one|two|three|four|five|\d+)\s+(\w+\s+)?(per|each)\s+(person|customer|guest|table|order|visit|party|household)\b/i,
  // Supply limits
  /\bwhile (supplies|stocks?|quantit(y|ies)|inventory) lasts?\b/i,
  /\b(until|while) (they'?re |it'?s )?(sold out|gone)\b/i,
  /\blimited (quantity|quantities|supply|supplies|stock|availability|number)\b/i,
  /\bfirst[- ]come,? first[- ]served\b/i,
  /\bno rain ?checks?\b/i,
  /\bfirst\s+\d+\s+(customers?|guests?|people|orders?|diners?|visitors?)\b/i,
  // How the deal is taken
  /\bdine[- ]?in only\b/i,
  /\b(take[- ]?out|takeaway|pick[- ]?up|delivery) only\b/i,
  /\bcash only\b/i,
  /\b(reservations?|booking) (is |are )?(required|recommended|only)\b/i,
  /\bno substitutions?\b/i,
  /\b(no|not valid for|not for) (sharing|splitting)\b/i,
  /\b(excludes?|plus) (tax|tip|gratuity|alcohol|drinks?|beverages?)\b/i,
  /\b(tax|tip|gratuity) (is |are )?not included\b/i,
  // Which locations
  /\b(available|valid|offered|participating)\b[^.]{0,40}\b(locations?|branches|stores)\b/i,
];

/** True when a model-reported restriction is an ordinary condition (never FUTURE_START, never a date or unknown rule). */
export function isOrdinaryRestriction(...texts: (string | null | undefined)[]): boolean {
  return texts.some((text) => typeof text === "string" && text.trim() !== "" && BENIGN.some((rule) => rule.test(text)));
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
const alreadyStated = (conditions: readonly string[], text: string) => {
  const wanted = squash(text).toLowerCase();
  return conditions.some((c) => squash(c).toLowerCase().includes(wanted));
};

/**
 * Add each ordinary restriction (preferring the verbatim source quote) to a deal's conditions unless an existing
 * condition already says it. Capped like the draft contract (300 chars each, 20 total); anything that does not fit
 * returns false so the caller keeps it as a blocking note rather than dropping it.
 */
export function addAsCondition(conditions: readonly string[] | null, restriction: { quote?: string | null; detail: string }): { conditions: string[]; absorbed: boolean } {
  const current = [...(conditions ?? [])];
  const text = squash(restriction.quote?.trim() ? restriction.quote : restriction.detail);
  if (!text || text.length > MAX_CONDITION_CHARS) return { conditions: current, absorbed: false };
  if (alreadyStated(current, text) || alreadyStated(current, restriction.detail)) return { conditions: current, absorbed: true };
  if (current.length >= MAX_CONDITIONS) return { conditions: current, absorbed: false };
  return { conditions: [...current, text], absorbed: true };
}

// A currency other than CAD stated in the source. Plain "$" or no symbol is Canadian dollars here.
const FOREIGN_CURRENCY = /\b(usd|us\$|u\.s\.\s*dollars?|eur|gbp|aud|a\$|nzd|jpy|cny|mxn|chf)\b|[€£¥₹]/i;

/** A price with no currency stated, or CAD, is Canadian dollars. Any other stated currency still needs confirmation. */
export function isCanadianDollar(currency: string | null | undefined): boolean {
  return currency === null || currency === undefined || currency.trim() === "" || currency.trim().toUpperCase() === "CAD";
}

/** True when free text names a non-CAD currency explicitly. */
export function mentionsForeignCurrency(text: string): boolean {
  return FOREIGN_CURRENCY.test(text);
}
