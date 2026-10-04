import Foundation
import Security

enum ShareStore {
    static var group: String { Bundle.main.object(forInfoDictionaryKey: "AppGroup") as! String }
    static var defaults: UserDefaults { UserDefaults(suiteName: group)! }
    private static var keyQuery: [String: Any] { [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "DinedealsReelSession", kSecAttrAccount as String: "accessToken",
        kSecAttrAccessGroup as String: Bundle.main.object(forInfoDictionaryKey: "KeychainGroup") as! String] }
    static func saveToken(_ token: String?) -> Bool {
        let query = keyQuery
        if token == nil { let status = SecItemDelete(query as CFDictionary); return status == errSecSuccess || status == errSecItemNotFound }
        let data = Data(token!.utf8)
        let updated = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if updated == errSecSuccess { return true }
        guard updated == errSecItemNotFound else { return false }
        var addition = query
        addition[kSecValueData as String] = data
        addition[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(addition as CFDictionary, nil) == errSecSuccess
    }
    static func token() -> String? {
        var query = keyQuery; query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    // Individual atomic files avoid lost updates between concurrently running app/extension processes.
    static var inbox: URL { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)!.appendingPathComponent("ReelInbox", isDirectory: true) }
    @discardableResult static func enqueue(_ value: String, kind: String) throws -> URL {
        try FileManager.default.createDirectory(at: inbox, withIntermediateDirectories: true)
        let bytes = try JSONSerialization.data(withJSONObject: ["kind": kind, "value": value, "savedAt": Date().timeIntervalSince1970])
        let file = inbox.appendingPathComponent(UUID().uuidString + ".json")
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return file
    }
    static func first() -> (URL, String, String)? {
        guard let files = try? FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil) else { return nil }
        for file in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            guard let data = try? Data(contentsOf: file), let record = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let saved = record["savedAt"] as? Double, Date().timeIntervalSince1970 - saved < 86400,
                  let kind = record["kind"] as? String, let value = record["value"] as? String else { try? FileManager.default.removeItem(at: file); continue }
            return (file, kind, value)
        }
        return nil
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
              json["status"] as? String == "success", let value = json["value"] as? [String: Any], let id = value["itemId"] as? String else { throw ShareFailure.network }
        return id
    }
}
enum ShareFailure: Error { case invalid, signIn, network, configuration }
