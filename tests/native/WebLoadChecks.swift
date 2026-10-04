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
        try check(off.phase == .unconfigured && !off.canRetry && !off.requestLoad(a, token: 1) && off.phase == .unconfigured, "unconfigured stays unconfigured")
        off.didStart(token: 1, url: a); off.didTerminate(liveURL: a)
        try check(off.phase == .unconfigured && off.retry(token: 7) == nil, "events ignored when unconfigured")
        // Happy path: commit is not completion
        var s = WebLoadState(config: ready)
        try check(s.phase == .idle && s.requestLoad(a, token: 1) && s.phase == .loading && s.target == a, "request starts loading")
        s.didStart(token: 1, url: a)
        try check(s.phase == .loading, "provisional start keeps loading (no didCommit event exists)")
        s.didFinish(token: 1, url: a)
        try check(s.phase == .loaded && s.target == a, "finish completes")
        // Stale / superseded
        var t = WebLoadState(config: ready)
        _ = t.requestLoad(a, token: 1); t.didStart(token: 1, url: a)
        _ = t.requestLoad(b, token: 2); t.didFail(token: 1, cancelled: true)
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
        _ = f.requestLoad(b, token: 5); f.didStart(token: 5, url: b); f.didFail(token: 5, cancelled: false)
        try check(f.phase == .failed && f.canRetry && f.target == b, "real failure shows failed")
        try check(f.retry(token: 6) == b && f.phase == .loading && !f.canRetry, "retry reloads same target once")
        try check(f.retry(token: 7) == nil, "no retry while loading (no automatic or repeated retry)")
        f.didStart(token: 6, url: b); f.didFinish(token: 6, url: b)
        try check(f.phase == .loaded, "retry can recover")
        // Cancellation without successor restores settled phase
        var c = WebLoadState(config: ready)
        _ = c.requestLoad(a, token: 1); c.didStart(token: 1, url: a); c.didFinish(token: 1, url: a)
        c.didStart(token: 2, url: b); c.didFail(token: 2, cancelled: true)
        try check(c.phase == .loaded && c.target == a, "lone cancellation returns to loaded page and its target")
        var c2 = WebLoadState(config: ready)
        _ = c2.requestLoad(a, token: 1); c2.didStart(token: 1, url: a); c2.didFail(token: 1, cancelled: false)
        c2.didStart(token: 2, url: a); c2.didFail(token: 2, cancelled: true)
        try check(c2.phase == .failed, "cancellation after failure restores failed with Retry")
        // Same-origin navigation tracking; a foreign URL never becomes the target
        var n = WebLoadState(config: ready)
        _ = n.requestLoad(a, token: 1); n.didStart(token: 1, url: a); n.didFinish(token: 1, url: a)
        n.didStart(token: 2, url: URL(string: "https://dinedeals.app/deals/42")!)
        try check(n.target?.path == "/deals/42", "page navigation updates target")
        n.didFail(token: 2, cancelled: false)
        try check(n.phase == .failed && n.retry(token: 3)?.path == "/deals/42", "retry goes to the failed same-origin page")
        var x = WebLoadState(config: ready)
        _ = x.requestLoad(a, token: 1); x.didStart(token: 1, url: URL(string: "https://evil.example/")); x.didFail(token: 1, cancelled: false)
        try check(x.target == a, "foreign url never becomes retry target")
        try check(!x.requestLoad(URL(string: "https://evil.example/")!, token: 2) && x.target == a, "foreign load request rejected")
        // Share submission is not replayed
        let shared = URL(string: "https://dinedeals.app/reels?shared=https%3A%2F%2Fwww.instagram.com%2Freel%2FSYNTH12345%2F&keep=1")!
        var sh = WebLoadState(config: ready)
        _ = sh.requestLoad(shared, token: 1); sh.didStart(token: 1, url: shared); sh.didFail(token: 1, cancelled: false)
        try check(sh.retry(token: 2) == shared, "failed first load keeps share target so the share is not lost")
        sh.didStart(token: 2, url: shared); sh.didFinish(token: 2, url: shared)
        try check(sh.target?.absoluteString == "https://dinedeals.app/reels?keep=1", "finished page scrubs one-time shared parameter")
        sh.didTerminate(liveURL: shared)
        try check(sh.phase == .terminated && sh.retry(token: 3)?.query == "keep=1", "terminated retry never replays share")
        try check(WebLoadState.scrubbed(URL(string: "https://dinedeals.app/reels?shared=x")!).absoluteString == "https://dinedeals.app/reels", "empty query removed")
        // Process termination
        var p = WebLoadState(config: ready)
        _ = p.requestLoad(a, token: 1); p.didStart(token: 1, url: a); p.didFinish(token: 1, url: a)
        p.didTerminate(liveURL: URL(string: "https://dinedeals.app/deals/7")!)
        try check(p.phase == .terminated && p.canRetry && p.target?.path == "/deals/7", "termination recovery uses live same-origin page")
        p.didFinish(token: 1, url: a)
        try check(p.phase == .terminated, "late callbacks cannot fake completion after termination")
        try check(p.retry(token: 2)?.path == "/deals/7" && p.phase == .loading, "explicit retry after termination")
        var q = WebLoadState(config: ready)
        _ = q.requestLoad(a, token: 1); q.didStart(token: 1, url: a)
        q.didTerminate(liveURL: URL(string: "https://evil.example/")!)
        try check(q.phase == .terminated && q.target == a, "foreign live URL ignored on termination")
        // Review fixes: stale older navigation start after a newer request
        let old = URL(string: "https://dinedeals.app/old")!, fresh = URL(string: "https://dinedeals.app/reels?item=NEW")!
        var r = WebLoadState(config: ready)
        _ = r.requestLoad(old, token: 1); r.didStart(token: 1, url: old); r.didFinish(token: 1, url: old)
        try check(r.requestLoad(fresh, token: 3) && r.phase == .loading && r.target == fresh, "newer request pending")
        r.didStart(token: 2, url: old)          // an older navigation's start arrives late
        try check(r.phase == .loading && r.target == fresh, "older start after newer request is ignored")
        r.didFail(token: 2, cancelled: false)
        try check(r.phase == .loading && r.target == fresh, "older navigation cannot fail the new request")
        r.didStart(token: 3, url: old)          // webView.url may still be the previous page at didStart
        try check(r.phase == .loading && r.target == fresh, "expected start keeps requested target, not webView.url")
        r.didStart(token: 2, url: old)
        try check(r.target == fresh, "older start after the new one started is still stale")
        r.didFail(token: 3, cancelled: false)
        try check(r.phase == .failed && r.retry(token: 4) == fresh, "failure retry uses the requested route, not the old visible URL")
        r.didStart(token: 4, url: old); r.didFinish(token: 4, url: fresh)
        try check(r.phase == .loaded && r.target == fresh, "retry navigation finishes at requested route")
        var u = WebLoadState(config: ready)
        _ = u.requestLoad(a, token: 1)
        try check(!u.requestLoad(b, token: 1) && u.target == a, "reused token rejected")
        u.didStart(token: 9, url: b)
        try check(u.phase == .loading && u.target == a, "unknown start cannot hijack a pending request")
        // Inbox routing: foreground repeats do not reroute the same retained record
        var inbox = InboxRouting()
        try check(inbox.shouldRoute("A.json"), "initial load routes the pending link record once")
        try check(!inbox.shouldRoute("A.json") && !inbox.shouldRoute("A.json"), "repeated foreground does not route the same record again")
        try check(inbox.shouldRoute("B.json") && !inbox.shouldRoute("B.json") && !inbox.shouldRoute("A.json"), "new share routes once; old stays suppressed")
        var load = WebLoadState(config: ready)
        _ = load.requestLoad(shared, token: 1); load.didStart(token: 1, url: shared); load.didFinish(token: 1, url: shared)
        load.didStart(token: 2, url: URL(string: "https://dinedeals.app/deals/9")!); load.didFinish(token: 2, url: URL(string: "https://dinedeals.app/deals/9")!)
        try check(!inbox.shouldRoute("A.json") && load.target?.path == "/deals/9" && load.phase == .loaded, "manual navigation then foreground keeps the current page")
        // Route requests
        let r1 = RouteRequest.make("/reels"), r2 = RouteRequest.make("/reels")
        try check(r1 != r2 && r1.path == r2.path, "identical routes are distinct requests")
        print("WebLoadModel pure checks: \(checks) passed")
    }
}
