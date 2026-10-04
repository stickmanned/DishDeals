# N-STORE-A native storage hardening

Northstar coordinator checkout `/Users/william/Code/DishDeals-worktrees/workflow`, branch `t-00-agent-workflow`, base `740391b`. Existing Harry SwiftUI/WKWebView app and UIKit extension reused. Removed forced shared-container/group/Keychain/trusted-website configuration unwraps. Missing entitlements/configuration now return failure instead of crashing. Protected atomic inbox files remain. Records are size-bounded, source/item validated, expired/malformed/future records rejected, and oldest valid save chosen by timestamp. Server receipt IDs validated before routing; extension wording does not claim successful extraction. No signing/configuration values or secrets changed.

Changed Swift: `ios/Shared/ShareStore.swift`, `ios/App/DinedealsApp.swift`, `ios/ShareExtension/ShareViewController.swift`. New deterministic check: `tests/native/ShareStoreChecks.swift` (synthetic only).

Actual commands/results:

- `/usr/bin/swiftc -module-cache-path /tmp/dishdeals-swift-module-cache ios/Shared/ShareStore.swift tests/native/ShareStoreChecks.swift -o /tmp/dishdeals-share-store-checks && /tmp/dishdeals-share-store-checks`: exit 0, **18 Foundation parser checks passed**. No actual Keychain/App Group/HTTP/device execution.
- Verified portable XcodeGen 2.46.0: `xcodegen generate --spec ios/project.yml --project ios`, exit 0.
- `xcodebuild build -project ios/Dinedeals.xcodeproj -scheme Dinedeals -configuration Debug -destination "generic/platform=iOS Simulator" -derivedDataPath /tmp/dishdeals-storage-derived-data CODE_SIGNING_ALLOWED=NO`: **exit 0, BUILD SUCCEEDED**. Installed Xcode 27.0 actual SDK build of app and embedded extension; log `/tmp/dishdeals-storage-native-build.log`.

Implementation and available native SDK checks passed; simulator runtime execution, signing/provisioning, configured reachable URLs, real Instagram payload and William iPhone acceptance remain pending. A generic SDK build is not a simulator or phone run. Generated project/plist/entitlement files ignored; original project.yml identifiers/capabilities preserved. No cloud/provider/remote/account action.
