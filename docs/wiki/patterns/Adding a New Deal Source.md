---
title: "Adding a New Deal Source"
type: pattern
tags: [how-to, extraction]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["lib/extractCore.ts", "convex/extract.ts", "lib/imageDraftFlow.ts"]
---

# Adding a New Deal Source

## Overview

A how-to for the most likely extension point: teaching the canonical screenshot/flyer pipeline ([[Screenshot and Flyer Extraction]]) to accept a new kind of input (e.g. a PDF menu, a new image format). This is the pipeline to extend for new source *types* feeding the canonical `deals` table — not the Reel-video pipeline ([[Reel Ingestion Workflow]]) or the teammate workflow pipeline ([[Teammate Workflow Pipeline]]), which are separate systems with their own extension points.

## Where It's Used

The existing path: `components/deals/CanonicalPost.tsx` → `lib/imageDraftFlow.ts` (`ImageDraftFlow`) → `convex/extract.ts#extractDeal` → `lib/extractCore.ts#extractDealCore` → Gemini.

## How to Extend This

1. **Source validation**: if the new input is a different byte format, add its magic-byte signature to `lib/dealImageUpload.ts#classifyUploadImage` (and `lib/extractCore.ts#matchesMagic` if the extraction core needs to reclassify it independently) — never trust a client-declared MIME type alone.
2. **Upload path**: if the input needs its own upload shape (not "1–8 images"), follow [[Pure Core Plus Thin Convex Shell]]: add a pure validator in `lib/`, a thin Convex `httpAction` modeled on `convex/dealImage.ts`, and register it with ownership/expiry in `convex/dealUploads.ts`-style registry.
3. **Extraction core**: extend `lib/extractCore.ts`'s `LIMITS`/`validateInput`/`buildRequestBody` to accept the new source shape; keep the request/response Zod contracts in `lib/extractCore.ts` and `lib/prompt.ts` strict (`additionalProperties: false`) rather than loosening them.
4. **Manual-review codes**: if the new source type can produce a new kind of uncertainty the existing `FUTURE_START`/`UNSUPPORTED_CONSTRAINT`/`CURRENCY_UNVERIFIED` codes don't cover, add a new code consistently through `lib/extractCore.ts`, `convex/extract.ts`'s `outcome` validator, and `lib/extractionDraft.ts`/`lib/dealDraft.ts` — see [[AI Review Gate]] for why a new uncertainty must never bypass the review gate.
5. **Flow wiring**: add a `select*` method to `lib/imageDraftFlow.ts`'s `ImageDraftFlow` analogous to `selectFile`/`selectRecording`, reusing `analyze()`'s generation/staleness handling rather than duplicating it.
6. **Tests**: add a pure unit test for the new validator/core logic (no Convex/network needed, per [[Pure Core Plus Thin Convex Shell]]) alongside a `tests/backend/` or `tests/import/` integration test exercising the full Convex action.

## Deviations From Textbook Form

If the new source is fundamentally a different *media type* requiring its own model call shape (e.g. audio-only, or a document pipeline unlike images/video) rather than a variant of "1–8 images," consider whether it actually belongs as a fourth sibling pipeline instead of an extension of this one — that's exactly how the Reel-video pipeline and this screenshot pipeline came to be separate in the first place. Weigh that against the cost of a fourth independent pipeline before choosing.

## Related Concepts

- [[Screenshot and Flyer Extraction]], [[AI Review Gate]], [[Environment Gated Providers]]

## Sources

- [[Source - Project Process Docs]]
