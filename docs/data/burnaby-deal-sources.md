# Real Burnaby Food Deal Evidence Candidates (T-06A)

**Ticket:** T-06A  
**Research Specialist:** Prism  
**Access Date:** 2026-10-03  
**Target Area:** Burnaby, BC / Simon Fraser University (SFU Burnaby Mountain & UniverCity)  
**Status:** 11 Genuine Food Offer Candidates Evidenced from Official Websites

---

## 1. Scope, Methodology & Guardrail Compliance

This document records genuine, currently available restaurant and promoter food deals located in Burnaby, BC and near Simon Fraser University (UniverCity / Burnaby Mountain).

### Strict Operating Rules Observed:
1. **Zero Instagram Scraping / Fetching / Resolvers:** No Instagram endpoints, GraphQL APIs, or third-party mirrors were contacted. Indexed public web mentions served only as discovery leads; every candidate in this report was corroborated against official, primary restaurant websites.
2. **No Assumed Canadian Currency (CAD):** Even though Burnaby is in British Columbia, Canada, prices published solely as `$` are recorded with currency confirmation marked as **pending** rather than assumed to be CAD.
3. **No Fabricated Expirations:** Lunch specials and regular weekly happy hours without published sunset dates are recorded with `expiresOn: null`. Unknown expiration is not converted into artificial current validity.
4. **No Guessed or Geocoded Coordinates:** In accordance with project instructions, all geographic coordinates (`lat`, `lng`) are strictly omitted pending Pinyuan's map integration and human-confirmed map pins.
5. **No Synthetic Confidence Scores:** These are source evidence candidate records, not VLM/LLM model extractions. No artificial confidence metrics have been attached.
6. **No Fabricated Photos or Flyer Claims:** Digital website banners and menus are recorded as public ad assets (`adImageUrl`); they are explicitly distinguished from real photographed physical flyers.
7. **Exclusion of Expired Festival Offers:** The historical "Bite of Burnaby" festival ran in March and is expired; it has been excluded from active demo candidates.

---

## 2. Summary Evidence Table

| ID | Restaurant | Stated Address | Paraphrased Offer | Stated Price | Currency Evidence | Valid Days | Valid Hours | Expiry | Key Conditions | Primary Source URL |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CAND-01** | Tenen Restaurant | 7569 Royal Oak Ave, Burnaby, BC V5J 4J8 | Lunch Special: Spaghetti Bolognese with meat sauce | $7.95 | `7.95 $` (Pending CAD confirmation) | Mon–Sun (Daily) | 10:30–Open | `null` (Ongoing) | Lunch special menu item | [Tenen Lunch Specials](https://www.tenenrestaurant.com/lunchspecials) |
| **CAND-02** | Tenen Restaurant | 7569 Royal Oak Ave, Burnaby, BC V5J 4J8 | Lunch Special: Soup of the Day (cup of daily soup) | $7.95 | `7.95 $` (Pending CAD confirmation) | Mon–Sun (Daily) | 10:30–Open | `null` (Ongoing) | Lunch special menu item | [Tenen Lunch Specials](https://www.tenenrestaurant.com/lunchspecials) |
| **CAND-03** | Tentatsu Japanese Restaurant | 4266 Hastings St, Burnaby, BC | 10% off Take Out orders of $30 & up (before taxes) | 10% off ($30+ min) | `$` symbol on min order (Pending CAD confirmation) | Mon–Sun (Daily) | 11:00–21:30 | `null` (Ongoing) | Phone call orders only; take out only | [Tentatsu Official Site](https://www.tentatsusushi.com/) |
| **CAND-04** | Argo Greek | Unit 108 – 3790 Canada Way, Burnaby, BC V5G 1G4 | Lunch Special: Chicken Souvlaki Platter (salad, rice, potato, tzatziki, pita) | $22.00 | `$22` (Pending CAD confirmation) | Mon–Sun (Daily) | 11:30–14:30 | `null` (Ongoing) | Lunch hours only; smaller lunch portion | [Argo Greek Menu](https://www.argogreek.ca/menu/) |
| **CAND-05** | Argo Greek | Unit 108 – 3790 Canada Way, Burnaby, BC V5G 1G4 | Lunch Special: 6 oz Lunch Skewer (Chicken or Lamb) | $12.00 | `$12` (Pending CAD confirmation) | Mon–Sun (Daily) | 11:30–14:30 | `null` (Ongoing) | Lunch hours only; smaller lunch portion | [Argo Greek Menu](https://www.argogreek.ca/menu/) |
| **CAND-06** | Burnaby Mountain Restaurant | 7600 Halifax St, Burnaby, BC V5A 4M8 | Happy Hour: Truffle Fries (truffle oil, Grana Padano, parsley) | $8.00 | `$8.00` (Pending CAD confirmation) | Wed–Sun | 14:30–16:30 | `null` (Ongoing) | Happy Hour dine-in pricing Wed–Sun | [Burnaby Hospitality HH](https://burnabyhospitality.ca/burnaby-mountain-happy-hour) |
| **CAND-07** | Burnaby Mountain Restaurant | 7600 Halifax St, Burnaby, BC V5A 4M8 | Happy Hour: Classic Cheeseburger (all-beef patty, brioche bun, cheddar) | $15.00 | `$15.00` (Pending CAD confirmation) | Wed–Sun | 14:30–16:30 | `null` (Ongoing) | Happy Hour dine-in pricing Wed–Sun; add-ons extra | [Burnaby Hospitality HH](https://burnabyhospitality.ca/burnaby-mountain-happy-hour) |
| **CAND-08** | BierCraft UniverCity | 8902 University High St, Burnaby, BC V5A 4X6 | Thursday Special: Manna Burger | $5.50 | `$5.50` (Pending CAD confirmation) | Thu | All day | `null` (Ongoing) | Thursday daily feature; SFU UniverCity location | [BierCraft UniverCity](https://biercraft.com/univercity/) |
| **CAND-09** | BierCraft UniverCity | 8902 University High St, Burnaby, BC V5A 4X6 | Wednesday Special: 1 lb Wings | $12.00 | `$12.00` (Pending CAD confirmation) | Wed | All day | `null` (Ongoing) | Wednesday daily feature; SFU UniverCity location | [BierCraft UniverCity](https://biercraft.com/univercity/) |
| **CAND-10** | Time & Place Burnaby | 6083 McKay Ave, Burnaby, BC V5H 2W7 | Happy Hour: Mediterranean Beef Kebobs | $5.00 | `$5` (Pending CAD confirmation) | Mon–Sun (Daily) | 16:00–18:00 (M-F), 17:00–18:00 (S-S) | `null` (Ongoing) | Happy Hour lounge/restaurant pricing | [Time & Place Burnaby](https://www.timeandplaceburnaby.com/) |
| **CAND-11** | Acqua Restaurant & Bar | 4201 Lougheed Hwy, Burnaby, BC V5C 3Y6 | Happy Hour: Fresh Oysters ($1.50 each) | $1.50 / pc | `$1.50 each` (Pending CAD confirmation) | Mon–Sun (Daily) | 16:00–18:00 (Daily), 21:00–22:00 (Tue–Sat) | `null` (Ongoing) | Happy Hour bar/patio dine-in pricing | [Acqua Restaurant](https://acquarestaurantandbar.com/) |

---

## 3. Detailed Evidence & Canonical Candidate Profiles

### Candidate 01: Tenen Restaurant — Spaghetti Bolognese Lunch Special
- **Canonical Deal Proposal:**
  - `restaurant`: `"Tenen Restaurant"`
  - `address`: `"7569 Royal Oak Ave, Burnaby, BC V5J 4J8"`
  - `dealText`: `"Lunch Special: Spaghetti Bolognese (pasta cooked with homemade meat sauce)"`
  - `priceCad`: `7.95`
  - `validDays`: `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"10:30"`
  - `validEnd`: `undefined` *(cut-off time not published on webpage)*
  - `expiresOn`: `undefined`
  - `conditions`: `["Lunch special menu item", "Dine-in or take-out as offered"]`
  - `sourceUrl`: `"https://www.tenenrestaurant.com/lunchspecials"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Currency Evidence: Website displays `7.95 $`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Missing Fields: `lat`, `lng`, `validEnd`, `flyerPhoto`.

### Candidate 02: Tenen Restaurant — Soup of the Day Lunch Special
- **Canonical Deal Proposal:**
  - `restaurant`: `"Tenen Restaurant"`
  - `address`: `"7569 Royal Oak Ave, Burnaby, BC V5J 4J8"`
  - `dealText`: `"Lunch Special: Soup of the Day (cup of choice daily soup)"`
  - `priceCad`: `7.95`
  - `validDays`: `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"10:30"`
  - `validEnd`: `undefined`
  - `expiresOn`: `undefined`
  - `conditions`: `["Lunch special menu item", "Daily soup selection"]`
  - `sourceUrl`: `"https://www.tenenrestaurant.com/lunchspecials"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Currency Evidence: Website displays `7.95 $`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Missing Fields: `lat`, `lng`, `validEnd`, `flyerPhoto`.

### Candidate 03: Tentatsu Japanese Restaurant — 10% Off Take Out Orders $30+
- **Canonical Deal Proposal:**
  - `restaurant`: `"Tentatsu Japanese Restaurant"`
  - `address`: `"4266 Hastings St, Burnaby, BC"`
  - `dealText`: `"10% off all Take Out orders of $30 & up (before taxes) - phone call orders only"`
  - `priceCad`: `undefined` *(percentage discount; minimum threshold $30 applies)*
  - `validDays`: `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"11:00"`
  - `validEnd`: `"21:30"`
  - `expiresOn`: `undefined`
  - `conditions`: `["Take Out orders of $30 & up before taxes", "Phone call orders only", "Not valid for online order or delivery platforms"]`
  - `sourceUrl`: `"https://www.tentatsusushi.com/"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Currency Evidence: Website displays `10% off all Take Out orders of $30&up (before taxes)-phone call only`.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Missing Fields: `lat`, `lng`, `flyerPhoto`.

### Candidate 04: Argo Greek — Chicken Souvlaki Lunch Special Platter
- **Canonical Deal Proposal:**
  - `restaurant`: `"Argo Greek"`
  - `address`: `"Unit 108 – 3790 Canada Way, Burnaby, BC V5G 1G4"`
  - `dealText`: `"Lunch Special: Chicken Souvlaki Platter (served with Greek salad, rice, roasted potato, tzatziki & pita)"`
  - `priceCad`: `22.00`
  - `validDays`: `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"11:30"`
  - `validEnd`: `"14:30"`
  - `expiresOn`: `undefined`
  - `conditions`: `["Available from 11:30am - 2:30pm", "Smaller portion served during lunch hours only"]`
  - `sourceUrl`: `"https://www.argogreek.ca/menu/"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Currency Evidence: Website displays `$22`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Missing Fields: `lat`, `lng`, `flyerPhoto`.

### Candidate 05: Argo Greek — 6 oz Lunch Skewer
- **Canonical Deal Proposal:**
  - `restaurant`: `"Argo Greek"`
  - `address`: `"Unit 108 – 3790 Canada Way, Burnaby, BC V5G 1G4"`
  - `dealText`: `"Lunch Special: 6 oz Lunch Skewer (Chicken or Lamb)"`
  - `priceCad`: `12.00`
  - `validDays`: `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"11:30"`
  - `validEnd`: `"14:30"`
  - `expiresOn`: `undefined`
  - `conditions`: `["Available from 11:30am - 2:30pm", "Smaller portion served during lunch hours only"]`
  - `sourceUrl`: `"https://www.argogreek.ca/menu/"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Currency Evidence: Website displays `$12`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Missing Fields: `lat`, `lng`, `flyerPhoto`.

### Candidate 06: Burnaby Mountain Restaurant — Happy Hour Truffle Fries
- **Canonical Deal Proposal:**
  - `restaurant`: `"Burnaby Mountain Restaurant"`
  - `address`: `"7600 Halifax St, Burnaby, BC V5A 4M8"`
  - `dealText`: `"Happy Hour: Truffle Fries (truffle oil, Grana Padano, parsley)"`
  - `priceCad`: `8.00`
  - `validDays`: `["wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"14:30"`
  - `validEnd`: `"16:30"`
  - `expiresOn`: `undefined`
  - `conditions`: `["Happy Hour pricing Wednesday to Sunday 2:30pm - 4:30pm", "Dine-in only"]`
  - `sourceUrl`: `"https://burnabyhospitality.ca/burnaby-mountain-happy-hour"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Currency Evidence: Website displays `$8.00`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Ad Image URL: `https://burnabyhospitality.ca/sites/default/files/styles/food_menu_322x390_/public/2026-05/happy_hour_sliderbox.jpg` (digital web banner; not a physical flyer photo).
  - Missing Fields: `lat`, `lng`, `flyerPhoto`.

### Candidate 07: Burnaby Mountain Restaurant — Happy Hour Classic Cheeseburger
- **Canonical Deal Proposal:**
  - `restaurant`: `"Burnaby Mountain Restaurant"`
  - `address`: `"7600 Halifax St, Burnaby, BC V5A 4M8"`
  - `dealText`: `"Happy Hour: Classic Cheeseburger (all-beef patty, brioche bun, cheddar, lettuce, tomato, pickles, BMC sauce)"`
  - `priceCad`: `15.00`
  - `validDays`: `["wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"14:30"`
  - `validEnd`: `"16:30"`
  - `expiresOn`: `undefined`
  - `conditions`: `["Happy Hour pricing Wednesday to Sunday 2:30pm - 4:30pm", "Dine-in only", "Add-on bacon +$2 or mushrooms +$2 optional"]`
  - `sourceUrl`: `"https://burnabyhospitality.ca/burnaby-mountain-happy-hour"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Currency Evidence: Website displays `$15.00`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Ad Image URL: `https://burnabyhospitality.ca/sites/default/files/styles/food_menu_322x390_/public/2026-05/happy_hour_sliderbox.jpg`
  - Missing Fields: `lat`, `lng`, `flyerPhoto`.

### Candidate 08: BierCraft UniverCity — Thursday Manna Burger Special
- **Canonical Deal Proposal:**
  - `restaurant`: `"BierCraft UniverCity"`
  - `address`: `"8902 University High St, Burnaby, BC V5A 4X6"`
  - `dealText`: `"Thursday Daily Special: Manna Burger"`
  - `priceCad`: `5.50`
  - `validDays`: `["thu"]`
  - `validStart`: `undefined`
  - `validEnd`: `undefined`
  - `expiresOn`: `undefined`
  - `conditions`: `["Thursday feature", "Dine-in / in-house special", "UniverCity location on SFU campus"]`
  - `sourceUrl`: `"https://biercraft.com/univercity/"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Location Context: On Simon Fraser University (SFU) campus, Burnaby Mountain.
  - Currency Evidence: Website displays `$5.50`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Missing Fields: `lat`, `lng`, `flyerPhoto`.

### Candidate 09: BierCraft UniverCity — Wednesday 1 lb Wings Special
- **Canonical Deal Proposal:**
  - `restaurant`: `"BierCraft UniverCity"`
  - `address`: `"8902 University High St, Burnaby, BC V5A 4X6"`
  - `dealText`: `"Wednesday Daily Special: One Pound of Wings"`
  - `priceCad`: `12.00`
  - `validDays`: `["wed"]`
  - `validStart`: `undefined`
  - `validEnd`: `undefined`
  - `expiresOn`: `undefined`
  - `conditions`: `["Wednesday feature", "Dine-in / in-house special", "UniverCity location on SFU campus"]`
  - `sourceUrl`: `"https://biercraft.com/univercity/"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Location Context: On Simon Fraser University (SFU) campus, Burnaby Mountain.
  - Currency Evidence: Website displays `$12.00`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Missing Fields: `lat`, `lng`, `flyerPhoto`.

### Candidate 10: Time & Place Burnaby — Happy Hour Mediterranean Beef Kebobs
- **Canonical Deal Proposal:**
  - `restaurant`: `"Time & Place Burnaby"`
  - `address`: `"6083 McKay Ave, Burnaby, BC V5H 2W7"`
  - `dealText`: `"Happy Hour: Mediterranean Beef Kebobs"`
  - `priceCad`: `5.00`
  - `validDays`: `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"16:00"`
  - `validEnd`: `"18:00"`
  - `expiresOn`: `undefined`
  - `conditions`: `["Happy Hour pricing (Mon-Fri 4pm-6pm, Sat-Sun 5pm-6pm)", "Dine-in lounge/restaurant", "Located in Hilton Vancouver Metrotown"]`
  - `sourceUrl`: `"https://www.timeandplaceburnaby.com/"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Currency Evidence: Website displays `$5`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Missing Fields: `lat`, `lng`, `flyerPhoto`.

### Candidate 11: Acqua Restaurant & Bar — Happy Hour Fresh Oysters
- **Canonical Deal Proposal:**
  - `restaurant`: `"Acqua Restaurant & Bar"`
  - `address`: `"4201 Lougheed Hwy, Burnaby, BC V5C 3Y6"`
  - `dealText`: `"Happy Hour: Fresh Oysters ($1.50 each)"`
  - `priceCad`: `1.50`
  - `validDays`: `["mon", "tue", "wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"16:00"`
  - `validEnd`: `"18:00"`
  - `expiresOn`: `undefined`
  - `conditions`: `["Happy Hour pricing: Sun-Mon 4pm-6pm, Tue-Sat 4pm-6pm & 9pm-10pm", "Dine-in bar/patio", "Located at Executive Suites Hotel Burnaby"]`
  - `sourceUrl`: `"https://acquarestaurantandbar.com/"`
- **Provenance & Uncertainty Metadata:**
  - Access Date: `2026-10-03`
  - Currency Evidence: Menu displays `$1.50 each`. Pending explicit CAD confirmation.
  - Coordinate Status: Omitted pending Pinyuan map pin.
  - Missing Fields: `lat`, `lng`, `flyerPhoto`.

---

## 4. Gap Analysis & Next Steps to Production / Demo Artifacts

To graduate these source candidates into canonical seeds, extraction test fixtures, and visual media, the following sequential handoffs are required:

1. **Step 1: Geocoding & Map Pin Confirmation (Pinyuan Ownership):**
   - Each candidate has an evidenced street address in Burnaby or on SFU campus.
   - Pinyuan (map owner) must generate or confirm the canonical latitude/longitude coordinates (`lat`, `lng`) for each address before inserting records into `fixtures/seed.json` or `convex/seed.ts`.
2. **Step 2: Explicit Currency Confirmation (Human / Team):**
   - Confirm that all `$` listings in Burnaby are settled in CAD dollars, converting `priceCad` from pending into confirmed values.
3. **Step 3: Three Real Extraction Sources (Harry / iOS Integration):**
   - Select 3 candidates (e.g. CAND-06 Burnaby Mountain Truffle Fries, CAND-08 BierCraft Manna Burger, CAND-10 Time & Place Kebobs).
   - Feed the actual sharing payload (text caption / URL from Instagram share sheet) into the VLM extraction pipeline without web scraping.
4. **Step 4: Two Real Flyer Photos (Human Supplied):**
   - Acquire two genuine photographs of physical paper flyers or print menus from local Burnaby establishments (e.g., printed university bulletin board or takeaway flyer) to fulfill the 2-flyer demonstration requirement. Digital website hero banners cannot be substituted for photographed flyers.
