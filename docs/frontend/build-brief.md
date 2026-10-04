# Dinedeals frontend build brief

Assignment: complete the frontend, strictly preserving the backend. Branch `t-18-frontend`, isolated from human-owned main at `d69529d495fbc76b80009fbfc78af6ed96fe5e04`.

## Refined request

Build a clean, responsive Dinedeals frontend from the supplied feature inventory and brand kit. Use the inspiration's compact heading, search, pills, photo-led cards and mobile navigation structure. Apply Bricolage Grotesque, Figtree and DM Mono; warm cream/white/oat surfaces; hairline stone borders; saffron offers; one red primary action. Keep the interface sparse and accessible.

Read and verify every backend contract before using it. Connect only source-backed public APIs. Separate explicitly labeled example content and local interaction previews from live data. Present unavailable live actions honestly; never fabricate extraction, authentication, publication, votes, payment receipts, coordinates or performance evidence. Preserve backend files, generated APIs, canonical contracts, existing providers, secrets and dependency versions. Do not deploy.

Complete frontend screens for discovery, filters, deal details, sign-in/profile, source entry, queued job status and candidate review. Provide loading, empty, validation, failure and recovery states. Use Vancouver time in browser validity calculations. Unknown prices remain visible under every price filter. No Instagram fetching. Verify build/types/lint/tests, keyboard and responsive interactions, and visual layouts at desktop and phone sizes. Use a fresh independent reviewer to confirm no backend file was changed or deleted.

## Verified source and material limitation

- Main implements only `test.ping` and the canonical schema. Its generated API contains only `test`.
- Published `feature/dishdeals-initial-implementation` at `e3a39cc3398a0e0866e5dbe4e606f7e06b2ed2ca` has a separate workflow backend: `deals.listForMap`, `jobs.submit/get/retryJob`, `deals.reviewDeal`. Its schema and IDs differ from main.
- Sign-up, profile save, canonical field editing/create/remove, votes and tipping are not implemented in the inspected backend. These are preview-only or explicitly unavailable live.
- The inventory was uncommitted in the earlier `frontend-features` worktree and is preserved as `source-feature-inventory.md` here. It describes a native iOS target; this assignment initially proceeds with the existing Next.js app, optimized for iPhone, pending user clarification. This is not a native iOS build.
- Map/geocoding publication behavior cannot be reconciled by changing the frontend. Workflow approval can select existing verified candidates; it cannot save arbitrary coordinates or field edits.

Writable scope: `app/`, new `components/frontend/`, new `lib/frontend/`, `public/`, `docs/frontend/`. Existing backend, generated files, provider components, canonical libraries, package manifest/lock and workflow ownership stay unchanged. Source references remain untouched.

Acceptance: usable reviewed frontend and source-backed integration adapters, with pending live credentials/auth/phone checks reported accurately. No ticket backlog dispatch or cloud changes.
