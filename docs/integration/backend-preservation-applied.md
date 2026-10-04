# Published backend preservation, applied locally (N-REMOTE-B)

Base `475146057701b7f4ea6d7e8e3484b40cd9ba6447`. `docs/integration/backend-preservation.patch` applied with `git am --3way` (both commits kept). Only conflicts: `convex/convex.config.ts` and `convex/_generated/server.d.ts` env lists, resolved as a union of geocode, image, reel and workflow names. Local only: no cloud, provider, secret, env read, codegen, push or deploy. Generated types remain hand-extended.

## Verified against the published source (`cc47c03`)
- 26 exports across `convex/workflow/*`, `convex/trial.ts`, `convex/workflowTables.ts`: names and kinds identical. 8 `/v1` route path/method pairs identical. `workflowTables.ts` byte-identical (all tables, fields, indexes). Crons: `Remove expired deals from realtime maps` kept beside `clean expired deal image uploads`.
- Existing published records are not migrated or rewritten. Workflow offers stay separate from canonical `deals`; canonical map/publish code never reads `workflowDeals`.

## Changes beyond verbatim (contract decisions)
| area | decision |
| --- | --- |
| auth | `convex/auth.ts`: providers `[Password, Anonymous]`; same single `convexAuth` export, JWT and HTTP routes. No auto sign-in, no frontend. Guests are real `users` rows with no profile. Canonical checks (signed in, profile before publishing) unchanged. Note: a guest can now create a profile and use sign-in-only canonical features. |
| new outputs | `workflow.ai.finish` stores ready outcomes as `needs_review` (expired stays `rejected`). Output JSON, evidence and the global confidence are untouched; no four-score conversion. `reviewDeal` owner approval is the explicit review and location choice (placeId or the displayed match). |
| typed env | Every preserved runtime entry point reads `env` from `_generated/server` via `lib/workflow/config.ts`; no `process.env` in preserved sources (test-scanned). `convex/auth.config.ts` still uses `process.env.CONVEX_SITE_URL` (canonical file, outside this ticket's paths). |
| models | No implicit model names. `GEMINI_MODEL` required for extraction (fallback optional); `GEMINI_SEARCH_MODEL`, `GEMINI_WEB_SEARCH_MODEL`, `GEMINI_COMPARISON_MODEL` each explicit with no cross-fallback. Unset means no provider request. Deployments that relied on the old fallbacks must set these names. |
| gates | `WORKFLOW_PROVIDER_USAGE_AUTHORIZED` stays separate and off by default; reel, image and geocode gates never enable it. |
| Instagram/Meta | URL retrieval stays blocked; text, image, caption and `sourceUrl` provenance retained. |

## Corrected command notes (installed convex 1.46.0 `--help`; none run)
- `--deployment <name|reference>` exists on `export`, `import`, `data`, `function-spec`, `env list/get/set`. It does NOT exist on `dev`, `deploy` or `codegen`.
- `convex dev --once --env-file <file>`: target comes from `CONVEX_DEPLOYMENT` in that file. `convex deploy` targets the project's default production deployment (or the `CONVEX_DEPLOY_KEY` one), so it must not be used for the dev backend; this corrects the earlier artifact.
- `function-spec --file` takes no path argument (earlier artifact was wrong). `import --replace-all` deletes tables absent from the import; prefer `--replace`/`--append`/`--table`. `env list --names-only` is the safe name listing.
- Target inspection, backup, deploy, codegen and live provider use remain unrun and unapproved.

## Tests (synthetic; mocked fetch, in-memory backend, locally generated signing key)
`tests/auth/publishedProvider.test.ts` (real `signIn` for anonymous and password, export surface, discovery/upload/`/v1` routes, canonical checks), `tests/workflow/compat.test.ts` (manual review, existing records unchanged, model/env, Instagram), plus updated preserved tests. Mutation checks failed tests for each guarantee.
