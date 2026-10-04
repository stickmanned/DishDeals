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

1. **"Your published deals" Read-Only Section (`components/deals/MyPublishedDeals.tsx`):**
   - Added read-only `MyPublishedDeals` client component displaying the signed-in user's published deals.
   - Consumes Loom's pending backend contract `deals.listMine({ limit: 50 }) => Doc<"deals">[] & { imageUrl: string | null }` via typed `makeFunctionReference<"query">("deals:listMine")`.
   - **Signed-in gate:** When user is signed out (`!isAuthenticated`), the query is skipped with `"skip"`, and a clear signin prompt is rendered (`/signin?next=/post`). Loading states are displayed with `role="status"`.
   - **Clear private vs public separation:** Displays a prominent callout with a link to `/reels` ("Saved Instagram posts/Reels"), explaining that private Reel saves are stored privately in your account and are separate from public deals until published.
   - **Published deal cards:** Displays each deal with:
     - Restaurant name (`deal.restaurant`).
     - "Public deal" badge indicating it is public on the community map/feed.
     - Deal text (`deal.dealText`).
     - Price in CAD (`deal.priceCad` formatted as `$X.XX CAD`, or "Price varies").
     - Photo thumbnail if `deal.imageUrl` is provided, with safe alt text.
     - Navigation links:
       - Detail view: `/deal/${deal._id}` ("View deal")
       - Edit view: `/deal/${deal._id}/edit` ("Edit deal"), handed off to the existing author editor.
     - **No delete mutation or duplicated editor:** Deletion is owned solely by the existing canonical detail page (`/deal/[id]`); this component does not add a delete mutation UI.

2. **Strict URL Source Classification (Posts vs Reels):**
   - Implemented `classifyDealSource(sourceUrl)` in `components/deals/MyPublishedDeals.tsx`:
     - Strictly requires credential-free HTTPS (rejects credentials, ports, non-HTTPS schemes like `http:`, `javascript:`, `data:` so invalid URLs never become clickable hrefs).
     - Exact host matching: `instagram.com`, `www.instagram.com`, and `m.instagram.com`.
     - Anchored pathname matching for shortcode (`/reel/`, `/reels/`, and `/p/`):
       - Instagram Reels labeled as `"Instagram Reel"`.
       - Instagram Posts labeled as `"Instagram Post"`.
     - Labels generic or unclassifiable Instagram links on exact hosts as `"Instagram source"` without guessing original forms for rewritten links.
     - Optional safe external HTTPS links labeled as `"External link"`.
     - Missing, null, or empty source URLs labeled as `"Direct post"`.
     - Safe external linking: `target="_blank"`, `rel="noreferrer noopener"`, `referrerPolicy="no-referrer"`, no injected HTML.

3. **Verbatim Expiry & Confirmed Policy Copy:**
   - Implemented `formatDealExpiryPolicy(expiresOn)` in `components/deals/MyPublishedDeals.tsx`:
     - Displays `expiresOn` verbatim when provided.
     - Displays simple confirmed 7-day-after-expiry policy copy: `"Expires on {expiresOn} (auto-deleted 7 calendar days after expiry in America/Vancouver)"`.
     - Missing or empty expiry: displays `"No expiration date (retained indefinitely)"`.
     - Zero duplicated date arithmetic in UI: authoritative date/retention logic is owned by Loom in `lib/dealRetention.ts`.

4. **Post Page Integration (`app/post/page.tsx`):**
   - Imported `MyPublishedDeals` and rendered it alongside `<CanonicalPost />` in `Page`.
   - Preserves canonical creation flow, URL source prefill (`/post?source=...`), preview mode (`?preview=1`), and legacy notices (`?edit=`, `?job=`).
   - Loading or error states in "Your published deals" never clear or block the creation form.

5. **Comprehensive Synthetic Regression Tests (`tests/import/myPublishedDeals.test.tsx`):**
   - 12/12 tests verifying:
     - Reel URLs (`/reel/`, `/reels/`, `m.instagram.com/reel/`) -> `"Instagram Reel"`.
     - Post URLs (`/p/`, `m.instagram.com/p/`) -> `"Instagram Post"`.
     - Generic Instagram URLs (`/explore/...`, `/someuser`) -> `"Instagram source"`.
     - Rejecting credentials, ports, non-HTTPS, `javascript:`, `data:` URLs without clickable hrefs.
     - External HTTPS URLs -> `"External link"`.
     - Missing source -> `"Direct post"`.
     - Verbatim `expiresOn` display and confirmed 7-day policy copy.
     - Missing expiry -> retained indefinitely copy.
     - Signed-out state: query skipped with `"skip"`, sign-in prompt rendered, link to `/reels` rendered.
     - Loading state and empty state rendering.
     - Populated deals list with all badges, links (`/deal/[id]`, `/deal/[id]/edit`), and asserting NO delete mutation UI exists.

## Checks Actually Run

- `npx vitest run tests/import/myPublishedDeals.test.tsx`: 12/12 passed in 14ms.
- `npx vitest run tests/import/`: 23 test files / 820 tests passed in 1.14s.
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
