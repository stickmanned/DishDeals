# Published teammate backend preservation (N-REMOTE-A)

Review artifact. Nothing here was applied to the shared schema/config/generated files, deployed, synced or run against a cloud, provider, browser or phone. The patch is a proposal in `docs/integration/backend-preservation.patch`.

- Pinned base: `2c97c07aecfb5055769724d83f01eb8482da388a` (replaces `397c597`; the amendment changed only coordinator tests/central docs, and `convex/` and `lib/` are identical between the two).
- Source read with `git show` at the human-merged main `cc47c030d929db130632cf18d124797673414ee2` (PR12; reviewed head `49e45f195df27ee2e01d9c86a7ff15f9b7f82033`). `49e45f1..cc47c03` has no `convex/`, `lib/` or `package.json` difference. Backend sources never changed after the reviewed head; the merge-base with our history is `547a74d`.
- Deployment named by teammate docs: `proper-marmot-82` (development). Its contents were NOT inspected; everything about it below comes from teammate docs and the published source.

## What is at risk

Our canonical branch has none of the published workflow backend. The deployed dev backend does. A later authorized sync of canonical source alone would:

1. **Fail the schema push** if `workflowJobs`, `workflowRestaurants`, `workflowDeals`, `workflowLimits` or `workflowSearchLimits` hold documents but are missing from `schema.ts` (Convex validates existing documents against the pushed schema; not tested here), and in any case remove the functions below from the deployment.
2. Remove the `workflow/*` and `trial:status` functions, the seven `/v1/*` HTTP routes and the cron `Remove expired deals from realtime maps`.
3. Stop offering the `Anonymous` sign-in provider (published `auth.ts` is `[Password, Anonymous]`; ours is `[Password]`).

Published records are not canonical deals and cannot be assumed migrated, validated, or pin-confirmed. They are teammate-reported (live guest login, Cactus Club offer published, two website offers pending review); none was re-verified here.

## Patch contents

`docs/integration/backend-preservation.patch` is a `git format-patch` series of two commits on the pinned base. Apply with `git am` (or `git am --3way`). `git apply` of the concatenated mbox is not the supported path.

| item | value |
| --- | --- |
| size / SHA-256 | 199,722 bytes / `ea13f7541adbbc74ca69a2703dcb012c15373f98a04f2b0885773ba055227ce8` |
| commits | `1/2 Preserve published teammate workflow backend (cc47c03)`, `2/2 Guard preserved workflow: no Instagram/Meta source retrieval, separate provider-usage gate` |
| scope | 43 files, +2204 / -4 (tests included; 32 non-test files, +1390 / -4) |
| writes outside our packet | none in this repo; the patch itself touches shared files only when someone applies it |

**Commit 1: verbatim preservation + minimal merge points.**
- Verbatim from `cc47c03` (compared byte for byte, empty diff): `convex/workflowTables.ts`, `convex/trial.ts`, `convex/workflow/{ai,auth,compare,deals,jobs,maintenance,search}.ts`, all 15 `lib/workflow/*.ts` published modules, and `tests/workflow/*` except `frontend-integration.test.ts` (it exercises the frontend-owned `lib/frontend/workflow.ts`/`deals.ts`, which this patch does not touch).
- `lib/workflow/http.ts` (new): the published `/v1/*` route handlers from `convex/http.ts`, unchanged apart from a `registerWorkflowRoutes(http)` wrapper (2-space re-indent) and an import block. The canonical `convex/http.ts` gains one import and one call, and keeps `/reel-source` and `/deal-image`. It lives in `lib/` so it is not a new Convex module.
- Root merge points: `convex/schema.ts` (import + `...workflowTables`), `convex/crons.ts` (one interval, same identifier as deployed, canonical `clean expired deal image uploads` kept), `convex/convex.config.ts` (names only, see below), `convex/_generated/{api,server}.d.ts` (hand-extended because codegen is not allowed; `dataModel.d.ts` derives from the schema). One canonical test is amended: `tests/backend/dealImageUpload.test.ts` asserted the cron list was exactly one job; it now expects the two jobs.
- NOT taken from the published branch: `convex/auth.ts`, `convex/auth.config.ts`, `convex/convex.config.ts`, `convex/schema.ts`, `convex/http.ts`, `convex/_generated/*`, `convex/reels*.ts`, `package.json`/lockfile, `next.config.ts`, all of `app/`, `components/`, `lib/frontend/*`, `lib/trial-image.ts`, the vendored map tarballs, `docs/*`. The published `reels.ts`, `reelActions.ts`, `reelWorkflow.ts` are byte-identical to the old `547a74d` versions (the ScrapeCreators resolver generation) and are superseded by ours, so they are deliberately not carried.

**Commit 2: review corrections on top (original source is preserved in commit 1).**
- **Instagram/Meta retrieval prohibited.** Published `extractWithGemini` hands any `type: "url"` source to the Gemini `url_context` tool, and its own tests assert `instagram.com`/`instagr.am` URLs are accepted as retrievable sources. The guard rejects `url` sources whose host is `instagram.com`, `*.instagram.com`, `cdninstagram.com`, `fbcdn.net` or their subdomains, `instagr.am` or `ig.me`. A pasted caption goes in as `type: "text"` with the link kept only as `sourceUrl` attribution (still accepted). `processDeal` re-parses, so stored or bypassed inputs never reach a provider (tested). Look-alike hosts such as `myinstagram.com` stay allowed. Google's own docs say login-required pages and video/audio are unsupported for URL context, consistent with this.
- **Provider usage gate.** The published workflow called Gemini/Geoapify whenever keys existed, with no authorization gate (ours has `REEL_*`/`IMAGE_PROVIDER_USAGE_AUTHORIZED`). `WORKFLOW_PROVIDER_USAGE_AUTHORIZED` must equal `"true"` for job extraction (`liveDependencies`, checked after the key checks), search and comparison. Without it jobs fail closed with `CONFIGURATION`, search returns deterministic stored results, and comparison runs evidence-only, all with no provider request (tests with a mocked fetch; mutation checks failed tests when each gate was removed).
- Existing tests updated to set the gate, the two Instagram tests rewritten, `tests/workflow/guards.test.ts` added, one compare test added.

## Export and table compatibility matrix

Function names and argument/data fields are unchanged from the published source (the frontend `workflowApi` references remain valid: `workflow/search:find`, `workflow/deals:listForMap`, `workflow/jobs:submit|get|retryJob`, `workflow/deals:reviewDeal`).

| module | exports | kind | notes |
| --- | --- | --- | --- |
| `workflow/jobs` | `submit`, `get`, `retryJob`, `listMine` | public | require sign-in (`requireOwner`: Convex Auth user id before `\|`); 20 submissions/h/owner |
| | `submitInternal`, `retryInternal` | internal | owner `"integration"` via `/v1` |
| `workflow/deals` | `listForMap` | public, unauthenticated | published offers only, scans 500, returns at most 100 |
| | `reviewDeal` | public | owner-only approve/reject; approve needs verified candidate |
| | `listInternal`, `reviewInternal`, `getJobInternal` | internal | |
| `workflow/ai` | `claim`, `finish`, `fail`, `run` | internal | scheduled by submit/retry via `ctx.scheduler.runAfter(0, …)`; `finish` writes outcomes atomically and auto-publishes `ready` ones |
| `workflow/search` | `find` | public action | 60 search+compare calls/h/owner |
| | `catalog`, `reserve`, `run` | internal | |
| `workflow/compare` | `find` | public action | |
| | `selected`, `run` | internal | |
| `workflow/maintenance` | `expireDeals` | internal | cron every 15 min; marks expired published offers `rejected` (data kept) |
| `workflow/auth` | `requireOwner` | helper | |
| `trial` | `status` | public query | booleans only |
| `workflowTables` | `workflowTables` | schema fragment | |
| HTTP | `POST/GET /v1/jobs`, `POST /v1/jobs/retry`, `POST /v1/deals/review`, `GET /v1/deals`, `POST /v1/search`, `POST /v1/deals/pitch`, `POST /v1/deals/compare` | routes | all but `GET /v1/deals` need `Authorization: Bearer $WORKFLOW_API_TOKEN` (32+ chars); disabled while the token is unset |

| table | fields | indexes | status in patch |
| --- | --- | --- | --- |
| `workflowJobs` | owner, fingerprint, inputJson, status(queued/processing/completed/failed), createdAt, updatedAt, attempt, resultJson?, errorJson? | `by_owner_and_fingerprint`, `by_owner_and_createdAt` | identical |
| `workflowRestaurants` | placeId, dataJson | `by_placeId` | identical |
| `workflowDeals` | jobId, restaurantId?, dataJson, status(published/needs_review/rejected), timezone, sourceUrl(string\|null), createdAt, reviewedAt?, reviewedBy? | `by_jobId`, `by_status_and_createdAt` | identical |
| `workflowLimits`, `workflowSearchLimits` | owner, windowStart, count | `by_owner` | identical |
| `profiles`, `votes` | canonical | | unchanged, same on the deployed copy |
| `deals` | canonical + our `by_image` index | | additive vs deployed (index only) |
| `reelItems` | ours adds optional `draftRevision`, `draftEdited`, `sourceKind`, `mediaMime`, `mediaBytes` | | additive optional vs deployed |
| `dealUploads`, geospatial component tables | ours | | new vs deployed; Loom adds `geocodeGate`, `geocodeCache` |

Auth tables (`authTables`) are shared. Components: published uses only `@convex-dev/workflow`; ours adds `@convex-dev/geospatial`. `deals`/`reelItems` existing deployed documents must still satisfy our schema (additive optionals only, so expected to pass; unverified, see preflight). Canonical publishes and workflow publishes stay separate: workflow offers are not canonical `deals`, carry a global confidence score, and have unconfirmed Geoapify coordinates.

## Scheduler, crons, components, auth, helper dependencies

- Scheduler: `jobs.submit/retry` -> `workflow.ai.run`. Crons: deployed `Remove expired deals from realtime maps` (preserved by name) plus ours.
- Helpers: `lib/workflow/{contracts,workflow,gemini,gemini-schema,geoapify,network,errors,search,search-contracts,search-gemini,search-map,web-discovery,compare,compare-contracts,compare-gemini}.ts`; external hosts used (server-side `fetch`): `generativelanguage.googleapis.com` (extraction, structured planning, `google_search` grounding, `url_context`) and `api.geoapify.com`. No Instagram or other source fetch is performed by our server code; `url_context` retrieval happens on Google's side and is now blocked for Instagram/Meta hosts.
- Auth providers: published `[Password, Anonymous]`, canonical `[Password]`.
- Dependencies: published and canonical use the same `convex` ^1.46.0, `@convex-dev/auth` ^0.0.96, `@convex-dev/workflow` ^0.4.8, `@google/genai` ^2.27.0, `zod` ^4.6.5. The published `@auth/core` ^0.41.3 line is a declared peer of `@convex-dev/auth` ^0.0.96 and is already resolved transitively in our install; the published `dompurify`/map-tarball lines are frontend-only. The patch needs no `package.json` change.

## Environment variable NAMES (values never read)

Used by preserved code: `GEMINI_API_KEY`, `GEOAPIFY_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_SEARCH_MODEL`, `GEMINI_WEB_SEARCH_MODEL`, `GEMINI_COMPARISON_MODEL`, `WORKFLOW_API_TOKEN`, and (new, commit 2) `WORKFLOW_PROVIDER_USAGE_AUTHORIZED`. `trial:status` also reads `REEL_PROVIDER_USAGE_AUTHORIZED`, `SCRAPECREATORS_API_KEY`, `GEMINI_REEL_MODEL` (booleans only). Auth: `CONVEX_SITE_URL` (platform), Convex Auth `JWT_PRIVATE_KEY`/`JWKS` (documented by the teammate as set on the deployment). All new names are declared in `convex.config.ts`.

## Old vs current: functions, models, `process.env`, provider and Convex guides

- **Typed env.** Convex guidelines in `convex/_generated/ai/guidelines.md` say to declare env in `convex.config.ts` and read it with `env` from `./_generated/server`, not `process.env`. The preserved source reads `process.env` directly (verbatim). Declaring the names is in the patch; converting reads to typed `env` is a recommended follow-up, not applied (keeps the source exact). Whether `process.env` still resolves undeclared/declared names on the deployed runtime is not verified here; an authorized dev push plus a probe would settle it.
- **Models.** The code default is `gemini-3.8-flash` (with `GEMINI_MODEL` etc. overrides and no explicit-model requirement). Google's models page (fetched during this review) lists `gemini-3.8-flash` and `gemini-3.5-flash-lite` as current stable and limits `gemini-2.5-flash` to previously active users, matching the teammate's report (2.5 returned 404; the dev deployment pins `GEMINI_MODEL=gemini-3.5-flash-lite`). Ours requires explicit model variables with no implicit default; the preserved workflow does not. Decision for the coordinator: require explicit models here too (small follow-up).
- **API shape.** The preserved code calls `POST …/v1beta/models/{model}:generateContent` with `x-goog-api-key`, `generationConfig.responseJsonSchema`, `tools: [{url_context:{}}]` / `[{google_search:{}}]` and reads `urlContextMetadata`, `groundingMetadata`. Our code uses the installed `@google/genai` 2.27.0 client. The installed 2.27.0 type definitions still define those response fields (verified in `dist/genai.d.ts`), but Google's current docs lead with the newer Interactions API (`type: "url_context"`, `url_context_result`, `search_suggestions`, inline `annotations`) and did not mention `groundingMetadata` in the fetched page. Do not assume grounded search or URL context works until an authorized real call returns sources; the teammate reports Search grounding blocked by free-tier quota (HTTP 429), and Google bills Gemini 3 grounding per executed query.
- **Convex.** Same package versions; no deprecated API found in the preserved modules beyond `process.env` use. Search/map scans are bounded (500) and not geospatial-indexed.

## Concrete review corrections still needed (not silently shipped)

1. Done in patch: Instagram/Meta retrieval blocked; provider usage gated. The preserved published frontend still sends Instagram shares as `type: "url"` (`lib/frontend/share-source.ts`); after the guard those submissions fail validation. Human-owned frontend change: send the pasted caption as `type: "text"` with `sourceUrl` attribution (the backend already accepts it).
2. **Auto-publish.** `workflow.ai.finish` publishes high-confidence offers straight to the public map with a Geoapify point, no human pin confirmation, and a global confidence score. This conflicts with the canonical rule (human-confirmed pins, no global score) and is preserved only because deployed behavior depends on it. Decide: keep as a separate "community-unverified workflow feed" or require review.
3. **Anonymous provider and quota.** Anonymous sign-in lets anyone mint unlimited owner ids, each with its own 20 jobs/h and 60 searches/h of provider spend. The new usage gate limits exposure; the provider choice is the decision below.
4. **`/v1/*` shared owner.** Every token call acts as owner `"integration"`; `GET /v1/deals` is intentionally public.
5. Expiry cron flips expired published offers to `rejected` (destructive status, data kept); `retry` deletes the job's unreviewed deals.
6. Implicit default model and `process.env` reads (see above).

## Decision needed: provider/session compatibility (not patched)

The patch does not touch `convex/auth.ts` or `auth.config.ts`.

- **A. Keep canonical `[Password]` (assumed default).** Anonymous users' `workflow*` rows keep their `owner` ids but those users can no longer sign in, so their history becomes unreachable (not deleted). Existing sessions' behavior after a provider is removed was not verified. Native/iPhone flow is unaffected (it needs a real account anyway).
- **B. Add `Anonymous` back in a separate packet.** Restores the published guest flow and its history; re-opens the quota-abuse surface in item 3 and must not replace the native sign-in path. It needs coordinator approval and a session-compat test; an optional human guest/source enhancement, not a substitute for the iPhone flow.

## Expected conflicts with the Loom geocode branch

Simulated in scratch: cherry-picked Loom's two T-08G-B commits (`b094159`, `ee2d892`, branch `t-08-durable-geocode-core`, based on `e4d9cec`) onto the pinned base, then applied this series with `git am --3way`.

- `convex/convex.config.ts`: CONFLICT (both append env names after `GEMINI_IMAGE_FALLBACK_MODEL`). Resolution: keep both lists.
- `convex/_generated/server.d.ts`: CONFLICT (same reason). Resolution: keep both lists (regenerate with authorized codegen instead of hand-merging when possible).
- `convex/schema.ts` and `convex/_generated/api.d.ts`: auto-merged. `convex/crons.ts`, `convex/http.ts` untouched by Loom.
- Commit 2 edits the same two env files again, so expect the same two files to conflict on each commit; resolve once and continue. Apply order is flexible; the series is independent of Loom's tables.

## Commands NOT EXECUTED (each needs an explicit target and scope approval)

Nothing below was run. Replace `<target>` with the exact approved deployment (teammate docs name `proper-marmot-82`; confirm the project/team slug first). Do not run `npx convex dev` in several worktrees against one deployment.

Preflight, read-only against the cloud (names/counts only, no secrets):
1. `npx convex env list --names-only --deployment <target>` (never plain `env list`: it prints values).
2. `npx convex function-spec --deployment <target> --file deployed-function-spec.json` (inventory deployed functions to diff against the matrix above).
3. `npx convex data --deployment <target>` (table list) and `npx convex data workflowDeals --limit 5 --format jsonLines --deployment <target>` per workflow table. `data` prints whole documents, including private `inputJson`/source text, so run it only with approval, keep the output out of git/chat, and read counts and field shapes only; do the same for `reelItems`, `deals`, `profiles`, `votes`.
4. Check each existing `deals`/`reelItems` document against our schema before any push (additive optionals only expected).

Backup (before any deploy):
5. `npx convex export --include-file-storage --path <backup>.zip --deployment <target>` (stores database and files; keep it outside git).

Local only, after approval to apply the patch to a branch:
6. `git am docs/integration/backend-preservation.patch` (or `--3way`), resolve the two env files, then `npx convex codegen --dry-run` to compare generated types against the hand-edited ones, then `npm run typecheck && npm run lint && npx vitest run tests/workflow tests/backend tests/auth convex`.

Deploy (separate approval; dev deployment only):
7. `npx convex dev --once --env-file <env-file-selecting-target> --typecheck enable` (published teammate procedure) or `npx convex deploy --dry-run` first to print the generated configuration. Confirm in the push diff that `workflow*` tables and functions are retained and nothing is deleted.

Post-sync verification (read-only): rerun steps 2 and 3 and compare counts and function names with the pre-sync output.

Restore (only if the push damaged data):
8. `npx convex import --replace <backup>.zip --deployment <target>` restores the tables contained in the zip. Do NOT use `--replace-all`: per `convex import --help` it deletes tables not in the import or schema and clears schema tables absent from the file. Use `--table <name> --append|--replace` for a single table.

## Hosting and approvals

- Existing repo constraints: published `next.config.ts` sets `output: "export"` (static, `trailingSlash`, optional `NEXT_PUBLIC_BASE_PATH`), and `scripts/build-github-pages.mjs` writes a `/DishDeals`-prefixed export plus `.nojekyll`; it requires an `https://` `NEXT_PUBLIC_CONVEX_URL`. Our canonical app has the dynamic route `app/deal/[id]`, which a static export cannot serve without frontend changes (the published frontend replaced it with `app/deal/page.tsx` and query parameters), and a static Pages site proves neither dynamic routes nor native auth. The teammate docs say Pages was not yet enabled (the repository owner must set Settings -> Pages); that was not re-checked. Options: (1) static export on any HTTPS static host (needs the frontend to avoid dynamic routes, as the published frontend does with query parameters); (2) a Node host running `next start` over HTTPS (supports dynamic routes); (3) Pages as a demo only. Choosing is a human/coordinator decision.
- Native: `ios/project.yml` still holds placeholders `WEBSITE_URL: "https://replace-with-your-web-host.example"` and `BACKEND_URL: "https://replace-with-your-deployment.convex.cloud"` (empty `DEVELOPMENT_TEAM`). They must not be set until the actual endpoints are approved.
- Our upload/CORS routes need the exact website origin in `REEL_WEB_ORIGIN`, and the web build needs `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` (see `.env.example`).
- A release approval must name separately: remote git pushes, frontend deployment, the dev backend target and sync, and each provider's usage (`WORKFLOW_PROVIDER_USAGE_AUTHORIZED`, `REEL_MEDIA_USAGE_AUTHORIZED`, `IMAGE_PROVIDER_USAGE_AUTHORIZED`, geocode). The old T-02 sync approval for `proper-marmot-82` does not cover any of them.

## Checks actually run (all local, scratch clone of this repo at the pinned base)

- Patch applied cleanly with `git am` on a fresh clone; resulting tree identical to the tree it was built from; `git diff --check` clean.
- `npx tsc --noEmit` and `npx eslint .` exit 0 with the series applied (dependencies borrowed read-only from another local checkout's `node_modules`; convex 1.46.0).
- `npx vitest run tests/workflow tests/backend tests/auth convex`: 23 files, 456 tests passed. `tests/workflow` alone: 10 files, 86 tests. Provider traffic in these tests is mocked; none is evidence of live behavior.
- Mutation spot checks failed tests for: removing the job gate, the search gate, the comparison gate, and the Instagram host guard.
- Not run: full repository suite/build, codegen, any cloud/provider/browser/native step.
