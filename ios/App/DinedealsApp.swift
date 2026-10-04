import SwiftUI
import WebKit
import UserNotifications

// MARK: WebLoadModel begin (Foundation-only; tests/native/WebLoadChecks.swift extracts this region verbatim)
/// Validated bare HTTPS WebsiteURL. Placeholder, unexpanded, non-HTTPS, credentialed or path-bearing values are unavailable.
enum WebConfig: Equatable {
    case ready(URL)
    case unavailable
    static func evaluate(_ raw: String?) -> WebConfig {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty, !raw.contains("$("),
              let parts = URLComponents(string: raw), parts.scheme == "https", let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/",
              !host.contains("replace-with"), ![".example", ".invalid", ".test", ".localhost"].contains(where: { host.hasSuffix($0) })
        else { return .unavailable }
        var origin = URLComponents(); origin.scheme = "https"; origin.host = host; origin.port = parts.port
        guard let url = origin.url else { return .unavailable }
        return .ready(url)
    }
    var origin: URL? { if case .ready(let url) = self { return url }; return nil }
    func isSameOrigin(_ url: URL) -> Bool {
        guard let base = origin else { return false }
        return url.scheme == "https" && url.host?.lowercased() == base.host?.lowercased() && (url.port ?? 443) == (base.port ?? 443)
    }
    /// Origin plus an absolute app path ("/reels?item=x"); nil for anything that could leave the origin.
    func url(forPath path: String) -> URL? {
        guard let base = origin, path.hasPrefix("/"), !path.hasPrefix("//"),
              let url = URL(string: base.absoluteString + path), isSameOrigin(url) else { return nil }
        return url
    }
}
enum WebLoadPhase: Equatable { case idle, loading, loaded, failed, terminated, unconfigured }
/// Pure load lifecycle. Events carry the navigation token; only the tracked navigation may settle the state, so a
/// canceled/superseded/stale callback never hides a newer load or fakes completion. No automatic retries.
struct WebLoadState {
    private(set) var phase: WebLoadPhase
    private(set) var target: URL?
    let config: WebConfig
    private var active: Int?
    private var expected: Int?   // token of the navigation returned by the app's own pending load
    private var newest = 0        // highest navigation token issued or seen; older starts are stale
    private var settled: WebLoadPhase = .idle
    private var settledTarget: URL?
    init(config: WebConfig) { self.config = config; phase = config.origin == nil ? .unconfigured : .idle }
    var canRetry: Bool { (phase == .failed || phase == .terminated) && target != nil }
    /// `shared` marks a one-time share submission: it is dropped once the page loaded or the page was lost afterwards.
    static func scrubbed(_ url: URL) -> URL {
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        let kept = parts.queryItems?.filter { $0.name != "shared" }
        parts.queryItems = (kept?.isEmpty ?? true) ? nil : kept
        return parts.url ?? url
    }
    /// A load issued by the app, identified by the token of the WKNavigation it returns. The requested URL is the target
    /// until the page actually finishes; older navigation starts/callbacks cannot settle or overwrite it.
    mutating func requestLoad(_ url: URL, token: Int) -> Bool {
        guard config.isSameOrigin(url), token > newest else { return false }
        if phase != .loading { settled = phase; settledTarget = target }
        phase = .loading; target = url; active = nil; expected = token; newest = token
        return true
    }
    /// `url` is the page-initiated destination (policy URL); it is ignored for the app's own expected navigation.
    mutating func didStart(token: Int, url: URL?) {
        guard config.origin != nil, token >= newest else { return }                 // older navigation: stale
        if let pending = expected { guard token == pending else { return } }          // only our request may start while one is pending
        if phase != .loading { settled = phase; settledTarget = target }
        if expected != nil { expected = nil }
        else if let url = url, config.isSameOrigin(url) { target = url }              // deliberate page navigation
        phase = .loading; active = token; newest = token
    }
    /// didCommit is intentionally not an event: committed content is not finished content.
    mutating func didFinish(token: Int, url: URL?) {
        guard token == active else { return }
        active = nil; phase = .loaded; settled = .loaded
        if let url = url, config.isSameOrigin(url) { target = Self.scrubbed(url) } else if let current = target { target = Self.scrubbed(current) }
        settledTarget = target
    }
    /// `cancelled` covers NSURLErrorCancelled and WebKit's policy-change interruption: superseded or app-canceled, not a failure.
    mutating func didFail(token: Int, cancelled: Bool) {
        guard token == active || token == expected else { return }
        active = nil; expected = nil
        if cancelled { phase = settled; target = settledTarget } else { phase = .failed }
    }
    mutating func didTerminate(liveURL: URL?) {
        guard config.origin != nil else { return }
        active = nil; expected = nil; phase = .terminated
        if let url = liveURL, config.isSameOrigin(url) { target = Self.scrubbed(url) }
    }
    /// Explicit user retry: a plain GET of the current same-origin target (never replays a form POST or a share).
    mutating func retry(token: Int) -> URL? {
        guard canRetry, let url = target, token > newest else { return nil }
        phase = .loading; active = nil; expected = token; newest = token
        return url
    }
}
/// Remembers which stored inbox records were already routed in this process, so returning to the foreground never reloads
/// (and discards edits in) the same retained recovery page. A genuinely new record has a new key and routes once.
struct InboxRouting {
    private var routed = Set<String>()
    mutating func shouldRoute(_ key: String) -> Bool { routed.insert(key).inserted }
}
/// A route asked for by the app. The id makes repeated identical routes explicit and unrelated SwiftUI renders inert.
struct RouteRequest: Equatable {
    let id: Int
    let path: String
    private static var counter = 0
    static func make(_ path: String) -> RouteRequest { counter += 1; return RouteRequest(id: counter, path: path) }
}
// MARK: WebLoadModel end

@main struct DinedealsApp: App {
    @UIApplicationDelegateAdaptor(NotificationDelegate.self) private var notifications
    @State private var route = RouteRequest.make("/reels")
    @StateObject private var loader = WebLoader()
    @State private var inbox = InboxRouting()
    @Environment(\.scenePhase) private var phase
    var body: some Scene { WindowGroup {
        ZStack {
            WebShell(loader: loader)
            WebLoadOverlay(loader: loader)
        }
            .ignoresSafeArea(.container, edges: .bottom)
            .onOpenURL { url in
                if url.scheme == "dinedeals", url.host == "reels", let id = url.path.split(separator: "/").last,
                   id.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil { open("/reels?item=\(id)") }
            }
            .onChange(of: phase) { next in if next == .active { consumeInbox() } }
            .onChange(of: route) { next in loader.open(next) }
            .onAppear { consumeInbox(); loader.open(route) }
            .onReceive(NotificationCenter.default.publisher(for: .reelNotification)) { notification in
                if let id = notification.userInfo?["itemId"] as? String, id.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil { open("/reels?item=\(id)") }
            }
    } }
    private func open(_ path: String) { route = RouteRequest.make(path) }
    private func consumeInbox() {
        if let (file, kind, value, _) = ShareStore.first(), inbox.shouldRoute(file.lastPathComponent) {
            if kind == "item", value.range(of: "^[A-Za-z0-9]{1,128}$", options: .regularExpression) != nil {
                // Retained (marked routed) until server receipt or 24h expiry so the web view can recover its source context.
                open("/reels?item=\(value)"); ShareStore.markRouted(file)
            } else if kind == "link", let normalized = try? ShareStore.normalize(value) {
                var c = URLComponents(); c.path = "/reels"; c.queryItems = [URLQueryItem(name: "shared", value: normalized)]
                open(c.string ?? "/reels")
                // Link is removed only after the authenticated web view confirms server receipt.
            }
        }
    }
}
/// Hosts the single long-lived WKWebView owned by `WebLoader`; SwiftUI re-renders never recreate or reload it.
struct WebShell: UIViewRepresentable {
    let loader: WebLoader
    func makeUIView(context: Context) -> WKWebView { loader.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
/// Minimal local status UI. Never shows URLs, errors from the page, tokens or share contents.
struct WebLoadOverlay: View {
    @ObservedObject var loader: WebLoader
    private static let paper = Color(red: 251/255, green: 247/255, blue: 242/255)
    var body: some View {
        switch loader.state.phase {
        case .idle, .loaded: EmptyView()
        case .loading:
            ProgressView().controlSize(.large).padding(20).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                .allowsHitTesting(false).accessibilityLabel("Loading Dinedeals")
        case .unconfigured:
            message("Dinedeals isn’t set up on this build yet. Install an updated build to continue.", retry: false)
        case .failed:
            message("Can’t reach Dinedeals. Check your connection and try again.", retry: true)
        case .terminated:
            message("The page stopped unexpectedly. Try again to reload it.", retry: true)
        }
    }
    private func message(_ text: String, retry: Bool) -> some View {
        VStack(spacing: 20) {
            Text(text).font(.custom("Figtree-Regular", size: 17)).multilineTextAlignment(.center)
            if retry { Button("Retry") { loader.retry() }.buttonStyle(.borderedProminent) }
        }
        .padding(24).frame(maxWidth: .infinity, maxHeight: .infinity).background(Self.paper)
    }
}
@MainActor final class WebLoader: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
    @Published private(set) var state: WebLoadState
    let webView: WKWebView
    private var tokens: [ObjectIdentifier: Int] = [:]
    private var counter = 0
    private var lastRequest = 0
    private var policyURL: URL?   // destination of the latest allowed main-frame policy decision (webView.url may still be the previous page)
    var allowed: URL? { state.config.origin }
    override init() {
        state = WebLoadState(config: WebConfig.evaluate(Bundle.main.object(forInfoDictionaryKey: "WebsiteURL") as? String))
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        config.userContentController.add(self, name: "dishdeals")   // retained for the app lifetime with the loader
        webView.navigationDelegate = self
    }
    /// Idempotent per request id, so repeated SwiftUI renders never reload or discard form/auth state.
    func open(_ request: RouteRequest) {
        guard request.id != lastRequest else { return }
        lastRequest = request.id
        guard let url = state.config.url(forPath: request.path) else { return }
        counter += 1; let token = counter
        guard state.requestLoad(url, token: token) else { return }
        issue(url, token)
    }
    func retry() {
        counter += 1; let token = counter
        guard let url = state.retry(token: token) else { return }
        issue(url, token)
    }
    /// Registers the identity of the WKNavigation returned by our own load before any callback can arrive.
    private func issue(_ url: URL, _ token: Int) {
        policyURL = nil
        if let navigation = webView.load(URLRequest(url: url)) { tokens[ObjectIdentifier(navigation)] = token }
        else { state.didFail(token: token, cancelled: false) }
    }
    private func token(_ navigation: WKNavigation?) -> Int? { navigation.flatMap { tokens[ObjectIdentifier($0)] } }
    private func isCancellation(_ error: Error) -> Bool {
        let e = error as NSError
        return (e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled) || (e.domain == "WebKitErrorDomain" && e.code == 102)
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        let token: Int
        if let known = tokens[ObjectIdentifier(navigation)] { token = known }
        else { counter += 1; token = counter; tokens[ObjectIdentifier(navigation)] = token }
        state.didStart(token: token, url: policyURL ?? webView.url)
        policyURL = nil
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let t = token(navigation) { state.didFinish(token: t, url: webView.url); tokens[ObjectIdentifier(navigation)] = nil }
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(navigation, error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(navigation, error) }
    private func failed(_ navigation: WKNavigation?, _ error: Error) {
        if let t = token(navigation) { state.didFail(token: t, cancelled: isCancellation(error)) }
        if let navigation = navigation { tokens[ObjectIdentifier(navigation)] = nil }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        tokens.removeAll(); state.didTerminate(liveURL: webView.url)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if state.config.isSameOrigin(url) { if action.targetFrame?.isMainFrame ?? true { policyURL = url }; decisionHandler(.allow) }
        else { decisionHandler(.cancel); if allowed != nil, action.navigationType == .linkActivated { UIApplication.shared.open(url) } }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard let allowed = allowed, message.frameInfo.isMainFrame, origin.host == allowed.host, origin.protocol == allowed.scheme,
              (origin.port == (allowed.port ?? 443) || (allowed.port == nil && origin.port == 0)), let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "session": _ = ShareStore.saveToken(body["token"] as? String)
        case "received":
            // Remove matching local recovery copies only after the backend's deduplicated receipt.
            if let link = body["sourceUrl"] as? String { ShareStore.discard(source: link) }
        case "requestShareContext":
            // Context only for a current stored recovery of exactly this source; passed as native arguments (no JS interpolation).
            guard let link = body["sourceUrl"] as? String, let source = try? ShareStore.normalize(link),
                  let context = ShareStore.context(forSource: source), let web = message.webView else { return }
            let detail: [String: Any] = ["sourceUrl": source, "nativeContext": context]
            web.callAsyncJavaScript("window.dispatchEvent(new CustomEvent('dishdeals:shareContext', { detail: detail }));",
                                    arguments: ["detail": detail], in: nil, in: .page) { _ in }
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
