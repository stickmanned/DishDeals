# Authored posts and source identity release — October4

Reviewed web source: **4341076fca3a6d238d02f9af0cac97cb8dcb86bd**. Frozen clean checkout `/private/tmp/dishdeals-posts-web-release-4341076`, existing dishdeals-demo project identifiers linked; no env/secrets copied. Full `npm run check` EXIT0:2129Vitest/23workflow/typecheck/lint/map+Next production build. Agent production deployment remains blocked; William/his own Claude session executes it.

**Release gate: WAIT for Northstar's explicit dev-sync evidence that deals.listMine and canonical retention functions are present.** Do not deploy the new authored-list feature against an unsynced backend. Gemini page diagnostic is separate, not part of the application upload flow. No live/provider/phone pass is implied by this release.

After the development gate is confirmed, the exact one-line human production command is:

```sh
cd /private/tmp/dishdeals-posts-web-release-4341076 && /tmp/dishdeals-vercel deploy --prod --yes --scope williamwen25-9286s-projects --build-env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud --build-env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site --env NEXT_PUBLIC_CONVEX_URL=https://proper-marmot-82.ca-central-1.convex.cloud --env NEXT_PUBLIC_CONVEX_SITE_URL=https://proper-marmot-82.ca-central-1.convex.site
```

Web changes reach the phone through this deployment. Native receipt/identity changes need a signed rebuild/install: use the existing Xcode Dinedeals scheme, William's connected iPhone, **Product → Run (⌘R)**; preserve the existing Team settings and ignored generated project. Build alone does not install. Actual unsigned app+embedded ReelShare build passed on iPhone18Pro simulator; physical signing/Instagram acceptance of these changes is still pending. Human camera/photo permission commit5bfcf87 is preserved in the current native checkout and descriptions are present in its compiled simulator app; use that existing current Xcode project for the Run.

Changed-feature phone check (under five minutes; only William signs in):
1. Share one Instagram post and one Reel to Dinedeals. Read the receipt in light/dark mode, tap Done; confirm post stays /p/ and Reel stays /reel/ in Saved. Historical URLs already rewritten cannot be restored.
2. Open Post → Your posts. An empty authored list should say it is empty; a failed load should show Retry while the form remains visible.
3. Review one source-supported saved deal through the existing public Publish path. Accept/edit required suggestions, confirm pin, publish; check the marker/detail and Your posts card. Open Edit and verify saved changes persist. A link alone still needs source data unless the separately reviewed retrieval integration is explicitly enabled later.
4. Check expiry copy: expiry plus seven complete subsequent Vancouver days retained; no expiry retained until manual deletion. Do not delete a real deal merely to demonstrate scheduled retention. The seven-day live schedule remains unobserved; cutoff/renewal/storage tests use in-memory data.

Report the first failing stage/error without credentials. Current human-proven facts remain auth persistence and real private URL saving. No automatic Reel video/audio understanding, production deploy, signed new native build or public map/publish acceptance is claimed here.
