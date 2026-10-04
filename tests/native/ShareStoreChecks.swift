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
        // Native supplied-context v1 checks.
        let ctx = ShareStore.makeContext(texts: ["Great pizza " + link, "Great pizza " + link, "second"], types: ["public.url", "public.url", "public.plain-text"], receivedAt: now)
        try check(ShareStore.isValidContext(ctx) && ctx["truncated"] as? Bool == false, "valid complete context")
        try check((ctx["textFragments"] as? [String])?.count == 2 && (ctx["registeredTypes"] as? [String])?.count == 2, "distinct fragments and types")
        let many = ShareStore.makeContext(texts: (0..<9).map { "t\($0)" }, types: (0..<33).map { "type.\($0)" }, receivedAt: now)
        try check((many["textFragments"] as? [String])?.count == 8 && (many["registeredTypes"] as? [String])?.count == 32 && many["truncated"] as? Bool == true, "count bounds set truncated")
        let big = ShareStore.makeContext(texts: [String(repeating: "é", count: 4000), String(repeating: "b", count: 4096), String(repeating: "c", count: 4096), "d"], types: [String(repeating: "x", count: 201)], receivedAt: now)
        try check(ShareStore.isValidContext(big) && big["truncated"] as? Bool == true && (big["registeredTypes"] as? [String])?.isEmpty == true, "byte bounds and oversize type")
        try check(((big["textFragments"] as? [String]) ?? []).reduce(0, { $0 + $1.utf8.count }) <= 12000, "combined text bound")
        try check(ShareStore.makeContext(texts: [], types: [], receivedAt: .nan)["receivedAt"] as? Double == 0, "invalid clock clamped")
        try check(ShareStore.makeContext(texts: [], types: [], receivedAt: now, truncated: true)["truncated"] as? Bool == true, "load failure marker kept")
        let controls = ShareStore.makeContext(texts: [String(repeating: "\u{1}", count: 4000), String(repeating: "\u{2}", count: 4000)], types: [], receivedAt: now)
        try check(ShareStore.isValidContext(controls) && controls["truncated"] as? Bool == true, "JSON size bound")
        func recordData(_ context: Any?) throws -> Data {
            var body: [String: Any] = ["kind": "link", "value": link, "savedAt": now - 5]
            if let context = context { body["nativeContext"] = context }
            return try JSONSerialization.data(withJSONObject: body)
        }
        try check(ShareStore.record(from: try recordData(nil), now: now)?.context == nil, "old record has no context")
        let withContext = ShareStore.record(from: try recordData(ctx), now: now)
        try check(withContext != nil && withContext?.context != nil && ShareStore.isValidContext(withContext?.context), "context record round trip")
        for (label, bad) in [("bad version", ["version": 2, "textFragments": [String](), "registeredTypes": [String](), "receivedAt": 1.0, "truncated": false] as [String: Any]),
                             ("extra key", ["version": 1, "textFragments": [String](), "registeredTypes": [String](), "receivedAt": 1.0, "truncated": false, "x": 1] as [String: Any]),
                             ("negative clock", ["version": 1, "textFragments": [String](), "registeredTypes": [String](), "receivedAt": -1.0, "truncated": false] as [String: Any]),
                             ("duplicate fragments", ["version": 1, "textFragments": ["a", "a"], "registeredTypes": [String](), "receivedAt": 1.0, "truncated": false] as [String: Any]),
                             ("non-bool truncated", ["version": 1, "textFragments": [String](), "registeredTypes": [String](), "receivedAt": 1.0, "truncated": "no"] as [String: Any])] {
            let parsed = ShareStore.record(from: try recordData(bad), now: now)
            try check(parsed?.context?["truncated"] as? Bool == true && (parsed?.context?["textFragments"] as? [String])?.isEmpty == true, "invalid context becomes truncated marker: " + label)
        }
        try check(ShareStore.record(from: try recordData(NSNull()), now: now)?.context == nil, "null context treated as absent")
        let itemBody: [String: Any] = ["kind": "item", "value": "Item123", "savedAt": now - 1, "sourceUrl": link, "nativeContext": ctx, "routed": true]
        let item = ShareStore.record(from: try JSONSerialization.data(withJSONObject: itemBody), now: now)
        try check(item?.sourceUrl == link && item?.routed == true && item?.context != nil, "item record keeps source/context/routed")
        let orphan = ShareStore.record(from: try JSONSerialization.data(withJSONObject: ["kind": "item", "value": "Item123", "savedAt": now - 1, "sourceUrl": "https://example.invalid/x", "nativeContext": ctx] as [String: Any]), now: now)
        try check(orphan != nil && orphan?.sourceUrl == nil && orphan?.context == nil, "item with bad source drops binding")
        try check((try? ShareStore.resolveLink(["Look", link + "?igsh=1", "https://instagram.com/reel/EXAMPLE123"])) == link, "same link across fragments")
        try check((try? ShareStore.resolveLink([link, "https://www.instagram.com/reel/OTHER9999/"])) == nil, "different links rejected")
        try check((try? ShareStore.resolveLink([link + " https://example.com/menu"])) == nil, "mixed link in fragment rejected")
        try check((try? ShareStore.resolveLink(["https://example.com/menu"])) == nil, "no supported link")
        try check((try? ShareStore.resolveLink(["just text", link])) == link, "link found after plain text")
        print("ShareStore synthetic Foundation checks: \(checks) passed")
    }
}
