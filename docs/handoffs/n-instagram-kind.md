# N-INSTAGRAM-KIND Handoff — Source Kind Classification and Parity

- **Status:** review
- **Owner, Branch, Worktree, Base SHA:**
  - **Owner:** Mica (Antigravity Gemini 3.8 Flash High)
  - **Branch:** `t-13-instagram-source-kind`
  - **Worktree:** `/Users/william/Code/DishDeals-worktrees/instagram-source-kind`
  - **Pinned Base SHA:** `dcdda819e97de9c371726dd7ba33585912afe7d5`
  - **Head SHA:** `fbedd0c9c8479014dbfa99693f49231ee32c9b9d`
- **Scope and Writable Paths:**
  - `lib/reels/contract.ts`
  - `ios/Shared/ShareStore.swift`
  - `ios/ShareExtension/ShareViewController.swift` *(Northstar amendment approved)*
  - `components/reels/ReelIntake.tsx`
  - `tests/native/ShareStoreChecks.swift`
  - `tests/import/postSource.test.ts`
  - `tests/import/reelPublicEntry.test.tsx`
  - `lib/reels/contract.test.ts`
  - `docs/handoffs/n-instagram-kind.md`

- **Problem & Architectural Contract:**
  - Previously, `normalizeInstagramUrl` in TypeScript and `ShareStore.canonical` in Swift collapsed both `/p/` and `/reel/` URLs into `/reel/`, and UI always labelled all items as "Reel".
  - Architectural contract change:
    - Instagram Post URLs (`/p/SHORTCODE/`) strictly preserve canonical format: `https://www.instagram.com/p/SHORTCODE/`.
    - Instagram Reel URLs (`/reel/SHORTCODE/`) and alias (`/reels/SHORTCODE/`) normalize to canonical format: `https://www.instagram.com/reel/SHORTCODE/`.
    - Host, credentials, port, and multi-link safety checks remain strict and identical between Swift and TypeScript.
    - Query parameters, tracking codes, and trailing parameters are stripped cleanly.
    - Source kind is derived purely from URL structure via `instagramSourceKind` (TypeScript) and `ShareStore.sourceKind` (Swift).
    - Strictly validates HTTPS protocol, allowed hostnames (`instagram.com`, `www.instagram.com`, `m.instagram.com`), no credentials, no custom port, anchored path regex, and no substring fallback (returns `"unknown"` on invalid input).
    - Zero schema changes, no new DB fields, no provider fetch, no Instagram scraping.
    - Deduplication policy is canonical per `pathname + shortcode`: same shortcode under `/p/` vs `/reel/` can save independently; conflicting kinds in `ShareStore.resolveLink` are rejected as ambiguous.
    - Historical stored `/reel/` URLs irreversibly lost `/p/` original; no DB migration or guessed classification.

- **Changes Summary:**
  1. `lib/reels/contract.ts`:
     - Added `InstagramSourceKind = "post" | "reel" | "unknown"` and `instagramSourceKind(url)`.
     - Preserves `/p/` canonical format in `normalizeInstagramUrl`.
  2. `ios/Shared/ShareStore.swift`:
     - Added `ShareStore.sourceKind(_ urlString: String?) -> String` returning `"post"`, `"reel"`, or `"unknown"` with strict host/port/auth/path validation and no substring fallback.
     - Preserves `/p/` canonical format in `ShareStore.canonical`.
  3. `ios/ShareExtension/ShareViewController.swift`:
     - Updated initial copy to generic `"Received. Saving your Instagram link privately…"`.
     - Updated error and resolved status receipt to distinguish `"post"` vs `"Reel"` (or `"post or Reel"`).
     - Directs user to review and publish publicly (`"Open Dinedeals to review your \(itemLabel) and publish publicly"`), never claiming automatic public publication.
     - Preserved integrated contrast fix and all payload/storage/lifecycle logic.
  4. `components/reels/ReelIntake.tsx`:
     - Imported `instagramSourceKind`.
     - Derived source kind dynamically to update heading, form label, original link (`Original Post` vs `Original Reel` vs `Original Post or Reel`), error messages, and save history badges.
     - Safe fallback `"post or Reel"` / `"Posts/Reels"` for unclassified or historical rows.
  5. `tests/native/ShareStoreChecks.swift`:
     - Added assertions verifying `/p/` canonical preservation, `/reels/` normalization, ambiguity rejection when `/p/` and `/reel/` are mixed, and `sourceKind` validation including credentials, custom port, HTTP, and substring attack rejection.
  6. `tests/native/ShareReceiptContrastChecks.swift`:
     - Verified contrast compliance (Light Mode 19.69:1, Dark Mode 21.00:1) with updated `ShareViewController`.
  7. `tests/import/postSource.test.ts`:
     - Updated tests to expect `/p/` preservation across URL parsing and provenance flow snapshots.
  8. `tests/import/reelPublicEntry.test.tsx`:
     - Added test verifying distinct copy and links for Instagram Post vs Reel vs unknown sources in `ReelIntake`.
  9. `lib/reels/contract.test.ts`:
     - Added tests for `/p/` preservation, `/reels/` normalization, and `instagramSourceKind` validation edge cases.

- **Checks Actually Run & Results:**
  1. `lib/reels/contract.test.ts`: 9 tests passed.
  2. `tests/import/postSource.test.ts`: 14 tests passed.
  3. `tests/import/reelPublicEntry.test.tsx`: 10 tests passed.
  4. Full Vitest run (3 suites, 33 tests): **All 33 passed** (381ms).
  5. Native Foundation suite (`ShareStoreChecks.swift`): **81 passed**.
  6. Native Simulator suite (`ShareReceiptContrastChecks.swift` on iPhone 18 Pro `22E6EF8B-CC88-4109-870C-6C924AF613D6`):
     - Light Mode: `bg=#FBF7F2 text=#000000 ratio=19.69:1` (>= 4.5:1)
     - Dark Mode: `bg=#000000 text=#FFFFFF ratio=21.00:1` (>= 4.5:1)
     - **ALL CONTRAST ASSERTIONS PASSED**.
  7. `npm run typecheck`: **Exit code 0**.
  8. `npm run lint`: **Exit code 0** (0 problems, 0 errors, 0 warnings).

- **Stop Condition:**
  - One bounded ticket complete.
  - Scoped local commit on `t-13-instagram-source-kind`.
  - No remote push, no PR publication, no deployment, no schema changes.
