# Auth return path (T-03D)

Defect (confirmed): `/signin` ignored `?next=` and always went to `/profile`; `/profile` had no continuation. Existing links already pass `next` (`/signin?next=/post`, `/signin?next=/deal/<id>[/edit]`).

## Resolver (`lib/authReturn.ts`, single production gate)
`parseReturn` accepts only: `/post`, `/reels`, `/reels?item=<id>`, `/deal/<id>`, `/deal/<id>/edit` (id = `[A-Za-z0-9]{1,128}`, the app's existing id shape), max 256 chars. Everything else is null: schemes, `//`, backslashes, `@`/`:`, any `%` (encoded traversal, double encoding), control chars/space, fragments, other queries (e.g. `/post?preview=1`, legacy `?edit=`/`?job=`), `/reels?shared=…` (private shared link text is never carried in a return URL), tokens, trailing slash, case variants. `returnFromParams` rejects more than one `next`. `signInHref`/`profileHref` re-validate and `encodeURIComponent` the target; null gives the plain `/signin` / `/profile`. `profileFlow(next, profileExists)` = `none | form | continue`.

## Flow
- `/signin` (client, `useSearchParams` inside `<Suspense>` per the installed Next guide): after a successful `signIn` it pushes `profileHref(next)` (plain `/profile` when no valid next, as before). Existing busy/disabled guard retained; no values are reset.
- `/profile` (same Suspense pattern):
  - Signed out: the sign-in link keeps the validated `next`.
  - Signed in, actual `users.me` has a display name, valid `next`: shows "Profile ready. Continuing…" with a **Continue** link and `router.replace(next)` once (ref-guarded, so no loop or double navigation).
  - Signed in without a profile: the normal form. Navigation happens only after a successful save: the reactive `users.me` then reports the profile and the same single-fire continue runs. A failed save keeps the edits and shows the error; Save is disabled while submitting (no duplicate submit).
  - No valid `next`: unchanged ordinary profile behavior.
- Untrusted text is never passed to `router.push`/`replace`; only a string that matched the whitelist is.

## Checks (synthetic, labelled)
`tests/auth/authReturn.test.ts`: 57 checks against the production resolver and builders (accepted routes, ~40 rejected classes, multiple `next`, decode-once traversal, builder↔parser round trip, profile flow). `tsc --noEmit` and eslint on the changed files clean. Not run: `next build`/prerender of the two pages, live auth, phone signin/reload, private source persistence across sign-in (pending).
