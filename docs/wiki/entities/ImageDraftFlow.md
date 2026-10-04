---
title: "ImageDraftFlow"
type: entity
tags: [controller, state-machine, frontend]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["lib/imageDraftFlow.ts"]
---

# ImageDraftFlow

## Overview

The single state-machine class behind the canonical screenshot/flyer/recording post flow (`components/deals/CanonicalPost.tsx`). It owns upload, extraction, draft application, and publish, as a pure, dependency-injected controller with no React/Convex import of its own — see [[Pure Core Plus Thin Convex Shell]].

## Location

`lib/imageDraftFlow.ts` (class defined around line 315; the file is ~850 lines total).

## Details

- `OwnedStorageId` (line 63) — a branded type: only a real upload receipt (`FlowDeps.upload`'s return value) can mint one, so the flow can never claim an `imageId` it hasn't verifiably uploaded itself.
- `selectFile` / `selectRecording` (388, 411) — choose an image file or a screen recording as the active source.
- `setDemoReplay` (425) — opts into [[Demo Cache]] replay for this session.
- `analyze` (471) — uploads the file exactly once per selection, then extracts; checks generation/staleness before applying results, so a slow extraction that returns after the user has moved on is discarded rather than overwriting newer state.
- `lookupCache` (632) — tries a bounded demo-cache lookup before falling back to a real `extract` call exactly once.
- `uploadRecording` (680) — uploads exactly 4 frames with all-or-nothing receipts (see [[Screenshot and Flyer Extraction]]'s recording path).
- `applyOffer` (764) — deliberately adds or replaces an extracted offer into the form; `confirmReplace` guards against silently losing a user's in-progress edits.
- `publish` / `runPublish` (826, 841) — single-flight per form (a second publish call while one is in flight is a no-op, not a double-submit); only ever claims an `imageId` it holds a verified receipt for; maps a few known server error strings to friendly copy (`PUBLISH_FAILURES`, line 279) and falls back to a generic message otherwise.

## Related Entities

- [[Screenshot and Flyer Extraction]] — the pipeline this class drives end-to-end.
- [[AI Review Gate]] — enforced via `lib/dealDraft.ts#validateForPublish`, called before `runPublish` commits.

## Sources

- [[Screenshot and Flyer Extraction]]
