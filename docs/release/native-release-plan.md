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
A, B, C and D are **explicit external approval boundaries given by the user (William)**, not file or tool permission prompts. Each is a separate approval; approval of one never implies another. Nothing below has been run.

**A. Inspect + backup of `proper-marmot-82`.** Needs: confirmation that the CLI login is the owning account, and a private archive directory outside Git. Do not assume the home folder is writable; create and verify a private directory first (not under the repo):
```
umask 077
BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dishdeals-backup.XXXXXX")"   # mode 0700; check with ls -ld; move to durable private storage afterwards (tmp can be cleared)
npx convex env list --names-only --deployment proper-marmot-82      # names only, no values
npx convex data --deployment proper-marmot-82                        # table list; confirm flags with --help first
npx convex export --include-file-storage --deployment proper-marmot-82 --path "$BACKUP_DIR/proper-marmot-82-<date>.zip"
```
`--include-file-storage` is required for owned uploads. An export without it is **not** a complete media backup and must not be reported as one. Send output to the terminal only; write no logs and paste no document data into chat or Git.

**B. Additive dev sync from the reviewed SHA, then codegen and rechecks.** Needs: the target source SHA (to be chosen later, after the Loom context work and native review), group A done, and an env file outside the repo containing `CONVEX_DEPLOYMENT=dev:proper-marmot-82` (exact string form to be confirmed by the human).
- Use a **new isolated release worktree**, never the human/root checkout, and no `git reset`:
```
git worktree add <NEW_PATH>/dishdeals-release-<sha> --detach <REVIEW_SHA>   # then npm ci there
cd <NEW_PATH>/dishdeals-release-<sha>
```
- **Pre-apply review of cloud versus source.** Convex 1.46.0 has no diff/dry-run for `dev` (verified in `convex dev --help`: only `-v`, `--once`, `--env-file`, `--codegen`, `--typecheck`). `convex deploy --dry-run` exists but targets the production deployment or a deploy key, so it must not be used for `proper-marmot-82`. `convex dev --once` **applies** the sync; `-v` only prints the changes as they are applied and is not a review step. Therefore review before applying, from group A output: compare the cloud table list (and `convex function-spec --deployment proper-marmot-82` if its help confirms it) with `convex/schema.ts`. The cloud schema may hold tables that the published source does not define. If any cloud table or index is missing from source, or anything would be deleted, **halt** and ask.
```
npx convex dev --once --env-file <PRIVATE_ENV_FILE> -v     # applies; only after the comparison above is clean
npx convex codegen --dry-run                                # then without --dry-run only if generated files must change
npm run typecheck && npm run lint && npm test
```
- **Rollback.** There is no automatic rollback. A data import restores data only, not source, config or env. Restoring a backup into the deployment is destructive (it replaces data), needs its **own separate approval**, and is never run automatically.

**C. Owned Next HTTPS preview host.** UNRESOLVED: the host is still missing, and William has been asked which owned account to use. No new accounts or domain. Needs: a host the human already owns that runs a Node server (or Docker), and approval for its usage/pricing. Procedure: `npm run build`; `npm run start` on that host; set `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` (and `NEXT_PUBLIC_WORKFLOW_CONVEX_URL` if used) to the group B values at **build** time (`NEXT_PUBLIC_*` is inlined). Then run the validator with the real host and check dynamic routes load over HTTPS.

**D. Provider, model and geocoding usage.** UNRESOLVED pricing and authorization. Every flag stays unset or not `"true"` until it is separately approved, and each is its own decision. Names are taken from `convex/convex.config.ts`:
| area | model / config names | separate gate | state |
| --- | --- | --- | --- |
| Reel analysis | `GEMINI_REEL_MODEL` (primary), `REEL_WEB_ORIGIN` | `REEL_MEDIA_USAGE_AUTHORIZED` (video analysis only); legacy resolver permanently retired, keep `REEL_PROVIDER_USAGE_AUTHORIZED` false | off |
| Image extraction | `GEMINI_IMAGE_MODEL` (primary), `GEMINI_IMAGE_FALLBACK_MODEL` (optional) | `IMAGE_PROVIDER_USAGE_AUTHORIZED` | off |
| Geocoding | `GEOCODE_USER_AGENT` (contact; required by code), `GEOCODE_ENDPOINT` (optional) | `GEOCODE_USAGE_AUTHORIZED` | off |
| Preserved teammate workflow | `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_SEARCH_MODEL`, `GEMINI_WEB_SEARCH_MODEL`, `GEMINI_COMPARISON_MODEL` | `WORKFLOW_PROVIDER_USAGE_AUTHORIZED` | off unless separately approved; there is no resolver |

Northstar verified the current official [Gemini 3.8 Flash documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash): stable gemini-3.8-flash supports image/video/audio inputs and structured output. Account availability remains untested; retain explicit configured model names. Use existing keys only, set server-side with `npx convex env set NAME` using interactive entry (value never in shell history or logs), allow no paid overages or billing-setting changes; use existing account limits. The geocode contact/endpoint must be one the human is willing to identify to the geocoding service.

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

Handoff, commands and results: [`docs/handoffs/n-release-a.md`](../handoffs/n-release-a.md).

## October 4 authorization amendment
William explicitly authorized the scoped DishDeals demo hosting on the existing connected Vercel account and backed-up additive development sync to proper-marmot-82, plus existing-provider screenshot/recording extraction and configured geocoding usage. No production release, new accounts, purchases, paid overages, Instagram resolver, unrelated-host changes or destructive data restore are authorized. Root combined checks must pass before sync. The connected Vercel account has no DishDeals project; existing cbss-3dpc-website is unrelated and must remain untouched.
