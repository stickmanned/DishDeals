# DishDeals Conditional Demo Script (<= 3 Minutes)

> **Notice**: This storyboard is a conditional production plan for future filming *after* William's physical iPhone passes the acceptance gates in `docs/demo/iphone-acceptance.md`. Native iOS transitions, actual Instagram share sheet payloads, and UI bindings remain unobserved until integrated on the physical device.

- **Target Duration**: <= 3 minutes (per original StormHacks plan target; Devpost current duration limits unverified).
- **Format**: Real physical iPhone camera + screen capture.
- **Orientation**: Map-home dominant experience.

---

## Conditional Storyboard

### Scene 1: Map-Home Opening (0:00 – 0:25)
- **Visual Action**: App launches directly into the interactive Vancouver map (MapLibre raster/vector tiles). Active local deal pins are visible around the campus area. Toggle between price filters ("Any", "$5", "$10", "$15") demonstrating strict `<` thresholding and "price varies" inclusion. Pins show status countdown badges (or "No expiry listed" with `unknown` validity per plan edge case 2).
- **Narration Cue**: *"Finding local food deals usually means endless scrolling through social feeds and forgetting where or when they're valid. DishDeals turns fleeting food promos into a verified, real-time community map with live Vancouver validity countdowns and strict price filtering."*

### Scene 2: Real Instagram Share to DishDeals (0:25 – 0:50)
- **Visual Action**: Switch to Instagram on the physical iPhone. Open a local restaurant promo post. Tap the system share button and select DishDeals from the native iOS Share Sheet.
- **Technical Note & Blocker Check**:
  - Distinguish system share sheet from Instagram internal DM.
  - If the incoming payload provides a URL only without accessible media/text, the script demonstrates the safe unsupported URL blocker and routes to manual/fallback entry. No automated web scraping of Instagram is performed.
- **Narration Cue**: *"When you spot a food deal on Instagram, tap Share to DishDeals. Our native share extension receives the user-supplied post context directly from the system share sheet without unauthorized background scraping."*

### Scene 3: Multimodal Extraction & Draft Review (0:50 – 1:30)
- **Visual Action**: Transition into DishDeals editable deal draft. The system performs multimodal extraction via injected Gemini API REST fetch, generating editable fields: restaurant, price CAD, days, hours, and expiry.
- **Technical Note & Caveat**:
  - Model confidence scores are self-assessments (0..1), not calibrated probabilities.
  - **All** extracted fields require explicit human acceptance before publishing, not just low-scoring ones.
  - Note: In demo environments on unstable networks, pre-computed fixtures (`fixtures/demo/<hash>.json`) serve as an emergency fallback, but are distinct from genuine live extraction.
- **Narration Cue**: *"Gemini analyzes the promo visuals and caption via structured REST extraction, suggesting the restaurant, price in CAD, valid hours, and expiration date. Every field is an editable suggestion that requires explicit human review."*

### Scene 4: Uncertainty Handling, Late Edits & Location Pin (1:30 – 2:10)
- **Visual Action**:
  - **Error/Retry**: Demonstrate handling an ambiguous field or transient extraction error with clear retry/manual fallback.
  - **Late Edit**: User adjusts the restaurant name or address text; demonstrate that editing the location text safely invalidates the previous pin confirmation.
  - **Pin Placement**: User opens Pinyuan's map pin interface, drags or confirms the exact physical coordinates (`lat`, `lng`), completing the location requirement.
- **Narration Cue**: *"To prevent coordinate hallucination, DishDeals enforces a strict human-in-the-loop requirement: you explicitly verify and confirm the pin on the map. If you edit the address, the pin confirmation is invalidated until re-confirmed."*

### Scene 5: Publishing & Live Community Map (2:10 – 2:40)
- **Visual Action**: Tap **Publish Deal**. The mutation saves to Convex, and the Map Home immediately reflects the new deal pin. Tapping the pin displays the deal card with straight-line Haversine distance (`distanceKm`) from user location and computed local validity.
- **Narration Cue**: *"Once published, the deal is instantly live for the community. The feed sorts valid deals first, then nearest by straight-line distance, with accurate local Vancouver validity."*

### Scene 6: Input Fallbacks & Wrap-up (2:40 – 2:55)
- **Visual Action**: Brief screen showing alternative manual photo flyer upload and screenshot fallback routes (noting these are separate fallback acceptance paths). Closing slide with team member names and StormHacks project link.
- **Narration Cue**: *"Whether shared via Instagram, photo flyer, or screenshot, DishDeals keeps community deals accessible and verified. Built for StormHacks 2026."*

---

## Production Caveats
- No containing-app automatic-open promise; transition behavior depends on Harry's final native Share Extension source.
- Physical filming, timing rehearsals, and Devpost submission remain pending William's physical device verification.
