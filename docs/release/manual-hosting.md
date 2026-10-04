# Manual HTTPS demo hosting

William chose to handle hosting manually after the local CLI credential returned HTTP403. Connected Vercel project inventory worked, but no DishDeals hosting project was created. No existing unrelated project was changed. Backend development sync is already applied separately; hosting does not run Convex deployment.

Reviewed local source: `/tmp/dishdeals-web-release` at `401603c41875c3f42c06ee88d22d411e3b3cf19f`; checkout is detached and isolated, including native-load and recording-frame integrations. Combined `npm run check` at401603c passed1728Vitest/23workflow/typecheck/lint/build, including authentic backend generated types. Published Git main does not contain this integrated work. Do not use Vercel Git import of main as equivalent, and do not push Git or buy a domain to work around hosting.

Use your Mac Terminal (existing account authentication stays on your Mac). Skip project create only if you already created the dedicated demo project:

```sh
cd /tmp/dishdeals-web-release
/tmp/dishdeals-vercel login
/tmp/dishdeals-vercel project create dishdeals-demo --scope williamwen25-9286s-projects
/tmp/dishdeals-vercel link --yes --project dishdeals-demo --team team_g0tET84dM6H3GrxWQmUE7TO5
/tmp/dishdeals-vercel deploy --yes --scope williamwen25-9286s-projects \
  --build-env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud \
  --build-env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site \
  --env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud \
  --env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site
```

The wrapper uses the downloaded Vercel62.2 CLI; it does not contain credentials. If the downloaded temporary CLI is unavailable, use an installed Vercel CLI with the same arguments. Deploy is a preview, not production promotion. The release `.vercelignore` excludes native project/signing, env files, repository metadata and local agent/dependency/build artifacts. The host must run Next/Node; static GitHub Pages is insufficient. Use the project's existing `npm run build` (which builds the map child package), not a static-export build.

Check the resulting HTTPS origin in Safari without Vercel login; a protected preview which redirects to Vercel authentication will not work inside the app's exact-origin WKWebView. Configure public access for this dedicated demo only as appropriate; do not change unrelated projects or share secret bypass links with the app. Source should remain private (do not pass `--public`). Report the bare `https://…vercel.app` origin without path, trailing slash, query or bypass token.

Northstar then validates the origin, configures `REEL_WEB_ORIGIN` and the identifying geocoder User-Agent on the already-authorized development backend. Existing model keys remain server-side. Preserve the ignored human Xcode project's Team; set its `WEBSITE_URL` to this origin and `BACKEND_URL=https://proper-marmot-82.ca-central-1.convex.cloud` for app+extension, build and install to William's phone. No XcodeGen regeneration. Runtime/sign-in/provider/map acceptance remains pending until actually tested.

Correction for frozen401603c release: omit NEXT_PUBLIC_WORKFLOW_CONVEX_URL from both build and runtime settings. Its historical nested unauthenticated provider shadows the canonical signed-in client. If already set in this dedicated project, remove that variable for the next build/deploy. This temporary configuration preserves canonical /reels,/post,/map; legacy Discover remains its labelled preview. Northstar is fixing shared-session integration separately; do not move the frozen checkout during manual deployment. No secrets involved in these public URL values.

William published https://dishdeals-demo.vercel.app and reports setting REEL_WEB_ORIGIN. Northstar verified public HTTP200, regional cloud /version200 and regional site JWKS200; the unregional site JWKS returns404. Use the regional cloud and site public build/runtime settings shown above. User edited ios/project.yml URLs; ignored existing Xcode project still requires verifying resolved build settings or explicit command overrides, without regeneration or losing Team. Native/provider acceptance not implied by HTTP200.

## Operative release configuration and one-line commands

### Operative release URLs
- **Website:** `https://dishdeals-demo.vercel.app`
- **Backend:** `https://proper-marmot-82.ca-central-1.convex.cloud`
- **Site:** `https://proper-marmot-82.ca-central-1.convex.site`
- **Deployment:** `proper-marmot-82`
- **Region:** `ca-central-1`

### Headless validator command
```sh
node scripts/check-release-config.mjs --website https://dishdeals-demo.vercel.app --backend https://proper-marmot-82.ca-central-1.convex.cloud --site https://proper-marmot-82.ca-central-1.convex.site --deployment proper-marmot-82 --region ca-central-1
```

### One-line HUMAN production deploy command
Run in the clean reviewed snapshot directory where the dedicated project was already linked by the human:
```sh
/tmp/dishdeals-vercel deploy --prod --yes --build-env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud --build-env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site --env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud --env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site
```

### One-line native build command with setting overrides (preserving Team)
Native rebuild is unnecessary for web-only changes. If native URLs or settings changed, run without XcodeGen regeneration to preserve the working Xcode Team:
```sh
xcodebuild -project ios/Dinedeals.xcodeproj -scheme Dinedeals -destination 'generic/platform=iOS' WEBSITE_URL="https://dishdeals-demo.vercel.app" BACKEND_URL="https://proper-marmot-82.ca-central-1.convex.cloud" build
```

