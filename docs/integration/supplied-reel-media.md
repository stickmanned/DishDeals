# Supplied Reel recording (N-SOURCE-A)

The selected source path for a shared Reel is: the native app receives the Instagram **link** (existing extension, unchanged), then the user explicitly **attaches their own recording of that same Reel** (and optionally its caption and posting date). Nothing downloads or resolves the Instagram URL. A link on its own is saved privately and is never analyzed.

## Flow and state
1. `reels.submit` (unchanged API and return shape) saves the link as a private item with status `queued`. It no longer starts any workflow, so no resolver runs for new items.
2. In the private result view the user picks an MP4 or QuickTime (.mov) recording from Photos or Files. The browser checks type and size (at most 12 MiB), reads the real duration from the file's own metadata (object URL released, 10 s timeout) and requires 1 to 180 seconds. The file, caption and date stay in the form on every cancel or error.
3. The browser posts the raw file to `POST {NEXT_PUBLIC_CONVEX_SITE_URL}/reel-source?itemId=…&duration=…` with `Authorization: Bearer <session token>`, `Content-Type: video/mp4` or `video/quicktime`, and, when there is any, an `X-Reel-Meta` header. Only the item id and duration are in the URL; the caption and posting date are content, so they travel in `X-Reel-Meta` (base64url of `{caption?, publishedAt?}`, at most 4,096 characters; caption at most 2,200 characters and 2,400 UTF-8 bytes) and never appear in URL logs. A caption or date in the query is rejected. The browser applies one finite deadline (default 120 s, at most 600 s) to the request, the response headers and the receipt body, and honors a caller abort signal; a stalled or hung upload is aborted and reported as `timeout` or `aborted`, keeping the user's file, caption and date.
4. The route (`convex/reelSource.ts`) checks, in order and before storing: configured origin, Bearer identity (user derived on the server), strict query and metadata header, declared type, the item belongs to the caller and is unexpired. `Content-Length` is optional (browsers cannot set it and proxy forwarding is unproven): when present it must be a plain integer of 16 to 12 MiB and the streamed bytes must equal it; when absent the cap applies to the streamed bytes. The body is read with a hard 12 MiB cap and a 60 s total deadline (a stalled upload gets 408 and the reader is cancelled; a stream that errors gets 400). Then it verifies the ISO-BMFF `ftyp` signature matches the declared type and only then calls `ctx.storage.store`, so storage ownership comes from the server, not from a client-supplied `_storage` id. Every response after the origin check, including 4xx/5xx, carries the CORS headers; an unexpected exception removes any unassociated upload and answers 500 without logging.
5. `internal.reels.attachSupplied` re-checks owner, expiry and the **same generation** atomically, applies the per-user rate limit (shared 10 per hour with submit/retry), stops the old workflow, deletes superseded media, advances the generation (invalidating late work), records `sourceKind: "supplied"`, `mediaMime`, `mediaBytes`, `duration`, `caption`, `publishedAt` and enqueues the workflow. On any rejection the route deletes the just-stored upload (no orphan) and answers 404/409/429.
6. The success body `{status:"attached", generation}` is the only receipt the UI shows; a bare 2xx is not accepted.
7. `reelWorkflow.process`: a supplied item goes straight to `reelActions.extract`; **retrieval is never called** for it. Legacy items keep the old gated resolver.
8. `reelActions.extract` for supplied items needs only `REEL_MEDIA_USAGE_AUTHORIZED=true`, `GEMINI_API_KEY` and an explicit `GEMINI_REEL_MODEL` (no default model, no resolver key). Otherwise the item becomes `failed` (`CONFIGURATION`) and the recording is kept. The same strict evidence/schema contract applies; no confidence scores are requested or invented.

## Cancelling a workflow
Replacing media, retrying and deleting stop the previous workflow only if its status is `inProgress`. A completed, failed or already-canceled workflow (or one the component no longer has: "Workflow not found:") is skipped. Any other failure, including an invalid workflow id or a cancel error on a running workflow, propagates and aborts the mutation unchanged.

## Retention
The recording is kept across `fail` and `retry` while the private item is within its retention. It is deleted on success, no-deal, user deletion, expiry, and when a replacement recording supersedes it. N-SHARE-DRAFT guarantees are unchanged: a user-edited draft is never overwritten by a later extraction, stale saves are rejected, and attaching a recording does not alter the draft or its revision.

## Server configuration (set by the deployment owner; this work sets none)
- `REEL_WEB_ORIGIN`: exact https origin of the website (no path, no trailing slash). `http://localhost:<port>` or `http://127.0.0.1:<port>` is accepted only when explicitly configured. Anything else fails closed (preflight 403, upload 503). Responses echo that single origin and allow only `Authorization, Content-Type, X-Reel-Meta`; no wildcard, no credentials flag.
- `REEL_MEDIA_USAGE_AUTHORIZED`: `"true"` only after Gemini analysis of supplied recordings is authorized. Separate from the legacy `REEL_PROVIDER_USAGE_AUTHORIZED`, which stays off.
- `GEMINI_API_KEY`, `GEMINI_REEL_MODEL`: server-only; the model must be named explicitly.
- Web build: `NEXT_PUBLIC_CONVEX_SITE_URL` (the deployment's `https://<name>.convex.site` origin, never guessed) and the existing `NEXT_PUBLIC_CONVEX_URL`. See `.env.example`.

## Provider facts used (official docs fetched October 2026; no live call)
- Gemini video docs list `video/mp4` and `video/mov` among supported MIME types. A QuickTime upload is therefore declared to the provider as `video/mov`. Total inline request size is 20 MB, so the 12 MiB cap (about 16 MiB as base64) fits; the docs recommend inline video of short duration, so very long recordings may be slower or fail.
- Convex HTTP actions: identity via `Authorization: Bearer`, CORS must be handled explicitly with an `OPTIONS` route, 20 MB request limit, served from `.convex.site`.

## Honest limits
- Duration is **browser-supplied metadata**, not independently verified by the server. The signature check rejects wrong containers; it does not prove the file decodes or matches the Reel.
- The recording is the user's own capture; its attribution to the linked Reel is the user's statement, kept as provenance only. The original link is sent to the model as context labeled "provenance only, never fetch".
- Relative dates are resolved only against a publication date the user supplied; leaving it blank keeps them unknown.
- No manual-edit surface exists for an item that has no draft yet; if extraction fails the item shows the failure and the recording stays for retry. A common manual form belongs to the separate form ticket.

## Not verified
Real WKWebView file selection from Photos/Files, a real uploaded recording, deployed CORS behavior, live Gemini output, the Swift extension, and the iPhone are all untested. Tests use synthetic bytes, synthetic identities, a convex-test mock backend and a labeled mocked model SDK.
