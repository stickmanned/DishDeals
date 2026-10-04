import UIKit
import UniformTypeIdentifiers

@MainActor final class ShareViewController: UIViewController {
    private let status = UILabel()
    private let done = UIButton(type: .system)
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 251/255, green: 247/255, blue: 242/255, alpha: 1)
        status.numberOfLines = 0; status.textAlignment = .center; status.font = UIFont(name: "Figtree-Regular", size: 17) ?? .systemFont(ofSize: 17); status.text = "Received. Saving your Reel privately…"
        done.setTitle("Done", for: .normal); done.addTarget(self, action: #selector(close), for: .touchUpInside); done.isHidden = true
        let stack = UIStackView(arrangedSubviews: [status, done]); stack.axis = .vertical; stack.spacing = 24; stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack); NSLayoutConstraint.activate([stack.centerYAnchor.constraint(equalTo: view.centerYAnchor), stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)])
        Task { await receive() }
    }
    private func receive() async {
        var incoming: String?
        for item in extensionContext?.inputItems as? [NSExtensionItem] ?? [] {
            for provider in item.attachments ?? [] {
                let type = provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) ? UTType.url.identifier : UTType.text.identifier
                guard provider.hasItemConformingToTypeIdentifier(type) else { continue }
                let loaded: NSSecureCoding? = try? await withCheckedThrowingContinuation { continuation in
                    provider.loadItem(forTypeIdentifier: type, options: nil) { item, error in
                        if let error = error { continuation.resume(throwing: error) } else { continuation.resume(returning: item) }
                    }
                }
                let text = (loaded as? URL)?.absoluteString ?? loaded as? String
                if let text = text, let normalized = try? ShareStore.normalize(text) { incoming = normalized; break }
            }
            if incoming != nil { break }
            if let text = item.attributedContentText?.string, let normalized = try? ShareStore.normalize(text) { incoming = normalized }
        }
        guard let url = incoming else { status.text = "Share the Reel’s direct Instagram link. Profiles and shortened share links aren’t supported."; done.isHidden = false; return }
        // Keep a protected recovery copy before any request: an extension can be terminated at any time.
        let recovery: URL
        do { recovery = try ShareStore.enqueue(url, kind: "link") } catch { status.text = "Could not save locally. Check App Group setup."; done.isHidden = false; return }
        do {
            let id = try await ShareStore.submit(url)
            try ShareStore.enqueue(id, kind: "item")
            try FileManager.default.removeItem(at: recovery)
            status.text = "Saved privately. Processing continues in the background. Open Dinedeals to review your result."
        } catch ShareFailure.signIn {
            status.text = "Link saved on this iPhone for 24 hours. Open Dinedeals and sign in to send it."
        } catch {
            status.text = "Link saved on this iPhone for 24 hours. Open Dinedeals to retry when connected."
        }
        done.isHidden = false
    }
    @objc private func close() { extensionContext?.completeRequest(returningItems: nil) }
}
