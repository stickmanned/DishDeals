# DishDeals: React deal map component

An embeddable React map with restaurant markers, selection and viewport callbacks, plus a raster fallback. It accepts data from the host application and requires no AI key.

Module: [map-component](map-component/README.md).

Checks from map-component: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`. Preview: `npm run dev`.

This branch is independent of the backend branches. Human frontend/map owners integrate it into the canonical web app.

This is a standalone feature handoff based on the original DishDeals module baseline (f3354c1). The canonical web app on main has since evolved separately. These modules are not integrated into its root schema, authentication, or UI; follow docs/decisions/0001-teammate-backend-integration.md on main before integration. No cloud deployment or live provider validation is claimed.
