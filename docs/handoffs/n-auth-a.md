# N-AUTH-A handoff: canonical native session and receipt integration

Branch `t-03-native-session-bridge`, base `2011bf9`. Local only: nothing pushed, no PR, no cloud, codegen, provider or token/env access. Functional controls only; no Swift, backend, schema, package, map or polish changes.

## States (kept separate)
- **Implementation:** ready (local); the Shell identity mismatch below is open and out of scope.
- **Local checks:** pass (synthetic).
- **Native checks (Swift bridge, Keychain, WKWebView):** untested. **Real iPhone:** pending. No dependency on an Xcode runtime.

## What changed (owned paths only)
- `lib/nativeSession.ts` (new): SSR-safe browser helper for the existing `dishdeals` Swift message handler. `postNativeMessage` returns only `"sent"` or `"not_sent"`; it validates payloads (non-empty token or `null`; `received` only for the exact normalized Instagram URL; `result` item id pattern), never logs, swallows handler errors. `sent` is not a Keychain acknowledgement because Swift returns nothing. Also `sessionMessageFor` (what the bridge should say), `recoveredLink` (normalize or reject a `?shared=` value) and `saveReelLink` (normalize, submit, report the receipt only after the server returns an `itemId`).
- `components/CanonicalSessionBridge.tsx` (new): renders nothing; effect sends `{type:"session", token|null}` from the root auth state. It stays silent while auth is loading or the token is not ready, so a launch never sends `null` and wipes the shared Keychain token, and it sends `null` once auth has resolved to signed out.
- `components/ConvexClientProvider.tsx`: mounts `<CanonicalSessionBridge />` inside `AuthProvider`, so it runs on every route including `/reels`, sign-out included.
- `components/reels/ReelIntake.tsx`: removed the private `ConvexReactClient` and `ConvexAuthProvider`; it now uses the root canonical session. The unconfigured check runs before any Convex hook. Removed its own token effect (the root bridge owns it) and the sign-out `null` message (the root token effect handles it).
  - **Recovered links no longer auto-submit.** A `?shared=` value is normalized and only prefilled. The signed-in user sees an explanation (the link was saved on the iPhone, is not tied to an account, and will not be sent automatically) and must press "Save this link to my account" (or "Not now, clear this link"). An unsupported value is not filled and shows an error. Hence no silent cross-account assignment, without needing a stored owner marker.
  - **Receipt cleanup.** `{type:"received", sourceUrl}` is sent only after the server returns an item id, after both manual and recovered saves, and never on error or for an unverified result. "Not now" sends nothing, so the native recovery copy expires on its own after 24 hours.
  - Error and retry handling and the source values are unchanged; no source content is logged.
- `tests/native/sessionBridge.test.ts` (new, 37 tests). `docs/handoffs/n-auth-a.md`.

## Checks run in `/Users/william/Code/DishDeals-worktrees/native-session-bridge`
- `npm ci --prefer-offline --no-audit --no-fund` (node_modules was absent; no package change).
- `npx tsc --noEmit`, `npx eslint .`: clean.
- `npx vitest run tests/native`: 51 passed after the review corrections (37 in the first commit). Covers: no window or handler, handler throwing (no console output), exact message payloads, refusal of empty/non-string tokens and unnormalized or foreign receipt URLs, the session decision table (loading, signed in, token not ready, signed out), link normalization and rejection, receipt-after-verified-save (one receipt, duplicate counts, no receipt on error or unverified result, no server call for invalid links), plus source guards (no private client or provider, no auto-submit, config guard before hooks, bridge mounted inside `AuthProvider`, bridge never logs). Four mutations (drop the loading guard, drop sign-out clear, report receipt before verification, reintroduce a private client) each failed a test.
- `npm run check` (first commit; not re-run for the corrective commit, which changed only `lib/nativeSession.ts`, its test and this handoff): exit 0 (20 test files, 469 vitest tests, 23 workflow tests, `next build`; `/reels`, `/signin`, `/profile` build).
- `node /tmp/dishdeals-owner-check.mjs N-AUTH-A`: see the commit reply.
- All doubles are synthetic (fake `window.webkit` handler, fake submit). This is not live Convex Auth, the Swift bridge, Keychain, WKWebView, Instagram, a provider or the phone. No browser check was run.

## Corrected note on `/signin` and `/profile` (earlier "named gap" was wrong)
The actual routes `app/signin/page.tsx` and `app/profile/page.tsx` (Northstar's merge) are the real canonical pages: they use `useAuthActions`, `users.me` and `users.upsertProfile` with the root canonical session. So the root `CanonicalSessionBridge` covers sign-in at `/signin`, `/profile` and `/reels` alike. Harry's `components/frontend/SignIn.tsx` and `Profile.tsx` exist but no route mounts them, so my earlier statement that `/signin` reports "isn't available in this version yet" was wrong, and I made no change to those routes.

Still open (not changed, outside my paths): the frontend `Shell` / `FrontendProvider` derive their own identity from the standalone preview state (`app.authenticated`, `app.profile.displayName`), not from the canonical session. The nav avatar and the Profile or Sign in link target in `Shell.tsx` can therefore disagree with the real canonical sign-in state. The standalone workflow provider stays a separate preview/unconfigured path and is never fed canonical IDs or identity. Fixing the Shell identity mismatch is a separate frontend/adapter ticket.

## Review corrections applied (same scope)
- `saveReelLink` now requires the returned `itemId` to match `^[A-Za-z0-9]{1,128}$` (exported as `ITEM_ID_PATTERN`, the shape the Swift app and `/reels` routing accept) before any receipt is reported. Whitespace, hyphens, slashes, newlines, empty or over-long ids are rejected as unverified and are never trimmed or repaired, so recovery copies are not cleaned on a malformed id.
- The `result` message validator now also rejects any `status` other than `ready`, `no_deal` or `failed` at runtime, plus non-string ids and ids outside the pattern.
- New regressions cover whitespace, hyphen, slash, newline, 129-character ids and the 1/128-character boundaries, and unknown, in-progress, missing and non-string result statuses.

## Unchanged and pending
Backend ownership checks (`reels.*`) unchanged. Swift `WebShell` trusted-origin checks untouched. Still pending: Swift bridge and Keychain behavior on device, token expiry/refresh for the extension, the real Instagram payload, provider receipts, and the map/publish acceptance.
