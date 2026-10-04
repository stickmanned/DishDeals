# Ordinary restrictions as conditions, and CAD by default

October 4, 2026. Decision by William (project owner), stated in chat after testing real Reels on his phone:

1. Restrictions such as "limit one per person" and "while supplies last" must not raise a blocking UNSUPPORTED_CONSTRAINT: the
   deal already has a free-text `conditions` list that can say them.
2. A price in Canada is Canadian dollars. The CURRENCY_UNVERIFIED warning must not appear for a price whose currency is simply
   not stated.

This relaxes the earlier "no currency assumptions" rule for this one case. It supersedes the "no CAD evidence means unverified"
behavior (T-05A) on both the screenshot/flyer path and the Reel path.

## Behavior (`lib/benignRestrictions.ts`)

- **Ordinary restrictions** (per-person limits, supplies last / limited quantity / first N customers, dine-in or takeout only,
  cash only, reservations, no substitutions, tax and tip, which locations) are added to the deal's `conditions` using the
  verbatim source quote, de-duplicated against conditions already present. The reviewer still sees and reviews every condition.
  The model's original constraints and evidence stay in the sidecar.
- **Still blocking:** FUTURE_START, a date without a four-digit year, members-only, eligibility or code rules, and anything the
  list does not recognise. A restriction that cannot fit a condition (over 300 characters, or 20 already) stays a blocking note.
- **Currency:** no stated currency, or CAD, means CAD and the price fills `priceCad`. A stated non-CAD currency (US$, EUR, GBP,
  £, €, ...) still raises the non-blocking CURRENCY_UNVERIFIED note and leaves `priceCad` empty. On the screenshot path the
  model is asked to quote any currency text in `cadEvidence`; the supplied text is also checked.
- Both model prompts were updated to match (restrictions go in conditions; a bare `$` is CAD).

## Known limit

A flyer image that shows a foreign price only visually, with no text the model quotes, is treated as CAD. Every venue in the
app is in Metro Vancouver, and the price is still reviewed before publishing.
