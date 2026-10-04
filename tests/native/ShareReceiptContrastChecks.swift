// Deterministic native UIKit contrast regression checks.
// Verifies ShareViewController view.backgroundColor and status label textColor
// across both Light and Dark trait collections against WCAG 2.1 AA (>= 4.5:1).
import UIKit

@main
struct ShareReceiptContrastChecks {
    private static func sRGBToLinear(_ c: Double) -> Double {
        return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }

    private static func relativeLuminance(rgb: (r: Double, g: Double, b: Double)) -> Double {
        let r = sRGBToLinear(rgb.r)
        let g = sRGBToLinear(rgb.g)
        let b = sRGBToLinear(rgb.b)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    private static func contrastRatio(l1: Double, l2: Double) -> Double {
        let lighter = max(l1, l2)
        let darker = min(l1, l2)
        return (lighter + 0.05) / (darker + 0.05)
    }

    private static func sRGBComponents(_ color: UIColor, traits: UITraitCollection) -> (r: Double, g: Double, b: Double) {
        let resolved = color.resolvedColor(with: traits)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        if resolved.getRed(&r, green: &g, blue: &b, alpha: &a) {
            return (Double(r), Double(g), Double(b))
        }
        var white: CGFloat = 0
        if resolved.getWhite(&white, alpha: &a) {
            return (Double(white), Double(white), Double(white))
        }
        fatalError("Unable to extract RGB components from color \(resolved)")
    }

    @MainActor
    static func main() {
        let vc = ShareViewController()
        vc.loadViewIfNeeded()

        guard let bg = vc.view.backgroundColor else {
            fputs("FAIL: view.backgroundColor is nil\n", stderr)
            exit(1)
        }

        // Locate status UILabel in arranged subviews of the stack
        guard let stack = vc.view.subviews.first(where: { $0 is UIStackView }) as? UIStackView,
              let statusLabel = stack.arrangedSubviews.first(where: { $0 is UILabel }) as? UILabel
        else {
            fputs("FAIL: unable to find status UILabel in UIStackView hierarchy\n", stderr)
            exit(1)
        }

        // If textColor was not explicitly set on UILabel, UIKit defaults to UIColor.label
        let labelColor = statusLabel.textColor ?? .label

        let lightTraits = UITraitCollection(userInterfaceStyle: .light)
        let darkTraits = UITraitCollection(userInterfaceStyle: .dark)

        // Evaluate Light Mode
        let lightBgRGB = sRGBComponents(bg, traits: lightTraits)
        let lightTextRGB = sRGBComponents(labelColor, traits: lightTraits)
        let lightBgLum = relativeLuminance(rgb: lightBgRGB)
        let lightTextLum = relativeLuminance(rgb: lightTextRGB)
        let lightRatio = contrastRatio(l1: lightBgLum, l2: lightTextLum)

        // Evaluate Dark Mode
        let darkBgRGB = sRGBComponents(bg, traits: darkTraits)
        let darkTextRGB = sRGBComponents(labelColor, traits: darkTraits)
        let darkBgLum = relativeLuminance(rgb: darkBgRGB)
        let darkTextLum = relativeLuminance(rgb: darkTextRGB)
        let darkRatio = contrastRatio(l1: darkBgLum, l2: darkTextLum)

        let lightBgHex = String(format: "#%02X%02X%02X", Int(lightBgRGB.r * 255), Int(lightBgRGB.g * 255), Int(lightBgRGB.b * 255))
        let lightTextHex = String(format: "#%02X%02X%02X", Int(lightTextRGB.r * 255), Int(lightTextRGB.g * 255), Int(lightTextRGB.b * 255))
        let darkBgHex = String(format: "#%02X%02X%02X", Int(darkBgRGB.r * 255), Int(darkBgRGB.g * 255), Int(darkBgRGB.b * 255))
        let darkTextHex = String(format: "#%02X%02X%02X", Int(darkTextRGB.r * 255), Int(darkTextRGB.g * 255), Int(darkTextRGB.b * 255))

        print(String(format: "[ShareReceiptContrast] Light Mode: bg=%@ text=%@ ratio=%.2f:1", lightBgHex, lightTextHex, lightRatio))
        print(String(format: "[ShareReceiptContrast] Dark Mode:  bg=%@ text=%@ ratio=%.2f:1", darkBgHex, darkTextHex, darkRatio))

        guard lightRatio >= 4.5 else {
            fputs(String(format: "ASSERTION FAILURE: Light mode contrast ratio %.2f:1 < 4.5:1 (WCAG AA requirement)\n", lightRatio), stderr)
            exit(1)
        }

        guard darkRatio >= 4.5 else {
            fputs(String(format: "ASSERTION FAILURE: Dark mode contrast ratio %.2f:1 < 4.5:1 (WCAG AA requirement)\n", darkRatio), stderr)
            exit(1)
        }

        print("[ShareReceiptContrast] ALL CONTRAST ASSERTIONS PASSED (>= 4.5:1)")
        exit(0)
    }
}
