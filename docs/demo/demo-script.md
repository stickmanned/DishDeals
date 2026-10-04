# DishDeals Demo Video Script (<= 3 Minutes)

- **Target Duration**: 2 minutes 45 seconds (Hard limit: 3 minutes 00 seconds).
- **Format**: Screen recording + physical phone camera capture (real iPhone on iOS 26).
- **Focus**: Native reel-to-map community sharing pipeline; map-home dominant experience.
- **Filming Status**: Pending William physical iPhone verification and Harry frontend source.

---

## Timing and Scene Breakdown

| Timestamp | Duration | Scene & Visual Action | Narration & Audio Cue | Stage Gate & Technical Notes |
| :--- | :--- | :--- | :--- | :--- |
| **0:00 – 0:25** | 25s | **Scene 1: Map-Home Opening**<br>App opens directly to the full-screen interactive community map in Vancouver. Colored pins show active deals near SFU/Burnaby. Tapping filter toggle demonstrates "$5", "$10", "$15", and "Any" filtering. Valid-now badges countdown in real time. | *"Finding great food deals shouldn't mean scrolling through endless social media feeds and trying to remember where and when they're valid. Welcome to DishDeals: a community-powered deal saver that turns fleeting Instagram food promos into verified, live map locations."* | Demonstrates pure `selectDeals` logic, strict `<` price thresholds, and Vancouver temporal engine (`validNow`). |
| **0:25 – 0:55** | 30s | **Scene 2: Real Instagram Reel Share**<br>Cut to Instagram app. William browses a real restaurant promo reel (e.g. happy hour burger special). Taps the iOS Share button. Selects **DishDeals** from the system share sheet. Native share extension opens with thumbnail preview and caption text. | *"When you spot a deal on an Instagram reel, you don't need to take a screenshot or write it down. Just tap Share and select DishDeals. Our native iOS extension receives the post's visual media and caption without scraping or downloading unauthorized content."* | **Gate Check**: Distinguish system share sheet from internal Instagram DM. Note that receiving a URL alone is an unsupported blocker; media/text payload required. |
| **0:55 – 1:30** | 35s | **Scene 3: Multimodal Extraction & Draft**<br>Transition into DishDeals draft review screen. Multimodal extraction analyzes the video frames/caption using Gemini. Form fields populate: restaurant name, CAD price, validity days, hours, and expiry. Confidence indicators highlight detected terms. | *"DishDeals processes the reel's visual frames and caption with Gemini multimodal AI, extracting the restaurant name, exact CAD price, operating hours, and expiry date. Everything is structured and editable—no hallucinated deals make it to the map without human confirmation."* | Shows `extractDeal` schema conformity and `DealDraft` reducer state. Mention demo fixtures (`fixtures/demo/<hash>.json`) as resilient fallback against slow networks. |
| **1:30 – 2:05** | 35s | **Scene 4: Pin Confirmation & Uncertainty Handling**<br>One field shows a yellow confidence indicator (< 0.6). User taps to confirm. Camera pans to Pinyuan's location pin selector: user drags pin or taps "Confirm Location" on the geocoded address. User demonstrates editing the restaurant name, showing how location confirmation is safely re-validated. | *"If a field has lower confidence—like a promotional condition or ambiguous hours—DishDeals highlights it for review. Most importantly, you explicitly confirm the restaurant's physical pin on the map. If you adjust the address, the pin confirmation updates safely before you can publish."* | Demonstrates contract: restaurant/address edits invalidate prior pin confirmation; unconfirmed locations block publish mutation. |
| **2:05 – 2:30** | 25s | **Scene 5: Publish & Live Reactive Map**<br>User taps **Publish Deal**. Loading spinner transitions instantly back to the Map Home. The new pin drops onto the map with a reveal animation. Tapping the pin opens the card showing the exact price, distance in km from user location, and "Valid for 3h 15m" badge. | *"One tap to publish, and the deal is instantly live for the entire community. Anyone opening the app sees the verified pin, exact distance, and real-time validity status in local Vancouver time."* | Demonstrates reactive Convex query updates (`deals.listNearby`) and client-side haversine distance (`distanceKm`). |
| **2:30 – 2:45** | 15s | **Scene 6: Fallbacks & Wrap-up**<br>Brief screen glance showing alternative manual post and photo flyer upload options. Closing title card with team names (William, Harry, Pinyuan, Antigravity agents). | *"Whether sharing directly from Instagram reels, photos, or flyers, DishDeals makes sure student and local food deals never expire in your saved folder again. Built for StormHacks 2026."* | Mentions screenshot/flyer upload as alternate input routes. Truthfully states that physical iPhone acceptance is pending final human recording. |

---

## Production & Filming Checklist for William

- [ ] **Device & App State**:
  - iPhone running verified iOS 26.
  - Native build signed via Xcode Personal Team.
  - Test account signed in with display name configured.
- [ ] **Lighting & Screen Capture**:
  - Good natural lighting; no harsh screen glare on the physical phone.
  - Clean background and stable phone mount or hands.
- [ ] **Truthful Fixtures Note**:
  - If network on stage is unstable, explain that SHA-256 fixture fallback protects demo continuity, but do not claim synthetic fixtures are real production receipts.
- [ ] **Audio Quality**:
  - Clear narration; no background noise.
  - Pacing matched to the 2m45s target.
- [ ] **Hard Cut**:
  - Video must strictly finish under **3:00** (Devpost rule).
