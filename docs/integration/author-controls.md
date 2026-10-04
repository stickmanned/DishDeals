# Canonical author edit/delete controls (T-10B)

## What is bound
- **Detail page** (`components/deals/CanonicalDealDetails.tsx`): the Edit link and Delete button appear only when `canEditDeal(me, deal)` is true, i.e. the real `users.me().userId` equals the canonical `deals.get().authorId`. Display names are never used; signed-out, still-loading, profile-less users and duplicate author names get no controls. The backend still authorizes every write independently.
- **Delete**: opens the existing `components/frontend/Dialog` with an explicit destructive confirmation. The real `deals.remove` runs via `submitDealDelete`; the page navigates to `/map` only after the server confirms. A rejection shows a generic error, keeps the deal on screen and never fakes success. Controls are disabled while pending.
- **Edit route** `/deal/[id]/edit` (`app/deal/[id]/edit/page.tsx` -> `components/deals/CanonicalDealEdit.tsx`): unconfigured backend, malformed id (no query/mutation is issued), query failure (retry boundary reused from the detail page), not found, signed-out (sign-in link with `next`), non-author and profile-less states are all handled. Demo ids show a "preview deals can't be edited" notice.
- **Form**: shared `DealReviewForm` + `DealLocationPicker`, Harry classes, no new styling.

## Edit semantics (`lib/dealEdit.ts`)
- `initDraftFromSavedDeal`: every saved field starts reviewed (this is the author's own persisted data, not model predictions); absent optionals are reviewed omissions; persisted lat/lng is a confirmed location. A corrupt weekday or coordinate is left unreviewed/unplaced instead of guessed.
- Restaurant/address edits invalidate the saved pin through the shared reducer; a map proposal (`onInvalidate`) clears it; save needs an explicit Confirm.
- `buildUpdateArgs`: reuses canonical `buildPublishFields`, then the backend's own pure `validatePublishFields` as preflight (e.g. start and end times together). `deals.update` is a full replacement, so cleared optionals are omitted (never null). The saved `imageId` and `sourceUrl` are sent back unchanged, so an unchanged save keeps them; the UI can never claim a new image id. Author and vote counts are never sent.
- `submitDealUpdate`: resolves only after server confirmation; rejection -> generic message, all local edits (including partial price text, held in the shared form) are kept. On success the page navigates to the deal.
- The server copy is captured once per deal as the baseline. A different server copy raises a warning with an explicit "Discard my edits and load the latest" choice; reactive updates never overwrite user input (own saves are recognized and don't warn).
- Geocoding: `CanonicalDealEdit` takes an optional injected `search` callback; without it the picker honestly says search is unavailable and the map proposal still works with no guessed coordinates. Northstar binds the real action later.

## Known limits
- The shared form's submit button reads "Publish Deal" and its heading "Review Deal Draft" (shared form is out of scope); a note above the form explains it saves the edit. Human polish can relabel it.
- Image and source link are not editable here by design.
- Deleting a deal with more votes than a single transaction can remove is refused by the backend and surfaces as the generic delete error.
- Real rendering, cross-device and author-vs-other-account iPhone checks have not been run.
