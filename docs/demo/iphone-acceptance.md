# Real iPhone share-to-map acceptance record

Status: **pending, not run**. Deadline: October 4, 2026 at 12:00 America/Vancouver. Device reported iOS 26; minor version and actual app/Instagram versions unverified. Harry native sharing source unpushed; framework/schemes/signing unknown. Xcode installed/selected: 27.0 (27A266a); simulator runtime still installing (William update), no installed runtimes/devices in Maestri read-only check. This record must be filled with observed results, not intended behavior. T-01/T-02 remain DONE; new native evidence is tracked here.

## Stage gates

| Stage | Evidence needed | Current state |
| --- | --- | --- |
| Implementation/local checks | Reviewed source commits, exact checkout, commands/results, synthetic inputs labeled | T-03/T-04/T-05R locally integrated at 56f23c3; combined check 100 Vitest +23 workflow/typecheck/lint/build passed |
| Native build/simulator | Actual app/extension targets/schemes, Xcode/iOS runtime versions, exact build/tests, isolated simulator ownership | Xcode/SDK installed; Harry source/build commands pending; simulator runtime still installing; no app build run |
| Signing/installation | Actual Team/capabilities/bundle IDs/profile, device pairing/Developer Mode, installed build | Pending; prefer own-device Personal Team, no Store submission; capabilities need verification |
| Real Instagram iPhone flow | Exact native UI and actual payload, source-supported VLM, confirmed fields/location, publish and map result | Pending William phone |

## Record each actual run

- Date/time and operator:
- Phone model, iOS exact version:
- DishDeals app version/build/commit and checkout:
- Instagram app version:
- Native framework/extension scheme/bundle IDs:
- Signing Team type/capabilities and installed build:
- Network / backend authorized target / provider model (no keys):
- Exact Instagram taps (distinguish internal DM from system share sheet):
- Supplied item count, registered UTTypes/MIME, accessible URL/text/image/video, sizes:
- Durable receipt/reference, extension completion/cancel and actual app transition:
- Evidence VLM received all supplied visual/text context (redacted/safe IDs; no private tokens):
- Extraction start/end, seconds, provider versus genuine cache/manual route:
- Missing/tentative fields, user edits and explicit acceptance:
- Pinyuan pin confirmation, address, actual confirmed lat/lng:
- Publish start/end, seconds, saved canonical ID/author, marker shown:
- Reload/restart persistence and ownership check:
- Second device version and update timing; refresh required? (original target within 2 seconds):
- Screenshot/video evidence path (genuine phone recording only):
- Actual pass/fail/blocker and next action:

Receiving a reel URL alone is receipt evidence, not media access or VLM reel understanding. Do not resolve/fetch Instagram automatically. Manual/screenshot fallback is recorded separately and cannot close the dominant reel-share milestone. Simulator/replay tests are separate rows, not real Instagram/device results.

## Separate input tests

| Input | Expected evidence | Result |
| --- | --- | --- |
| Real Instagram reel via agreed native UI | Exact payload, source-supported suggestions, edit/confirm/publish/map | Pending |
| Genuine screenshot | Accessible image, VLM draft, confirmation and saved marker | Pending |
| Genuine photographed flyer | Accessible photo, VLM draft, confirmation and saved marker | Pending; no real photo supplied |
| Recording (T-14 later) | 10-second video produces four actual frames and Harry reveal | Pending |

## Edge cases (actual phone runs required for T-17)

| Case | Required behavior | Result |
| --- | --- | --- |
| Cancel extension/import | No published marker; durable state consistent, canceled extraction cannot overwrite edits | Pending |
| Retry after extraction failure/timeout/rate-limit | Manual values survive; bounded retry/fallback explicit, no duplicate publish | Pending |
| Malformed/unsupported/URL-only input | Safe error/manual route, no media/AI claims from absent source | Pending |
| Late extraction success/error | User edits remain; stale request/source cannot mutate current draft | Pending |
| Non-deal image | No offer found; manual entry still available | Pending |
| Multiple offers | Separate editable drafts; explicit choice, no silent first-offer publish | Pending |
| Missing price/foreign currency/2-for-1 | Price varies or reviewed blank; no invented CAD | Pending |
| Missing hours/expiry | Clearly pending/unknown or reviewed omission; Vancouver validity semantics | Pending |
| Tentative/unchecked required fields | Publish disabled/rejected until reviewed and required values supplied | Pending |
| Invalid calendar/clock values, overnight/DST | Validation/badges follow pure tests in actual selected runtime | Pending |
| Denied location/no geocoder results | No guessed pin; Pinyuan user confirmation; recent-deal fallback and hidden distance | Pending |
| Restaurant/address edit after pin confirmation | Old confirmation invalidated; re-confirm before publish | Pending |
| Signed-out Post/Vote/Tip | Sign in then return; backend rejects unauthenticated writes | Pending |
| Other-user edit/delete/source extraction | Server rejects unauthorized operation, unchanged saved data | Pending |
| Vote repeat/change | One vote/user; counts updated atomically | Pending |
| Duplicate restaurant/deal | Show relevant existing published candidates before confirming | Pending |
| Poster wallet absent | Tip hidden; devnet tip separate T-15 evidence | Pending |
| Slow network/empty/error | Functional states shown, no blank screen; Harry visual polish | Pending |

No App Store/TestFlight/account/purchase/domain action is authorized by this record. See owner-contracts.md for exact source/handshake gaps. Public ad research and synthetic fixtures are not phone/provider evidence.

## Observed local readiness — October3 23:05 Vancouver

Harry native/frontend547a74d incorporated workflow2011bf9, app/extension Swift files untouched. Generic iOS Simulator SDK fullxcodebuild PASS using generatedHarryproject; actualDinedeals.app embedsReelShare.appex. Xcode27.0/SDK27 installed; simulatorruntime execution unrun/downloading. This build is unsigned and usesplaceholderweb/backendconfiguration. CurrentApplecapabilityHTML showsAppGroups+KeychainSharing yesforfreeaccounts; actualPersonalTeam provisioning stilluntested. Williamaccountnotconfigured; read-onlydevicectl lists0 connecteddevices.

Signing/physicaldevice setup mayproceedbefore simulator runtime completes. Requiredhumanstep: addexistingAppleAccount inXcodeSettingsAccounts (no newaccount/purchase byagents); connect/unlock/trustphone, enableDeveloperMode, reviewbothactualtargetTeams/capabilities, configureuniqueIDs/publicHTTPSsite+approvedbackend andbuildappschemeonphone. Teamselection/provisioning/networkhosting/cloudsetup notperformed byagents. CurrentunsignedSDKbuild doesnot provephoneinstallation, Keychain/AppGroups access, WKWebViewsession persistence, mapWebGL/geolocation oractualInstagramUTTypes.

LatestWilliamnavigation: SavedPosts/Reels entry, tap-to-map. Primary share/review/confirmedpin/publish/map acceptance remainsPending. Singlecanonicalsession/explicitoffline-recoveryconsent and reel-to-shared-draft adapter are inboundedimplementation; fullpublish/map UI incomplete. Provider/resolverusage disabled; noactualvideo/VLM result, no genuinecachedextractionfixture, no realphone timing.


October3 late evening update: William confirms his Apple Account is added in Xcode. Read-only devicectl still reports zero connected devices; signing/provisioning and installation unverified. Simulator runtime inventory remains empty at the fresh native SDK-build milestone. Native app/extension rebuild after storage hardening passed, but no UI run. Local browser QA request was explicitly declined by browser security policy; no workaround attempted and temporary harness/server removed. All rendered/browser/native/phone checks remain unrun.
