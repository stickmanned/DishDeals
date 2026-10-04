---
title: "Teammate Workflow Pipeline"
type: concept
tags: [extraction, gemini, geoapify, search, compare]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/workflow/", "convex/workflowTables.ts", "lib/workflow/"]
---

# Teammate Workflow Pipeline

## Overview

A separately-authored deal-ingestion/search/compare subsystem, preserved from a teammate's branch (`origin/feature/dishdeals-initial-implementation`) rather than merged into the canonical `deals` table — see `docs/decisions/0001-teammate-backend-integration.md`. It ingests text/URL/image sources, geocodes via **Geoapify** (contrast [[Geocoding Providers]]), and additionally offers natural-language search and AI-assisted deal comparison over its own published records. Its own `convex/workflow/` functions are the only callers of this pipeline's `lib/workflow/*` code — there is no import crossing between this pipeline and the Reel pipeline ([[Reel Ingestion Workflow]]) or the canonical pipeline ([[Canonical Deal Publishing]]).

## How It Works

**Ingestion (claim/attempt-fencing job queue — distinct from `@convex-dev/workflow`):**

1. `workflow/jobs.ts#submit`/`submitInternal` → `enqueue()` validates input (`inputSchema`), computes a `fingerprint()` hash, dedupes per `(owner, fingerprint)`, inserts a `workflowJobs` row (`status: "queued"`), schedules `workflow/ai.ts#run` immediately.
2. `workflow/ai.ts#claim` (internal mutation) — only if `status === "queued"`; bumps `attempt`, sets `"processing"`.
3. `run` (internal action) builds live dependencies (`lib/workflow/workflow.ts#liveDependencies`) and calls `lib/workflow/workflow.ts#processDeal(input, deps)`, which: validates input → calls `deps.extract` (Gemini, `lib/workflow/gemini.ts#extractWithGemini`) → geocodes each deal via `deps.locate` (Geoapify, `lib/workflow/geoapify.ts#findRestaurant`, cached per restaurant name within one run) → runs `assess()` (`workflow.ts:25`) to compute `reviewReasons`/`status` per deal.
4. `workflow/ai.ts#finish` (attempt-fenced) persists each outcome as a `workflowDeals` row with `status: outcome.status === "rejected" ? "rejected" : "needs_review"` — **a "ready" outcome still waits for explicit human review; nothing auto-publishes.**
5. `workflow/deals.ts#reviewDeal` (mutation) — the owner approves (resolving a restaurant candidate, `status → "published"`) or rejects a `needs_review` job's deal.

**Search:** `workflow/search.ts#run` → `lib/workflow/search.ts#searchDeals` — parses intent (Gemini `understand`, falling back to regex-based `basicIntent`), filters/scores published `workflowDeals`, recommends via Gemini (strictly re-validated against real fact IDs) or a basic heuristic fallback. If zero results, `lib/workflow/web-discovery.ts#supplementEmptySearch` tries a Google-Search-grounded live Gemini answer — explicitly ephemeral, never persisted to the deal database.

**Compare:** `workflow/compare.ts#find` → `lib/workflow/compare.ts#compareRestaurants` — deterministic cheapest-deal logic for `priority: "price"`; Gemini-assisted recommendation (re-validated against real facts) for `"value"`/`"taste"`, degrading to `evidence_only` on any validation failure.

## Where It Lives

- `convex/workflow/jobs.ts`, `ai.ts`, `deals.ts`, `search.ts`, `compare.ts`, `maintenance.ts`, `auth.ts` — the Convex layer.
- `convex/workflowTables.ts` — `workflowJobs`, `workflowRestaurants`, `workflowDeals`, `workflowLimits`, `workflowSearchLimits` (spread into `convex/schema.ts`).
- `lib/workflow/contracts.ts` — the Zod schema spine (`inputSchema → extractionSchema → outcomeSchema → resultSchema`), `jitless: true` (Convex forbids runtime codegen).
- `lib/workflow/workflow.ts` — `processDeal`, `assess`, `liveDependencies`, `fingerprint`, `localDate`.
- `lib/workflow/gemini.ts`, `gemini-schema.ts`, `compare-gemini.ts`, `search-gemini.ts` — Gemini wrappers (extraction, comparison, search understanding/recommendation).
- `lib/workflow/geoapify.ts` — restaurant geocoding/matching (city-boundary lookup then `/v2/places` name/address scoring).
- `lib/workflow/search.ts`, `search-contracts.ts`, `search-map.ts`, `web-discovery.ts` — the search feature.
- `lib/workflow/compare.ts`, `compare-contracts.ts` — the comparison feature.
- `lib/workflow/network.ts`, `errors.ts`, `config.ts` — shared resilient fetch, `WorkflowError`/`safeError`, and the single env-var choke point (`pickWorkflowEnv`, `providerUsageAuthorized`-gated `searchProviders`/`comparisonProvider`).
- `lib/workflow/http.ts` — registers the public `/v1/*` REST API (mounted from `convex/http.ts`), disabled unless `WORKFLOW_API_TOKEN` is configured.
- `lib/frontend/workflow.ts` — a legacy browser client (`workflowApi`) for this pipeline, explicitly commented to never target the canonical deployment.

## Key Details

- **Auth idiom**: `workflow/auth.ts#requireOwner(ctx)` reads `ctx.auth.getUserIdentity().subject.split("|")[0]` as a plain string — not a typed `Id<"users">`. Contrast [[Auth and Ownership Model]].
- **Rate limits**: 20/hour job submission (`workflowLimits`), 60/hour search+compare combined (`workflowSearchLimits`) — see [[Rate Limiting Patterns]].
- **`assess()`** (`workflow.ts:25`) is the review-gating rule engine: flags expiry, confidence < 0.88, missing currency, missing validity window, stale/missing publish date, address mismatch, ambiguous restaurant match.
- `lib/workflow/search-map.ts#toMapDeals` is a pure, React-free adapter from this pipeline's `Recommendation[]` to a shape structurally compatible with `@restaurant-deals/map`'s `MapDeal` — a different adapter from the canonical pipeline's `lib/mapAdapter.ts` (see [[Map Rendering]]).

## Open Questions

- Whether this pipeline's `workflowDeals` will ever be merged into the canonical `deals` table, or remain permanently separate, is a product/architecture decision tracked in `docs/decisions/0001-teammate-backend-integration.md` rather than settled in code.

## Sources

- [[Source - Project Process Docs]]
