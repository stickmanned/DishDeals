# T-06B-ASSETS Handoff · Genuine Source-Menu Image Preparation

- **Status**: Complete and verified locally; ready for coordination review.
- **Owner**: Prism (Gemini / Antigravity Research Specialist)
- **Branch**: `t-06-source-menu-assets`
- **Worktree**: `/Users/william/Code/DishDeals-worktrees/source-menu-assets`
- **Base SHA**: `2011bf915bff0c25abc8d06cecebe30d0fc78a7b` (origin/main)
- **Scope and Allowed Paths**:
  - `fixtures/source-assets/`
  - `docs/data/source-assets.md`
  - `docs/handoffs/t-06b-assets.md`

---

## 1. Summary of Deliverables

1. **Original PDF Document Preserved:**
   - `fixtures/source-assets/Acqua-HH-Menu-05-2026.pdf`
   - Retrieved directly via HTTP GET from `https://acquarestaurantandbar.com/pdf/Acqua-HH-Menu-05-2026.pdf`.
   - Verified size: `3,225,876` bytes; Header: `%PDF-1.4%`; SHA-256: `92041867c10159c3ee6e2664ecb250b1f203a71c4b8c22738ad9fa4914954886`.
   - Document structure: 4 total pages, half-letter format (396 × 612 pt).
2. **Three Genuine Rendered PNG Images (Zero Tool Installation):**
   - Rendered using Apple macOS native `PDFKit` via `/usr/bin/swift` at 2× scale (792 × 1223 px), with opaque white background and lossless 24-bit RGB encoding. All bounded well below 5 MiB:
     - `fixtures/source-assets/acqua-hh-menu-page-0.png`: Page index 0 (761,535 bytes, SHA-256 `ffc2e17a...`). Contains `HAPPY HOUR SNACKS`, `FRESH OYSTERS* $1.75 /EACH (Min. 6 pcs)`, raw consumption warning, sliders, nachos, wings.
     - `fixtures/source-assets/acqua-hh-menu-page-1.png`: Page index 1 (374,221 bytes, SHA-256 `758e0013...`). Contains `HAPPY HOUR`, split operating schedule (`Sun & Mon: 4 - 6 PM`, `Tue - Sat: 4 - 6 PM & 9 - 10 PM`), drinks pricing, address `4201 Lougheed HWY, Burnaby, BC`, phone `(604) 297 - 2118`.
     - `fixtures/source-assets/acqua-hh-menu-page-3.png`: Page index 3 (912,207 bytes, SHA-256 `7258d6be...`). Contains `PATIO MENU`, `FRESH OYSTERS $1.5/ EACH (Min. 6 pcs)`, gyoza, pate, shishito peppers, arancini, flatbread, sliders.
3. **Structured Manifest & Documentation:**
   - `fixtures/source-assets/manifest.json`: JSON manifest recording all asset paths, resolutions, byte sizes, SHA-256 hashes, retrieval headers, deal terms, and boundary disclosures.
   - `fixtures/source-assets/README.md`: Directory guide with exact Swift rendering command, file table, and usage notes.
   - `docs/data/source-assets.md`: Comprehensive documentation with visual inspection findings, page-by-page analysis, price discrepancy breakdown, and boundary disclosures.

---

## 2. Visual Inspection Findings

All 3 rendered PNG images were visually inspected using the workspace `view_file` image tool:
- **Page 0:** Typography is sharp, colors are rich (teal background, bold white and yellow text), and food photography on the left margin is clear. Stated oyster price (`$1.75 /EACH`) and minimum 6 piece condition are unmistakable.
- **Page 1:** High-contrast red and cream layout. Operating hours (`4 - 6 PM` and `9 - 10 PM`) and the Burnaby street address (`4201 Lougheed HWY`) are legible.
- **Page 3:** Crisp layout with outdoor patio photography and food plates. The patio oyster price (`$1.5/ EACH`) and minimum 6 piece requirement are completely clear, confirming the $0.25 price discrepancy with Page 0.

---

## 3. Checks Actually Run

| Command / Check | Result | Evidence / Notes |
| :--- | :--- | :--- |
| **PDF Download & Header Verification** | **PASS (HTTP 200, %PDF-1.4%)** | 3,225,876 bytes downloaded from primary publisher URL. Header starts with `%PDF-1.4%`. |
| **PDF SHA-256 Verification** | **PASS** | Hash: `92041867c10159c3ee6e2664ecb250b1f203a71c4b8c22738ad9fa4914954886`. |
| **PDF Page Count Inspection** | **PASS (4 pages)** | Verified via Swift `PDFDocument.pageCount == 4`. MediaBox: `396.0 × 612.0 pt`. |
| **Native Swift Rendering** | **PASS (3 distinct pages)** | Rendered pages 0, 1, and 3 without installing any third-party or global tools. |
| **Image Size Bound (< 5 MiB)** | **PASS** | 761 KiB, 374 KiB, 912 KiB (all < 1 MiB, well below the 5 MiB ceiling). |
| **Image SHA-256 Verification** | **PASS** | Computed and recorded in `manifest.json`, `README.md`, and `docs/data/source-assets.md`. |
| **Visual Inspection via View Tool** | **PASS** | Inspected all 3 PNG images; text, prices, hours, and conditions verified readable. |
| **Manifest & Hash Parity** | **PASS** | Verified that `manifest.json` exactly matches the physical file hashes and Candidate `CAND-11` metadata. |
| **Central Ownership Checker** | **PASS (exit 0)** | `node /tmp/dishdeals-owner-check.mjs T-06B-ASSETS` approved centralized packet ownership. |
| **Git Working Tree Inspection** | **PASS** | All modified/created files strictly within `allowedPaths`. |

---

## 4. Contractual Disclosures & Explicitly Pending Scope

1. **Media Type:** These assets are **genuine rendered digital menu page images** from an official restaurant PDF. They are **NOT** physical paper flyer photographs (which remain pending human acquisition) and **NOT** native Instagram video/post shares.
2. **No Simulated Extraction JSONs:** No simulated VLM outputs (`fixtures/demo/*.json`) were generated. Live model extraction tests remain pending authorized execution with real provider credentials.
3. **Currency:** Stated prices display `$` without ISO currency; numeric `priceCad` remains `null`.
4. **Coordinates:** Geocoding and map pin confirmation remain strictly owned by Pinyuan; coordinates are omitted.
5. **Price Conflict:** The conflict between Page 0 ($1.75/pc min 6) and Page 3 ($1.50/pc min 6) is an authentic publisher inconsistency preserved for downstream human review.
6. **Phone / Native Integration:** Native iOS share sheet and device testing remain pending downstream integration.
