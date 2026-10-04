# Native supplied context (N-SHARE-C)

Implements the native half of `native-supplied-context-contract.md` (v1). Backend/web is a separate ticket.

- **Extension** (`ShareViewController.swift`): records offered `registeredTypeIdentifiers`, loads public.url and public.text per provider (4 s per load, 10 s overall budget), plus `attributedContentText`. It never loads media. It does not stop at the first URL. Load failure or timeout sets `truncated=true`; the extension still shows Done. It resolves exactly one distinct supported Instagram link (`ShareStore.resolveLink`); different links, or a supported link mixed with another link in one fragment, are rejected. The status text (`ShareStore.summary`, derived from the final context incl. makeContext's truncated flag) lists the offered distinct type count and ALL stored bounded type identifiers (≤32; an omitted count is stated if more were offered), whether link/text loaded, and that no video was loaded. No captions or tokens are shown.
- **Store** (`ShareStore.swift`): `makeContext` builds the bounded context (8 fragments ≤4096 B, ≤12000 B combined, 32 types ≤200 B, JSON ≤24000 B, receipt clock in Unix seconds). `isValidContext` is the strict parser (String or Bool values masquerading as version/clock/flag are rejected). Present-but-invalid stored context becomes an empty `truncated=true` marker; absent context stays absent (old records). Records keep `.atomic` writes, complete-until-first-auth protection and the 24 h TTL; the record limit is 32000 B. Link and item records both carry `nativeContext`; item records also carry `sourceUrl` and a `routed` flag.
- **Direct submit** sends `nativeContext` additively in `reels:submit` args.
- **App** (`DinedealsApp.swift`): item records are routed once (marked `routed`) and kept until `received` or expiry. `requestShareContext` (trusted main-frame origin only) finds the stored context of the **oldest** pending record (routed item records included) for the exactly-normalized `sourceUrl`, and dispatches `dishdeals:shareContext` with `{sourceUrl, nativeContext}` via `callAsyncJavaScript` arguments (no JS string interpolation, no route/query/log). If none exists nothing is dispatched. `received` removes **only that same oldest matching record** (`ShareStore.oldestMatch`, shared with `first()` ordering: savedAt, then file name), so newer shares of the same link and unrelated records survive. Residual: a crash-window link+item pair from one share leaves the link copy, which the backend deduplicates on retry; the receipt carries no item id, so no explicit pair binding was added. Direct server item receipt already stores context; the local item record is retained until the web `received` ack or 24 h TTL.

## Status
Implementation ready; Foundation checks pass; extension/app typecheck against the iPhoneOS SDK passes. Full Xcode build is pending (not run). Real iPhone Instagram sample is pending.

## Real iPhone sample checklist
1. Install a signed build (human). Share a Reel from Instagram to Dinedeals.
2. Read the extension summary line: offered types, link/text loaded, no video.
3. Record the actual identifiers and whether `attributedContentText` and plain text appear.
4. Confirm the item opens, the web view requests context, and the record disappears after `received`.
5. Test airplane mode / signed-out: the link record keeps context for 24 h.
