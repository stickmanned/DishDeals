# N-CORE-REVIEW: independent source review of the core write path

Reviewer: Prism (Claude Code Sonnet 5.5). Checkout `core-auth-write-review`, branch `t-17-core-auth-write-review`, base `832fc0bba304ef7d9bb16e952d3590d362dcc829` (shipping code = `6c69d94`). Shipping source was read only; this file is the only change.

## Evidence labels

- **SOURCE REVIEWED. NOT PHONE-PASSED.** Everything below comes from reading source (and the installed `@convex-dev/auth` 0.0.96 / `convex` 1.46.0 library code in the sibling `workflow` checkout). No Reel, recording, Gemini call, publish, vote or share-extension run was observed by this review.
- **User-reported phone proof (William, iPhone, 05:39 Oct 4), recorded as reported, not re-observed:** signed in; saved a display name; tabs Saved Reels → Map → Profile and a close/reopen all stayed signed in. Nothing else is claimed. The real Instagram share → private save → user recording → VLM draft test is still pending William.
- **Public host (read-only, no sign-in):** `GET /` and `GET /reels` on `https://dishdeals-demo.vercel.app` returned HTTP 200 `text/html`. That proves only that the pages are served. No protected behavior was exercised and no live sample exists yet.
- One pure-function reproduction was run from a scratch file outside the repo (finding 2). Nothing else was executed.

## Findings (highest priority first)

### 1. Duplicate community deals: "already published" lives only in React memory, and `deals.create` is not idempotent (high)

- `components/reels/CanonicalReelReview.tsx:91` keeps `receipts` in component state. It is lost on reload, WKWebView process termination (the Swift side already handles `webViewWebContentProcessDidTerminate`, `DinedealsApp.swift:237`), navigating away and back, and explicitly by "Load the latest saved draft" (`:162` `setReceipts({})`).
- `alreadyPublished` (`:233`) is derived only from `receipts`. The private item is never marked (`lib/reels/publish.ts:148-164` writes nothing; the UI text at `:378` says "the private save is unchanged").
- `convex/deals.ts:146-159` inserts unconditionally. There is no per-author/per-source guard, so the same reviewed offer can be published repeatedly.
- The lost-response message (`lib/reels/publish.ts:86`) tells the user to check the map before retrying, but nothing stops a second publish.
- Demo impact: one real Reel → two or more identical pins/cards after a retry, an app relaunch, or a "Load latest" followed by Publish.
- Repro (needs William's login, one human step): publish one offer, force-quit and reopen the app, open the same `/reels?item=…` save, re-confirm the offer fields and location, press Publish again. Expected by source: a second deal for the same `sourceUrl`. Not run.
- Bounded fix suggestion (outside this packet's writable paths): make `deals.create` idempotent without a schema change. Before the insert, read the author's deals via the existing `by_author` index (`take` a bounded number) and return the existing id when `sourceUrl`, `restaurant`, `dealText`, `lat` and `lng` all match. Keep the client receipt as is. (A multi-offer Reel shares one `sourceUrl`, so `sourceUrl` alone is not a safe key.)

### 2. After the user's own upload or the model finishing, Save and Publish are blocked by a "changed elsewhere" state that "Use model suggestions" does not clear (medium-high, hits the main demo path)

- `changed` (`CanonicalReelReview.tsx:103-108`) compares the editor's `expected` version with the item. The upload route bumps `generation` (`convex/reels.ts:178,184`), and finishing an unedited draft bumps `draftRevision` (`convex/reels.ts:147`, `lib/reels/draftRevision.ts:74-77`).
- While `changed` is true: Save is disabled (`:181,396`), and publish throws "This draft changed elsewhere…" (`lib/reels/publish.ts:61`, via `:232-236`).
- `handleApplyLateExtraction` (`:144-156`) loads the model suggestions but never updates `expected`, so Publish stays blocked until the user also chooses "Load the latest saved draft" or "Keep my edits". The two banners (`:262-277` and `:320-338`) overlap and the first says "changed by another save or retry" even though the user changed nothing.
- Reproduced as pure logic (scratch script, repo untouched):
  - `versionStatus({generation:1,revision:0}, {generation:2})` → `changed`, i.e. immediately after the user's own recording upload on a pristine editor.
  - `versionStatus({generation:2,revision:0}, {generation:2,draftRevision:1})` → `changed`, i.e. after a model finish on an unedited draft.
- Not data loss: "Keep my edits" works and "Load latest" warns that it replaces unsaved typing. It is a demo-path dead end for anyone who does not read both banners.
- Bounded fix suggestion (in `components/reels/CanonicalReelReview.tsx`): treat the version as current whenever every offer is pristine (`isPristineDraft`, `lib/reels/reviewDraft.ts:387`), by adopting `latest` into `expected` in an effect, and also call `setExpected(latest)` in the replace branch of `handleApplyLateExtraction`. Keep the banner for the case where the user has typed something.

### 3. Native inbox: one unsent link record blocks routing of every newer share, and "Not now, clear this link" does not clear it (medium)

- `ShareStore.first()` (`ios/Shared/ShareStore.swift:166-169`) returns only the oldest record whose `routed` flag is false. Link records are never marked routed (`DinedealsApp.swift:140-143` leaves them until a server receipt).
- `consumeInbox` (`DinedealsApp.swift:135-146`) then requires `inbox.shouldRoute(oldest)`. After that oldest link has been routed once in this process, `shouldRoute` is false forever, so a newer item or link record is never opened. `tests/native/WebLoadChecks.swift:129-131` tests only the `InboxRouting` key set, not that `first()` ever surfaces the newer record.
- "Not now, clear this link" (`components/reels/ReelIntake.tsx:61`) only sets web state. It posts nothing, so the native file stays for 24 h, re-prompts on every cold launch, and keeps blocking (previous bullet).
- The newer share is not lost (the item exists server-side and appears under "Your saves"), but it does not auto-open.
- Bounded fix suggestion (Swift, outside this packet): have `consumeInbox` iterate all pending records and route the first one for which `shouldRoute` is true; add a native message (for example `discardLink`) that `ReelIntake` posts on decline, handled next to `received` in `DinedealsApp.swift:251-253`.

### 4. The Keychain token can be up to 1 h stale, and the upload path can send a stale token (medium; partly unverified)

- Convex Auth's default JWT lifetime is 1 hour (`@convex-dev/auth` 0.0.96, `dist/server/implementation/tokens.js:4`). `convex/auth.ts` sets no `jwt.durationMs`.
- The bridge posts a token only while page JS runs (`components/CanonicalSessionBridge.tsx:14-17`), and the share extension reads only that JWT, with no refresh token (`ios/Shared/ShareStore.swift:239-250`). If the app was backgrounded for more than an hour, the extension's direct save is rejected. The recovery copy is kept (`ShareViewController.swift:56-58`), so no link is lost. The user sees "sign in to send it" (`:64-65`) even though they are signed in. Which HTTP status Convex returns for an expired JWT on `/api/mutation` was not verified (a non-401 would show the "retry when connected" text instead); either way the link is recovered through the consent screen.
- Upload: `AttachRecording.send()` uses `session.fetchAccessToken({ forceRefreshToken: false })` (`ReelIntake.tsx:120`), which returns the in-memory token as is. A 401 becomes "Your session expired. Sign in again." (`:96,121`, `lib/reels/suppliedMedia.ts:124`) with no refresh-and-retry. Whether the Convex client has already refreshed after a resume was not observed; this is plausible, not confirmed.
- Suggestions: on a 401, retry once with `forceRefreshToken: true` in `send()` (`ReelIntake.tsx`). Demo script: open the app within the hour before sharing from Instagram so the share saves directly.
- Checked and OK: a transient refresh network failure does not wipe the Keychain token. In `convex` 1.46.0 `authentication_manager.js` `refetchToken`, a thrown fetch error propagates and never reaches `onAuthChange(false)`; only a genuinely rejected refresh (`tokens === null`) signs out and posts `null` (`lib/nativeSession.ts:71-79`).

### 5. One weak citation rejects the whole extraction; retries are deterministic and rate-limited (medium, real-Reel risk)

- `validateExtraction` throws for any non-null field without evidence, any caption quote that is not an exact substring of the caption or one native fragment, or any audio quote missing from the model's own transcript (`lib/reels/contract.ts:104-107,113-118`). `runReelExtraction` has no degrade path (`:181-185`), so the item becomes `failed` with the generic message "The video could not produce a validated draft…" (`convex/reelActions.ts:47-49`).
- `temperature: 0` (`contract.ts:171`) makes a retry likely to fail the same way. Retries are capped at 5 attempts and share the 10 per hour limit with uploads (`convex/reels.ts:23-30,83-98`).
- Practical effect: a single quote mismatch on William's real Reel yields "needs attention" and a blank manual form. This is by design safe (nothing unverified reaches a draft) but may look like a broken analysis in the demo.
- Bounded fix suggestion (`lib/reels/contract.ts`): on a per-field evidence failure, set that field to `null` and append a warning (warnings already become blocking review notes, `lib/reels/toDealDraft.ts:199-216`) instead of failing the whole result. Keep the strict failure for schema errors and for caption-channel quotes only if the caption is empty. Or at minimum return a distinct failure code and message so the user knows to edit by hand.
- Assumption, not measured: the upload cap is 12 MiB (`lib/reels/suppliedMedia.ts:8`). Real iPhone screen recordings of 30 to 60 s often exceed this. The file picker reports it clearly (`ReelIntake.tsx:109`), but William will need a trimmed or compressed clip. Raising the cap is a backend and provider-limit change; do not do it casually.

### 6. Lower priority

- After any private save, `draftEdited` is true, so even a single-offer 1:1 draft is treated as unaligned: every model note is re-attached to every offer plus an extra blocking note reading "cannot be matched automatically to the model's 1" (`lib/reels/reviewDraft.ts:213,264-277`). The user must re-resolve all notes after reload. Consider aligning when both sides have exactly one offer.
- The `Anonymous` provider (`convex/auth.ts:8`) is not called by any client. Anyone can mint a user directly against the deployment and then publish, vote or submit within the per-user limits. This is the same exposure as Password sign-up without email verification, so it is not a new regression. Accepted per the N-REMOTE-B comment, noted for completeness.
- The client allows `lat` up to ±90 (`lib/dealDraft.ts:1092`) while the server and map limit is ±85.05112878 (`lib/dealWrite.ts:14,77`). A pole-adjacent pin passes the form and fails at the server with a generic publish error. Not realistic for Vancouver.

## Checked and found sound (specific, source-grounded)

- Auth/ownership: every `reels.*` function derives the user server-side and `owned()` checks owner and expiry (`convex/reels.ts:13-22`). `deals.create/update/remove` require a signed-in user with exactly one profile (`convex/deals.ts:102-108`) and author match. `votes.cast` derives the user, is one vote per user and idempotent (`convex/votes.ts:23-61`).
- Upload ownership: `/reel-source` derives the owner from the bearer token and never accepts a client storage id (`convex/reelSource.ts:69-101`). Attach is atomic against the owned, unexpired, current generation (`convex/reels.ts:169-188`), the orphan blob is deleted on any rejection or exception (`reelSource.ts:103,109`), and a deleted item mid-upload ends in `not_found` plus cleanup.
- Late async results: `finish`, `fail`, `attachMedia`, and `workSource` all check generation and expiry. A re-pick of a recording advances the generation and stops the old workflow (`convex/reels.ts:178-186`).
- Manual-edit preservation: `planFinish` keeps an edited draft and advances nothing (`lib/reels/draftRevision.ts:72-74`), the extraction is stored separately (`convex/reels.ts:147`), and the UI shows the model suggestion as "not applied" (`CanonicalReelReview.tsx:415-429`). Late extraction never overwrites non-pristine offers (`reviewDraft.ts:412-428`).
- Confidence: the Reel adapter sets `confidence: undefined` and never fabricates the four scores (`lib/reels/toDealDraft.ts:260`). `toCanonical` in `contract.ts:131-138` still fabricates `{0,0,0,0}` but has no shipping caller (grep over `app`, `components`, `lib`, `convex`). `toCreateArgs` sends exactly the `deals.create` fields (`lib/reels/publish.ts:103-118`) and refuses the Reel video id as an image id.
- Tentatives: unknown `validDays`/`conditions` never become accept-able `[]` suggestions (`toDealDraft.ts:315-344`), non-CAD or unspecified currency never maps into `priceCad` (`:225-243`), every model warning and constraint is a blocking note, and `FUTURE_START` is a hard blocker (`lib/dealDraft.ts:822-824,990-994`).
- Confirmed location: publish requires a confirmed location (`lib/dealDraft.ts:1088-1089`), editing restaurant or address clears it (`:650-657,680-687`), and the server re-validates bounds (`lib/dealWrite.ts:76-80`).
- Native bridge: the Swift handler checks main frame and exact origin before acting (`DinedealsApp.swift:245-248`), the share-context event is delivered as native arguments (no JS string interpolation, `:259-260`), the bearer token is only sent to an https `*.convex.cloud` host (`ShareStore.swift:241`), and the Keychain item is `AfterFirstUnlockThisDeviceOnly`. The bridge posts nothing while auth is loading, so a launch does not wipe the token (`lib/nativeSession.ts:71-79`).

## Human steps and open questions

1. William: the real Instagram Reel test (share → private save → attach his own recording → VLM draft → confirm location → publish) is still the only evidence for the core flow. If running it, also try the finding 1 sequence (publish, relaunch, publish again) and note the finding 2 banners after upload. No agent signs in.
2. William: keep the recording under 12 MiB and open the app within an hour before sharing (findings 4 and 5).
3. Unverified here: Convex's HTTP status for an expired JWT; whether the Convex client refreshes before `AttachRecording.send()` after a long background; the real size of William's recording; whether `GEMINI_*` and `REEL_MEDIA_USAGE_AUTHORIZED` are set on the deployment (not checked, no cloud access used).
4. Fix ownership: findings 1, 3 and 5 need edits outside this packet's writable paths (`convex/deals.ts`, `ios/App/DinedealsApp.swift` and the React review/intake files, `lib/reels/contract.ts`). Northstar to assign; none was made here.

## Handoff

Source reviewed, not phone-passed. Local commit only; nothing pushed, merged, deployed or deleted. No accounts, sign-ins, secrets, env values or protected writes were used. Geocoding untouched.
