# Integrated DishDeals trial

Previous trial: https://dishdeals-trial.cpy1111.chatgpt.site (public link access; backend is the existing Convex dev deployment). That publishing project is currently inaccessible, and this URL has not been updated with the new frontend. The latest frontend is prepared on `gh-pages`, pending the repository owner's Pages setup. See [the current integration handoff](handoffs/t-21-frontend-integration.md) and [Pages instructions](GITHUB-PAGES.md).

This branch integrates the existing feature modules into the root Next.js app. The user authorized a web trial on the existing `william-wen/dishdeals` development deployment, including map/geocoding integration and public link access. It does not merge into the human-owned main branch or claim completion of the full StormHacks plan.

## Try it

1. Continue as guest, or create an email/password account. Guest history belongs to the saved browser session; an email account can access its submissions across devices.
2. Submit pasted offer text, a screenshot/flyer, or a public restaurant webpage. Supply the original publication date only when known. Instagram links are attribution only; upload the screenshot or paste the caption instead.
3. Open your saved task to see processing, failure/retry or extracted offers. Uncertain offers remain private until you confirm a verified restaurant candidate or reject them. A missing candidate requires a clearer caption and retry. High-confidence complete offers may publish automatically.
4. Search published offers in English or Chinese, filter known CAD prices, optionally use the map center as the distance origin, and ask why to consider a particular restaurant. This searches submitted offers, not the whole internet.
5. Select 2–5 offers from distinct restaurants and compare value, price or taste. Taste comparisons accept review excerpts and HTTPS source URLs; supplied reviews are not independently verified. Missing evidence is reported, not invented.

No fictitious restaurant offers are seeded into live tables. An empty feed needs a real source submitted before map pins or comparison become available.

## Setup

Use Node 24 and `npm ci`. Configure ignored `.env.local`:

```text
CONVEX_DEPLOYMENT=dev:proper-marmot-82
NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud
```

Backend secrets: `GEMINI_API_KEY`, `GEOAPIFY_API_KEY`, and Convex Auth's `JWT_PRIVATE_KEY`/`JWKS`. The signing pair must match; use the official Convex Auth setup procedure for a fresh deployment. Secrets belong in Convex environment variables, never in source or `NEXT_PUBLIC_*` values. Optional model overrides: `GEMINI_MODEL`, `GEMINI_SEARCH_MODEL`, `GEMINI_COMPARISON_MODEL`, `GEMINI_FALLBACK_MODEL`. The code default is `gemini-3.8-flash`; the existing dev deployment is configured with `GEMINI_MODEL=gemini-3.5-flash-lite` after live 3.8 extraction encountered provider overload. The inherited `gemini-2.5-flash` returned HTTP 404 with this project key. Provider response schemas retain structural types; bounds, regexes and date validation are enforced by the complete local Zod schema to avoid provider schema-complexity errors.

With explicit deployment authorization, `npx convex dev --once --env-file .env.local` syncs only the selected dev environment. `npm run dev` starts the frontend. `npm run check` checks types, lint, unit/backend contracts, Git workflow tests and the static build. `npm run build` exports the web app to `out/`, suitable for any HTTPS static host. Client auth needs no Next.js server or SSR middleware.

The previous Sites hosting publication uses a separate checkout containing its static export and deployment manifest. The latest GitHub Pages export is on `gh-pages`; editable source is on `t-21-frontend-integration`.

## Integration boundaries

- Canonical `profiles`, `deals`, `votes` and Convex Auth tables retain their original fields. Imported work lives in additional `workflowJobs`, `workflowDeals`, `workflowRestaurants`, `workflowLimits`, and `workflowSearchLimits` tables. Root generated APIs are produced by Convex.
- Workflow offers appear in this trial feed; canonical `deals` are not silently converted. No global confidence score is presented as canonical per-field confidence.
- Owner checks use the Convex Auth user portion of the subject, so job history survives a new login session. Unpublished offers and input contents are not exposed in the public catalog or job-history list.
- Existing provider validation, quotas, deduplication, atomic storage, expiry cleanup and HTTP integrations are preserved. `/v1/*` protected routes remain disabled unless a server integration explicitly configures `WORKFLOW_API_TOKEN`; the browser uses authenticated Convex functions.
- Map scans at most 500 published offers and returns 100. Search scans 500. This is a bounded trial, not a large-scale geospatial index. Comparison reads exact selected IDs.
- Current time comes from the browser when filtering the reactive map query. Server actions evaluate schedules at request time. Distance uses the map center when selected, not a claimed device location.
- Images are resized in the browser to fit the workflow payload bound. Videos, editable extraction fields, draggable confirmation pins, voting, profiles, Solana tips and PWA installation remain outside these four imported feature modules.

The original independent feature branches remain available. See [module provenance](feature-modules/README.md).
