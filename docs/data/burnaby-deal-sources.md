# Real Burnaby Food Deal Evidence Candidates (T-06A)

**Ticket:** T-06A  
**Research Specialist:** Prism  
**Access Date:** 2026-10-03  
**Target Area:** Burnaby, BC / Simon Fraser University (SFU Burnaby Mountain & UniverCity)  
**Evaluation Status:** Publicly advertised candidates with live terms unconfirmed  
**Scope:** Research, primary source evidence capture, and inert candidate formatting only. Full T-06 / T-12 remain pending pins, photos, currency confirmation, and live phone/runtime checks.

---

## 1. Operating Methodology & Review Corrections

This document records publicly advertised restaurant and promoter food deals in Burnaby, BC and near Simon Fraser University (UniverCity / Burnaby Mountain).

### Crucial Standards & Review Corrections Applied:
1. **Status Clarification (No False Live Availability Claims):** A publicly accessible website proves that an offer has been advertised, but **not** that live terms, currency, or hours are verified production facts. All candidate records are classified as **publicly advertised candidates with live terms unconfirmed**. Unknown expiry is recorded as `expiresOn: null` and is not converted into artificial current validity.
2. **Strict Enforcement of Pending Currency (`priceCad: null`):** While CAD currency confirmation is pending, **every candidate's `canonicalProposal.priceCad` is strictly `null`**. Stated prices are recorded exclusively in source provenance (`provenance.statedAmount` and `provenance.statedCurrency`). Canadian geography and dollar symbols (`$`) do not prove CAD settlement.
3. **Decoupled Business Operating Hours vs Offer Hours:** General restaurant business hours (e.g., from website footers or directory listings) are not assumed to be offer validity hours:
   - **Tenen Restaurant (CAND-01, CAND-02):** The footer's 10:30am–10:30pm reflects general business opening, not confirmed lunch special hours. Inferred `validStart` has been cleared to `null` and `validDays` set to `[]` (pending).
   - **Tentatsu (CAND-03):** Business operating hours (11:00am–9:30pm) are not confirmed offer hours; `validStart`/`validEnd`/`validDays` remain pending. Actual exclusions (lunch specials, combos, and other special items) from the official takeout offer are explicitly incorporated.
   - **Argo Greek (CAND-04, CAND-05):** Explicit lunch hours (11:30am–2:30pm) are verified from menu text; however, all 7 days availability was inferred from business hours and is flagged as pending (`validDays: []`). Inferred dine-in/takeout conditions have been removed.
4. **Schedule Conflicts & Representational Schema Limitations:**
   - **Time & Place Burnaby (CAND-08, CAND-09, CAND-10):** The primary source ([menus-happyhour](https://www.timeandplaceburnaby.com/menus-happyhour)) specifies Monday–Friday 16:00–18:00 and Saturday–Sunday 17:00–18:00. The DishDeals schema supports only a single contiguous `validStart`/`validEnd` window per record. A single 16:00–18:00 all-days window is false. Canonical times and days are left pending (`null`/`[]`) with the complete dual schedule recorded in provenance.
   - **Acqua Restaurant & Bar (CAND-11):** The official PDF ([Acqua-HH-Menu-05-2026.pdf](https://acquarestaurantandbar.com/pdf/Acqua-HH-Menu-05-2026.pdf)) reveals a direct price conflict without asserting external geography: **Happy Hour menu page 0 lists oysters at $1.75 each (min 6), while patio page 3 lists $1.50 each (min 6)**. Minimum order of 6 pieces is an essential condition. Furthermore, the website and PDF conflict on hours (daily 16:00–18:00 vs Sunday–Monday 16:00–18:00 and Tuesday–Saturday 16:00–18:00 & 21:00–22:00). Because the DishDeals schema cannot represent multiple non-contiguous windows in one record, canonical times are left pending so the late-night window is not silently discarded.
5. **Exclusion of Unverified Historical Leads (BierCraft UniverCity):**
   - Live inspection of `https://biercraft.com/univercity/` confirms the restaurant location and general operating hours atop SFU Burnaby Mountain, but contains **no active menu offers, Manna Burger ($5.50), or 1 lb Wings ($12.00) specials**.
   - These items derived from historical aggregator guides and third-party mirrors. In strict compliance with review findings, they have been downgraded to unverified historical leads and excluded from the candidate set.
   - To maintain full 10-candidate coverage with verifiable primary offers, additional explicit food offers from the current Time & Place Happy Hour menu ([menus-happyhour](https://www.timeandplaceburnaby.com/menus-happyhour)) have been incorporated: Smashed Beef Slider ($6.00) and Fraser Valley Wings ($0.89 each, min 6 pcs).
6. **No Inferred Dine-In Conditions:**
   - Unstated "dine-in only" conditions are omitted from Burnaby Mountain Restaurant (CAND-06, CAND-07) and Argo Greek (CAND-04, CAND-05). Conditions reflect strictly explicit source statements.
7. **Exact Primary Offer and Address URLs:** Both the exact offer page URL and the specific address URL (where the street address is explicitly evidenced) are supplied for every candidate. For Burnaby Mountain Restaurant, the offer is on `/burnaby-mountain-happy-hour`, while the physical street address (7600 Halifax Street) is published in the primary HTML of `/restaurants/burnaby-mountain-restaurant` (verified HTTP 200, 38,569 bytes; note that the offer page footer displays corporate admin office `9001 Bill Fox Way`).
8. **Digital Ad Image Asset Primary Verification:** Inspection of the primary offer menu page (`/burnaby-mountain-happy-hour`, 34,594 bytes) confirms that no food image assets are present. The restaurant overview page (`/restaurants/burnaby-mountain-restaurant`, 38,569 bytes) embeds `happy_hour_sliderbox.jpg?itok=bFVqB6th` (verified HTTP 200, 67,575 bytes, alt: "Burger sliders and drinks on a patio"). Because this banner is absent from the offer menu page and depicts general patio sliders rather than an offer-specific asset for Truffle Fries or Cheeseburger, `adImageUrl` is set to `null` across all candidate records to eliminate unsupported verified claims.
9. **Coordinates & Pins:** Geocoding and map pin confirmation remain strictly owned by Pinyuan; `lat` and `lng` are omitted across all candidate proposals.
10. **Zero Instagram Scraping:** No Instagram endpoints, GraphQL APIs, or third-party mirrors were queried.
11. **Exclusion of Expired Promotions:** The March "Bite of Burnaby" festival remains excluded as historical and expired.

---

## 2. Summary Evidence Table

| ID | Restaurant | Stated Address | Paraphrased Offer | Stated Source Amount | Stated Currency Evidence | Valid Days | Valid Hours | Expiry | Key Conditions & Exclusions | Primary Offer URL | Primary Address Evidence URL |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CAND-01** | Tenen Restaurant | 7569 Royal Oak Ave, Burnaby, BC V5J 4J8 | Lunch Special: Spaghetti Bolognese | $7.95 | `7.95 $` (Pending CAD) | `[]` (Pending) | `null` (Pending) | `null` | Lunch special menu item | [Tenen Lunch Specials](https://www.tenenrestaurant.com/lunchspecials) | [Tenen Contact](https://www.tenenrestaurant.com/contact) |
| **CAND-02** | Tenen Restaurant | 7569 Royal Oak Ave, Burnaby, BC V5J 4J8 | Lunch Special: Soup of the Day | $7.95 | `7.95 $` (Pending CAD) | `[]` (Pending) | `null` (Pending) | `null` | Lunch special menu item | [Tenen Lunch Specials](https://www.tenenrestaurant.com/lunchspecials) | [Tenen Contact](https://www.tenenrestaurant.com/contact) |
| **CAND-03** | Tentatsu Japanese Restaurant | 4266 Hastings St, Burnaby, BC | 10% off Take Out orders $30+ (phone orders only) | 10% off ($30+ min) | `$` symbol in min order (Pending CAD) | `[]` (Pending) | `null` (Pending) | `null` | Phone orders only; excludes lunch specials, combos & special items | [Tentatsu Home](https://www.tentatsusushi.com/) | [Tentatsu Burnaby](https://www.tentatsusushi.com/tentatsuburnaby.html) |
| **CAND-04** | Argo Greek | Unit 108 – 3790 Canada Way, Burnaby, BC V5G 1G4 | Lunch Special: Chicken Souvlaki Platter | $22.00 | `$22` (Pending CAD) | `[]` (Pending) | 11:30–14:30 | `null` | Available 11:30am–2:30pm; smaller lunch portion | [Argo Greek Menu](https://www.argogreek.ca/menu/) | [Argo Greek Contact](https://www.argogreek.ca/contact/) |
| **CAND-05** | Argo Greek | Unit 108 – 3790 Canada Way, Burnaby, BC V5G 1G4 | Lunch Special: 6 oz Lunch Skewer | $12.00 | `$12` (Pending CAD) | `[]` (Pending) | 11:30–14:30 | `null` | Available 11:30am–2:30pm; smaller lunch portion | [Argo Greek Menu](https://www.argogreek.ca/menu/) | [Argo Greek Contact](https://www.argogreek.ca/contact/) |
| **CAND-06** | Burnaby Mountain Restaurant | 7600 Halifax St, Burnaby, BC V5A 4M8 | Happy Hour: Truffle Fries | $8.00 | `$8.00` (Pending CAD) | Wed–Sun | 14:30–16:30 | `null` | Happy Hour menu item (Wed–Sun 2:30–4:30pm) | [Burnaby Mountain HH](https://burnabyhospitality.ca/burnaby-mountain-happy-hour) | [Burnaby Mountain Restaurant](https://burnabyhospitality.ca/restaurants/burnaby-mountain-restaurant) |
| **CAND-07** | Burnaby Mountain Restaurant | 7600 Halifax St, Burnaby, BC V5A 4M8 | Happy Hour: Classic Cheeseburger | $15.00 | `$15.00` (Pending CAD) | Wed–Sun | 14:30–16:30 | `null` | Happy Hour menu item (Wed–Sun 2:30–4:30pm); add-ons extra | [Burnaby Mountain HH](https://burnabyhospitality.ca/burnaby-mountain-happy-hour) | [Burnaby Mountain Restaurant](https://burnabyhospitality.ca/restaurants/burnaby-mountain-restaurant) |
| **CAND-08** | Time & Place Burnaby | 6083 McKay Ave, Burnaby, BC V5H 2W7 | Happy Hour: Mediterranean Beef Kebobs | $5.00 | `$5` (Pending CAD) | `[]` (Pending) | `null` (Pending) | `null` | Schedule: M–F 16–18, S–S 17–18 (schema limit); Hilton Metrotown | [Time & Place HH](https://www.timeandplaceburnaby.com/menus-happyhour) | [Time & Place Home](https://www.timeandplaceburnaby.com/) |
| **CAND-09** | Time & Place Burnaby | 6083 McKay Ave, Burnaby, BC V5H 2W7 | Happy Hour: Smashed Beef Slider (1 pc) | $6.00 | `$6` (Pending CAD) | `[]` (Pending) | `null` (Pending) | `null` | Schedule: M–F 16–18, S–S 17–18 (schema limit); Hilton Metrotown | [Time & Place HH](https://www.timeandplaceburnaby.com/menus-happyhour) | [Time & Place Home](https://www.timeandplaceburnaby.com/) |
| **CAND-10** | Time & Place Burnaby | 6083 McKay Ave, Burnaby, BC V5H 2W7 | Happy Hour: Fraser Valley Wings ($0.89 each, min 6) | $0.89 / pc | `$0.89 each (min. 6 pcs)` (Pending CAD) | `[]` (Pending) | `null` (Pending) | `null` | Min 6 pcs; M–F 16–18, S–S 17–18 (schema limit); Hilton Metrotown | [Time & Place HH](https://www.timeandplaceburnaby.com/menus-happyhour) | [Time & Place Home](https://www.timeandplaceburnaby.com/) |
| **CAND-11** | Acqua Restaurant & Bar | 4201 Lougheed Hwy, Burnaby, BC V5C 3Y6 | Happy Hour: Fresh Oysters (min 6) | Conflicting: HH menu p0 $1.75 vs patio p3 $1.50 | `$1.50` / `$1.75` (Pending CAD) | `[]` (Pending) | `null` (Pending) | `null` | Min 6 pcs; price varies in PDF menu (page 0 $1.75 vs patio page 3 $1.50); multi-window limit | [Acqua HH Menu PDF](https://acquarestaurantandbar.com/pdf/Acqua-HH-Menu-05-2026.pdf) | [Acqua Home](https://acquarestaurantandbar.com/) |

---

## 3. Detailed Evidence & Canonical Candidate Profiles

### Candidate 01: Tenen Restaurant — Spaghetti Bolognese Lunch Special
- **Canonical Deal Proposal:**
  - `restaurant`: `"Tenen Restaurant"`
  - `address`: `"7569 Royal Oak Ave, Burnaby, BC V5J 4J8"`
  - `dealText`: `"Lunch Special: Spaghetti Bolognese (pasta cooked with homemade meat sauce)"`
  - `priceCad`: `null` *(strictly null while CAD confirmation is pending)*
  - `validDays`: `[]` *(pending offer days confirmation; footer hours are business opening only)*
  - `validStart`: `null` *(pending lunch-specific start time)*
  - `validEnd`: `null` *(pending lunch-specific end time)*
  - `expiresOn`: `null`
  - `conditions`: `["Lunch special menu item"]`
  - `sourceUrl`: `"https://www.tenenrestaurant.com/lunchspecials"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://www.tenenrestaurant.com/lunchspecials`
  - Address URL: `https://www.tenenrestaurant.com/contact`
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `7.95`
  - Stated Currency: `"7.95 $ displayed on website; ISO currency unstated (pending CAD confirmation)"`
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Hours & Days Note: Footer displays general restaurant business hours 10:30am–10:30pm daily. Lunch special specific validity hours and valid days are unstated on the webpage and remain pending.
  - Missing Fields: `["lat", "lng", "priceCad", "validDays", "validStart", "validEnd", "flyerPhoto"]`

### Candidate 02: Tenen Restaurant — Soup of the Day Lunch Special
- **Canonical Deal Proposal:**
  - `restaurant`: `"Tenen Restaurant"`
  - `address`: `"7569 Royal Oak Ave, Burnaby, BC V5J 4J8"`
  - `dealText`: `"Lunch Special: Soup of the Day (cup of choice daily soup)"`
  - `priceCad`: `null`
  - `validDays`: `[]`
  - `validStart`: `null`
  - `validEnd`: `null`
  - `expiresOn`: `null`
  - `conditions`: `["Lunch special menu item"]`
  - `sourceUrl`: `"https://www.tenenrestaurant.com/lunchspecials"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://www.tenenrestaurant.com/lunchspecials`
  - Address URL: `https://www.tenenrestaurant.com/contact`
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `7.95`
  - Stated Currency: `"7.95 $ displayed on website; ISO currency unstated (pending CAD confirmation)"`
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Hours & Days Note: Business opening hours in footer (10:30am–10:30pm) are not confirmed lunch hours; valid days and hours remain pending.
  - Missing Fields: `["lat", "lng", "priceCad", "validDays", "validStart", "validEnd", "flyerPhoto"]`

### Candidate 03: Tentatsu Japanese Restaurant — 10% Off Take Out Orders $30+
- **Canonical Deal Proposal:**
  - `restaurant`: `"Tentatsu Japanese Restaurant"`
  - `address`: `"4266 Hastings St, Burnaby, BC"`
  - `dealText`: `"10% off all Take Out orders of $30 & up (before taxes) - phone call orders only"`
  - `priceCad`: `null` *(percentage discount with minimum order threshold)*
  - `validDays`: `[]` *(store business hours 11:00–21:30 are not confirmed offer hours)*
  - `validStart`: `null`
  - `validEnd`: `null`
  - `expiresOn`: `null`
  - `conditions`: `["Take Out orders of $30 & up before taxes", "Phone call orders only", "Excludes lunch specials, combos, and other special items"]`
  - `sourceUrl`: `"https://www.tentatsusushi.com/"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://www.tentatsusushi.com/`
  - Address URL: `https://www.tentatsusushi.com/tentatsuburnaby.html`
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `null` (percentage discount)
  - Stated Currency: `"10% off take-out orders of $30 & up before taxes; ISO currency unstated (pending CAD confirmation)"`
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Exclusions: Explicitly excludes lunch specials, combos, and other special items from takeout discount.
  - Hours & Days Note: Store business hours 11:00am–9:30pm daily are general operating hours; promotion-specific offer hours/days are unconfirmed and remain pending.
  - Missing Fields: `["lat", "lng", "priceCad", "validDays", "validStart", "validEnd", "flyerPhoto"]`

### Candidate 04: Argo Greek — Chicken Souvlaki Lunch Special Platter
- **Canonical Deal Proposal:**
  - `restaurant`: `"Argo Greek"`
  - `address`: `"Unit 108 – 3790 Canada Way, Burnaby, BC V5G 1G4"`
  - `dealText`: `"Lunch Special: Chicken Souvlaki Platter (served with Greek salad, rice, roasted potato, tzatziki & pita)"`
  - `priceCad`: `null` *(strictly null while CAD confirmation is pending)*
  - `validDays`: `[]` *(all 7 days availability inferred from store hours; flagged pending not facts)*
  - `validStart`: `"11:30"` *(explicitly stated on menu)*
  - `validEnd`: `"14:30"` *(explicitly stated on menu)*
  - `expiresOn`: `null`
  - `conditions`: `["Available from 11:30am - 2:30pm", "Smaller portion served during lunch hours only"]`
  - `sourceUrl`: `"https://www.argogreek.ca/menu/"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://www.argogreek.ca/menu/`
  - Address URL: `https://www.argogreek.ca/contact/`
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `22.0`
  - Stated Currency: `"$22 displayed on menu; ISO currency unstated (pending CAD confirmation)"`
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Days Note: Hours 11:30am–2:30pm are explicit; valid weekdays inferred from store operations remain pending verification.
  - Missing Fields: `["lat", "lng", "priceCad", "validDays", "flyerPhoto"]`

### Candidate 05: Argo Greek — 6 oz Lunch Skewer
- **Canonical Deal Proposal:**
  - `restaurant`: `"Argo Greek"`
  - `address`: `"Unit 108 – 3790 Canada Way, Burnaby, BC V5G 1G4"`
  - `dealText`: `"Lunch Special: 6 oz Lunch Skewer (Chicken or Lamb)"`
  - `priceCad`: `null`
  - `validDays`: `[]`
  - `validStart`: `"11:30"`
  - `validEnd`: `"14:30"`
  - `expiresOn`: `null`
  - `conditions`: `["Available from 11:30am - 2:30pm", "Smaller portion served during lunch hours only"]`
  - `sourceUrl`: `"https://www.argogreek.ca/menu/"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://www.argogreek.ca/menu/`
  - Address URL: `https://www.argogreek.ca/contact/`
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `12.0`
  - Stated Currency: `"$12 displayed on menu; ISO currency unstated (pending CAD confirmation)"`
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Missing Fields: `["lat", "lng", "priceCad", "validDays", "flyerPhoto"]`

### Candidate 06: Burnaby Mountain Restaurant — Happy Hour Truffle Fries
- **Canonical Deal Proposal:**
  - `restaurant`: `"Burnaby Mountain Restaurant"`
  - `address`: `"7600 Halifax St, Burnaby, BC V5A 4M8"`
  - `dealText`: `"Happy Hour: Truffle Fries (truffle oil, Grana Padano, parsley)"`
  - `priceCad`: `null`
  - `validDays`: `["wed", "thu", "fri", "sat", "sun"]` *(explicitly stated on Happy Hour page: "Wednesday to Sunday")*
  - `validStart`: `"14:30"` *(explicitly stated: "2:30-4:30 pm")*
  - `validEnd`: `"16:30"`
  - `expiresOn`: `null`
  - `conditions`: `["Happy Hour menu item (Wednesday to Sunday 2:30pm - 4:30pm)"]`
  - `sourceUrl`: `"https://burnabyhospitality.ca/burnaby-mountain-happy-hour"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://burnabyhospitality.ca/burnaby-mountain-happy-hour`
  - Address Evidence URL: `https://burnabyhospitality.ca/restaurants/burnaby-mountain-restaurant` *(explicitly publishes "7600 Halifax Street")*
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `8.0`
  - Stated Currency: `"$8.00 displayed on menu; ISO currency unstated (pending CAD confirmation)"`
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Ad Image Primary Verification: The offer menu page (`/burnaby-mountain-happy-hour`, 34,594 bytes HTTP 200) contains no food image assets (absent). The restaurant overview page (`/restaurants/burnaby-mountain-restaurant`, 38,569 bytes HTTP 200) embeds `/sites/default/files/styles/food_menu_322x390_/public/2026-05/happy_hour_sliderbox.jpg?itok=bFVqB6th` (67,575 bytes HTTP 200, alt: "Burger sliders and drinks on a patio"). Because this banner is absent from the offer menu page and depicts general patio sliders rather than Truffle Fries, `adImageUrl` is set to `null` to eliminate unsupported verified claims.
  - Address Primary Verification: Street address "7600 Halifax Street" verified directly in primary HTML of `/restaurants/burnaby-mountain-restaurant` (HTTP 200). Offer page footer displays corporate admin office "9001 Bill Fox Way".
  - Missing Fields: `["lat", "lng", "priceCad", "flyerPhoto"]`

### Candidate 07: Burnaby Mountain Restaurant — Happy Hour Classic Cheeseburger
- **Canonical Deal Proposal:**
  - `restaurant`: `"Burnaby Mountain Restaurant"`
  - `address`: `"7600 Halifax St, Burnaby, BC V5A 4M8"`
  - `dealText`: `"Happy Hour: Classic Cheeseburger (all-beef patty, brioche bun, cheddar, lettuce, tomato, pickles, BMC sauce)"`
  - `priceCad`: `null`
  - `validDays`: `["wed", "thu", "fri", "sat", "sun"]`
  - `validStart`: `"14:30"`
  - `validEnd`: `"16:30"`
  - `expiresOn`: `null`
  - `conditions`: `["Happy Hour menu item (Wednesday to Sunday 2:30pm - 4:30pm)", "Optional add-ons (bacon +$2, mushroom medley +$2)"]`
  - `sourceUrl`: `"https://burnabyhospitality.ca/burnaby-mountain-happy-hour"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://burnabyhospitality.ca/burnaby-mountain-happy-hour`
  - Address Evidence URL: `https://burnabyhospitality.ca/restaurants/burnaby-mountain-restaurant`
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `15.0`
  - Stated Currency: `"$15.00 displayed on menu; ISO currency unstated (pending CAD confirmation)"`
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Ad Image Primary Verification: The offer menu page (`/burnaby-mountain-happy-hour`, 34,594 bytes HTTP 200) contains no food image assets (absent). The restaurant overview page (`/restaurants/burnaby-mountain-restaurant`, 38,569 bytes HTTP 200) embeds `/sites/default/files/styles/food_menu_322x390_/public/2026-05/happy_hour_sliderbox.jpg?itok=bFVqB6th` (67,575 bytes HTTP 200, alt: "Burger sliders and drinks on a patio"). Because this banner is absent from the offer menu page and depicts patio sliders rather than the single Classic Cheeseburger deal asset, `adImageUrl` is set to `null` to eliminate unsupported verified claims.
  - Address Primary Verification: Street address "7600 Halifax Street" verified directly in primary HTML of `/restaurants/burnaby-mountain-restaurant` (HTTP 200). Offer page footer displays corporate admin office "9001 Bill Fox Way".
  - Missing Fields: `["lat", "lng", "priceCad", "flyerPhoto"]`

### Candidate 08: Time & Place Burnaby — Happy Hour Mediterranean Beef Kebobs
- **Canonical Deal Proposal:**
  - `restaurant`: `"Time & Place Burnaby"`
  - `address`: `"6083 McKay Ave, Burnaby, BC V5H 2W7"`
  - `dealText`: `"Happy Hour: Mediterranean Beef Kebobs"`
  - `priceCad`: `null`
  - `validDays`: `[]` *(pending schedule representation resolution)*
  - `validStart`: `null`
  - `validEnd`: `null`
  - `expiresOn`: `null`
  - `conditions`: `["Happy Hour menu item (Mon-Fri 4pm-6pm, Sat-Sun 5pm-6pm)", "Located in Hilton Vancouver Metrotown"]`
  - `sourceUrl`: `"https://www.timeandplaceburnaby.com/menus-happyhour"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://www.timeandplaceburnaby.com/menus-happyhour`
  - Address URL: `https://www.timeandplaceburnaby.com/` *(Hilton Vancouver Metrotown, 6083 McKay Ave)*
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `5.0`
  - Stated Currency: `"$5 displayed on Happy Hour food menu; ISO currency unstated (pending CAD confirmation)"`
  - Full Stated Schedule: Monday–Friday 16:00–18:00, Saturday–Sunday 17:00–18:00.
  - Representational Limitation: DishDeals schema only supports a single contiguous `validStart`/`validEnd` window per record; it cannot represent differing weekday vs weekend hours without creating separate candidate variant records (e.g. weekday vs weekend). Canonical hours/days are left pending to avoid inventing a false all-day or merged time window.
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Missing Fields: `["lat", "lng", "priceCad", "validDays", "validStart", "validEnd", "flyerPhoto"]`

### Candidate 09: Time & Place Burnaby — Happy Hour Smashed Beef Slider
- **Canonical Deal Proposal:**
  - `restaurant`: `"Time & Place Burnaby"`
  - `address`: `"6083 McKay Ave, Burnaby, BC V5H 2W7"`
  - `dealText`: `"Happy Hour: Smashed Beef Slider (1 pc)"`
  - `priceCad`: `null`
  - `validDays`: `[]`
  - `validStart`: `null`
  - `validEnd`: `null`
  - `expiresOn`: `null`
  - `conditions`: `["Happy Hour menu item (Mon-Fri 4pm-6pm, Sat-Sun 5pm-6pm)", "Single slider portion", "Located in Hilton Vancouver Metrotown"]`
  - `sourceUrl`: `"https://www.timeandplaceburnaby.com/menus-happyhour"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://www.timeandplaceburnaby.com/menus-happyhour`
  - Address URL: `https://www.timeandplaceburnaby.com/`
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `6.0`
  - Stated Currency: `"$6 displayed on Happy Hour food menu (Smashed Beef Slider 1pc); ISO currency unstated (pending CAD confirmation)"`
  - Full Stated Schedule: Monday–Friday 16:00–18:00, Saturday–Sunday 17:00–18:00.
  - Representational Limitation: DishDeals schema only supports a single contiguous window; canonical times/days left pending.
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Missing Fields: `["lat", "lng", "priceCad", "validDays", "validStart", "validEnd", "flyerPhoto"]`

### Candidate 10: Time & Place Burnaby — Happy Hour Fraser Valley Wings
- **Canonical Deal Proposal:**
  - `restaurant`: `"Time & Place Burnaby"`
  - `address`: `"6083 McKay Ave, Burnaby, BC V5H 2W7"`
  - `dealText`: `"Happy Hour: Fraser Valley Wings ($0.89 each, min 6 pcs)"`
  - `priceCad`: `null`
  - `validDays`: `[]`
  - `validStart`: `null`
  - `validEnd`: `null`
  - `expiresOn`: `null`
  - `conditions`: `["Happy Hour menu item (Mon-Fri 4pm-6pm, Sat-Sun 5pm-6pm)", "Minimum order of 6 pieces", "Located in Hilton Vancouver Metrotown"]`
  - `sourceUrl`: `"https://www.timeandplaceburnaby.com/menus-happyhour"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://www.timeandplaceburnaby.com/menus-happyhour`
  - Address URL: `https://www.timeandplaceburnaby.com/`
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `0.89`
  - Stated Currency: `"$0.89 each (min. 6 pcs) displayed on Happy Hour food menu; ISO currency unstated (pending CAD confirmation)"`
  - Minimum Quantity: 6 pieces
  - Full Stated Schedule: Monday–Friday 16:00–18:00, Saturday–Sunday 17:00–18:00.
  - Representational Limitation: Single-window schema constraint applies; canonical times/days left pending.
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Missing Fields: `["lat", "lng", "priceCad", "validDays", "validStart", "validEnd", "flyerPhoto"]`

### Candidate 11: Acqua Restaurant & Bar — Happy Hour Fresh Oysters
- **Canonical Deal Proposal:**
  - `restaurant`: `"Acqua Restaurant & Bar"`
  - `address`: `"4201 Lougheed Hwy, Burnaby, BC V5C 3Y6"`
  - `dealText`: `"Happy Hour: Fresh Oysters (minimum order of 6)"`
  - `priceCad`: `null`
  - `validDays`: `[]` *(pending schedule/window resolution)*
  - `validStart`: `null`
  - `validEnd`: `null`
  - `expiresOn`: `null`
  - `conditions`: [
      `"Minimum order of 6 pieces"`
    ]
  - `sourceUrl`: `"https://acquarestaurantandbar.com/pdf/Acqua-HH-Menu-05-2026.pdf"`
- **Provenance & Uncertainty Metadata:**
  - Offer URL: `https://acquarestaurantandbar.com/pdf/Acqua-HH-Menu-05-2026.pdf`
  - Address URL: `https://acquarestaurantandbar.com/` *(Executive Suites Hotel Burnaby, 4201 Lougheed Hwy)*
  - Access Date: `2026-10-03`
  - Evaluation Status: `publicly_advertised_candidate_live_terms_unconfirmed`
  - Stated Amount: `null` *(conflicting stated prices across PDF menu sections)*
  - Stated Currency: `"Conflicting stated prices: HH menu page 0 lists $1.75 each vs patio page 3 lists $1.50 each (minimum 6 pieces); ISO currency unstated (pending CAD confirmation)"`
  - Price Conflict: HH menu page 0 lists $1.75 each (min 6); patio page 3 lists $1.50 each (min 6). Minimum order of 6 pieces applies to both.
  - Review Required: Conflicting stated prices across PDF menu sections (HH menu page 0 lists $1.75/pc min 6 vs patio page 3 lists $1.50/pc min 6); human review required before confirming pricing or publishing.
  - Full Stated Schedule: Sunday–Monday 16:00–18:00; Tuesday–Saturday 16:00–18:00 and 21:00–22:00 (homepage banner also displays "Daily from 4–6 PM").
  - Representational Limitation: DishDeals schema only supports a single contiguous `validStart`/`validEnd` window per record; it cannot combine afternoon 16:00–18:00 and late-night 21:00–22:00 without multiple records. Hours left pending to avoid silently discarding the late-night window.
  - Coordinate Status: `omitted_pending_pinyuan_pin`
  - Ad Image URL: `null`
  - Missing Fields: `["lat", "lng", "priceCad", "validDays", "validStart", "validEnd", "flyerPhoto"]`

---

## 4. Documentation of Excluded Leads (BierCraft UniverCity)

- **Establishment:** BierCraft UniverCity (8902 University High St, Burnaby, BC V5A 4X6, SFU Campus)
- **Primary Page Inspected:** `https://biercraft.com/univercity/`
- **Findings:** Direct curl and text parse of the live webpage confirms restaurant location and operating hours atop Burnaby Mountain. However, **no Manna Burger ($5.50), wings promotion ($12.00), or active daily food deals** are published on the live webpage.
- **Disposition:** Previous references were based on historical aggregator guides and third-party mirrors. In strict compliance with project data standards prohibiting external mirrors and unverified historical claims, these leads have been downgraded to unverified historical leads and fully removed from the active candidate set.

---

## 5. Next Steps for Integration Team (Gap Analysis)

To graduate these source candidates into canonical seeds, extraction test fixtures, and visual media, the following sequential steps are required:

1. **Step 1: Geocoding & Map Pin Confirmation (Pinyuan Ownership):**
   - Each candidate has an evidenced street address in Burnaby or on SFU campus.
   - Pinyuan (map lead) must generate or confirm the canonical latitude/longitude coordinates (`lat`, `lng`) for each address before inserting records into `fixtures/seed.json` or `convex/seed.ts`. Full T-06 / T-12 remain pending confirmed pins.
2. **Step 2: Explicit Currency Confirmation (Human / Team):**
   - Confirm that all `$` listings in Burnaby are settled in CAD dollars, converting `priceCad` from pending (`null`) into confirmed numeric values.
3. **Step 3: Schedule Representational Strategy (Preserving All Stated Hours):**
   - **Never propose simplified single windows that silently drop source restrictions.**
   - For Time & Place (CAND-08/09/10) and Acqua (CAND-11), explicitly prepare separate candidate variant records preserving all stated hours (e.g. separate weekday vs weekend variant records for Time & Place; separate afternoon vs late-night variant records for Acqua), or leave schedule pending human confirmation.
4. **Step 4: Three Real Extraction Sources (Harry / iOS Integration):**
   - Select 3 candidates (e.g. CAND-06 Burnaby Mountain Truffle Fries, CAND-08 Time & Place Kebobs, CAND-10 Time & Place Wings).
   - **A source URL alone cannot serve as input to the VLM extraction pipeline.** In accordance with the strict no-scraping rule, the system cannot fetch arbitrary external URLs at runtime. Extraction requires supplied multimodal artifacts: uploaded image bytes, video frames, transcribed caption text, or real photographed physical flyers; URL-only inputs are blocked.
5. **Step 5: Two Real Flyer Photos (Human Supplied):**
   - Acquire two genuine photographs of physical paper flyers or print menus from local Burnaby establishments (e.g., printed university bulletin board or takeaway flyer) to fulfill the 2-flyer demonstration requirement. Digital website hero banners cannot be substituted for photographed flyers. Full T-06 / T-12 remain pending real photos and live phone acceptance.
