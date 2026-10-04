# Owned image upload and canonical extraction (T-07B)

Backend only. Form, picker, native and map integration are separate. Nothing here ran against a deployment or a real model.

## Upload: `deals.generateUploadUrl` and `POST /deal-image`
`deals.generateUploadUrl()` (signed in) returns `${CONVEX_SITE_URL}/deal-image`. This is not a storage upload URL: the client POSTs the raw image to it with
- `Authorization: Bearer <session token>` (the user is derived from it on the server),
- the exact configured website `Origin` (`REEL_WEB_ORIGIN`, https; http only for an explicitly configured localhost origin; anything else fails closed: preflight 403, upload 503),
- `Content-Type` of `image/jpeg`, `image/png` or `image/webp`.

The route accepts no query parameters and fetches no URL. `Content-Length` is optional (browsers cannot set it); when present it must be a plain integer of 16 bytes to 5 MiB and equal the streamed bytes. The body is read with a hard 5 MiB cap and a 60 s deadline (a stall gives 408, a stream error 400, over-cap 413; the reader is cancelled without awaiting it). The leading bytes must match the declared type (JPEG, full PNG signature, WebP `RIFF…WEBP`). HEIC/HEIF are rejected until a conversion/decode path exists. A signature is evidence of the file format, not proof that the image decodes. Only then is the file stored and a `dealUploads` row created by the server: owner = the caller, `expiresAt` = now + 24 h, `published` = false. Registration is capped: an owner may hold at most 20 active uploads (unexpired and unpublished). The count is an indexed range read (`by_owner_pending` on `[ownerId, published, expiresAt]`, at most 21 rows) inside the registering transaction, so concurrent uploads serialize and cannot exceed it; published and expired rows are exempt and never scanned. A refused upload deletes the file just stored and answers 429 with CORS headers. The response is `{storageId}` only after the registry row exists; if registration fails the file is deleted. Every response after the origin check carries CORS headers (single origin, no wildcard, no credentials flag); an unexpected failure answers 500 with no logging. No public function can claim or register a storage id.

## Registry lifecycle
`deals.create`/`update` claim an owned image through the shared `requireOwnedImage` check (one row, caller-owned, unexpired or already published, 1 byte to 5 MiB, allowed content type when recorded), mark the row `published` and set `expiresAt` to `Number.MAX_SAFE_INTEGER` so published rows never expire and leave the cleanup scan.

`crons.ts` runs `internal.dealUploads.cleanupExpired` hourly. Each run examines at most 100 expired rows (oldest first): unpublished rows with no referencing deal are deleted together with their file (unless another registry row for the same file is published); published rows, and rows a saved deal references, are never deleted and are marked published/non-expiring so every examined row either disappears or leaves the scan. A file is kept while ANY other registry row for it remains (published or not, expired or live); it is deleted only together with the last row. A full batch schedules one immediate continuation. There was no other cron to preserve.

Storage is therefore bounded per owner by the quota (20 files of at most 5 MiB each, 24 h) and globally by the hourly cleanup.

## `extract.extractDeal` (public action, Node)
Arguments: `imageIds` (1 to 8 different `_storage` ids), optional `caption`, `text`, `provenanceUrl`, `publishedAt` (additive context; the URL is provenance only, never fetched and not even sent to the model). Order: sign-in; argument bounds; the server gate and configuration (`IMAGE_PROVIDER_USAGE_AUTHORIZED=true`, `GEMINI_API_KEY`, explicit `GEMINI_IMAGE_MODEL`; optional `GEMINI_IMAGE_FALLBACK_MODEL`, otherwise the primary is retried); private owner validation of every id through the registry; only then are the image bytes read, the real format is taken from the bytes, ownership is rechecked, and the reviewed `extractDealCore` runs. No model default is used and the legacy reel gates do not enable it.

Return value, an owner-approved revision of the plan's bare `DealResult`: `{result: DealResult, manualReview, requiresBlockingReview, model}`. `manualReview` carries `FUTURE_START`, `UNSUPPORTED_CONSTRAINT` (blocking) and `CURRENCY_UNVERIFIED` (non-blocking, with `originalAmount`) by deal index; the form must carry blocking notes and must never store `result` alone. Every field is a suggestion for explicit user acceptance; the four confidence values are the model's own self-assessments, never defaults. Nothing is written to `deals` or the registry by extraction. Failures are a `ConvexError` whose data is exactly `{code, message, retryable}` (codes from the core plus `NOT_SIGNED_IN`, `INVALID_INPUT`, `CONFIGURATION`, `IMAGE_NOT_AVAILABLE`, `INVALID_IMAGE`, `EXTRACTION_FAILED`); keys, tokens, provider bodies and caption text never appear.

## Provider facts (official docs, no live call)
Google lists `gemini-3.8-flash` and `gemini-3.5-flash-lite` as current models and supports PNG/JPEG/WebP/HEIC/HEIF inline images within a 20 MB request limit; the app still requires the models to be configured explicitly and makes no quota claim.

## Pending
Live Gemini output and quality on real screenshots/flyers, latency, the browser picker and form integration, native/phone, `convex dev`/codegen (the module registrations in `_generated/api.d.ts` and `server.d.ts` were added by hand), and any deployment.
