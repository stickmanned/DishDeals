# T-08G-B handoff: authenticated durable geocode wrapper

Checkout `/Users/william/Code/DishDeals-worktrees/durable-geocode`, branch `t-08-durable-geocode-core`, base `e4d9cec`. Local only: no Nominatim or other provider request, no cloud, codegen, env read, secret or remote action; no package, `deals.ts`, auth, map, frontend or Swift change. Design and policy notes: `docs/integration/durable-geocode.md`.

## States
- **Implementation:** ready (local). **Local checks:** pass (convex-test, scripted fake transport, synthetic data).
- **Pending:** any real provider request, the Find button, map and pin confirmation, WKWebView/phone, codegen and deployment.

## Changed paths
`convex/geocode.ts` (public action), `convex/geocodeState.ts` (internal gate and cache), `convex/schema.ts` (additive `geocodeGate` and `geocodeCache` with `by_key` / `by_expiry` indexes), `convex/convex.config.ts` (three optional env names), `convex/_generated/api.d.ts` and `server.d.ts` (hand registration), `.env.example` (force-added; names only), `tests/backend/geocodeAction.test.ts`, `docs/integration/durable-geocode.md`, this handoff. `lib/geocodeCore.ts` is read-only and reused unchanged.

## Commands and results
- Environment: no usable `node_modules` here; I used a read-only clone of the root checkout's installed `node_modules` and the ignored `map-component/dist` (not committed, no env copied).
- `npx tsc --noEmit`, `npx eslint .`: clean.
- `npx vitest run tests/backend/geocodeAction.test.ts`: 43 passed.
- Mutation checks each failed tests: gate boundary changed either way, cache expiry ignored, in-place row reuse removed, cache write validation removed, sign-in check removed, server gate removed, cache key not hashed. (Forwarding `retryAfterMs` for every error code is behaviourally equivalent because only rate limits carry one.)
- `npm run check`: exit 0 (39 test files, 1172 vitest tests, 23 workflow tests, `next build`). Full-check counts are separate from the targeted count. One timer-based test was flaky under full-suite load on its first full run (the deadline timer starts after the gate step settles); both timeout tests now advance the clock in steps, and the suite passed three further consecutive runs plus the full check.
- `node /tmp/dishdeals-owner-check.mjs T-08G-B`: see the commit reply.

## Coverage
Signed-out; no gate, no User-Agent, bad User-Agent, bad endpoints (including a cached query refused when the gate is off); eight invalid query shapes without touching the gate; the exact provider request (endpoint, `jsonv2`, `bounded`, `limit`, `viewbox`, `q`, User-Agent); candidate filtering and the five-result cap; a genuine empty list; cache hits across case, whitespace and users with no network and no gate use; expiry at exactly seven days, in-place reuse, bounded maintenance, endpoint scoping and the hashed key; the gate at 999 ms and 1000 ms across users, eight simultaneous lookups producing one provider request, the singleton row, clock-skew handling and slot use by failed requests; HTTP 503/400/429, bad JSON, non-array, oversize body, network error, a hung request and a stalled body ending in typed errors with no secrets, no logging and no caching; out-of-envelope answers; internal-only registration of the helpers; `cachePut` validation; duplicate-row handling.
