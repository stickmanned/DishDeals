# Native supplied-context ingestion (backend + web half, N-SOURCE-D)

Implements the backend/web half of `native-supplied-context-contract.md` (v1). The native half (extension, store, bridge) is a separate ticket (N-SHARE-C). Everything here is verified only with local, in-memory, synthetic fixtures.

## Data and bounds
- `reelItems.nativeContext` (optional, only this table): `{ version: 1, textFragments, registeredTypes, receivedAt, truncated }`. `receivedAt` is the device receipt clock in Unix seconds, never a publication date.
- Convex validators (`nativeContextValidator` in `convex/schema.ts`) check shape; `parseNativeContext` (`lib/reels/nativeContext.ts`) enforces the bounds: at most 8 distinct non-empty fragments, each ≤ 4096 UTF-8 bytes, ≤ 12000 combined; at most 32 distinct types, each ≤ 200 bytes; finite non-negative clock not more than one hour ahead of the server (catches milliseconds-for-seconds); whole JSON ≤ 24000 bytes; no lone surrogates; no extra keys. Rejection throws one safe message (`NATIVE_CONTEXT_REJECTED`) that never echoes content, and a rejected submit saves nothing and does not charge the rate limit.
- Private: only the owner's `reels.get`/`list` return it. The general workflow `workItem` query omits it so it is not copied into the workflow journal; only the extraction action reads it (`workSource`). It is deleted with the item at expiry/removal and is never copied into `deals` or any public field.

## Immutable first receipt, atomic with the receipt
- `reels.submit` takes an optional `nativeContext` and stores it in the same insert as the item. A duplicate same-user, same-URL submit returns the existing item and changes nothing (no new context, no overwrite of context or manual caption, even when the context-less first save is duplicated later). Another user's identical URL gets its own context-less item. An expired item is replaced by the new save and its new context.
- Web (`lib/nativeSession.ts`, `components/reels/ReelIntake.tsx`): a recovered link posts `{type:'requestShareContext', sourceUrl}`; the listener for `dishdeals:shareContext` is registered first. Only an event whose `sourceUrl` equals the current normalized link and whose `nativeContext` passes the same strict parser is accepted. The context stays in component memory (never route, query, storage or log) until the user's explicit save, which sends it in the same `submit` call; the `received` receipt is posted only after the server confirms (`saveReelLink`). Pending answer: save waits. Unusable answer for this link: save is blocked, the link is not saved as if context were complete. Timeout or no native bridge (old context-less records): the link alone is saved as before. A context for a different link is never attached.
- `saveReelLink(input, days, submit, post?, nativeContext?)` is additive; old calls are unchanged and carry no `nativeContext` key.

## Model request and evidence
- The recording, the editable caption and the supplied text are three separate parts. The supplied text is its own labeled `nativeSuppliedSource` part (`complete` flag + fragments); it is not merged into, flattened to, or allowed to overwrite the ≤ 2200-character caption. Offered type identifiers and `receivedAt` are never sent: types are not source content, and the clock must not anchor relative dates. Context-less requests are unchanged (video + one text part).
- Caption-channel evidence (including constraint evidence) must be an exact substring of the editable caption or of ONE supplied fragment. Quotes joined across fragments, or across a fragment and the caption, are rejected. Audio/visual rules and no-score rules are unchanged.

## Truncated source
`truncated: true` is shown to the owner. Automatic extraction is ALWAYS blocked for it, before any configuration read, download or model call, with `error.code = NATIVE_CONTEXT_TRUNCATED` and copy telling the user to delete the save and share the Reel again with its complete text, or fill in the draft by hand. No caption lifts the block: the optional caption box asserts nothing about completeness. An explicit complete-context confirmation would need its own owned server-side state (reset on caption edit) and is a separate, precisely scoped ticket. The manual draft flow (`saveDraft`) stays open. Complete context, and old context-less items, are never blocked. The recording is kept for retry as for any failure.

## Duplicate saves
A duplicate same-user, same-URL submit keeps the first save untouched and stores nothing from the new request. The server reports `duplicate: true`; the web screen then says the earlier save was kept and the newly received text was not stored with it, instead of opening it as a fresh full-context save. The `received` receipt still carries only the source URL (it makes no claim about context), so native may clear its copy.

## Retired resolver
`reelActions.retrieve` no longer imports or calls the provider: it always fails the item with `UNAVAILABLE` and no network, regardless of `REEL_PROVIDER_USAGE_AUTHORIZED`/`SCRAPECREATORS_API_KEY`. The workflow is unchanged; for a non-supplied item it reaches this stub. The legacy extractor still reads the old resolver gate only for a pre-existing non-supplied row, which can no longer be created.

## Not claimed
No live VLM, deployed Convex, WKWebView, Swift bridge, Instagram or phone evidence. Real iPhone provider identifiers and which of attributed text/plain text actually appear remain pending a real sample.
