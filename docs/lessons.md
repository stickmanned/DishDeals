# DishDeals lessons

Mistakes already made, and the rule that avoids repeating them. Agents report new lessons in their handoff; Northstar adds them here when integrating. Keep each entry to one or two lines and delete entries that stop being true.

## Git and checkouts

- The human main checkout drifted behind `origin/main` and still held the old `CLAUDE.md`, so a session there read stale rules. Read rules from your assigned worktree after `git fetch`, not from the main checkout.
- Northstar's sandbox cannot write `FETCH_HEAD`. Use `git fetch --no-write-fetch-head origin`. If a Git metadata operation is denied, report it; do not weaken the sandbox.

## Convex

- Convex's generated files (`convex/_generated/`) are tracked in Git, so CI needs no live codegen. An earlier research report wrongly said they were ignored.
- Never run `npx convex dev` in every worktree against the same deployment; schema pushes from different branches overwrite each other. Schema changes and cloud syncs are serialized, and each needs its own approval (the T-02 approval does not carry over).
- To validate a schema without touching the cloud deployment, T-02 ran `npx convex dev --once` with `CONVEX_AGENT_MODE=anonymous`, `CONVEX_DEPLOYMENT` unset and no `.env.local`, in a scratch copy.
- Optional fields from Gemini arrive as `null`; convert them to `undefined` before inserting into Convex.

## Frameworks and providers

- This Next.js version differs from training data. Read the guide in `node_modules/next/dist/docs/` before writing Next.js code (see the Next.js block in `AGENTS.md`).
- Antigravity showed a stale "AI: Out of credits" footer next to a successful reply. Judge provider readiness by whether a current request fails, not by the label.
- Development-agent access to Google AI does not give the app a Gemini API key. App extraction needs `GEMINI_API_KEY` set by a human in the Convex dashboard.

## Teammate code

- The teammate branch `feature/dishdeals-initial-implementation` has its own `ai-workflow/` backend with different shapes (jobs, overall confidence, non-CAD prices). Do not merge it wholesale; map it to the canonical contract through ADR 0001 and T-05R.
