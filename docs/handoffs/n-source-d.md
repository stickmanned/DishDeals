# N-SOURCE-D handoff — native supplied-context ingestion (backend + web)

Branch `t-05-native-context-ingestion`, pinned base `25cc20b65be346b699f7760b9465a461f0465df0`. Design and behavior: `docs/integration/native-context-ingestion.md`. The committing SHA is reported in the return message (a commit cannot name itself).

## Status (kept separate)
- **Implementation ready (local, synthetic):** yes. Schema, submit, bounded helper, model request, evidence validation, truncated block, retired resolver, web recovery bridge and tests are done.
- **Native build pending:** the Swift counterpart (N-SHARE-C, Cinder) is a different ticket and was not touched. Its published branch already dispatches `dishdeals:shareContext` on `window` with `{sourceUrl, nativeContext}` and sends nothing when no context exists; this ticket's web side matches that (nothing ⇒ timeout ⇒ link-only save).
- **Real iPhone pending:** no phone, Instagram, WKWebView, Keychain or live backend/VLM evidence exists. Real provider identifiers remain unknown.

## Decisions to review
1. **Lifting the truncated block** is done by the user supplying a non-empty editable caption when attaching the recording (the only explicit-user text channel allowed without a new schema field). Alternative if you prefer: a dedicated "provide complete context" mutation, which would need a schema/contract decision.
2. **Duplicate submit** leaves a context-less first save context-less (strict immutable-first-receipt reading). Native deletes its recovery copy on `received`, so a context that arrives only on a duplicate is dropped.
3. **Future-clock tolerance** of one hour for `receivedAt` (phone clocks drift). Only a seconds/milliseconds mix-up or obvious nonsense is rejected.
4. **Workflow file unchanged:** the resolver is retired inside `reelActions.retrieve` (stub, no network); `convex/reelWorkflow.ts` was not edited.
5. `workItem` (journalled by the workflow) omits the private text; extraction uses a new internal `workSource`.

## Changed paths
convex/schema.ts, convex/reels.ts, convex/reelActions.ts, convex/reels.test.ts (disabled-resolver regression, amended path), lib/reels/nativeContext.ts (new), lib/reels/contract.ts, lib/reels/contract.test.ts, lib/nativeSession.ts, components/reels/ReelIntake.tsx, tests/backend/reelNativeContext.test.ts (new), tests/import/nativeContext.test.ts (new), tests/import/nativeSession.test.ts (new), docs/integration/native-context-ingestion.md, docs/handoffs/n-source-d.md. Not touched: Swift, generated files, package/config/auth, `convex/reelWorkflow.ts`, `tests/backend/reelSource.test.ts`.

## Checks (local, this checkout)
`npx tsc --noEmit` exit 0; `npx eslint .` exit 0; `npx vitest run --exclude "scripts/**"` 61 files / 1652 tests pass (before the last test-only type fix; the touched file re-ran 19/19). Sanity: restoring the original `reelActions.ts` makes 9 of the new/updated tests fail.

## Follow-ups outside this ticket
- Native/Convex deployment: the schema change is additive/optional but is not synced anywhere; a human-authorized dev sync is needed before a phone can use it.
- The attach UI has no way to add a caption without re-uploading the recording.
