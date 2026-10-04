# Instagram Reel sharing handoff

Status: implementation ready for setup and device validation; **not end-to-end verified**.
Assignment: T-20 Reel sharing/extraction, explicitly authorized by the user beyond the old screenshot-only/frontend boundaries. iPhone confirmed. No map work, deployment, provider usage, purchases, or account creation performed.

Branch `t-20-reel-sharing`; isolated checkout `C:/Users/fengy/.codex/worktrees/f259/DishDeals`. Base `83035c1`; branded frontend reused by cherry-picking `70a1672` as `d1b0f6e`. Original checkout and other worktrees were not edited. Exact writable scope: new `ios/`, `lib/reels/`, `components/reels/`, `app/reels/`, `convex/reels*`, `convex/reelActions.ts`, `convex/reelWorkflow.ts`, auth/config/http additions, additive schema/generated declarations, dependency manifests, test config, root TypeScript target, navigation links, six additive CSS rules, and this handoff/evidence. No task-board/shared-status updates.

## What was inspected and reused

- Read StormHacks plan, team integration/workflow documents, tasks manifest, T-05R packet, ADR0001 and Convex-generated guidelines before implementation.
- Fetched published refs. Teammate extraction is `origin/feature/deal-extraction` at `91b957a37c063d0b7072bb2c92afe4882699bc66`; original workflow source is `e3a39cc3398a0e0866e5dbe4e606f7e06b2ed2ca`.
- Teammate extraction already handles structured text/image extraction, strict schemas, evidence, safe server keys, and private jobs. Its URL-context path reads page text; it does not download and analyze a Reel's audio/video. Its standalone database contracts differ from the canonical root tables, so it was not merged wholesale or changed.
- Reused its extraction safeguards: untrusted-source prompt, explicit offers only, unknowns, publication-date-relative interpretation, currency caution, evidence validation, and provider-error sanitation. Adapted these to a video/caption input and canonical field names. No global confidence copied into individual fields.
- Reused the committed branded frontend and existing screenshot/caption/manual/preview/workflow functionality. Read `frontend_reference` brand kit from `Harrys-Frontend`: Bricolage Grotesque, Figtree, DM Mono, cream/stone/Char/Dine Red. Existing global styling and local fonts remain.
- Maestri is not installed here. No connected teammate messages were sent; published code and task records were inspected read-only.

## Implementation

1. `ios/project.yml` defines a native app plus a real `com.apple.share-services` extension, embedded in the app. Extension accepts URL/text attachments and posts `reels:submit` through the authenticated Convex HTTP API. It shows receipt immediately and confirms backend acceptance separately. Installed app/extension is required; installing the website to the iOS home screen does not install this extension.
2. Access token is shared through a Keychain access group, protected with `AfterFirstUnlockThisDeviceOnly`. No refresh token/provider keys enter the extension. Only the configured HTTPS main-frame web origin can send native bridge messages. Expired/missing auth or failed delivery keeps a protected local recovery link for up to 24 hours; opening the app/signing in submits it. Local links are purged when receipt is confirmed, or when expired files are next inspected. Successful native delivery removes its recovery copy after the result pointer is durably saved.
3. Private intake uses actual Convex Auth, owner IDs from verified identity, transactional indexed owner+normalized-URL deduplication, a 10/hour submission/retry limit, durable `@convex-dev/workflow` processing, a two-worker concurrency limit, and a five-attempt retry cap. No automatic retries of potentially billable provider actions.
4. Normalize direct Instagram `/reel`, `/reels`, and `/p` links (same shortcode), strip tracking and fragments, accept native shared prose with one link, reject ambiguous inputs, credentials, foreign hosts, profiles and shortened `/share/...` links. The real Instagram version's payload must be checked on your device. Unsupported payloads get a clear error instead of pretending intake succeeded.
5. ScrapeCreators public Post/Reel Info endpoint retrieves caption, publication time, duration and the actual video. Server-only API key; no provider credentials passed to media hosts. Downloads accept only HTTPS Instagram/Facebook CDN subdomains, reject redirects, check MP4 MIME/header, cap video at 12 MB and three minutes, and report private/removed/rate-limited/unsupported content clearly.
6. Gemini SDK receives inline video with its audio plus caption/date, asks for visible and spoken evidence/timestamps, and returns strict validated drafts. Caption quotes are checked verbatim; audio quotes must appear in the model-produced transcript; timestamps, dates, times, currency, prices, days and non-null-field evidence are validated. This cannot independently prove that a model's visual quote or transcript is true; human review remains required. Gemini sampling can miss brief frames.
7. `reelItems` and `reelLimits` are additive staging tables. Existing auth/profile/deal/vote tables, API names and coordinates are preserved. Unknown restaurant/price/currency/schedule/conditions are null in staging; unknown days never silently become every day. `toCanonical` validates the existing `DealResult` contract only after required unknowns are reviewed, and maps priceCad only for explicit CAD. Zero confidence is an unknown sentinel, not an estimated score. No public deal or coordinates are invented or inserted.
8. `/reels` supplies real sign-in, private history, reactive status, editable multiple drafts, immutable original extraction/evidence/transcript, failed-item retries, deletion, 1/7/30-day retention and direct result URLs. Downloaded media is deleted after extraction/failure or deletion/expiry. Generation/existence/expiry guards prevent stale workers recreating deleted results. Captions, extraction and drafts stay until the selected retention expires. Workflow journals contain item IDs/booleans/null rather than source media or model payloads, and are cleaned after cancellation/deletion.
9. The app can request local notification permission, show completion notices when its web view observes a result, and open that result on notification tap or `dinedeals://reels/ITEM_ID`. **Closed-app remote completion notifications are not implemented**: no APNs credentials/authorized server integration were available. In-app status and reopening the saved result work independently of notification permission. Share extension deliberately avoids unsupported tricks to force-open the containing app.

Existing optional teammate-workflow auth/feed adapter is independent of the new canonical private-save session. It was preserved. Canonical private saves use `NEXT_PUBLIC_CONVEX_URL`; do not point the teammate-workflow API adapter at this schema. Community publication/map confirmation remains with its existing integration lane.

## Checks actually run

- `npm.cmd run typecheck`: pass; root target raised to ES2020 for the official workflow test dependency's BigInt syntax.
- `npm.cmd run lint`: pass, no warnings.
- `npm.cmd test`: **112/112 pass in six files**. Includes existing canonical/frontend tests and new ownership, per-owner/parallel deduplication, retrieval failures, retry fencing, media deletion, retention, malformed/evidence-unsupported extraction, and a mocked multimodal SDK request. Durable component scheduling is exercised with paid processing disabled. These are local tests, not real provider evidence.
- `npm.cmd run build`: pass; original routes and `/reels` compile. `/reels/layout-preview` renders synthetic fields only in development; production returns not found.
- `npm.cmd run test:workflow`: **22/23 pass**. Unchanged symlink-escape test fails with Windows `EPERM` creating a directory symlink. Full output: `workflow-check.txt`. Overall `npm run check` cannot be called green while this environment failure remains.
- `git diff --check`: pass.
- Registry audit: five high advisory entries in the existing ESLint/Next lint-tool dependency chain (`braces`, `micromatch`, `fast-glob`, Next ESLint plugin/config). No forced framework downgrade was applied; provider/workflow dependencies were not listed in those findings.
- Independent read-only agent reviewed preservation and source correctness, independently passed 18 targeted tests, and rechecked fixes for default HTTPS WebKit origin port, notification result routing and successful-share local recovery cleanup. See `independent-review.md`.
- Visually inspected inherited desktop-source and mobile-review screenshots against reused brand controls. New page's unconfigured browser state was inspected before interruption. **Updated desktop/mobile screenshots are pending**: browser security policy rejected reconnecting to the localhost preview and was not bypassed. Native UI screenshots, Swift compilation and phone behavior are unverified. No Swift/Xcode tools are installed on this Windows host.
- `convex dev --once`, `convex deploy`, live Gemini/ScrapeCreators calls and real account provisioning were **not run** because deployment and paid usage were not authorized. Generated TypeScript API/env declarations were extended offline for local checking; authorized Convex codegen must regenerate and verify them before deployment.

## Windows checks and web preview

From this isolated checkout:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run dev -- --hostname 127.0.0.1 --port 3012
```

Open `http://127.0.0.1:3012/reels`; without a backend URL it correctly says nothing was submitted. `http://127.0.0.1:3012/reels/layout-preview` is a clearly labeled synthetic layout fixture with saves disabled. Inspect at 390x844 and a desktop width, check all field labels, conditions/days, keyboard/focus and horizontal overflow. `test:workflow` requires an environment permitted to create symlinks (or Linux CI); do not skip the test and report a false pass.

## Backend setup requiring separate authorization

1. Choose the approved development deployment, keep this schema separate from the standalone teammate workflow, and authorize its sync before running `npx convex dev --once`. Review the additive schema/component change first. This was not deployed.
2. Configure Convex Auth's `SITE_URL`, `JWT_PRIVATE_KEY` and `JWKS` through the official setup guide; do not commit generated secrets or paste them into handoffs. The root already had auth tables; the new Password provider/http/config files wire a working auth endpoint once provisioned.
3. Configure local frontend `NEXT_PUBLIC_CONVEX_URL` to that deployment's public cloud URL. For a phone the web host must be reachable HTTPS, not Windows localhost. HTTPS hosting/deployment also requires authorization.
4. Server-only deployment vars: `SCRAPECREATORS_API_KEY`, `GEMINI_API_KEY`, and `GEMINI_REEL_MODEL` naming a video/structured-output model actually available to your API project. No app-model availability is asserted from development-agent access. Set `REEL_PROVIDER_USAGE_AUTHORIZED=true` **only after explicit authorization for provider usage and an agreed spending limit**. Otherwise saves fail clearly with CONFIGURATION and no billable provider requests.
5. Confirm provider/media retention settings in your accounts. App-side deletion cannot delete a provider's independent logs or retained inference records. Do not enable ScrapeCreators' optional paid permanent media-download feature; this adapter does not request it.

## Install native sharing on iPhone (Mac + Xcode)

1. Use an existing signing team able to provision App Groups and Keychain Sharing for both targets. No Apple account/enrollment/purchase was created. If your team cannot provision these entitlements, native authenticated sharing is blocked until you supply appropriate provisioning.
2. On a Mac with Xcode and XcodeGen available, edit `ios/project.yml`: set `DEVELOPMENT_TEAM`, unique bundle IDs, matching `APP_GROUP`/`KEYCHAIN_GROUP`, reachable HTTPS `WEBSITE_URL`, and the same canonical `BACKEND_URL` used by that website. These URLs are public configuration, not provider keys.
3. Run `xcodegen generate --spec ios/project.yml --project ios` from the repo. Open `ios/Dinedeals.xcodeproj`, review both targets' signing/capabilities, select your connected iPhone and build/run **Dinedeals**. The embedded **ReelShare** extension must be installed with it. Generated plist/entitlement/project files are ignored; the YAML is the source contract. This generation/compile was not run here.
4. Open Dinedeals on the iPhone and sign in on Saved Reels. Keep the app open once so the access-token bridge writes the shared Keychain entry. Sign in within the native app; Safari-only sign-in is a separate cookie/token context. The extension does not refresh an expired token; reopen the app to refresh/sign in.
5. In Instagram, open a **public Reel**, open the system iOS share sheet from its share menu, choose **More** if needed, then enable/select **Dinedeals**. It receives the URL/text attachment directly; no manual copy/paste is required for supported direct links. Verify the extension reports server receipt, then close it and reopen Dinedeals to its saved result.
6. Grant local alerts only if desired. No APNs registration or remote push entitlement is configured; don't expect alerts while the app is terminated.

## Phone acceptance checklist (pending)

- Record the actual Instagram share attachment/link form; direct `/reel/SHORTCODE` with tracking is supported. Report shortened `/share/...` payloads rather than marking acceptance passed.
- Share the same Reel twice (including tracking variants): one private item; two different accounts receive independent private items.
- Sign out, share offline, reopen/sign in within 24h: recovery link submits and disappears only after receipt. Verify successful native shares don't re-submit after deleting a result and reopening the app.
- Process a real Reel with meaningful caption, spoken offer and visible price/menu/conditions. Compare all extracted fields against the video; unknown currency/days/date stay unknown, and evidence contains timestamps. Measure actual receipt/processing latency.
- Test private/deleted/oversized media, provider outage/rate limits, retries and repeat tap behavior.
- Edit and reload a draft; extraction/evidence unchanged. Wrong account cannot get/edit/retry/delete another user's item. Delete while retrieving/extracting and confirm late completion cannot recreate it.
- Exercise retention and media deletion. Confirm direct result URL/deep link and notification tap opens the intended owner's result.
- Compare mobile/desktop screenshots and original feature routes. No real shared Reel has been processed during this implementation.

Next proposed work is authorized development provisioning plus Xcode/device validation of this assignment, **not another backlog ticket**. Do not integrate or deploy on the strength of mocked tests alone.

## Official references consulted

- [ScrapeCreators Post/Reel Info](https://docs.scrapecreators.com/v1/instagram/post/): endpoint, key header, media/caption payload and credits.
- [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding) and [structured output](https://ai.google.dev/gemini-api/docs/structured-output): audio/visual input and schema validation. Installed `@google/genai` **2.27.0** types were used for `models.generateContent`/inlineData/responseJsonSchema.
- [Convex Durable Workflows](https://github.com/get-convex/workflow), installed **0.4.8** README/types; Convex **1.46.0**, convex-test **0.0.60**.
- [Convex Auth manual setup](https://labs.convex.dev/auth/setup/manual), [Password provider](https://labs.convex.dev/auth/config/passwords), [Convex HTTP API](https://docs.convex.dev/http-api/).
- [Apple Share Extensions](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html), [shared Keychain](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps).
- Installed Next **16.3.8** page and use-client guides under `node_modules/next/dist/docs` before route/UI changes.
