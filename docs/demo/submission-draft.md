# DishDeals — Devpost Hackathon Submission Draft

> **Submission Transparency Notice**: This submission draft factually distinguishes between implemented, unit-tested core modules and pending native iOS device integrations. No external Devpost submission, account registration, or production deployment is performed autonomously.

---

## Project Overview

- **Project Name**: DishDeals
- **Tagline**: Turning Instagram food promo reels into verified, real-time map deals.
- **Track & Event Alignment**: StormHacks 2026. (Specific category prizes and partner awards reflect kickoff target categories; official event eligibility and judging criteria remain subject to event verification).

---

## Inspiration

Students and food lovers regularly save local food promotions on Instagram, but those deals end up buried in saved collections. When you're actually hungry and nearby, it is difficult to know whether a deal is currently valid, what the restrictions are, or where the restaurant is located.

We designed **DishDeals** to address this problem: a map-centric utility designed to ingest shared Instagram promos, extract structured deal terms, verify physical locations with human confirmation, and display live validity countdowns in local Vancouver time.

*(Observed status: The conceptual problem and pure functional algorithms are verified in code; end-to-end user experience on iOS remains pending native integration).*

---

## What It Does (Intended User Experience vs. Observed Status)

1. **Map-First Deal Discovery**:
   - *Intended*: Open the app to an interactive MapLibre map displaying local deal pins sorted by temporal validity and straight-line distance, with price filter toggles ($5, $10, $15, Any).
   - *Observed Status*: Pure deal selection and strict `<` price filtering (`selectDeals`) is implemented and unit-tested; frontend MapLibre component binding by Pinyuan is pending integration.
2. **Native iOS Instagram Share Extension**:
   - *Intended*: Share a reel directly from Instagram via the iOS system share sheet to create an editable deal draft.
   - *Observed Status*: Share extension source by Harry is pending; no automatic containing-app launch is guaranteed by iOS extension architecture.
3. **Multimodal Extraction via Gemini**:
   - *Intended*: Multimodal AI reads visual frames and caption text to suggest restaurant, price CAD, active days, operating hours, and expiry.
   - *Observed Status*: Core extraction logic (`lib/extractCore.ts`) is implemented using injected REST API calls to Google Gemini's `generateContent` endpoint with strict Zod schema validation (`DealResult`). Model confidence values are non-calibrated self-assessments (0..1). **All** extracted suggestions require explicit human acceptance before publishing.
4. **Human-in-the-Loop Location Confirmation**:
   - *Intended & Implemented Rule*: Address text is editable, and coordinates must be explicitly verified and confirmed by the user before publishing. Any edit to the restaurant or address invalidates prior pin confirmation to prevent hallucinated coordinates.
5. **Real-Time Vancouver Validity Engine**:
   - *Intended & Implemented*: Client-computed temporal validity in America/Vancouver timezone (`validNow`) correctly resolves overnight windows (e.g. 9 PM to 2 AM), 23-hour and 25-hour daylight saving transitions, and inclusive calendar expiry dates.
6. **Community Verification**:
   - *Intended*: Community members vote deals "Still on" or "Expired".
   - *Observed Status*: Atomic vote counting mutation logic is implemented and reviewed (T-11A); live feed subscription integration remains pending.

---

## How We Built It

- **Frontend Architecture**: Next.js (App Router), React, Tailwind CSS. Map architecture based on MapLibre GL (raster/vector tiles).
- **Backend & Database**: Convex (document schema, relational tables, server actions, Convex Auth password authentication).
- **AI Integration**: Google Gemini API accessed via structured REST `fetch` requests with strict Zod schema parsing and repair mechanisms.
- **Pure Functional Core**:
  - `validNow`: Pure temporal logic with injected clock, calendar date interpretation, and DST boundary handling (29 unit tests).
  - `distanceKm`: Great-circle Haversine straight-line distance with antipodal clamping (34 unit tests).
  - `selectDeals`: Deterministic price filtering (strict `<` thresholding) and valid-first, nearest-second sorting (22 unit tests).
  - `dealDraft`: Reducer managing field editing, confidence review, and pin confirmation invalidation.

---

## Technical State: Implemented vs. Pending Verification

| Component / Feature | Current State | Evidence & Boundaries |
| :--- | :--- | :--- |
| **Data Schema & Zod Contracts (T-02)** | **Implemented & Synced** | Canonical schema defined; initial T-02 dev schema sync human-confirmed DONE. |
| **Auth & Profile Logic (T-03)** | **Implemented (Local)** | Password provider and profile management tested locally via `convex-test`. Cloud sync pending. |
| **Temporal Validity Engine (T-04A)** | **Implemented (Local)** | `validNow` unit-tested across all valid/invalid states, overnight tails, and DST transitions. |
| **Haversine Distance (T-04B)** | **Implemented (Local)** | `distanceKm` unit-tested across identical, antipodal, and real-world coordinates. |
| **Extraction Core (T-05A/R)** | **Implemented (Local)** | REST `fetch` implementation, Zod contract reconciliation, and prompt engineering verified. |
| **Deal Draft State (T-07A)** | **Implemented (Local)** | State reducer enforcing explicit field acceptance and pin confirmation invalidation verified. |
| **Deal Selection & Filter (T-09A)** | **Implemented (Local)** | Strict price filtering, valid-first sorting, distance omission, and tie-breaking verified. |
| **Votes Backend (T-11A)** | **Implemented (Local)** | Atomic vote mutation reviewed locally; full live integration pending. |
| **Native iOS Share Extension** | **Pending Source** | Harry native source and Xcode build commands unpushed. |
| **Map Component Binding** | **Pending Binding** | Pinyuan MapLibre component pending integration with deal selection. |
| **Physical iPhone Acceptance** | **Pending Device** | William physical iPhone (iOS 26) testing pending Xcode setup and native build. |
| **T-15 Solana Micro-Tipping** | **Unimplemented** | T-15 was identified as a parallel stretch track; not implemented in codebase. |
| **T-16 Demo Hash Fallback** | **Unimplemented** | Runtime SHA-256 fixture bypass is not implemented; no genuine production fixtures exist. |
| **T-20 Custom Domain & HTTPS** | **Pending Authorization**| Setup instructions prepared in runbook; no domain claimed or DNS modified. |

---

## Challenges We Ran Into

- **Timezone Boundary Mathematics**: Accurately evaluating temporal validity for deals crossing midnight (e.g. 9 PM to 2 AM) while accounting for Vancouver Daylight Saving Time (PST/PDT) where days have 23 or 25 hours. We solved this with a pure, runtime-independent temporal engine.
- **Coordinate Integrity without Hallucination**: AI models frequently generate incorrect coordinates when reading unstructured text. We solved this with strict state contracts: unconfirmed coordinates block publishing, and textual edits invalidate prior pin confirmations.
- **Scope & Privacy Boundaries**: Project requirements strictly exclude Instagram scraping. The application is designed strictly around user-initiated system share sheet inputs and direct user submissions, with no background scraping.

---

## What We Learned

- Structuring multi-agent pair programming with isolated Git worktrees, explicit ownership boundaries, and central guardrail checks.
- Designing deterministic, client-side temporal and sorting logic that offloads real-time compute from backend databases.
- The importance of strictly separating verified unit evidence from unobserved native mobile and device behaviors.

---

## What's Next for DishDeals

- Complete integration of Harry's native iOS Share Extension and Pinyuan's MapLibre map component.
- Execute real-device acceptance on William's iPhone under Xcode Personal Team signing.
- Add Android Web Share Target support.
