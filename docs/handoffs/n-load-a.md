# N-LOAD-A handoff
Branch t-18-native-load-recovery, base 5f3b23e. Detail: docs/integration/native-load-recovery.md.
- Source ready: loading/error/unconfigured/terminated overlay + Retry; stable single WKWebView; pure tested lifecycle; bridge/origin/external-link/inbox code unchanged.
- Checks: WebLoadChecks 61 passed; SDK typecheck of app and extension clean.
- Pending: simulator build/QA on integrated source (not claimed compiled by xcodebuild), real WKWebView cancel/termination observation, real phone.
- Writable paths only; no signing/project/XcodeGen.

Review fixes (aaedbc3 follow-up): (1) inbox record routed once per process via InboxRouting (foreground no longer reloads); known limit: newer share waits behind an unreceipted older link because ShareStore.first() is oldest-first (ShareStore not in scope). (2) navigation tokens from the WKNavigation returned by our own load; stale/older starts and webView.url cannot overwrite the requested target; retry uses the requested route. Root ios/project.yml human change untouched.

Simulator check done on integrated c4b937a source: unsigned full-scheme build SUCCEEDED, installed on sole iPhone 17e, unconfigured overlay visible and accessible (see integration doc). Live-host paths still pending. No shipping Swift changed.
