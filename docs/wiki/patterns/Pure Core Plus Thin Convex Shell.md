---
title: "Pure Core Plus Thin Convex Shell"
type: pattern
tags: [architecture, testing, convex]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["lib/", "convex/"]
---

# Pure Core Plus Thin Convex Shell

## Overview

The dominant idiom across the whole codebase: business logic lives in a **pure function or class in `lib/`** that takes its dependencies (model client, geocoder, clock, storage) as injected parameters and has no Convex/DOM/network import of its own. The matching `convex/*.ts` file is then a thin shell that does only: authentication, environment-variable gating, wiring real dependencies, and mapping errors to `ConvexError`.

This is why `lib/` (dozens of files, heavily unit-tested) is much larger than `convex/` (functions are mostly 10–40 lines) or `components/` (controllers delegate to `lib/` classes like `ImageDraftFlow`).

## Where It's Used

- `convex/workflow/ai.ts`'s `run` action ↔ `lib/workflow/workflow.ts`'s `processDeal(input, dependencies)`. `Dependencies = {extract, locate, now?}` is built once by `liveDependencies(env)` and injected; tests inject fakes instead.
- `convex/extract.ts`'s `extractDeal` action ↔ `lib/extractCore.ts`'s `extractDealCore(input, config)` — no Convex import in `extractCore.ts` at all.
- `convex/geocode.ts`'s `geocode` action ↔ `lib/geocodeCore.ts`'s `geocodeCore(...)`, with `reserveGlobalSlot`/`cacheGet`/`cachePut` injected from `convex/geocodeState.ts`.
- `convex/reels.ts`'s mutations ↔ `lib/reels/contract.ts` (validation) and `lib/reels/draftRevision.ts` (optimistic-concurrency helpers).
- `convex/deals.ts`'s `create`/`update`/`listNearby` ↔ `lib/dealWrite.ts`'s `validatePublishFields`/`validateNearbyArgs`/`rankByDistance`.
- `convex/users.ts` ↔ `lib/profile.ts`'s `upsertProfileCore`/`meCore`, which take an injected `ProfileDb` interface instead of a Convex `ctx`.
- On the frontend: `components/deals/CanonicalPost.tsx` ↔ `lib/imageDraftFlow.ts`'s `ImageDraftFlow` class, which owns all state transitions and is independently tested without React.

## How to Extend This

When adding a new piece of business logic (a new extraction rule, a new validation, a new provider call):

1. Write it as a pure function/class in `lib/` (or `lib/workflow/`, `lib/reels/` if it's pipeline-specific). Accept dependencies as parameters, not as imports.
2. Give it its own `*.test.ts` next to it (or in `tests/`) using injected fakes — no live Convex/network needed.
3. In the matching `convex/*.ts` file, add only: an auth check, an env-var gate if it calls a paid provider (see [[Environment Gated Providers]]), construction of real dependencies, and a call into the `lib/` function, mapping its typed errors to `ConvexError`.
4. Never put a `fetch()`, a Zod schema for an external contract, or a business rule directly inside a Convex handler — that belongs in `lib/`.

## Deviations From Textbook Form

- A few Convex files do carry real logic because the rule is Convex-transaction-specific and can't be meaningfully separated — e.g. `convex/dealUploads.ts#register`'s per-owner quota check relies on an indexed range read inside the mutation's own transaction to serialize concurrent registrations. That's acceptable: the dependency is Convex's transaction guarantee itself, not an external provider.
- `convex/deals.ts` keeps the `@convex-dev/geospatial` index calls inline (not wrapped in a `lib/` core) since they must run in the same transaction as the canonical insert/delete for rollback correctness.

## Related Concepts

- [[Environment Gated Providers]] — the other half of what a "thin shell" is responsible for.
- [[Generation Fencing]] — a `lib/`-level correctness pattern that depends on this separation to be testable without a live workflow run.

## Sources

- [[Source - Project Process Docs]]
