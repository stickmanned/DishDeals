# Wiki Log

## [2026-10-04] bootstrap | commit 6c69d94 (branch t-00-agent-workflow)
- First-ever CodeWiki bootstrap for this repo. Baseline commit pinned after confirming the working-tree checkout (which is actively branch-switched by this project's multi-agent orchestration — see [[Source - Project Process Docs]]) had been stable for several minutes.
- Surveyed via 5 parallel Explore agents (Convex backend; `lib/workflow` + `lib/reels` extraction pipelines; frontend `app`/`components`; canonical `deals`/`extract`/`geocode`/`votes`/`users` layer; `map-component` package + native iOS/Android glue) plus direct reads of `convex/schema.ts`, `convex/deals.ts`, `convex/votes.ts`, `convex/users.ts`, `convex/dealUploads.ts`, `convex/extract.ts`, `convex/geocodeState.ts`, `convex/reelSource.ts`, `lib/validNow.ts`, `lib/distance.ts`, `lib/frontendConnection.ts`, `ios/project.yml`, `ios/ShareExtension/ShareViewController.swift`, `lib/reels/nativeContext.ts`, and the project's own process docs (`AGENTS.md`, `docs/team-integration.md`, `docs/agent-workflow.md`, `docs/decisions/0001-teammate-backend-integration.md`, `docs/workflow/coverage.md`).
- Pages created:
  - Top-level: [[overview]], [[codemap]], [[glossary]], [[index]] (this log and `.state.yml` complete the set)
  - Sources: [[Source - Project Process Docs]]
  - Entities: [[Convex Schema]], [[ImageDraftFlow]], [[FrontendProvider]]
  - Concepts: [[Reel Ingestion Workflow]], [[Teammate Workflow Pipeline]], [[Canonical Deal Publishing]], [[Screenshot and Flyer Extraction]], [[AI Review Gate]], [[Geocoding Providers]], [[Deal Validity and Distance Math]], [[Generation Fencing]], [[Rate Limiting Patterns]], [[Auth and Ownership Model]], [[Environment Gated Providers]], [[Voting and Crowd Signals]], [[Profiles and Wallets]], [[Solana Devnet Tipping]], [[Three Mode Runtime]], [[Preview vs Canonical UI]], [[Demo Cache]], [[Map Rendering]], [[Native and Android Share Integration]], [[Seeding and Fixtures]]
  - Patterns: [[Pure Core Plus Thin Convex Shell]], [[Adding a New Deal Source]]
- Pages updated: none (bootstrap).
- Pages deprecated: none (bootstrap).
- Known gaps recorded in [[index]]: `convex/http.ts` router itself, `lib/frontend/*` per-file detail, `tests/` catalog, individual `docs/` ticket files, iOS `WKScriptMessageHandler` protocol detail.
- Discoverability pointer added to [README.md](../../README.md) (new "Codebase wiki" section, link only) per the skill's bootstrap step.
