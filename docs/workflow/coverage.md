# Remaining ticket coverage and evidence

October 3, 2026. T-01 and T-02: **DONE by William confirmation**, code reused. T-00 workflow integrated. This matrix preserves original acceptance and native adaptation; pending means no passing evidence. Primary iPhone milestone and full backlog completion are distinct. Native framework waits for Harry’s sharing branch. Human root stays untouched.

| Ticket | Original acceptance | iOS adaptation | Owner | Dependencies | Current evidence / remaining steps |
| --- | --- | --- | --- | --- | --- |
| T-03 | Phone signup/name/reload session | Backend now; native storage/session adapter after Harry runtime | Loom / Harry | 01,02 | Backend + existing web controls reviewed/integrated; local wrapper tests pass; live/native session/iPhone pending |
| T-04 | All five validity states, overnight, expiry/no-hours; distance tests | Pure client logic shared with native; Vancouver clock | Cinder (A), Mica (B) | 02 | T-04A/B reviewed/integrated; original pure tests passed; selected native Intl/map binding pending |
| T-05 | Schema-valid extraction on 3 real images; measured latency | All supplied context; source-supported suggestions, no Instagram resolver | Prism reconciliation; implementation owner after review | 02,05R | 05R reviewed/integrated; T-05A core reviewed/integrated at5f26c89; upload ownership/live action + 3 real image/latency pending |
| T-06 | 10 real deals + 2 flyer photos; validated fields and coordinates | Same canonical fixtures; Pinyuan validates actual pins | William / Prism validation / Pinyuan | 02 | T-06A official Burnaby source research underway; photos/confirmed pins/valid seed still pending |
| T-07 | Phone screenshot to confirmed published deal under 15 seconds | Common native-share/image/flyer draft; edit/confirm every field; user-confirmed pin | Functional worker TBD / Harry / Pinyuan | 03,05; pin integration 08 | T-07A pure draft state reviewed d0d7de7; integration queued; actual form/backend/native/pin wiring pending |
| T-08 | Burnaby geocode; dragging updates coordinates | Native-compatible confirmed location adapter | Pinyuan | 02 | Published browser map exists; confirmation/geocoder/runtime not agreed |
| T-09 | Price/time badges; A post appears on B without refresh | Map-first filtering/time/distance; supporting feed | Backend worker TBD / Harry / Pinyuan | 04,07 | T-09A pure selection reviewed/integrated atc1c91dd; deals.ts/geospatial contract/subscriptions and cross-device pending |
| T-10 | Author edits/deletes; others cannot | Native details with canonical fields and map | Backend worker TBD / Harry / Pinyuan | 07,08 | Pending; ownership tests independent once create model exists |
| T-11 | One vote/user; switching updates both counts | Native controls over same protected votes.cast | Loom backend / Harry UI | Full 10; backend split 02,03 | T-11A prepared: in-memory auth/atomic vote checks; live/detail/native pending |
| T-12 | Seed fills feed; two actual profiles/devnet wallets | Validated real canonical seeds populate map | Worker TBD / William / Pinyuan | 06,09 | No live seed run authorized; real data/profile/wallet missing |
| T-13 | Android screenshot share opens post with file | Primary iOS Harry extension integration; Android original tracked separately | Harry native / secondary worker TBD | 07,N-IOS,N-SHARE | Unpushed extension; Android secondary pending |
| T-14 | 10s recording yields 4 frames; reveal behavior | Native frame adapter after runtime; Harry owns reveal | Functional worker TBD / Harry | 07 | Pending; shared image helpers possible after source contract |
| T-15 | Real devnet wallet tip displays receipt | Native wallet transition and receipt; no real purchases | Worker TBD / William / Harry | 03,10 | Pending; wallet/device/network dependencies; does not delay first demo |
| T-16 | Genuine cached demo results work without Gemini key | Separate replay provenance; does not imply offline Convex | Worker TBD | 07 | No genuine extraction outputs yet; never manufacture |
| T-17 | Every plan edge case tested on phone | Add actual share/cancel/retry/late extract/unchecked publish/device persistence | QA worker TBD / William | Phase 2 | Pending actual native/phone execution |
| T-18 | Slow network never blank; matches human design | Functional states in native; Harry polish | Functional worker TBD / Harry | 09,10 | Pending |
| T-19 | Clean-clone setup; logged-out <=3m video | Native build/signing/share docs and adapted demo script | Cinder preparation / William | Phase 2 | T-19A runbook/script/submission preparation released; recording/review/submission pending |
| T-20 | Claimed domain loads HTTPS app | Retain website/domain path alongside installed iOS app | William / docs worker TBD | 01 | Instructions only; no domain/hosting action authorized |
| T-21 | Full-screen map pins match feed filter | Map is primary home now; same filter contract, no second map | Pinyuan / Harry | 04,09,N-IOS (replaces stretch gate) | Published browser component only; integration/device evidence pending |

## Added integration tasks (original numbering preserved)

| ID | Scope / owner | Inputs and dependencies | Acceptance and current status |
| --- | --- | --- | --- |
| N-IOS | Runtime/auth/map compatibility; Northstar + Harry/Pinyuan | Harry published native source, 03/08 interfaces | Agreed framework, schemes, dependencies, bundle IDs, signing/build commands; **blocked on Harry source**, not Xcode for inspection |
| N-SHARE | Share-to-ingestion adapter; Harry owns extension | Real Instagram item sample; durable lifecycle/storage/ownership contract | Actual iPhone receipt recorded; no URL-media assumption; **pending source/sample** |
| N-FORM | Native shared form bindings; functional worker + Harry/Pinyuan | 07 state contract, N-IOS/N-SHARE | Edits survive late errors/retries; accepted tentative values; confirmed pin before publish; **pending integration** |
| N-BUILD | Native build and simulator QA; assigned one simulator owner | N-IOS, installed Xcode/runtime | Actual scheme/build/native tests; **pending tooling/source**, no simulator/device inference |
| N-PHONE | Primary reel-share-to-map acceptance; William + Northstar | Signed installed app, real source/API and 03/05/07/08/09 | Exact real Instagram transitions/items, timings, field/pin confirmation, published marker; **pending real iPhone** |

## Dispatch and gates

First batch: Loom T-03 backend/minimal existing web controls; Cinder T-04A only validity; Mica T-04B only distance; Prism T-05R only read-only reconciliation and owned docs/inert fixtures. Provider footer is not proof of quota exhaustion: fresh replies decide availability. Cinder/Mica CLI dialogs ended during readiness probing; fresh bounded assignments dispatched. No provider switches or recruitment.

Northstar reviews exact local commits and ownership, integrates serially in workflow checkout, reruns meaningful checks after integration, then issues a fresh bounded packet for the next dependency-ready slice. Workers never automatically pull backlog. Generated config/package/schema/auth providers/deals.ts each have one owner at a time. T-03 currently owns auth providers/auth.config/API module registration; schemas/package/lock remain frozen. All cloud operations are unrun absent new target-specific authorization.

Human inputs pending: Harry native branch and interface agreement; Pinyuan location/publish/map adapter agreement; 10 real deals + 2 photos + confirmed pins; actual Instagram payload sample; iOS 26 minor version and signing readiness. Independent work continues.

Deadline: October 4 at 12:00 America/Vancouver. Xcode installing; own-device iOS 26 testing via free Personal Team preferred, extension entitlements/signing unverified.

### T-07 split approved for independent local work

T-07A (Mica after distance review): reusable pure draft state/confirmation/publish-field validation, depends completed T-02 only. T-07B actual upload/extraction/backend create depends T-03/T-05 and agreed source ownership/geospatial hooks; T-07C Harry native form/Pinyuan confirmed pin integration depends N-IOS/N-SHARE/T-08. Full original T-07 stays pending until the real phone publish flow passes. No duplicate frontend/map/share implementation.

T-05 split: T-05A Loom headless source-supported extraction/core error tests after reviewed T-05R; T-05B signed canonical action blocked on durable upload ownership contract/provider/backend target authorization. Full 3-real-image/latency evidence stays pending. T-06A Prism source evidence research now authorized by William; T-06B real images/photos and Pinyuan confirmed coords/seed validation remain HITL. No seed deployment authorized.

T-09 split: T-09A Cinder shared pure price/time/distance selection after reviewed T-04A/B, no geospatial or map wiring. Full T-09 backend subscriptions/index/Pinyuan integration and cross-device evidence remain dependent on full T-07; same selection intended for map and supporting feed. Strict “under” thresholds, missing price included per original edge case 5.

Milestone evidence at 56f23c3: Northstar combined `npm run check` exit 0; 100 Vitest tests, 23 workflow tests, typecheck/lint/build passed. T-03 backend/web source, T-04A/B pure logic, T-05R reconciliation reviewed/integrated. No live auth/provider/native/phone claim. T-09A now dispatched Cinder.

T-11 split: T-11A backend uses completed canonical schema and reviewed auth on synthetic in-memory saved deals; does not require a mock publishing application or touch deals.ts. Full T-11 still depends real T-10 detail/native controls and live saved deals. Only votes API type registration owned by Loom in this serialized slice.

T-19A preparation split: actual shared/web setup and native gates, demo script/submission draft, domain instructions; full clean-clone native setup and human video/submission remain pending.
