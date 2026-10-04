# N-CONFIG-D handoff

- **Status:** Complete / ready for review and local integration by Northstar.
- **Owner, branch, worktree, base SHA:**
  - Owner: Cinder (Antigravity Gemini 3.8 Flash High)
  - Branch: `t-19-regional-release-config`
  - Worktree: `/Users/william/Code/DishDeals-worktrees/regional-release-config`
  - Base SHA: `832fc0bba304ef7d9bb16e952d3590d362dcc829`
- **Scope and writable paths:**
  - `scripts/check-release-config.mjs`
  - `tests/setup/releaseConfig.test.ts`
  - `docs/release/native-release-plan.md`
  - `docs/release/manual-hosting.md`
  - `docs/handoffs/n-config-d.md`

## Endpoint Verification Evidence
- Live public reachability checks (`curl -s -o /dev/null -w "%{http_code}\n"`):
  - `https://dishdeals-demo.vercel.app`: HTTP 200
  - `https://proper-marmot-82.ca-central-1.convex.cloud/version`: HTTP 200
  - `https://proper-marmot-82.ca-central-1.convex.site/.well-known/jwks.json`: HTTP 200
  - Legacy unregional `https://proper-marmot-82.convex.cloud/version`: HTTP 404
  - Legacy unregional `https://proper-marmot-82.convex.site/.well-known/jwks.json`: HTTP 404

## Failure Reproduction & Regression Testing
1. Pre-fix reproduction:
   `node scripts/check-release-config.mjs --website https://dishdeals-demo.vercel.app --backend https://proper-marmot-82.ca-central-1.convex.cloud --site https://proper-marmot-82.ca-central-1.convex.site`
   Failed with:
   `FAIL backend: host must be proper-marmot-82.convex.cloud`
   `FAIL site: host must be proper-marmot-82.convex.site`
2. Test-first regression:
   Added 5 test cases to `tests/setup/releaseConfig.test.ts` capturing regional URL acceptance, official region support (`eu-west-1`, `ca-central-1`, `ap-southeast-2`), arbitrary suffix rejection (e.g. `us-west-2`), region mismatch rejection between backend and site, and explicit `--region` handling. Tests initially failed (6 failing tests), proving regression coverage.

## Changes Implemented
- `scripts/check-release-config.mjs`:
  - Added support for official Convex regions enumerated in documentation: `US` (legacy no-subdomain), `eu-west-1`, `ca-central-1`, `ap-southeast-2`.
  - Added strict domain validation: arbitrary suffixes or unlisted regions are rejected (`backend: host has unsupported Convex region "..."`).
  - Added region matching check: backend and site must share the exact same deployment AND region.
  - Added optional `--region` flag support with normalization (`ca-central-1`, `aws-ca-central-1`, `eu-west-1`, `aws-eu-west-1`, `ap-southeast-2`, `aws-ap-southeast-2`, `us`, `aws-us-east-1`).
  - Derived matched validated tuple when `--region` is omitted with no broad trust.
  - Preserved strict bare-origin checks (no trailing slash, path, query, fragment, credentials, port, IP literals, placeholders) and syntax-only label.
- `tests/setup/releaseConfig.test.ts`:
  - Added test coverage for regional origins, all official regions, arbitrary regional suffixes, backend/site region mismatch, and explicit/invalid `--region` flag.
- `docs/release/native-release-plan.md`:
  - Updated Fixed Facts and Validator section with regional `ca-central-1` deployment origins and `--region` parameter documentation.
  - Updated Human Xcode steps with regional URLs and one-line command override preserving Team.
- `docs/release/manual-hosting.md`:
  - Added Operative release configuration section with validated regional endpoints.
  - Added one-line HUMAN production deployment command.
  - Added one-line native build command with setting overrides preserving Xcode Team without XcodeGen regeneration.

## Checks Actually Run
1. `curl -s -o /dev/null -w "%{http_code}\n"` on all regional & legacy endpoints: Verified 200 on regional and 404 on legacy unregional.
2. `npx vitest run tests/setup/releaseConfig.test.ts`: 25 passed (20 existing + 5 new regional tests).
3. `npm run typecheck`: clean (exit code 0).
4. `npm run lint`: clean (exit code 0).
5. Direct CLI validator invocations:
   - Regional URLs without `--region`: `OK release URLs are well formed. Syntax only: reachability, ownership and TLS are not checked.` (exit 0)
   - Regional URLs with `--region ca-central-1`: OK (exit 0)
   - Regional URLs with `--region eu-west-1`: FAIL (exit 1)
   - Legacy US URLs: OK (exit 0)
   - Unsupported region suffix (`us-west-2`): FAIL (exit 1)
   - Region mismatch (`backend ca-central-1` + `site eu-west-1`): FAIL (exit 1)

## One-Line Operative Human Commands
- **Production web deploy (human-owned, project already linked on Mac):**
  ```sh
  /tmp/dishdeals-vercel deploy --prod --yes --build-env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud --build-env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site --env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud --env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site
  ```
- **Native build command override preserving Team (only needed if native URLs/settings change):**
  ```sh
  xcodebuild -project ios/Dinedeals.xcodeproj -scheme Dinedeals -destination 'generic/platform=iOS' WEBSITE_URL="https://dishdeals-demo.vercel.app" BACKEND_URL="https://proper-marmot-82.ca-central-1.convex.cloud" build
  ```
- **Headless validator command:**
  ```sh
  node scripts/check-release-config.mjs --website https://dishdeals-demo.vercel.app --backend https://proper-marmot-82.ca-central-1.convex.cloud --site https://proper-marmot-82.ca-central-1.convex.site --deployment proper-marmot-82 --region ca-central-1
  ```

## Boundaries & Stop Condition
- Geocoding remains OFF until real contact is provided.
- Web deployment is human-only; no automated cloud deploy executed.
- No XcodeGen regeneration, `ios/project.yml` edits, or schema/model alterations.
- Single ticket N-CONFIG-D completed; stopping for Northstar review and integration.
