---
title: "Reel Ingestion Workflow"
type: concept
tags: [reels, extraction, gemini, convex-workflow]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/reels.ts", "convex/reelActions.ts", "convex/reelWorkflow.ts", "convex/reelSource.ts", "lib/reels/"]
---

# Reel Ingestion Workflow

## Overview

The pipeline for saving an Instagram Reel link and turning it into an editable deal draft via Gemini video analysis. DishDeals never fetches Instagram itself — a "legacy resolver" that once tried this is permanently and deliberately disabled. Instead, after sharing the link, the user attaches their **own screen recording** of the Reel, which is what actually gets analyzed.

## How It Works

1. **`reels.submit`** (mutation, `convex/reels.ts:56`) — the user pastes/shares an Instagram link. The URL is normalized (`lib/reels/contract.ts#normalizeInstagramUrl`), deduped per owner via the `by_owner_url` index, and a `reelItems` row is inserted with `status: "queued"`. **No workflow starts yet** — link-only submission never calls Gemini.
2. The user attaches a recording. The browser `POST`s to `/reel-source` (`convex/reelSource.ts`), an authenticated, CORS-gated, capacity- and time-capped HTTP upload (`lib/reels/suppliedMedia.ts`). On success it stores the video and calls **`reels.attachSupplied`** (internal mutation, `convex/reels.ts:169`), which is the real entry point: it patches the item to `sourceKind: "supplied"` and starts the durable workflow.
3. **`reelWorkflow.process`** (`convex/reelWorkflow.ts:5`, a `@convex-dev/workflow` `WorkflowManager` with `maxParallelism: 2`) runs: load the item (`internal.reels.workItem`) → since `sourceKind === "supplied"`, skip the (dead) retrieval step → call **`reelActions.extract`** (`convex/reelActions.ts:31`, a `"use node"` action).
4. `extract` downloads the stored video, base64-encodes it, and calls Gemini (`@google/genai`) via `lib/reels/contract.ts#runReelExtraction`, which builds the request (`buildReelExtractionRequest`) with the system prompt `REEL_SYSTEM_INSTRUCTION` (contract.ts:142) and validates the response (`validateExtraction`, contract.ts:109) before accepting it.
5. On success, **`reels.finish`** (internal mutation, `convex/reels.ts:140`) parses the result, merges it with any already-edited draft (`planFinish`, `lib/reels/draftRevision.ts`), and sets `status: "ready"` or `"no_deal"`. On any failure at any step, **`reels.fail`** sets `status: "failed"` with a typed `{code, message}`.
6. The user reviews the draft in `components/reels/CanonicalReelReview.tsx`, edits it via **`reels.saveDraft`** (optimistic-concurrency checked), confirms a location, and the draft is converted to the canonical shape (`lib/reels/contract.ts#toCanonical`) and published through `deals.create` (see [[Canonical Deal Publishing]]).

## Where It Lives

- `convex/reels.ts` — all owner-scoped mutations/queries (`submit`, `get`, `list`, `retry`, `remove`, `setRetention`, `saveDraft`) and internal functions the workflow calls (`workItem`, `workSource`, `attachMedia`, `finish`, `fail`, `expire`, `attachSupplied`, `sourceTarget`).
- `convex/reelActions.ts` — Node-runtime actions: `retrieve` (always fails closed — "Reels are not fetched from links") and `extract` (the real Gemini call).
- `convex/reelWorkflow.ts` — the durable `@convex-dev/workflow` definition.
- `convex/reelSource.ts` — the authenticated `/reel-source` HTTP upload endpoint.
- `lib/reels/contract.ts` — URL normalization, the `reelDraft`/`reelExtraction` Zod contracts, `validateExtraction`'s evidence/timestamp grounding, `toCanonical`, the Gemini prompt and request builder.
- `lib/reels/nativeContext.ts` — the "native supplied context" (iPhone share-sheet text) contract; see [[Native and Android Share Integration]].
- `lib/reels/draftRevision.ts` — optimistic-concurrency helpers (`bump`, `checkSave`, `planFinish`) backing [[Generation Fencing]].
- `lib/reels/suppliedMedia.ts` — upload request parsing/CORS/size limits for `/reel-source`.
- `lib/reels/provider.ts` — the retired ScrapeCreators-based retrieval client; dead code path, kept only so `reelActions.retrieve`'s "permanently disabled" behavior is provably inert (see `convex/reels.test.ts`).
- `components/reels/ReelIntake.tsx`, `CanonicalReelReview.tsx` — the save/review UI.

## Key Details

- **Dual auth/ownership idiom**: `owner()`/`owned()` in `convex/reels.ts:13-22` use Convex Auth's `getAuthUserId`, typed `Id<"users">`, and deliberately throw "Item not found" (not "forbidden") for a non-owner — hiding existence. Contrast with [[Auth and Ownership Model]]'s `requireOwner()` used by the sibling workflow pipeline.
- **Rate limiting**: `rateLimit()` (`reels.ts:23-30`) caps submissions/retries at 10/hour per owner via the `reelLimits` table — see [[Rate Limiting Patterns]].
- **Generation fencing** is used pervasively: every internal mutation re-checks `generation`/`expiresAt` before acting, so a retry or delete safely invalidates any in-flight async work. See [[Generation Fencing]].
- **Evidence grounding**: `validateExtraction` requires every evidence/constraint quote to be an exact substring of the caption, exactly one native-text fragment, or the transcript — never joined across sources.
- `convex/reels.test.ts` is a thorough `convex-test` + `@convex-dev/workflow/test` suite (mocked `@google/genai`, fake timers) that is effectively the living spec for this pipeline's edge cases (dedup races, stale-generation fencing, dead legacy-resolver proof, draft/extraction immutability).

## Open Questions

- Whether/when the "legacy resolver" code (`lib/reels/provider.ts`, `reelActions.retrieve`) will be removed entirely versus kept disabled indefinitely is a product decision tracked in the process docs, not visible from the code alone.

## Sources

- [[Source - Project Process Docs]] (`docs/decisions/0001-teammate-backend-integration.md` explains why this pipeline and [[Teammate Workflow Pipeline]] coexist)
