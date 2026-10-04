# Dinedeals frontend handoff

Status: **review ready for the responsive web UI; live integration and real iPhone acceptance pending**. This implements the user's new frontend assignment. It does not advance the repository's backend task manifest.

- Branch: `t-18-frontend`.
- Worktree: `C:/Users/fengy/.codex/visualizations/2026/10/04/01a10492-f700-7ec2-81cf-efb88da34cd2/dinedeals-frontend`.
- Base: `d69529d495fbc76b80009fbfc78af6ed96fe5e04`.
- Human-owned `main` remains unchanged. No backend merge, deployment, migration, or cloud mutation was performed.
- Refined request and constraints: [build brief](build-brief.md). Inspected feature inventory: [source inventory](source-feature-inventory.md).

## What is built

The UI follows the supplied Dinedeals brand kit: Bricolage Grotesque headings, Figtree body/buttons, DM Mono prices/data, exact kit colors, warm cream and white surfaces, stone borders, rounded cards, plate-pin wordmark, and restrained red primary actions. The inspiration's search, price pills, photo-led cards, compact heading, and mobile navigation structure are used. Fonts are local and their OFL licenses are included. Food images illustrate fictional sample offers only; live rows never borrow these photos, authors, vote counts, discounts, addresses, or coordinates.

| Feature                   | Implemented behavior                                                                                                                    | Actual backend readiness                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Discover                  | Search, strict under-price filters, valid-now filter, valid-first/recent sorting, loading/empty/error/retry states, photo fallbacks     | Optional source-backed workflow list adapter; no canonical feed endpoint on main     |
| Validity                  | Browser clock, Vancouver calendar/day/time, overnight schedules, date boundaries, unknown schedule handling, foreground refresh         | Client logic; no fake server validity                                                |
| Details                   | Offer, conditions, schedule, expiry, image dialog, source link, existing verified location when supplied                                | Lookup within the bounded public workflow feed; no public single-deal lookup         |
| Sign-in                   | Email/password, account-mode switch, reveal control, safe return route, explicit local preview                                          | Requires a real auth adapter; current backend validates existing JWT identities only |
| Profile                   | Preview name/wallet validation, own preview posts, dirty sign-out confirmation                                                          | Real profile/My posts endpoints absent; live save remains disabled                   |
| Source entry              | Gallery/camera input, copied text, original date/link, limits, image preparation, navigation-preserved draft and discard confirmation   | `jobs:submit` adapter verified on teammate source; no extraction is simulated        |
| Job status                | Queued/processing/completed/failed/no-deal, multiple outcomes, duplicate job, state-limited retry, job URL for refresh/sign-in recovery | `jobs:get/retryJob`; needs real endpoint and owner JWT                               |
| Workflow review           | Read-only extraction/evidence/confidence/reasons, existing candidate selection, explicit approve/reject, completed outcome state        | `deals:reviewDeal`; cannot save edited extracted fields or arbitrary coordinates     |
| Manual review/edit/delete | Validated local preview form; separate edit drafts; explicit local completion and deletion                                              | Canonical create/update/remove absent; no live writes are fabricated                 |
| Feedback                  | One local preview selection, vote switching, sign-in gate, explicit example counts                                                      | Votes API absent; live controls do not cast votes                                    |
| Connection                | SDK-backed connecting/reconnecting message; cached live rows marked potentially stale                                                   | Implemented from installed Convex SDK; network behavior not live-tested              |

Full-screen maps, geocoding, editable pins, directions, location permission/distance integration, recording extraction, native sharing, tipping, and submission history are not implemented here. The inventory marks many of these optional or dependent on missing contracts. Existing map-owner/backend lanes were not changed. The inventory describes native iOS; this work uses the existing Next.js app with iPhone layouts because no native project/framework or subsequent target clarification was supplied. It is not a native iOS application.

## Verified integration boundary

Main contains the canonical schema and `test.ping` only. Teammate `feature/dishdeals-initial-implementation` at `e3a39cc3398a0e0866e5dbe4e606f7e06b2ed2ca` contains a **separate** workflow backend. Its schema and IDs differ from main. The frontend uses typed function references and strict parsing of its verified payloads; none of that backend implementation was copied or merged.

| Reference                    | Arguments                                               |
| ---------------------------- | ------------------------------------------------------- |
| `deals:listForMap`           | `{ limit: 100 }`                                        |
| `jobs:submit`                | `{ inputJson: JSON.stringify({ source }) }`             |
| `jobs:get` / `jobs:retryJob` | `{ jobId }`                                             |
| `deals:reviewDeal`           | `{ dealId, decision: "approve" \| "reject", placeId? }` |

To connect an already approved workflow deployment, provide its public URL as `NEXT_PUBLIC_WORKFLOW_CONVEX_URL` in local configuration, and pass an `AuthAdapter` to `FrontendProvider`. The adapter must supply a real owner-scoped JWT through `useAuth().fetchAccessToken`; optional sign-in/sign-out handlers enable those actions. Keep integration tokens, provider keys, and secrets server-side. Do not point these references at main's canonical deployment. The original `ConvexClientProvider` and its configuration remain untouched. No `.env*` file was created or committed.

Without that URL, the app opens a clearly labeled fictional preview. Preview sessions, profiles, posts, votes and drafts stay in React memory in the current tab; reload/sign-out clears them. They never authorize live calls. Switching feeds confirms before discarding a dirty draft. Submitted job IDs alone can appear in `/post?job=...`; source text/images and credentials never enter the URL. Real server ownership checks remain authoritative.

The workflow accepts copied text or inline base64 images, not Instagram scraping. Preparation converts supported JPG/PNG/WebP to JPEG, strips metadata, limits the longest dimension to 1280 and base64 to 450,000 characters. Public source URLs must match the inspected backend's HTTPS, hostname, credentials, port, and 2048-character constraints. Public feed records reject malformed schedules, wrong timezones, unsafe source links and contract mismatches as a whole. Unknown prices remain in every budget filter; non-CAD amounts are not silently converted.

## Checks actually run

Final code checks:

- `npm.cmd run typecheck`: exit 0.
- `npm.cmd run lint`: exit 0, no warnings.
- `npm.cmd test`: exit 0, **94 tests in 3 files pass**, including the 7 existing canonical-schema tests. Added tests cover Vancouver/overnight/calendar boundaries, unknown price/currency, feed contract rejection, safe return/source URLs, draft validation and retry states. These are local tests, not evidence of live auth/extraction.
- `npm.cmd run build`: exit 0; Discover, sign-in, profile, post, details and not-found routes compile.
- `git diff --check`: checked before the scoped commit.

`npm.cmd run check` was attempted. Its unchanged workflow suite passed **22/23** tests and failed `rejects a worktreeParent symlink that escapes the sibling location` with Windows `EPERM` from `symlinkSync` at `scripts/agent-workflow.test.mjs:121`. This is an environment permission blocker; the full `check` command is **not green**. Build was run separately and passed. No test/script was changed to suppress the failure. Repository-wide CI remains unverified.

Browser verification used the local development and production builds. Production captures use 1440×1000 and 390×844 viewports; these are browser viewports, not physical iPhone evidence. Checked search/empty/reset, price results (6 to 5 under $10), filter sheet, image dialog/Escape, sign-in return, preview feedback switching, source provenance surviving navigation, date/time edits, required review confirmation, local completion, author edit, new-source navigation after edit, profile save, deletion confirmation, and dirty sign-out/feed-switch confirmation. Local sample image preparation produced a 1200×1200 JPEG with 300,564 base64 characters, below the verified backend limit.

Screenshots in [screenshots/](screenshots/) cover desktop feed/sign-in/source and mobile feed/source/review/detail/profile. Independent visual review checked brand tokens/fonts/radii, hierarchy, clutter, overflow, and controls. Wrapped mobile action labels were corrected and independently confirmed. Final production browser console inspection returned zero captured error entries. Feed-switch navigation/recovery also passed in the final production build.

Independent read-only frontend review found and resolved unsafe return routes, misleading error recovery, lost provenance/edit drafts, edit-image mixing, post-edit navigation, source-link constraint mismatch and silent feed-switch discard. A separate fresh agent audited backend preservation without relying on implementation conclusions: **123 protected files match baseline; zero changed/missing; all 10 Convex files remain; no backend additions/deletions/merges; main unchanged**. See [backend audit](backend-audit.md).

## Changed paths and human acceptance

Changes are confined to `app/`, new `components/frontend/`, new `lib/frontend/`, `public/` and `docs/frontend/`. Existing backend/generated APIs, canonical libraries, provider components, packages/lock, workflow tooling and ownership documentation remain intact. The commit's file list is the exact change inventory.

Local review: `npm.cmd ci`, `npm.cmd run build`, then `npm.cmd run start -- --hostname 127.0.0.1 --port 3002`. The current production preview is `http://127.0.0.1:3002`. Open **Try the preview** to exercise account/post screens. Nothing is published.

Human setup/phone checks pending: choose responsive web versus native iOS; reconcile the actual backend/deployment with the canonical contract; supply real auth; test approved live text/image submission, duplicates, rate limits, retry and candidate approval as multiple owners; inspect denied camera access and Safari/large text/safe areas on a physical iPhone using an approved HTTPS preview; measure extraction/publication and two-device feed latency. No deployment, real sign-up, live extraction, live publication, performance target or devnet transaction is claimed.

Stop condition: frontend is available for review; backend changes remain outside this assignment. Next proposed task is backend/auth contract reconciliation and approved live frontend integration (the existing T-05R/T-03 lanes), **not dispatched**. Northstar retains integration authority.
