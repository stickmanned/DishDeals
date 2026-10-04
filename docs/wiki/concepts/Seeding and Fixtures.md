---
title: "Seeding and Fixtures"
type: concept
tags: [seed, fixtures, testing]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/seed.ts", "lib/seed.ts", "fixtures/"]
---

# Seeding and Fixtures

## Overview

Demo/test data lives in `fixtures/` and is loaded through a validated, idempotent seeding path rather than being inserted ad hoc.

## How It Works

- `fixtures/seed.json` is the canonical seed manifest: exactly 2 profiles and 10 deals (`SEED_PROFILE_COUNT`/`SEED_DEAL_COUNT` in `lib/seed.ts`).
- `lib/seed.ts#parseSeedManifest` validates it strictly: exact-keys checking throughout, cross-checks that each deal's `evidence.sourceUrl` matches its `sourceUrl`, requires `currencyConfirmed: "CAD"` iff `priceCad` is present, and reuses [[Canonical Deal Publishing]]'s own `lib/dealWrite.ts#validatePublishFields` rather than a parallel schema — a seed deal must satisfy exactly the same rules a real publish would.
- `storedDealMatches` does full-field equality, which is what makes re-seeding idempotent: `convex/seed.ts#runSeed`/`seedDeals` never creates a user, never overwrites an existing profile or deal, and defaults to `dryRun: true`.
- `fixtures/extraction-contract/` — sample extraction inputs/outputs used as contract fixtures for the extraction schemas.
- `fixtures/source-assets/` and `fixtures/source-candidates/` — real menu/flyer images and candidate deal records gathered for seeding/testing against genuine source material (per `docs/data/` and ticket T-06).
- `fixtures/demo/` — the demo-cache replay fixtures; see [[Demo Cache]].

## Where It Lives

- `convex/seed.ts` — `runSeed`, `seedDeals` (internal mutation).
- `lib/seed.ts` — manifest validation, `SeedError`, `adaptDeal`, `dealIdentity`, `storedDealMatches`.
- `fixtures/` — all static data files, each subdirectory with its own `README.md`.

## Sources

- [[Canonical Deal Publishing]], [[Demo Cache]]
