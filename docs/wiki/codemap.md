# Codemap

DishDeals (StormHacks hackathon project): a Next.js + Convex app where users save a restaurant deal from an Instagram Reel, a screenshot/flyer photo, or a screen recording; an AI (Gemini) extracts structured deal info; the user confirms/edits it; it publishes to a shared map (geocoded, votable, with optional Solana-devnet tipping). Built by a human + multi-agent team in parallel worktrees — see [[Source - Project Process Docs]] for that process; this codemap is about the code itself.

Baseline for this wiki: commit `6c69d94` on branch `t-00-agent-workflow`. The repo is under active multi-agent development; re-run a refresh before trusting fine detail against a different commit.

## Directory structure

| Path | Purpose | Key entry points | Wiki pages |
|------|---------|-------------------|------------|
| `app/` | Next.js App Router routes | `app/layout.tsx`, `app/page.tsx` | [[Preview vs Canonical UI]], see route table below |
| `components/frontend/` | "Preview" example UI (local-state only, never persisted) — originally the human frontend teammate's scaffold | `FrontendProvider.tsx` | [[Preview vs Canonical UI]], [[FrontendProvider]] |
| `components/deals/` | Canonical (real-backend) deal post/edit/review UI | `CanonicalPost.tsx`, `CanonicalDealEdit.tsx`, `DealReviewForm.tsx` | [[Canonical Deal Publishing]], [[Screenshot and Flyer Extraction]] |
| `components/maps/` | Canonical map UI | `CanonicalDealMapPage.tsx`, `PublishedDealMap.tsx`, `DealLocationPicker.tsx` | [[Map Rendering]] |
| `components/reels/` | Reel-save/review UI | `ReelIntake.tsx`, `CanonicalReelReview.tsx` | [[Reel Ingestion Workflow]] |
| `components/*.tsx` (top-level) | Auth, Convex provider, native bridge, PWA share, Solana tip QR | `ConvexClientProvider.tsx`, `CanonicalSessionBridge.tsx`, `TipQR.tsx` | [[Three Mode Runtime]], [[Native and Android Share Integration]], [[Solana Devnet Tipping]] |
| `convex/` | Backend: schema + all server functions | `convex/schema.ts` | [[Convex Schema]], most concept pages |
| `convex/workflow/` | "Teammate" ingestion/search/compare subsystem (separate from the canonical `deals` table) | `convex/workflow/ai.ts`, `jobs.ts` | [[Teammate Workflow Pipeline]] |
| `lib/` | Pure, dependency-injected business logic (the "core" behind every thin Convex function) | see table below | most concept pages |
| `lib/workflow/` | Pure logic for the teammate workflow pipeline | `lib/workflow/workflow.ts` | [[Teammate Workflow Pipeline]] |
| `lib/reels/` | Pure logic for the Reel-video pipeline | `lib/reels/contract.ts` | [[Reel Ingestion Workflow]] |
| `lib/frontend/` | Pure logic for the "preview" UI only | `lib/frontend/deals.ts` | [[Preview vs Canonical UI]] |
| `map-component/` | Local workspace package `@restaurant-deals/map` — MapLibre/Leaflet map widget | `map-component/src/index.ts` | [[Map Rendering]] |
| `ios/` | Native iOS app shell (SwiftUI/WKWebView) + Instagram share extension | `ios/App/DinedealsApp.swift`, `ios/Shared/ShareStore.swift` | [[Native and Android Share Integration]] |
| `public/` | Static assets, PWA manifest, Android share-target service worker | `public/manifest.webmanifest`, `public/sw.js` | [[Native and Android Share Integration]] |
| `fixtures/` | Seed data + extraction/demo-cache test fixtures | `fixtures/seed.json`, `fixtures/demo/` | [[Seeding and Fixtures]], [[Demo Cache]] |
| `scripts/` | Build/CI helper scripts | `scripts/agent-workflow.mjs`, `scripts/map-assets.mjs`, `scripts/check-release-config.mjs` | — |
| `tests/` | Vitest integration/unit tests, organized by feature area | — | — |
| `docs/` | Project process docs, task packets, handoffs, ADRs (not code) | `docs/team-integration.md`, `docs/agent-workflow.md` | [[Source - Project Process Docs]] |
| `docs/wiki/` | **This wiki** | `overview.md`, `codemap.md` | — |

## `convex/` file map

| File | Purpose |
|------|---------|
| `schema.ts` | Data model: all tables (see [[Convex Schema]]) |
| `auth.ts`, `auth.config.ts` | Convex Auth (Password + Anonymous providers) |
| `convex.config.ts` | Registers `@convex-dev/workflow` + `@convex-dev/geospatial` components; declares every env var |
| `crons.ts` | Two cron jobs: `dealUploads.cleanupExpired` (hourly), `workflow.maintenance.expireDeals` (15 min) |
| `http.ts` | HTTP router: auth routes, `/reel-source`, `/deal-image`, `/v1/*` workflow API |
| `deals.ts`, `dealImage.ts`, `dealUploads.ts` | Canonical deal CRUD + image upload — [[Canonical Deal Publishing]] |
| `extract.ts` | Screenshot/flyer AI-extraction action — [[Screenshot and Flyer Extraction]] |
| `geocode.ts`, `geocodeState.ts` | Nominatim geocoding + rate-limit gate/cache — [[Geocoding Providers]] |
| `votes.ts` | Crowd up/down voting — [[Voting and Crowd Signals]] |
| `users.ts` | Profile read/write — [[Profiles and Wallets]] |
| `seed.ts` | Seed-data loader — [[Seeding and Fixtures]] |
| `reels.ts`, `reelActions.ts`, `reelWorkflow.ts`, `reelSource.ts` | Reel video ingestion pipeline — [[Reel Ingestion Workflow]] |
| `workflow/*.ts`, `workflowTables.ts` | Teammate workflow pipeline — [[Teammate Workflow Pipeline]] |
| `trial.ts`, `test.ts` | Config-readiness / smoke-test queries |

## Where to look for common tasks

| Task | Start here |
|------|-----------|
| Add a field to a published deal | [[Convex Schema]] (`deals` table) → [[Canonical Deal Publishing]] (`lib/dealWrite.ts#validatePublishFields`) → `components/deals/CanonicalPost.tsx` form |
| Change deal-validity rules (hours/days/expiry) | [[Deal Validity and Distance Math]] → `lib/validNow.ts` |
| Add a new AI extraction source type | [[Screenshot and Flyer Extraction]] or [[Reel Ingestion Workflow]] depending on media type; see [[Pure Core Plus Thin Convex Shell]] for the idiom to follow |
| Add/modify a rate limit | [[Rate Limiting Patterns]] |
| Change how the map renders deals | [[Map Rendering]] → `map-component/src/DealMap.tsx` |
| Understand why there are two "Post" / "DealDetails" components | [[Preview vs Canonical UI]] |
| Understand the Instagram share extension | [[Native and Android Share Integration]] → `ios/Shared/ShareStore.swift` |
| Change geocoding behavior | [[Geocoding Providers]] — note canonical deals use Nominatim, the teammate workflow pipeline uses Geoapify |
| Add a provider-gated feature (new paid API) | [[Environment Gated Providers]] |
| Understand the Solana tipping flow | [[Solana Devnet Tipping]] |
| Run the test suite / CI | `npm run check` (`.github/workflows/ci.yml`); `tests/` is organized by feature area matching the concept pages above |

## Entry points

- Dev server: `npm run dev` (Next.js)
- Full CI-equivalent check: `npm run check` (`build:map` → `typecheck` → `lint` → `test` (Vitest) → `test:workflow` (Node test) → `build`)
- Root layout (mounts Convex/auth/PWA providers for every route): `app/layout.tsx`
- Public API surface: Convex functions under `convex/*.ts` (client calls via `api.*`/`internal.*`); external REST surface at `/v1/*` registered by `lib/workflow/http.ts`, plus `/reel-source` and `/deal-image` authenticated upload endpoints
- iOS app entry: `ios/App/DinedealsApp.swift`; share extension: `ios/ShareExtension/ShareViewController.swift`
- Map package entry: `map-component/src/index.ts`

## Routes (`app/`)

| Path | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Discover feed (preview-mode UI) |
| `/deal/[id]` | `app/deal/[id]/page.tsx` | Deal detail — demo id → preview `DealDetails`, real id → `CanonicalDealDetails` |
| `/deal/[id]/edit` | `app/deal/[id]/edit/page.tsx` | Edit a live deal (author-only) |
| `/map` | `app/map/page.tsx` | Map of published deals, `?deal=` selects one |
| `/post` | `app/post/page.tsx` | Post a deal (canonical flow; `?preview=1` for example mode) |
| `/profile` | `app/profile/page.tsx` | Signed-in profile (display name, Solana wallet) |
| `/signin` | `app/signin/page.tsx` | Email/password sign-in and sign-up |
| `/reels` | `app/reels/page.tsx` | Private Reel link intake/review (not indexed) |
| `/reels/layout-preview` | `app/reels/layout-preview/page.tsx` | Dev-only static fixture for review-layout QA |
| `*` (404) | `app/not-found.tsx` | Global not-found page |

Known stale reference: [README.md](../../README.md) still describes only the original "T-01 foundation" scaffold; the app has grown far beyond that (see this codemap and [[Source - Project Process Docs]] for the current state).
