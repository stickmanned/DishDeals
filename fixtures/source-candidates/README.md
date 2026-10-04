# Inert Deal Source Candidates (Burnaby & SFU)

This directory contains inert JSON records representing publicly advertised food deal candidates located in Burnaby, BC and near Simon Fraser University (SFU Burnaby Mountain / UniverCity), researched under ticket **T-06A**.

## Evaluation Status: Publicly Advertised Candidates with Live Terms Unconfirmed

In accordance with project data integrity standards, accessible websites confirm that an offer has been publicly advertised, but **not** that live terms, currency, or hours are verified production facts:
- **`canonicalProposal.priceCad` is strictly `null` (or omitted)** across all candidate proposals while explicit CAD currency confirmation remains pending. Stated amounts are recorded exclusively in `provenance.statedAmount` and `provenance.statedCurrency`.
- **Operating Hours vs Offer Hours**: General restaurant business opening hours (e.g. from page footers or general directory listings) are not treated as verified offer hours or offer days. Where offer-specific days/hours are unstated or ambiguous, `validDays`, `validStart`, and `validEnd` are kept empty/null and flagged as pending.
- **Schedule Representational Limits**: Offers featuring non-contiguous windows (e.g. afternoon + late night) or differing weekday vs weekend blocks cannot be modeled within the single `validStart`/`validEnd` DishDeals schema without splitting into separate variant records; such canonical hours remain pending with the full schedule documented in `provenance`.
- **Coordinates & Pins**: `lat` and `lng` are strictly omitted pending Pinyuan's map integration and human-confirmed map pins.
- **Physical Flyer Photos**: Digital web banners are captured as `adImageUrl` where reachable; they are not confused with physical photographed flyers.

## Fixture Schema Structure

Each candidate fixture contains two distinct top-level sections:
1. `canonicalProposal`: Formatted to canonical DishDeals schema fields (`restaurant`, `address`, `dealText`, `priceCad`, `validDays`, `validStart`, `validEnd`, `expiresOn`, `conditions`, `sourceUrl`).
2. `provenance`: Captures primary offer URL, primary address URL, access date (`2026-10-03`), evaluation status (`publicly_advertised_candidate_live_terms_unconfirmed`), stated amounts/currency, schedule/conflict details, reachable ad image URLs, and explicit missing field declarations.

## Candidate Directory

- `candidate-01-tenen-spaghetti.json`: Tenen Restaurant — Spaghetti Bolognese Lunch Special (Stated: $7.95)
- `candidate-02-tenen-soup.json`: Tenen Restaurant — Soup of the Day Lunch Special (Stated: $7.95)
- `candidate-03-tentatsu-takeout-discount.json`: Tentatsu Japanese Restaurant — 10% Off Take Out Orders $30+ (Excludes lunch specials & combos)
- `candidate-04-argo-chicken-souvlaki.json`: Argo Greek — Chicken Souvlaki Lunch Special Platter (Stated: $22.00, 11:30–14:30)
- `candidate-05-argo-lunch-skewers.json`: Argo Greek — 6 oz Lunch Skewers (Stated: $12.00, 11:30–14:30)
- `candidate-06-burnaby-mtn-truffle-fries.json`: Burnaby Mountain Restaurant — Happy Hour Truffle Fries (Stated: $8.00, Wed–Sun 14:30–16:30)
- `candidate-07-burnaby-mtn-cheeseburger.json`: Burnaby Mountain Restaurant — Happy Hour Classic Cheeseburger (Stated: $15.00, Wed–Sun 14:30–16:30)
- `candidate-08-biercraft-manna-burger.json`: BierCraft UniverCity (SFU Campus) — Thursday Manna Burger (Stated: $5.50)
- `candidate-09-biercraft-wings.json`: BierCraft UniverCity (SFU Campus) — Wednesday 1 lb Wings (Stated: $12.00)
- `candidate-10-time-and-place-kebobs.json`: Time & Place Burnaby — Happy Hour Mediterranean Beef Kebobs (Stated: $5.00; Mon–Fri 16–18, Sat–Sun 17–18)
- `candidate-11-acqua-fresh-oysters.json`: Acqua Restaurant & Bar — Happy Hour Fresh Oysters (Stated: $1.50 patio / $1.75 lounge, min 6 pcs)
- `candidates.json`: Consolidated array of all 11 candidate objects.
