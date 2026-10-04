# DishDeals agent instructions

This file is the single source of agent rules. `CLAUDE.md` imports it and `GEMINI.md` points to it. Change agent rules here, not in those files.

## Read in this order

Read only what your ticket needs. Each extra document costs context you need for the work.

1. This file, `docs/tenets.md` (priorities) and `docs/lessons.md` (mistakes not to repeat).
2. Your task packet in `docs/tasks/` and its entry in `docs/workflow/tasks.json` (owner, branch, worktree, writable paths).
3. In `StormHacks Project Plan Instagram Deal Saver.md` (the spec): always "Guide for AI coding agents"; "Data model" and "Backend functions" whenever you touch a name or shape (they are canonical); then only the other sections your packet names. Do not read the whole plan unless the packet says so.
4. When needed, not up front: `docs/agent-workflow.md` for the Git loop, model routing and integration; `docs/team-integration.md` when work touches a human-owned lane; `docs/decisions/` before changing a contract.

The effective repository is `/Users/william/Code/DishDeals` or an explicitly assigned isolated checkout. A role session may start under `.maestri/roles/<id>/`; locate the ancestor containing the plan and inspect `pwd`, Git branch/status and task ownership before editing. Work in your assigned worktree, never the human main checkout. Do not use the old Codex output repository or its localStorage/no-login brief.

## Rules

- Execute only the explicitly assigned ticket. Verify its dependencies; stop with a handoff once its checks pass or a named blocker prevents progress. Do not pull the next ticket automatically.
- Human teammates own high-quality frontend and all map integration. Agents own functional core work only, with minimal usable UI where needed. Do not implement polished styling/fonts/animations, geocoding, maps, pin controls, map grounding, directions integration, or geospatial wiring without a new explicit assignment. Keep the plan's coordinates, table fields, and API names intact.
- Fetch published teammate branches before building a subsystem, so you extend their work instead of duplicating it.
- Run `maestri list` (or `"$MAESTRI_CLI" list`) before addressing connected teammates or notes. Reuse Northstar, Loom, Prism, Cinder and Mica; see Gemini-first routing in docs/agent-workflow.md. Northstar coordinates and alone maintains Delivery Board/shared status. No duplicate recruits or circular blocking requests.
- Agree branch/checkout, exact writable paths, acceptance, and checks before edits. Use `t-XX-short-name` branches. Overlapping writers require isolated checkouts or serial work. Preserve human and teammate changes.
- Follow plan security/data rules: server-only keys, no committed `.env*`, signed-in checks on protected operations, no Instagram scraping (sole exception: retrieving the Reel a user shared by link, see docs/decisions/0006-reel-link-retrieval-reauthorized.md), browser-computed current validity, America/Vancouver local times, schema-validated extraction, null-to-undefined conversion for optional Convex fields. Server secrets never go in Git or chat.
- Inspect current official documentation for version-sensitive SDK/setup claims. Keep unavailable models, credentials, or deployment steps explicit; never invent successful backend or API evidence.
- Run relevant checks from the plan and report exact results or blockers. No false passes for unrun commands, empty tests, mocks, phone-only behavior, or external provisioning.
- The current assignment authorizes scoped local commits and reviewed local integration. Remote pushes and PR publication require separate authorization. Only Northstar integrates reviewed work. Do not force push, deploy, submit purchases or create accounts. Cloud changes require specific authorization; old T-02 dev sync approval is scoped to T-02.
- Return ticket status, branch/checkout, changed files, checks, human phone/setup steps, lessons learned, and the next proposed ticket. Stop if stuck for 30 minutes as the plan directs.

## Tests are the contract

- **Tests first.** On a logic or backend ticket, the first commit on the branch contains only the tests for the agreed behaviour; failing is expected. Implement in later commits. Reviewers read that commit before the implementation.
- **Never bend a test to pass.** Do not edit, weaken, skip (`.skip`, `.only`, `.todo`), loosen assertions in, or delete an existing test to make checks pass. If a test looks wrong, stop and explain why in the handoff; Northstar or the human decides. List every test changed after the tests-first commit in the handoff, with the reason.
- **Derive cases from the data, not only the happy path.** Pick the classes that apply to your inputs:
  - Strings: empty, whitespace-only, non-ASCII (accented or CJK restaurant names, emoji), very long.
  - Numbers: 0, negative, exact boundaries, very large, `NaN`.
  - Time: midnight, overnight windows (`validEnd` before `validStart`), the America/Vancouver DST changes, missing dates or hours.
  - State: missing record, empty list, signed out or expired session, provider error or timeout.
- **The demo path is not the test plan.** Cover the failure handling the plan's "Edge cases, tests and risks" table assigns to your ticket.
- Say which tests are mocked. A mocked provider test does not prove live behaviour.

## Lessons

When a human or reviewer corrects you, or you lose time to something a later agent would repeat, add a "Lessons" line to your handoff: what went wrong and the rule that avoids it. Do not edit `docs/lessons.md` from a task branch; Northstar copies lessons in when integrating, so parallel PRs do not conflict on that file.

## Gemini workers

Applies when a lane runs on Gemini or Antigravity. Current model routing for each lane is in the dated notes at the top of `docs/agent-workflow.md`.

- Default to small bounded Flash tasks: Prism handles reconnaissance and fixtures, Cinder validity, Mica distance and small utilities. Read your exact T-04A, T-04B or T-05R packet and confirm its worktree and paths before writing.
- At most three Gemini requests run concurrently across the workspace; no nested agent fan-out.
- Use short relevant context and targeted checks while iterating, then one full `npm run check` per completed PR. Return concise handoffs.
- After two failed attempts on the same issue, escalate the smallest unresolved question to Northstar.
- A successful current reply supersedes a stale "out of credits" label. Development-agent access to Google AI is separate from the app's Gemini API credentials. Never enable paid overages or make purchases.

Current coordinator assignment: finish T-03 through T-21 plus native iOS integration in successive dependency-ready bounded batches. William confirms T-01/T-02 DONE; never reopen their acceptance. Each worker receives one exact packet and stops. Harry owns polished frontend and native sharing (SwiftUI/WKWebView+UIKit extension547a74d). William explicitly transferred Pinyuan's stopped map/geocode/pin integration to agents; reuse cpy's published map and consider new branches. Native entry is Saved Reels/Posts with tap-to-map per William's later choice. Northstar alone owns status and reviewed local integration. Read docs/decisions/0002-native-ios-map-home.md and docs/workflow/coverage.md. This assignment authorizes local commits/integration only; no remote pushes/PR publication or cloud operations.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
