# Genuine Source-Menu Image Preparation (T-06B-ASSETS)

This document records the provenance, rendering verification, visual inspection, and contractual boundaries for genuine source-menu imagery prepared under **T-06B-ASSETS**.

---

## 1. Primary Publisher Document Provenance

- **Establishment:** Acqua Restaurant & Bar (Executive Suites Hotel Burnaby)
- **Candidate Cross-Reference:** Candidate `CAND-11` (`candidate-11-acqua-fresh-oysters.json`, `docs/data/burnaby-deal-sources.md`)
- **Primary Source URL:** `https://acquarestaurantandbar.com/pdf/Acqua-HH-Menu-05-2026.pdf`
- **HTTP Response:** HTTP/2 200 OK
- **MIME Type:** `application/pdf`
- **Header Verification:** `%PDF-1.4%` (valid PDF header)
- **Content Length:** `3,225,876` bytes (~3.08 MiB)
- **SHA-256 Checksum:** `92041867c10159c3ee6e2664ecb250b1f203a71c4b8c22738ad9fa4914954886`
- **Retrieved UTC:** `2026-10-04T06:11:43Z`
- **Server HTTP Headers:**
  - `date: Sun, 04 Oct 2026 06:10:40 GMT`
  - `last-modified: Tue, 08 Sep 2026 20:16:02 GMT`
  - `server: LiteSpeed`
- **Publication Date Status:** Unverified publication date. The filename `Acqua-HH-Menu-05-2026.pdf` indicates a May 2026 menu revision, and the HTTP `Last-Modified` timestamp is September 8, 2026; exact promotional effective dates are not explicitly stated in the document text.
- **Document Structure:** 4 total pages, page bounds `396.0 pt × 612.0 pt` (half-letter format, 5.5 in × 8.5 in).

---

## 2. Rendering Tooling & Environment

In accordance with project constraints forbidding large global tool installations or simulated artifacts:
- **Renderer:** macOS Native `PDFKit` (Apple Quartz / CoreGraphics vector engine via `/usr/bin/swift`).
- **Package Installation:** Zero external npm or pip packages installed.
- **Scale Factor:** `2.0×` (renders `396 × 612 pt` to `792 × 1223 px` at ~144 DPI).
- **Output Format:** Lossless 24-bit RGB PNG with white opaque background fill.
- **Target Files:** Three distinct pages (`page-0.png`, `page-1.png`, `page-3.png`) stored under `fixtures/source-assets/`.

---

## 3. Rendered Image Specifications & Visual Inspection

### Asset 1: `acqua-hh-menu-page-0.png` (Page Index 0 / Page 1 of 4)
- **File Path:** `fixtures/source-assets/acqua-hh-menu-page-0.png`
- **Dimensions:** 792 × 1223 pixels
- **Byte Size:** 761,535 bytes (~744 KiB, < 5 MiB ceiling)
- **SHA-256:** `ffc2e17aa9857d94cb7f892aef7489653f48b736c7f8c030195a90be91009653`
- **Visual Inspection Outcome:**
  - **Header:** Large bold white title on teal background: `HAPPY HOUR SNACKS`.
  - **Deal Evidence:** Stated in bright yellow text: `FRESH OYSTERS* $1.75 /EACH`.
  - **Description & Condition:** `Champagne Sabayon, Peach Granita, Lemon Wedges (Min. 6 pcs)`.
  - **Health Warning:** Footnote with asterisk: `* The consumption of RAW oysters poses an increased risk of foodborne illness. A cooking step is needed to eliminate potential bacterial or viral contamination.`
  - **Other Items Displayed:**
    - `ACQUA SLIDER MINI-ORGANIC $13` (Beef Patties, Aged Cheddar, Mustard Aioli)
    - `FRIES' BASKET $12` (Sweet Potato Fries, Truffle Fries, Potato Wedges)
    - `BRUSSELS SPROUTS $12` (Balsamic Vinaigrette, Capers, Truffle Oil, Parmesan)
    - `NACHOS $15` (Salsa Fresca, Jalapenos, Black Beans, Sour Cream; Add Chicken $6, Beef $6, Guacamole $4)
    - `FIRE DUSTED CALAMARI $14` (Cucumber, Scallions, Jalapenos, Garlic & Lime Aioli)
    - `CHICKEN QUESADILLA $15` (Peppers, Roast Chicken, Cheese Blend, Salsa, Sour Cream)
    - `CHICKEN WINGS $15` (Hot, Teriyaki or Cajun Dusted, Ranch & Celery)
  - **Imagery:** Three authentic photographed food/drink plates on the left margin (drinks toast, calamari platter, chicken wings).

---

### Asset 2: `acqua-hh-menu-page-1.png` (Page Index 1 / Page 2 of 4)
- **File Path:** `fixtures/source-assets/acqua-hh-menu-page-1.png`
- **Dimensions:** 792 × 1223 pixels
- **Byte Size:** 374,221 bytes (~365 KiB, < 5 MiB ceiling)
- **SHA-256:** `758e00135c464453b34e7b0f761232cf24a8351adeb2c8e2224804cd788292d8`
- **Visual Inspection Outcome:**
  - **Header:** Prominent red title on cream background: `HAPPY HOUR`.
  - **Schedule Evidence (Multi-Window):**
    - `SUNDAY & MONDAY : 4 - 6 PM`
    - `TUESDAY - SATURDAY: 4 - 6 PM & 9 - 10 PM`
  - **Beverage Deals:**
    - `WHITE OR RED – 5 OZ · $6`
    - `PROSECCO – 5 OZ · $7`
    - `DRAUGHT BEER – 16 OZ · $6`
    - `BOTTLE BEER – $6` (Labatt, Molson Canadian, Kokanee, Bud Light, Budweiser, Coors Light)
    - `STRAWBERRY APEROL SPRITZ - $8.5`
    - `HIGHBALLS: VODKA, GIN, RUM, TEQUILA – 1 OZ · $6`
  - **Establishment Address & Contact Evidence:**
    - `Prices Not Including Taxes & Gratuities`
    - `4201 Lougheed HWY, Burnaby, BC`
    - `www.acquarestaurantandbar.com`
    - `(604) 297 - 2118`
  - **Imagery:** Centered photograph of two beer steins toasting.

---

### Asset 3: `acqua-hh-menu-page-3.png` (Page Index 3 / Page 4 of 4)
- **File Path:** `fixtures/source-assets/acqua-hh-menu-page-3.png`
- **Dimensions:** 792 × 1223 pixels
- **Byte Size:** 912,207 bytes (~891 KiB, < 5 MiB ceiling)
- **SHA-256:** `7258d6beaaec7db5520e616c0d180e180090caa11b036cd2466b5315e72c1dff`
- **Visual Inspection Outcome:**
  - **Header:** Large white title on teal background: `PATIO MENU`.
  - **Deal Evidence:** Stated in white bold text: `FRESH OYSTERS $1.5/ EACH`.
  - **Description & Condition:** `Champagne Sabayon, Peach Granita, Lemon Wedges (Min. 6 pcs)`.
  - **Other Items Displayed:**
    - `APPETIZER PLATTER $38` (Crispy calamari, Chicken wings, Crab and sundried tomato dip, Roasted cauliflower)
    - `CHEESE PLATTER $14` (Any 5 types of cheese)
    - `SHRIMP GYOZA $14` (Kimchi, Fresh lime, Wasabi aioli)
    - `FRASE VALLEY PATE $14` (Free range chicken liver, Cornichons, Crostini)
    - `SHISHITO PEPPERS $14` (Blistered shishito peppers, Himalayan pink salt, Tamarind chutney)
    - `ARANCINI $14` (Biodynamic carnaroli rice, Manchego cheese, Tomato fondue, Parmesan)
    - `ACQUA FLAT BREAD $14` (Prosciutto, Fig, Goat cheese, Fresh basil)
    - `ACQUA SLIDER MINI-ORGANIC $14` (Beef patties, Aged cheddar, Mustard aioli — note: $14 vs $13 on Page 0)
    - `RIGATONI BOLOGNESE $14` (Basil tomato sauce, Parmesan cheese, Parsley)
  - **Imagery:** Three authentic photographs on the right margin (chicken wings plate, outdoor patio seating with blue umbrellas, pasta dish with braised short ribs).

*(Omitted Page 2 contains "Thursday & Friday Features $51 Sharing Platter" and was not rendered to maintain the 3-asset bound on core happy hour/deal pages).*

---

## 4. Contractual Evidence & Analysis

### A. Fresh Oysters Price Discrepancy
- **Page 0 (`HAPPY HOUR SNACKS`):** `FRESH OYSTERS* $1.75 /EACH (Min. 6 pcs)`
- **Page 3 (`PATIO MENU`):** `FRESH OYSTERS $1.5/ EACH (Min. 6 pcs)`
- **Evaluation:** Both sections describe the exact same culinary preparation: `Champagne Sabayon, Peach Granita, Lemon Wedges (Min. 6 pcs)`. The $0.25 price divergence between the main Happy Hour snacks list ($1.75) and the Patio Menu ($1.50) is an internal publisher discrepancy. Neither price can be asserted as definitive without human or live restaurant verification.

### B. Operating Hours & Schedule Structure
- **Page 1 (`HAPPY HOUR`):**
  - Sunday & Monday: `16:00 - 18:00`
  - Tuesday - Saturday: `16:00 - 18:00` and `21:00 - 22:00`
- **Schema Boundary:** The DishDeals schema supports a single contiguous `validStart`/`validEnd` pair per deal record. Merging the afternoon and late-night windows into a single broad window would falsely suggest the deal is active between 18:00 and 21:00. These hours must either be split into separate candidate variants (e.g. afternoon vs late-night) or remain pending.

### C. Address & Establishment Identity
- **Address:** `4201 Lougheed HWY, Burnaby, BC` (located at Executive Suites Hotel Burnaby).
- **Phone:** `(604) 297 - 2118`.
- **Website:** `www.acquarestaurantandbar.com`.

---

## 5. Strict Project Boundaries & What Is NOT In This Ticket

1. **Not Physical Flyer Photos:** These images are digitally rendered from a public PDF menu. They do not fulfill the requirement for two genuine photographs of physical paper flyers (which remain pending human physical acquisition).
2. **Not Instagram Media:** These are not video frames or share sheet payloads from Instagram.
3. **No Simulated Extraction JSONs:** No mock VLM extraction outputs (`fixtures/demo/*.json`) are created. Live model extraction tests must only occur when authorized with real provider credentials.
4. **No Guessed Currency:** Stated prices display `$` without ISO currency; numeric `priceCad` remains `null`.
5. **No Coordinates:** Geocoding and map pin confirmation remain strictly owned by Pinyuan; coordinates are omitted.
