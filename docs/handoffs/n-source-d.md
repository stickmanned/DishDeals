# N-SOURCE-D handoff — native supplied-context ingestion (backend + web)

Branch `t-05-native-context-ingestion`, pinned base `25cc20b65be346b699f7760b9465a461f0465df0`. Design and behavior: `docs/integration/native-context-ingestion.md`. The committing SHA is reported in the return message (a commit cannot name itself).

## Status (kept separate)
- **Implementation ready (local, synthetic):** yes. Schema, submit, bounded helper, model request, evidence validation, truncated block, retired resolver, web recovery bridge and tests are done.
- **Native build pending:** the Swift counterpart (N-SHARE-C, Cinder) is a different ticket and was not touched. Its published branch already dispatches `dishdeals:shareContext` on `window` with `{sourceUrl, nativeContext}` and sends nothing when no context exists; this ticket's web side matches that (nothing ⇒ timeout ⇒ link-only save).
- **Real iPhone pending:** no phone, Instagram, WKWebView, Keychain or live backend/VLM evidence exists. Real provider identifiers remain unknown.

## Decisions to review
1. **Truncated context always blocks automatic extraction** (Northstar review correction). No caption lifts it; the manual draft flow stays open. A real complete-context confirmation (owned server-side boolean, reset on caption edit) is left for a separate ticket and needs a schema decision.
2. **Duplicate submit** leaves a context-less or earlier-context first save untouched (strict immutable first receipt). The web UI discloses that the newly received text was not stored; native still gets the URL-only `received` receipt and may delete its copy, so context that arrives only on a duplicate is dropped.
3. **Future-clock tolerance** of one hour for `receivedAt` (phone clocks drift). The clock is receipt-only: never sent to the model and never a publication or date anchor.
4. **Workflow file unchanged:** the resolver is retired inside `reelActions.retrieve` (stub, no network, stale env irrelevant); source URL, context and offered types never trigger retrieval. `convex/reelWorkflow.ts` was not edited.
5. `workItem` (journalled by the workflow) omits the private text; extraction uses a new internal `workSource`.

## Changed paths
convex/schema.ts, convex/reels.ts, convex/reelActions.ts, convex/reels.test.ts (disabled-resolver regression, amended path), lib/reels/nativeContext.ts (new), lib/reels/contract.ts, lib/reels/contract.test.ts, lib/nativeSession.ts, components/reels/ReelIntake.tsx, tests/backend/reelNativeContext.test.ts (new), tests/import/nativeContext.test.ts (new), tests/import/nativeSession.test.ts (new), docs/integration/native-context-ingestion.md, docs/handoffs/n-source-d.md. Not touched: Swift, generated files, package/config/auth, `convex/reelWorkflow.ts`, `tests/backend/reelSource.test.ts`.

## Checks (local, this checkout)
See the return message for the final full-run counts (tsc, eslint, vitest). Sanity: restoring the original `reelActions.ts` makes 9 of the new/updated tests fail.

## Follow-ups outside this ticket
- Native/Convex deployment: the schema change is additive/optional but is not synced anywhere; a human-authorized dev sync is needed before a phone can use it.
- A model-availability note: no live model call was made; model/account availability and billing are untested.
