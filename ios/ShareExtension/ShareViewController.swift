import UIKit
import UniformTypeIdentifiers

@MainActor final class ShareViewController: UIViewController {
    private let status = UILabel()
    private let done = UIButton(type: .system)
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? .systemBackground
                : UIColor(red: 251/255, green: 247/255, blue: 242/255, alpha: 1)
        }
        status.numberOfLines = 0
        status.textAlignment = .center
        status.textColor = .label
        let baseFont = UIFont(name: "Figtree-Regular", size: 17) ?? .systemFont(ofSize: 17, weight: .regular)
        status.font = UIFontMetrics(forTextStyle: .body).scaledFont(for: baseFont)
        status.adjustsFontForContentSizeCategory = true
        status.text = "Received. Saving your Reel privately…"
        done.setTitle("Done", for: .normal)
        let doneFont = UIFont(name: "Figtree-SemiBold", size: 17) ?? .boldSystemFont(ofSize: 17)
        done.titleLabel?.font = UIFontMetrics(forTextStyle: .headline).scaledFont(for: doneFont)
        done.titleLabel?.adjustsFontForContentSizeCategory = true
        done.addTarget(self, action: #selector(close), for: .touchUpInside)
        done.isHidden = true
        let stack = UIStackView(arrangedSubviews: [status, done])
        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: guide.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(greaterThanOrEqualTo: guide.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: guide.bottomAnchor, constant: -24)
        ])
        Task { await receive() }
    }
    private final class Once: @unchecked Sendable {
        private let lock = NSLock(); private var claimed = false
        func claim() -> Bool { lock.lock(); defer { lock.unlock() }; if claimed { return false }; claimed = true; return true }
    }
    /// Loads one offered type as text with a hard timeout. Never loads media bytes.
    private func load(_ provider: NSItemProvider, _ type: String, timeout: TimeInterval) async -> (text: String?, ok: Bool) {
        await withCheckedContinuation { (continuation: CheckedContinuation<(String?, Bool), Never>) in
            let once = Once()
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, error in
                let text = (item as? URL)?.absoluteString ?? (item as? String) ?? (item as? NSAttributedString)?.string
                    ?? (item as? Data).flatMap { String(data: $0, encoding: .utf8) }
                if once.claim() { continuation.resume(returning: (text, error == nil && text != nil)) }
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { if once.claim() { continuation.resume(returning: (nil, false)) } }
        }
    }
    private func receive() async {
        let deadline = Date().addingTimeInterval(10)   // extension-wide budget
        var texts: [String] = [], types: [String] = []
        var lost = false, loadedURL = false, loadedText = false
        for item in extensionContext?.inputItems as? [NSExtensionItem] ?? [] {
            if let text = item.attributedContentText?.string, !text.isEmpty { texts.append(text); loadedText = true }
            for provider in item.attachments ?? [] {
                types.append(contentsOf: provider.registeredTypeIdentifiers)
                for (type, isURL) in [(UTType.url.identifier, true), (UTType.text.identifier, false)] where provider.hasItemConformingToTypeIdentifier(type) {
                    let remaining = deadline.timeIntervalSinceNow
                    if remaining <= 0 { lost = true; continue }
                    let result = await load(provider, type, timeout: min(4, remaining))
                    if let text = result.text, result.ok { texts.append(text); if isURL { loadedURL = true } else { loadedText = true } } else { lost = true }
                }
            }
        }
        var distinctTypes: [String] = []
        for type in types where !distinctTypes.contains(type) { distinctTypes.append(type) }
        let context = ShareStore.makeContext(texts: texts, types: types, receivedAt: Date().timeIntervalSince1970, truncated: lost)
        let summary = ShareStore.summary(context: context, offeredDistinctTypes: distinctTypes.count, loadedURL: loadedURL, loadedText: loadedText)
        guard let url = try? ShareStore.resolveLink(texts) else {
            status.text = "Share the Reel’s direct Instagram link. Profiles, shortened share links and messages with several different links aren’t supported.\n" + summary
            done.isHidden = false; return
        }
        // Keep a protected recovery copy before any request: an extension can be terminated at any time.
        let recovery: URL
        do { recovery = try ShareStore.enqueue(url, kind: "link", context: context) } catch { status.text = "Could not save locally. Check App Group setup.\n" + summary; done.isHidden = false; return }
        do {
            let id = try await ShareStore.submit(url, context: context)
            try ShareStore.enqueue(id, kind: "item", sourceUrl: url, context: context)
            try FileManager.default.removeItem(at: recovery)
            status.text = "Saved privately. Open Dinedeals to continue and review your save.\n" + summary
        } catch ShareFailure.signIn {
            status.text = "Link saved on this iPhone for 24 hours. Open Dinedeals and sign in to send it.\n" + summary
        } catch {
            status.text = "Link saved on this iPhone for 24 hours. Open Dinedeals to retry when connected.\n" + summary
        }
        done.isHidden = false
    }
    @objc private func close() { extensionContext?.completeRequest(returningItems: nil) }
}
