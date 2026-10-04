# Reel review: geocode and community-publish bindings (N-FORM-C)

Frontend bindings only. No backend, schema, generated, map, shared-form, native or post change. Nothing here ran against a deployment, a provider, a browser or a phone.

## What is bound
In the private Reel result, `DraftEditor` now gives `CanonicalReelReview`:
- **`onPublish`**: the real `api.deals.create` mutation, through `createPublishHandler` (`lib/reels/publish.ts`).
- **`search`**: the real `api.geocode.geocode({query})` action, through `createSearch`, passed to the existing `DealLocationPicker`. It is called only when the person presses the picker's Find button (no autocomplete, no debounce, no automatic query). Candidates are re-checked (at most 5, finite in-range coordinates, non-blank labels); an empty list stays empty, and a pin is never guessed. Map clicks, drags and candidate selection only propose a pin; every proposal invalidates the old confirmation, and nothing is accepted without the explicit confirm.

## Publish path and gates
1. The form's canonical gate runs on the **live draft for that offer** (found by key): `buildPublishFields` requires every field reviewed, no open or hard-blocking issues (a typed `FUTURE_START` blocks even if marked resolved; an unresolved `UNSUPPORTED_CONSTRAINT` or legacy blocking issue blocks), and a confirmed location. The form's own uncommitted price text is checked first by the form.
2. Review-level preconditions (`publishPreconditionError`): publish is available, the offer is not already published, the saved-draft version has not changed elsewhere (Load latest / Keep my edits first), no publish is in flight, and the offer still exists.
3. Account gate (`publishGateMessage`) from the real session and `users.me`: signed in, session loaded, profile exists. There is no preview or local identity.
4. Single flight (`PublishGuard`): a double click or a second offer while one publish is pending makes no second `create`.
5. `toCreateArgs` builds exactly the `deals.create` arguments: no author, counts or confidence; absent or null optionals are omitted; `sourceUrl` is the owned private item's link; the uploaded video id is never an `imageId`, and an image id is passed only if it has a storage-id shape. The backend then re-authorizes (author with profile) and re-validates independently, including its own `imageId` ownership registry.
6. Success needs a genuine created deal id (`receiptFor`); only then does the offer show **Published to the community** with `Open the deal` (`/deal/<id>`) and `See it on the map` (`/map?deal=<id>`). Nothing navigates before that receipt. A published offer cannot be published again from the same review.
7. Failure keeps every input. Gate and binding messages are shown as written; any backend failure becomes one generic message, so no server detail leaks. A publish never edits or deletes the private Reel save, never changes the saved-draft version, and a private save, link receipt or model suggestion is never presented as a community publish.

## Per-offer forms stay mounted
`CanonicalReelReview` keeps one `DealReviewForm` per offer, keyed by a stable per-offer key (`offerListFrom`, `appendOffers`, `removeOffer`, `updateOffer` in `lib/reels/publish.ts`). Only the active offer is visible (`hidden`, `inert`, `aria-hidden`), so a hidden offer takes no focus. Switching offers, adding an offer, removing a different offer, a retry/status change and appending model offers no longer remount existing forms, so partially typed prices and resolution notes (and their errors) stay with their own offer. Handlers act on the offer's key and read the latest list, not a stale active index. Forms are re-created only on deliberate actions that replace content: Load latest saved draft and "Use model suggestions" in replace mode; both messages now say typing was replaced. Appended model offers are a separate, unreviewed set that never alters existing offers.

## Unchanged
Private save, optimistic version guards, source evidence, the separate model suggestion, and the typed constraint notes remain exactly as before. `DraftReview` (the layout-preview export) has no publish or search, so the fixture stays synthetic and cannot save or publish.

## Pending
Live `deals.create`/`geocode` behavior on a deployment, a real provider answer, the rendered map and Find button in a browser or WKWebView, signing/install/native, and the phone. The tests render markup with `react-dom/server` and exercise the pure helpers; they do not execute a browser, so mounted-form price preservation is guaranteed by construction (stable keys, no unmount) and by the markup/key tests, not by a DOM interaction test.
