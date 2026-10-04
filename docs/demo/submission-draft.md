# DishDeals — Devpost Hackathon Submission Draft

> **Submission Note**: This draft reflects the authentic technical state of the DishDeals project for StormHacks 2026. Implemented core modules and pending native device integrations are factually distinguished. No external submission or account creation is performed autonomously.

---

## Project Overview

- **Project Name**: DishDeals
- **Tagline**: Turning fleeting Instagram food promo reels into verified, real-time map deals.
- **Target Track & Prizes**:
  - Primary Track: General Hackathon Track / Community Utility.
  - Category / Partner Prizes:
    - Best Use of Google Gemini API (Multimodal Structured Extraction).
    - Best Domain Name (`.tech` via MLH / Namecheap — T-20 setup prepared).
    - Solana Devnet Micro-Tipping (T-15 prototype — secondary / stretch track).

---

## Inspiration

Every student and local foodie knows the feeling: you see an incredible 50% off ramen promo or $5 burger deal on an Instagram reel, tap "Save to Collection", and completely forget about it. Two weeks later, you're hungry and nearby, but you have no idea if the deal is still active, what the conditions were, or where the restaurant is located.

We built **DishDeals** to bridge the gap between social media food promotions and real-world hunger: turning saved reels into an interactive, real-time community map where deals are filterable by price, sorted by proximity, and countdown-verified in local Vancouver time.

---

## What It Does

1. **Map-First Community Feed**: Open the app and instantly see active food deals around you, complete with price badges, walking distance in kilometers, and time-left countdowns.
2. **Direct Instagram Share**: From Instagram, tap Share on any promo reel and select DishDeals to start a deal draft without tedious manual typing.
3. **Multimodal AI Extraction**: Google Gemini (gemini-3.8-flash) reads reel visual media and captions, extracting structured fields: restaurant name, exact CAD price, active weekdays, operating hours, and expiry dates with schema-enforced confidence scores.
4. **Human-in-the-Loop Confirmation**: Lower-confidence fields require user review before publishing. Posters physically confirm or adjust the map pin, ensuring no hallucinated coordinates ever reach the community map.
5. **Real-Time Validity Engine**: Client-computed validity in America/Vancouver timezone handles complex edge cases—including overnight windows (e.g. 9 PM to 2 AM), daylight saving transitions (PST/PDT), and inclusive expiry dates.
6. **Community Trust & Voting**: Users vote deals "Still on" or "Expired" to maintain feed freshness without scraping social platforms.

---

## How We Built It

- **Frontend & Map**: Next.js (App Router), React, Tailwind CSS, OpenStreetMap / Leaflet geocoding and pin placement.
- **Backend & Database**: Convex (reactive real-time subscriptions, relational document tables, server-side actions, Convex Auth password authentication).
- **AI & Extraction**: Google Gemini API via official SDK with strict Zod schema validation (`DealResult`) and confidence scoring.
- **Core Algorithms**:
  - `validNow`: Pure temporal validity engine with injected clock, calendar date interpretation, and DST boundary handling.
  - `distanceKm`: Great-circle haversine calculation with antipodal clamping.
  - `selectDeals`: Deterministic price filtering (strict `<` thresholds: $5, $10, $15, Any) and valid-first, nearest-second sorting.
- **Testing & Tooling**: Vitest (120+ unit tests across functional modules), TypeScript, and central workflow guardrails.

---

## Factual Implementation Status

| Capability / Module | Status | Details |
| :--- | :--- | :--- |
| **Data Schema & Zod Contracts** | **Implemented** | Canonical `deals`, `users`, `profiles`, `votes` tables and Zod `DealResult` schema. |
| **Auth & Profiles (T-03)** | **Implemented** | Convex Auth with password provider and display name profile management. |
| **Temporal Validity (T-04A)** | **Implemented** | `validNow` unit-tested across all states, overnight tails, and spring/fall DST transitions. |
| **Haversine Distance (T-04B)** | **Implemented** | `distanceKm` unit-tested across identical, antipodal, and real-world coordinates. |
| **Extraction Core (T-05A/R)** | **Implemented** | Gemini prompt engineering, schema reconciliation, and input verification. |
| **Deal Draft State (T-07A)** | **Implemented** | Reducer managing field edits, confidence reviews, and pin confirmation invalidation. |
| **Deal Selection & Filter (T-09A)** | **Implemented** | Strict price filtering, valid-first sorting, distance omission, and tie-breaking. |
| **Votes Backend (T-11)** | **Implemented** | Atomic voting mutation ensuring one vote per user per deal. |
| **Native iOS Share Extension** | **Pending Integration** | Frontend source (Harry) and physical device testing (William) pending. |
| **Interactive Map UI Binding** | **Pending Integration** | Pinyuan geospatial map and pin confirmation component pending frontend binding. |
| **Live Backend & HTTPS Domain** | **Pending Authorization** | Convex cloud sync and T-20 `.tech` domain DNS configuration prepared in runbook. |
| **Solana Devnet Tipping (T-15)** | **Prototype / Stretch** | Wallet address profile field prepared; devnet tipping cut if time exceeds limit. |

---

## Challenges We Ran Into

- **Temporal Complexity & Timezones**: Evaluating deal validity across midnight boundaries (e.g. 9 PM to 2 AM) while properly respecting inclusive expiry dates and Daylight Saving Time shifts (23-hour vs 25-hour days in Vancouver). We solved this with a pure runtime-independent engine (`validNow`) verified against 29 rigorous temporal test cases.
- **Non-Hallucinatory Geolocation**: LLMs frequently hallucinate street coordinates. We instituted a strict human-in-the-loop requirement: address text is geocoded, but the user must explicitly confirm the pin position on the map before publishing is permitted.
- **Zero-Scraping Security**: Instagram links cannot be legally or reliably scraped. Instead of automated URL resolution, DishDeals relies entirely on user-initiated system share sheet inputs and direct user submissions, keeping server secrets completely off the client.

---

## What We Learned

- How to structure agentic and human pair-programming pipelines with strict worktree isolation and ownership contracts.
- How to write deterministic, timezone-aware client calculations that offload real-time queries from cloud databases.
- The intricacies of iOS extension memory constraints and Apple Personal Team provisioning limits.

---

## What's Next for DishDeals

- Android native Share Target support via Web Share Target API.
- Transit route integration (e.g. TransLink bus/SkyTrain ETA to the deal).
- Direct restaurant owner verification portal.
