# N-FORM-C handoff: Reel geocode/publish bindings with retained offer edits

Checkout `/Users/william/Code/DishDeals-worktrees/reel-publish-bindings`, branch `t-07-reel-publish-bindings`, base `92ccdfc`. Local only: no provider, cloud, browser, env or remote action; no backend, schema, generated, map, shared-form, package, Swift, author or post change. Design: `docs/integration/reel-publish-bindings.md`.

## States
- **Implementation:** ready (local). **Local checks:** pass (pure helpers, controller logic and server-rendered markup).
- **Pending (human/live):** real `deals.create` and `geocode` against a deployment, a real provider answer, the rendered Find button and map in a browser/WKWebView, signing, install, native and the phone. A fake create/geocode and static markup are not that evidence.

## Changed paths
`components/reels/ReelIntake.tsx` (DraftEditor binds auth, `users.me`, `deals.create`, `geocode.geocode`), `components/reels/CanonicalReelReview.tsx` (keyed mounted forms, per-offer publish, receipts, `search` prop), `lib/reels/publish.ts` (new), `tests/import/reelPublish.test.ts` (new), `docs/integration/reel-publish-bindings.md`, this handoff.

## Behavior summary
Real `deals.create` and `geocode.geocode` callbacks replace the default "publishing unavailable" stub; account and profile come from the real session and `users.me`; the canonical gate, version-change block, single-flight guard and a genuine created-id receipt precede any success state; typed FUTURE_START and legacy blocking review stay blocking; failures keep inputs and show a generic message; the private save is never altered or presented as a publish. Each offer keeps a mounted `DealReviewForm` with a stable key, so partial price text and notes survive switching, appending and removing other offers.

## Commands and results
- Environment: no usable `node_modules` here; a read-only clone of the root checkout's installed `node_modules` and the ignored `map-component/dist` (not committed, no env copied).
- `npx tsc --noEmit`, `npx eslint .`: clean.
- `npx vitest run tests/import/reelPublish.test.ts`: 45 passed.
- Mutation checks each failed tests: the account gate, single-flight guard, receipt validation, source link from the owned item, video-id-as-image refusal, key-preserving removal, candidate cap, the version-change precondition, and append-versus-replace for late extraction.
- `npm run check`: exit 0 (44 test files, 1340 vitest tests, 23 workflow tests, `next build`). Full-check counts are separate from the targeted count.
- `node /tmp/dishdeals-owner-check.mjs N-FORM-C`: see the commit reply.

## Known limits
- No DOM environment exists in this repo, so there is no interaction test that types a partial price, switches offers and returns; that behavior rests on the stable-key structure (unit-tested) and the server-rendered markup test.
- `inert` hides inactive offers from focus and assistive technology in current browsers; older WebViews that lack `inert` still get `hidden`, which removes them from layout and focus.

## Review corrections (second commit)
- `GENERIC_PUBLISH_ERROR` no longer says "Nothing was published": after a lost response or network failure the outcome is unknown, so it now reads that publishing could not be confirmed, that the deal may or may not have been published, that edits are kept, and to check the map or deals before trying again. It still leaks no backend detail; it is used for any create failure and for a response that is not a genuine id.
- `searchErrorMessage` no longer echoes the server's `code`/`message`. It reads only the error code, accepts it only if it is own-property in the fixed `SEARCH_MESSAGES` list (the geocoder's nine codes), and shows client-owned wording; anything else (unknown, missing, non-string, prototype names such as `toString` / `__proto__` / `constructor`) gets the generic message. Known code with secret-bearing message text, and unknown codes with secrets, are tested not to leak.
- Unchanged: the source gate, review-level preconditions, single flight, receipts, and the stable per-offer partial-form keys. No schema or create-argument change (idempotency belongs to the separate backend ticket).
- Checks: `tsc` and `eslint .` clean; `tests/import/reelPublish.test.ts` 47 passed; three mutations (echoing the server message, an `in` check that admits prototype names, the old "Nothing was published" copy) each failed tests. The full check was not repeated, as instructed.
