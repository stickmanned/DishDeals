# N-CORE-BACKEND readiness audit

Read-only audit recorded October 4, 2026, at 05:44 America/Vancouver; live probes ran at 05:39–05:41. Authenticated source-flow acceptance remains pending William's next real-phone test. No configuration amendment is needed for the checked origin.

## Scope and baseline

- Owner: Loom. Checkout: `/Users/william/Code/DishDeals-worktrees/core-backend-readiness`; branch: `t-19-core-backend-readiness`.
- Exact clean starting HEAD: `832fc0bba304ef7d9bb16e952d3590d362dcc829`, matching the **central** `workflow/docs/tasks/N-CORE-BACKEND.md` and manifest. Central `STATUS.md` was read; historical checkout packets did not govern this audit.
- Writable paths: this report and `docs/handoffs/n-core-backend.md` only. Shipping source was inspected read-only.
- Dependencies: T-01/T-02 remain DONE by William's confirmation. N-RELEASE-B's corrective development sync `c577cd3` and reused implementation `6c69d94` are ancestors of this HEAD (`git merge-base --is-ancestor`, each exit 0).
- Existing private backup and development sync were retained. No schema/data inspection, personal records, seed, provider request, watcher, deployment, env mutation, account operation, remote push, or integration was performed.

## Actual live deployment and public auth

The already-installed Convex **1.46.0** CLI was invoked from the assigned checkout with explicit `--deployment proper-marmot-82`, using the existing authorized CLI login. No dependency or skill installation and no env-file copy were needed. The assigned checkout has no `node_modules`; the first checkout-local CLI attempt failed with `MODULE_NOT_FOUND`. Subsequent CLI reads used the existing executable at `/Users/william/Code/DishDeals-worktrees/workflow/node_modules/convex/bin/main.js` and passed.

`function-spec` resolved `https://proper-marmot-82.ca-central-1.convex.cloud`. This is fresh CLI metadata evidence of the regional endpoint, rather than a hostname guessed from the deployment name. The env CLI also identified the selected deployment as **dev proper-marmot-82**. Team/project ownership is inherited from the N-RELEASE-B record; it was not independently re-audited here.

Actual HTTP probes at 2026-10-04 12:39:46 UTC (05:39:46 Vancouver):

| Request | Observed result |
| --- | --- |
| Regional cloud `GET /version` | 200 |
| Regional site `GET /.well-known/openid-configuration` | 200; issuer `https://proper-marmot-82.ca-central-1.convex.site`; JWKS URI at that same regional site |
| Regional site `GET /.well-known/jwks.json` | 200; one RSA signing key; no private key fields present; key contents not logged |

Static `convex/auth.config.ts` uses `CONVEX_SITE_URL` as provider domain and `applicationID: "convex"`. The live regional issuer agrees with that configuration pattern. The app's canonical `ConvexAuthProvider` supplies the session; `CanonicalSessionBridge` forwards it to native, and `ShareStore.submit` uses a Bearer token with `reels:submit` against the configured HTTPS backend. No JWT/private key was read, copied, fabricated, or logged. No real token's claims or authenticated native extension request were inspected; issuer consistency alone does not prove those requests succeed. This configuration pattern matches the current [official auth configuration documentation](https://docs.convex.dev/config/auth.config.ts).

## Actual origin and unauthenticated rejection

Fresh non-secret env read: `REEL_WEB_ORIGIN=https://dishdeals-demo.vercel.app`, exactly the required origin. Each request below used the regional `.convex.site` host. Successful preflights returned `Access-Control-Allow-Origin: https://dishdeals-demo.vercel.app`, `Access-Control-Allow-Methods: POST, OPTIONS`, and `Vary: Origin`.

| Route / request | Status | Relevant response |
| --- | --- | --- |
| `/deal-image` OPTIONS, exact origin | 204 | Allowed headers `Authorization, Content-Type` |
| `/reel-source` OPTIONS, exact origin | 204 | Allowed headers `Authorization, Content-Type, X-Reel-Meta` |
| `/deal-image` POST, exact origin, no Authorization, empty body | 401 | `{"error":"auth"}` and matching CORS |
| `/reel-source` POST, exact origin, no Authorization, empty body | 401 | `{"error":"auth"}` and matching CORS |
| Both routes OPTIONS with `Origin: https://example.org` | 403 | No allowed-origin header |

The recording preflight was explicitly checked at 12:40:03 UTC with requested headers `authorization,content-type,x-reel-meta`, matching the actual client contract. An initial probe used the wrong metadata-header name; its 204 was not counted as proof that the client header was allowed.

Additional public RPC probes at 12:40:45–46 UTC sent no authentication or admin token:

| Public RPC | Arguments | Result |
| --- | --- | --- |
| query `reels:list` | `{}` | HTTP 200, Convex `status: "error"`, `Not signed in` |
| mutation `deals:generateUploadUrl` | `{}` | HTTP 200, Convex `status: "error"`, `Not signed in` |
| action `extract:extractDeal` | `{"imageIds":[]}` | HTTP 200, Convex `status: "error"`, `Not signed in`, error code `NOT_SIGNED_IN` |

HTTP 200 on these RPCs is an error-envelope transport result, not authenticated success. The empty image list satisfies the argument validator; source inspection confirms authentication is checked before the image-count check or provider use. These probes establish the checked rejection paths only, not every protected mutation's behavior or successful storage/extraction.

## Non-secret model and gate settings

Only these explicit non-secret env names were read; no secret env listing or secret value read was performed.

| Name | Fresh CLI observation |
| --- | --- |
| `GEMINI_REEL_MODEL` | `gemini-3.8-flash` |
| `GEMINI_IMAGE_MODEL` | `gemini-3.8-flash` |
| `GEMINI_IMAGE_FALLBACK_MODEL` | unset |
| `REEL_MEDIA_USAGE_AUTHORIZED` | `true` |
| `IMAGE_PROVIDER_USAGE_AUTHORIZED` | `true` |
| `GEOCODE_USAGE_AUTHORIZED` | unset, therefore OFF |
| `REEL_PROVIDER_USAGE_AUTHORIZED` | unset, therefore OFF |
| `WORKFLOW_PROVIDER_USAGE_AUTHORIZED` | unset, therefore OFF |

These match the human-confirmed model/gate setup. Model availability, API credential validity, quota/billing, extraction output, latency, and audio/video understanding remain **unverified**: this audit made no Gemini call. The unset image fallback means source uses the primary model as fallback. The legacy Instagram resolver is retired in the inspected source; URL submission does not fetch Instagram. Geocoding remains OFF until William provides real contact and a separately authorized amendment occurs; no geocoder call was made.

## Deployed metadata versus static contracts

Actual `function-spec --deployment proper-marmot-82` exit 0: **82 entries = 68 named functions + 14 HTTP routes**. All 68 named functions have object argument validators. All 23 registered functions declared in local `convex/workflow/*.ts` are present, along with all eight `/v1/*` routes. No personal data or table rows were fetched. Function-spec is metadata inspection as documented by [Convex](https://docs.convex.dev/cli/reference/function-spec); it does not prove exact deployed source equality with this checkout or the live contents of every table.

Canonical deployed names/types and relevant validators are intact:

- `users.me` query (`{}`), `users.upsertProfile` mutation (`displayName`, optional `walletAddress`). Their return validators are unspecified in the deployed metadata; this is not reported as return-schema validation.
- `deals.generateUploadUrl` mutation (`{}`); `create`, `update`, `remove` mutations; `get`, `listRecent`, `listNearby` queries. Create's required canonical fields and optional image/source/time/price/address fields remain; author/count fields are server-owned. IDs refer to `deals` and `_storage`; `listRecent` requires `limit`, and `listNearby` requires `lat/lng/maxKm`.
- `votes.cast` mutation validates `Id<deals>` and `still_on | expired`.
- `extract.extractDeal` action validates storage-ID array and optional caption/text/provenance/publication fields. Its deployed return is the reviewed extraction envelope (`result`, `manualReview`, `requiresBlockingReview`, `model`), not the original plan's bare `DealResult`.
- Private Reel submit/get/list/retry/remove/retention/draft-save APIs are present. Submit validates optional bounded-context shape and returns `itemId/duplicate`; draft-save requires expected generation and revision. Internal source/attachment/workflow functions are present with `Id<reelItems>`, owner/storage IDs and supplied-media validators.
- `geocode.geocode` action remains present but gate OFF. `seed.seedDeals` remains **internal** and was not invoked, including dry run.

Static source retains `...authTables`, canonical `deals/profiles/votes`, private `reelItems`, and `...workflowTables`; both workflow and geospatial components remain configured. Protected writes derive owners server-side; publishing requires an existing profile. The inspected recording/image routes authenticate before body storage, use private owner-checked attachment/registry functions, and call no provider directly. The recording workflow starts after owned source attachment. This is code inspection, not successful runtime ownership or publication evidence.

A TypeScript AST scan found **20 direct generated `api.<module>.<function>` client references**, all present in the deployed spec. It excludes dynamic/string-built references and does not establish Discover acceptance. An initial text-regex scan falsely counted API-hostname strings; those false positives were discarded using the AST scan. Existing central STATUS marks Discover's legacy-query failure separately; this packet neither fixes it nor claims the full app works.

## Phone evidence and remaining acceptance

William's **05:39 actual iPhone update, user-reported**: signed in, saved display name, navigated Saved Reels → Map → Profile, closed/reopened, and remained signed in. Record those checks as real-phone user evidence only. Loom did not operate the account or observe a native share request; this does not prove extension Keychain/session delivery, Instagram receipt, private save, VLM draft, confirmed publish, marker/detail, or cross-device update.

Next human step is the already-requested real Instagram share/private-save test on William's signed-in phone, followed by attachment of his own recording and a source-supported VLM draft. Use actual source ownership; no agent sign-in or fake identity. The current source supports MP4/QuickTime recordings, 1–180 seconds, up to 12 MiB. Record the exact stage/result and any displayed error without tokens or secrets. Then independently verify user edits, manual location confirmation while geocoding is OFF, publish, and saved marker/detail. Successful model execution still requires genuine supplied source and the separately authorized live test; this packet authorizes no such call.

## Checks and stop

Completed: clean branch/base check; dependency ancestry checks (0); existing CLI help/version and explicit env reads; function-spec (0); live endpoint/RPC probes (runner exits 0 with results above); static workflow/API/validator inspection. The geocode env command correctly returned its named not-found diagnostic, not `false`; OFF follows from the inspected exact-`true` gate.

Not run here: `npm run check`, Vitest, build, Convex sync/codegen, simulator, authenticated requests, live model/geocode, seed/backup/restore. There are only documentation changes; the coordinator's prior combined gate is inherited context, not a newly run result. No bug fix was assigned or made, so no regression test was added. No runtime-credit failure occurred in this audit.

Audit stop condition met. Northstar reviews/integrates the two documentation files and retains shared status ownership. Next proposed bounded work: observe William's real Instagram/private-save/recording/VLM test and assign the smallest reproduced failure, if any; no automatic next-ticket dispatch.
