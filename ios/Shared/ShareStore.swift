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
    @discardableResult static func enqueue(_ value: String, kind: String) throws -> URL {
        guard let inbox = inbox else { throw ShareFailure.configuration }
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let bytes = try JSONSerialization.data(withJSONObject: ["kind": kind, "value": value, "savedAt": Date().timeIntervalSince1970])
        let file = inbox.appendingPathComponent(UUID().uuidString + ".json")
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return file
    }
    static func record(from data: Data, now: Double) -> (kind: String, value: String, savedAt: Double)? {
        guard data.count <= 6000, now.isFinite,
              let record = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let saved = record["savedAt"] as? Double, saved.isFinite,
              !(record["savedAt"] is Bool), saved <= now, now - saved < 86400,
              let kind = record["kind"] as? String, let value = record["value"] as? String else { return nil }
        if kind == "item", value.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil {
            return (kind, value, saved)
        }
        if kind == "link", let normalized = try? normalize(value) { return (kind, normalized, saved) }
        return nil
    }
    static func first() -> (URL, String, String)? {
        guard let inbox = inbox,
              let files = try? FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil) else { return nil }
        var valid: [(URL, String, String, Double)] = []
        let now = Date().timeIntervalSince1970
        for file in files {
            guard file.pathExtension == "json" else { continue }
            guard let size = (try? file.resourceValues(forKeys: [.fileSizeKey]))?.fileSize, size <= 6000,
                  let data = try? Data(contentsOf: file), let parsed = record(from: data, now: now) else {
                try? FileManager.default.removeItem(at: file); continue
            }
            valid.append((file, parsed.kind, parsed.value, parsed.savedAt))
        }
        guard let oldest = valid.min(by: { $0.3 == $1.3 ? $0.0.lastPathComponent < $1.0.lastPathComponent : $0.3 < $1.3 }) else { return nil }
        return (oldest.0, oldest.1, oldest.2)
    }
    static func normalize(_ text: String) throws -> String {
        let detector = try NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let matches = detector.matches(in: text, range: NSRange(text.startIndex..., in: text))
        guard text.utf8.count <= 4096, matches.count == 1, let url = matches.first?.url,
              url.scheme == "https", ["instagram.com", "www.instagram.com", "m.instagram.com"].contains(url.host ?? ""),
              url.user == nil, url.password == nil, url.port == nil else { throw ShareFailure.invalid }
        let pattern = "^/(?:reel|reels|p)/([A-Za-z0-9_-]{5,64})/?$"
        let regex = try NSRegularExpression(pattern: pattern)
        let path = url.path
        guard let match = regex.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)), let range = Range(match.range(at: 1), in: path) else { throw ShareFailure.invalid }
        return "https://www.instagram.com/reel/\(path[range])/"
    }
    static func submit(_ url: String) async throws -> String {
        guard let token = token() else { throw ShareFailure.signIn }
        guard let base = Bundle.main.object(forInfoDictionaryKey: "BackendURL") as? String,
              let endpoint = URL(string: base + "/api/mutation"), endpoint.scheme == "https", endpoint.host?.hasSuffix(".convex.cloud") == true else { throw ShareFailure.configuration }
        var request = URLRequest(url: endpoint, timeoutInterval: 15)
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["path": "reels:submit", "args": ["text": url, "retentionDays": 7], "format": "json"])
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
