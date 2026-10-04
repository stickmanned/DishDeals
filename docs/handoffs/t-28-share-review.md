# T-28 — iPhone share review routing

Status: fixed locally, installed on William's connected iPhone, and confirmed by William: "the shared reel opens with settings to edit". Automatic Gemini extraction is a separate remaining failure being investigated.

Branch `t-28-share-review`; isolated checkout `/private/tmp/dishdeals-t28-share-review`; base `fa7a9f9`. Original T-27, root work and workflow source/signing project are untouched.

Cause: the retained oldest unsent link was selected by `ShareStore.first()` again after its file had been handled in this process. `InboxRouting.shouldRoute` rejected it, so the consumer never reached any newer share. This was previously documented as a known limit in `n-load-a.md`.

Fix: expose session-handled filenames and exclude them while selecting the next pending inbox record. Preserve protected recovery files and the receipt/expiry rules; repeated foreground events do not reload the same page or discard form edits. No automatic containing-app launch from the Share extension was added.

Changed files: `ios/App/DinedealsApp.swift`, `ios/Shared/ShareStore.swift`, `tests/native/share-routing-checks.py`, this handoff.

Checks:
- Production-consumer replay before fix: FAIL, new share leaves route count at 1.
- `python3 tests/native/share-routing-checks.py`: 8 checks pass, including new item, new unsent link, repeated foreground and preserved older recovery file. Synthetic local inbox, not Instagram evidence.
- WebLoadChecks: 61 pass; ShareStoreChecks: 98 pass.
- Copied existing human Xcode project built with unchanged Team/profiles, device destination `00008150-00092D9426FB801C`, production web URL and regional backend: BUILD SUCCEEDED.
- App/extension backend URLs and app website URL checked in built Info.plists; AppGroup matches on both targets.
- macOS `codesign --verify --deep --strict` reports CSSMERR_TP_NOT_TRUSTED; this was not counted as a pass or used to change trust settings. Actual device installation succeeded, app launched, and William's phone test confirms the routing fix.
- `git diff --check` passes.

Device update used the same `dev.dishdeals.app` bundle ID; no uninstall, app-data deletion, signing regeneration, backend sync, website deployment or remote push was performed. Build products/log are under `/private/tmp/dishdeals-t28-native-build*`. Rebuild this source with the existing signed project for later installations, preserving its ignored files.

Next bounded assignment: diagnose the real saved Reel's retrieval/Gemini failure. This handoff does not claim automatic extraction or full share-to-map acceptance.
