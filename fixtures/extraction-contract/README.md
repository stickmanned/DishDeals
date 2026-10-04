# Extraction Contract Fixtures (Inert / Synthetic)

These fixtures are **inert contract test samples** demonstrating strict conformance to the canonical `DealResult` schema defined in [`lib/dealSchema.ts`](../../lib/dealSchema.ts).

> **IMPORTANT**: These files are **synthetic, offline contract examples**. They do **not** represent measured live API calls or live provider evidence. No live Gemini API calls were made to produce these fixtures, and no provider produced them. The confidence scores in these fixtures are **authored illustrative test numbers** designed to test schema validation and UI review thresholds, **not** genuine model self-assessments or calibrated probabilities.

## Samples

1. **`sample-1-lunch-special.json`**:
   - Scenario: Clear weekday lunch combo flyer with explicit CAD evidence ("$8.99 CAD") and expiry date.
   - Authored illustrative confidence numbers reflect high test scores across dimensions (`restaurant: 0.98`, `priceCad: 0.95`, `hours: 0.92`, `expiresOn: 0.90`).
   - No scores are synthesized from a global average or defaulted to 0.5.

2. **`sample-2-happy-hour-varied.json`**:
   - Scenario: Happy hour deal with beverage discounts where food price varies.
   - `priceCad` is `null` (price varies), hours are explicitly `15:00` to `18:00`.
   - Authored illustrative confidence numbers reflect clear restaurant and hours (`0.96`, `0.94`), non-fixed price (`priceCad: 0.0`), and ongoing/unspecified expiration (`expiresOn: 0.10`).

3. **`sample-3-foreign-currency-unresolved.json`**:
   - Scenario: Post mentions "$6" without specifying CAD or USD from a cross-border chain.
   - Enforces the rule: **Never assume CAD**. Vancouver default context plus a dollar sign cannot prove CAD. `priceCad` is set to `null` with a low test score (`0.15`).
   - `conditions` strictly contains source-stated restrictions ("Online orders only via mobile app", "Single-use promo code"), without folding model warnings or uncertainty into conditions.

4. **`sample-4-not-a-deal.json`**:
   - Scenario: Instagram food photo/review with no actionable discount or dining offer.
   - Returns `{ "isDeal": false, "deals": [] }` based on actual evidence of no offer.
