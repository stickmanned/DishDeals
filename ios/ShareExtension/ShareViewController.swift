import UIKit
import UniformTypeIdentifiers

@MainActor final class ShareViewController: UIViewController {
    private let status = UILabel()
    private let done = UIButton(type: .system)
    private let receipt = UITextView()
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 251/255, green: 247/255, blue: 242/255, alpha: 1)
        status.numberOfLines = 0; status.textAlignment = .center; status.font = UIFont(name: "Figtree-Regular", size: 17) ?? .systemFont(ofSize: 17); status.text = "Reading shared input…"
        done.setTitle("Done", for: .normal); done.addTarget(self, action: #selector(close), for: .touchUpInside); done.isHidden = true
        receipt.isEditable = false; receipt.isSelectable = true; receipt.font = .monospacedSystemFont(ofSize: 12, weight: .regular)
        receipt.text = "Share receipt: waiting for input"; receipt.heightAnchor.constraint(equalToConstant: 220).isActive = true
        let stack = UIStackView(arrangedSubviews: [status, receipt, done]); stack.axis = .vertical; stack.spacing = 24; stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack); NSLayoutConstraint.activate([stack.centerYAnchor.constraint(equalTo: view.centerYAnchor), stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)])
        Task { await receive() }
    }
    private func receive() async {
        var incoming: String?
        var rawText: String?
        var lines = ["Share receipt (local to this iPhone)"]
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        lines.append("Extension items: \(items.count)")
        for (index, item) in items.enumerated() {
            if let text = item.attributedContentText?.string {
                lines.append("Item \(index) text: \(String(text.prefix(4096)))")
                rawText = rawText ?? String(text.prefix(4096))
                if incoming == nil { incoming = try? ShareStore.normalize(text) }
            }
            for (attachment, provider) in (item.attachments ?? []).enumerated() {
                lines.append("Item \(index), attachment \(attachment), types: \(provider.registeredTypeIdentifiers.joined(separator: ", "))")
                receipt.text = String(lines.joined(separator: "\n").prefix(12000))
                // Try both representations. A URL failure must not hide available plain text.
                for type in [UTType.url.identifier, UTType.plainText.identifier, UTType.text.identifier] {
                    guard provider.hasItemConformingToTypeIdentifier(type) else { continue }
                    do {
                        let loaded: NSSecureCoding? = try await withCheckedThrowingContinuation { continuation in
                            provider.loadItem(forTypeIdentifier: type, options: nil) { item, error in
                                if let error = error { continuation.resume(throwing: error) } else { continuation.resume(returning: item) }
                            }
                        }
                        let text: String?
                        if let url = loaded as? URL { text = url.absoluteString }
                        else if let string = loaded as? String { text = string }
                        else if let data = loaded as? Data, data.count <= 16384 { text = String(data: data, encoding: .utf8) }
                        else { text = nil }
                        lines.append("Loaded \(type) as \(loaded.map { String(describing: Swift.type(of: $0)) } ?? "nil")")
                        if let text = text {
                            lines.append("Payload: \(String(text.prefix(4096)))")
                            rawText = rawText ?? String(text.prefix(4096))
                            if incoming == nil { incoming = try? ShareStore.normalize(text) }
                        }
                    } catch {
                        let failure = error as NSError
                        lines.append("Load failed: \(type), \(failure.domain), code \(failure.code)")
                    }
                    receipt.text = String(lines.joined(separator: "\n").prefix(12000))
                }
            }
        }
        receipt.text = String(lines.joined(separator: "\n").prefix(12000))
        guard let url = incoming else {
            if let rawText = rawText {
                do { try ShareStore.enqueue(rawText, kind: "sharedText"); status.text = "Received text, but no supported direct Reel link. The text is saved locally for 24 hours; open Dinedeals to inspect it. No backend submission was made." }
                catch { status.text = "Received text, but could not save locally. Check App Group setup. Copy the receipt below." }
            } else { status.text = "No readable URL or text received. Copy the receipt below; nothing was submitted." }
            done.isHidden = false; return
        }
        receipt.text += "\nRecognized link: \(url)\nShared session: \(ShareStore.token() == nil ? "missing" : "present (not proof of validity)")"
        // Keep a protected recovery copy before any request: an extension can be terminated at any time.
        let recovery: URL
        do { recovery = try ShareStore.enqueue(url, kind: "link") } catch { status.text = "Could not save locally. Check App Group setup."; done.isHidden = false; return }
        do {
            let id = try await ShareStore.submit(url)
            receipt.text += "\nBackend accepted item: \(id)"
            try ShareStore.enqueue(id, kind: "item")
            try FileManager.default.removeItem(at: recovery)
            status.text = "Saved privately. Processing continues in the background. Open Dinedeals to review your result."
        } catch ShareFailure.signIn {
            status.text = "Link saved on this iPhone for 24 hours. Open Dinedeals and sign in to send it."
        } catch ShareFailure.configuration {
            status.text = "Link saved locally. BackendURL is missing or invalid in the Xcode build. Nothing was submitted."
        } catch ShareFailure.backend(let code) {
            receipt.text += "\nBackend response: \(code)"
            status.text = "Link saved locally. The backend did not accept it. Open Dinedeals to inspect your session and Reel configuration."
        } catch {
            status.text = "Link saved on this iPhone for 24 hours. Open Dinedeals to retry when connected."
        }
        done.isHidden = false
    }
    @objc private func close() { extensionContext?.completeRequest(returningItems: nil) }
}
