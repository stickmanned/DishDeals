# T-26 Android app

User assignment: provide the latest GitHub source and build an Android app. Scope is a native Android package for the current combined frontend, with the existing Convex backend, English UI, updated map and usable mobile navigation. No backend/schema changes, main-branch integration, account provisioning, paid provider enablement or Play Store publication.

Branch: `t-26-android-app`, based on `origin/main` at `cc47c03` (combined build PR #12). Draft PR: https://github.com/stickmanned/DishDeals/pull/14. Isolated checkout: `C:\Users\pinyu\.codex\worktrees\dishdeals-new-frontend\AI_Restaurant_deal`. The primary checkout's unrelated local changes were preserved.

## Implementation

- Capacitor 8.5.2 Android project, app ID `io.github.stickmanned.dishdeals`, label DishDeals, existing brand icon and light system bars. Static assets are bundled at the root, with no remote server URL, mixed HTTP traffic or permissive navigation allowlist. Cloud backup is disabled and signing files are ignored.
- `scripts/build-android.mjs` loads the ignored public deployment selector, builds with an empty base path, syncs Android, assembles the debug APK and runs Android lint. GitHub Pages configuration is independent. The existing Swift iOS project is preserved; only Android is synced.
- Native text/plain Share receiver accepts Instagram/website links and captions, bounds incoming text, stores the latest pending item locally, and shows explicit confirmation. A matching acknowledgement prevents a late callback from deleting a newer share. Existing unsaved source data is replaced only after confirmation. Importing never submits an offer. Native image-share intents are outside this version; the existing in-app image/camera picker remains available.
- Android Back closes an open dialog, follows navigation history, or minimizes from Discover. A per-share source key resets an old review form when importing a new source.
- Mobile navigation now exposes Map & AI and Reels alongside Discover, Post and Profile using the existing styles, with widths that fit small screens.
- Android Actions workflow builds/lints the APK and exercises it in an Android 15 emulator, saving UI XML, screenshots and crash logs. SDK binaries and the AVD directory are explicitly resolved rather than relying on runner PATH defaults. Empty template tests were removed.

## Verification

Local `npm.cmd run check` passed: typecheck, lint, 198 app/backend tests, 23 workflow tests and static production build. Typecheck/lint were repeated after the source-remount and mobile-navigation changes. `git diff --check` passed.

Final runtime and QA source: `4cffe3e`. [Android Actions run 37220962559](https://github.com/stickmanned/DishDeals/actions/runs/37220962559) passed the APK build, Android lint and real installed-app Android 15 emulator checks: Discover, cold/warm text sharing, preserving an existing draft, Back, map and Reels navigation. No offers were submitted. The app crash buffer was empty. Screenshots confirm the English UI, live Convex feed and updated map tiles. First-boot Pixel Launcher ANR dialogs are recorded and dismissed through their UI-tree bounds; a DishDeals ANR remains a hard test failure.

The final APK was downloaded and verified locally with Android `apksigner` (valid v2 signature). Package inspection confirmed min SDK 24, target SDK 36, bundled Discover/Post/tools pages, the public proper-marmot-82 Convex endpoint, updated OpenFreeMap assets and no remote website URL. [Quality CI run 37220962539](https://github.com/stickmanned/DishDeals/actions/runs/37220962539) passed for the same source head. Final handoff-only changes do not alter that tested APK runtime.

The QA helper now identifies app crashes by the package/process marker while retaining the entire emulator crash buffer. A documentation-head rerun completed the app flows but reported a crash in Android's UiAutomator accessibility helper; that unrelated system process must not be reported as a DishDeals crash. App ANRs and crashes remain hard failures. This QA-only correction does not alter the delivered APK runtime. Current head checks are available on PR #14.

Local Gradle could not download its distribution due to network timeouts; no local APK compilation or local emulator pass is claimed. Existing SDK tools were used only for APK inspection. No generated provider keys or credentials were copied into source archives.

## Delivery and limitations

Latest main source and Android source are exported with `git archive` into `D:\indie_game_dev\AI\DishDeals-deliverables`, alongside the debug-signed APK. See [Android instructions](../android.md) for installation and rebuilding. Teammates can send the APK file directly; GitHub Actions artifact downloads require GitHub access. Different build machines/runs can use different debug signatures, requiring uninstall/reinstall when signatures differ.

Live offers/maps/AI require internet. The existing grounded-search quota restriction, gated Reel extraction provider and canonical profile/vote adapter limitations remain as documented in earlier handoffs. Physical-phone camera/picker behavior and release signing remain manual acceptance. Next proposed work: physical Android phone acceptance and owner-controlled release signing, if assigned.
