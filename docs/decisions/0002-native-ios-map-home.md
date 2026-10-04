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
