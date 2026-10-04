# Handoff: DishDeals iOS · Liquid Glass Refinement

## Overview
Refinement of the DishDeals iOS app (find affordable food deals nearby; share deals from Instagram Reels, screenshots or flyers). Existing layouts, navigation, features and copy are preserved. Floating controls gain an Apple-style Liquid Glass material; content (prices, forms, cards) stays opaque.

## About the Design Files
`DishDeals App.dc.html` and `DishDeals Liquid Glass System.dc.html` are **design references built in HTML**: prototypes of intended look and behavior, not production code. Recreate them in the real app's environment (SwiftUI / UIKit / React Native, whatever it uses) with its existing patterns and libraries. On iOS 26+, prefer native Liquid Glass APIs (`glassEffect`, `GlassEffectContainer`, `.buttonStyle(.glass)`) instead of copying the CSS; the CSS recipe below shows the intended look.

## Fidelity
**High-fidelity** for color, type, material, spacing and layout. Food photos are gradient placeholders; use real photography. Map is a stylized stand-in for the real map view.

## Material: Liquid Glass (use only for floating controls)
Recipe (regular glass):
- fill `rgba(255,255,255,.42–.55)`, `backdrop-filter: blur(14px) saturate(190%)`
- border `1px rgba(255,255,255,.6–.7)`
- inner rim: `inset 1.5px 1.5px 1px rgba(255,255,255,.9)`, `inset -1px -1px 1px rgba(255,255,255,.4)`
- drop shadow `0 10px 30px rgba(23,18,16,.14)`
- Variants: **Clear** fill .14–.22, blur 2–8 (icon-only buttons over media); **Tinted** brand red `rgba(242,46,79,.9)` + red shadow `0 12px 28px rgba(242,46,79,.42)` (primary CTA); **Dark** `rgba(23,18,16,.88)` (selected chip, Apple button); sheet blur 22.
- Rules: no prices/conditions/long copy on glass; max two glass layers on screen; no glass fill below .40 white behind text; controls ≥ 48pt (nav back/tab targets ≥ 44).

## Design Tokens
- Colors: ink `#171210`, brand `#F22E4F`, brand-dark `#C81F3D`, canvas `#F8F4EF`, price bg `#FFF0D3`, price text `#8a5a00`, muted `#6b625b`, hint `#8a817a`, card `#FFFFFF`, border `#E6DDD3`, chip-inactive/track `#EDE5DB`, success `#237A4B` on `#E6F4EA`, selected tint `#FFE4E8`, warning border `#E8B54D`, map land `#E9EFDF`, water `#B8DCE8`, park `#CFE2BD`.
- Font: Inter 400/500/600/700 (SF Pro on native is acceptable). Headline 32–34/1.05, weight 600–700, tracking -0.03em. Title 20–22. Body 14–16. Eyebrow 11, weight 600, tracking .06em, brand red, uppercase.
- Radius: pill 999; glass panel 28–32; cards 24–28; inputs 16; rows 16–18.
- Spacing: 4/8/12/16/20/24. Screen side padding 20. Phone 390×844.
- Motion: spring `cubic-bezier(.3,1.4,.5,1)` 350ms for selection thumbs; press scale .98.
- Logo: `logo.png` (official mark) + wordmark "dish" ink + "deals" brand red, weight 700, tracking -0.02em.

## Screens (12) — in `DishDeals App.dc.html`
1. **Map home**: full-bleed map. Glass: logo pill (top-left), "Vancouver · 1.2 km" pill (top-right), search bar (52h, filter button inside), filter chips (Open now = dark selected, Under $10, Walking), price pins (white; selected = dark), floating tab bar. Opaque deal card above tab bar (116px photo left; "LA PALOMA" red eyebrow, title 18/600, "Today until 6 pm · Dine-in", price strip `$6` / struck `$12`).
2. **Discover feed**: logo + profile button; eyebrow "GOOD FOOD. A LITTLE LESS."; H1 "Find your next good meal."; search (opaque white here); price chips (Any price, Under $5, Under $10, Valid now); "Nearby deals · 12 live today" + "View all ›"; horizontally scrolling 300px opaque deal cards (140h photo, place eyebrow, distance, title, schedule, price strip).
3. **Instagram native share**: dark Reel background; glass bottom sheet (handle, link preview row, targets AirDrop/Messages/DishDeals/More, opaque row "Extract deal with DishDeals" → starts extraction).
4. **Extraction progress**: step header 1 of 4; eyebrow "SOURCE RECEIVED"; H1 "Finding the useful bits…"; concentric rings with tinted glass percent orb; task rows (Reel received, Restaurant & offer, Price & valid time: Done/Reading); privacy note. Auto-advances to draft at 100%.
5. **Editable deal draft** (2 of 4): "82% matched" pill; fields Restaurant, Deal title, Deal price, Regular price, When is it valid? and Conditions (amber border + "Check this" tag + helper text); CTA "Confirm uncertain details".
6. **Confirm uncertain details** (2 of 4): two radio cards (deal end: Today at 6:00 pm / Today at closing / Not sure; redeem: Dine-in only / Dine-in or takeout). Selected = `#FFE4E8` bg, 1.5px brand border, filled dot. CTA "Confirm & choose location".
7. **Location confirmation** (3 of 4): H1 "Pin the right La Paloma."; mini map with glass search and red pin; selectable place rows; CTA "Use this location".
8. **Publish review** (4 of 4): "Ready for the map?"; preview card; facts list (Location, Expires, Source); acknowledgement checkbox (CTA disabled at .45 opacity until checked); CTA "Publish deal".
9. **Published on map**: map with red "$6 NEW" pin, locate button, success card ("You put dinner on the map." / "La Paloma’s $6 deal is live until 6 pm.").
10. **Screenshot and flyer intake**: mode segmented control (Screenshot / Take photo / Type it in), photo preview with green "Text detected" glass chip and glass Retake/Crop buttons, hint box, CTA "Use this photo".
11. **Share a deal sign-in**: three entry tiles (Share a Reel → 3, Add a photo → 10, Type it in → 5); sign-in card (Continue with Apple dark, Continue with email, "New here? Create an account"); privacy note.
12. **Saved deals sign-in**: "Save it for later." with blurred list preview and glass lock note; sign-in card.

Step header (flow screens): glass back button 44px, centered title, badge ("n of 4"/"New"), 4-segment progress (Extract, Details, Location, Review), done segments brand red.
Tab bar: glass pill, 4 items (Discover, Map, Share a deal, Saved), active = `rgba(255,228,232,.85)` capsule with brand-dark label/icon.

## Interactions & State
- Navigation: tab bar switches root screens; back button goes to previous flow step; Share tiles/Reel extract enter the flow; Publish → Published on map.
- State: current screen, extraction progress (0–100, ~4% per 120 ms, then auto-advance), signed-in flag, selected price chip, map chip, end-time option, redeem option, location option, review acknowledgement, intake mode.
- Review facts reflect chosen end time and location.
- Pressed CTA: scale .98; hover (web) brightness 1.06.
- Responsive: fixed 390×844 artboard; adapt to device safe areas natively.

## Assets
`logo.png` (user-supplied official mark). Photos: placeholders, replace with real images. Icons: simple 1.8px-stroke line icons (SF Symbols equivalents recommended).

## Files
- `DishDeals App.dc.html` — full interactive prototype
- `DishDeals Liquid Glass System.dc.html` — material, tokens, component specimens
- `logo.png`
