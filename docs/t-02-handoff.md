# T-02 schemas handoff

Status: complete. Northstar read-only review returned PASS with no findings, and the schema was synced to the existing cloud dev deployment `dev:proper-marmot-82` under explicit human approval (see Cloud sync). T-03 and later are not started.

## Dependency exception

T-02 depends on T-01 being merged. T-01 is locally reviewed but uncommitted and unmerged, and its cloud/HTTPS/phone acceptance is pending. The human explicitly authorized LOCAL T-02 work on the reviewed scaffold. T-01 is not claimed as merged or externally validated.

## Inherited branch state

- Checkout `/Users/william/Code/DishDeals`; branch `t-02-schemas` created from `t-01-foundation` (both at `3635c7c`) with `git checkout -b`, carrying the uncommitted T-01 tree untouched. Nothing committed, stashed, reset or pushed.
- Baseline (T-01 tree plus human files) is everything `git status` showed before T-02: modified `README.md`; untracked `.agents/ .claude/ .gitignore AGENTS.md CLAUDE.md GEMINI.md app/ components/ convex/ docs/ eslint.config.mjs package-lock.json package.json postcss.config.mjs skills-lock.json tsconfig.json`. Baseline file hashes were recorded before editing (scratchpad only, not in repo).
- The checkout's ignored `.env.local` now points `CONVEX_DEPLOYMENT` at a human-configured **cloud dev** deployment, and `convex/_generated/` exists from the CLI. Both were preserved and not printed.

## T-02 changed paths

- New: `convex/schema.ts`, `lib/dealSchema.ts`, `lib/dealSchema.test.ts`, `docs/t-02-handoff.md`
- Modified over the baseline: `package.json`, `package-lock.json` (added `zod`, `@convex-dev/auth`; also pulls peer `@auth/core`)
- No other supporting config changed.

## Version choices

- `zod ^4.6.5` (v4 provides `z.toJSONSchema`, used by the plan's extract sketch; verified by a test).
- `@convex-dev/auth ^0.0.96`, the current npm release; peers `convex ^1.17` (installed 1.46.0) and `@auth/core ^0.41.1` (installed 0.41.3). Provides `authTables`. No auth setup, `auth.ts`, `http.ts` or providers added.
- `convex/_generated/ai/guidelines.md` was present and read; schema follows it (system fields not redeclared; no `createdAt`).

## Contract notes

- `convex/schema.ts` and `lib/dealSchema.ts` match the plan text field for field (comments kept). `lat`/`lng` are required `v.number()` contracts; no geospatial component or map wiring.
- Validation gaps left as in the plan (a later explicit ticket should decide): `validStart`/`validEnd` are not checked as `HH:MM`; `expiresOn` is not checked as `YYYY-MM-DD`; confidence numbers are not bounded to 0-1; empty strings pass; `DealResult` allows `isDeal: true` with no deals or `isDeal: false` with deals. Per-deal `null` must be converted to `undefined` before Convex inserts.
- Convex `profiles.displayName` length (2-24) is a comment only, as in the plan; enforcement belongs to `users.upsertProfile` (T-03).

## Checks (all run from the checkout unless noted)

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0, clean |
| `npm run lint` | exit 0, clean (one unused-variable warning in my test was fixed and re-run) |
| `npx vitest run` | 1 file, 7 tests passed |
| `npm run build` | exit 0; `/` and `/_not-found` static |
| `git diff --check` | exit 0 (tracked diff only; untracked files are not covered) |
| `npx convex dev --once` | **LOCAL ONLY, isolated copy**: exit 0. Succeeded with `CONVEX_AGENT_MODE=anonymous`, `CONVEX_DEPLOYMENT` unset, stdin closed, in a scratch copy of package files, `convex/schema.ts`, `lib/` with no `.env.local`. It indexed `deals.by_author`, `profiles.by_user`, `votes.by_deal_user` and the auth tables. |

The root `npx convex dev --once` was initially withheld because pushing to the cloud dev deployment was not yet authorized; it was run later after explicit human approval (see Cloud sync). The local run says nothing about that cloud deployment, HTTPS or a phone. No account, login, git push or production deploy occurred. No leftover backend process was found.

## Cloud sync (human-approved)

The human explicitly approved syncing the schema to the existing development deployment `dev:proper-marmot-82` (`https://proper-marmot-82.ca-central-1.convex.cloud`) only; no new project, account or production deploy. Before running, `.env.local` was confirmed (names/targets only, no secrets printed) to point at that deployment and no `CONVEX_*` variables were set in the shell.

- `npx convex dev --once` in the root: **exit 0**. CLI reported `Developing against deployment: [Development] william-wen:dishdeals:dev/william-wen`, then "Convex functions ready!".
- Indexes added: `deals.by_author`, `profiles.by_user`, `votes.by_deal_user`, plus the auth indexes (`authAccounts.providerAndAccountId`, `authAccounts.userIdAndProvider`, `authRateLimits.identifier`, `authRefreshTokens.sessionId`, `authRefreshTokens.sessionIdAndParentRefreshTokenId`, `authSessions.userId`, `authVerificationCodes.accountId`, `authVerificationCodes.code`, `authVerifiers.signature`, `users.email`, `users.phone`).
- `npx convex data` afterwards lists tables: authAccounts, authRateLimits, authRefreshTokens, authSessions, authVerificationCodes, authVerifiers, deals, profiles, users, votes.
- No schema-validation errors, incompatible documents or destructive migration were reported. `.env.local` and `convex/_generated/` were preserved; nothing was committed or pushed. No rebuild was run, since no source changed after the earlier passing checks.
- Not verified: browser/HTTPS/phone behaviour, and T-01's `test:ping` was not re-queried in this step.

## Review

Northstar (read-only, no checkout writes): schemas match the plan's fields, nullability, indexes and literals; the 7 tests are meaningful; manifest, lockfile and installed versions agree; no handoff overclaim. No findings, so no fixes. Limitations Northstar noted: files are untracked so Git gives no T-02 baseline diff, and Northstar did not rerun the commands (the results above are Loom's). JSON Schema conversion does not prove live Gemini compatibility; that is T-05.

## Remaining human steps

1. Review and commit when ready (nothing was committed).
2. T-03 (Convex Auth) is next per the plan and needs its own assignment.
