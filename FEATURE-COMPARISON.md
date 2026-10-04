# DishDeals: restaurant comparison

Compare two to five published restaurant offers by listed price, value, or supplied taste evidence, preserving source links, conditions and uncertainty.

Module: [ai-workflow/COMPARISON.md](ai-workflow/COMPARISON.md).

Dependency: `feature/ai-deal-search`, which depends on `feature/deal-extraction`. Comparison reuses schedule checks, record types, the structured Gemini adapter and the search rate-limit infrastructure. Review or merge dependencies first.

Checks from ai-workflow: `npm ci`, `npm run typecheck`, `npm test`, `npx tsx scripts/demo-comparison.ts`.

This is a standalone feature handoff based on the original DishDeals module baseline (f3354c1). The canonical web app on main has since evolved separately. These modules are not integrated into its root schema, authentication, or UI; follow docs/decisions/0001-teammate-backend-integration.md on main before integration. No cloud deployment or live provider validation is claimed.
