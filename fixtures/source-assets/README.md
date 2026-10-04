# Source Menu Assets (`fixtures/source-assets/`)

This directory contains genuine source-menu artifacts prepared for **T-06B-ASSETS** from the primary publisher PDF for Acqua Restaurant & Bar (Candidate `CAND-11`).

---

## 1. Primary Source Document

- **Filename:** `Acqua-HH-Menu-05-2026.pdf`
- **Source URL:** `https://acquarestaurantandbar.com/pdf/Acqua-HH-Menu-05-2026.pdf`
- **HTTP Status:** 200 OK
- **MIME Type:** `application/pdf`
- **Header:** `%PDF-1.4%`
- **Byte Size:** `3,225,876` bytes (~3.08 MiB)
- **SHA-256 Hash:** `92041867c10159c3ee6e2664ecb250b1f203a71c4b8c22738ad9fa4914954886`
- **Retrieval Timestamp:** `2026-10-04T06:11:43Z` (Server Date: `Sun, 04 Oct 2026 06:10:40 GMT`, Last-Modified: `Tue, 08 Sep 2026 20:16:02 GMT`)
- **Page Count:** 4 pages
- **Page Dimensions (MediaBox):** 396.0 pt × 612.0 pt (half-letter format)

---

## 2. Rendered Image Assets

Three distinct, non-duplicate pages were rendered at 2× scale (792 × 1223 pixels) using Apple macOS native `PDFKit` via Swift (`/usr/bin/swift`, zero external package installation). All images are bounded well below the 5 MiB ceiling.

| Filename | Page Index (0-based) | Section Title | Resolution | Byte Size | SHA-256 Hash | Key Content / Deal Terms |
| :--- | :---: | :--- | :---: | :---: | :--- | :--- |
| `acqua-hh-menu-page-0.png` | 0 (Page 1) | HAPPY HOUR SNACKS | 792 × 1223 | 761,535 bytes | `ffc2e17aa9857d94cb7f892aef7489653f48b736c7f8c030195a90be91009653` | FRESH OYSTERS* $1.75 /EACH (Min. 6 pcs); raw consumption health warning; sliders $13, fries $12, brussels sprouts $12, nachos $15, calamari $14, quesadilla $15, wings $15. |
| `acqua-hh-menu-page-1.png` | 1 (Page 2) | HAPPY HOUR (DRINKS & HOURS) | 792 × 1223 | 374,221 bytes | `758e00135c464453b34e7b0f761232cf24a8351adeb2c8e2224804cd788292d8` | Schedule: Sun & Mon 4–6 PM; Tue–Sat 4–6 PM & 9–10 PM. Address: 4201 Lougheed HWY, Burnaby, BC. Phone: (604) 297-2118. Drinks: $6 beer/wine/highballs, $7 prosecco, $8.5 spritz. |
| `acqua-hh-menu-page-3.png` | 3 (Page 4) | PATIO MENU | 792 × 1223 | 912,207 bytes | `7258d6beaaec7db5520e616c0d180e180090caa11b036cd2466b5315e72c1dff` | FRESH OYSTERS $1.5/ EACH (Min. 6 pcs); gyoza $14, pate $14, shishito peppers $14, arancini $14, flatbread $14, sliders $14, rigatoni $14, platters $14/$38. |

*(Note: Page 2 of the PDF contains "Thursday & Friday Features $51 Sharing Platter" and was omitted in favor of the three deal-grounding pages above).*

---

## 3. Exact Rendering Command

Rendering was performed via macOS Native PDFKit in Swift without installing any global or third-party tools:

```bash
swift -e '
import Foundation
import PDFKit
import AppKit

let pdfUrl = URL(fileURLWithPath: "fixtures/source-assets/Acqua-HH-Menu-05-2026.pdf")
guard let doc = PDFDocument(url: pdfUrl) else { exit(1) }

let pagesToRender = [0, 1, 3]
let scaleFactor: CGFloat = 2.0

for pageIndex in pagesToRender {
    guard let page = doc.page(at: pageIndex) else { continue }
    let pageRect = page.bounds(for: .mediaBox)
    let width = Int(pageRect.width * scaleFactor)
    let height = Int(pageRect.height * scaleFactor)
    
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
    guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: colorSpace, bitmapInfo: bitmapInfo) else { continue }
    
    context.setFillColor(CGColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    context.scaleBy(x: scaleFactor, y: scaleFactor)
    page.draw(with: .mediaBox, to: context)
    
    guard let cgImage = context.makeImage() else { continue }
    let bitmapRep = NSBitmapImageRep(cgImage: cgImage)
    guard let pngData = bitmapRep.representation(using: .png, properties: [:]) else { continue }
    
    let outUrl = URL(fileURLWithPath: String(format: "fixtures/source-assets/acqua-hh-menu-page-%d.png", pageIndex))
    try pngData.write(to: outUrl)
}
'
```

---

## 4. Contractual Disclosures & Boundaries

1. **Price Conflict:** Page 0 lists Fresh Oysters at `$1.75 /EACH (Min. 6 pcs)`, whereas Page 3 (Patio Menu) lists Fresh Oysters at `$1.5/ EACH (Min. 6 pcs)`. Both pages require minimum 6 pieces. Stated amounts remain unconfirmed until human/team review resolves the active pricing.
2. **Currency:** Stated currency uses `$` without ISO code; CAD confirmation remains pending.
3. **Multi-Window Schedule:** Page 1 records distinct operating windows: Sunday & Monday 4–6 PM vs Tuesday–Saturday 4–6 PM & 9–10 PM. The DishDeals schema only supports a single contiguous window; multi-window models require variant records or pending status.
4. **Media Classification:** These files are **rendered public digital menu pages** from an official PDF. They are **NOT** physical paper flyer photographs (which remain pending human acquisition) and **NOT** native Instagram video/post shares.
5. **No Extraction Outputs:** No simulated VLM extraction JSONs (`fixtures/demo/*.json`) are generated in this ticket.
6. **No Coordinates:** Geocoding and map pin confirmation remain strictly owned by Pinyuan; coordinates are omitted.
