# Native supplied context (N-SHARE-C)

Implements the native half of `native-supplied-context-contract.md` (v1). Backend/web is a separate ticket.

- **Extension** (`ShareViewController.swift`): records offered `registeredTypeIdentifiers`, loads public.url and public.text per provider (4 s per load, 10 s overall budget), plus `attributedContentText`. It never loads media. It does not stop at the first URL. Load failure or timeout sets `truncated=true`; the extension still shows Done. It resolves exactly one distinct supported Instagram link (`ShareStore.resolveLink`); different links, or a supported link mixed with another link in one fragment, are rejected. The status text lists offered type count/first types and whether link/text loaded, and always says no video was loaded.
- **Store** (`ShareStore.swift`): `makeContext` builds the bounded context (8 fragments ≤4096 B, ≤12000 B combined, 32 types ≤200 B, JSON ≤24000 B, receipt clock in Unix seconds). `isValidContext` is the strict parser. Present-but-invalid stored context becomes an empty `truncated=true` marker; absent context stays absent (old records). Records keep `.atomic` writes, complete-until-first-auth protection and the 24 h TTL; the record limit is 32000 B. Link and item records both carry `nativeContext`; item records also carry `sourceUrl` and a `routed` flag.
- **Direct submit** sends `nativeContext` additively in `reels:submit` args.
- **App** (`DinedealsApp.swift`): item records are routed once (marked `routed`) and kept until `received` or expiry. `requestShareContext` (trusted main-frame origin only) finds the newest stored context for the exactly-normalized `sourceUrl`, and dispatches `dishdeals:shareContext` with `{sourceUrl, nativeContext}` via `callAsyncJavaScript` arguments (no JS string interpolation, no route/query/log). If none exists nothing is dispatched. `received` discards link and item records for that source.

## Status
Implementation ready; Foundation checks pass; extension/app typecheck against the iPhoneOS SDK passes. Full Xcode build is pending (not run). Real iPhone Instagram sample is pending.

## Real iPhone sample checklist
1. Install a signed build (human). Share a Reel from Instagram to Dinedeals.
2. Read the extension summary line: offered types, link/text loaded, no video.
3. Record the actual identifiers and whether `attributedContentText` and plain text appear.
4. Confirm the item opens, the web view requests context, and the record disappears after `received`.
5. Test airplane mode / signed-out: the link record keeps context for 24 h.
