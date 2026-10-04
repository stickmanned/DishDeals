# Android trial app

The Android app packages the latest Next.js static frontend with Capacitor 8.5.2. It connects to the same Convex deployment as the website. The frontend is inside the APK, so GitHub Pages does not need to be enabled. Live offers, maps and AI still require internet access.

## Install

Download `DishDeals-Android-APK` from a successful **Android trial** GitHub Actions run, unzip it, and open `app-debug.apk` on an Android phone. Permit installation from the browser or file manager when Android asks. This is a debug-signed teammate trial, not a Play Store release. Minimum Android: 7.0 (API 24), with an up-to-date System WebView. Installations from different builders may have different debug signatures and require uninstalling the older copy first.

## Use

Discover, Share a deal, Map & AI, and Saved Reels use the existing English UI and backend. Share a URL or copied caption from Instagram, Chrome, or another app through Android's share sheet and choose **DishDeals**. Confirm **Use shared text**, then select **Find the offer** yourself. An existing source is replaced only after explicit confirmation. Incoming text stays locally until you use or dismiss it; the latest pending share replaces an older pending share. Image attachments can be selected through **Add image (optional)** or **Take a photo** inside the app; receiving image attachments through the Android share sheet is not implemented.

The backend's existing Google Search quota restrictions and gated Reel provider still apply. Packaging the app does not enable those providers or change live data.

## Build locally

Requirements: Node 22+, JDK 21, Android SDK platform 36 and build tools 36.0.0. Set `JAVA_HOME` and `ANDROID_HOME` for your installed tools.

Set only the public deployment URL in your ignored `.env.local`:

```dotenv
NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud
```

```sh
npm ci
npm run build:android
# android/app/build/outputs/apk/debug/app-debug.apk
```

`build:android` builds the website with an empty base path, syncs it to Android, assembles the APK and runs Android lint. `npm run android:sync` prepares only the web assets; `npm run android:open` opens Android Studio. Always rebuild/sync after frontend changes. Sync only Android: the existing Swift iOS project is independent.

Never put Gemini, Geoapify, or Reel provider keys in `NEXT_PUBLIC_*`, native resources, Gradle files, Actions, or source archives. They belong in Convex environment variables. Signing keys and SDK paths are ignored. The app allows HTTPS traffic, keeps external websites in the system browser, and disables cloud backup of app data.

## Verification

The Android Actions workflow builds and lints the real APK, installs it in an Android 15 emulator, and checks startup, cold/warm text sharing, preserving an existing draft, Back navigation, map/Reels navigation, and crash logs. Screenshots/UI XML are available in `DishDeals-Android-QA`. It does not submit test offers. Physical-phone camera/picker behavior and Play Store signing remain manual checks.

SDK references: [Capacitor Android](https://capacitorjs.com/docs/android), [native plugin registration](https://capacitorjs.com/docs/android/custom-code), [System Bars](https://capacitorjs.com/docs/apis/system-bars).
