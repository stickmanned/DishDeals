# Human integration contracts to settle

This is a reviewable coordination artifact, not a message sent to Harry/Pinyuan. Northstar will inspect published source before approving actual bindings. Harry owns frontend and native sharing; Pinyuan owns all map/geocoding/pins/geospatial. Deadline Oct 4 noon Vancouver.

## Harry: native source intake

Supply branch or local export when ready. Inventory framework/version, app and extension targets, schemes, deployment target, bundle IDs, capabilities, dependencies, actual build commands, signing/team requirements, durable receiving storage/reference and auth/session boundaries. Confirm free Personal Team compatibility of every entitlement before paid setup assumptions. Do not install or submit to App Store/TestFlight as part of this assignment.

On William's iOS 26 phone, capture actual Instagram versions and exact UI action. Record whether the chosen action is Instagram internal messaging or system share sheet, the actual supplied item types/UTTypes and accessible text/image/video/URL bytes. A URL only is not reel understanding. URL provenance must never trigger Instagram fetching. If payload lacks media/text, state blocker and agree source-supported route; screenshot fallback separately passes screenshot acceptance only.

No containing-app automatic-open promise. Inspect supported storage/handoff, extension completion/cancel, cold restart, duplicate receipt, bounds, errors and what the user actually taps to continue. Keep auth tokens/private keys out of shared payloads/logs. No silent cross-account assignment of pending drafts.

## Pinyuan: location and published map contract

Canonical stored fields: `_id`, `restaurant`, `address?`, `dealText`, `priceCad?`, `validDays`, `validStart?`, `validEnd?`, `expiresOn?`, `conditions`, `lat`, `lng`, `imageId?`, `sourceUrl?`, author/count fields controlled on server. Published MapDeal uses different display names/coordinates; agree an adapter rather than change database fields. Draft suggestions are not markers in published queries.

Needed functional boundary: editable address candidates → explicit user-confirmed `{lat,lng}` within valid ranges → form location-complete state. Restaurant/address edits invalidate old pin confirmation. Pinyuan supplies map/pin UI and geocoding. Agents supply draft reducer/publish validation, no guessed points.

Needed backend boundary: one writer for `convex/deals.ts` and coordinator-serialized geospatial hooks/config. Agree actual index/component insert/update/remove/query integration before agent publish mutations are enabled. No duplicate geospatial implementation. Define denied-location fallback `listRecent`, canonical `listNearby` limits/maxKm/return fields, reactive marker refresh and marker→detail binding.

## Ingestion and extraction ownership

Current canonical schema lacks author ownership for unpublished `_storage` IDs. Signed-in checks alone do not prove that a supplied storage ID belongs to the caller. Before wiring live extraction, agree a minimal upload ownership mechanism (and document owner-approved schema/API revision if required) with Harry/backend owner. Pure extraction core can be tested against supplied bytes now; a deployment action must not silently bypass this gate.

Canonical `extract.extractDeal` args remain `{imageIds, caption?}`, `DealResult` retains four confidence keys. Provider's standalone global scalar cannot map into those keys. Direct field self-assessments are not calibrated probabilities. All suggestions need explicit form acceptance. Unknown optional values remain blank/reviewed; no currency/coordinates guessed from Burnaby context. Future start-date constraints cannot be dropped because canonical schema lacks a startDate field.

## Device setup (human, after Xcode installation)

Apple permits direct own-device testing via Xcode Personal Team; [current account limits](https://developer.apple.com/help/account/basics/about-your-developer-account) include expiring provisioning profiles. In Xcode sign in to your Apple Account, connect/unlock/trust the phone, select the correct Team per actual target, enable [Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device), then run the discovered app scheme. Exact commands/entitlements stay pending Harry source; do not choose a framework to fill blanks. Native build readiness, signing readiness and actual share-to-map acceptance are distinct.
