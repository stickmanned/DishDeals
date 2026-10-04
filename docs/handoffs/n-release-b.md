# N-RELEASE-B handoff

Full record: `docs/release/backend/n-release-b.md`. Branch `t-19-dev-backend-release`, base `5f3b23e`. The committing SHA is in the return message.

- **Done:** target classified (dev proper-marmot-82), inventory, data + file-storage backup (0600 zip, 95,190 bytes, sha256 in the record), additive preservation proven, one dev push of the base at 02:29:59 (functions ready, `geospatial` installed), post-push verification, env models and the two model gates set.
- **Not done / blockers:** geocode gate (needs an owned public HTTPS URL for the User-Agent; no invented contact); `REEL_WEB_ORIGIN` (Northstar, after host); Convex-config typecheck not passed (amendment proposed: `lib/profile.ts` line 1 → `../convex/_generated/dataModel`); Gemini credential/model/billing availability untested; no live model, extraction or geocode call.
- **Changed paths:** `convex/_generated/api.d.ts`, `convex/_generated/server.d.ts` (authentic codegen), `docs/release/backend/n-release-b.md`, `docs/handoffs/n-release-b.md`. Local ignored `.env.local` (non-secret URLs) and a `node_modules` symlink were created in this checkout by the CLI/setup.
- **Checks:** root tsc 0, eslint 0, vitest 64 files/1695 tests (matches the gate log; the workflow node tests are 23/23 in the same log).
