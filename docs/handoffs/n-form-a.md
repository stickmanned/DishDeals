# N-FORM-A handoff

- Status: review
- Owner, branch, worktree, base SHA, head SHA: Mica (Gemini Flash), branch `t-07-reel-draft-adapter`, worktree `/Users/william/Code/DishDeals-worktrees/reel-draft-adapter`, base SHA `2011bf915bff0c25abc8d06cecebe30d0fc78a7b`, head: tip of branch `t-07-reel-draft-adapter`
- Scope and writable paths: `lib/reels/toDealDraft.ts`, `tests/import/reelDraft.test.ts`, `docs/handoffs/n-form-a.md`
- Dependencies and contract changes: Verified baseline containing Harry's `ReelExtraction` / `ReelDraft` contracts (`lib/reels/contract.ts`) and reviewed draft reducer (`lib/dealDraft.ts`). Implemented pure headless reel-to-deal-draft adapter (`reelExtractionToDealDrafts`).
  1. Headless integration: Bridges `ReelExtraction` to canonical `DealDraft[]` using canonical `createDraftsFromOffers` and `dealDraftReducer`. No UI, native, backend, or schema edits.
  2. Not a DealResult: Zero fake four-zero or 0.5 confidence scores; confidence remains `undefined`. Source evidence quotes, channels, and timestamps are preserved in sidecar metadata, not converted into fabricated probabilities.
  3. Quarantines `toCanonical`: The existing `toCanonical` function in `contract.ts` (which fabricated zero confidence and threw on null fields) is quarantined and never called.
  4. Initial review state: Confirms all draft fields start strictly with `isReviewed = false`.
  5. Unknown null arrays vs known arrays: Unknown `validDays` or `conditions` (null in `ReelDraft`) strip suggestions completely (`suggestion: undefined`), preventing false acceptance of every-day or no-restrictions presets while keeping fields unreviewed. Known arrays (including explicit `[]` from source) stay tentative suggestions until explicit user acceptance.
  6. Null restaurant: When `restaurant` is null, it remains blank and unreviewed without emitting a false "no_deal_detected" status.
  7. Non-CAD / unknown currency: Non-CAD amounts (e.g. USD) never map into `priceCad`. Preserved in `originalAmount` with indexed `CURRENCY_UNVERIFIED` review issue requiring manual price confirmation or omission. CAD prices remain tentative suggestions.
  8. Warnings as blocking notes: All non-empty warnings are mapped into blocking `UNSUPPORTED_CONSTRAINT` review notes requiring explicit resolution. `FUTURE_START` is not guessed.
  9. Explicit contract gaps: Identifies and reports lack of typed `startDate` and `unsupportedConstraints` in `ReelDraft` as extraction contract gaps in sidecar metadata (`contractGaps`).
  10. Isolation and immutability: Deep cloning ensures isolation between multi-offers and immutable sidecar metadata.
- Changed files:
  - `lib/reels/toDealDraft.ts`
  - `tests/import/reelDraft.test.ts`
  - `docs/handoffs/n-form-a.md`
- Checks actually run (command, exit code, evidence):
  - `npm test -- tests/import/reelDraft.test.ts`: Exit 0 (13/13 tests passed covering schema validation, no unknown array suggestions, known array confirmation, null restaurant, currency/originalAmount handling, warnings as blocking notes, manual edit preservation, no unchecked publish/unknown pin, multi-offer isolation, and immutable sidecar metadata)
  - `npm test`: Exit 0 (445/445 tests passed across 20 test files)
  - `npm run typecheck`: Exit 0 (`tsc --noEmit` passed with 0 errors)
  - `npm run lint`: Exit 0 (`eslint .` passed with 0 warnings/errors)
  - `npm run test:workflow`: Exit 0 (23/23 tests passed in `scripts/agent-workflow.test.mjs`)
  - `npm run build`: Exit 0 (Next.js 16.3.8 Turbopack production build succeeded)
  - `node /tmp/dishdeals-owner-check.mjs N-FORM-A`: Exit 0 (approved centralized packet ownership PASS)
- Unrun live/phone checks and why: No live phone, native UI, or live AI provider calls executed. Tests use scripted synthetic in-memory fixtures for `ReelExtraction` payloads and pure deterministic draft state reducer logic. Live device UI and share extension belong to Harry; map/geospatial integration belongs to Pinyuan.
- Draft PR: None created (instruction authorizes scoped local commit only; no push, PR, or cloud mutation).
- Review findings and resolution: All N-FORM-A requirements satisfied. Unknown schedule/conditions do not create empty array suggestions; non-CAD currencies strictly gate publish; warnings require explicit resolution; sidecar preserves evidence and reports contract gaps.
- Remaining risks / human setup: `ReelDraft` schema lacks typed `startDate` (future start) and `unsupportedConstraints` fields, reported as extraction contract gaps. Live Instagram share sheet receipt, media download, and video extraction remain pending Harry's native device integration.
- Stop condition met; next proposed task (not dispatched): Local scoped commit ready for Northstar review and integration. Next proposed work is Harry's native UI and share extension integration with this headless adapter.
