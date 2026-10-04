> Updated 2026-10-03: current assignments and isolated Git workflow are in [agent-workflow.md](agent-workflow.md) and [tasks manifest](workflow/tasks.json). T-01/T-02 are committed in 356ec1b. Earlier first-kickoff sections below are historical; task packets supersede their dispatch instructions. Human UI/map boundaries remain in force.

# DishDeals team integration boundaries

The authoritative specification is `StormHacks Project Plan Instagram Deal Saver.md`. The human's current scope adjustment is: agents build the functional core incrementally; human teammates own high-quality frontend and all map integration. Keep the source plan intact and document ticket splits here or in the ticket handoff.

| Owner | Lane | Boundary |
| --- | --- | --- |
| Northstar (Codex Maestro) | One-ticket scheduling, contracts, review, integration, status | Do not auto-start subsequent tickets |
| Loom (Claude Code) | Assigned functional code and checks | One writer per shared checkout; exact paths required |
| Prism (Gemini) | Assigned API research, fixtures, demo evidence | No frontend design/polish or map implementation |
| Human frontend teammate | Polished UI, typography, palette, animation, final components | Agents supply minimal functional scaffolding and stable props/contracts |
| Human map teammate | T-08, geocoding, DealMap/pin confirmation, map-related portions of T-09/T-10/T-21, geospatial wiring | Keep coordinates and planned API names stable; agree shared-file ownership before changes |

## First checkpoint

Only T-01's functional scaffold is authorized by the kickoff. Fonts/palette/polish are handed to the frontend teammate. Deployment and live Convex validation may require human configuration. Report these as pending rather than marking the original T-01 done. T-02 and later tickets wait for a separate instruction and resolved dependencies.

## Later functional lane, one ticket at a time

Use the plan's ticket IDs and Depends column: T-02 schemas; T-03 auth/profiles; T-04 time/distance logic; T-05 extraction; then functional portions of T-07/T-09/T-10/T-11/T-12 and other separately assigned work. This list is orientation, not permission to execute all of it.

Preserve `lat` and `lng`, coordinate arguments, and function contracts for teammate integration. Do not implement a substitute map or silently remove pin confirmation. T-07/T-10 end-to-end acceptance stays pending until the teammate's map work is integrated. Plan backend deals/geospatial shared files jointly before implementation. No invented coordinates or sample/live evidence confusion.

Use plain accessible controls only where needed to test functionality. Loading/error behavior needed for a working ticket is allowed; visual polish, reveal animations, and final styling are teammate-owned. Solana is outside the first kickoff and needs its own assignment.

## Handoff

Each ticket reports ID/status, branch/checkout, changed paths, checks actually run, external dependencies, phone-only tests, and next action. Keep credentials out of handoffs. Do not claim the live feed works offline; cached extraction fixtures do not make Convex work without internet.


## Product direction update — October 3, 2026, America/Vancouver

Source: William's answers in the Codex interview. This section records the new human requirements and takes precedence over the earlier web-first, feed-home and Android-first assumptions. The original StormHacks plan and earlier handoffs remain historical records. Existing data/API contracts remain in force until an explicitly documented contract revision is agreed with their owners.

### Current status — reported or inspected, not acceptance evidence

- William explicitly confirms **T-01 and T-02 are DONE**, and the remaining tickets still need completion. This is the current ticket-status authority and supersedes older pending/uncommitted handoff wording. Reuse the foundation and schemas; do not reopen or reimplement those tickets. Native iOS compatibility and the new end-to-end phone acceptance belong to the remaining integration work. This confirmation does not fabricate new test results.
- William expects Xcode installation to take time. The read-only tooling check in this session returned `/Library/Developer/CommandLineTools` from `xcode-select -p`; `xcrun simctl list devices available` failed because `simctl` was unavailable. Full simulator tooling was not usable at that check. Download progress, eventual install location and iOS runtime availability were not verified.
- William reports that a teammate is actively building the Instagram-native sharing feature and has not pushed that work. The teammate's name, checkout, stack, payload contract and progress are unknown here. Do not infer absence of implementation from its absence on GitHub, or assign a duplicate implementation.
- Harry is building the frontend. William can preview it on his teammate's computer through localhost. William is unsure whether that frontend is merged into the local build. The preview does not establish a working iOS app or live backend integration.
- Pinyuan is building the map section. William is unsure whether map work is merged into the local build. Agent ownership remains functional core and agreed integration; Harry owns frontend appearance and Pinyuan owns maps, geocoding, pins and geospatial wiring.
- William says nothing is officially ready for live testing on his iPhone. No Instagram-to-DishDeals-to-map acceptance test on that phone has been reported as passing.
- The implementation's intended native iOS framework and delivery path have not been confirmed. Inspect the sharing teammate's actual project before choosing a native shell, bridge, dependencies or auth integration.
- Local read-only inspection in this Codex session found the root checkout on `t-02-schemas` at `356ec1b`, containing the Next.js/Convex scaffold and schemas. Existing sibling worktrees include auth, logic, distance, extraction, workflow, Gemini routing and tenets. Their existence does not establish task completion; inspect their status and handoffs before dispatching more work.
- Existing workflow files were located in `/Users/william/Code/DishDeals-worktrees/workflow/docs/agent-workflow.md` and `docs/workflow/tasks.json` within that checkout. They describe Northstar, Loom, Tempo and Prism. Discover the live team rather than recruiting another copy.
- Historical T-02 records describe a human-approved cloud development schema sync. That is distinct from William's current report that the full iPhone experience is not ready. Current credentials, providers, phone signing, live auth, extraction and app integration readiness remain unverified.
- This Codex desktop session cannot currently invoke the Maestri team: `maestri` is absent from PATH, `MAESTRI_CLI` is unset, and invoking the installed app-bundle CLI reports that `MAESTRI_SOCKET` is unset. The master prompt is intended to run inside Northstar's existing Maestri terminal. No agent messages or feature implementation were performed in this documentation update.

### Design vision and required behavior

1. **Shipping platform:** a real iOS app, installed and exercised on a real iPhone. Align development tools, framework, build targets and backend integration with that requirement. A browser localhost preview, Android share target or PWA alone does not meet it. The exact native implementation must be reconciled with the sharing teammate's work rather than guessed.
2. **Dominant feature and first demo:** from a reel in Instagram, use Instagram's native send/share feature to send it to DishDeals, let the VLM assist deal creation, then see the confirmed deal on the user's map. This is the centerpiece of the demo, not an optional stretch after screenshot upload. Determine the actual Instagram UI entry point and what it supplies on the real iPhone; do not conflate an in-Instagram DM with the iOS share sheet.
3. **Map home screen:** DishDeals opens to the map. The map is the primary way to see saved/published deals. Adapt the original feed-home assumption and original T-21 map-stretch priority accordingly. The shared community-deal backend remains the existing plan until ownership/visibility changes are explicitly decided; the phrase "my map" does not by itself authorize a private-only redesign.
4. **Additional inputs:** support screenshot upload and photographs of flyers as well as Instagram-native sharing. These remain usable paths to the same deal-creation process. Screen recordings were in the original plan; their first-demo priority was not answered in this interview.
5. **Deal-creation page:** provide a form containing all essential and optional deal information needed to save a deal in the database and place it on the map. Use the plan's restaurant, address, offer text, CAD price, valid weekdays/hours, expiry, conditions, coordinates, image and source fields as the starting contract. Distinguish required fields from optional fields; do not invent missing facts or coordinates.
6. **VLM assistance across sources:** the VLM should fill whatever it can support from the shared reel/source, screenshot or photo. William's wording was: "AI should be able to see the entire upload flow." Preserve enough source/payload context for extraction and inspect the entire import-to-publish integration. This requirement does not establish that Instagram supplies video bytes or that the AI has access to other apps' screens. Confirm any further intended meaning with William if it affects implementation.
7. **Uncertainty and autocomplete:** leave uncertain information for the user to enter or check. When a field is roughly "50% clear," a tentative autocomplete suggestion is allowed. Such a suggestion must be distinguishable from confirmed information, editable and explicitly accepted by the user; an unaccepted guess must not become a published fact. Blank/manual entry remains available when there is insufficient evidence. The original extraction schema's confidence fields cover only restaurant, price, hours and expiry; confidence for other fields needs an agreed adapter/contract, not fabricated probabilities.
8. **Full flow:** Instagram native share/send → DishDeals receives the actual payload → VLM-assisted editable draft → user resolves missing/uncertain required fields → Pinyuan's location/pin confirmation → publish to the database → deal visible on the map. Drafts and suggestions must not be presented as published deals.

### Scope and workflow adjustment

- William requested completion of **T-03 through T-21**, using completed T-01/T-02 as the baseline, plus the required native iOS integration. Northstar may coordinate successive dependency-ready batches under that overall assignment; each worker still receives one bounded ticket, hands off evidence and stops. Start with auth, validity/distance and extraction reconciliation where independent, while coordinating human data/map/share work. Maintain coverage of every remaining ticket; prioritizing the primary iPhone demo does not authorize silently omitting later tasks. The earlier T-01-only kickoff and no-automatic-next-ticket language do not restrict the new coordinator-level assignment when this master prompt is explicitly issued.
- Reconcile frontend, map, native share and backend contributions before selecting the shipping stack. Retain useful existing Next.js code as preview/shared logic where compatible; do not assume it is the iOS runtime or rewrite teammates' work without coordination.
- Treat native iOS integration as explicit additional work. Split/update affected original tickets in task packets without silently renaming canonical APIs or erasing the original backlog. T-13's Android PWA share mechanism is not the implementation or acceptance test for the newly required iOS flow. Map-home integration is core, not the original T-21 stretch, and remains Pinyuan-owned.
- Native-share integration depends on the sharing teammate's unpushed work and a real payload sample. Inspect whether the delivered item is a URL, text, image, video or a combination. A received URL is not evidence that the reel has been retrieved or analyzed. Do not scrape Instagram or build an unapproved downloader. If the payload lacks necessary source content, state the blocker and agree a supported path with the sharing owner; manual/screenshot fallback does not count as the dominant feature passing.
- Confirm the supported extension-to-app lifecycle, authentication/session handoff, durable payload storage, cancellation/retry behavior and signing requirements against the selected stack's current official documentation. Do not promise an automatic main-app launch or video access before testing it.
- Continue independent backend/form/logic work while waiting for teammate integration. Preserve human changes, existing agents, worktrees and checked-in contracts. Northstar alone maintains shared status.
- While Xcode/iOS tooling is pending, continue independent backend, deterministic logic, extraction/validation, form state, contracts, fixture preparation and documentation work. Native source can be prepared after stack/ownership agreement, with compilation pending. Use three separate milestones: implementation and currently available checks; native build/simulator checks after tooling is ready; actual Instagram share-to-map acceptance on William's iPhone. Track signing separately from simulator readiness. An unavailable simulator blocks its checks, not the entire project; synthetic payloads and browser previews do not establish native or Instagram acceptance. Do not change the shipping target to avoid the download or perform installation/system-toolchain changes without a setup assignment.
- No publication, push, cloud deployment/migration, App Store/TestFlight submission, account creation, purchase or domain claim is newly authorized by this documentation request. Local reviewable work and exact human setup instructions come first.

### Required demo evidence and unanswered decisions

The primary acceptance evidence is an installed app on William's iPhone: share a real reel from Instagram to DishDeals, receive the real input, populate an editable draft from accessible source content, confirm uncertain fields and location, publish, and observe the deal on the map. Record the exact UI steps, source item types, app/iOS/Instagram versions, timings and result. Test screenshot and flyer paths separately. Label fixture, simulator, localhost, live provider and real-device results separately.

Still unknown: the sharing teammate's name and stack; exact local/remote contribution locations; signing/provisioning readiness; payload contents; extraction provider/model readiness; credentials status; deadline; detailed scheduling of later features around the primary demo; whether "my map" requires a personal saved view alongside the existing shared community data. T-01/T-02 completion and the assignment to finish the remaining tickets are settled. Preserve other unknowns rather than choosing silently. Ask only decisions that block the next integration step.

Official iOS references for the integration owner to verify against the selected framework: [NSItemProvider](https://developer.apple.com/documentation/foundation/nsitemprovider) and [NSExtensionContext.open](https://developer.apple.com/documentation/foundation/nsextensioncontext/open(_:completionhandler:)). These references describe platform APIs; they do not verify Instagram's actual payload or the teammate's implementation.


## Active assignment authority

William issued the revised master assignment in Northstar’s Maestri session on October 3. Successive dependency-ready local batches T-03–T-21 and added native integration are now authorized; workers stop after one packet. T-01 and T-02 are DONE by William’s confirmation. Historical pending wording and coordinator stop-after-first-batch instructions are superseded. Remote pushes/PR publication, cloud sync/deployment, accounts, purchases, domain claims and platform submissions are not authorized by this assignment. See ADR 0002 and the coverage matrix.


Latest reply: William confirms Harry owns native Instagram sharing in a separate unpushed branch. Framework selection waits for that code. Harry also owns frontend. No other extension writer is assigned.

### Published native source received

Harry owns native sharing and frontend, now published `t-20-reel-sharing` at `547a74d` (William confirmed). Reuse SwiftUI/WKWebView app + UIKit share extension, as recorded in ADR0002. App/extension compile, auth/shared storage, map home and confirmed pin/publish interface remain integration gates. Pinyuan's published browser map requires compatibility agreement; no second map. Harry's assignment name T-20 Reel sharing does not renumber original T-20 domain task. Native work is tracked N-IOS/N-SHARE/N-FORM/N-BUILD/N-PHONE and adapted T-13. ScrapeCreators resolver/provider usage is disabled and unauthorized; no real extraction/device evidence. William signing setup not configured.

Latest navigation instruction from William: reuse Harry's Saved Posts/Reels app, switch to map when tapped. This takes precedence over earlier map-initial-home wording, while retaining real publish-to-map and original full-screen filtered-map acceptance. Harry/Pinyuan supply the map route/component; agents do not create a substitute.


### October 3: Pinyuan ownership transfer and next implementation batch

William confirms Pinyuan has stopped building and explicitly assigns agents to continue his parts. Reuse the latest published `feature/deal-map` commit `34c622c228e58e083e2aa2e9ffe630efcf97e09e`; do not create a second map. Cinder owns the isolated N-MAP-A component/package/draft-location slice. Prism owns T-08G-CORE policy/transport only, then a serialized durable backend gate/cache wrapper. Northstar owns final bindings and the single canonical geospatial component. Harry continues to own polished frontend/native sharing. Latest navigation remains Saved Reels entry with tap-to-map. No cloud/provider/phone acceptance inferred.

Loom owns N-SHARE-DRAFT, an approved additive private `reelItems` revision/edited state change. The existing `reels.saveDraft` name/null return remain; required expectedGeneration/expectedRevision reject stale overwrites. Retry retains edits; model output stays separate from user-edited drafts. Canonical deals/profiles/votes are unchanged. This functional contract revision is approved by Northstar under William's local integration assignment; no remote synchronization authorized. Mica owns controlled N-FORM-UI reusable canonical review controls, with injected location/publish hooks. Each worker stops at its bounded handoff.


### Supported reel source path

Northstar selects native link receipt plus user-attached recording of that reel, under William’s source-path discretion. It supplies real video/audio/caption without enabling the prohibited Instagram resolver. Reuse Harry’s native intake and VLM video pipeline; add an explicit attachment transition with authenticated storage ownership. This choice does not authorize provider/cloud usage or claim actual media receipt from Instagram. Its actual transitions and source association require real-phone verification. Screenshot/flyer acceptance remains separate.


### October 4 local integration checkpoint

William added his Apple Account in Xcode. Device trust, Team provisioning and installation remain pending. Reviewed canonical common form and private edit guards are integrated; map component continuation84fab5f is now locally integratedf81a56b. Location-picker callback `onInvalidate` is required before binding to publish validation. Selecting an extraction offer proposes fields without changing price input until acceptance. Next bounded functional mounting reuses Harry navigation/style and Pinyuan component; Northstar authorizes functional route/data bindings, Harry polish remains owned. Real source/phone, cloud target and HTTPS configuration still do not have passing evidence.

October4 phone milestone: William reports connected/trusted/Developer Mode enabled. CLI confirms one paired wired iPhone OS26.6.1 and Xcode build destination; developer-mode inventory still disabled, awaiting restart/confirmation reconciliation. No signed build/install/native runtime pass. New cpy pushes considered in published-updates audit and Cinder bounded correction, preserve canonical contracts.

October4 device milestone: William selected Personal Team for Dinedeals/ReelShare, automatic managed signing, then reports successful Xcode build with the real iPhone selected. Preserve ignored local Xcode project; do not regenerate away his team settings. Agent CLI app build failed Apple compiler-plugin sandbox, not reproduced as a source defect. Human build is separate evidence. App installation, App Group/Keychain runtime, actual Instagram share, supported media extraction and publish/map remain pending; website/backend placeholders still require concrete reviewed configuration.

October4 02:24: William authorizes agents to use iOS simulator and asks to accelerate. Actual installed iOS27.0 simulator iPhone17e isolated to Cinder built app+extension and exercised synthetic local Safari share sheet. Main app blank and recovery save blocked in unsigned configuration, not a live demo. William now explicitly authorizes DishDeals demo Vercel hosting and backed-up additive proper-marmot-82 dev sync plus existing-provider primary extraction/geocoding. Northstar releases ready functional loading/frame/tip lanes while Loom owns sole backend release. Real iPhone primary acceptance still pending. Human signing project preserved.

October4 continued checkpoint: backed-up additive development sync proper-marmot-82 applied with actual Convex typecheck enabled after a relative type-import correction. Data/file archive retained privately; existing workflow tables/functions preserved, no live deals/accounts seeded. Integrated401603c combined check PASS1728Vitest/23workflow/typecheck/lint/build. Native app+extension unsigned simulator build and unconfigured recovery overlay passed; live HTTPS/provider/phone remain pending. William now handles hosting manually after local Vercel CLI auth403; preserve reviewed /tmp/dishdeals-web-release401603c while he deploys. T15B/T13B review corrections dispatched; independent LoomT16B cache and CinderT03D safe auth return packets prepared. No cached genuine outputs or wallet/Android/phone passes claimed.
