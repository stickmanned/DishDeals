---
title: "Screenshot and Flyer Extraction"
type: concept
tags: [extraction, gemini, image, recording]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/extract.ts", "convex/dealImage.ts", "convex/dealUploads.ts", "lib/extractCore.ts", "lib/imageDraftFlow.ts"]
---

# Screenshot and Flyer Extraction

## Overview

The third extraction pipeline — a generic "feed it 1–8 images (+ optional caption/text)" path used for screenshots, flyer photos, and (via frame extraction) screen recordings of a Reel. It is independent of [[Reel Ingestion Workflow]]'s video pipeline and [[Teammate Workflow Pipeline]]'s text/URL pipeline, and is what the live canonical post flow (`components/deals/CanonicalPost.tsx`) actually uses for non-link sources.

## How It Works

1. **Upload**: the browser uploads each image to `POST /deal-image` (`convex/dealImage.ts`), an authenticated, CORS-gated, capped HTTP endpoint analogous to `/reel-source`. The server stores the file and registers it in `dealUploads` (`convex/dealUploads.ts#register`, capped at `MAX_PENDING_UPLOADS` per owner) — a client never supplies an existing storage id directly.
2. **Extract**: `convex/extract.ts#extractDeal` (public action) double-checks ownership (`internal.dealUploads.checkOwned`, before *and* after reading bytes — a file can expire mid-read), reclassifies each image's real format from bytes (`lib/dealImageUpload.ts#classifyUploadImage`, never trusting the stored label), and calls `lib/extractCore.ts#extractDealCore` — a pure, Convex-free Gemini-calling core (primary model → primary retry → fallback model, `lib/extractCore.ts:508`).
3. The response envelope is never a bare deal list: `{result: DealResult, manualReview: [...], requiresBlockingReview, model}` (`convex/extract.ts:21`). CAD-price evidence is specifically re-verified (`cadEvidenceProblem`, `extractCore.ts:183`) — a price only becomes canonical `priceCad` if its quote is found verbatim in the supplied text **and** names CAD.
4. **Draft adaptation**: `lib/extractionDraft.ts#validateExtractOutcome` re-validates the whole envelope strictly (exact keys, re-parsed `DealResult`, blocking-flag contract per manual-review code) before `extractOutcomeToDrafts`/`applyOutcomeToDraft` turn it into one or more `lib/dealDraft.ts` `DealDraft` objects — independent drafts per extracted offer, never sharing mutable state.
5. **Controller**: `lib/imageDraftFlow.ts`'s `ImageDraftFlow` class is the single state machine behind the whole post flow: `selectFile`/`selectRecording` → `analyze` (upload-once-per-file, extract, generation-staleness-checked) → `applyOffer` (deliberate add/replace into the form, guarded against losing in-progress edits) → `publish` (single-flight, only claims an `imageId` it holds a verified upload receipt for — an `OwnedStorageId` branded type, `imageDraftFlow.ts:63`).
6. **Recording path**: a screen recording is reduced to exactly 4 JPEG frames client-side (`lib/image.ts#grabFrames`, `lib/recordingFrameFlow.ts#prepareRecordingFrames`) and fed into the same flow as 4 "images" — audio is explicitly **not** analyzed here (`RECORDING_COPY`, `recordingFrameFlow.ts:77`); that's the video pipeline's job.
7. **Demo-cache shortcut**: before calling the live model, `ImageDraftFlow.lookupCache` (`imageDraftFlow.ts:632`) can look up a previously-captured fixture by content hash — see [[Demo Cache]].

## Where It Lives

- `convex/extract.ts` — the public action and its response envelope shape.
- `convex/dealImage.ts`, `convex/dealUploads.ts` — upload endpoint and private registry (ownership, quota, hourly cleanup).
- `lib/dealImageUpload.ts` — shared constants/validators between the endpoint and the browser upload call (`uploadDealImage`), magic-byte `classifyUploadImage`.
- `lib/extractCore.ts` — the headless model-calling engine: `LIMITS`, `ExtractError`, `ModelDeal`/`ModelResult` Zod schemas, `validateModelOutput`, `callModel`, `extractDealCore`.
- `lib/prompt.ts` — `SYSTEM_PROMPT` and `RESPONSE_JSON_SCHEMA` (strict `additionalProperties: false`), `buildContextText` (wraps untrusted caption/text as JSON so it can't masquerade as instructions).
- `lib/extractionDraft.ts` — envelope-to-draft adapter.
- `lib/dealDraft.ts` — the draft state machine (`dealDraftReducer`, `validateForPublish`, `buildPublishFields`) shared with [[Canonical Deal Publishing]]'s edit flow.
- `lib/image.ts` — browser canvas resize (`resizeImage`) and video-frame grabbing (`grabFrames`).
- `lib/recordingFrameFlow.ts` — the recording-to-frames adapter.
- `lib/imageDraftFlow.ts` — the `ImageDraftFlow` controller.
- `lib/dealReviewForm.ts` — pure view-model helpers for the review form (`parsePriceInput`, `transitionWeekdaySelection`, `getDraftPublishReadiness`).
- `components/deals/CanonicalPost.tsx`, `DealReviewForm.tsx`, `RecordingFrames.tsx` — the UI.

## Key Details

- Config gate: `IMAGE_PROVIDER_USAGE_AUTHORIZED` + `GEMINI_API_KEY` + `GEMINI_IMAGE_MODEL` must all be set — see [[Environment Gated Providers]].
- Manual-review codes (`FUTURE_START`, `UNSUPPORTED_CONSTRAINT`, `CURRENCY_UNVERIFIED`) and their blocking semantics are shared with the Reel pipeline's constraint model conceptually, though the two are separate type definitions — see [[AI Review Gate]].
- No URL is ever fetched for this path — `provenanceUrl` (if provided) is provenance metadata only; `extractCore.ts` never sends it to the model as something to retrieve.

## Sources

- [[Source - Project Process Docs]]
