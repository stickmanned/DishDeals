# Inert Deal Source Candidates (Burnaby & SFU)

This directory contains inert JSON records representing genuine food deal candidates in Burnaby, BC and near Simon Fraser University (SFU), researched under ticket **T-06A**.

## Schema Structure

Each candidate fixture contains two distinct top-level sections:
1. `canonicalProposal`: Formatted to DishDeals schema fields (`restaurant`, `address`, `dealText`, `priceCad`, `validDays`, `validStart`, `validEnd`, `expiresOn`, `conditions`, `sourceUrl`).
   - `lat` and `lng` are explicitly **omitted** (or set to `null`) because geocoding and pin placement are owned by Pinyuan (map lead).
   - In accordance with project instructions, missing or unstated values (`validEnd`, `expiresOn`, etc.) are `null` or omitted rather than fabricated.
2. `provenance`: Records the exact primary source URL, access date (`2026-10-03`), currency evidence, digital ad asset URLs (if present), and explicit missing field declarations.

## Candidate Overview

- `candidate-01-tenen-spaghetti.json`: Tenen Restaurant — Spaghetti Bolognese Lunch Special ($7.95)
- `candidate-02-tenen-soup.json`: Tenen Restaurant — Soup of the Day Lunch Special ($7.95)
- `candidate-03-tentatsu-takeout-discount.json`: Tentatsu Japanese Restaurant — 10% Off Take Out Orders $30+
- `candidate-04-argo-chicken-souvlaki.json`: Argo Greek — Chicken Souvlaki Lunch Special Platter ($22.00)
- `candidate-05-argo-lunch-skewers.json`: Argo Greek — 6 oz Lunch Skewers ($12.00)
- `candidate-06-burnaby-mtn-truffle-fries.json`: Burnaby Mountain Restaurant — Happy Hour Truffle Fries ($8.00)
- `candidate-07-burnaby-mtn-cheeseburger.json`: Burnaby Mountain Restaurant — Happy Hour Classic Cheeseburger ($15.00)
- `candidate-08-biercraft-manna-burger.json`: BierCraft UniverCity (SFU Campus) — Thursday Manna Burger ($5.50)
- `candidate-09-biercraft-wings.json`: BierCraft UniverCity (SFU Campus) — Wednesday 1 lb Wings ($12.00)
- `candidate-10-time-and-place-kebobs.json`: Time & Place Burnaby — Happy Hour Mediterranean Beef Kebobs ($5.00)
- `candidate-11-acqua-fresh-oysters.json`: Acqua Restaurant & Bar — Happy Hour Fresh Oysters ($1.50 each)
- `candidates.json`: Consolidated array of all 11 candidate objects.
