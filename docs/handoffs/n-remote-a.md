# N-REMOTE-A handoff

- Status: review (local artifacts only; nothing applied to shared files, pushed, deployed or synced)
- Owner Prism (Claude Code); branch `t-19-backend-preservation-review`; worktree `/Users/william/Code/DishDeals-worktrees/backend-preservation-review`.
- Base: packet pinned `397c597`, amended by the coordinator to `2c97c07aecfb5055769724d83f01eb8482da388a`. The checkout was clean, so it was fast-forwarded (`git merge --ff-only`; no reset/rebase). `convex/` and `lib/` are identical across the two bases, so the inventory and patch are unaffected. Head SHA: see the commit reply.
- Published source read with `git show` at `cc47c030d929db130632cf18d124797673414ee2` (PR12, reviewed head `49e45f195df27ee2e01d9c86a7ff15f9b7f82033`).
- Scope: `docs/integration/backend-preservation.md`, `docs/integration/backend-preservation.patch`, `docs/handoffs/n-remote-a.md` only.
- Patch: `docs/integration/backend-preservation.patch`, 199,722 bytes, SHA-256 `ea13f7541adbbc74ca69a2703dcb012c15373f98a04f2b0885773ba055227ce8`, 2 commits (preserve verbatim + guard), 43 files, +2204/-4. Apply with `git am`.
- Full inventory, export/table matrix, env NAMES, model/provider/Convex differences, expected Loom conflicts, unexecuted commands and hosting options: `docs/integration/backend-preservation.md`.

## Evidence (local, scratch clone; borrowed `node_modules`, convex 1.46.0)
- Fresh clone at the pinned base: `git am` applies cleanly; tree identical to the built tree; `git diff --check` clean.
- `npx tsc --noEmit` exit 0; `npx eslint .` exit 0 with the series applied.
- `npx vitest run tests/workflow tests/backend tests/auth convex`: 23 files / 456 tests passed (workflow alone 10 files / 86). Mocked provider traffic only.
- Verbatim check: preserved published files have an empty diff against `cc47c03` (only `tests/workflow/frontend-integration.test.ts` is intentionally omitted, and `lib/workflow/http.ts` is the published routes inside a wrapper).
- Mutation checks failed tests for each removed guard (job, search, comparison gate, Instagram host block).
- Simulated Loom merge (`b094159`, `ee2d892` on `e4d9cec`): conflicts only in `convex/convex.config.ts` and `convex/_generated/server.d.ts` (union of env lists); schema and `api.d.ts` auto-merge.

## Findings the coordinator must decide
1. Published code retrieves any `type: "url"` source (Instagram included) via Gemini URL context and its tests asserted Instagram acceptance. Patch commit 2 blocks Instagram/Meta hosts; the published frontend must send Instagram captions as `type: "text"` + `sourceUrl` (human-owned frontend, not patched).
2. No provider-usage gate existed. Patch adds `WORKFLOW_PROVIDER_USAGE_AUTHORIZED`.
3. Anonymous provider: the patch leaves canonical `[Password]`. Options A (drop; guest history unreachable, not deleted) vs B (separate packet to restore, with quota-abuse and native-flow cautions).
4. Auto-publish of high-confidence workflow offers with unconfirmed Geoapify pins conflicts with the canonical pin/confidence rule; kept only because it is deployed behavior.
5. Implicit default model `gemini-3.8-flash` (current per Google's models page) and `process.env` reads vs our explicit-model/typed-`env` rule; Google's current docs lead with the Interactions API, so grounded search and URL context need an authorized live probe (the teammate reports free-tier 429).

## Unrun / external
Preflight, backup, codegen, deploy and restore commands are listed, not run, in the integration doc (explicit deployment target and per-step approval required). No cloud, provider, secret, browser, native, remote git or deploy action was taken. Live behavior of the deployed `proper-marmot-82` was not inspected; teammate docs are the only evidence of its contents. Release approval must separately name remote pushes, frontend deploy, backend target/sync and each provider's usage. Native `WEBSITE_URL`/`BACKEND_URL` placeholders stay unset until approved.

Stop condition met; no next ticket started.
