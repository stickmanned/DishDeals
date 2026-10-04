# Extraction Contract Fixtures (Inert / Synthetic)

These fixtures are **inert contract test samples** demonstrating strict conformance to the canonical `DealResult` schema defined in [`lib/dealSchema.ts`](../../lib/dealSchema.ts).

> **IMPORTANT**: These files are **synthetic, offline contract examples**. They do **not** represent measured live API calls or live provider evidence. No live Gemini API calls were made to produce these fixtures. Furthermore, confidence scores represent the model's subjective self-assessments, not calibrated statistical probabilities or ground-truth evidence certainty.

## Samples

1. **`sample-1-lunch-special.json`**:
   - Scenario: Clear weekday lunch combo flyer with explicit CAD evidence ("$8.99 CAD") and expiry date.
   - Per-field self-assessment scores reflect high certainty across dimensions (`restaurant: 0.98`, `priceCad: 0.95`, `hours: 0.92`, `expiresOn: 0.90`).
   - No scores are synthesized from a global average or defaulted to 0.5.

2. **`sample-2-happy-hour-varied.json`**:
   - Scenario: Happy hour deal with beverage discounts where food price varies.
   - `priceCad` is `null` (price varies), hours are explicitly `15:00` to `18:00`.
   - Per-field self-assessment scores reflect that restaurant and hours are clearly stated (`0.96`, `0.94`), while price is non-fixed (`priceCad: 0.0`) and expiration is ongoing/unspecified (`expiresOn: 0.10`).

3. **`sample-3-foreign-currency-unresolved.json`**:
   - Scenario: Post mentions "$6" without specifying CAD or USD from a cross-border chain.
   - Enforces the rule: **Never assume CAD**. Vancouver default context plus a dollar sign cannot prove CAD. `priceCad` is set to `null` with low self-assessment score (`0.15`).
   - `conditions` strictly contains source-stated restrictions ("Online orders only via mobile app", "Single-use promo code"), and does not fold model warnings or uncertainty into conditions.

4. **`sample-4-not-a-deal.json`**:
   - Scenario: Instagram food photo/review with no actionable discount or dining offer.
   - Returns `{ "isDeal": false, "deals": [] }`.
