# October4 06:26 receipt and supplied-caption release

Reviewed source `6fb14cb1b87b5364016452a5c8164a01546d541b`, integration checkout `/Users/william/Code/DishDeals-worktrees/workflow`, branch `t-00-agent-workflow`. `npm run check` exit0:74 files/2070 Vitest tests,23 workflow tests, typecheck, lint, map build and Next production build. Log `/tmp/dishdeals-0625-integration-check.log`. No empty or failed suites counted.

Native receipt fix `612eb66` integrated `2b8ce57`: adaptive readable colors, scalable typography and safe-area margins. Exact fixed app+extension unsigned simulator build passed in Mica's isolated scratch project. Real UIKit contrast regression failed against original code (dark1.07:1) and passed fixed code (light19.69:1/dark21:1). Controlled UIKit success-state captures are fixtures, not Instagram or successful private-save evidence. Northstar's own simctl rerun was blocked by a CoreSimulatorService connection failure in its runtime; Mica's actual execution remains the documented simulator evidence. William's new signed install/receipt acceptance is pending. Existing ignored Xcode project/signing has not been regenerated.

Web: public-deal entry from saved posts, actual Publish button restored, provenance URL prefilled once, pasted-caption/text extraction without image/recording upload. Canonical validation, review notes, explicit field acceptance, confirmed pin and authenticated writes remain required. No Instagram URL fetching. A URL alone still cannot automatically supply Reel content. Text output is explicitly partial; video/audio were not examined. The supplied-text backend action was backed up and synced to the existing regional development deployment at06:20; no live authenticated Gemini call was made by agents.

## Install the receipt fix now

Open the **existing** `/Users/william/Code/DishDeals-worktrees/workflow/ios/Dinedeals.xcodeproj` in Xcode, select Dinedeals and William's connected iPhone, choose Product → Run (**⌘R**). Preserve Personal Team for both targets. Do not run XcodeGen. CLI build alternative (build alone does not install):

```sh
cd /Users/william/Code/DishDeals-worktrees/workflow && xcodebuild -project ios/Dinedeals.xcodeproj -scheme Dinedeals -destination 'generic/platform=iOS' WEBSITE_URL=https://dishdeals-demo.vercel.app BACKEND_URL=https://proper-marmot-82.ca-central-1.convex.cloud build
```

## Human web release

Clean detached snapshot `/private/tmp/dishdeals-web-release-6fb14cb` contains the reviewed source above, separate from the older manual-hosting checkout. Link it to the **existing** dishdeals-demo project using public local project metadata; no account/project creation or backend deployment is needed. William or his Claude session runs this command, not agents:

```sh
cd /private/tmp/dishdeals-web-release-6fb14cb && /tmp/dishdeals-vercel deploy --prod --yes --scope williamwen25-9286s-projects --build-env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud --build-env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site --env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud --env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site
```

Web release alone needs no native rebuild; this batch **also includes the native receipt fix**, which does require the signed Run step above.

## Phone test — only changes in this batch, under5 minutes

1. After ⌘R installation, share a real Instagram Reel to Dinedeals in light and dark appearance. Receipt text must be readable, wrap inside margins and keep Done usable. Tap Done and verify the private save still appears.
2. After human web release, open that save's public-deal creation entry. Verify its Instagram source URL is prefilled; a bare link must not claim automatic suggestions.
3. Paste actual deal caption/text and request suggestions without attaching a file. Verify editable suggestions and the partial-source review note; accept supported fields, resolve missing required details, confirm the location, and publish. Check the saved marker and deal detail. Report the first failing step; no passwords/tokens.

Login across tabs/relaunch and private URL save already have William phone evidence. This batch does not close automatic bare-link Reel understanding or the full remaining backlog. Discover legacy feed, seeds, real provider results and other live features retain their pending/broken status.
