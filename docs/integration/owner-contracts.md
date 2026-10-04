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


## Current approved integration boundaries (October 3 late evening)

Harry source is published and integrated: SwiftUI/WKWebView app plus UIKit share extension, URL/text only. Existing canonical root session bridge now supplies its trusted native Keychain bridge; unowned recovery links require explicit account consent. Simulator SDK build passed, runtime/Keychain/real receipt still pending. Official free-account capability table lists App Groups and Keychain Sharing; actual provisioning remains unverified. Placeholder web/backend URLs prevent a working network app.

William transfers Pinyuan's unfinished implementation to agents. Cinder continues his latest published map component; Prism prepares geocoding with explicit user search, application-wide durable throttling/cache before live use. Coordinate proposal never equals confirmation. N-MAP-A and N-FORM-UI packets pin the controlled location callback. Northstar alone wires canonical create/update/remove to the geospatial index after that component's official contract is checked.

Private edit revision contract: optional reelItems.draftRevision/draftEdited legacy defaults 0/false. saveDraft keeps its name/null result but requires expectedGeneration/expectedRevision. Atomic guards and incrementing revision prevent same-clock or stale-generation overwrites. Retry retains user draft and extraction provenance; finish updates extraction and only replaces unedited defaults. UI explicit conflict handling preserves local input. These are additive private intake fields, not a competing deals schema.

Geocoding policy: [Nominatim public policy](https://operations.osmfoundation.org/policies/nominatim/) permits moderate user-triggered place searches, requires identifying application headers and attribution, and limits the whole application's traffic to one request per second. Autocomplete and systematic/bulk queries are excluded. The backend must enforce a durable global gate and caching, and permit server-configured provider changes before enabling the public path. No live request has run.


### Canonical publishing ownership and index contract, October 4

Northstar approves T-09C Loom as sole implementation writer for canonical CRUD, schema, package/config and generated component typing; Northstar reviews and owns final integration. Official geospatial0.2.1 uses nearest with meter radius. Preserve workflow component/env and canonical table fields; mutations update the index transactionally. Add private dealUploads(ownerId,storageId,expiresAt,published), by_storage/by_expiry and deals.by_image index for authenticated server-established image ownership. Actual upload follows a separate HTTP source slice; no public storageID claim. Canonical update is full field replacement, omittedoptional fields clear; author/counts remain server-controlled. This addition does not reopen T-02. No cloud sync authorized; future release must inventory/preserve newly published teammate tables/functions.
