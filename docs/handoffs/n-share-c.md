# N-SHARE-C handoff

Model: Claude Code Sonnet 5.5 (resumed; Northstar review corrections applied). Branch `t-13-native-supplied-context`, base `25cc20b65be346b699f7760b9465a461f0465df0`.

Files: ios/Shared/ShareStore.swift, ios/ShareExtension/ShareViewController.swift, ios/App/DinedealsApp.swift, tests/native/ShareStoreChecks.swift, docs/integration/native-supplied-context.md, this file. No project/signing/XcodeGen edits, no new Swift files.

Checks:
- `swiftc -parse-as-library ShareStore.swift ShareStoreChecks.swift` + run: 69 passed (adds masquerading-number/malformed-context, oldest-match selection, receipt-removes-only-consumed, tie order, summary truncation/all-types/omitted-count helper tests; no fake AppGroup test).
- `swiftc -typecheck -sdk iPhoneOS -target arm64-apple-ios17.0` for ShareStore+ShareViewController: clean; ShareStore+DinedealsApp: clean except the pre-existing onChange deprecation warning.
- Owner check and SHA: see final reply.

Statuses: implementation ready; native full build pending; real iPhone pending.
Design note: item records are now retained (marked routed) until `received` or 24 h TTL, so the bridge can serve context. Old context-less records still parse and never yield context.

Review corrections: `context(forSource:)` and `discard(source:)` both use pure `oldestMatch`; receipt removes one record. Summary from final context. Full Xcode build still pending (earlier human build predates this source). No project/backend/provider changes.
