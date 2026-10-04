# DishDeals Setup, Native Verification, and Release Runbook (T-19A)

This document details verified local commands, stage gates for native iOS verification on William's physical iPhone, backend provisioning status, and the retained T-20 custom domain setup instructions.

---

## 1. Web and Shared Core Verification

Reviewed pure functional core modules (`lib/validNow.ts`, `lib/distance.ts`, `lib/dealDraft.ts`, `lib/dealSelection.ts`, `convex/auth.ts`, `convex/profiles.ts`, `convex/votes.ts`) are implemented and verified locally via unit and workflow tests (no full backlog completion implied).

### Runtime Environment
- **Node.js**: Exact runtime `v26.7.0` (active environment).
- **npm**: Exact runtime `v11.19.0` (active environment).
- **ESLint**: Code linter (`eslint .`). Note: ESLint is configured for linting rules, not automated code formatting.
- **Build Output**: Current Next.js build (`next build`) produces static prerendered routes (`/`, `/_not-found`, `/profile`, `/signin`); no server-side rendering (SSR) routes are tested or active.

### Verified Local Commands
```bash
# 1. Clean install dependencies from lockfile
npm ci

# 2. Typecheck TypeScript sources
npm run typecheck

# 3. Lint codebase
npm run lint

# 4. Run Vitest suite across functional core modules
npm run test

# 5. Run workflow guardrail suite
npm run test:workflow

# 6. Verify Next.js static build
npm run build

# Or run combined full check:
npm run check
```

> **Verification Boundary**: Passing `npm run check` confirms shared TypeScript and React code integrity. It does **not** claim clean-clone native mobile readiness or physical device acceptance.

---

## 2. Backend and Secrets Provisioning Gates

Live Convex backend deployment and external Gemini API access are subject to strict stage gates requiring explicit task-specific human authorization before execution.

### Environment Configuration (Actual Code References)
The backend and frontend codebase references the following environment variables:
- `NEXT_PUBLIC_CONVEX_URL`: Public client URL for Convex provider (configured in `components/ConvexClientProvider.tsx`).
- `JWT_PRIVATE_KEY` & `JWKS`: Server-side asymmetric key material for Convex Auth (`@convex-dev/auth`).
- `CONVEX_SITE_URL`: HTTP origin for Convex Auth routing (`convex/auth.config.ts`).
- `Password` provider configuration: Internal Convex Auth credentials.
- `GEMINI_API_KEY`: Server-side API key for Gemini multimodal extraction (`lib/extractCore.ts` takes an explicit config; live Convex action wiring in `convex/extract.ts` remains pending).

> **Secret Hygiene**: Variable names are listed for documentation only. Secrets are managed in deployment dashboards and **never committed to Git or `.env*` files**.

### Backend State Gate
- Original T-02 development schema sync succeeded (human-confirmed DONE); T-02 schema remains unchanged and DONE.
- New T-03+ backend function code (auth handlers, profile queries/mutations, vote mutations) is not synchronized to cloud deployments.
- `npx convex dev --once`: Unrun in current worktrees; cloud deployment and backend function synchronization remain pending target-specific human authorization.

---

## 3. Native iOS Toolchain and Discovery Gates

Harry owns the frontend implementation and native iOS Instagram Share Extension. His native source repository/branch is pending integration. When source is provided, discovery must be performed using read-only inspection commands without altering system toolchains.

> **Native Framework and Map Rendering Unresolved**: The published MapLibre GL browser component (`map-component/src/DealMap.tsx` on published `feature/deal-map`) serves as a web reference implementation only; it does not select or commit to MapLibre for native iOS rendering. Native framework selection (e.g. SwiftUI/MapKit vs web container vs React Native) and native runtime rendering remain unresolved pending Harry's native source intake.

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
- [ ] Locate the project or workspace directory in Harry's source.
- [ ] Inspect available schemes and targets from within that directory:
  ```bash
  xcodebuild -list -project <PathToProject>.xcodeproj
  # or if using a workspace:
  xcodebuild -list -workspace <PathToWorkspace>.xcworkspace
  ```
- [ ] Identify containing app target and Share Extension target (`NSExtensionPointIdentifier = "com.apple.share-services"`).
- [ ] Note native bundle identifier placeholders (e.g. `<CONTAINING_APP_BUNDLE_ID>` and `<SHARE_EXTENSION_BUNDLE_ID>`); do not assume or invent names.
- [ ] Inspect package dependencies (CocoaPods `Podfile`, Swift Package Manager `Package.swift`, or NPM modules).

---

## 4. Physical iPhone Signing & Apple Personal Team Constraints

William has requested direct on-device testing on his physical iPhone (iOS 26; minor version unverified) without paid Apple Developer Program enrollment or App Store submission.

### Apple Personal Team Guidance & Limitations
Official Apple Documentation: [About Your Developer Account (Personal Team)](https://developer.apple.com/help/account/basics/about-your-developer-account)

Official technical limits for a free Apple ID / Personal Team:
1. **10 App IDs** per account ([Apple Developer Account Help](https://developer.apple.com/help/account/basics/about-your-developer-account)).
2. **Up to 3 devices** registered to the account.
3. **Up to 3 installed apps per device** concurrently signed with a Personal Team certificate.
4. **7-Day Provisioning Profile Expiry**: All provisioning profiles expire after 7 days, requiring re-building/re-signing from Xcode to continue running.
5. **App Groups & Capabilities**:
   - If Harry's architecture uses a shared container (`sharedContainerDirectory` / App Groups) for data exchange between the containing iOS app and the Share Extension, verify entitlement compatibility with free Personal Team signing (free teams may restrict App Group entitlements). App Groups is specifically required for shared-container storage, not all cross-process communication universally.

### Physical Device Onboarding Procedure (Human Steps)
1. **Connect & Pair Device**:
   - Connect the iPhone via cable to the Mac.
   - Unlock the iPhone and tap **Trust This Computer**.
   - Note: In current iOS versions, **Developer Mode** option in Settings may remain hidden until the device is paired and trusted with Xcode.
2. **Enable iOS Developer Mode**:
   - Reference: [Enabling Developer Mode on a Device](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).
   - On iPhone: Open **Settings** > **Privacy & Security** > scroll to **Developer Mode** > Toggle **On**.
   - Restart the iPhone when prompted, unlock, and tap **Turn On** to confirm.
3. **Configure Xcode Signing**:
   - In Xcode: **Settings** > **Accounts** > Add William's Apple ID.
   - In Project Settings > Select App Target > **Signing & Capabilities**:
      - Check **Automatically manage signing**.
      - Select **Team: Personal Team**.
      - Ensure bundle identifier placeholder is replaced with a valid unique identifier.
   - Repeat for the Share Extension target.
4. **Deploy to Device**:
   - Select William's physical iPhone in Xcode's run destination bar.
   - Click **Run** (`Cmd + R`).
   - If prompted on device: Go to **Settings** > **General** > **VPN & Device Management** > Tap Developer App certificate > Tap **Trust**.

---

## 5. Retained T-20 Domain Setup Instructions (Unexecuted)

Task T-20 retains custom domain preparation. No domain has been purchased or claimed, and no DNS alterations have been performed.

### Domain Setup Checklist (When Authorized)
1. **Claim Proposed Domain**:
   - Proposed domain: `dishdeals.tech` (availability UNKNOWN; subject to MLH student offer eligibility).
   - Follow MLH / partner student offer instructions to claim.
2. **Project-Specific DNS Configuration**:
   - Add domain in Vercel project dashboard (**Settings** > **Domains**).
   - Retrieve the **project-specific DNS records** provided by the Vercel dashboard (do not assume generic static IP addresses, as Vercel allocates IP and CNAME targets per account/project).
   - Configure corresponding `A` / `ALIAS` and `CNAME` records at the registrar.
3. **TLS Verification**:
   - Verify automated SSL/TLS certificate issuance in Vercel dashboard.
   - Confirm automatic HTTP-to-HTTPS redirect.
