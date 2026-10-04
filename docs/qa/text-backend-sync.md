# N-TEXT-SYNC — reviewed development function update complete

Recorded October 4, 2026, around 06:24 America/Vancouver. **The single authorized development sync passed at06:20:03**, from the approved detached scratch snapshot. Fresh private backup verified first. The initial root-env-write blocker was resolved by Northstar's explicit scratch-checkout amendment; root stayed read-only. Live authenticated extraction/phone publication remains pending William.

## Authority, source and target

- Owner Loom. Evidence checkout `/Users/william/Code/DishDeals-worktrees/core-backend-readiness`, branch `t-19-core-backend-readiness`, clean starting base `3f6f10dce64a1ba21accb492aa47a196dbfac019`.
- Authoritative central packet `workflow/docs/tasks/N-TEXT-SYNC.md`. Writable tracked paths: this report and `docs/handoffs/n-text-sync.md` only; private backup/metadata/command-result files under `/tmp` also allowed.
- Reviewed backend source pin: `f51e7474b451a7459a66710c07af7c1e48880660`. Prism's independent `/tmp/dishdeals-text-independent-review.md` explicitly APPROVES `6c3f605`; integrated `637788b` is reported by Northstar. The worker's prior182 tests/typechecks/lint and coordinator77 tests are inherited evidence, not newly rerun here.
- Actual workflow and detached scratch HEAD at sync: `88a0dfbcb166113071a062fbe50843b72dc50d07`, both clean. Northstar's docs/manifest-only update was accepted. Ops created `/private/tmp/dishdeals-caption-backend-release` at that exact HEAD; Loom added the authorized symlink to existing workflow `node_modules` without installing or copying env.
- Current `convex/extract.ts` is byte-identical to both approved `6c3f605` and pinned `f51e747`; SHA-256 `b91a6ecd17401264f9706186195846100eabec301388afe33b9b37badb523bf0`.
- Reverified `git diff --exit-code 6c69d94 f51e747` for `convex/schema.ts`, `convex/convex.config.ts`, auth config/auth/HTTP routes, root package manifests, and nested package manifests: empty, exit0. Runtime paths under `convex`/`lib` differ only at `convex/extract.ts`. No schema/component/package revision is proposed; no dashboard-backup completion is claimed.
- Target classified and announced before backup and again before sync: **development proper-marmot-82, ca-central-1**. Fresh explicit-deployment function-spec resolved `https://proper-marmot-82.ca-central-1.convex.cloud`,82 entries (68 named functions/14 HTTP routes). Public process selection pin `CONVEX_DEPLOYMENT=dev:proper-marmot-82`; existing CLI authentication only. No deployment key was present in the process. Root `.env.local`, `.env`, and `convex.json` were absent and remain absent; the only local config creation was the explicitly allowed scratch `.env.local`.

The reviewed change reuses `IMAGE_PROVIDER_USAGE_AUTHORIZED` for actual supplied caption/text under William's existing provider budget. It adds no service/flag/overage and does not retrieve Instagram URLs. No model call occurred in this packet.

## Fresh private backup — actual result

Run from the existing workflow checkout, with umask0077 and private directory0700:

```sh
CONVEX_DEPLOYMENT=dev:proper-marmot-82 node /Users/william/Code/DishDeals-worktrees/workflow/node_modules/convex/bin/main.js export --deployment proper-marmot-82 --include-file-storage --path /tmp/dishdeals-text-sync.J4XsLn/proper-marmot-82-before-text-sync.zip
```

- Exit0, no terminating signal. Start `2026-10-04T13:14:55.067Z`, end `2026-10-04T13:14:57.472Z` (06:14:55–57 Vancouver).
- Archive size **100,706 bytes**, file mode **0600**, containing directory mode **0700**.
- SHA-256 **`fdcc1e96d21e3e95e25dc4f1e2d96a43d8daa965edf622efd000859abb4514f5`**.
- ZIP CRC/integrity check (`zipfile.ZipFile.testzip`) PASS,87 entries. Integrity checked archive bytes; no row, media contents or entry filenames were displayed. Archive was not extracted and no restore was attempted.
- Private0600 evidence files: `backup-command.json`, `backup-integrity.json`, `function-spec-before.json`, `function-spec-current.json`, `source-preflight.json` in the same directory. CLI raw output was held in memory and discarded rather than recording a possible snapshot URL or sensitive output; command/result logs contain sanitized metadata only.

This is a **CLI data + file-storage snapshot**, not a Convex dashboard backup or rehearsed restore. It contains private data and remains outside Git.

## Initial root-write blocker — resolved by explicit amendment

The original packet says: **“No edits in integration branch/generated files/env/config”** and requires identifying any CLI write outside that scope. Installed Convex CLI1.46.0 behavior was verified from its current local implementation before running the sync:

1. `dev.ts` calls `deploymentCredentialsOrConfigure` before `devAgainstDeployment`.
2. `src/cli/configure.ts:132` calls `updateEnvAndConfigForDeploymentSelection` even when the target is already resolved. That routine (`:732`) calls `writeDeploymentEnvVar` for a dev target and then `finalizeConfiguration` (`:744`).
3. `src/cli/lib/deployment.ts:50` finds the existing `.env.local` absent; `changesToEnvVarFile` constructs public deployment configuration, and `:71` writes the new file. Matching the public process pin only suppresses the “changed deployment” notice; it does not suppress that file write.
4. `src/cli/lib/init.ts:20` calls `writeUrlsToEnvFile`, which writes the detected Next env file (`src/cli/lib/envvars.ts:82`), normally with public client/site URLs. The path is `/Users/william/Code/DishDeals-worktrees/workflow/.env.local`. No secret value is required for these writes, but the path is explicitly forbidden.

`--codegen disable` guards generated-file work; it does not disable env finalization. `--env-file` changes selection input, but the deployment-variable output path remains fixed `.env.local`; it is not a way to keep root read-only. Existing `.gitignore` already ignores `.env*`, so no Git-ignore amendment is needed. No project selection/configuration, CLI modification or filesystem bypass was attempted.

The command below was **not run in workflow**. Under the later amendment, exactly this one-shot command was run **once in the scratch directory** instead:

```sh
CONVEX_DEPLOYMENT=dev:proper-marmot-82 node node_modules/convex/bin/main.js dev --once --typecheck enable --tail-logs disable --codegen disable
```

Northstar explicitly amended the packet to use the clean detached `/private/tmp/dishdeals-caption-backend-release` snapshot at88a0dfb and allow the CLI's public `.env.local` finalization **only there**. The existing root-env prohibition stayed in force. No repeated deployment approval was requested; William's dev update authorization already applied.

## Historical pre-sync evidence — 06:15, after backup

At `2026-10-04T13:15:55Z` (06:15:55 Vancouver), before the successful 06:20 sync, explicit-deployment function-spec exit0 was byte-identical in JSON to pre-backup metadata: still82 entries, same function validators/routes. No function/table/schema deletion was initiated by Loom. No data-row contents or counts were read. This historical checkpoint is separate from the completed sync and post-sync verification below.

| Read-only / unauthenticated probe | Observed result |
| --- | --- |
| Regional site OpenID configuration | 200; issuer and JWKS URI at `proper-marmot-82.ca-central-1.convex.site` |
| Regional site JWKS | 200; one public key; key values not logged |
| Exact demo-origin OPTIONS `/deal-image` | 204; correct origin, Authorization/Content-Type allowed |
| Exact demo-origin OPTIONS `/reel-source` | 204; correct origin, Authorization/Content-Type/X-Reel-Meta allowed |
| Public unauth `extract:extractDeal`, `imageIds: []`, non-empty text | HTTP200 **error envelope**; `NOT_SIGNED_IN`, “Not signed in”; no provider invocation |

At this historical pre-sync checkpoint, the HTTP/metadata runner exited0, workflow remained clean, and root `.env.local` remained absent. No deployment-env/gate/origin change, generated update, watcher, schema update, seed, authenticated app function, provider/geocoder call, account/login, remote push or production deployment occurred.

## Actual single sync and post-sync checks

From `/private/tmp/dishdeals-caption-backend-release`, the one-shot command above exited **0**, no signal. Start `2026-10-04T13:19:55.502Z`, end `2026-10-04T13:20:03.676Z` (06:19:55–06:20:03 Vancouver). CLI selected existing `[Development] william-wen:dishdeals:dev/william-wen` and the verified regional cloud endpoint, then reported **“Convex functions ready! (6.91s)”**. Typecheck enabled, codegen disabled, log tailing disabled; no `--configure`, `--run`, `--start`, retry or watcher. Exactly one sync attempt. Private0600 `sync-command.json` records command, source HEAD, times, exit and CLI setup/result output; no auth/user log tailing.

CLI's generic setup banner said “Provisioned a dev deployment and saved its” public URLs. This banner is emitted by env finalization for an existing target too; it does not establish creation of a new project/deployment. The target already existed and its URL/metadata were verified before execution. No account/project creation or configuration-selection command was used.

Metadata writes: scratch `.env.local` only, containing **exactly** the permitted `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` names with the known public dev/regional values. No secrets copied or created. Root `.env.local` remains absent. All7 generated files retain their pre-sync hashes. Scratch tracked/untracked Git status remains clean (allowed env/symlink ignored), source HEAD and extraction hash unchanged. Workflow remains clean at88a0dfb; Loom wrote no root files. Scratch/public selection verification is recorded privately in `scratch-after.json`.

Actual post-sync metadata checks around06:22–06:23:

- Explicit `function-spec --deployment proper-marmot-82` exit0: identical pre/post JSON, **82 entries /68 named functions /14 routes**, including unchanged extraction args/return validators and preserved workflow APIs.
- `data --deployment proper-marmot-82` **without a table argument** lists table names only. All **20 application tables** in the pre-sync archive are present, no new/missing application table. No document rows or table counts read. The first comparator wrongly included the archive's `_tables` metadata directory; excluding system metadata corrected it to20/20, exit0.
- Regional OpenID and JWKS200; correct regional issuer/JWKS URI and one public key.
- Exact-origin OPTIONS `/deal-image` and `/reel-source`204 with correct CORS/header sets. Unauthenticated POST on both401/auth with matching CORS.
- Public unauth text-only `extract:extractDeal` (`imageIds: []`, non-empty text) returns HTTP200 **error envelope** NOT_SIGNED_IN. Authentication still precedes model processing; no Gemini request occurred. Successful authenticated text-only output is **not** claimed by this probe.

Private post-sync records: `function-spec-after-sync.json`, `post-sync-metadata.json`, `post-sync-metadata-corrected.json`, `post-sync-http.json`; all0600. The initial scratch-env verification helper exited1 because it treated the CLI's inline deployment comment as part of the value; a dotenv dependency lookup was unavailable (nothing installed); Node's built-in env parser then verified the exact three public values, exit0. These are verification-helper corrections, not sync failures or retries.

No unexpected schema/component/package changes or table/function removals were observed. No destructive/data/seed/user operation was initiated. Individual row/file preservation was not independently compared, because their contents were not read or logged; table/API preservation and the absence of a schema/deletion operation are the bounded evidence. Geocoder/provider/origin flags were not mutated.

## Handoff and pending acceptance

Sync and verification stop condition met. Northstar alone reviews/integrates these two evidence documents and updates shared status. No further sync is needed for this approved caption backend update.

Northstar subsequently reported receipt/form integration `6fb14cb` and a full npm check PASS (2070 tests /23 files), with backend unchanged. This is coordinator-reported later evidence, not a check rerun by Loom; it does not change the recorded source HEAD at sync.

William's genuine pasted-caption Gemini/phone publish test remains pending after reviewed form/web release; production web deployment is HUMAN only. Login/private Instagram-save evidence remains user-reported as previously recorded. Bare-link retrieval remains unavailable. Geocoding remains OFF pending real contact. No authenticated app/model/geocoder call, seed, new account/sign-in, secrets/env copy, production deployment or remote Git operation occurred.

CLI flags/export semantics were checked against installed help and current [official dev documentation](https://docs.convex.dev/cli/reference/dev) and [export documentation](https://docs.convex.dev/cli/reference/export); exact forbidden-write behavior is supported by the installed1.46.0 source above.
