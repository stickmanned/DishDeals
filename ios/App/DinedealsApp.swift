import SwiftUI
import WebKit
import UserNotifications

@main struct DinedealsApp: App {
    @UIApplicationDelegateAdaptor(NotificationDelegate.self) private var notifications
    @State private var route = "/reels"
    @Environment(\.scenePhase) private var phase
    var body: some Scene { WindowGroup {
        WebShell(route: $route).ignoresSafeArea(.container, edges: .bottom)
            .onOpenURL { url in
                if url.scheme == "dinedeals", url.host == "reels", let id = url.path.split(separator: "/").last,
                   id.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil { route = "/reels?item=\(id)" }
            }
            .onChange(of: phase) { next in if next == .active { consumeInbox() } }
            .onAppear { consumeInbox() }
            .onReceive(NotificationCenter.default.publisher(for: .reelNotification)) { notification in
                if let id = notification.userInfo?["itemId"] as? String, id.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil { route = "/reels?item=\(id)" }
            }
    } }
    private func consumeInbox() {
        if let (file, kind, value) = ShareStore.first() {
            if kind == "item", value.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil {
                route = "/reels?item=\(value)"; try? FileManager.default.removeItem(at: file)
            } else if kind == "link", let normalized = try? ShareStore.normalize(value) {
                var c = URLComponents(); c.path = "/reels"; c.queryItems = [URLQueryItem(name: "shared", value: normalized)]
                route = c.string ?? "/reels"
                // Link is removed only after the authenticated web view confirms server receipt.
            } else if kind == "sharedText" {
                var c = URLComponents(); c.path = "/reels"; c.queryItems = [URLQueryItem(name: "shared", value: value), URLQueryItem(name: "unsupported", value: "1")]
                route = c.string ?? "/reels"
                // Unsupported text remains local until its 24-hour retention expires.
            }
        }
    }
}
struct WebShell: UIViewRepresentable {
    @Binding var route: String
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration(); config.userContentController.add(context.coordinator, name: "dishdeals")
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {
        guard route != context.coordinator.lastRoute else { return }
        context.coordinator.lastRoute = route
        guard let base = Bundle.main.object(forInfoDictionaryKey: "WebsiteURL") as? String, let url = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + route), url.scheme == "https" else { return }
        view.load(URLRequest(url: url))
    }
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var lastRoute = ""
        var allowed: URL { URL(string: Bundle.main.object(forInfoDictionaryKey: "WebsiteURL") as! String)! }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.scheme == allowed.scheme && url.host == allowed.host && url.port == allowed.port { decisionHandler(.allow) }
            else { decisionHandler(.cancel); if action.navigationType == .linkActivated { UIApplication.shared.open(url) } }
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            let origin = message.frameInfo.securityOrigin
            guard message.frameInfo.isMainFrame, origin.host == allowed.host, origin.protocol == allowed.scheme,
                  (origin.port == (allowed.port ?? 443) || (allowed.port == nil && origin.port == 0)), let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            switch type {
            case "session": _ = ShareStore.saveToken(body["token"] as? String)
            case "received":
                // Remove matching local recovery copies only after the backend's deduplicated receipt.
                if let link = body["sourceUrl"] as? String, let inbox = ShareStore.inbox, let files = try? FileManager.default.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil) {
                    for file in files { if let data = try? Data(contentsOf: file), let record = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], record["kind"] as? String == "link", record["value"] as? String == link { try? FileManager.default.removeItem(at: file) } }
                }
            case "enableNotifications": UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
            case "result":
                guard let id = body["itemId"] as? String, let state = body["status"] as? String, id.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil,
                      ["ready", "no_deal", "failed"].contains(state) else { return }
                let content = UNMutableNotificationContent(); content.title = "Dinedeals"
                content.body = state == "ready" ? "Your private deal draft is ready." : "Open your Reel save to review the result."
                content.userInfo = ["itemId": id]
                UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
            default: break
            }
        }
    }
}
extension Notification.Name { static let reelNotification = Notification.Name("DinedealsReelNotification") }
final class NotificationDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self; return true
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        DispatchQueue.main.async { NotificationCenter.default.post(name: .reelNotification, object: nil, userInfo: info) }
        completionHandler()
    }
}
