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
  2. Pure supporting utilities in `lib/dealReviewForm.ts`:
     - Strict decimal price grammar parser (`parsePriceInput`): Restricts to standard decimal price grammar (`/^\d+(\.\d+)?$/`), strictly rejecting hex (`0x10`), scientific notation (`1e3`), incomplete decimal points (`1.`), and negative numbers while retaining partial text without coercing to zero.
     - Shared publish readiness gate (`getDraftPublishReadiness` / `validateReviewFormSubmission`): Evaluates both canonical draft rules and local price input. Blocks submission if local input has parse errors, incomplete decimals, or uncommitted changes differing from `draft.fields.priceCad.value`.
     - Price display helper for Accept All (`getPriceDisplayOnAcceptAll`): Pure helper resolving display string when all suggestions are accepted.
     - Model confidence formatting (`formatConfidence`): Hides and rejects any confidence value outside 0..1, NaN, or non-finite inputs without clamping into fabricated probability scores.
     - Omission semantics (`OMISSION_SEMANTICS`): Honest explanation for all 6 omissible fields; `expiresOn` labeled as "Confirm no expiry listed" with explanation "No expiration date listed in source; expiry is unlisted or unknown", presenting unavailable expiry without asserting ongoing indefinite duration.
     - Weekday explicit transition helper (`transitionWeekdaySelection`): Prevents unchecking the last selected weekday from silently confirming every-day availability; provides explicit reminder and requires deliberate action ("Set to available every day") to clear weekday restrictions.
     - Review issue evaluation (`evaluateIssueResolution`): Flags `FUTURE_START` as hard blocker and `CURRENCY_UNVERIFIED` as requiring manual price entry/omission.
     - Helpers: `hasPendingSuggestions`, `formatWeekday`, `isFieldReviewed`.
  3. Controlled review form UI in `components/deals/DealReviewForm.tsx`:
     - Uses React `useId` for unique label and input IDs across multi-offer review instances.
     - Synchronizes `localPrice` ONLY on explicit user actions (Accept All, Accept Price Suggestion, Omit Price, Select Offer), strictly preserving in-progress typing and error messages across background/reactive extraction updates.
     - Individual price accept clears existing local error.
     - Blocks `handleSubmit` directly using the shared `getDraftPublishReadiness(draft, localPrice)` helper.
     - Reusable `SuggestionItem` reduces duplicated markup and inline styles.
     - Reuses Harry's existing styling classes (`panel`, `form-stack`, `field`, `field-row`, `button primary`, `button secondary`, `text-button`, `form-error`, `quiet-note`, `weekdays`).
     - Preserves Loom's ownership: does NOT touch or mount `ReelIntake.tsx`.
- Changed files:
  - `components/deals/DealReviewForm.tsx`
  - `lib/dealReviewForm.ts`
  - `tests/import/dealReviewForm.test.ts`
  - `docs/handoffs/n-form-ui.md`
- Checks actually run (command, exit code, evidence):
  - `npm test -- tests/import/dealReviewForm.test.ts`: Exit 0 (35/35 tests passed covering decimal price grammar, confidence 0..1 validation, honest omission semantics, accept-all price display, weekday explicit transition, shared publish gate with prior-good-price/invalid-text, issue resolution guards, suggestion accept/reject, manual edit and reactive error resilience, location invalidation, and publish error reporting)
  - `npm test`: Exit 0 (531/531 tests passed across 22 test files)
  - `npm run typecheck`: Exit 0 (`tsc --noEmit` passed with 0 errors)
  - `npm run lint`: Exit 0 (`eslint .` passed with 0 warnings/errors)
  - `npm run test:workflow`: Exit 0 (23/23 tests passed in `scripts/agent-workflow.test.mjs`)
  - `npm run build`: Exit 0 (Next.js 16.3.8 Turbopack production build succeeded)
  - `node /tmp/dishdeals-owner-check.mjs N-FORM-UI`: Exit 0 (approved centralized packet ownership PASS)
- Unrun live/phone checks and why: No live phone, native UI, or live AI provider calls executed. Tests use pure deterministic unit test fixtures. Mounting into intake flow and live device/share sheet testing belongs to Harry/Loom; map integration slot belongs to human team.
- Draft PR: None created (instruction authorizes scoped local commit only; no push, PR, or cloud mutation).
- Review findings and resolution: All Northstar corrective review feedback addressed. Prior valid draft price cannot be accidentally published with invalid local text; decimal grammar restricted; price synchronizes on explicit user actions only; instance IDs unique via useId; confidence range validated strictly; expiry duration not falsely asserted; weekday last uncheck prevented; duplicated markup reduced.
- Remaining risks / human setup: Active task lanes are Cinder continuation on validity and Northstar coordination/integration. Mounting into `ReelIntake.tsx` is pending Loom.
- Stop condition met; next proposed task (not dispatched): Scoped local commit ready for Northstar integration.
