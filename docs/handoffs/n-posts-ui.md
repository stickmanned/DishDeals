# N-POSTS-UI handoff

- **Status:** Complete / ready for review and local integration by Northstar.
- **Owner, branch, worktree, base SHA:**
  - Owner: Cinder (Antigravity Gemini 3.8 Flash High)
  - Branch: `t-10-my-posts-section`
  - Worktree: `/Users/william/Code/DishDeals-worktrees/my-posts-section`
  - Base SHA: `dcdda819e97de9c371726dd7ba33585912afe7d5`
- **Scope and writable paths:**
  - `components/deals/MyPublishedDeals.tsx`
  - `app/post/page.tsx`
  - `tests/import/myPublishedDeals.test.tsx`
  - `docs/handoffs/n-posts-ui.md`

## Summary of Changes

1. **"Your published deals" Section (`components/deals/MyPublishedDeals.tsx`):**
   - Added `MyPublishedDeals` client component displaying the signed-in user's published deals.
   - Consumes Loom's pending backend contract `deals.listMine({ limit: 50 }) => Doc<"deals">[] & { imageUrl: string | null }` via typed `makeFunctionReference<"query">("deals:listMine")`.
   - **Signed-in gate:** When user is signed out (`!isAuthenticated`), the query is skipped with `"skip"`, and a clear signin prompt is rendered (`/signin?next=/post`). Loading states are honestly displayed with `role="status"`.
   - **Clear private vs public separation:** Displays a prominent callout with a link to `/reels` ("Saved Instagram posts/Reels"), explaining that private saves are distinct from public deals and are only visible to the user until published.
   - **Published deal cards:** Displays each deal with:
     - Restaurant name (`deal.restaurant`).
     - "Public deal" badge indicating it is public on the community map/feed.
     - Deal text (`deal.dealText`).
     - Price in CAD (`deal.priceCad` formatted as `$X.XX CAD`, or "Price varies").
     - Photo thumbnail if `deal.imageUrl` is provided, with safe alt text.
     - Navigation links:
       - Detail view: `/deal/${deal._id}` ("View deal")
       - Edit view: `/deal/${deal._id}/edit` ("Edit deal"), handed off to the existing author editor.

2. **Accurate Source Classification (Posts vs Reels):**
   - Implemented `classifyDealSource(sourceUrl)` in `components/deals/MyPublishedDeals.tsx`:
     - Distinguishes Instagram Reels (`/reel/` or `/reels/`) labeled as `"Instagram Reel"`.
     - Distinguishes Instagram Posts (`/p/`) labeled as `"Instagram Post"`.
     - Labels generic or unclassifiable Instagram links as `"Instagram source"` without guessing original forms for rewritten links.
     - Labels non-Instagram links as `"External link"`.
     - Labels missing, null, or empty source URLs as `"Direct post"`.
     - Safe external linking: `target="_blank"`, `rel="noreferrer noopener"`, `referrerPolicy="no-referrer"`, no injected HTML.

3. **Vancouver 7-Calendar-Day Retention & Deletion Rules:**
   - Implemented `getDealRetentionInfo(expiresOn, now)` in `components/deals/MyPublishedDeals.tsx`:
     - Evaluates dates in `America/Vancouver` using `formatVancouverParts`.
     - **Inclusive expiry:** Deal is active through the end of `expiresOn` in America/Vancouver.
     - **7-day retention rule:** Auto-deletion / deletion eligibility begins exactly 7 full calendar days after the end of `expiresOn` (calculated as `expiresOn + 8 calendar days` at 00:00 Vancouver time).
     - **Unknown expiry retained:** Deals with missing, null, or malformed `expiresOn` are retained indefinitely and cannot be automatically deleted.
     - **UI deletion gating:** Delete action is locked (`Delete (locked)`) with an explanatory note when a deal is active, within its 7-day retention period, or has unknown expiry. It is only enabled (`Delete deal`) after 7 full calendar days have elapsed since expiry in Vancouver.
     - Deletion execution calls `api.deals.remove` with confirmation, and errors do not clear the post creation form.

4. **Post Page Integration (`app/post/page.tsx`):**
   - Imported `MyPublishedDeals` and rendered it alongside `<CanonicalPost />` in `Page`.
   - Preserves canonical creation form, source prefill (`/post?source=...`), preview mode (`?preview=1`), and legacy notices (`?edit=`, `?job=`).
   - Loading or error states in "Your published deals" never clear or block the creation form.

5. **Comprehensive Synthetic Regression Tests (`tests/import/myPublishedDeals.test.tsx`):**
   - 13/13 tests verifying:
     - Reel URLs (`/reel/`, `/reels/`, `m.instagram.com/reel/`) -> `"Instagram Reel"`.
     - Post URLs (`/p/`, `m.instagram.com/p/`) -> `"Instagram Post"`.
     - Generic Instagram URLs (`/explore/...`, `/someuser`) -> `"Instagram source"`.
     - External URLs -> `"External link"`.
     - Missing source -> `"Direct post"`.
     - Missing/malformed `expiresOn` -> unknown expiry, retained indefinitely, deletion blocked.
     - Active deal on `expiresOn` date -> active, retained for 7 calendar days post-expiry, deletion blocked.
     - Deal within 7 calendar days post-expiry -> expired, retained until cutoff date, deletion blocked.
     - Deal >= 7 calendar days post-expiry -> expired, eligible for deletion, deletion enabled.
     - Signed-out state: query skipped with `"skip"`, sign-in prompt rendered, link to `/reels` rendered.
     - Loading state and empty state rendering.
     - Populated deals list with all badges, links (`/deal/[id]`, `/deal/[id]/edit`), and retention statuses.

## Checks Actually Run

- `npx vitest run tests/import/myPublishedDeals.test.tsx`: 13/13 passed in 21ms.
- `npx vitest run tests/import/`: 23 test files / 821 tests passed in 1.10s.
- `npm run typecheck` (`tsc --noEmit`): clean (exit code 0).
- `npm run lint` (`eslint .`): clean (exit code 0).
- `npm run test:workflow` (`node --test scripts/agent-workflow.test.mjs`): 23/23 tests passed in 12.8s.

## Environment & Build Distinctions

- Built in isolated worktree `/Users/william/Code/DishDeals-worktrees/my-posts-section` on branch `t-10-my-posts-section`.
- Root/central `node_modules` symlinked to `/Users/william/Code/DishDeals-worktrees/workflow/node_modules`.
- The live backend function `deals:listMine` is being implemented in parallel by Loom in ticket `N-POSTS-BACKEND`; this component binds to the exact pinned contract signature and will reactively load real rows once Northstar performs reviewed integration.
- No live network requests, cloud mutations, or mock accounts were created.

## Boundaries & Blockers

- No backend files, schema, packages, or native iOS code modified.
- Writable files strictly limited to the 4 assigned paths.
- No remote push or PR publication performed.
- Stopping now after one ticket as required.
