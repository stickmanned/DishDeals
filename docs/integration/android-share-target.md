# Android PWA screenshot share target (T-13B, original secondary path)

Sharing one screenshot/flyer from Android's share sheet to the installed DishDeals PWA stages it privately on the phone and opens `/post`, where the user explicitly chooses to use it in the SAME canonical `CanonicalPost` / `ImageDraftFlow`. The primary native iOS path is independent and unchanged. **Nothing here ran on a real Android phone, installed PWA, share sheet, or deployed host.**

## Flow
1. `public/manifest.webmanifest` (linked by `metadata.manifest` in `app/layout.tsx`) declares `share_target`: `POST /share-target`, `multipart/form-data`, files `image` (JPEG/PNG/WebP) plus `title`, `text`, `url`.
2. `public/sw.js` (registered by `PwaShareRegistration` via `registerShareWorker`) handles **only** a same-origin `POST /share-target` navigation. Every other request gets no `respondWith`, so it goes to the network untouched. No Cache API, no `fetch`, no logging, no cross-origin anything: no auth/API/backend/private response is ever cached and nothing is "published offline".
3. The worker reads the body through a byte counter (refuses > ~5.25 MB, 25 s deadline), parses it, requires exactly one file named `image`, JPEG/PNG/WebP with a matching file signature and <= 5 MiB, bounded optional title (300) / text (5000) / url (2048, http(s), no credentials), then stores one record in IndexedDB `dishdeals-share-inbox` v1, store `shares` (key `id`): TTL 24 h, max 8 live items (expired rows pruned in the same transaction; a 9th is refused as `inbox_full`).
4. It answers **303** `/post?share=<32 hex random id>`; failures answer `/post?share_error=<code>` (`no_image`, `multiple`, `unsupported`, `too_large`, `malformed`, `storage`, `timeout`, `inbox_full`). No file bytes, text, link or token is ever in a URL; the original file name is not stored. Multiple files, unsupported types, malformed bodies, oversize, storage failures and timeouts are explicit errors, never a silent pick or a fake receipt.
5. `AndroidShareImport` (mounted in `CanonicalPost`, also on the sign-in gate) strictly parses the query (`share` or `share_error` alone, nothing else), privately re-validates the stored record from scratch (`lib/androidShareInbox.ts` `readShare`), shows what is waiting, and keeps it until the user acts. "Use this shared image" needs a signed-in account **with a profile**; until then it shows sign-in/profile links and keeps the share (the opaque id is kept in `sessionStorage` so a sign-in detour does not lose it).
6. On consent `adoptShare` calls the controller's `selectFile`/`setContext`: image, caption (title), text, and the shared link as **provenance only** (never opened or fetched). The user's own input wins: nothing is adopted while a run is in flight or an image/recording is already chosen, context fields fill only when empty, forms are never touched, and nothing is uploaded, analyzed, submitted or published automatically. Only after the controller really holds the file is that one record deleted ("ready", not "published"). "Discard" deletes exactly that one record; `inbox_full` offers "clear stored shared images".

## Single/queued shares
One share is handled per `/post?share=<id>` visit. Older stored shares stay until their TTL, are only reachable by their id, and can be bulk-cleared from the `inbox_full` notice. Video/screen-recording shares are not accepted by the target (5 MiB image bound): use the recording picker on `/post` (T-14B).

## Honest limits
- `Response.formData()` buffers the (bounded) body in memory; true streaming multipart parsing is not available in a service worker.
- `public/sw.js` is plain JS and cannot import `lib/`; its constants are duplicated from `lib/androidShareInbox.ts`. The reader re-validates everything, and tests run the real worker and the real reader against one store.
- A first share needs an installed/active worker. With no worker (browser tab, WKWebView, failed registration) the POST just reaches the app and shows no share; registration failure never blanks the app.
- Icons `public/share-icon-{192,512}.png` were rasterised from the existing `public/icon.svg` with macOS `sips` (no generated art).

## Next.js guides read (AGENTS.md rule), `node_modules/next/dist/docs/01-app/`
`02-guides/progressive-web-apps.md`, `03-api-reference/04-functions/generate-metadata.md` (`manifest` field), `03-api-reference/03-file-conventions/layout.md`, `03-api-reference/01-directives/use-client.md`, `02-guides/lazy-loading.md`. Findings:
- The guide builds the manifest as `app/manifest.ts|json`; the packet's `public/manifest.webmanifest` plus `metadata.manifest` is the same `<link rel="manifest">` outcome and is documented as supported.
- Register with `scope: "/"` and `updateViaCache: "none"`: done.
- The guide recommends `next.config` headers for `/sw.js` (`Content-Type: application/javascript`, `Cache-Control: no-cache, no-store, must-revalidate`, a strict CSP) and `nosniff`. **Not done**: there is no `next.config`, and it is outside this ticket's writable paths. Recommendation for Northstar/hosting owner; browsers also bypass the HTTP cache for the worker script after 24 h at most.
- Client code: `'use client'` is the first line of `PwaShareRegistration.tsx` and `AndroidShareImport.tsx`; both are rendered from a client component or the layout with no non-serializable props from a Server Component; browser APIs (`navigator`, `indexedDB`, `window`, `sessionStorage`) are touched only in effects/handlers. The root layout change is additive (one import, one `metadata.manifest`, one mount); providers, fonts, styles and the shell are unchanged.

## Pending human/real-device checks (not claimed)
Real installed Android PWA, Chrome share-target registration and sheet entry, real screenshot share end to end, signed-in consent on a phone, storage quota behavior, `next build`/browser render of the panel, hosting headers/HTTPS origin (Loom/Northstar lane).
