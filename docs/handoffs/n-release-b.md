# N-RELEASE-B handoff

Full record: `docs/release/backend/n-release-b.md`. Branch `t-19-dev-backend-release`, base `5f3b23e`. The committing SHA is in the return message.

- **Done:** target classified (dev proper-marmot-82), inventory, data + file-storage backup (0600 zip, 95,190 bytes, sha256 in the record), additive preservation proven, one dev push of the base at 02:29:59 (functions ready, `geospatial` installed), post-push verification, env models and the two model gates set.
- **Not done / blockers:** geocode gate (needs an owned public HTTPS URL for the User-Agent; no invented contact); `REEL_WEB_ORIGIN` (Northstar, after host); Gemini credential/model/billing availability untested; no live model, extraction or geocode call.
- **Corrective sync (Northstar-approved amendment):** `lib/profile.ts` line 1 now imports `../convex/_generated/dataModel` (`c577cd3`). First push had Convex typecheck failing (kept in the record); after the fix `tsc -p convex/tsconfig.json --noEmit` 0, root tsc 0, eslint 0, vitest 1695; one corrective `convex dev --once --typecheck enable` at 02:36:27 passed Convex's own typecheck with no drift and no function/data change. Applied SHA `c577cd3`.
- **Changed paths:** `lib/profile.ts` (one type-only import line), `convex/_generated/api.d.ts`, `convex/_generated/server.d.ts` (authentic codegen), `docs/release/backend/n-release-b.md`, `docs/handoffs/n-release-b.md`. Local ignored `.env.local` (non-secret URLs) and a `node_modules` symlink were created in this checkout by the CLI/setup.
- **Checks:** root tsc 0, eslint 0, vitest 64 files/1695 tests (matches the gate log; the workflow node tests are 23/23 in the same log).
