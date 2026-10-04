# ADR 0001 · preserve teammate modules and adapt to the canonical contract

Status: accepted for workflow setup; individual extraction mappings require review. Date: 2026-10-03.

Canonical product contract: root StormHacks plan, `lib/dealSchema.ts`, `convex/schema.ts`. Root T-01/T-02 commit `356ec1b` is the integration baseline. Teammate source at `origin/feature/dishdeals-initial-implementation` was inspected at `e3a39cc3398a0e0866e5dbe4e606f7e06b2ed2ca`; fetch and record any later head before reuse.

The teammate branch has a standalone `ai-workflow/` backend (jobs, restaurants, deals, limits; job data/status and different auth), plus `map-component/` and `map-site/`. Its code is valuable but a wholesale merge does not implement the root app contract. Preserve the branch and reuse narrow provider/normalization functions after contract tests. Human owners integrate map modules. Do not build a competing extraction system without inspecting this work.

| Teammate representation | Canonical field | Reconciliation |
| --- | --- | --- |
| restaurantName | restaurant | Explicit string mapping |
| title / description | dealText | Define deterministic choice; retain source evidence |
| price + currency | priceCad | Only map known CAD; other/unknown currency unresolved |
| Titlecase weekday names | mon..sun | Validated enum mapping |
| time / startDate / endDate | validStart / validEnd / expiresOn | Distinguish time window, start date, inclusive expiry; no guesses |
| conditions | conditions | Validate array |
| overall confidence, warnings, evidence | confidence per field | Never copy a global score into each field; require field evidence or explicit contract decision |
| jobId, dataJson, status | author-owned deals | Separate ingestion staging from canonical auth/deals; no table substitution |
| coordinate hints | lat / lng | Human confirmation/map lane; no invented coordinates |

No schema or map adapter is implemented by this decision. T-05R delivers concrete mapping/fixtures before T-05. Every live API model, key, latency, auth and deployment claim needs actual evidence. Existing mock tests do not prove live provider behavior.
