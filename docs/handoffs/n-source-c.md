# N-SOURCE-C handoff

- Status: review (local commit, not pushed)
- Owner Prism (Claude Code replacing exhausted Gemini); branch `t-05-reel-source-constraints`; worktree `/Users/william/Code/DishDeals-worktrees/reel-source-constraints`; base `33b894d`; head SHA: see commit reply.
- Scope: typed source constraints before canonical publishing. Design in `docs/integration/reel-source-constraints.md`.
- Changed files: `lib/reels/contract.ts`, `lib/reels/contract.test.ts`, `lib/reels/toDealDraft.ts`, `convex/reelActions.ts`, `tests/import/reelConstraints.test.ts` (new), `tests/import/reelDraft.test.ts` (Northstar-approved amendment: only the five legacy fixtures), `docs/integration/reel-source-constraints.md`, `docs/handoffs/n-source-c.md`. No schema, generated, package, UI, map or Swift edits.
- Contract change: additive `constraints` on private extraction output; no database or canonical field change.
- Behavior: legacy output without `constraints` always gets an explicit blocking legacy-review note (the two bypass options in the earlier uncommitted draft were removed). Typed `FUTURE_START` is a hard block the reducer cannot resolve. Model request now requires the array; the parser still reads old rows.
- Old tests: five legacy expectations in `tests/import/reelDraft.test.ts` now assert the new legacy review note and resolve it with a non-empty note before the valid-publish checks; all other assertions unchanged.
- Checks: see the commit reply for exact commands and results.
- Corrective (Northstar review of 02dad858): `quoteSupportsDate` now requires a complete, unambiguous date including the year (ISO, month name + day + 4-digit year, or numeric with one valid reading). Year-less, relative, publication-anchored and ambiguous MDY/DMY dates are rejected as `FUTURE_START` and must be `UNSUPPORTED_CONSTRAINT` with `startsOn: null` (blocking note kept). Prompt, helper, design doc and tests aligned; existing quote/transcript/timestamp bounds unchanged.
- Source limitations: visual evidence not independently provable; timestamps are numeric seconds while Google's video guide shows MM:SS; synthetic transport only.
- Unrun: live Gemini output with the new prompt, real media, provider, cloud, phone. No success is claimed for them.
- Needed from others: Mica's form must keep the full sidecar (including `constraints`) across saves and show typed notes via the existing review issues. No adapter change is needed for Mica's `reviewDraft` helper (not touched).
- Stop condition met; no next ticket started.
