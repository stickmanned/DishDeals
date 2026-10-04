# Canonical screenshot/flyer form and publish (T-07C)

`/post` is now the canonical live flow: real auth, owned image upload, `extract.extractDeal`, the shared `DealReviewForm` and `DealLocationPicker`, and `deals.create`. Nothing here ran in a browser, on a phone, against a deployment, or against a real model. Local checks use injected synthetic fakes only.

## Files
- `lib/imageDraftFlow.ts`: pure controller (`ImageDraftFlow`) plus file/JPEG helpers. No React, Convex, fetch or window access at import time; every backend call is injected (`FlowDeps`).
- `components/deals/CanonicalPost.tsx`: wires the real hooks into the controller and renders the page with existing Harry classes. Also exports `PreviewPost` and `LegacyPostLinkNotice`.
- `app/post/page.tsx`: route switch (below).
- `tests/import/imageDraftFlow.test.ts`: replay tests against fakes.

## Routes
- `/post`: canonical flow. Signed out: sign-in link. Signed in without a profile (`users.me` is null): link to `/profile`; no anonymous account and no fake profile. Without `NEXT_PUBLIC_CONVEX_URL` the page says posting is unavailable and nothing is saved.
- `/post?preview=1`: the existing read-only Harry `Post`, behind a visible "Preview only" note. It renders only when the app is already in example mode; in a live-connected build it says the preview is not active. It never proves that posting works.
- `/post?edit=<id>`: honest notice (editing moves to its own page), optional link to `/deal/<id>` when the id is well-formed. It never opens an editor, and never a preview edit of a saved deal.
- `/post?job=<id>`: honest notice that import jobs are retired; no job panel.
- Videos: the page links to `/reels`; there is no second resolver.

## Controller rules
**Source versus applied draft.** The selected file and its context (caption, text, source link, posted date) are a source selection. A model result becomes an offer and is applied only by an explicit choice: "Add as a new deal" or "Use for Deal N" (replace). Replacing a form the user has edited needs a second explicit confirmation (`confirm_required` otherwise). Nothing is merged: the whole draft, with its review notes, provenance and image, comes from one offer. Up to 10 forms and 5 offers are kept.

**The image belongs to the draft.** A draft's `imageId` is the storage id from the upload receipt that produced its offer. Picking, changing or clearing the source does not change any applied draft, and no other path can set it (`SET_IMAGE_ID` is refused through `dispatch`). "Remove image" detaches it from one form on request. `publish` refuses any image id that no real upload receipt produced; the `Id<"_storage">` cast in the component adapter happens only after that.

**Generations.** Every analysis run has a generation. Cancel, a new valid file, retry or unmount invalidates it; a stale success or failure is ignored (the action itself cannot be aborted, so it is simply ignored). A finished upload is kept for the same file, so a retry after a failed or canceled analysis does not upload again. If the server says the image is unavailable the receipt is forgotten and the retry uploads afresh. An invalid pick (HEIC, unsupported type, empty, over 20 MB) keeps the previous selection and says why.

**Failures never discard work.** Photo, context and every form edit survive upload errors, analysis errors, malformed results, cancel, late results and publish rejections. Server error text is never shown: analysis errors map by code to fixed copy; publish shows a `ConvexError` string (for example "Create your profile before publishing.") or a generic line.

**Envelope.** The result goes through `validateExtractOutcome` (exact envelope keys, strict deal and confidence schemas, consistent `requiresBlockingReview`) and `extractOutcomeToDrafts`. The packet's name `extractionDraftToDealDrafts` does not exist; `extractOutcomeToDrafts` is the real export. The four confidence values are the model's own; absent values are not invented. Every sidecar note (FUTURE_START, UNSUPPORTED_CONSTRAINT, CURRENCY_UNVERIFIED with `originalAmount`) is carried into the draft's review issues, so the common form's blockers apply.

**Publish.** `publish(formKey)` runs the canonical `buildPublishFields` gate (every field reviewed or omission-confirmed, no pending suggestions, resolved notes, confirmed pin), then calls `deals.create` once. Concurrent clicks share the in-flight promise; a saved form is never published again; edits are ignored while a request is out. A form is "saved" only when the mutation returns a well-formed id; any other result is a failure and the form stays editable. The payload has no author or count fields and no undefined keys. A manual deal needs no image. On success the page navigates to `/deal/<id>` (an existing route that subscribes to the saved deal) when no other form holds unsaved edits; otherwise it stays and shows links. `/map?deal=<id>` is not used because the map route does not read that parameter.

**Forms stay mounted.** All forms render (inactive ones hidden), so partial price text and other local state survive tab switches, retries and late results. A replace remounts that one form through an epoch.

**Image preparation.** `resizeImage` (canvas, max 1280 px wide, JPEG) then `boundedJpegUpload` (real JPEG, 1 byte to 5 MiB, named `deal.jpg`). The packet's `boundedJPEGBlob` does not exist as an export; this is its equivalent. The upload is `deals.generateUploadUrl` then `uploadDealImage` with the session token from `fetchAccessToken`.

## Location
The real `DealLocationPicker` is used. Editing the restaurant or address clears the pin (shared reducer), moving the marker invalidates it, and publishing needs an explicit confirmation. `CanonicalPost` accepts an optional typed `searchLocation` callback; until the reviewed geocode action (T08GB) is bound the picker shows its explicit "address search is unavailable" state. No coordinates are invented and there is no numeric coordinate form.

## Pending
Rendered UI and WKWebView checks, William's iPhone, a real screenshot or flyer analyzed in under 15 seconds, live model quality and latency, the geocode binding, a dedicated author edit route, and `/map?deal=` support if wanted.
