# N-SIM-A simulator QA (Cinder, Claude Code Sonnet 5.5)

Simulator only. Synthetic share input only (no Instagram fetch, no real Reel/media, no backend/provider/account). Real iPhone (iOS 26.6.1) acceptance is pending separately.

## Matrix
| Item | Value |
|---|---|
| Device | iPhone 17e, iOS 27.0, UDID 2F091162-0FA9-455C-8FC5-B904A971601D (portal `DishDeals Native QA`, `maestri portal info` confirmed). iPhone 18 Pro untouched. |
| Xcode | 27.0 (27A266a) |
| Build source | read-only human project `workflow/ios/Dinedeals.xcodeproj` (git-ignored, not regenerated, no XcodeGen). Its Swift (`App/DinedealsApp.swift`, `Shared`, `ShareExtension/ShareViewController.swift`) was `diff`-identical to this checkout at 4241d26 (project/Info.plist/entitlements are untracked generated files). |
| Command | `xcodebuild -project Dinedeals.xcodeproj -scheme Dinedeals -configuration Debug -destination 'platform=iOS Simulator,id=<UDID>' -derivedDataPath /tmp/dishdeals-cinder-simulator-qa CODE_SIGNING_ALLOWED=NO build` |
| Result | exit 0, `** BUILD SUCCEEDED **`; only warning: AppIntents metadata extraction skipped. Scheme builds both `Dinedeals.app` and embedded `PlugIns/ReelShare.appex`. Log: /tmp/dishdeals-cinder-simulator-qa/build.log |
| Binaries sha256 | Dinedeals 1133aa4b9445a4dd…; ReelShare 4b4dc5c374393431… |
| Install/launch | `simctl install` exit 0; `maestri portal launch dev.dishdeals.app` ok |
| Native config observed | AppGroup `group.dev.dishdeals`, KeychainGroup `dev.dishdeals.shared`, BackendURL `https://replace-with-your-deployment.convex.cloud`, WebsiteURL `https://replace-with-your-web-host.example` (placeholders). Extension activation: text + web URL max 1. |

## Observed results
- **App launch**: app launches; screen is entirely blank white and exposes no accessibility elements. This is the placeholder `WebsiteURL` and is NOT a passed flow. Web flow, auth, bridge, provider, map and publish E2E: **blocked** (placeholders; no cloud calls made). Trusted-bridge test not run (no strict-trusted local HTTPS origin without downgrading shipping security).
- **Share path**: Simulator Safari (first-run "Continue" sheet dismissed) rendered `tests/native/simulator/share-fixture.html` from `http://localhost:8765` (owned port, stopped afterwards; `navigator.share` available, secure context). The UIKit system share sheet listed **Dinedeals** (placeholder icon) for URL and text shares. Transition: Safari -> system share sheet (~3 s) -> Dinedeals tap -> extension full-page sheet (cream) -> Done returns to Safari. The app was never opened automatically.
- **Direct URL** (`{url: reel link}`): offered 1 type `public.url`; loaded link. Status: "Could not save locally. Check App Group setup." (unsigned build has no App Group container: `ShareStore.enqueue` throws .configuration). Safari did not pass the extra `text` for `{text,url}`; the offered summary was identical (public.url only).
- **Text containing the link**: offered `public.plain-text`; loaded text; link resolved, then the same App Group save message.
- **Unsupported link** (`https://example.com/...`): offered `public.url`; the "Share the Reel's direct Instagram link..." rejection plus summary; nothing saved.
- **Two different Reel links in text**: rejected with the same message (`public.plain-text`, loaded text).
- **Plain text, no link**: rejected the same way.
- **Summary line** shows offered count, the actual identifier(s) and loaded representations, plus "No video was loaded." Truncation/omitted-types branches were not triggered by these inputs (covered only by the Foundation checks).
- **Cancel**: dismissing the share sheet returns to Safari; the page sees `AbortError`; no extension UI.

## Not verified here (blocked or out of scope)
- Successful local recovery save, signed-out recovery (24 h), item receipt, `requestShareContext`/`received` bridge, direct `reels:submit`: need a signed build with the App Group entitlement and a real web origin/backend. CODE_SIGNING_ALLOWED=NO strips entitlements, and the entitlement files exist but are not applied.
- Real Instagram share sample and iOS 26.6.1 phone acceptance: pending.

## Coordinator follow-up (no source fixed here)
1. For simulator QA of the save path, a bounded follow-up could build with simulator ad-hoc signing and the App Group entitlement (human Team ownership), or point `WebsiteURL` at a trusted HTTPS fixture.
2. The "Check App Group setup" string is accurate for unsigned builds; no code defect found.
3. Safari's `navigator.share({text,url})` surfaces only `public.url` to the extension; the real Instagram app may offer different types, so the actual identifiers still need recording on the phone.

Fixture: `tests/native/simulator/share-fixture.html`. Screenshots: `docs/qa/simulator/shots/`.
