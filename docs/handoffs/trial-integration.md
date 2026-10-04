# Web trial integration handoff

User assignment: integrate all four published feature modules, deploy the backend to `william-wen/dishdeals/proper-marmot-82`, and provide a trial link accessible to anyone with the URL. This explicitly extends the earlier map/deployment ownership boundary for this isolated trial.

Branch: `t-00-trial-integration`, based on `origin/main` at `83035c1`. Main and the original working checkout remain untouched. No main merge is authorized or performed.

Frontend: https://dishdeals-trial.cpy1111.chatgpt.site

Backend: https://proper-marmot-82.ca-central-1.convex.cloud

Changed paths: root app/provider/static export config and dependencies; additional namespaced workflow tables and functions; adapted pure/provider libraries and tests; map library tarball built from the existing module; setup/provenance documentation. The existing workflow symlink-escape test now creates a Windows directory junction, preserving the same escape check without requiring Windows symlink privileges.

Validation on Node 24: typecheck and lint pass; 78 schema/provider/search/comparison/backend tests pass; 23 workflow tests pass; static Next.js build passes. `npm audit --omit=dev` reports zero production vulnerabilities. Existing development lint dependencies still have advisories; no forced downgrade was performed. Tests use provider mocks where stated and do not imply live comparisons or phone acceptance.

Cloud evidence: database exported to a local backup before additive schema deployment; exact named dev deployment synced successfully. Key availability was checked by names/booleans only. New Convex Auth signing keys were generated locally and sent via CLI stdin, never displayed, committed or put in frontend files. Live browser guest login, refresh/session persistence, saved task history and real Gemini search were exercised. A real no-offer text submission completed without creating an offer. An admin-only temporary Geoapify probe matched the official Cactus Club Cafe address at 575 West Broadway with score 1; temporary diagnostics were removed afterwards. Live official-source caption extraction exercised the private review path and retained unknown currency/publication-date warnings. No fictitious offers were published.

Live publication evidence: the official-source happy-hour caption matched the correct Vancouver branch, passed manual review, and produced one real map offer with source attribution. Unknown currency remains unknown; it is not presented as a CAD price. Searches without a budget now retain unknown-currency offers, while an explicit CAD budget requires a known CAD price.

Hosting evidence: Sites source commit `a8d4dbd79c4c74898fee85a67201c1b4c2dcee92`, saved version 2, deployment `appgdep_6ac1d12d05a88191ba91bb8d11e073fd` returned `succeeded` and the URL above. Source/build packaging uses a separate publishing checkout; GitHub remains the editable app source. Git TLS uses the OpenSSL backend locally with certificate verification preserved; Git Bash packaging uses `TAR_OPTIONS=--force-local` for Windows drive paths. No recurring automation was created.

Remaining acceptance: test on physical phones and with two devices; submit actual screenshots/webpages and exercise real comparisons with at least two verified restaurants. The canonical full-plan votes/profiles/tipping/PWA/draggable-pin flows are outside these imported feature modules. See `docs/TRIAL.md` for all boundaries.

Integration remains a draft for the team's review; only the authorized integrator merges main.
