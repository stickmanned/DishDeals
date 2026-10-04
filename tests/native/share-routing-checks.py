#!/usr/bin/env python3
"""Replay the production inbox consumer with a temporary inbox. No phone/network evidence."""
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]

with tempfile.TemporaryDirectory(prefix="dishdeals-share-routing-") as directory:
    output = Path(directory)
    app = (ROOT / "ios/App/DinedealsApp.swift").read_text()
    model = app[app.index("// MARK: WebLoadModel begin"):app.index("// MARK: WebLoadModel end")]
    (output / "WebModel.swift").write_text("import Foundation\n" + model)
    store = (ROOT / "ios/Shared/ShareStore.swift").read_text()
    start = store.index("    static var inbox: URL? {")
    end = store.index("    // MARK: native supplied-context", start)
    # Only the filesystem boundary changes. Selection, persistence and routing are production code.
    store = store[:start] + f'    static var inbox: URL? {{ URL(fileURLWithPath: "{output / "inbox"}") }}\n' + store[end:]
    (output / "ShareStore.swift").write_text(store)
    start = app.index("    private func consumeInbox()")
    end = app.index("\n}\n/// Hosts", start)
    consumer = app[start:end].replace("private func consumeInbox()", "mutating func consumeInbox()")
    harness = """import Foundation
struct Harness {
    var inbox = InboxRouting()
    var paths: [String] = []
    mutating func open(_ path: String) { paths.append(path) }
""" + consumer + """
}
@main struct ShareRoutingChecks {
    static func main() throws {
        let folder = ShareStore.inbox!
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var app = Harness()
        let old = try ShareStore.enqueue("https://www.instagram.com/reel/OLDER12345/", kind: "link")
        app.consumeInbox()
        precondition(app.paths.count == 1, "first share must open")
        app.consumeInbox()
        precondition(app.paths.count == 1, "foreground must preserve current edits")
        try ShareStore.enqueue("NewItem123", kind: "item")
        app.consumeInbox()
        precondition(app.paths.last == "/reels?item=NewItem123", "a retained old link must not block the NEW item")
        app.consumeInbox()
        precondition(app.paths.count == 2, "already routed records must not reload")
        let next = "https://www.instagram.com/reel/NEXT123456/"
        try ShareStore.enqueue(next, kind: "link")
        app.consumeInbox()
        let url = URLComponents(string: app.paths.last!)!
        precondition(url.path == "/reels" && url.queryItems?.first(where: { $0.name == "shared" })?.value == next,
                     "a new unsent share must open the prefilled Reel page")
        app.consumeInbox()
        precondition(app.paths.count == 3, "repeated foreground must not discard the new form")
        precondition(FileManager.default.fileExists(atPath: old.path), "unreceipted old source must be preserved")
        print("Share routing regression: 8 checks passed (synthetic local inbox; production consumer)")
    }
}
"""
    (output / "Checks.swift").write_text(harness)
    subprocess.run([
        "swiftc", "-module-cache-path", str(output / "module-cache"), "-parse-as-library",
        str(output / "WebModel.swift"), str(output / "ShareStore.swift"), str(output / "Checks.swift"),
        "-o", str(output / "checks"),
    ], check=True)
    subprocess.run([str(output / "checks")], check=True)
