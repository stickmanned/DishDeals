import Foundation
import Security

enum ShareStore {
    static var group: String? { Bundle.main.object(forInfoDictionaryKey: "AppGroup") as? String }
    private static var keyQuery: [String: Any]? {
        guard let keyGroup = Bundle.main.object(forInfoDictionaryKey: "KeychainGroup") as? String,
              !keyGroup.isEmpty else { return nil }
        return [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "DinedealsReelSession", kSecAttrAccount as String: "accessToken",
        kSecAttrAccessGroup as String: keyGroup]
    }
    static func saveToken(_ token: String?) -> Bool {
        guard let query = keyQuery else { return false }
        if token == nil { let status = SecItemDelete(query as CFDictionary); return status == errSecSuccess || status == errSecItemNotFound }
        guard let token = token else { return false }
        let data = Data(token.utf8)
        let updated = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if updated == errSecSuccess { return true }
        guard updated == errSecItemNotFound else { return false }
        var addition = query
        addition[kSecValueData as String] = data
        addition[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(addition as CFDictionary, nil) == errSecSuccess
    }
    static func token() -> String? {
        guard var query = keyQuery else { return nil }
        query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    // Individual atomic files avoid lost updates between concurrently running app/extension processes.
    static var inbox: URL? {
        guard let group = group, !group.isEmpty,
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
        return container.appendingPathComponent("ReelInbox", isDirectory: true)
    }
    // MARK: native supplied-context v1 (see docs/integration/native-supplied-context-contract.md)
    static let maxRecordBytes = 32000
    static let maxFragments = 8, maxFragmentBytes = 4096, maxCombinedBytes = 12000
    static let maxTypes = 32, maxTypeBytes = 200, maxContextJSONBytes = 24000
    typealias Record = (kind: String, value: String, savedAt: Double, sourceUrl: String?, context: [String: Any]?, routed: Bool)

    private static func isBool(_ value: Any) -> Bool {
        guard let number = value as? NSNumber else { return false }
        return CFGetTypeID(number) == CFBooleanGetTypeID()
    }
    static func truncateUTF8(_ text: String, to limit: Int) -> String {
        if text.utf8.count <= limit { return text }
        var out = ""; var used = 0
        for character in text {
            let size = String(character).utf8.count
            if used + size > limit { break }
            out.append(character); used += size
        }
        return out
    }
    /// Builds a bounded v1 context. Any bound hit, drop or caller-reported load failure sets truncated=true.
    static func makeContext(texts: [String], types: [String], receivedAt: Double, truncated: Bool = false) -> [String: Any] {
        var lost = truncated
        var fragments: [String] = []; var combined = 0
        for text in texts {
            if text.isEmpty || fragments.contains(text) { continue }
            if fragments.count >= maxFragments { lost = true; continue }
            var piece = text
            if piece.utf8.count > maxFragmentBytes { piece = truncateUTF8(piece, to: maxFragmentBytes); lost = true }
            let room = maxCombinedBytes - combined
            if piece.utf8.count > room { piece = truncateUTF8(piece, to: room); lost = true }
            if piece.isEmpty { lost = true; continue }
            if fragments.contains(piece) { continue }
            fragments.append(piece); combined += piece.utf8.count
        }
        var identifiers: [String] = []
        for type in types {
            if type.isEmpty || identifiers.contains(type) { continue }
            if identifiers.count >= maxTypes || type.utf8.count > maxTypeBytes { lost = true; continue }
            identifiers.append(type)
        }
        var clock = receivedAt
        if !clock.isFinite || clock < 0 { clock = 0; lost = true }
        func build() -> [String: Any] {
            ["version": 1, "textFragments": fragments, "registeredTypes": identifiers, "receivedAt": clock, "truncated": lost]
        }
        while ((try? JSONSerialization.data(withJSONObject: build()).count) ?? Int.max) > maxContextJSONBytes {
            lost = true
            if !fragments.isEmpty { fragments.removeLast() } else if !identifiers.isEmpty { identifiers.removeLast() } else { break }
        }
        return build()
    }
    /// Strict versioned parser: exact keys, bounds, distinctness, finite clock, full JSON size.
    static func isValidContext(_ raw: Any?) -> Bool {
        guard let dict = raw as? [String: Any], Set(dict.keys) == ["version", "textFragments", "registeredTypes", "receivedAt", "truncated"],
              let version = dict["version"], !isBool(version), (version as? NSNumber)?.intValue == 1, (version as? NSNumber)?.doubleValue == 1,
              let fragments = dict["textFragments"] as? [String], let types = dict["registeredTypes"] as? [String],
              let clockValue = dict["receivedAt"], !isBool(clockValue), let clock = (clockValue as? NSNumber)?.doubleValue, clock.isFinite, clock >= 0,
              let flag = dict["truncated"], isBool(flag),
              fragments.count <= maxFragments, Set(fragments).count == fragments.count, fragments.allSatisfy({ $0.utf8.count <= maxFragmentBytes }),
              fragments.reduce(0, { $0 + $1.utf8.count }) <= maxCombinedBytes,
              types.count <= maxTypes, Set(types).count == types.count, types.allSatisfy({ $0.utf8.count <= maxTypeBytes }),
              JSONSerialization.isValidJSONObject(dict), let bytes = try? JSONSerialization.data(withJSONObject: dict), bytes.count <= maxContextJSONBytes
        else { return false }
        return true
    }
    /// Absent stays absent (old context-less record). Present-but-invalid becomes an explicit truncated marker, never "complete".
    static func context(from raw: Any?, fallbackReceivedAt: Double) -> [String: Any]? {
        guard let raw = raw, !(raw is NSNull) else { return nil }
        if isValidContext(raw), let dict = raw as? [String: Any] { return dict }
        return makeContext(texts: [], types: [], receivedAt: fallbackReceivedAt, truncated: true)
    }

    @discardableResult static func enqueue(_ value: String, kind: String, sourceUrl: String? = nil, context: [String: Any]? = nil, routed: Bool = false) throws -> URL {
        guard let inbox = inbox else { throw ShareFailure.configuration }
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let file = inbox.appendingPathComponent(UUID().uuidString + ".json")
        try write(value, kind: kind, savedAt: Date().timeIntervalSince1970, sourceUrl: sourceUrl, context: context, routed: routed, to: file)
        return file
    }
    private static func write(_ value: String, kind: String, savedAt: Double, sourceUrl: String?, context: [String: Any]?, routed: Bool, to file: URL) throws {
        var body: [String: Any] = ["kind": kind, "value": value, "savedAt": savedAt]
        if let sourceUrl = sourceUrl { body["sourceUrl"] = sourceUrl }
        if let context = context { body["nativeContext"] = context }
        if routed { body["routed"] = true }
        let bytes = try JSONSerialization.data(withJSONObject: body)
        guard bytes.count <= maxRecordBytes else { throw ShareFailure.invalid }
        // File protection and atomic replacement preserved for context-bearing records.
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func record(from data: Data, now: Double) -> Record? {
        guard data.count <= maxRecordBytes, now.isFinite,
              let record = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let saved = record["savedAt"] as? Double, saved.isFinite,
              !(record["savedAt"] is Bool), saved <= now, now - saved < 86400,
              let kind = record["kind"] as? String, let value = record["value"] as? String else { return nil }
        let routed = (record["routed"] as? Bool) == true
        let context = context(from: record["nativeContext"], fallbackReceivedAt: saved)
        if kind == "item", value.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil {
            let source = (record["sourceUrl"] as? String).flatMap { try? normalize($0) }
            return (kind, value, saved, source, source == nil ? nil : context, routed)
        }
        if kind == "link", let normalized = try? normalize(value) { return (kind, normalized, saved, normalized, context, routed) }
        return nil
    }
    /// Valid records with their files; invalid, oversize or expired files are deleted.
    private static func records() -> [(URL, Record)] {
        guard let inbox = inbox,
              let files = try? FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil) else { return [] }
        var valid: [(URL, Record)] = []
        let now = Date().timeIntervalSince1970
        for file in files {
            guard file.pathExtension == "json" else { continue }
            guard let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, size <= maxRecordBytes,
                  let data = try? Data(contentsOf: file), let parsed = record(from: data, now: now) else {
                try? FileManager.default.removeItem(at: file); continue
            }
            valid.append((file, parsed))
        }
        return valid
    }
    /// Oldest not-yet-routed record; routed item records are retained (for context recovery) until receipt or expiry.
    static func first() -> (URL, String, String, [String: Any]?)? {
        let pending = records().filter { !$0.1.routed }
        guard let oldest = pending.min(by: { $0.1.savedAt == $1.1.savedAt ? $0.0.lastPathComponent < $1.0.lastPathComponent : $0.1.savedAt < $1.1.savedAt }) else { return nil }
        return (oldest.0, oldest.1.kind, oldest.1.value, oldest.1.context)
    }
    static func markRouted(_ file: URL) {
        guard let data = try? Data(contentsOf: file), let parsed = record(from: data, now: Date().timeIntervalSince1970) else { return }
        try? write(parsed.value, kind: parsed.kind, savedAt: parsed.savedAt, sourceUrl: parsed.kind == "item" ? parsed.sourceUrl : nil, context: parsed.context, routed: true, to: file)
    }
    /// Newest stored context for exactly this normalized source, or nil (including old context-less records).
    static func context(forSource source: String) -> [String: Any]? {
        guard let normalized = try? normalize(source) else { return nil }
        let match = records().filter { $0.1.sourceUrl == normalized }.max(by: { $0.1.savedAt < $1.1.savedAt })
        return match?.1.context
    }
    /// Removes link and item recovery records for a source after the backend receipt.
    static func discard(source: String) {
        guard let normalized = try? normalize(source) else { return }
        for (file, parsed) in records() where parsed.sourceUrl == normalized { try? FileManager.default.removeItem(at: file) }
    }
    static func normalize(_ text: String) throws -> String {
        let detector = try NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let matches = detector.matches(in: text, range: NSRange(text.startIndex..., in: text))
        guard text.utf8.count <= 4096, matches.count == 1, let url = matches.first?.url else { throw ShareFailure.invalid }
        return try canonical(url)
    }
    private static func canonical(_ url: URL) throws -> String {
        guard url.scheme == "https", ["instagram.com", "www.instagram.com", "m.instagram.com"].contains(url.host ?? ""),
              url.user == nil, url.password == nil, url.port == nil else { throw ShareFailure.invalid }
        let pattern = "^/(?:reel|reels|p)/([A-Za-z0-9_-]{5,64})/?$"
        let regex = try NSRegularExpression(pattern: pattern)
        let path = url.path
        guard let match = regex.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)), let range = Range(match.range(at: 1), in: path) else { throw ShareFailure.invalid }
        return "https://www.instagram.com/reel/\(path[range])/"
    }
    /// One distinct supported link across all fragments; different links, or a supported link mixed with
    /// another link in one fragment, are ambiguous and rejected.
    static func resolveLink(_ texts: [String]) throws -> String {
        let detector = try NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        var supported = Set<String>()
        for text in texts where text.utf8.count <= 4096 {
            let urls = detector.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap { $0.url }
            let local = Set(urls.compactMap { try? canonical($0) })
            if !local.isEmpty && urls.contains(where: { (try? canonical($0)) == nil }) { throw ShareFailure.invalid }
            supported.formUnion(local)
        }
        guard supported.count == 1, let link = supported.first else { throw ShareFailure.invalid }
        return link
    }
    static func submit(_ url: String, context: [String: Any]? = nil) async throws -> String {
        guard let token = token() else { throw ShareFailure.signIn }
        guard let base = Bundle.main.object(forInfoDictionaryKey: "BackendURL") as? String,
              let endpoint = URL(string: base + "/api/mutation"), endpoint.scheme == "https", endpoint.host?.hasSuffix(".convex.cloud") == true else { throw ShareFailure.configuration }
        var request = URLRequest(url: endpoint, timeoutInterval: 15)
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        var args: [String: Any] = ["text": url, "retentionDays": 7]
        if let context = context, isValidContext(context) { args["nativeContext"] = context }
        request.httpBody = try JSONSerialization.data(withJSONObject: ["path": "reels:submit", "args": args, "format": "json"])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ShareFailure.network }
        if http.statusCode == 401 { throw ShareFailure.signIn }
        guard http.statusCode == 200, let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              json["status"] as? String == "success", let value = json["value"] as? [String: Any], let id = value["itemId"] as? String,
              id.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil else { throw ShareFailure.network }
        return id
    }
}
enum ShareFailure: Error { case invalid, signIn, network, configuration }
