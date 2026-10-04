# N-SHARE-DRAFT handoff: private Reel draft persistence and optimistic concurrency

Checkout `/Users/william/Code/DishDeals-worktrees/reel-draft-guards`, branch `t-13-reel-draft-guards`, base `1eb2e7c`. Local only: nothing pushed, no PR, no cloud/codegen/provider/secret/native action.

## States
- **Implementation:** ready (local). **Local checks:** pass (synthetic, in-memory convex-test).
- **Native checks:** pending (no Swift/runtime touched). **Real iPhone:** pending. Editor UI behavior is not render-tested (no browser/DOM test tooling was added); only its pure rules are unit-tested.
- Root form integration, map and publish are out of scope and untouched.

## Changed paths
- `convex/schema.ts`: additive optional `reelItems.draftRevision: number` and `draftEdited: boolean` (legacy rows read 0 / false). No other table or field changed.
- `lib/reels/draftRevision.ts` (new): pure rules shared by backend and editor: safe-count validation, overflow-safe `bump`, `checkSave`, `planFinish`, `versionStatus`, `afterOwnSave`, user-facing error strings.
- `convex/reels.ts`: `saveDraft`, `retry`, `finish` changed; all other functions and guards untouched.
- `components/reels/ReelIntake.tsx`: editor and wording changes (below).
- `convex/reels.test.ts`: the two existing `saveDraft` calls updated for the new required args (no other change).
- `tests/backend/reelDraftRevisions.test.ts` (new, 38 tests), `tests/import/draftRevision.test.ts` (new, 54 tests), this handoff. (An earlier version of this handoff reported 26 and 39 and a combined 65; those figures were wrong and are replaced here with the actual suite output.)

## Backend contract
- `reels.saveDraft({itemId, draftJson, expectedGeneration, expectedRevision}) -> null`. Owner is derived server-side (`getAuthUserId` plus `ownerId` check); extra client user args are refused. In order: owner/expiry; expected numbers must be safe nonnegative integers ("invalid"); stored generation/revision must be valid ("corrupt"); `expectedGeneration` and `expectedRevision` must equal the stored values or the save is rejected as stale; revision overflow at `MAX_SAFE_INTEGER` is rejected. An existing private draft (stored `draftJson` parsing to at least one offer) is required, in any status except when none exists (queued/failed/extracting etc. are allowed so edits survive retries; no deal is ever written). Strict `ReelDraft` 1..10 and the 60 KB bound are kept; the "same number of offers as the model" rule is removed. On success: `draftJson` replaced, `draftRevision + 1`, `draftEdited = true`. All checks run before the single patch in one transaction, so concurrent same-version saves yield exactly one winner.
- `reels.retry`: still failed-only, 5 attempts, rate limit. Generation and attempts advance with overflow checks. It now keeps `draftJson`, `draftRevision`, `draftEdited`, `extractionJson`, `caption`, `duration` and `publishedAt` (old provenance stays until a new extraction arrives); it clears only the error and the stored video.
- `internal.reels.finish`: validated extraction is stored in `extractionJson`. If the draft was user-edited it is kept untouched (even if the offer count differs or the new result is `no_deal`). If it was an unedited model default, it is replaced and `draftRevision` increments, so stale editors cannot overwrite it. Corrupt counters or overflow throw before any change. Late/deleted/expired generation guards for `finish`, `fail`, `attachMedia`, `markRetrieving` are unchanged and tested.

## Editor (`ReelIntake.tsx`)
- Shown whenever a retained draft exists (not only when `ready`) and keyed by item, so it stays mounted across generation changes; a note explains that processing is pending or needs attention and that edits are kept.
- Local inputs and the expected generation/revision are captured once at mount; reactive results never overwrite them. If the server version differs (another save, a retry or a new default), a warning explains it and Save is disabled until the user chooses "Load the latest saved draft" or "Keep my edits and replace the latest". The expected version advances only after the editor's own successful save.
- When the draft is user-edited, the model's extraction is shown separately under "Model suggestion (not applied)"; it never fills user values.
- Wording fixed: the intake text no longer promises video retrieval/analysis; it says processing depends on the service being available and that the link alone is never analyzed. Status labels for retrieving/extracting still describe real states.
- `LayoutPreview.tsx` (not owned) still compiles because the new version props are optional.

## Checks run in the checkout
- `npm ci --prefer-offline --no-audit --no-fund` (no package change).
- `npx tsc --noEmit`, `npx eslint .`: clean.
- Targeted suites, each run separately: `tests/backend/reelDraftRevisions.test.ts` 38 passed; `tests/import/draftRevision.test.ts` 54 passed; `convex/reels.test.ts` 9 passed (101 total across the three).
- `npm run check`: exit 0 (full repo: 23 test files, 588 vitest tests, 23 workflow tests, `next build`). These full-check counts are separate from the targeted counts above.
- Mutation spot checks each failed tests: removing the stale check, retry clearing the draft, finish always replacing, dropping overflow, not incrementing revision, `bump` accepting negative/fractional counters (14 failures), and a length-based instead of byte-based size check (1 failure).
- `node /tmp/dishdeals-owner-check.mjs N-SHARE-DRAFT`: see commit reply.
- Not run: `convex dev`/codegen, any cloud target, browser/render checks, native, phone. `convex/_generated` was not edited; `reelItems` types come from the schema. Existing Convex-generated docs for these functions will refresh on the first authorized codegen.

## Review corrections (second commit)
- `bump(n)` now requires `isSafeCount(n)` before incrementing, so a negative, fractional, NaN or infinite stored generation or attempts counter returns `null` and `retry` rejects ("cannot be retried") instead of advancing it. Counters are never repaired. Missing `draftRevision` / `draftEdited` still default to 0 / false (legacy). New actual-wrapper `retry` tests (generation: -1, -0.5, 0.5, 2.5, NaN, Infinity; attempts: the same values below the 5-attempt cap) assert the item and `reelLimits` are unchanged and no state advances, plus a healthy-item control.
- The 60 KB draft limit is measured in UTF-8 bytes (`MAX_DRAFT_BYTES`, `utf8ByteLength`, `withinDraftLimit` in `lib/reels/draftRevision.ts`; used by `saveDraft`). Regression: three schema-valid offers of 3-byte characters have a JSON string shorter than 60,000 characters but more than 60,000 bytes and are rejected ("too large") with no change, while the same shape in ASCII saves. Pure tests cover exact-limit and limit-plus-one byte boundaries.
- `afterOwnSave` now validates its input and returns `null` on an invalid expectation or revision overflow instead of guessing; the editor handles `null` by keeping its current expectation and telling the user to reload the latest draft. Pure tests cover valid, boundary and null cases.
- Guidelines re-read for this correction: the Convex generated guidelines (function registration and calling, validators, mutations as transactions) and the installed Next client-component guide; no applicable rule changed the implementation.
