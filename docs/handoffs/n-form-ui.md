# N-FORM-UI handoff

- Status: review
- Owner, branch, worktree, base SHA, head SHA: Mica (Gemini Flash), branch `t-07-common-review-form`, worktree `/Users/william/Code/DishDeals-worktrees/common-review-form`, base SHA `1eb2e7cb4f094aa1a7a460889686fdf31e8355aa`, head: tip of branch `t-07-common-review-form`
- Scope and writable paths: `components/deals/DealReviewForm.tsx`, `lib/dealReviewForm.ts`, `tests/import/dealReviewForm.test.ts`, `docs/handoffs/n-form-ui.md`
- Dependencies and contract changes:
  1. Reusable controlled form component `DealReviewForm` with pinned contract props:
     ```ts
     export interface DealReviewFormProps {
       draft: DealDraft;
       onAction: (action: DealDraftAction) => void;
       onPublish?: (fields: PublishFields) => Promise<void>;
       publishUnavailableReason?: string;
       renderLocation?: (context: {
         draft: DealDraft;
         onConfirm: (point: { lat: number; lng: number }) => void;
       }) => ReactNode;
       busy?: boolean;
     }
     ```
  2. Implemented `lib/dealReviewForm.ts` supporting utilities:
     - `OMISSION_SEMANTICS`: Accurate explanations for all 6 omissible fields (`address`, `priceCad`, `hours`, `expiresOn`, `validDays`, `conditions`).
     - `formatConfidence`: Truthful model self-assessment display (`"Model assessment: X%"` for present values, `null` when undefined); never fabricates probability or certainty scores.
     - `parsePriceInput`: Retains user input text without coercing empty/invalid strings to zero, rejects negatives.
     - `evaluateIssueResolution`: Flags `FUTURE_START` as hard blocker (cannot be resolved by this adapter) and enforces non-empty resolution notes for `UNSUPPORTED_CONSTRAINT`.
     - `getDraftPublishReadiness`: Bridges to `validateForPublish` in `lib/dealDraft.ts` returning `{ canPublish: boolean; errors: string[] }`.
     - `hasPendingSuggestions`, `formatWeekday`, `isFieldReviewed`.
  3. Controlled review form UI in `components/deals/DealReviewForm.tsx`:
     - Provenance display (source URL, image ID).
     - Extraction status callouts (`pending`, `no_deal_detected`, `error`, `canceled`).
     - Multi-offer selection support (`unselectedOffers`, `SELECT_OFFER`).
     - Review notices list with resolution inputs and blockers (`FUTURE_START` unresolvable; `UNSUPPORTED_CONSTRAINT` requires non-empty note; `CURRENCY_UNVERIFIED` manual entry hint).
     - Global and per-field suggestion accept/reject controls (`ACCEPT_ALL_SUGGESTIONS`, `ACCEPT_SUGGESTION`, `REJECT_SUGGESTION`).
     - Explicit review omission buttons with canonical semantics.
     - `renderLocation` slot or pending notice; location invalidated on restaurant/address change via reducer.
     - Truthful publish gate with `validateForPublish` check, error listing, and rejection preservation without state loss.
     - Clean CSS styling reusing Harry's classes (`panel`, `form-stack`, `field`, `field-row`, `button primary`, `button secondary`, `text-button`, `form-error`, `quiet-note`, `weekdays`).
  4. Isolation: Does NOT edit or mount `components/reels/ReelIntake.tsx` (owned by Loom).
- Changed files:
  - `components/deals/DealReviewForm.tsx`
  - `lib/dealReviewForm.ts`
  - `tests/import/dealReviewForm.test.ts`
  - `docs/handoffs/n-form-ui.md`
- Checks actually run (command, exit code, evidence):
  - `npm test -- tests/import/dealReviewForm.test.ts`: Exit 0 (20/20 tests passed covering price parsing, confidence formatting, omission semantics, review issue resolution, suggestions accept/reject, manual edit preservation, location invalidation, publish readiness, and draft preservation on rejection)
  - `npm test`: Exit 0 (516/516 tests passed across 22 test files)
  - `npm run typecheck`: Exit 0 (`tsc --noEmit` passed with 0 errors)
  - `npm run lint`: Exit 0 (`eslint .` passed with 0 warnings/errors)
  - `npm run test:workflow`: Exit 0 (23/23 tests passed in `scripts/agent-workflow.test.mjs`)
  - `npm run build`: Exit 0 (Next.js 16.3.8 Turbopack production build succeeded)
  - `node /tmp/dishdeals-owner-check.mjs N-FORM-UI`: Exit 0 (approved centralized packet ownership PASS)
- Unrun live/phone checks and why: No live phone, native UI, or live AI provider calls executed. Tests use synthetic unit test fixtures for the form component and draft state helpers. Live mounting into intake flow and browser/native testing belongs to Harry/Loom; map rendering belongs to Pinyuan.
- Draft PR: None created (instruction authorizes scoped local commit only; no push, PR, or cloud mutation).
- Review findings and resolution: All N-FORM-UI requirements satisfied. Component strictly controlled via onAction; no local state overrides draft source of truth; publish validation checks validateForPublish; manual edits preserved.
- Remaining risks / human setup: Mounting into `ReelIntake.tsx` is pending Loom's handoff. Map rendering slot `renderLocation` is pending Pinyuan's map component.
- Stop condition met; next proposed task (not dispatched): Local scoped commit ready for Northstar review and integration. Next proposed work is Loom's wiring of `DealReviewForm` into `ReelIntake.tsx`.
