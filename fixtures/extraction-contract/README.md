# Extraction Contract Fixtures (Inert / Synthetic)

These fixtures are **inert contract test samples** demonstrating strict conformance to the canonical `DealResult` schema defined in [`lib/dealSchema.ts`](../../lib/dealSchema.ts).

> **IMPORTANT**: These files are **synthetic, offline contract examples**. They do **not** represent measured live API calls or live provider evidence. No live Gemini API calls were made to produce these fixtures.

## Samples

1. **`sample-1-lunch-special.json`**:
   - Scenario: Clear weekday lunch combo flyer with unambiguous pricing ($8.99 CAD) and expiry date.
   - Per-field confidence reflects high certainty across all dimensions (`restaurant: 0.98`, `priceCad: 0.95`, `hours: 0.92`, `expiresOn: 0.90`).
   - No scores are synthesized from a global average or defaulted to 0.5.

2. **`sample-2-happy-hour-varied.json`**:
   - Scenario: Happy hour deal with beverage discounts where food price varies.
   - `priceCad` is `null` (price varies), hours are explicitly `15:00` to `18:00`.
   - Per-field confidence reflects that restaurant and hours are clearly stated (`0.95`, `0.92`), while price is non-fixed (`priceCad: 0.0`) and expiration is ongoing/unspecified (`expiresOn: 0.10`).

3. **`sample-3-foreign-currency-unresolved.json`**:
   - Scenario: Post mentions "$15 USD" or ambiguous dollar amount from a cross-border chain.
   - Enforces the rule: **Never assume CAD**. `priceCad` is set to `null` with low confidence (`0.15`), and conditions capture the currency ambiguity.
   - Demonstrates that uncertainty is captured per-field rather than averaged.

4. **`sample-4-not-a-deal.json`**:
   - Scenario: Instagram food photo/review with no actionable discount or dining offer.
   - Returns `{ "isDeal": false, "deals": [] }`.
