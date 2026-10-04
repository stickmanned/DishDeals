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
        let postLink = "https://www.instagram.com/p/EXAMPLE123/"
        try check((try? ShareStore.normalize("https://m.instagram.com/p/EXAMPLE123/?igsh=123")) == postLink, "post link preserves /p/ canonical")
        try check((try? ShareStore.normalize("https://instagram.com/reels/EXAMPLE123/")) == link, "alias /reels/ normalizes to /reel/")
        try check((try? ShareStore.resolveLink([link, postLink])) == nil, "same shortcode with different kinds rejected as different links")
        try check(ShareStore.sourceKind(postLink) == "post", "sourceKind identifies post")
        try check(ShareStore.sourceKind(link) == "reel", "sourceKind identifies reel")
        try check(ShareStore.sourceKind("https://example.com") == "unknown", "sourceKind unknown for non-instagram")
        try check(ShareStore.sourceKind("https://user:pass@instagram.com/reel/EXAMPLE123/") == "unknown", "sourceKind unknown for credentials")
        try check(ShareStore.sourceKind("https://instagram.com:8080/p/EXAMPLE123/") == "unknown", "sourceKind unknown for custom port")
        try check(ShareStore.sourceKind("http://instagram.com/p/EXAMPLE123/") == "unknown", "sourceKind unknown for http")
        try check(ShareStore.sourceKind("https://evil.com/?q=/p/EXAMPLE123/") == "unknown", "sourceKind unknown for substring")
        try check(ShareStore.sourceKind(nil) == "unknown", "sourceKind unknown for nil")
        try check((try? ShareStore.resolveLink([link, "https://www.instagram.com/reel/OTHER9999/"])) == nil, "different links rejected")
        try check((try? ShareStore.resolveLink([link + " https://example.com/menu"])) == nil, "mixed link in fragment rejected")
        try check((try? ShareStore.resolveLink(["https://example.com/menu"])) == nil, "no supported link")
        try check((try? ShareStore.resolveLink(["just text", link])) == link, "link found after plain text")
        try check((try? ShareStore.resolveLink(["just text", postLink])) == postLink, "post link found after plain text")
        // Review corrections: masquerading numbers, malformed present context.
        func ctxWith(_ key: String, _ value: Any) -> [String: Any] {
            var base: [String: Any] = ["version": 1, "textFragments": [String](), "registeredTypes": [String](), "receivedAt": 1.0, "truncated": false]
            base[key] = value; return base
        }
        try check(ShareStore.isValidContext(ctxWith("receivedAt", 5.0)), "baseline valid")
        try check(!ShareStore.isValidContext(ctxWith("version", "1")), "string version rejected")
        try check(!ShareStore.isValidContext(ctxWith("version", true)), "bool version rejected")
        try check(!ShareStore.isValidContext(ctxWith("version", 1.5)), "fractional version rejected")
        try check(!ShareStore.isValidContext(ctxWith("receivedAt", "5")), "string clock rejected")
        try check(!ShareStore.isValidContext(ctxWith("receivedAt", true)), "bool clock rejected")
        try check(!ShareStore.isValidContext(ctxWith("receivedAt", Double.nan)), "NaN clock rejected")
        try check(!ShareStore.isValidContext(ctxWith("truncated", 1)), "numeric truncated rejected")
        try check(!ShareStore.isValidContext(ctxWith("textFragments", [1])), "non-string fragments rejected")
        try check(!ShareStore.isValidContext(nil) && !ShareStore.isValidContext("x") && !ShareStore.isValidContext([1]), "non-dictionary rejected")
        for (label, bad) in [("string", "oops" as Any), ("array", [1, 2] as Any), ("number", 7 as Any), ("string version", ctxWith("version", "1") as Any), ("string clock", ctxWith("receivedAt", "5") as Any)] {
            let parsed = ShareStore.record(from: try recordData(bad), now: now)
            try check(parsed?.context?["truncated"] as? Bool == true && ShareStore.isValidContext(parsed?.context), "malformed present context is explicit truncated marker: " + label)
        }
        // Oldest-match selection and receipt cleanup (pure helpers used by the actual records code).
        func entry(_ name: String, _ saved: Double, _ source: String?, _ marker: String, kind: String = "item", routed: Bool = false) -> (URL, ShareStore.Record) {
            (URL(fileURLWithPath: "/inbox/" + name + ".json"), (kind, marker, saved, source, ShareStore.makeContext(texts: [marker], types: [], receivedAt: saved), routed))
        }
        let other = "https://www.instagram.com/reel/OTHER9999/"
        let pool = [entry("b", now - 20, link, "newer-share"), entry("a", now - 50, link, "older-share", routed: true),
                    entry("c", now - 30, other, "unrelated"), entry("d", now - 10, nil, "no-source", kind: "link")]
        let oldest = ShareStore.oldestMatch(source: link, in: pool)
        try check(oldest?.0.lastPathComponent == "a.json" && (oldest?.1.context?["textFragments"] as? [String]) == ["older-share"], "context selection is oldest pending (routed retained) match")
        try check(ShareStore.oldestMatch(source: other, in: pool)?.1.value == "unrelated", "selection scoped to source")
        try check(ShareStore.oldestMatch(source: "https://www.instagram.com/reel/NONE00000/", in: pool) == nil, "no match yields nil")
        let tie = [entry("z", now - 5, link, "z"), entry("m", now - 5, link, "m")]
        try check(ShareStore.oldestMatch(source: link, in: tie)?.0.lastPathComponent == "m.json", "deterministic tie by file name")
        var remaining = pool
        for step in 0..<3 {   // receipt removes exactly the consumed record each time
            guard let consumed = ShareStore.oldestMatch(source: link, in: remaining) else { try check(step == 2, "receipts exhaust matches"); break }
            remaining.removeAll { $0.0 == consumed.0 }
            try check(remaining.contains { $0.1.value == "unrelated" } && remaining.contains { $0.1.value == "no-source" }, "receipt keeps unrelated records")
            if step == 0 { try check(remaining.contains { $0.0.lastPathComponent == "b.json" }, "receipt keeps newer same-link share") }
        }
        try check(remaining.count == 2 && ShareStore.oldestMatch(source: link, in: remaining) == nil, "same-link shares consumed oldest-first, one per receipt")
        try check(ShareStore.isOlder(pool[1], pool[0]) && !ShareStore.isOlder(pool[0], pool[1]), "shared ordering with first()")
        // Summary derives from the FINAL context.
        let finalCtx = ShareStore.makeContext(texts: (0..<9).map { "t\($0)" }, types: ["public.url", "public.plain-text"], receivedAt: now)
        let truncSummary = ShareStore.summary(context: finalCtx, offeredDistinctTypes: 2, loadedURL: true, loadedText: true)
        try check(truncSummary.contains("truncated") && truncSummary.contains("public.url, public.plain-text") && truncSummary.contains("link and text"), "summary shows truncation from makeContext flag and all types")
        let cleanSummary = ShareStore.summary(context: ctx, offeredDistinctTypes: 2, loadedURL: false, loadedText: false)
        try check(!cleanSummary.contains("truncated") && cleanSummary.contains("no link or text") && cleanSummary.contains("No video was loaded."), "complete summary has no truncation notice")
        let bounded = ShareStore.makeContext(texts: [], types: (0..<40).map { "type.\($0)" }, receivedAt: now)
        let boundedSummary = ShareStore.summary(context: bounded, offeredDistinctTypes: 40, loadedURL: false, loadedText: false)
        try check((0..<32).allSatisfy { boundedSummary.contains("type.\($0)") } && !boundedSummary.contains("type.32") && boundedSummary.contains("8 type identifiers omitted") && boundedSummary.contains("truncated"), "all 32 bounded types listed, omitted count stated")
        print("ShareStore synthetic Foundation checks: \(checks) passed")
    }
}
