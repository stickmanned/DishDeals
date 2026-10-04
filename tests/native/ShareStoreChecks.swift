// Deterministic synthetic Foundation checks. No App Group, Keychain, HTTP or phone evidence.
import Foundation

@main struct ShareStoreChecks {
    static func main() throws {
        let now = 2_000_000.0
        var checks = 0
        func check(_ passed: Bool, _ label: String) throws {
            guard passed else { throw NSError(domain: "ShareStoreChecks", code: 1, userInfo: [NSLocalizedDescriptionKey: label]) }
            checks += 1
        }
        func data(_ kind: String, _ value: String, _ savedAt: Any) throws -> Data {
            try JSONSerialization.data(withJSONObject: ["kind": kind, "value": value, "savedAt": savedAt])
        }
        let link = "https://www.instagram.com/reel/EXAMPLE123/"
        let parsed = ShareStore.record(from: try data("link", link + "?utm_source=fixture", now - 10), now: now)
        try check(parsed?.value == link && parsed?.kind == "link", "normalized source link")
        try check(ShareStore.record(from: try data("item", "Item123", now - 1), now: now)?.value == "Item123", "item ID accepted")
        try check(ShareStore.record(from: try data("item", "Item123", now), now: now) != nil, "current instant accepted")
        try check(ShareStore.record(from: try data("item", "Item123", now - 86399), now: now) != nil, "within retention")
        try check(ShareStore.record(from: try data("item", "Item123", now - 86400), now: now) == nil, "expiry boundary")
        try check(ShareStore.record(from: try data("item", "Item123", now + 1), now: now) == nil, "future timestamp rejected")
        try check(ShareStore.record(from: try data("item", "Item123", true), now: 2) == nil, "boolean is not timestamp")
        try check(ShareStore.record(from: try data("item", "Item123", "2000000"), now: now) == nil, "string is not timestamp")
        try check(ShareStore.record(from: Data("invalid".utf8), now: now) == nil, "malformed JSON")
        try check(ShareStore.record(from: Data("{}".utf8), now: now) == nil, "missing record fields")
        try check(ShareStore.record(from: try data("other", "Item123", now), now: now) == nil, "unknown kind")
        try check(ShareStore.record(from: try data("item", "bad/id", now), now: now) == nil, "unsafe item ID")
        try check(ShareStore.record(from: try data("item", String(repeating: "a", count: 129), now), now: now) == nil, "oversized ID")
        try check(ShareStore.record(from: try data("link", "https://www.instagram.com/profile/", now), now: now) == nil, "unsupported source")
        try check(ShareStore.record(from: try data("link", link + " " + link, now), now: now) == nil, "multiple source links")
        try check(ShareStore.record(from: try data("link", "https://example.invalid/reel/EXAMPLE123/", now), now: now) == nil, "wrong origin")
        try check(ShareStore.record(from: try data("link", link + String(repeating: "x", count: 7000), now), now: now) == nil, "bounded record")
        try check(ShareStore.record(from: try data("item", "Item123", now), now: .nan) == nil, "invalid current clock")
        print("ShareStore synthetic Foundation checks: \(checks) passed")
    }
}
