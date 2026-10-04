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

1. **"Your published deals" Read-Only Section & Error Boundary (`components/deals/MyPublishedDeals.tsx`):**
   - Added read-only `MyPublishedDeals` client component displaying the signed-in user's published deals.
   - **Unconfigured backend guard:** Checked `!process.env.NEXT_PUBLIC_CONVEX_URL` before invoking any Convex hooks, rendering an honest unconfigured notice when disconnected.
   - **Nested React Error Boundary (`PublishedDealsErrorBoundary`):** Wraps strictly around the live authored list (`LivePublishedDealsList`), displaying a generic error message ("Couldn’t load your published deals. Please check your connection and try again.") and a "Retry" button.
   - **Sibling isolation:** Because the error boundary is isolated around the live list, a `useQuery` throw or connection failure NEVER crashes the `/post` page and NEVER resets the sibling `<CanonicalPost />` or loses the user's creation form draft.
   - **Remounting retry:** Clicking "Retry" resets boundary state and increments the key on `PublishedDealsErrorBoundary`, freshly remounting the query.
   - Consumes Loom's pending backend contract `deals.listMine({ limit: 50 }) => Doc<"deals">[] & { imageUrl: string | null }` via typed `makeFunctionReference<"query">("deals:listMine")`.
   - **Signed-in gate:** When user is signed out (`!isAuthenticated`), the query is skipped with `"skip"`, and a clear signin prompt is rendered (`/signin?next=/post`). Loading states are displayed with `role="status"`.
   - **Clear private vs public separation:** Displays a prominent callout with a link to `/reels` ("Saved Instagram posts/Reels"), explaining that private Reel saves are stored privately in your account and are separate from public deals until published.
   - **Published deal cards:** Displays each deal with:
     - Restaurant name (`deal.restaurant`).
     - "Public deal" badge indicating it is public on the community map and detail page.
     - Deal text (`deal.dealText`).
     - Price in CAD (`deal.priceCad` formatted as `$X.XX CAD`, or "Price varies").
     - Photo thumbnail if `deal.imageUrl` is provided, with safe alt text.
     - Navigation links:
       - Detail view: `/deal/${deal._id}` ("View deal")
       - Edit view: `/deal/${deal._id}/edit` ("Edit deal"), handed off to the existing author editor.
     - **No delete mutation or duplicated editor:** Deletion is owned solely by the existing canonical detail page (`/deal/[id]`); this component does not add a delete mutation UI.

2. **Strict Anchored URL Source Classification (Posts vs Reels):**
   - Implemented `classifyDealSource(sourceUrl)` in `components/deals/MyPublishedDeals.tsx`:
     - Strictly requires credential-free HTTPS (rejects credentials, ports, non-HTTPS schemes like `http:`, `javascript:`, `data:` so invalid URLs never become clickable hrefs).
     - Exact host matching: `instagram.com`, `www.instagram.com`, and `m.instagram.com`.
     - Exact anchored pathname matching with no path suffix:
       - Reels: `^\/(?:reel|reels)\/([A-Za-z0-9_-]{5,64})\/?$` labeled as `"Instagram Reel"`.
       - Posts: `^\/p\/([A-Za-z0-9_-]{5,64})\/?$` labeled as `"Instagram Post"`.
     - URLs with extra path suffixes (e.g. `/comments`), out-of-bound shortcodes, or generic Instagram paths fall back safely to `"Instagram source"`.
     - Optional safe external HTTPS links labeled as `"External link"`.
     - Missing, null, or empty source URLs labeled as `"Direct post"`.
     - Safe external linking: `target="_blank"`, `rel="noreferrer noopener"`, `referrerPolicy="no-referrer"`, no injected HTML.

3. **Verbatim Expiry & Confirmed Policy Copy:**
   - Implemented `formatDealExpiryPolicy(expiresOn)` in `components/deals/MyPublishedDeals.tsx`:
     - Displays `expiresOn` verbatim when provided.
     - Displays simple confirmed 7-day-after-expiry policy copy: `"Expires on {expiresOn} (auto-deleted 7 calendar days after expiry in America/Vancouver)"`.
     - Missing or empty expiry: displays `"No expiration date (retained indefinitely)"`.
     - Zero duplicated date arithmetic in UI: authoritative date/retention logic is owned by Loom in `lib/dealRetention.ts`.
     - Copy explicitly references the community map and detail page, not live feed (known broken).

4. **Post Page Integration & Jump Link Navigation (`app/post/page.tsx`):**
   - Added a visible "Your posts" jump link (`<a href="#your-posts" className="button secondary">Your posts</a>`) near the top of the canonical `/post` page.
   - Added `id="your-posts"` to the root `<section>` of `MyPublishedDeals`, allowing immediate navigation to published posts without scrolling past the creation form.
   - Preserves canonical creation flow, URL source prefill (`/post?source=...`), preview mode (`?preview=1`), and legacy notices (`?edit=`, `?job=`).
   - Loading or error states in "Your published deals" never clear or block the creation form.

5. **Comprehensive Synthetic Regression Tests (`tests/import/myPublishedDeals.test.tsx`):**
   - 16/16 tests verifying:
     - Exact anchored regex for Reels (`/reel/`, `/reels/`, `m.instagram.com/reel/`) with 5-64 char shortcode.
     - Exact anchored regex for Posts (`/p/`, `m.instagram.com/p/`) with 5-64 char shortcode.
     - Path suffix rejection (e.g. `/reel/C9_deal123/comments` -> falls back to `"Instagram source"`).
     - Out-of-bound shortcodes (< 5 chars -> `"Instagram source"`).
     - Safe rejection of credentials, ports, non-HTTPS, `javascript:`, `data:` URLs without clickable hrefs.
     - External HTTPS URLs -> `"External link"`.
     - Missing source -> `"Direct post"`.
     - Verbatim `expiresOn` display and confirmed 7-day policy copy.
     - Missing expiry -> retained indefinitely copy.
     - Unconfigured backend guard before any Convex hook.
     - Error boundary state transition, generic error alert, Retry button triggering `onRetry` callback.
     - Signed-out state: query skipped with `"skip"`, sign-in prompt rendered, link to `/reels` rendered.
     - Loading state and empty state rendering with community map/detail copy.
     - Populated deals list with badges, links (`/deal/[id]`, `/deal/[id]/edit`), and asserting NO delete mutation UI exists.

## Checks Actually Run

- `npx vitest run tests/import/myPublishedDeals.test.tsx`: 16/16 passed in 12ms.
- `npx vitest run tests/import/`: 23 test files / 824 tests passed in 1.14s.
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
