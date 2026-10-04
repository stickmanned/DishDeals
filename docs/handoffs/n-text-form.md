# N-TEXT-FORM handoff

- **Status:** Complete / ready for review and local integration by Northstar.
- **Owner, branch, worktree, base SHA:**
  - Owner: Cinder (Antigravity Gemini 3.8 Flash High)
  - Branch: `t-07-caption-form`
  - Worktree: `/Users/william/Code/DishDeals-worktrees/caption-form`
  - Base SHA: `700c46801254010ac1433c7a4ae0f2313a3a52cd`
- **Scope and writable paths:**
  - `lib/postSource.ts`
  - `lib/imageDraftFlow.ts`
  - `components/deals/CanonicalPost.tsx`
  - `app/post/page.tsx`
  - `tests/import/imageDraftFlow.test.ts`
  - `tests/import/postSource.test.ts`
  - `docs/handoffs/n-text-form.md`

## Summary of Changes
1. **Provenance Parameter Normalization & Token-Parity Text Checking (`lib/postSource.ts`):**
   - Implemented `parsePostSourceParam`:
     - Accepts single query string parameters from `/post?source=...`.
     - Validates and canonicalizes strictly via `normalizeInstagramUrl` to `https://www.instagram.com/reel/<shortcode>/`.
     - Rejects duplicate parameters (arrays), non-string, empty, non-Instagram domains, credentials, ports, path tricks, and arbitrary surrounding prefix/suffix text or whitespace (`/\s/.test(trimmed)`) safely by returning `null`.
     - Never fetches URLs, inspects network, or populates private media/tokens.
   - Implemented `hasNonUrlText` matching Loom backend `6c3f605` (`convex/extract.ts` `hasSourceText`):
     - Tokenizes input by whitespace.
     - Strips quote, parenthesis, bracket, and trailing punctuation wrappers (`^[([{<"'“‘]+` and `[)\]}>"'”’,;.!?]+$`).
     - Requires at least one Unicode letter or digit (`/[\p{L}\p{N}]/u`).
     - Recognizes and filters out links: `scheme://`, known schemes (`mailto|tel|data|javascript:`), scheme-relative (`//`), `www.`, and bare domains (`(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}`).
     - Guards against triggering text analysis when only URLs (including bare domains, scheme-relative links, or parenthesized links) or punctuation-only content is entered.
     - Accurately identifies real deal copy like `Pho:C$10`, `拉面 $10`, or `2-for-1 pho on Tuesday https://...`.
2. **Pure Controller Text Analysis (`lib/imageDraftFlow.ts`):**
   - Enabled `analyze()` for text-only sources when actual non-URL caption/text is entered without an attached file:
     - No prepare (`prepareImage`/`prepareFrames`), no upload token (`getToken`), no upload URL (`generateUploadUrl`), and no storage upload (`upload`) calls.
     - No demo cache lookup or replay (`loadDemo`/`demoPromptVersion` bypassed for text).
     - Directly transitions phase to `"extracting"`.
     - Passes `imageIds: []` to `extract`, along with trimmed `caption`, `text`, `provenanceUrl`, and `publishedAt`.
     - Creates `Offer` with `source: "text"`, `imageId: null`, `imageIds: []`, `imageName: "Pasted text"`, and `cached: undefined`.
     - Reuses canonical `extractOutcomeToDrafts` with `imageId: null`.
     - Blocks calls if no file is present and text is empty, whitespace-only, punctuation-only, or URL-only (`phase: "failed"`, `code: "NO_SOURCE"`).
     - Supports `cancel()`, retry, context-switching (e.g. adding a file supersedes run), and out-of-order/stale resolution prevention.
3. **Canonical Post View & Route Integration (`components/deals/CanonicalPost.tsx`, `app/post/page.tsx`):**
   - In `app/post/page.tsx`:
     - Extracts `searchParams.source`, safely parses via `parsePostSourceParam`, and passes `initialSourceUrl` to `<CanonicalPost />`.
   - In `components/deals/CanonicalPost.tsx`:
     - Accepts optional `initialSourceUrl` and initializes `flow.setContext({ provenanceUrl: initialSourceUrl })` once on mount inside `useState` so that subsequent re-renders and retries never overwrite manual edits.
     - Updates `hasWork` to include non-empty non-URL text and `provenanceUrl`.
     - Updates `SourcePanel` `hasSource` calculation to consider `hasNonUrlText(caption, text)` so that "Get suggestions" is enabled for text-only input.
     - Adjusts copy to clarify suggestions can come from an image or entered post text.
4. **Comprehensive Synthetic Regression Tests:**
   - `tests/import/postSource.test.ts` (14/14 tests):
     - Verified URL normalization, duplicate array rejection, non-Instagram rejection, credential/port/path trick rejection, and surrounding text rejection.
     - Verified `hasNonUrlText` with empty, whitespace, URL-only across bare domains, scheme-relative links, quoted/parenthesized links, punctuation-only, and valid multilingual text.
     - Verified provenance prefill initialization and manual edit persistence.
   - `tests/import/imageDraftFlow.test.ts` (87/87 tests):
     - Verified blocking of empty/whitespace/URL-only (including bare-domain and scheme-relative) analysis with zero backend calls.
     - Verified text-only extraction with `imageIds: []` and zero prepare/upload/token/cache calls.
     - Verified cancel, late results, context switches, and retry semantics.

## Checks Actually Run
- `npx vitest run tests/import/postSource.test.ts`: 14/14 passed in 64ms.
- `npx vitest run tests/import/imageDraftFlow.test.ts`: 87/87 passed in 43ms.
- `npx vitest run tests/import/`: 21 test files / 799 tests passed in 1.31s.
- `npm run typecheck` (`tsc --noEmit`): clean (exit code 0).
- `npm run lint` (`eslint .`): clean (exit code 0).

## Environment & Build Distinctions
- All checks were run against local current code on branch `t-07-caption-form`.
- Port 3000 dev server is running PID 7249 from root repository `/Users/william/Code/DishDeals` prior to this ticket's branch integration. The booted iPhone 18 Pro simulator currently displays the older build; simulator verification of these text-only affordances will reflect local changes once Northstar performs reviewed local integration.

## Boundaries & Blockers
- No backend schema, Convex mutation/query, package, or native iOS code modified.
- No network requests, provider calls, account sign-in, or deployment performed.
- Stopping now after one ticket as required.
