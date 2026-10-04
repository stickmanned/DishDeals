# Canonical seed fixture — MISSING REAL DATA

`fixtures/seed.json` is intentionally **empty**. `seed:seedDeals` rejects it with `incomplete_fixture` and writes nothing. Nobody has supplied the real data, and this repository must not invent it.

## What must be supplied (by people, not agents)

- Exactly 2 `profiles`: `userId` of an **already existing** auth user (never guessed), the real `displayName` (2–24 chars) and the user's own public Solana `walletAddress` (32-byte base58). Wallet syntax is checked only; nothing proves ownership or funding.
- Exactly 10 `deals`, each from a reviewed, current, genuine source with a coordinate a human confirmed on the map:

```json
{ "authorUserId": "<profiles userId>",
  "deal": { "restaurant": "...", "dealText": "...", "validDays": [], "conditions": [], "lat": 0, "lng": 0,
            "sourceUrl": "https://...", "priceCad": 9.5, "address": "...", "validStart": "11:00", "validEnd": "14:00", "expiresOn": "2026-12-31" },
  "evidence": { "sourceUrl": "<same as deal.sourceUrl>", "reviewedBy": "...", "reviewedAt": "2026-10-04T10:00:00-07:00",
                "currencyConfirmed": "CAD", "locationConfirmedBy": "...", "locationConfirmedAt": "2026-10-04T10:05:00-07:00" } }
```

Rules: `priceCad`, `address`, times and `expiresOn` are optional; omit unknown values (a `$` sign is never assumed to be CAD). `currencyConfirmed: "CAD"` is required exactly when `priceCad` is given. Timestamps must be real ISO-8601 with a zone. Historical T-06 candidates with null price or pending pins are **not** authorized seed data.

## Honesty note

The validator checks shape only. Non-empty reviewer names and parseable timestamps do not prove that a human reviewed anything. That truth rests on whoever fills the file.

## Running

Local tests use synthetic data only. `seed:seedDeals` is internal; with no argument it only validates and previews (`dryRun` defaults to `true`). A real insert (`{"dryRun": false}`) needs a future, separately authorized cloud command and is not part of T-12A.
