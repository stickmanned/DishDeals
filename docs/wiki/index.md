# Wiki Index

Start at [[overview]] (prose) or [[codemap]] (file-path navigation). [[glossary]] has project-specific terms.

## Sources

| Source | Date Added | Summary |
|--------|-----------|---------|
| [[Source - Project Process Docs]] | 2026-10-04 | The multi-agent build process, ticket IDs, and evidence-tier discipline this repo follows |

## Entities

| Entity | Type | Location | Verified |
|--------|------|----------|----------|
| [[Convex Schema]] | data model | `convex/schema.ts`, `convex/workflowTables.ts` | 6c69d94 |
| [[ImageDraftFlow]] | class | `lib/imageDraftFlow.ts` | 6c69d94 |
| [[FrontendProvider]] | component/context | `components/frontend/FrontendProvider.tsx` | 6c69d94 |

## Concepts

| Concept | Verified |
|---------|----------|
| [[Reel Ingestion Workflow]] | 6c69d94 |
| [[Teammate Workflow Pipeline]] | 6c69d94 |
| [[Canonical Deal Publishing]] | 6c69d94 |
| [[Screenshot and Flyer Extraction]] | 6c69d94 |
| [[AI Review Gate]] | 6c69d94 |
| [[Geocoding Providers]] | 6c69d94 |
| [[Deal Validity and Distance Math]] | 6c69d94 |
| [[Generation Fencing]] | 6c69d94 |
| [[Rate Limiting Patterns]] | 6c69d94 |
| [[Auth and Ownership Model]] | 6c69d94 |
| [[Environment Gated Providers]] | 6c69d94 |
| [[Voting and Crowd Signals]] | 6c69d94 |
| [[Profiles and Wallets]] | 6c69d94 |
| [[Solana Devnet Tipping]] | 6c69d94 |
| [[Three Mode Runtime]] | 6c69d94 |
| [[Preview vs Canonical UI]] | 6c69d94 |
| [[Demo Cache]] | 6c69d94 |
| [[Map Rendering]] | 6c69d94 |
| [[Native and Android Share Integration]] | 6c69d94 |
| [[Seeding and Fixtures]] | 6c69d94 |

## Patterns

| Pattern | Verified |
|---------|----------|
| [[Pure Core Plus Thin Convex Shell]] | 6c69d94 |
| [[Adding a New Deal Source]] | 6c69d94 |

## Analyses

None yet.

## Known gaps (not yet covered — stubs welcome, not written)

- `convex/http.ts` as a whole (individual routes are covered via the pipelines they serve, but the router file itself has no dedicated page).
- `lib/frontend/*` (the preview tree's pure logic) is only covered in passing via [[Preview vs Canonical UI]] and [[Three Mode Runtime]] — no dedicated entity pages per file.
- `tests/` is not individually catalogued; it's organized by feature area matching the concept pages above (see [[codemap]]).
- `docs/` (the project's own process documentation) is summarized only via [[Source - Project Process Docs]] — individual ticket/handoff files aren't catalogued here, by design (this wiki documents code, not schedule).
- iOS deep-dive on `DinedealsApp.swift`'s `WKScriptMessageHandler` message protocol is covered at a summary level in [[Native and Android Share Integration]] but has no dedicated entity page.
