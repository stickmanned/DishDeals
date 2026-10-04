// Pure WebLoadModel checks (config validation, lifecycle, retry). No WKWebView, network, App Group or phone evidence.
// Run: sed -n '/MARK: WebLoadModel begin/,/MARK: WebLoadModel end/p' ios/App/DinedealsApp.swift > $T/WebLoadModel.swift
//      (printf 'import Foundation\n'; cat $T/WebLoadModel.swift) > $T/m.swift   # region is Foundation-only; the app file imports SwiftUI
//      swiftc -parse-as-library $T/m.swift tests/native/WebLoadChecks.swift -o $T/web && $T/web
import Foundation

@main struct WebLoadChecks {
    static func main() throws {
        var checks = 0
        func check(_ passed: Bool, _ label: String) throws {
            guard passed else { throw NSError(domain: "WebLoadChecks", code: 1, userInfo: [NSLocalizedDescriptionKey: label]) }
            checks += 1
        }
        // Configuration
        for (label, raw) in [("nil", nil), ("empty", ""), ("unexpanded", "$(WEBSITE_URL)"), ("placeholder", "https://replace-with-your-web-host.example"),
                             ("reserved tld", "https://app.test"), ("http", "http://dinedeals.app"), ("credentials", "https://u:p@dinedeals.app"),
                             ("path", "https://dinedeals.app/app"), ("query", "https://dinedeals.app?x=1"), ("fragment", "https://dinedeals.app#x"), ("no host", "https:///reels")] as [(String, String?)] {
            try check(WebConfig.evaluate(raw) == .unavailable, "unavailable: " + label)
        }
        let ready = WebConfig.evaluate(" https://Dinedeals.app/ ")
        try check(ready.origin?.absoluteString == "https://dinedeals.app", "bare origin normalized")
        try check(WebConfig.evaluate("https://dinedeals.app:8443").origin?.port == 8443, "explicit port kept")
        try check(ready.isSameOrigin(URL(string: "https://dinedeals.app/reels?item=1")!) && ready.isSameOrigin(URL(string: "https://DINEDEALS.app:443/x")!), "same origin")
        try check(!ready.isSameOrigin(URL(string: "https://evil.example/reels")!) && !ready.isSameOrigin(URL(string: "http://dinedeals.app/")!) && !ready.isSameOrigin(URL(string: "https://dinedeals.app:8443/")!), "foreign origins rejected")
        try check(!WebConfig.unavailable.isSameOrigin(URL(string: "https://dinedeals.app/")!), "unconfigured has no origin")
        try check(ready.url(forPath: "/reels?item=Abc1")?.absoluteString == "https://dinedeals.app/reels?item=Abc1", "route path composed")
        try check(ready.url(forPath: "//evil.example/x") == nil && ready.url(forPath: "reels") == nil && ready.url(forPath: "@evil.example") == nil, "path cannot leave origin")
        try check(WebConfig.unavailable.url(forPath: "/reels") == nil, "no route when unconfigured")
        let a = URL(string: "https://dinedeals.app/reels")!, b = URL(string: "https://dinedeals.app/reels?item=B")!
        // Unconfigured
        var off = WebLoadState(config: .unavailable)
        try check(off.phase == .unconfigured && !off.canRetry && !off.requestLoad(a) && off.phase == .unconfigured, "unconfigured stays unconfigured")
        off.didStart(token: 1, url: a); off.didTerminate(liveURL: a)
        try check(off.phase == .unconfigured && off.retry() == nil, "events ignored when unconfigured")
        // Happy path: commit is not completion
        var s = WebLoadState(config: ready)
        try check(s.phase == .idle && s.requestLoad(a) && s.phase == .loading && s.target == a, "request starts loading")
        s.didStart(token: 1, url: a)
        try check(s.phase == .loading, "provisional start keeps loading (no didCommit event exists)")
        s.didFinish(token: 1, url: a)
        try check(s.phase == .loaded && s.target == a, "finish completes")
        // Stale / superseded
        var t = WebLoadState(config: ready)
        _ = t.requestLoad(a); t.didStart(token: 1, url: a)
        _ = t.requestLoad(b); t.didFail(token: 1, cancelled: true)
        try check(t.phase == .loading, "canceled superseded callback ignored")
        t.didStart(token: 2, url: b); t.didFinish(token: 1, url: a)
        try check(t.phase == .loading && t.target == b, "stale finish cannot complete newer load")
        t.didFail(token: 1, cancelled: false)
        try check(t.phase == .loading, "stale failure cannot fail newer load")
        t.didFinish(token: 2, url: b)
        try check(t.phase == .loaded && t.target == b, "newer load finishes")
        t.didFinish(token: 2, url: a)
        try check(t.target == b, "finish after settled is ignored")
        // Failure and retry
        var f = WebLoadState(config: ready)
        _ = f.requestLoad(b); f.didStart(token: 5, url: b); f.didFail(token: 5, cancelled: false)
        try check(f.phase == .failed && f.canRetry && f.target == b, "real failure shows failed")
        try check(f.retry() == b && f.phase == .loading && !f.canRetry, "retry reloads same target once")
        try check(f.retry() == nil, "no retry while loading (no automatic or repeated retry)")
        f.didStart(token: 6, url: b); f.didFinish(token: 6, url: b)
        try check(f.phase == .loaded, "retry can recover")
        // Cancellation without successor restores settled phase
        var c = WebLoadState(config: ready)
        _ = c.requestLoad(a); c.didStart(token: 1, url: a); c.didFinish(token: 1, url: a)
        c.didStart(token: 2, url: b); c.didFail(token: 2, cancelled: true)
        try check(c.phase == .loaded && c.target == a, "lone cancellation returns to loaded page and its target")
        var c2 = WebLoadState(config: ready)
        _ = c2.requestLoad(a); c2.didStart(token: 1, url: a); c2.didFail(token: 1, cancelled: false)
        c2.didStart(token: 2, url: a); c2.didFail(token: 2, cancelled: true)
        try check(c2.phase == .failed, "cancellation after failure restores failed with Retry")
        // Same-origin navigation tracking; a foreign URL never becomes the target
        var n = WebLoadState(config: ready)
        _ = n.requestLoad(a); n.didStart(token: 1, url: a); n.didFinish(token: 1, url: a)
        n.didStart(token: 2, url: URL(string: "https://dinedeals.app/deals/42")!)
        try check(n.target?.path == "/deals/42", "page navigation updates target")
        n.didFail(token: 2, cancelled: false)
        try check(n.phase == .failed && n.retry()?.path == "/deals/42", "retry goes to the failed same-origin page")
        var x = WebLoadState(config: ready)
        _ = x.requestLoad(a); x.didStart(token: 1, url: URL(string: "https://evil.example/")); x.didFail(token: 1, cancelled: false)
        try check(x.target == a, "foreign url never becomes retry target")
        try check(!x.requestLoad(URL(string: "https://evil.example/")!) && x.target == a, "foreign load request rejected")
        // Share submission is not replayed
        let shared = URL(string: "https://dinedeals.app/reels?shared=https%3A%2F%2Fwww.instagram.com%2Freel%2FSYNTH12345%2F&keep=1")!
        var sh = WebLoadState(config: ready)
        _ = sh.requestLoad(shared); sh.didStart(token: 1, url: shared); sh.didFail(token: 1, cancelled: false)
        try check(sh.retry() == shared, "failed first load keeps share target so the share is not lost")
        sh.didStart(token: 2, url: shared); sh.didFinish(token: 2, url: shared)
        try check(sh.target?.absoluteString == "https://dinedeals.app/reels?keep=1", "finished page scrubs one-time shared parameter")
        sh.didTerminate(liveURL: shared)
        try check(sh.phase == .terminated && sh.retry()?.query == "keep=1", "terminated retry never replays share")
        try check(WebLoadState.scrubbed(URL(string: "https://dinedeals.app/reels?shared=x")!).absoluteString == "https://dinedeals.app/reels", "empty query removed")
        // Process termination
        var p = WebLoadState(config: ready)
        _ = p.requestLoad(a); p.didStart(token: 1, url: a); p.didFinish(token: 1, url: a)
        p.didTerminate(liveURL: URL(string: "https://dinedeals.app/deals/7")!)
        try check(p.phase == .terminated && p.canRetry && p.target?.path == "/deals/7", "termination recovery uses live same-origin page")
        p.didFinish(token: 1, url: a)
        try check(p.phase == .terminated, "late callbacks cannot fake completion after termination")
        try check(p.retry()?.path == "/deals/7" && p.phase == .loading, "explicit retry after termination")
        var q = WebLoadState(config: ready)
        _ = q.requestLoad(a); q.didStart(token: 1, url: a)
        q.didTerminate(liveURL: URL(string: "https://evil.example/")!)
        try check(q.phase == .terminated && q.target == a, "foreign live URL ignored on termination")
        // Route requests
        let r1 = RouteRequest.make("/reels"), r2 = RouteRequest.make("/reels")
        try check(r1 != r2 && r1.path == r2.path, "identical routes are distinct requests")
        print("WebLoadModel pure checks: \(checks) passed")
    }
}
