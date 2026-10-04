# DishDeals Setup, Native Verification, and Release Runbook (T-19A)

This document provides verified local setup procedures, stage gates for native iOS verification on William's physical iPhone, backend provisioning checkpoints, and the retained T-20 custom domain checklist.

---

## 1. Web and Shared Core Verification

All functional core logic (auth, temporal validity, haversine distance, deal draft state, deal selection, and votes) is implemented and verified locally via pure unit and workflow tests.

### Prerequisites
- Node.js (v20+ recommended, tested on Node 22+)
- npm (v10+)

### Commands & Verification Steps
```bash
# 1. Clean install dependencies according to lockfile
npm ci

# 2. Typecheck core TypeScript files
npm run typecheck

# 3. Code formatting and linting
npm run lint

# 4. Run Vitest suite across all shared logic and contracts
npm run test

# 5. Run workflow guardrail test suite
npm run test:workflow

# 6. Verify Next.js static and SSR build
npm run build

# Or execute full combined pipeline:
npm run check
```

> **Note on Verification Evidence**: A passing `npm run check` in coordinator integration confirms shared TypeScript and React code integrity. It does **not** claim clean-clone native mobile readiness or physical device acceptance.

---

## 2. Backend and Secrets Provisioning Gates

Live Convex backend deployment and external Gemini API access are subject to strict stage gates and require explicit task-specific human authorization before execution.

### Environment Configuration (Variable Names Only)
The application expects the following configuration values (set in Convex Dashboard or deployment environment; **never committed to Git or `.env*` files**):
- `CONVEX_DEPLOYMENT`: Target Convex deployment identifier.
- `NEXT_PUBLIC_CONVEX_URL`: Client-accessible Convex backend endpoint.
- `GEMINI_API_KEY`: Server-side API key for Gemini 3.8 Flash multimodal extraction (managed strictly in Convex dashboard; never client-exposed).
- `JWKS` / Password Provider secrets for Convex Auth (`@convex-dev/auth`).

### Backend Execution Gate
- `npx convex dev --once`: Evaluates schema validity and syncs tables against a development deployment.
- **Current Status**: Evaluated as **unrun** in local worktrees unless authorized for an explicit deployment task. No cloud deployment or database mutation is authorized as part of documentation prep.

---

## 3. Native iOS Toolchain and Discovery Gates

Harry owns the frontend implementation and native iOS Instagram Share Extension. His native source repository/branch is pending integration. When source is provided, discovery must be performed using read-only inspection commands without altering system toolchains.

### Read-Only Toolchain Discovery Commands
```bash
# Verify active developer directory
xcode-select -p

# Inspect installed Xcode and build tools versions
xcodebuild -version

# List available iOS simulators and runtimes
xcrun simctl list devices available
```

### Discovery Checklist (Once Native Source Arrives)
- [ ] Determine native framework: Swift/UIKit, SwiftUI, React Native, or Expo.
- [ ] Inspect available Xcode targets and schemes:
  ```bash
  xcodebuild -list
  ```
- [ ] Identify main containing app target and Share Extension target (`NSExtensionPointIdentifier = "com.apple.share-services"`).
- [ ] Inspect bundle identifiers and deployment targets (targeting William's iOS 26 device).
- [ ] Verify dependencies (CocoaPods `Podfile`, Swift Package Manager `Package.swift`, or NPM modules).

---

## 4. Physical iPhone Signing & Apple Personal Team Constraints

William has requested direct on-device testing on his physical iPhone (iOS 26) without paid Apple Developer Program enrollment or App Store submission.

### Apple Personal Team Guidance & Limitations
Official Apple Documentation: [About Your Developer Account (Personal Team)](https://developer.apple.com/help/account/basics/about-your-developer-account)

Key technical constraints of a free Apple ID / Personal Team:
1. **7-Day Provisioning Profile Expiry**: Provisioning profiles generated under a Personal Team expire every 7 days, requiring re-building/re-signing from Xcode to continue running.
2. **Device Limits**: Limited to 3 active test devices per account.
3. **App Limit**: Up to 3 installed personal development apps per device.
4. **Entitlements & App Groups**:
   - Sharing data between an iOS containing app and a Share Extension typically requires [Configuring App Groups](https://developer.apple.com/documentation/xcode/configuring-app-groups) (`group.<bundle_id>`).
   - Free Personal Teams have restricted access to certain iCloud, Push Notification, and associated domain capabilities. App Groups support on free personal teams must be verified against Xcode's automatic signing before assuming cross-process shared container access.

### Physical Device Onboarding Procedure (Human Steps)
1. **Connect & Trust**:
   - Connect the iPhone via USB-C/Lightning to the Mac.
   - Unlock the phone and tap **Trust This Computer**.
2. **Enable iOS Developer Mode**:
   - Reference: [Enabling Developer Mode on a Device](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).
   - On iPhone: Open **Settings** > **Privacy & Security** > scroll to **Developer Mode** > Toggle **On**.
   - Restart the iPhone when prompted, unlock, and tap **Turn On** to confirm.
3. **Configure Xcode Signing**:
   - In Xcode: **Settings** > **Accounts** > Add William's Apple ID.
   - In Project Settings > Select App Target > **Signing & Capabilities**:
     - Check **Automatically manage signing**.
     - Select **Team: Personal Team**.
     - Ensure bundle identifier is unique (e.g. `com.william.dishdeals`).
   - Repeat for the Share Extension target if present.
4. **Deploy to Device**:
   - Select William's physical iPhone in Xcode's run destination bar.
   - Click **Run** (`Cmd + R`).
   - If prompted on device: Go to **Settings** > **General** > **VPN & Device Management** > Tap Developer App certificate > Tap **Trust**.

---

## 5. Retained T-20 Domain and HTTPS Checklist

The plan retains task T-20: claiming a `.tech` domain through Major League Hacking (MLH) / Namecheap and configuring HTTPS on Vercel.

> **Pre-Flight Authorization**: Do not purchase, claim, register, or alter live DNS records without explicit task authorization. Native app hosting is separate from web hosting.

### Step-by-Step Domain Setup Checklist
1. **Claim Domain**:
   - Navigate to the MLH / Namecheap student portal.
   - Register the preferred domain (e.g. `dishdeals.tech`).
2. **DNS Configuration (Vercel)**:
   - In Vercel Project Dashboard: **Settings** > **Domains** > Add `dishdeals.tech` and `www.dishdeals.tech`.
   - In DNS Registrar (Namecheap / DNS provider), add standard apex and subdomain records:
     - **Apex (`@`)**: `A` record pointing to `76.76.21.21` (or registrar ALIAS/ANAME).
     - **Subdomain (`www`)**: `CNAME` record pointing to `cname.vercel-dns.com`.
3. **TLS / SSL Issuance**:
   - Verify Vercel automated Let's Encrypt TLS certificate generation.
   - Verify HTTP automatically redirects to HTTPS (HTTP 308).
4. **App Integration**:
   - Set production environment variable `NEXT_PUBLIC_SITE_URL=https://dishdeals.tech`.
   - Verify web manifest, service worker scope, and Convex Auth origin bindings reflect the custom domain.
