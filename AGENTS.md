# DishDeals agent instructions

Read `StormHacks Project Plan Instagram Deal Saver.md` as the current specification, particularly Guide for AI coding agents, Data model, Backend functions, and your assigned ticket. Read `docs/team-integration.md` for the human's ownership adjustment and `docs/development-kickoff.md` for the first bounded assignment.

The effective repository is `/Users/william/Code/DishDeals` or an explicitly assigned isolated checkout. A role session may start under `.maestri/roles/<id>/`; locate the ancestor containing the plan and inspect Git status before editing. Do not use the old Codex output repository or its localStorage/no-login brief.

- Execute only the explicitly assigned ticket. Verify its dependencies; stop with a handoff once its checks pass or a named blocker prevents progress. Do not pull the next ticket automatically.
- Human teammates own high-quality frontend and all map integration. Agents own functional core work only, with minimal usable UI where needed. Do not implement polished styling/fonts/animations, geocoding, maps, pin controls, map grounding, directions integration, or geospatial wiring without a new explicit assignment. Keep the plan's coordinates, table fields, and API names intact.
- Run `maestri list` (or `"$MAESTRI_CLI" list`) before addressing connected teammates or notes. Reuse Northstar, Loom, and Prism. Northstar coordinates and alone maintains Delivery Board/shared status. No duplicate recruits or circular blocking requests.
- Agree branch/checkout, exact writable paths, acceptance, and checks before edits. Use `t-XX-short-name` branches. Overlapping writers require isolated checkouts or serial work. Preserve human and teammate changes.
- Follow plan security/data rules: server-only keys, no committed `.env*`, signed-in checks on protected operations, no Instagram scraping, browser-computed current validity, America/Vancouver local times, schema-validated extraction, null-to-undefined conversion for optional Convex fields.
- Inspect current official documentation for version-sensitive SDK/setup claims. Keep unavailable models, credentials, or deployment steps explicit; never invent successful backend or API evidence.
- Run relevant checks from the plan and report exact results or blockers. No false passes for unrun commands, empty tests, mocks, phone-only behavior, or external provisioning.
- Do not publish/deploy, push, submit, purchase, or create accounts without specific authorization. The kickoff prepares local work and human setup instructions.
- Return ticket status, branch/checkout, changed files, checks, human phone/setup steps, and the next proposed ticket. Stop if stuck for 30 minutes as the plan directs.

Current first-ticket scope: T-01 functional scaffold only. Styling is teammate-owned; live Convex/HTTPS acceptance is pending until real provisioning and authorized integration are complete. Later dependencies must be resolved honestly or explicitly adjusted by the human.

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
