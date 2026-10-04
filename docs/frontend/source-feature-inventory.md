# DishDeals iOS frontend feature inventory

This document lists the screens, buttons, inputs, display elements, and states the iOS frontend needs. It is an implementation handoff, not evidence that these features are already connected or deployed.

## 1. Scope and source of truth

The user's current target is an **iOS app**. The repository's original specification describes a Next.js web app with Android installation/sharing. Preserve its product and data contracts, but translate routes into iOS screens and navigation. No native iOS project or chosen iOS framework exists in the inspected sources. The React web map components are references for behavior, not ready-made native screens.

Inspected source snapshots:

- Main checkout: `d69529d495fbc76b80009fbfc78af6ed96fe5e04`.
- Locally available teammate ref: `origin/feature/dishdeals-initial-implementation` at `e3a39cc3398a0e0866e5dbe4e606f7e06b2ed2ca`. This is the locally cached snapshot; newer unpublished or unfetched teammate work is not represented.
- Product contract: [StormHacks project plan](StormHacks%20Project%20Plan%20Instagram%20Deal%20Saver.md), especially Scope, Pages, Data model, Backend functions, and Edge cases.
- Current ownership and reconciliation: [team integration](docs/team-integration.md), [agent workflow](docs/agent-workflow.md), [tasks manifest](docs/workflow/tasks.json), [backend integration decision](docs/decisions/0001-teammate-backend-integration.md), and T-03/T-04/T-05R packets.
- Main product code: `app/`, `components/`, `convex/schema.ts`, `convex/test.ts`, generated API/types, `lib/dealSchema.ts`, its tests, and project configuration.
- Teammate product code: `ai-workflow/src/`, `ai-workflow/convex/`, contracts, integration example, scripts and tests; `map-component/src/`, example and tests; `map-site/app/components/` and `app/lib/deals.ts`. These paths exist on the teammate ref, not on main.

Generated code, workflow tooling, template infrastructure, and generic UI primitives do not by themselves authorize new consumer features.

### What is actually available

| Area | Evidence in main | Evidence on teammate ref | Frontend implication |
| --- | --- | --- | --- |
| Backend connectivity | Public `test.ping` query and connection-test homepage | Separate workflow backend source | A connection test is not the consumer feed. |
| Data model | Auth tables, `profiles`, `deals`, `votes`; canonical extraction Zod schema | Separate `jobs`, `restaurants`, `deals`, `limits` schema | These are different contracts; do not interchange IDs or payloads. |
| Accounts | Auth package/tables; no implemented sign-in/profile functions | JWT identity configuration and owner checks; no account registration UI/API | Sign-in and profile screens need integration work. |
| Ingestion | Canonical extraction shape; no extraction action | Text/image/public-URL processing, job submission/status/retry, deduplication and limits | Submission and job-status screens have source-backed endpoints on the teammate branch only. |
| Review/publication | Planned editable card and confirmed coordinates | Owner approves/rejects restaurant candidates; certain results publish automatically | Resolve publication behavior before wiring the final post flow. |
| Feed/maps | No deal queries or feed UI | Public published-deal query; React map library and read-only explorer prototype | Map behavior is reusable as a reference; canonical feed and native adaptation remain work. |
| Editing/votes/tipping | Fields and planned API names only | No matching edit/delete/vote/profile/tip functions | Show these as planned features, not available backend capabilities. |

**Labels used below:** **Core** = canonical product requirement; **Workflow** = UI implied by teammate ingestion backend; **Prototype** = behavior in the teammate web explorer/map; **Proposed** = navigation or usability choice introduced by this inventory; **Optional** = parallel/stretch work that should not gate the core app.

## 2. Screen map and shared navigation

Proposed primary navigation: **Discover**, **Post**, and **Profile**. A **Map** view is optional because a full-screen discovery map is stretch scope in the canonical plan, even though a teammate prototype exists.

| Screen or sheet | Entry point | Access | Basis |
| --- | --- | --- | --- |
| Discover feed | App launch / Discover | Public | Core, T-09 |
| Filters | Discover / optional Map | Public | Core price filter; Prototype extras |
| Deal details | Deal card or map marker | Public; Vote/Tip require sign-in | Core, T-10/T-11 |
| Sign in / Create account | Profile or protected action | Public | Core, T-03 |
| Complete/edit profile | After registration or Profile | Signed in | Core, T-03 |
| Add deal: source selection | Post | Signed in | Core, T-07/T-14; Workflow |
| Processing and submission results | Successful source submission | Submission owner | Workflow |
| Review/edit extracted deal | Extraction result | Signed in / submission owner | Core review; Workflow candidate review |
| Confirm restaurant/location | Review or edit flow | Signed in / submission owner | Core, human map lane |
| Publication result | Successful publish/approve | Owner | Core + Proposed recovery/navigation |
| Edit deal / Delete confirmation | Own deal details or My posts | Author only | Core, T-10 |
| Profile / My posts | Profile | Signed in | Core |
| My submissions | Profile or active processing result | Owner | Proposed convenience; listing endpoint missing |
| Tip sheet | Deal details with poster wallet | Signed in | Optional, T-15 |
| Explore map and selected-deal sheet | Optional Map view | Public | Prototype; canonical T-21 stretch |

Shared buttons and elements:

- Clearly labeled tab/navigation items, screen titles, **Back**, and sheet **Close/Cancel**.
- **Sign in** gate for Post, Vote, and Tip; return to the original screen/action after authentication.
- Profile completion gate before canonical `deals.create`; preserve the draft.
- **Discard changes / Keep editing** confirmation for dirty forms. Draft preservation within an active flow is proposed client behavior; server draft storage is not implemented.
- Inline success messages, field errors, loading indicators, disabled submitting buttons, and retry controls.
- Connectivity/reconnecting message; existing data may remain visible with a stale-data indication. Cached extraction fixtures do not establish offline posting or a working offline feed.
- Accessibility labels, visible selected states, readable text at larger sizes, logical input order, and descriptive image/map alternatives. Do not communicate confidence, validity, or selection by color alone.
- Keep credentials, raw provider responses, developer stack traces, and configuration details out of consumer screens.

## 3. Discover feed

**Purpose:** Answer “What can I eat cheaply nearby right now?” without requiring an account.

### Buttons and interactive elements

| Control | Action | Dependency |
| --- | --- | --- |
| Price chips: **Any / Under $5 / Under $10 / Under $15** | Apply canonical price filter | Client logic, T-09 |
| **Filters** | Open filter sheet | Proposed layout |
| **Use my location** | Request location when the user asks for nearby results | iOS location integration; human map owner |
| **Continue without location** | Show recent deals and hide distance | Planned `deals.listRecent` |
| Deal card | Open Deal details | Planned `deals.get` |
| **Still on** / **Expired** on each card | Cast/change the viewer's vote; sign-in gate if needed | Planned `votes.cast`, T-11 |
| **Post a deal** | Open source selection or sign-in | Core |
| **Clear filters** in an empty result | Restore default filter | Client behavior |
| **Try again** after a query failure | Retry connection/query | Integration behavior |
| Optional **Map** switch | Show the same filtered deals on a map | T-21 stretch / native map work |

### Deal card elements

- Restaurant name: `restaurant`.
- Deal summary: `dealText`.
- Image thumbnail from `imageUrl`, with a fallback when no image exists.
- CAD price from `priceCad`, or **Price varies**.
- Validity badge: **Valid now**, **Later today**, **Not today**, **Expired**, or **Validity unknown**, mapped from `validNow`.
- Time-left badge only when known; refresh as time passes, including when the app returns to the foreground.
- Distance in km from `distanceKm`; hide it when location is unavailable.
- Address, if available; do not invent one.
- Poster name from `authorName`.
- Still-on count from `stillOnCount`, expired count from `expiredCount`, and the viewer's vote when the query contract supplies it.
- Reduced emphasis for deals not available now without making them unreadable.
- Clearly identified sample data when running a demo.

### Behavior and states

- Subscribe to live data. The canonical acceptance target is a new post appearing on another device within 2 seconds; this has not been measured here.
- Compute validity and time remaining in the iOS client, using America/Vancouver rather than the device's current timezone.
- Sort valid-now deals first, then nearest when location is known; use recent data when it is not. Tie-breaking and the order of other validity statuses need the T-04/T-09 decision.
- Unknown prices remain visible under every canonical price filter. Do not inherit the prototype's exclusion of unknown prices.
- Show skeleton/loading content, no published deals, no matching deals, denied/unavailable location, and query failure/reconnecting states.
- Explain **No expiry listed** where applicable. The plan puts these below confirmed valid-now deals; final no-expiry/no-hours semantics belong to T-04.
- Vote counts are community feedback. An expired vote must not be presented as automatically deleting a deal or overriding its schedule.

**Readiness:** `deals.listNearby({ lat, lng, maxKm })` and `deals.listRecent({ limit })` are planned on main. Teammate `deals.listForMap` returns a different shape and does not supply poster names, images, distances, or votes.

## 4. Filters sheet

**Core inputs:**

- Single selection: **Any**, **Under $5**, **Under $10**, **Under $15**.
- **Apply**, **Reset**, and **Close** buttons. Immediate application is also a valid layout choice, but use one consistent behavior.
- Active-filter indicator and matching-result count.

**Prototype controls to consider only with appropriate data:**

| Input/control | Prototype behavior | Contract caveat |
| --- | --- | --- |
| Search text + **Clear search** | Search restaurant, offer, address, city, cuisine locally | Canonical text fields support some local search; no server search endpoint. |
| Region picker | All regions / Vancouver / Richmond / Burnaby | Canonical deal has no structured city field; do not guess from an address. |
| Cuisine chips | All / Japanese / Chinese / Coffee / Western | Cuisine is prototype data, absent from both canonical extraction and workflow deal contracts. |
| Sort picker | Default / Price ascending / Discount descending | Discount is absent from canonical schema; default prototype order does not implement valid-now/nearest. |
| Budget toggle | Known CAD prices **at or below $15** | Differs from canonical “Under” thresholds and unknown-price inclusion. |
| **Only in map area** toggle | Filter results by visible bounds | Optional map feature, human map owner. |

Do not show unsupported category/discount filters as though they work on live canonical records. A distance-radius picker is not required by the plan; `maxKm` can initially be app configuration.

## 5. Sign in / Create account

**Buttons:**

- **Sign in / Create account** mode switch.
- Primary **Sign in** or **Create account**.
- **Show/Hide password**.
- **Continue browsing / Cancel**.
- After success, **Complete profile** when needed or return to the protected action.

**Inputs:**

- Email with an email-appropriate keyboard and capitalization disabled.
- Password with secure entry.
- Optional confirmation password in create-account mode; this is client validation, not an extra backend field.

**Elements and states:**

- Concise reason for the gate, such as “Sign in to post a deal.”
- Required-field/invalid-email feedback, authentication failure, submitting state, and session-expired state.
- Preserve intended destination and draft; avoid triggering payments or publishing automatically after sign-in.
- Restore session on app relaunch using the chosen iOS auth integration; verify on a real device.

**Dependency:** Main plans Convex Auth Password provider but does not implement its functions/configuration or UI yet. The teammate workflow validates existing JWT identities and does not create accounts. Its HTTP integration token must stay in a trusted server, never in an iOS bundle. All calls sharing that token have the `integration` owner, so a server adapter needs per-user authorization.

Password reset, email verification, Apple/Google sign-in, account deletion, and anonymous fallback UI are not implemented product flows in this snapshot. Scope/provider decisions are required before exposing those buttons. The plan's anonymous fallback is a contingency, not a second mandatory account mode.

## 6. Complete profile / Edit profile

**Inputs:**

| Input | Contract | UI rule |
| --- | --- | --- |
| Display name | `displayName` | Required, 2–24 characters; show character count and inline validation. |
| Solana wallet address | `walletAddress?` | Optional; explain it receives devnet tips. Validate with the eventual wallet integration. |
| Wallet **Paste** / **Clear** | Proposed convenience | Clearing an existing wallet needs explicit API semantics. |

**Buttons:** **Save profile / Continue**, **Cancel** when editing, and optional **Skip wallet**.

**Elements/states:** Current saved values, saving/saved/error state, missing-profile prompt, and recovery that keeps the post draft intact.

**Dependency:** Planned `users.me` and `users.upsertProfile({ displayName, walletAddress? })`. Do not treat omission of a wallet argument as proven removal behavior.

## 7. Add deal: source selection

**Purpose:** Start with user-supplied material; no Instagram scraping.

### Buttons and inputs

| Element | Behavior | Basis / availability |
| --- | --- | --- |
| **Choose screenshot/photo** | Open photo/file selection | Core; requires iOS picker and image conversion/upload. |
| **Take photo** | Capture a flyer; camera-use explanation and denial recovery | Core |
| **Choose screen recording** | Select video and preview it | Core T-14; teammate workflow accepts images, not video. |
| **Paste deal text** + multiline text box | Provide copied offer/caption text | Workflow text input; canonical caption-only submission still needs a contract decision. |
| Optional caption text box | Add source context without guessing missing facts | Core `caption?` / Workflow `source.caption` |
| Optional **Source link** field | Keep attribution, not an Instagram extraction trigger | Canonical `sourceUrl?`; Workflow provenance |
| Optional **Original post date** picker + **Date unknown** | Supply `publishedAt` only when known | Workflow-only field; absent from canonical tables/extraction arguments |
| **Replace / Remove attachment** | Change selected media | Proposed client behavior |
| **Extract deal / Submit** | Validate and submit once; disable while submitting | Core extraction or Workflow job |
| **Enter manually** | Open empty editable deal form when extraction is unavailable | Core fallback; needs canonical create endpoint |
| **Cancel** | Leave, with draft confirmation if needed | Proposed usability |

### Display elements and states

- Image/video preview, selected filename or media type, compression/upload status, and visible input errors.
- Explanation: “Upload a screenshot or photo, or paste the offer text.” Do not offer “Connect Instagram.”
- Camera/photo access denied: **Choose another source**, optional **Open Settings**, and **Cancel**.
- Unsupported format, oversized image, unreadable source, failed upload, and signed-out/session-expired recovery.
- Convert unsupported iOS image formats to a supported format; the code does not implement this conversion.
- For recording input, extract 3–4 frames in the future iOS media layer. Do not send raw video to an image-only workflow endpoint.
- Do not silently convert a non-CAD price to CAD or substitute today's date for an unknown original publication date.

**Two distinct transport contracts:**

- Canonical plan: `deals.generateUploadUrl` → upload file(s) → `extract.extractDeal({ imageIds, caption? })`; resize to the planned 1,280 px width. These functions/media helpers are not implemented on main.
- Teammate workflow: `jobs.submit({ inputJson })` accepts text or one base64 PNG/JPEG/WebP image. Text is 10–30,000 trimmed characters; image caption is at most 10,000 characters; image base64 at most 450,000 characters; HTTP body at most 600,000 bytes. No storage upload endpoint is provided in this module.
- The teammate module also accepts public HTTPS URL extraction. This is not authorization to read Instagram URLs: the canonical no-Instagram-fetch rule remains. Exclude a general URL-extraction mode from the core app until reconciled.

## 8. Processing and submission results

This screen is needed if the teammate queued workflow is used. The canonical direct action needs an extraction-loading state, but not necessarily a persistent jobs screen.

**Elements:**

- Status: **Queued**, **Processing**, **Completed**, or **Failed**.
- Indeterminate progress indicator; the backend does not report percentage progress or separate “reading image” and “finding restaurant” milestones.
- Source summary retained by the client; `jobs.get` does not return `inputJson`.
- One result card per offer, up to 10 in the teammate contract.
- Per-offer status: **Published**, **Needs review**, or **Rejected**.
- Review reasons, warning list, and safe error message.
- **Already submitted** notice when `duplicate: true`; open the existing job rather than starting another.
- No-deal explanation from `rejectionReason`, including when a completed job has no deal records.

**Buttons:**

- **Review deal** for a needs-review offer.
- **View deal** for a published result, once a detail-data path exists.
- **Retry processing** only when backend state permits.
- **Use clearer source / Start new submission**.
- **Enter manually** for the canonical fallback, once supported.
- **Back to Discover / Close**. Closing the screen does not cancel a scheduled job.

**State rules:**

- `completed` means processing finished, not that every offer was published.
- Display current `job.deals[].status`; `job.result` is the original extraction snapshot and can be stale after review.
- Retry is allowed for failed jobs, processing stale for over 15 minutes, or completed jobs with no published or reviewed offers. Queued/actively running jobs cannot be retried.
- A reviewed or published offer prevents retry of the whole job. Offer **Submit updated source** instead.
- The workflow limits each owner to 20 new submissions/retries per hour. Show a rate-limit message; there is no reset timestamp/count API to drive an exact countdown.
- Processing has an approximately four-minute provider budget in source; do not promise the canonical under-10-second extraction goal is achieved.
- Observe `jobs.get({ jobId })` or poll through an authorized server adapter. Recover connection and re-read before deciding whether to retry.
- No backend job-cancel/delete function exists.

## 9. Review / edit extracted deal

**Purpose:** Let the poster verify extraction before publication. Show original evidence alongside editable fields where available.

### Canonical form fields

| Label / input type | Canonical field | Required / behavior |
| --- | --- | --- |
| Restaurant name: text | `restaurant` | Required; never guessed. |
| Address: text | `address?` | Optional text; location still requires confirmed coordinates. |
| Offer description: multiline | `dealText` | Required. |
| Price in CAD: decimal input + **Price varies/unknown** | `priceCad?` | Optional number; no fabricated zero for unknown. |
| Weekdays: Mon–Sun multi-select + **Every day** | `validDays` | Store lowercase mon…sun; empty array represents every day in canonical contract. |
| Start time: time picker + **Clear** | `validStart?` | Store 24-hour HH:MM; show Vancouver timezone. |
| End time: time picker + **Clear** | `validEnd?` | Earlier than start means overnight; show “Ends next day.” |
| Expiry date: date picker + **No expiry listed** | `expiresOn?` | Store YYYY-MM-DD; preserve unknown rather than inventing a date. |
| Conditions: repeatable text rows | `conditions` | **Add condition** and **Remove condition**; empty array allowed. |
| Original source link: URL field + **Clear** | `sourceUrl?` | Optional attribution; do not fetch Instagram. |
| Source image preview + **Replace/Remove** | `imageId?` | Persist an uploaded storage ID only in canonical flow; replacement needs upload integration. |
| Confirmed location summary | `lat`, `lng` | Both required; collected in location step, not freeform AI guesses. |

**Other elements and buttons:**

- Low-confidence indicators and **Confirm field** controls for restaurant, price, hours, and expiry when their canonical confidence is below 0.6.
- Explicit “Unknown” values, editable error messages, and preview of schedule/conditions.
- **Continue to location**, **Back**, **Discard**, and per-result navigation such as **Deal 1 of 3**.
- Each offer is reviewed and published separately; no bulk publish endpoint is specified.
- **Review similar deals** section before publish for nearby offers at the same restaurant, with **View existing deal / Continue with my deal**. This is a canonical edge-case requirement; duplicate lookup/integration is not implemented.
- Do not submit `confidence` to canonical `deals.create`; it is extraction metadata, not a persisted field.
- Convert nullable extraction values into omitted/undefined optional Convex fields. Empty strings are not a substitute for absent dates/times.

### Teammate workflow review differs

The teammate result uses `restaurantName`, `title`, `description`, `price`, `currency`, `discountPercent`, titlecase `days`, `startTime`, `endTime`, `startDate`, `endDate`, `locationHint`, `addressHint`, `evidence`, overall `confidence`, and `warnings`.

For this source-backed review mode, display those values, original publication date, evidence quote, review reasons, and restaurant candidates. However, `deals.reviewDeal` only accepts `dealId`, `decision`, and optional `placeId`: it **does not save field edits**.

Therefore:

- **Approve selected restaurant** and **Reject deal** are supported on needs-review records.
- **Correct source and resubmit** is supported through a new job.
- **Save corrected fields**, canonical per-field confirmations, and manually entered deals require reconciled APIs.
- Do not map overall confidence to every canonical field.
- Map price only when CAD is known. Preserve unknown currency for review.
- A workflow start date has no canonical field; title/description merging and empty-weekday semantics also need T-05R decisions. In workflow assessment, missing days plus missing end date creates a review reason.

## 10. Confirm restaurant / location

**Core controls:**

- Restaurant/address search field, populated from reviewed extraction.
- **Find restaurant** button; perform lookup on explicit action.
- Up to five candidate rows with restaurant/branch label and address.
- Candidate selection control.
- Map preview, visible pin, drag-to-adjust interaction, and selected address/location summary.
- **Use my location** as a recovery aid where authorized by the map owner.
- **Confirm location**, **Back to edit**, and final **Publish deal**.
- Required **I checked this location** confirmation is a proposed way to make the canonical confirmation explicit.
- Loading lookup, no candidates, ambiguous branches, location denied, provider failure, and map-tile failure states.
- Visible map-provider attribution. A list/text fallback lets users still understand selected candidates.

**Canonical behavior:** Use planned `geocode.geocode({ query })`, then store poster-confirmed `lat/lng` in `deals.create`. The plan describes starting at the viewer's location if geocoding finds nothing, but publication still requires deliberate pin confirmation. Never use a default city center as proof of the restaurant's location.

**Teammate behavior:** Candidate coordinates come from Geoapify restaurant POIs. Use candidate `placeId` values returned for this job, with name/address and a read-only preview. Approval cannot accept arbitrary coordinates or a newly invented place ID. If no candidates exist, disable approve and offer clearer source/retry instead.

The teammate React discovery map has selectable deal markers; it does not implement a draggable posting pin or restaurant geocoding. Human map integration is still required.

**Publication conflict:** High-confidence teammate outcomes become published inside `ai.finish` before this confirmation screen. To meet the canonical flow, backend reconciliation must preserve a review/confirmation gate before public visibility. A UI cannot enforce that gate on its own.

## 11. Publication result

**Elements:** Saved/published confirmation, restaurant and deal summary, resulting deal ID internally, and distinct outcomes if other extracted offers remain unreviewed.

**Buttons:** **View deal**, **Back to Discover**, **Review next offer**, and **Post another deal**.

**Failure states:** Preserve draft on rejected validation, missing profile, denied ownership, failed connection, or publication error. Disable repeated taps while a request is pending. Re-check an uncertain response before creating a duplicate; canonical `deals.create` has no documented idempotency argument.

Canonical flow waits for `deals.create` to return its ID; workflow approval waits for `reviewDeal` to return published status. Do not show success from a local preview or an extraction fixture alone.

## 12. Deal details

**Read-only elements:**

- Restaurant name, offer summary, full source image when available, CAD price or **Price varies**.
- Validity and time-left badge; schedule weekdays, start/end times, expiry or **No expiry listed**.
- Conditions, address, map pin, and distance when known.
- Poster display name and creation time derived from canonical `_creationTime`.
- Still-on/expired counts and selected viewer vote.
- Source attribution link when supplied.
- Workflow evidence/warnings only if a reconciled detail contract provides them; do not fabricate missing image/author data.

**Buttons:**

| Button | Visibility / behavior |
| --- | --- |
| **Back** | Return to originating list/map. |
| Image preview | Open larger image with **Close**. |
| **Still on / Expired** | Signed-in users; one vote per viewer per deal, switching permitted. |
| **Directions** | Open the chosen directions integration for confirmed coordinates; human map lane. |
| **View source** | Only when source URL exists; an external link, not scraping. |
| **Tip poster** | Only if poster has a wallet and optional tipping shipped; sign-in gate. |
| **Edit / Delete** | Canonical author only; server ownership checks still required. |

**States:** Loading, missing/deleted deal, unavailable image, query error, map unavailable, signed-out voting, submitting vote, and failed vote with prior state restored.

**Data gap:** Canonical `deals.get({ dealId })` is planned to return poster wallet and viewer vote. Teammate `listForMap` is a collection query without a public single-deal lookup or those fields. A selected published record can power a preview; reliable reopen/deep-link detail requires an agreed retrieval path. Canonical feed-card viewer vote is not specified in the listed feed return shape, so it needs an explicit enrichment contract.

## 13. Edit deal / Delete confirmation

### Edit screen

Reuse the canonical review form prefilled with existing fields and a route back to location confirmation when changing the place.

**Buttons:** **Save changes**, **Cancel**, **Change/confirm location**, plus **Add/Remove condition**, media replacement/removal, and optional-field clear actions.

**States:** Dirty form confirmation, validation errors, saving, saved, deal removed elsewhere, and ownership/session failure. Editing must preserve author and vote counts.

**Dependency:** Planned author-only `deals.update({ dealId, ...fields })`. Clearing persisted optional fields needs an explicit update contract; omission can mean “leave unchanged.” Do not assume “Clear” works through a patch simply by dropping the argument.

### Delete confirmation sheet

- Restaurant/deal summary and clear warning that the shared post will be removed.
- Destructive **Delete deal** and **Cancel**.
- Deleting state, error/retry, then return to My posts/Discover after confirmed success.
- Planned author-only `deals.remove({ dealId })`; geospatial cleanup belongs to backend/map integration.

The teammate ingestion module exposes neither general edit nor delete. **Reject deal** is only for needs-review results and is not deletion of an existing published post.

## 14. Profile / My posts / My submissions

### Profile

**Elements:** Display name, optional wallet address, signed-in account indicator where available, and saved-profile/error state.

**Buttons:** **Edit profile**, **Copy wallet address** if present, **Post a deal**, **My posts**, proposed **My submissions**, and **Sign out**.

Sign-out returns to public browsing. Handle active unsaved forms before clearing authenticated draft context.

### My posts

- Rows containing image fallback, restaurant, deal text, price, validity, and vote counts.
- Tap row → details; author-only **Edit / Delete** actions.
- Empty state + **Post your first deal**.
- Loading and query-error recovery.

**Gap:** Canonical `by_author` index exists, but no `listMine` query is specified or implemented. Filtering a bounded nearby/recent feed is not a complete My posts listing. Agree an owner-scoped query before claiming this screen is complete.

### My submissions (proposed workflow convenience)

- Known submission rows: source summary, submitted time, job status, and result count if available.
- **Open status**, **Review**, **View published result**, state-permitted **Retry**, and **New submission**.
- Submitted details use `jobs.get`; no all-jobs/history query exists despite the `by_owner` index.
- The app can resume job IDs retained locally for the current account, but cross-device submission history and source-preview retrieval need backend support.
- Needs-review/rejected submissions are private to their owner and must not enter the public feed.

## 15. Tip sheet (optional parallel feature)

Only expose this once T-15 is integrated and a poster wallet exists.

**Elements:** Poster name, recipient wallet, **Solana devnet** label, default 0.01 SOL amount from the plan, Solana Pay QR code, waiting state, confirmed **Tip received** state, and transaction reference internally.

**Buttons:** Proposed **Open in wallet** for a single-iPhone flow, **Copy payment link/address**, **Close**, and **View transaction** after confirmed payment.

**States:** No compatible wallet/payment launch failed, awaiting payment, lookup/network failure, and verified receipt. Do not claim payment succeeded because a wallet opened. QR-only payment needs another device, so same-device behavior requires actual wallet integration testing.

Changing tip amount is not required by the current plan. No payment-history or wallet-connect screen is backed by this repository. Authentication is required by the canonical product flow; settlement/tracking is a separate integration, not an existing Convex tipping endpoint.

## 16. Explore map / selected-deal sheet (optional)

The teammate web explorer already demonstrates these controls; the canonical product treats a full-screen feed map as stretch.

**Controls and elements:**

- Pan/zoom map gestures; optional explicit **Zoom in / Zoom out**.
- Deal markers with price/discount/offer label and visible selected state.
- **Show all deals** to frame filtered results.
- Optional **Locate me** with permission/error recovery.
- **Only in map area** toggle.
- Region label, map-provider attribution, metric scale, and loading/tile-error status.
- The same filters/search as discovery when their data exists.
- Marker selection selects a matching list card; card selection selects/centers its marker.
- Selected-deal sheet: restaurant, title/description, price, address, schedule, conditions, **View details**, **Directions**, **View source**, and **Close**.
- Empty map/filter result with **Reset filters**, plus a usable list fallback when rendering fails.
- Demo badge and sample-data disclaimer when fictional deals are displayed.

**Contract notes:**

- `map-component` expects `id`, `restaurantName`, `title`, `latitude`, `longitude`, and optional address/price/currency/discount/source/expiry/demo fields.
- Workflow output nests coordinates in `restaurant`; canonical records use `lat/lng`. An explicit adapter is required.
- `map-site` additionally requires city and one of its four cuisine categories; cuisine is not supplied by the ingestion contract.
- Do not equate date-only `endDate` with an instant `expiresAt` without Vancouver timezone semantics.
- Web MapLibre/Leaflet fallback, fit controls, and callbacks are implemented references. They do not establish native iOS compatibility or pin-confirmation behavior.
- `map-site` polls its optional JSON endpoint every 30 seconds. That mode does not meet the canonical two-second live-feed acceptance target.
- The workflow public list returns published/non-expired records, not necessarily redeemable-right-now deals. Evaluate weekdays, time windows, and future start dates in the client.
- Multiple offers at the same coordinates may overlap. Restaurant grouping/cluster behavior is an unresolved map-owner choice, not an existing backend feature.
- Keep source-backed branding decisions explicit: main is DishDeals; the separate explorer currently says BiteMap and uses Chinese copy. This inventory uses DishDeals and English labels.

## 17. Integration checklist: controls needing backend work

| Feature/control group | Intended canonical API | Current source support / missing decision |
| --- | --- | --- |
| Sign-in/session | Convex Auth configuration | Missing on main; workflow expects existing JWT. |
| Display name/wallet/profile save | `users.me`, `users.upsertProfile` | Planned only; wallet-clear semantics needed. |
| Image upload | `deals.generateUploadUrl` | Planned only; workflow uses inline base64. |
| Extract screenshot/frames | `extract.extractDeal` | Planned only; workflow is queued and accepts a different source shape. |
| Submit/status/retry | No canonical jobs API | Workflow `jobs.submit/get/retryJob` exists on teammate ref. |
| Candidate approve/reject | No matching canonical review API | Workflow `deals.reviewDeal`; edits/arbitrary pin changes unsupported. |
| Confirm pin/publish | `geocode.geocode`, `deals.create` | Planned only; automatic workflow publication conflicts with user-confirmation gate. |
| Nearby/recent feed | `deals.listNearby/listRecent` | Planned only; workflow `deals.listForMap` has different shape and max 100 output after bounded scan. |
| Details | `deals.get` | Planned only; workflow has no public get-by-deal-ID query. |
| Edit/delete | `deals.update/remove` | Planned only; optional-field removal semantics needed. |
| Vote buttons/counts/viewer state | `votes.cast`, detail/feed query enrichment | Planned only; workflow has no votes table/functions. |
| My posts/history | Owner-scoped queries to be agreed | Canonical author/workflow owner indexes exist, but listing functions do not. |
| Public image/poster metadata | Canonical `imageUrl/authorName/authorWallet` enrichment | Workflow public output lacks these. |
| Tips | Solana Pay + transaction lookup | Parallel plan only; no implemented payment path. |

Internal functions (`ai.claim/finish/fail/run`, `submitInternal`, `retryInternal`, internal deal helpers, expiry maintenance, and planned `seed.seedDeals`) are not iOS-callable buttons. Their user-facing consequences are status changes, errors, published data, and expiry updates.

Root `test.ping`, command-line processing/demo scripts, workflow roster controls, generic shadcn primitives, Sites template auth/D1 examples, and deployment tooling are developer infrastructure, not additional app screens. In particular, template ChatGPT sign-in is not evidence of DishDeals account integration.

## 18. Cross-screen edge cases and acceptance

Use this as a UI verification checklist, not a record of tests run:

- [ ] Public Discover/details work without signing in.
- [ ] Protected Post/Vote/Tip gates return users to the intended screen; profile completion preserves a draft.
- [ ] Sign up, set display name, relaunch/reload, and retain a real session on iPhone.
- [ ] Screenshot, camera photo, copied text, and recording follow only their supported submission contracts.
- [ ] Unknown expiry, unknown price/currency, ambiguous branch, invalid date/time, overnight schedule, and Vancouver day boundaries are explained accurately.
- [ ] Low-confidence canonical fields require confirmation; workflow warnings and candidate review remain visible.
- [ ] Several offers render separately; completed jobs containing rejected/needs-review offers do not imply all were published.
- [ ] Duplicate submissions open the existing job; duplicate nearby restaurant offers are surfaced before canonical publication.
- [ ] Denied camera/photos/location access has a usable alternate path.
- [ ] Non-deal image has **No deal found** and manual/alternate-source recovery.
- [ ] Provider busy/unreadable source/validation/rate-limit errors offer only valid recovery actions.
- [ ] Retry obeys job state and never reprocesses published/reviewed results.
- [ ] Poster verifies location before public visibility in the canonical flow.
- [ ] Canonical extraction-to-editable-card target is under 10 seconds; T-07 full publication target is under 15 seconds. Record measured results rather than treating these as achieved.
- [ ] Two-device live feed target is under 2 seconds; every filter and badge behaves consistently.
- [ ] One vote per user/deal, changing vote updates counts, failure restores prior UI.
- [ ] Author can edit/delete; other users cannot, including direct backend requests.
- [ ] Optional tip is verified end to end on devnet, including same-device iPhone recovery.
- [ ] Large text, screen-reader labels, safe areas, keyboard avoidance, and accessible selected/error states work on the intended iOS frontend.
- [ ] Background/foreground transitions refresh time badges and resume a known job without duplicate submissions.
- [ ] Network loss never shows a local draft or fixture as a published live deal.

## 19. Exclusions and next handoff

Do not add following, favorites/bookmarks, comments, direct messages, notifications, Instagram login/scraping, restaurant-owner accounts, menus, ordering, reservations, delivery, public moderation queues, or paid redemption flows to this inventory's core scope. No inspected backend contract supports them.

The original plan explicitly excludes an iOS share-sheet integration. For the current iOS target, use in-app photo/camera/recording selection first. A native share extension would be a separate assignment; Android service-worker/share-target controls are not iOS screens.

Recommended first handoff: give the human frontend teammate sections 2–14 for the core screen inventory, and reconcile the queued workflow with the canonical editable/pin-confirmed publication flow under T-05R before claiming backend connectivity. Human map owners retain all map, geocoding, pin, and directions integration. T-03 and T-04 retain their existing owners; this document dispatches no implementation ticket.

Documentation status: complete for the inspected snapshots. Only `frontend_features.md` is added on `t-00-frontend-features` in an isolated worktree. This documentation task does not modify application code, schemas, task ownership, or the original plan. Source/contract and Markdown checks apply; app build/test/deployment and real iPhone acceptance are not established by writing this inventory.
