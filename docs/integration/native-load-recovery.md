# Native web load recovery (N-LOAD-A)

Fixes the observed blank white native screen (placeholder `WebsiteURL`, loading or failed WKWebView with no UI). Single shipping file: `ios/App/DinedealsApp.swift`; no new source files, no project/signing/XcodeGen change.

- **One stable WKWebView** owned by `WebLoader` (an app-lifetime `@StateObject`). `WebShell.makeUIView` returns it; `updateUIView` is empty, so SwiftUI re-renders never recreate or reload it and form/auth/web state survives.
- **Route requests** are `RouteRequest(id, path)`; `WebLoader.open` is idempotent per id. Unrelated renders cannot force an old reload; a repeated identical route (a new request) does load.
- **Config** (`WebConfig.evaluate`): bare `https://host[:port]` only. Missing, unexpanded `$(...)`, `replace-with…`, `.example/.invalid/.test/.localhost`, non-HTTPS, credentials, path/query/fragment => unavailable. Shown as a local "isn't set up on this build" message (no URL, no Retry).
- **Lifecycle** (`WebLoadState`, pure): `didStartProvisionalNavigation` -> loading; `didFinish` -> loaded; `didFail`/`didFailProvisional` -> failed (generic "Can't reach Dinedeals" + Retry); `webViewWebContentProcessDidTerminate` -> terminated (explicit Retry). `didCommit` is not an event (committed is not finished). Callbacks carry a per-navigation token: only the tracked navigation can settle the state, so canceled/superseded/stale callbacks never hide or fail a newer load. NSURLErrorCancelled and WebKit error 102 (policy change) are cancellations: the previous settled phase and target are restored. No automatic retry or reset.
- **Retry** loads a plain GET of the current same-origin target (never `reload()`, so no form POST replay). The target follows same-origin page navigations; on termination the live `webView.url` is used when same-origin. The one-time `shared` query parameter is kept for a first load that failed (so the share is not lost) but scrubbed once the page finished or terminated, so Retry never resubmits a share. Foreign URLs never become the target.
- **Overlay**: loading is a non-blocking spinner over the mounted web view (completion hides it); failed/terminated/unconfigured cover the view with a cream message.
- **Unchanged**: exact trusted origin + main-frame check for the `dishdeals` bridge, external links via `UIApplication.open` only for `linkActivated`, secure `callAsyncJavaScript` arguments, inbox/Keychain/App Group code. Same-origin comparison now treats explicit `:443` as default.

## Checks
- `tests/native/WebLoadChecks.swift`: 48 pure checks (config, same-origin, stale/failed/canceled/finish/retry/termination/share scrub). Run command is in the file header (extracts the `WebLoadModel` region).
- iPhoneOS SDK typecheck of App+ShareStore and ShareExtension+ShareStore: clean (only deprecation warnings).
- NOT done: simulator build/QA of this source (after integration, sole device `DishDeals Native QA`, outputs `/tmp/dishdeals-cinder-load-recovery`); real WKWebView behaviour of cancel codes and termination is unobserved; real phone pending.
