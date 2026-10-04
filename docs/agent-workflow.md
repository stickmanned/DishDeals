# DishDeals parallel development

GitHub `main` is the shared integration branch. Each implementation task has one agent, one branch, one worktree, a reviewed contract and a bounded handoff. Fetching exposes published teammate commits; it cannot expose changes still only on their laptops. Human teammates should push small branches and PRs regularly.

## Team and isolation

| Owner | Assignment | Checkout / branch |
| --- | --- | --- |
| Northstar · Codex GPT-6.1 Sol/high · Maestro | Scheduling, contracts, independent review, integration, Delivery Board | workflow / `t-00-agent-workflow` for setup; integration thereafter |
| Loom · Claude Code | T-03 auth and profiles, after setup | auth / `t-03-auth` |
| Tempo · Codex | T-04 browser validity and distance math | logic / `t-04-deal-logic` |
| Prism · Gemini | T-05R teammate extraction reconciliation; blocked until model credits available | extraction / `t-05-extraction-reconciliation` |
| Human frontend teammate | Product appearance and polished components | Human-owned branch |
| Human map teammate | ALL maps, geocoding, pins, geospatial integration | Human-owned branch |

Checkouts live under the sibling `DishDeals-worktrees/` directory. The original `/Users/william/Code/DishDeals` checkout stays under human control. Never change its branch to service an agent. Never share an index or run concurrent writers on shared files. Agents are capable of reading other local files; Git ownership checks enforce workflow conventions, not an OS security boundary.

## Start a bounded batch

1. Finish T-00: publish the committed T-01/T-02 baseline plus this workflow, run CI, review the exact PR head, integrate through GitHub.
2. Northstar fetches origin, reads task packets and latest teammate branches, verifies dependencies and assigns `ready` to approved independent tasks in `docs/workflow/tasks.json`.
3. `npm run agents -- create T-03` and `npm run agents -- create T-04` create isolated branches from `origin/main`. Run `npm ci` per worktree. Do not copy `.env.local` automatically. Pure logic and mocked tests need no provider secrets.
4. Dispatch T-03 and T-04 concurrently through Maestri using their exact packets. T-05R starts only with usable Gemini credits and a new assignment. It initially produces a reconciliation report, not a second backend. Stop after this batch. Later tickets remain backlog.

The current task manifest records prepared scopes, not an instruction to implement features during workflow setup. T-01 live browser/HTTPS/phone evidence remains pending. A coordinator may authorize local T-03 work on the reviewed baseline without pretending those live acceptance checks passed.

## Git loop

```sh
git fetch origin
npm run agents -- status
npm run agents -- sync
npm run agents -- check T-04
npm run check
git add lib/validNow.ts lib/distance.ts lib/validNow.test.ts lib/distance.test.ts docs/handoffs/t-04.md
git commit -m "Implement T-04 deal validity logic"
git push -u origin t-04-deal-logic
gh pr create --base main --draft --title "T-04: deal validity and distance" --body-file /tmp/t-04-pr.md
```

`sync` only fast-forwards a clean task branch. If branches diverge, preserve commits and stop for Northstar to integrate `origin/main` in that task worktree explicitly; do not reset, stash, force push or rewrite a teammate's branch. Remote feature branches are read with `git show origin/<branch>:<path>` or `git diff`; fetch never merges their code automatically.

Only Northstar integrates approved PRs, one at a time. Require the `quality` CI check, an independent review of the exact current head and ownership evidence. Reviewers do not self-approve an implementation. Keep PRs small; re-run review/checks after material changes or integration conflicts. No auto-merge of failing checks. Main protection blocks force pushes/deletions and requires PR + green quality; an AI review is recorded as evidence, not misrepresented as a human GitHub approval.

## Contracts and shared resources

`lib/dealSchema.ts` and `convex/schema.ts` are canonical. Read `docs/decisions/0001-teammate-backend-integration.md` before importing teammate extraction. Shared files (schema, generated Convex APIs, dependency manifest/lock, provider/layout, CI) have one coordinator-issued owner at a time. T-03 owns provider/layout for this batch; T-04 touches only its pure lib files. Other workers request a narrowly scoped ownership amendment before changing a shared file.

All schema changes and live Convex dev syncs are serialized. Existing approval covered T-02 on `proper-marmot-82`; it is not blanket permission for later migrations or production. Local checks and tracked generated files require no cloud deployment. Never run `convex dev` in every worktree against the same deployment. Keep project configuration outside committed source; only explicitly authorized backend workers receive needed secrets, never through chat.

Server keys stay server-side. No scraping, invented coordinates, currency assumptions or fabricated confidence. Coordinate contracts remain for the human map owner. Distance arithmetic in T-04 does not authorize geocoding or map wiring.

## Maestri communication

Northstar is the hub. Workers run `maestri list` and read connected Workflow/Delivery Board before starting. Maestro uses `ask --batch` for independent assignments. Workers return their handoff directly to a caller already awaiting an `ask`; do not issue a blocking ask back to that caller. For free-standing questions, ask a free peer or put a short blocker in the task handoff and let Northstar schedule it. Never create circular waits. A worker can publish an assigned draft branch/PR; only Northstar integrates.

No automatic unlimited task queue, background polling routine or surprise notification. Model quota failures are blockers, not hidden reassignment. Keep Northstar GPT-6.1 Sol/high; do not change provider/model without instruction.

## Handoff and validation

Use `docs/handoffs/TEMPLATE.md`. CI installs from the lock and runs typecheck, lint, tests, workflow tests and build without provider credentials or deployment. Mock tests cannot establish live auth/extraction acceptance. Phone tests, latency and live integrations stay pending until measured. Convex's authentic generated files are tracked in the T-02 baseline, so clean CI does not need live codegen. The earlier research report's claim that they were ignored was incorrect.

Recovery: preserve a failing branch and its worktree, document the blocker, repair or revert with a new commit. Never delete a worktree containing uncommitted work. Retire clean merged worktrees only after their evidence has been retained.
