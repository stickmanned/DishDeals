# N-RELEASE-B backend release record (DEVELOPMENT only)

Target: `dev:proper-marmot-82` (team william-wen, project dishdeals, ca-central-1), selected explicitly (`--deployment proper-marmot-82` for reads, a private env file holding only that non-secret name for the push). No `CONVEX_DEPLOY_KEY` is set anywhere; the CLI's existing login was used. No production, `convex deploy`, restore, import, seed, or human data written. Secret values were never printed or copied; env listings were masked in the pipe.

## Applied code
Pinned base `5f3b23e942a25758f9cebe837ab7ccbfe71aff8d` (branch `t-19-dev-backend-release`) pushed once with `npx convex dev --once --typecheck disable` at 02:29:59 local on 2026-10-04. Shipping code is unchanged by this ticket; only `convex/_generated/{api,server}.d.ts` were regenerated (import order and env typed as `readonly X: string | undefined`), committed with this record. Generated `.d.ts` files are not part of the bundle, so the deployed code is exactly the base.

## Preservation preflight (before the push)
- Functions: 46 named functions + 10 HTTP routes deployed; every one is still defined by the pinned code (auth's four come from the `convexAuth` destructuring export).
- Tables (17): none missing locally. Field-level diff of every document type: 16 tables identical (including `deals`, auth, `profiles`, `votes`, all `workflow*`); `reelItems` gains only six optional fields (`draftEdited`, `draftRevision`, `mediaBytes`, `mediaMime`, `nativeContext`, `sourceKind`). Additive: tables `dealUploads`, `geocodeGate`, `geocodeCache`, one index `deals.by_image`. No index dropped.
- Components: `workflow` mounted before; `geospatial` was not mounted and was newly installed.
- Env names before: GEMINI_API_KEY, GEMINI_MODEL, GEOAPIFY_API_KEY, JWKS, JWT_PRIVATE_KEY.

## Backup (before the push)
`/tmp/dishdeals-dev-backup.d6aS8c/proper-marmot-82-pre-sync.zip` (dir 0700, file 0600), 95,190 bytes, sha256 `3d4da8bfb3a0e9532a05eab913b7d52519ccf82698e88bc9ae14f41f67eead17`. Data + file storage export (`npx convex export --include-file-storage`); `unzip -t` clean; 17 tables; users 6, authAccounts 6, workflowDeals 4, workflowJobs 5; file storage was empty (0 files). It is a snapshot export, not a rehearsed restore. It contains personal data: keep private, delete when no longer needed.

## After the push
- Function spec: nothing removed (functions or routes); +22 functions (deals, users.me/upsertProfile, votes.cast, extract.extractDeal, geocode.geocode, upload registry, geocode state, seed (not run), reel attachSupplied/sourceTarget/workSource) and +4 HTTP routes (`/reel-source`, `/deal-image`, each POST + OPTIONS).
- Row counts unchanged: users 6, authAccounts 6, workflowDeals 4, workflowJobs 5; new tables empty; `deals` 0.
- Read-only checks: `deals:listRecent`/`listNearby` reachable (reject missing args with validators); `reels:list` → "Not signed in"; JWKS and OpenID configuration 200; `OPTIONS /reel-source` and `/deal-image` → 403 and unauthenticated POST → 503 (fail closed, `REEL_WEB_ORIGIN` unset); no human deal/account inserted.
- Root checks on this checkout with the regenerated files: `tsc --noEmit` 0, eslint 0, vitest 64 files / 1695 tests pass.

## Environment (names; values shown only for non-secret flags/models)
Set by this ticket after `convex env set` (a first attempt failed on invalid names from a shell word-splitting mistake and set nothing; the final list was re-read): `GEMINI_REEL_MODEL=gemini-3.8-flash`, `GEMINI_IMAGE_MODEL=gemini-3.8-flash`, `REEL_MEDIA_USAGE_AUTHORIZED=true`, `IMAGE_PROVIDER_USAGE_AUTHORIZED=true`. Pre-existing and untouched: `GEMINI_API_KEY`, `GEOAPIFY_API_KEY`, `JWKS`, `JWT_PRIVATE_KEY` (all present, masked), `GEMINI_MODEL=gemini-3.5-flash-lite` (legacy workflow).
Unset on purpose or pending (names only): `REEL_WEB_ORIGIN` (Northstar supplies after the host exists; uploads stay closed until then), `GEOCODE_USAGE_AUTHORIZED`, `GEOCODE_USER_AGENT`, `GEOCODE_ENDPOINT`, `GEMINI_IMAGE_FALLBACK_MODEL`. Old gates stay off: `REEL_PROVIDER_USAGE_AUTHORIZED`, `SCRAPECREATORS_API_KEY`, `WORKFLOW_PROVIDER_USAGE_AUTHORIZED`, `WORKFLOW_API_TOKEN` are unset, and the resolver is disabled in code.

## Named limitations and blockers
1. **Convex's own typecheck did NOT pass.** `convex dev --typecheck enable` stopped before pushing with one error: `lib/profile.ts(1,25) TS2307` — the type-only import `@/convex/_generated/dataModel` is unresolved under `convex/tsconfig.json` (no `@/` alias). The push used `--typecheck disable`; root `tsc --noEmit` passing is a different config and is not equivalent. The import is type-only so the bundler erases it. **Proposed exact amendment (not applied; shipping code is read-only here):** in `lib/profile.ts` line 1 change `"@/convex/_generated/dataModel"` to `"../convex/_generated/dataModel"`; `lib/dealEdit.ts:10` has the same alias but is not reached by the Convex project today. After it, rerun `npx convex codegen` / `convex dev --once` with typecheck enabled (a second push, needing its own go-ahead).
2. **Geocoding stays disabled.** `GEOCODE_USAGE_AUTHORIZED` is unset and no User-Agent was invented. Per the review, it may be enabled once an owned public HTTPS DishDeals URL exists, using an identifying app User-Agent built from that URL (no invented email), within Nominatim policy (identifying app UA/Referer, global ≤1 req/s, cached explicit searches only, no autocomplete or bulk). The source already enforces the bounds.
3. `REEL_WEB_ORIGIN` pending host. No guessed origin.
4. The Gemini key is present but its validity and the account's model availability/billing for `gemini-3.8-flash` are untested; no model, extraction or geocode call was made.
5. Observation (preserved teammate code, unchanged): `GET /v1/deals` returns the teammate workflow deals without a token; the token only gates writes/provider routes.

Native build, real phone and live provider acceptance remain separate.
