# ADR 0002 — Native iOS and map home integration

Status: product direction approved by William; runtime and inter-owner contracts pending source review. Date: October 3, 2026.

William’s active master assignment replaces the coordinator’s one-batch limit. T-01/T-02 are DONE and reused at 356ec1b; current published workflow base is 83035c1eeed1c17915764ae0321594315fd5a81b. No new test results are inferred. Root human checkout has uncommitted documentation and remains untouched. Northstar owns scheduling, status and reviewed local integration; each worker stops after one bounded ticket. Remote pushes/PRs, cloud synchronization/deployment, domains/purchases/accounts and submissions need specific authorization.

Harry owns frontend and native Instagram sharing (William confirmed in this session). His sharing source is unpushed; inspect his published changes before choosing framework, app/extension targets, storage, bundle IDs, signing, build commands or native auth/map integration. Pinyuan owns maps, geocoding, pins and geospatial integration. Never duplicate these lanes. Published map source is a browser component; compatibility with the shipping runtime is unresolved.

Map home is core. Shared community publishing remains canonical; “my map” does not authorize a private-only schema. Drafts never become published markers. Keep every original ticket, including Android T-13, Solana T-15, genuine fixtures T-16 and HTTPS T-20, visible separately from the primary iPhone milestone.

## Contracts and unresolved approvals

1. Harry → ingestion: real supplied item types, exact Instagram UI, durable payload/reference, lifecycle, maximum size/count, cancellation, restart/replay and authenticated ownership. No receiving-payload implementation is approved until inspected. URL receipt cannot prove video access. Never fetch Instagram URLs.
2. Ingestion → extraction: accessible supplied image/frame/text/caption, storage IDs, provenance, pending/failed/unsupported statuses. Preserve all relevant supplied context; provenance URLs are not download instructions. No keys in clients. Authenticate operations and verify source ownership before extraction.
3. Extraction → form: canonical DealResult where supported; otherwise a separately labeled draft adapter with evidence, missing fields and unconfirmed suggestions. Existing confidence has restaurant/price/hours/expiry only; global confidence cannot be copied or replaced by 0.5. No contract revision accepted yet. User edits survive late results/retries; pending suggestions require explicit acceptance.
4. Form → Pinyuan: canonical address and editable candidates, explicit user-confirmed lat/lng and location completion; missing confirmation blocks publish. No guessed coordinates, substitute maps or marker drafts. Shared deals.ts/geospatial ownership must be agreed before writes.
5. Publish → map: canonical saved IDs, owner, reactive query/refresh and marker/detail contract; counts and author permissions remain backend controlled. Source fields/lat/lng/API names stay intact.

## Verification stages

Available now: backend auth/profile/permission tests, pure validity/distance, extraction adapters/schema errors, editable draft state, fixture validation and setup docs. Replay/synthetic inputs are explicitly labeled.

Native: compile agreed app/extension after Harry source and Xcode/runtime readiness, discover schemes/build command, isolated simulator ownership/build outputs, test controlled receiving/form/map transitions. Tooling at kickoff: xcode-select returned /Library/Developer/CommandLineTools; simctl unavailable. No installation/system-directory changes authorized.

Device: signing readiness separate from simulator builds. William’s real iPhone must receive actual Instagram share input, obtain source-supported VLM suggestions, confirm required fields/location, publish and display saved marker. Record app/iOS/Instagram versions, exact taps/transitions, UTTypes/item bytes, extraction/publish timings, persistence, auth and cross-device updates. Screenshot and flyer tested separately. All pending.

## Official documentation inspected

Apple’s [extension lifecycle](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html) and [shared storage/background scenarios](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html) are archived guidance: extension is short lived, shared container access requires coordination; do not promise containing-app launch from Share extension. Revalidate selected implementation against current [NSExtensionContext](https://developer.apple.com/documentation/foundation/nsextensioncontext) and [App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups) docs when source arrives. No fixed memory/time limits invented.

[Convex auth overview](https://docs.convex.dev/auth/overview) documents React Native compatibility; this does not prove a particular native session adapter or authorize an Expo choice. [Google models](https://ai.google.dev/gemini-api/docs/models), [image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), and [structured output](https://ai.google.dev/gemini-api/docs/structured-output) checked; historical model names require verification and actual provider evidence.

## Deadline and phone setup reply

William reports deadline October 4, 2026 at 12:00 America/Vancouver; iPhone runs iOS 26 (minor version unknown), Xcode still installing. He requests direct phone testing without App Store publication/paid enrollment. Prepare Xcode Personal Team route; no account/purchase/submission action authorized. Apple [personal-team guidance](https://developer.apple.com/help/account/basics/about-your-developer-account) permits own-device installation/testing with expiring profiles (7 days). Harry extension capabilities/App Groups feasibility under that team remains to be verified; do not promise every entitlement is available. Developer Mode/pairing/signing are human steps.

## Toolchain update (October 3, 22:37 Vancouver)

William confirms Xcode installed and simulator runtime still downloading. Observed selected directory /Applications/Xcode.app/Contents/Developer, Xcode27.0 (27A266a), iOS27/iOS Simulator27 SDKs present. Workspace Ops read-only simctl lists no installed runtimes/devices. No native build or device signing is proved. After source intake, discover actual schemes and consider compiling against installed SDK before simulator download finishes; running simulator tests still needs its runtime. No platform download or directory switch performed by agents.

## Harry source received — October 3 22:45 Vancouver

William confirms published `t-20-reel-sharing`, inspected at `547a74df5d279ad40758394430979645e416f2c5`. Existing owner chose SwiftUI/WKWebView plus UIKit Share extension; reuse this application, not a second stack. XcodeGen YAML defines Dinedeals app `dev.dishdeals.app`, embedded ReelShare `dev.dishdeals.app.ReelShare`, iOS16 deployment target, Swift5, AppGroup `group.dev.dishdeals`, shared Keychain `$(AppIdentifierPrefix)dev.dishdeals.shared`. Team blank, web/backend URLs placeholders. Architecture is owner-supplied; authentication/map compatibility still under reconciliation. Default app route `/reels` must be reconciled with required map home by Harry/Pinyuan; no substitute map.

Native extension accepts URL/text only; direct reel/reels/p shortcode links normalized; no media bytes received by this implementation. Protected 24h link recovery in AppGroup files; verified auth access token shared via Keychain, extension does not refresh. It posts canonical private `reels.submit`, ends with Done then user reopens app; no automatic app launch. Notifications are local while webview observes results, not terminated-app remote processing alerts. Actual Instagram payload remains unobserved.

Harry's canonical auth/profile/deal/vote tables preserved; additive reel staging and durable workflow component require separate review and cloud authorization. Existing frontend references standalone workflow backend and local previews, not reviewed canonical users/deals/votes; adapt rather than merging incompatible schemas. `toCanonical` currently fills four zero confidence sentinels; do not represent them as genuine field scores.

Reel video understanding uses ScrapeCreators resolver/download + Gemini video. This resolver is NOT authorized under William's no-scraping/unapproved-resolver instruction and provider billing/deployment boundaries. Keep usage disabled. URL receipt alone cannot establish source-supported extraction. Supported original media/caption/images and owner-agreed ingestion must resolve this blocker; screenshot fallback does not close reel-share acceptance.

William reports signing not configured; own-device Personal Team testing preferred, AppGroups/Keychain capability compatibility unresolved. Simulator runtime downloading; SDK compilation inspection need not wait. N-IOS-A Loom read-only contracts and N-BUILD-A Cinder actual SDK checks are separate bounded packets; neither may edit Harry's native implementation.

## Latest navigation revision — William October3

William explicitly directs: "go with harry's app with the saved posts/reels, the design should switch to a map when tapped." This supersedes earlier map-as-initial-home wording for navigation. Reuse existing Saved Posts/Reels entry and provide tap-to-map using Pinyuan's map; published canonical deals still require confirmed location and map display. No duplicate map. Full T-21 filtered map acceptance retained; earlier map-home decision is historical. Real-device dominant share→source-supported extraction→review→confirmed location→publish→map acceptance is unchanged.

## Native build and current Apple capability evidence

Harry app and embedded ReelShare successfully generated by portable verified official XcodeGen2.46.0 and built under Xcode27 generic iOS Simulator SDK with CODE_SIGNING_ALLOWED=NO; both universal arm64/x86_64 bundles inspected. No app execution or device signing/installation. Native runtime download is not required for this SDK build or subsequent physical-device signing.

Current official Apple HTML supported-capabilities-ios table lists AppGroups and Keychain Sharing with yes icons in all three columns, including free AppleDeveloper account holders. Text-only extracts lose these icons; earlier reviewer paid-only inference corrected. Actual PersonalTeam provisioning still untested and William has not configured his account. No purchase or Store submission authorized/needed for attempted direct device development.

Merged Harry frontend test uncovered stale host timezone data for November2026: current BC government rule keeps Vancouver UTC-7 after final March8 2026 transition. Northstar compatibility helper shares historical-before/permanent-after formatting in both temporal engines; preserves 2025 fallback/final2026springgap and testsNovember2026/January2027/overnightexpiry. This is remaining validity integration, never T01/T02 reacceptance.
