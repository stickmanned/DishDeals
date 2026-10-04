# N-LOAD-A handoff
Branch t-18-native-load-recovery, base 5f3b23e. Detail: docs/integration/native-load-recovery.md.
- Source ready: loading/error/unconfigured/terminated overlay + Retry; stable single WKWebView; pure tested lifecycle; bridge/origin/external-link/inbox code unchanged.
- Checks: WebLoadChecks 48 passed; SDK typecheck of app and extension clean.
- Pending: simulator build/QA on integrated source (not claimed compiled by xcodebuild), real WKWebView cancel/termination observation, real phone.
- Writable paths only; no signing/project/XcodeGen.
