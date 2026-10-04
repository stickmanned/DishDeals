---
title: "AI Review Gate"
type: concept
tags: [extraction, trust, review]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["lib/dealDraft.ts", "lib/extractionDraft.ts", "lib/reels/contract.ts", "convex/workflow/ai.ts", "convex/workflow/deals.ts"]
---

# AI Review Gate

## Overview

A project-wide rule, enforced independently in all three extraction pipelines: **nothing an AI model produces is ever silently published.** Every extraction result carries a sidecar of "manual review" signals, and at least one publish-blocking signal must be explicitly resolved by a human before the data can reach the public `deals`/`workflowDeals` table. This is a cross-cutting rule rather than one module — each pipeline implements it independently, with different type names for the same idea.

## How It Works

- **Screenshot/flyer path** ([[Screenshot and Flyer Extraction]]): the envelope from `convex/extract.ts` carries `manualReview: {dealIndex, code, blocking, detail, originalAmount?}[]` and `requiresBlockingReview: boolean`. Codes: `FUTURE_START` (deal starts in the future), `UNSUPPORTED_CONSTRAINT` (a restriction the schema can't represent), `CURRENCY_UNVERIFIED` (a price was found but not confirmed as CAD by a verbatim quote). `lib/dealDraft.ts`'s `ReviewIssue`/`ManualReviewNote` types track these per-field in the draft; `validateForPublish` (`dealDraft.ts:946`) refuses to let a draft with an unresolved blocking issue be published.
- **Reel path** ([[Reel Ingestion Workflow]]): `lib/reels/contract.ts`'s `sourceConstraint` (line 30) carries the same two restriction codes (`FUTURE_START`/`UNSUPPORTED_CONSTRAINT`) with a `superRefine` enforcing that `FUTURE_START` always carries a `startsOn` date. `quoteSupportsDate()` (line 79) is an extra structural check that a `FUTURE_START` claim's quote genuinely states a calendar date before it can be trusted at all.
- **Teammate workflow path** ([[Teammate Workflow Pipeline]]): every extracted deal becomes a `workflowDeals` row with `status: "needs_review"` (or `"rejected"`) — **never** `"published"` directly, even for a high-confidence `"ready"`-assessed outcome (`convex/workflow/ai.ts#finish`, explicit comment: "a 'ready' outcome waits for the owner's explicit review"). `workflow/deals.ts#review()` is the only path from `needs_review` to `published`, and it requires the reviewer to resolve or confirm a restaurant match.

## Key Details

- Every pipeline also requires **evidence grounding** as a precondition to even reaching the review stage: a field the model filled in without a verbatim source quote gets flagged, not silently trusted (see evidence-grounding notes in [[Reel Ingestion Workflow]] and [[Screenshot and Flyer Extraction]]).
- The rule extends to the UI layer: `lib/dealReviewForm.ts#OMISSION_SEMANTICS` requires the user to actively confirm an omitted field rather than letting a blank silently mean "no value."
- This is the same discipline that produces the "synthetic vs. live vs. device" evidence-tier distinction documented in [[Source - Project Process Docs]] — both are instances of "don't let an unverified claim pass as a confirmed fact."

## Open Questions

None at the code level — this is a settled, consistently-applied rule across pipelines; the only variation is the specific code names each pipeline uses for the same concept.

## Sources

- [[Source - Project Process Docs]]
