# N-PUBLIC-ENTRY handoff

- **Status:** Complete / ready for review and local integration by Northstar.
- **Owner, branch, worktree, base SHA:**
  - Owner: Cinder (Antigravity Gemini 3.8 Flash High)
  - Branch: `t-07-reel-public-entry`
  - Worktree: `/Users/william/Code/DishDeals-worktrees/reel-public-entry`
  - Base SHA: `700c46801254010ac1433c7a4ae0f2313a3a52cd`
- **Scope and writable paths:**
  - `components/reels/ReelIntake.tsx`
  - `components/reels/CanonicalReelReview.tsx`
  - `tests/import/reelPublicEntry.test.tsx`
  - `docs/handoffs/n-public-entry.md`

## Summary of Changes
1. **Public Deal Entry & Feed-Pending Copy (`components/reels/ReelIntake.tsx`):**
   - Added a minimal functional "Public deal entry" section to `Result`:
     - Discloses the difference between a private save (stored privately to the account) and a public deal.
     - Accurate status copy: offer is published as a community deal on the map and deal detail page, explicitly disclosing that Discover feed integration is pending until resolved (avoids false promise given broken legacy feed query).
     - Direct jump anchor `<a href="#reel-deal-review">` to the review and publish form.
     - Encoded provenance link `<Link href="/post?source=...">` to the standard manual post form.
   - Updated `AttachRecording` copy to accurately describe recording as optional:
     - Title updated to `Attach recording (optional)`.
     - Copy explains that the saved Instagram link alone supplies no facts and cannot be automatically analyzed; users can optionally attach a screen recording, review/publish manually below, or use the standard post form with screenshot/caption text.
2. **Review Anchor, Publish Affordance & Gating (`components/reels/CanonicalReelReview.tsx`):**
   - Added `id="reel-deal-review"` to the main container for the review anchor.
   - Added a clear note explaining private save vs. public community publication: saving keeps the draft private to the account; publishing makes the offer a community deal on the map and deal detail page (feed integration pending until resolved).
   - Added direct link to `/post?source=${encodeURIComponent(sourceUrl)}` for users who prefer standard manual post submission.
   - **Publish Affordance Bugfix:** Scoped `effectivePublishUnavailableReason` so that when `onPublish` is supplied and no custom reason is given, the form receives `publishUnavailableReason={undefined}`, allowing `DealReviewForm` to render `<button type="submit" className="button primary draft-submit">Publish deal</button>`. (Previously, defaulting `publishUnavailableReason` to a string in props destructuring caused `DealReviewForm` to hide the submit button and show a quiet note even with `onPublish` present).
   - Preserved all preconditions: version checking, in-flight publishing lock, draft existence, and authentication/profile gate messages.
3. **Synthetic Regression Tests & DOM Parsing (`tests/import/reelPublicEntry.test.tsx`):**
   - Added helper `parseButtons` to extract rendered `<button>` elements, attributes, and text from SSR markup.
   - Verified that naive text assertions like `expect(html).toContain("Publish deal")` are vulnerable to false-passes because the explanatory note contains the text `click "Publish deal"`.
   - Added 4 explicit publish affordance test cases asserting actual rendered DOM button tags/roles:
     - **Available handler + no reason:** MUST render `<button type="submit" class="...draft-submit...">Publish deal</button>` with `disabled=false`.
     - **No-handler default unavailable:** `onPublish: undefined` must NOT render the submit button; renders default unavailable text and preserves private save button.
     - **Explicit signed-out reason:** must NOT render the submit button; renders the signed-out notice.
     - **Explicit profile-pending reason:** must NOT render the submit button; renders the profile-pending notice.
     - **Mutation revert guard test:** proves that when `publishUnavailableReason` is provided (simulating the original bug where default reason suppressed the button), DOM button parsing detects the absent button while naive string matching false-passes.
   - Verified pending feed copy assertions in both `CanonicalReelReview` and `ReelIntake`.

## Checks Actually Run
- `npx vitest run tests/import/reelPublicEntry.test.tsx`: 9/9 tests passed (SSR static markup, not a phone or browser).
- `npx vitest run tests/import/`: 21 test files / 792 tests passed with 0 regressions.
- `npm run typecheck`: clean (`tsc --noEmit`, exit code 0).
- `npm run lint`: clean (`eslint .`, exit code 0).

## Mutation Revert Guard Verification
- Tested mutation revert behavior:
  - If `CanonicalReelReview` passes a fallback string to `publishUnavailableReason` when `onPublish` is provided, `DealReviewForm` renders `<p className="quiet-note">` and does not render `<button type="submit">`.
  - Naive assertion `html.includes("Publish deal")` returns `true` (false-pass on paragraph copy).
  - DOM assertion `findSubmitPublishButton(parseButtons(html))` returns `undefined` (correctly fails on regression).
- All checks explicitly labeled as SSR static markup; no false claims of phone or cloud verification.

## Boundaries & Blockers
- No native code, XcodeGen, backend schema, auth provider, or package modifications made.
- No automated cloud deployment, provider calls, or account sign-ins performed.
- Stopping now after one ticket as required.
