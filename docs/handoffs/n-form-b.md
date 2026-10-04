# N-FORM-B handoff

- Status: review
- Owner: Mica work resumed by Claude Code (Sonnet 5.5) after William's 2026-10-04 authorization; Gemini source preserved, not restarted.
- Branch/worktree: `t-07-reel-common-form`, `/Users/william/Code/DishDeals-worktrees/reel-common-form`, base `33b894d40f7e1075c6579a297657c227dc3e4f65`, head = tip of branch (scoped commit).
- Writable paths touched (all inside the packet incl. the old-revision-test amendment):
  `components/reels/ReelIntake.tsx`, `components/reels/CanonicalReelReview.tsx`, `lib/reels/reviewDraft.ts`, `lib/dealDraft.ts`, `convex/reels.ts`,
  `tests/import/reviewDraft.test.ts`, `tests/import/locationInvalidation.test.ts`, `tests/backend/reelManualDraft.test.ts`, `tests/backend/reelDraftRevisions.test.ts`,
  `docs/integration/reel-common-form.md`, `docs/handoffs/n-form-b.md`.

## What the form now does
- Canonical `DealReviewForm` + injected `DealLocationPicker` mounted for private Reel items in every state; manual editing works with no extraction, `failed`, `no_deal`, `queued`. `DraftReview` fixture export unchanged (non-saving).
- `INVALIDATE_LOCATION` reducer action; picker `onInvalidate` dispatches it, confirm dispatches `CONFIRM_LOCATION`.
- Typed optional `onPublish(fields: PublishFields) => Promise<void>`; unavailable with a clear integration reason when omitted (no `deals.create` yet; Northstar wires it after Loom T09C).
- `reels.saveDraft`: same args/result/version guards; creates a manual strict draft when none exists.

## Review corrections applied (Northstar's REQUIRED list)
1. **Unmount drops edits** – `Result` keeps `CanonicalReelReview` (keyed by item only) and `AttachRecording` mounted during `retrieving`/`extracting`; uploads are disabled via a `processing` prop instead of unmounting. The review form is keyed by offer index plus a replace-epoch so partial price text survives and only resets when drafts are replaced.
2. **Saved init dropped model reviewIssues** – `initDraftsFromReelItem` now carries adapter issues (UNSUPPORTED_CONSTRAINT warnings, FUTURE_START, currency) into saved/manual drafts. Equal offer count binds by index; a changed count fails closed (all model warnings on every offer, no index-bound currency notes/suggestions, one blocking "confirm manually from source" note). No model → no manufactured constraints. Fixed a bypass: a saved non-CAD price is no longer flagged manually-edited, so an omission review cannot satisfy the currency gate.
3. **Duplicate weaker validator** – `validateDraftForPublish` removed. The component re-runs canonical `buildPublishFields`/`validateForPublish` (FUTURE_START hard blocker even if resolved; unreviewed fields rejected even if previously manually edited) and refuses publish while a version conflict is unresolved.
4. **Reloaded populated values need explicit review** – new "Confirm saved values (N)" control dispatching `REVIEW_FIELD` via `confirmationActions`; only populated or known-empty user-entered fields, never unknown/omitted ones or unaccepted model suggestions. The old manual flag is not treated as review.
5. **saveDraft existing JSON strict** – an existing stored `draftJson` must parse as strict 1..10 `ReelDraft`s within the size limit, else "This draft is corrupt." Documented exception: the system's own untouched `"[]"` placeholder for `no_deal` (an edited `"[]"` is corrupt).
6. **Late/new extraction** – `planLateExtraction` + a separate notice: "Use model suggestions" only when every offer is pristine, otherwise "Add model offers" (appends unreviewed offers, cap 10, edits untouched), or "Ignore". Never auto-applied; Load latest is the only re-initialization.
7. **Old revision test** – `tests/backend/reelDraftRevisions.test.ts` "rejects a save when no draft exists yet" replaced by a test of the approved manual-create policy.

## Checks actually run (once after final edits; targeted while iterating)
- `npx vitest run tests/import/reviewDraft.test.ts` → 23/23; backend `reelManualDraft` + `reelDraftRevisions` → 54/54 (after adding the no_deal `[]` exception).
- `npm test` → exit 0, 34 files, 950/950 tests.
- `npm run typecheck` → exit 0. `npm run lint` → exit 0, 0 warnings/errors.
- `npm run test:workflow` → 23/23.
- `node /tmp/dishdeals-owner-check.mjs N-FORM-B` → `approved centralized packet ownership PASS`.

## Correction 2 (Northstar review of 76288cc)
- Saved edited offers have no stable model ids, so `initDraftsFromReelItem` now trusts index alignment only for an unedited saved draft with equal count. Any `draftEdited: true` draft is unaligned: every blocking model constraint/warning/FUTURE_START goes on every saved offer with the explicit source-review note; model currency notes and suggestions are dropped (own non-CAD note kept). Original extraction/evidence untouched.
- Typed notes: stored extraction JSON may carry additive optional `manualReview` entries (strict extraction contract unchanged; read tolerantly in `lib/reels/reviewDraft.ts`; FUTURE_START always blocking). Prism's helper replaces this source later.
- Regression: same-count edited reorder with typed FUTURE_START (`tests/import/reviewDraft.test.ts`) — both reordered offers keep the unresolved FUTURE_START, unresolvable via reducer, `buildPublishFields` throws even after all confirmations/location/omissions. Plus unedited-binds-by-index, first-load typed note, malformed-note tests.
- Checks: `npx vitest run tests/import tests/backend/reelManualDraft.test.ts tests/backend/reelDraftRevisions.test.ts` 9 files 316/316; `npm run typecheck` and `npm run lint` exit 0. Full suite not re-run (correction scoped to reviewDraft helper/tests/docs). No backend/API/schema/deals change.

## Not run / pending (no mock acceptance claims)
- Real browser DOM, live map rendering/geocoding, native iOS WKWebView, phone and publish are NOT verified; unit/convex-test use synthetic identities and fixtures only. No provider, cloud, remote, browser or native execution, no secrets read.
- Component-level behaviors (Confirm saved values button, late-extraction notice, mounted-during-processing) are covered through their pure helpers; there is no DOM test of the components themselves.

## Limits and coordination
- Review metadata and map pin are not persisted in `ReelDraft`; after app reload the user must re-confirm values, omissions and location before publish (disclosed in `docs/integration/reel-common-form.md`).
- Loom's image HTTP/deals writer and Prism's private constraints are untouched. Prism's model-sidecar constraints currently load independently; after its merge, saved/manual drafts must keep carrying them (the same carry path in `initDraftsFromReelItem` should be extended, not bypassed).
- This is dependency-ready form mounting plus manual persistence, not closed T07/publish acceptance. No push, no draft PR.

Stop condition met; no next task dispatched.
