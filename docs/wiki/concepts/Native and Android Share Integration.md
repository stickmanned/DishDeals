---
title: "Native and Android Share Integration"
type: concept
tags: [ios, android, share-extension, pwa]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["ios/", "public/manifest.webmanifest", "public/sw.js", "lib/androidShareInbox.ts", "lib/nativeSession.ts"]
---

# Native and Android Share Integration

## Overview

Two completely independent mechanisms let a user hand DishDeals an Instagram link (or an image) from the OS share sheet, one per platform. They do not share code or storage format.

## iOS: App Group file-queue share extension

- `ios/App/DinedealsApp.swift` — a SwiftUI app shell wrapping one long-lived `WKWebView` that loads the deployed web app. `WebLoadState`/`WebLoadPhase` is a token-based navigation state machine guarding against stale navigation callbacks. On open/foreground, `consumeInbox()` pops the oldest unrouted share from the queue and routes the web view to `/reels?item=<id>` or `/reels?shared=<link>`.
- `ios/ShareExtension/ShareViewController.swift` — the actual `NSExtensionItem`/`NSItemProvider` share-sheet UI: loads only text/URL content (never media bytes) with hard timeouts, resolves exactly one Instagram link, and calls `ShareStore.enqueue`/`submit`.
- `ios/Shared/ShareStore.swift` — the shared logic, used by both the app and the extension: a keychain-backed auth-token store (App-Group keychain-access-group); a file-based inbox at `<AppGroup container>/ReelInbox/*.json` (one atomic JSON file per share, avoiding lost updates between the two processes); the **native supplied context v1** format (bounded JSON: `textFragments` ≤8×4096B, `registeredTypes` ≤32×200B, `receivedAt`, `truncated` — the same contract `lib/reels/nativeContext.ts` enforces server-side, see [[Reel Ingestion Workflow]]); link normalization restricted to Instagram reel/post URLs only; and `submit(url:context:)`, which **POSTs directly to the Convex HTTP API** (bypassing the Next.js server entirely) using a keychain-stored bearer token.
- `ios/project.yml` — the XcodeGen project definition: app bundle `dev.dishdeals.app`, share extension `dev.dishdeals.app.ReelShare`, shared App Group `group.dev.dishdeals`.

## Android/PWA: service-worker share target

- `public/manifest.webmanifest` declares a `share_target` (`POST /share-target`, `multipart/form-data`, accepting an image plus title/text/url).
- `public/sw.js` intercepts that POST, reads the body with a byte-counted, deadline-bounded reader, validates exactly one image (magic-byte sniffed), stores it in IndexedDB (`dishdeals-share-inbox` DB, 24h TTL, max 8 items), and redirects to `/post?share=<id>`.
- `lib/androidShareInbox.ts` is the page-side reader: its constants (`SHARE_DB_NAME`, `SHARE_TTL_MS`, `SHARE_MAX_ITEMS`) are **deliberately duplicated** to match `sw.js` exactly (the service worker's own header comment says so, and a round-trip test exercises both against the same store). `toLoadedShare` **fully re-validates** the stored record (including re-sniffing magic bytes) rather than trusting the worker as sole writer. `adoptShare` ensures a user's own in-progress input always wins — it never overwrites an existing selection or a running extraction flow.
- `components/PwaShareRegistration.tsx` registers `/sw.js`; `components/deals/AndroidShareImport.tsx` is the consuming UI.

## Key Details

- `lib/nativeSession.ts` is the **web-side** half of the iOS bridge (not the Android one): it talks to `window.webkit.messageHandlers.dishdeals`, the message channel `DinedealsApp.swift`'s `WebLoader` listens on (`session`, `received`, `requestShareContext`, `enableNotifications`, `result` message types).
- `scripts/check-release-config.mjs` validates the three production URLs the iOS build embeds (`WebsiteURL`, `BackendURL`, Convex site URL) — bare HTTPS, no placeholders, correct `*.convex.cloud`/`*.convex.site` hostnames for the target deployment — guarding exactly the values `DinedealsApp.swift`'s `WebConfig` and `ShareStore.submit` depend on.

## Sources

- [[Reel Ingestion Workflow]] (the native-context contract and the eventual Convex functions these shares feed), [[Source - Project Process Docs]]
