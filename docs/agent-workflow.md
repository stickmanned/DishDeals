> Latest October4 routing: William reports Claude Code reset and directs Claude Code Sonnet5.5/high for Loom and Sonnet5.5/medium for Cinder/Mica/Prism. Antigravity actual low-credit errors occurred on all lanes; files/commits preserved, same nodes replaced in place. Continue existing bounded packets, no new ticket autopull. Northstar unchanged GPT6.1Sol/high.

> October4 quota routing amendment: Claude Code shared usage limit was reported by Prism at 01:47. William directs switching at less than 1% remaining to Antigravity Claude Sonnet 5.5 until that quota runs out. Reuse the same Maestri nodes, worktrees and packets with in-place replacement; preserve source and handoffs. No credit purchases, extra-usage enablement or account changes. A stale footer alone is not failure evidence: verify a fresh request. Northstar remains GPT-6.1 Sol/high.

> October4 worker routing: William authorized Claude Code after Gemini quota exhaustion. Loom, Mica, Prism and Cinder are reused; no duplicate recruits. Historical Gemini routing below is superseded for current packets. Human-reported iPhone Xcode build passed; actual device flow remains pending.

> Active October 3 assignment supersedes historical dispatch limits and remote Git loop below. T-01/T-02 are DONE. Northstar may release successive bounded batches T-03–T-21 plus native integration. Local commits and reviewed local integration only; do not push, publish PRs or sync cloud. Workers read current packets from the workflow checkout; preserve the root human checkout. Coverage/evidence: docs/workflow/coverage.md.

# DishDeals parallel development

GitHub `main` is the shared integration branch. Each implementation task has one agent, one branch, one worktree, a reviewed contract and a bounded handoff. Fetching exposes published teammate commits; it cannot expose changes still only on their laptops. Human teammates should push small branches and PRs regularly.

## Team and isolation

| Owner | Assignment | Checkout / branch |
| --- | --- | --- |
| Northstar · Codex GPT-6.1 Sol/high · Maestro | Scheduling, contracts, independent review, integration, Delivery Board | workflow / `t-00-agent-workflow` for setup; integration thereafter |
| Loom · Claude Code | T-03 auth and profiles, after setup | auth / `t-03-auth` |
| Cinder · Gemini Flash | T-04A browser validity and time-left math | logic / `t-04-deal-logic` |
| Mica · Gemini Flash | T-04B distance arithmetic and deterministic tests | distance / `t-04-distance` |
| Prism · Gemini | T-05R teammate extraction reconnaissance, contract fixtures and bounded research | extraction / `t-05-extraction-reconciliation` |
| Human frontend teammate | Product appearance and polished components | Human-owned branch |
| Human map teammate | ALL maps, geocoding, pins, geospatial integration | Human-owned branch |

Checkouts live under the sibling `DishDeals-worktrees/` directory. The original `/Users/william/Code/DishDeals` checkout stays under human control. Never change its branch to service an agent. Never share an index or run concurrent writers on shared files. Agents are capable of reading other local files; Git ownership checks enforce workflow conventions, not an OS security boundary.

## Start a bounded batch

1. Finish T-00: publish the committed T-01/T-02 baseline plus this workflow, run CI, review the exact PR head, integrate through GitHub.
2. Northstar fetches origin, reads task packets and latest teammate branches, verifies dependencies and assigns `ready` to approved independent tasks in `docs/workflow/tasks.json`.
3. Verify the prepared auth/logic/distance/extraction worktrees match the manifest branch and contain the integrated baseline. For a task without a worktree, set it ready and use `npm run agents -- create TASK_ID`; create deliberately refuses existing paths/branches. Run `npm ci` per worktree. Do not copy `.env.local` automatically. Pure logic and mocked tests need no provider secrets.
4. Northstar issues one bounded batch: Loom T-03, Cinder T-04A, Mica T-04B and Prism T-05R, only after checking active runtimes, current provider readiness and dependencies. T-04 is a parent acceptance ticket; never dispatch the old combined packet to another writer. The three Gemini scopes do not overlap. T-05R produces a reconciliation report and inert fixtures before any new extraction backend. Stop after these handoffs; later tickets remain backlog.

The current task manifest records prepared scopes, not an instruction to implement features during workflow setup. T-01 live browser/HTTPS/phone evidence remains pending. A coordinator may authorize local T-03 work on the reviewed baseline without pretending those live acceptance checks passed.

## Gemini-first routing and usage budget

Prism answered a fresh readiness probe on 2026-10-03 using Gemini 3.8 Flash (High); the old “AI: Out of credits” footer still appeared alongside that successful reply. Treat a current failed request as a provider blocker, not that footer alone. The human reports a Google AI plan. This verifies development-agent access only; it does not establish app Gemini API credentials, live extraction, unlimited requests or a specific subscription tier.

Default small, well-specified tasks to Gemini Flash. Cinder handles time logic, Mica handles small utilities/tests, and Prism handles teammate source reconnaissance, canonical fixtures, short official-documentation lookups and later independent QA when not the author. Reuse these sessions; do not recruit more copies or allow nested agent fan-out. Start with at most three concurrent Gemini requests across the workspace. Northstar handles scheduling, ambiguous contract decisions, independent final review and serialized integration on GPT-6.1 Sol/high. Loom handles complex auth/backend changes. Do not use Codex/Claude for routine file discovery, summary rewriting or mechanical tests Gemini can finish.

The new Gemini worker commands select the installed `gemini-3.8-flash-medium` model with medium effort. Existing Prism stays on its working Flash/high session to preserve context. Increase effort only for a specific difficult task after inspecting the failure; do not change provider silently. Runtime unattended permissions are separate from file ownership and require explicit setup authorization. A routing document does not grant additional filesystem access.

Each microtask prompt contains: task ID; exact checkout/branch and source SHA; only relevant files and agreed contract; writable paths; one measurable outcome; targeted checks; and a short handoff (status, changed paths, checks, unresolved decision, commit/PR). Prefer one function plus tests or one short report. Split oversized packets before dispatch. Do not paste the entire repo/plan into every prompt. Ask for a concise result and store longer evidence in the owned handoff. Full quality checks run once per completed PR and again after material changes; use targeted checks while iterating.

If Gemini stalls or fails twice on the same issue, return the evidence and smallest unresolved question to Northstar. Preserve the branch; do not retry an identical prompt indefinitely or silently switch to Claude/Codex. At quota exhaustion, park that lane; no credit purchases, overage-setting changes or account changes. Multiple sessions use the same account allowance. Google explains that straightforward tasks consume less quota and that AI-credit overages are separate: [plans](https://antigravity.google/docs/plans?app=cli). CLI options were verified locally with `agy --help` and `agy models`; see [official CLI reference](https://www.antigravity.google/docs/cli/reference/).

## Git loop

```sh
git fetch --no-write-fetch-head origin
npm run agents -- status
npm run agents -- sync
npm run agents -- check T-04A
npm run check
git add lib/validNow.ts lib/validNow.test.ts docs/handoffs/t-04a.md
git commit -m "Implement T-04A deal validity logic"
git push -u origin t-04-deal-logic
gh pr create --base main --draft --title "T-04A: deal validity" --body-file /tmp/t-04a-pr.md
```

`sync` only fast-forwards a clean task branch. If branches diverge, preserve commits and stop for Northstar to integrate `origin/main` in that task worktree explicitly; do not reset, stash, force push or rewrite a teammate's branch. Remote feature branches are read with `git show origin/<branch>:<path>` or `git diff`; fetch never merges their code automatically.

Only Northstar integrates approved PRs, one at a time (the setup installer may land T-00 after Northstar review). Require the `quality` CI check, an independent review of the exact current head and ownership evidence. Reviewers do not self-approve an implementation. Keep PRs small; re-run review/checks after material changes or integration conflicts. No auto-merge of failing checks. Verified main protection (2026-10-03) blocks force pushes/deletions, requires a PR, resolved conversations and an up-to-date green `quality` from GitHub Actions, including for admins. GitHub human approval count is zero so a solo hackathon team can land after recorded independent AI review; an AI review is recorded as evidence, not misrepresented as a human GitHub approval.

## Contracts and shared resources

`lib/dealSchema.ts` and `convex/schema.ts` are canonical. Read `docs/decisions/0001-teammate-backend-integration.md` before importing teammate extraction. Shared files (schema, generated Convex APIs, dependency manifest/lock, provider/layout, CI) have one coordinator-issued owner at a time. T-03 owns provider/layout for this batch; T-04A and T-04B have distinct pure lib files and handoffs. Other workers request a narrowly scoped ownership amendment before changing a shared file.

All schema changes and live Convex dev syncs are serialized. Existing approval covered T-02 on `proper-marmot-82`; it is not blanket permission for later migrations or production. Local checks and tracked generated files require no cloud deployment. Never run `convex dev` in every worktree against the same deployment. Keep project configuration outside committed source; only explicitly authorized backend workers receive needed secrets, never through chat.

Server keys stay server-side. No scraping, invented coordinates, currency assumptions or fabricated confidence. Coordinate contracts remain for the human map owner. Distance arithmetic in T-04 does not authorize geocoding or map wiring.

## Maestri communication

Northstar is the hub. Workers run `maestri list` and read connected Workflow/Delivery Board before starting. Maestro uses `ask --batch` for independent assignments. Workers return their handoff directly to a caller already awaiting an `ask`; do not issue a blocking ask back to that caller. For free-standing questions, ask a free peer or put a short blocker in the task handoff and let Northstar schedule it. Never create circular waits. A worker can publish an assigned draft branch/PR; only Northstar integrates.

No automatic unlimited task queue, background polling routine or surprise notification. Model quota failures are blockers, not hidden reassignment or automatic paid overages. Keep Northstar GPT-6.1 Sol/high; do not change provider/model without instruction.

## Handoff and validation

Use `docs/handoffs/TEMPLATE.md`. CI installs from the lock and runs typecheck, lint, tests, workflow tests and build without provider credentials or deployment. Mock tests cannot establish live auth/extraction acceptance. Phone tests, latency and live integrations stay pending until measured. Convex's authentic generated files are tracked in the T-02 baseline, so clean CI does not need live codegen. The earlier research report's claim that they were ignored was incorrect.

Recovery: preserve a failing branch and its worktree, document the blocker, repair or revert with a new commit. Never delete a worktree containing uncommitted work. Retire clean merged worktrees only after their evidence has been retained.

Northstar uses `git fetch --no-write-fetch-head origin` because its sandbox prohibits FETCH_HEAD writes. If a Git metadata operation is denied, report it and schedule the exact Git operation through the idle integration operator or Loom; do not weaken the sandbox or claim the sync succeeded.
