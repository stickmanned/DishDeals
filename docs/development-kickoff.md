# DishDeals development kickoff

Paste the prompt below into Northstar. This starts one ticket, not the entire plan. After its handoff, request the next ticket explicitly.

```text
You are Northstar, the DishDeals Maestro. Use your Maestri skills to coordinate the existing team. Keep your configured GPT-6.1 Sol/high model.

PROJECT AND SOURCE OF TRUTH
Work in /Users/william/Code/DishDeals (or an explicitly assigned isolated checkout of that repository). First inspect pwd, the Git branch/status, existing files, and any applicable AGENTS.md. Read "StormHacks Project Plan Instagram Deal Saver.md", especially Before you build, Guide for AI coding agents, Stack, Data model, Backend functions, and the T-01 row in Task breakdown. Read docs/team-integration.md.

The current plan supersedes the older Instagram Deal Saver/localStorage/offline-only brief in the previous Codex output folder. DishDeals now uses Next.js App Router, TypeScript, Tailwind, Convex, and Convex Auth for a shared live community feed. Do not restore the old architecture or edit that previous checkout.

SCOPE AND OWNERSHIP
My human teammates own the high-quality frontend and ALL map integration. Your lane is the functional foundation and, in later separately assigned tickets, backend, auth, extraction, deterministic logic, and integration contracts. Build only plain usable UI needed to exercise a ticket. Do not design a polished frontend, implement the locked visual treatment/fonts, add animations, redesign teammate components, or generate a full application in one pass.

Do not implement geocoding/Nominatim, Leaflet/DealMap, draggable pins, map tiles, maps grounding, directions integrations, full-screen maps, or the geospatial component/index wiring. Keep the plan's lat/lng fields and API contracts intact for the map teammate; do not use fake coordinates to claim publishing works. Pure distanceKm mathematics may be implemented only when T-04 is explicitly assigned. Solana, share-target/PWA work, later features, domain setup, and submission are outside THIS ticket.

FIRST ASSIGNMENT: T-01 FOUNDATION ONLY
Run maestri list to discover actual teammates and connected notes. Reuse Loom as the sole implementation writer; Prism may perform a bounded read-only check of current Next.js/Convex setup documentation. Do not recruit duplicate agents. Establish exact checkout, branch t-01-foundation, writable paths, and completion checks before dispatch. Preserve all existing work; no reset or overwriting teammate files. Use an isolated floor/worktree if another writer is active. Scaffold directly in the existing repository, not a nested dishdeals/ repository.

Implement only the T-01 functional portion:
- Minimal Next.js App Router/TypeScript/Tailwind scaffold, package scripts, and lockfile.
- Convex dependency, client provider wiring in app/layout.tsx, and a minimal test query plus a plain home page showing DishDeals and its query result when configured.
- Environment/setup instructions that list required human Convex/Vercel steps without exposing secrets. Never commit .env* or keys. Do not fabricate a Convex URL, deployment credentials, generated API types, or a working remote backend.
- Minimal verification appropriate to this scaffold. Do not implement schema/auth/extraction/feed/voting or placeholder routes for every future ticket.

The polished styling portion of T-01 belongs to my frontend teammate. Record this deliberate split; do not silently change the original plan or its ticket IDs/contracts. The plan's T-01 HTTPS deployment criterion remains a human/integration dependency unless already configured and explicitly authorized. Prepare the deployment instructions, but do not publish, create accounts, buy a domain, push, or submit anything from this prompt.

EXECUTION AND CHECKPOINT
Inspect current official docs before relying on version-sensitive setup commands. Ask only for information needed to unblock this ticket; continue any independent local work. If credentials or provisioning are missing, finish the reviewable local scaffold and report the exact human steps. Do not replace Convex with another backend or weaken acceptance criteria to get a green status.

Run the plan's checks when applicable: npx convex dev --once, npx vitest run, npm run build. Explain any unavailable check, including missing provisioning or no tests yet; do not claim that an empty suite or mocked query validates the live backend. If configuration prevents a build, report that limitation and the checks that actually ran. Follow the plan's 30-minute stuck rule.

Update Delivery Board and a concise ticket record with T-01 functional progress, deferred styling, external blockers, and verification evidence. Northstar alone writes shared status. Inspect Loom's diff and check results before reporting completion. STOP after the T-01 handoff; do not launch T-02, T-03, or any later ticket automatically, even if time remains.

RETURN
Report the exact branch/checkout, changed paths, commands and results, how to run locally, what is functional versus blocked, frontend/map teammate boundaries, and recommended next ticket. T-02 is next only when T-01's dependency status is honestly resolved or the human explicitly records a scoped dependency adjustment. Await my next ticket instruction.
```

## Continuing after review

Use a bounded follow-up such as:

> Assign T-02 only. Verify its dependencies against the current plan and the T-01 handoff, name the owner and writable paths, implement the exact data and extraction schemas, run the relevant checks, and stop with evidence. Keep frontend polish and all map integration assigned to my teammates.

The remaining plan is a backlog, not authorization to execute it automatically.
