# Combined build

User request: combine the latest teammate work into a usable build.

Branch `t-24-combined-build` in the isolated `f259/DishDeals` checkout. Base: `origin/t-21-frontend-integration` at `3b0a034`. This already integrates T-20 Reel sharing, T-22 flexible sharing, T-23 web discovery, and adapted extraction/map/search/comparison modules documented in `docs/feature-modules/README.md`.

Merged `origin/Business-Data` at `2e1f2af` (restaurant business-license spreadsheet) and `origin/Harrys-Frontend` at `ffe54c1` (brand/reference assets). Both merged without conflicts. The spreadsheet is included as a source asset; it has not been imported into the live database.

Older standalone feature branches remain preserved on GitHub. Their functional modules are already adapted into the canonical application; their obsolete root scaffolds are not merged again. `gh-pages` contains compiled hosting output and is not application source. The separate tenets/workflow-policy branch is unrelated to the product build and is not included.

This branch provides one combined source build without changing `main`, deploying, seeding a database, or invoking paid providers. Existing backend/deployment evidence in teammate handoffs was read, not independently repeated here. Reel provider authorization, iOS signing/device acceptance, grounded-search quota, and missing canonical profile/vote adapters remain subject to their documented limitations.

The exported frontend reference's original `support.js` is excluded from ESLint as reference material; its original bytes are preserved. Application lint rules remain enabled. Stale `.next` output from the previous branch was cleared before validation.

Validation: `npm.cmd run check` passed (exit 0): typecheck, lint, 198 application/backend tests, 23 repository-workflow tests and the production static build. `git diff --check` passed. An independent read-only agent verified asset-only merging preserved the integrated backend and Reel/iOS implementation; its reference-exporter lint finding was fixed by the scoped lint exclusion above. Do not treat local mocked tests as real phone/provider acceptance.
