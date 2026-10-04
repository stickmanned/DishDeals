# N-SOURCE-A handoff: authenticated user-supplied Reel recording

Checkout `/Users/william/Code/DishDeals-worktrees/supplied-reel-media`, branch `t-13-supplied-reel-media`, base `5190dfa`. Local only: nothing pushed, no cloud/codegen/provider/secret/account/system action. Design and limits are in `docs/integration/supplied-reel-media.md`.

## States
- **Implementation:** ready (local). **Local checks:** pass (synthetic).
- **Native checks / real WKWebView file picker:** pending. **Real recording upload, deployed CORS, live Gemini output, iPhone:** pending. No success is claimed for any of them.

## Changed paths (all inside the packet)
`convex/schema.ts` (additive optional `sourceKind: "supplied"`, `mediaMime: "video/mp4" | "video/mov"`, `mediaBytes`), `convex/reels.ts`, `convex/reelActions.ts`, `convex/reelWorkflow.ts`, `convex/reelSource.ts` (new), `convex/http.ts`, `convex/convex.config.ts`, `convex/_generated/api.d.ts` (reelSource registration only), `convex/_generated/server.d.ts` (two Env keys), `components/reels/ReelIntake.tsx`, `lib/reels/suppliedMedia.ts` (new), `tests/backend/reelSource.test.ts` (new), `tests/import/suppliedMedia.test.ts` (new), `convex/reels.test.ts`, `docs/integration/supplied-reel-media.md` (new), `docs/handoffs/n-source-a.md`, `.env.example` (new). Untouched: canonical deals/profiles/votes, package/lock, Swift, auth, root providers.

## Behavior summary
- `POST /reel-source` and `OPTIONS /reel-source`: origin from `REEL_WEB_ORIGIN`, Bearer identity, strict query/type/length/signature checks before `storage.store`, atomic generation-checked association, orphan deletion on rejection, receipt `{status:"attached", generation}` only after association. Details and status codes in the integration doc.
- Link-only `submit` no longer enqueues anything. A supplied recording is extracted directly (no retrieval) behind the separate `REEL_MEDIA_USAGE_AUTHORIZED` gate; the legacy resolver gate/key are not needed and stay off.
- Recording is retained across fail/retry, deleted on success, no-deal, delete, expiry and replacement. N-SHARE-DRAFT edit/version protections are unchanged and re-tested through the new path.
- UI (`ReelIntake.tsx`): "Attach your recording" panel in the private result (hidden while retrieving/extracting) with file, caption, date and a real-duration probe; selection/cancel/errors keep prior choices; success text comes only from the server receipt. Wording no longer claims retrieval.
- **Bug fixed while testing (pre-existing):** cancelling a workflow that had already finished threw "Workflow not running", which would have blocked retry, replacement and deletion of any item whose workflow completed. `stopWorkflow` now tolerates that state (regression test included).

## Fields and configuration required
Schema fields above (additive, optional; legacy rows unaffected). Deployment env (not set by this work): `REEL_WEB_ORIGIN`, `REEL_MEDIA_USAGE_AUTHORIZED`, `GEMINI_API_KEY`, `GEMINI_REEL_MODEL`. Web env: `NEXT_PUBLIC_CONVEX_SITE_URL`. See `.env.example`.

## Commands and results (this checkout)
- `npm ci --prefer-offline --no-audit --no-fund` (no package change).
- `npx tsc --noEmit`, `npx eslint .`: clean.
- `npx vitest run tests/backend/reelSource.test.ts`: 48 passed. `tests/import/suppliedMedia.test.ts`: 68 passed. `convex/reels.test.ts`: 9 passed.
- `npm run check`: exit 0 (full repo: 26 test files, 718 vitest tests, 23 workflow tests, `next build`). Full-check counts are separate from the targeted counts.
- Mutation spot checks each failed tests: removing the auth check, the origin check, orphan deletion, the stale-generation recheck, supplied-media retention on fail, the supplied workflow branch, the supplied-only gate, the link-only enqueue guard, and superseded-media deletion.
- `node /tmp/dishdeals-owner-check.mjs N-SOURCE-A`: see the commit reply.

## Test coverage (synthetic Blob/ISO-BMFF bytes, mock backend, labeled mocked model SDK)
Preflight and CORS (exact origin, no wildcard/credentials, invalid origin config fails closed); signed-out, wrong origin, wrong owner, malformed/deleted/expired item; 21 malformed-request cases (query, type, mismatch, HTML/HEIC bodies, length lies, over 12 MiB, exact 12 MiB accepted); success persistence and QuickTime to `video/mov`; no network/model/log output; rate-limit orphan cleanup; stale/other-owner/deleted/expired association; two racing uploads; replacement and late-result fencing; deletion; link-only no workflow; fail-closed with gates off and recording kept; supplied extraction passes the actual video, mime, caption, date, timezone and provenance link to the existing extractor with no fetch; no-deal deletion; retry retaining recording and manual draft with edited draft surviving a new extraction; plus pure validators, origin parsing, probe cleanup/timeout, URL building and upload receipt handling.

## Remaining human steps
Set the deployment env and `NEXT_PUBLIC_CONVEX_SITE_URL`; run authorized codegen/sync (generated types here were extended by hand); authorize Gemini usage when ready; test the real Photos/Files picker in the WKWebView, a real recording upload, extraction output and the phone flow.
