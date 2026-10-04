# DishDeals: AI deal search and recommendations

Natural-language search of published offers with budget, location, keyword and schedule filters; evidence-based restaurant pitches and a map data adapter.

Module: [ai-workflow/SEARCH.md](ai-workflow/SEARCH.md).

Dependency: `feature/deal-extraction`. Review or merge the extraction branch first.

Checks from ai-workflow: `npm ci`, `npm run typecheck`, `npm test`, `npm run demo:search`.

Restaurant comparison is a separate dependent branch.

This is a standalone feature handoff based on the original DishDeals module baseline (f3354c1). The canonical web app on main has since evolved separately. These modules are not integrated into its root schema, authentication, or UI; follow docs/decisions/0001-teammate-backend-integration.md on main before integration. No cloud deployment or live provider validation is claimed.
