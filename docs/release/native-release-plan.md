# Native release preparation plan (N-RELEASE-A)

Status: **local preparation only.** Nothing here was run against any cloud, host, provider or device. No deployment data, env value, key or account was inspected. Base `25cc20b`, branch `t-19-native-release-preparation`.

## Fixed facts (from this checkout)
- Backend target: existing **development** deployment `proper-marmot-82`. Client URL `https://proper-marmot-82.convex.cloud`; site (HTTP routes) `https://proper-marmot-82.convex.site`. These names come from the ticket, not from inspecting the deployment.
- App: Next 16 with dynamic routes (`app/deal`, `app/post`, `app/reels`, `app/map`, `app/profile`, `app/signin`). Static pages are **not equivalent**: Next's official deploy guide lists the Node.js server (`npm run build` then `npm run start`) and Docker as supporting all features; static export does not. Release needs a real Node host.
- Web env names read by code: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_WORKFLOW_CONVEX_URL`. Deployment-side: `CONVEX_SITE_URL` (auth config). Provider/model names from `docs/integration/backend-preservation-applied.md`: `GEMINI_MODEL`, `GEMINI_SEARCH_MODEL`, `GEMINI_WEB_SEARCH_MODEL`, `GEMINI_COMPARISON_MODEL`, `WORKFLOW_PROVIDER_USAGE_AUTHORIZED` (off by default).
- iOS ([`ios/project.yml`](../../ios/project.yml)): build settings `WEBSITE_URL`, `BACKEND_URL` flow into `WebsiteURL` (app) and `BackendURL` (app + `ReelShare` extension) in Info.plist. Code appends `route` to `WebsiteURL` and `/api/mutation` to `BackendURL`, requires https, and the share store requires a `.convex.cloud` host. So both must be bare origins (no trailing slash/path). `DEVELOPMENT_TEAM` is empty in YAML on purpose: the human's Xcode project holds the working Team.

## Installed tooling (command lookup/help only)
| tool | result |
| --- | --- |
| node | `/opt/homebrew/bin/node` |
| convex CLI | 1.46.0 via `npx --no-install convex` (help read) |
| gh | `/opt/homebrew/bin/gh` (read-only use) |
| xcodebuild / xcrun | `/usr/bin/…`, Xcode 27.0 (27A266a) |
| vercel | **not installed**; no host CLI available |

Convex help facts (1.46.0, none executed beyond `--help`):
- `--deployment <name|ref>` exists on `export`, `import`, `data`, `function-spec`, `env list/get/set`. It does **not** exist on `dev`, `deploy`, `codegen`.
- `convex dev --once --env-file <file>`: target comes from `CONVEX_DEPLOYMENT` inside that file. `--once` runs the first 3 steps (configure, sync, optional run) then exits. `--codegen enable|disable`, `--typecheck` exist.
- `convex deploy` targets the project's default **production** deployment (or the `CONVEX_DEPLOY_KEY` target). It must not be used for `proper-marmot-82`.
- `convex codegen` regenerates `convex/_generated` from local code; does not change the deployment (`--dry-run` available). `convex export --path <zip|dir>` defaults to the dev deployment; `--include-file-storage` optional. `convex env list --names-only` lists names without values.
- Apple device docs ("Running your app in Simulator or on a device") could not be parsed here; device steps below rely on Xcode UI and need human confirmation. Free-account specifics (provisioning lifetime, App Group/Keychain capability availability) are **unverified**.

## Validator (local, no network)
`node scripts/check-release-config.mjs --website https://HOST --backend https://proper-marmot-82.convex.cloud --site https://proper-marmot-82.convex.site [--deployment NAME]`
Checks syntax only: strict https URL, no credentials/query/fragment/port/path/trailing slash, no placeholder/localhost/IP, backend host `<deployment>.convex.cloud`, site host `<deployment>.convex.site`, website not a Convex host. Takes no files or secrets, makes no calls or writes. It cannot prove ownership, reachability or TLS.

## Authorization groups to request (none granted yet)
Each group is a separate approval; approval of one never implies another.

**A. Inspect + backup of `proper-marmot-82`.** Needs: confirmation the CLI login is the owning account, and a private backup path outside Git (for example a `0700` directory in the home folder; never under the repo).
```
npx convex env list --names-only --deployment proper-marmot-82      # names only, no values
npx convex data --deployment proper-marmot-82                        # table list; confirm flags with --help first
npx convex export --deployment proper-marmot-82 --path <PRIVATE_DIR>/proper-marmot-82-<date>.zip
```
Do not paste output containing document data into chat or Git.

**B. Additive dev sync from the reviewed SHA, then codegen and rechecks.** Needs: the integrated review SHA, group A done, and an env file with `CONVEX_DEPLOYMENT=dev:proper-marmot-82` kept outside the repo (value to be confirmed by the human; do not guess the exact string form).
```
git checkout <REVIEW_SHA>            # clean tree
npx convex dev --once --env-file <PRIVATE_ENV_FILE>
npx convex codegen --dry-run          # then without --dry-run only if generated files must change
npm run typecheck && npm run lint && npm test
```
Sync is expected to be additive (new tables/indexes/functions); review the `-v` diff listing for deletions before accepting. Rollback is restoring the group A export.

**C. Owned Next HTTPS preview host.** UNRESOLVED: host/provider not chosen, no new accounts or domain. Needs: a host the human already owns that runs a Node server (or Docker), and approval for its usage/pricing. Procedure: `npm run build`; run `npm run start` on that host; set `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` (and `NEXT_PUBLIC_WORKFLOW_CONVEX_URL` if used) to the group B values at **build** time (`NEXT_PUBLIC_*` is inlined). Then run the validator with the real host and check dynamic routes load over HTTPS.

**D. Provider/model usage.** UNRESOLVED pricing/authorization. Needs: named models for each of `GEMINI_MODEL`, `GEMINI_SEARCH_MODEL`, `GEMINI_WEB_SEARCH_MODEL`, `GEMINI_COMPARISON_MODEL` as approved, existing keys only, set server-side with `npx convex env set NAME` using interactive entry (value never in shell history or logs), and a spend ceiling. `WORKFLOW_PROVIDER_USAGE_AUTHORIZED` stays off until this approval is given. No overages.

## Human Xcode steps (after A–C; no xcodegen)
1. Open the existing project. Do not regenerate it; keep the working Team on both targets (Dinedeals, ReelShare).
2. In project Build Settings (all configurations used for device builds) set `WEBSITE_URL` to the group C origin and `BACKEND_URL` to `https://proper-marmot-82.convex.cloud`. Values are origins only.
3. Build to the device. Verify in the **built** products (plist only, no secrets):
```
/usr/libexec/PlistBuddy -c 'Print :WebsiteURL' <Dinedeals.app>/Info.plist
/usr/libexec/PlistBuddy -c 'Print :BackendURL' <Dinedeals.app>/Info.plist
/usr/libexec/PlistBuddy -c 'Print :BackendURL' <Dinedeals.app>/PlugIns/ReelShare.appex/Info.plist
```
App and extension `BackendURL` must be identical, and the two URLs must pass the validator.
4. A code signature on the artifact proves signing only, not installation or App Group/keychain runtime sharing; that is proven only on the phone.

## Status separation
- Implementation-ready: validator and tests (local).
- Native build: **pending** human Xcode build with real URLs.
- Real iPhone: **pending** (install, share extension to app handoff, sign-in, save flow).
- Cloud/host/provider: **unapproved and unrun.**

## Log hygiene
Redirect nothing that prints env values. Use `--names-only`; never run `env list/get` without it; do not `cat` env or backup files; keep export zips and env files out of the repo and out of chat.

## Handoff / checks (N-RELEASE-A)
- `npm ci --prefer-offline --ignore-scripts` (lockfile-consistent, local `node_modules`, git-ignored); no other install or global config.
- `vitest run tests/setup`: 19/19 pass. ESLint clean on the two new files. CLI smoke: valid origins exit 0, bad input exits 1 with `FAIL` lines.
- Full `tsc --noEmit` reports only `@restaurant-deals/map` resolution errors because `map-component` is not built in this checkout (human-owned map area, untouched). Root full checks were not rerun here.
- Unresolved before any cloud step: host/provider for group C, spend ceiling and models for D, confirmation of owning CLI account for A.
