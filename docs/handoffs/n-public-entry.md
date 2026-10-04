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
1. **Public Deal Entry & Explanation (`components/reels/ReelIntake.tsx`):**
   - Added a minimal functional "Public deal entry" section to `Result`:
     - Discloses the difference between a private save (stored privately to the account) and a public deal (published to community Discover feed and map).
     - Provides a direct jump anchor `<a href="#reel-deal-review">` to the review and publish form.
     - Provides an encoded provenance link `<Link href="/post?source=...">` to the standard manual post form.
   - Updated `AttachRecording` copy to accurately describe recording as optional:
     - Title updated to `Attach recording (optional)`.
     - Copy explains that the saved Instagram link alone supplies no facts and cannot be automatically analyzed; users can optionally attach a screen recording, review/publish manually below, or use the standard post form with screenshot/caption text.
2. **Review Anchor & Public Entry Clarification (`components/reels/CanonicalReelReview.tsx`):**
   - Added `id="reel-deal-review"` to the main container for the review anchor.
   - Added a clear note explaining private save vs. public community publication: saving keeps the draft private to the account; publishing makes the offer public to everyone on Discover and map once required fields are confirmed.
   - Added direct link to `/post?source=${encodeURIComponent(sourceUrl)}` for users who prefer standard manual post submission.
   - Properly scoped `effectivePublishUnavailableReason` so that when `onPublish` is supplied and no custom reason is given, the form correctly displays the publish controls rather than blocking with the default offline notice.
   - Kept field confirmations, source reviews, profile checks, manual pin, and `deals.create` genuine receipt logic intact.
3. **Synthetic Regression Tests (`tests/import/reelPublicEntry.test.tsx`):**
   - Added 5 component test cases with `react-dom/server` (clearly labeled SSR / synthetic, not a phone/browser):
     - `CanonicalReelReview` contains `id="reel-deal-review"` direct review anchor.
     - `CanonicalReelReview` renders clear explanation of private save vs. public community publication.
     - `CanonicalReelReview` renders encoded provenance link `/post?source=<encoded sourceUrl>`.
     - `CanonicalReelReview` distinguishes active publish controls from unavailable publish states.
     - `ReelIntake` renders the public deal entry panel with anchor link, encoded `/post` link, and optional recording copy.

## Checks Actually Run
- `npx vitest run tests/import/reelPublicEntry.test.tsx`: 5/5 tests passed (captured 5 initial failures prior to implementation).
- `npx vitest run tests/import/`: 21 test files / 788 tests passed with 0 regressions.
- `npm run typecheck`: clean (exit code 0).
- `npm run lint`: clean (exit code 0).

## Boundaries & Blockers
- No native code, XcodeGen, backend schema, auth provider, or package modifications made.
- Native receipt continues to rely on real returned deal ID.
- No automated cloud deployment, provider calls, or account sign-ins performed.
- Stopping now after one ticket as required.
