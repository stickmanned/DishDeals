---
title: "Generation Fencing"
type: concept
tags: [concurrency, reels, correctness]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/reels.ts", "lib/reels/draftRevision.ts"]
---

# Generation Fencing

## Overview

The optimistic-concurrency pattern used throughout [[Reel Ingestion Workflow]] to make retries, deletes, and retention changes safe in the presence of slow/async work (durable workflow runs, HTTP uploads) that might still be in flight when the user takes a new action.

## How It Works

- Every `reelItems` row carries a `generation: number` (and `attempts: number`).
- Any action that supersedes in-flight work — `retry`, `remove`, `setRetention`, `attachSupplied` — bumps `generation` via `lib/reels/draftRevision.ts#bump()` and stops/cancels the old workflow run (`stopWorkflow`, `convex/reels.ts:38`).
- Every internal mutation that an async worker calls back into — `attachMedia`, `finish`, `fail`, `expire`, `workItem`, `workSource` — re-reads the item and checks `generation`/`expiresAt` **before** acting. If the caller's `generation` no longer matches the row's current `generation`, the call is a no-op (silently ignored) rather than an error, because it represents a legitimately stale result from work that has already been superseded.
- `convex/reels.ts#attachMedia` additionally returns `false` on a stale call (rather than throwing), and the caller responds by deleting the orphaned video it was given — there is no path where stale data is written.
- `saveDraft` uses a parallel but distinct scheme: `expectedGeneration`/`expectedRevision` arguments checked by `lib/reels/draftRevision.ts#checkSave()`, so a draft edit based on stale client state is rejected rather than silently overwriting a newer server state.

## Where It Lives

- `convex/reels.ts` — `enqueue`, `stopWorkflow`, `retry`, `attachMedia`, `finish`, `fail`, `expire`, `attachSupplied`, `sourceTarget` all participate in the fence.
- `lib/reels/draftRevision.ts` — `bump()`, `checkSave()`, `planFinish()` (the pure logic governing how a late extraction result merges with an already-edited draft without clobbering user edits).

## Key Details

- This pattern is proven directly by `convex/reels.test.ts`'s "Retry/generation fencing" and "Deletion vs. late workers" test groups: a stale `fail` call against an old generation is silently ignored after a retry bumped the generation; a late `attachMedia` call against a stale generation returns `false` and the item never reappears in `list`.
- Extending retention (`setRetention`) specifically invalidates the previously-scheduled `expire` call by changing `expiresAt`, since `expire` itself is fenced on an *exact* `expiresAt` match (`convex/reels.ts:157`) — not just "has it passed."

## Sources

- [[Reel Ingestion Workflow]]
