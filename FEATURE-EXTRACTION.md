# DishDeals: deal extraction and ingestion

Standalone Convex + Gemini + Geoapify backend for extracting restaurant offers from text, screenshots and readable public pages, verifying locations, and publishing or reviewing deals.

Module: [ai-workflow](ai-workflow/README.md).

Checks from ai-workflow: `npm ci`, `npm run typecheck`, `npm test`, `npm run demo`.

Search, comparison, and the map component have separate feature branches.

This is a standalone feature handoff based on the original DishDeals module baseline (f3354c1). The canonical web app on main has since evolved separately. These modules are not integrated into its root schema, authentication, or UI; follow docs/decisions/0001-teammate-backend-integration.md on main before integration. No cloud deployment or live provider validation is claimed.
