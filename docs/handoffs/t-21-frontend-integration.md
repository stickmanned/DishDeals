# New frontend integration

Requested by the user: combine the new GitHub frontend with the existing features and update the existing Convex development deployment.

The implementation combines `t-20-reel-sharing` (the Dinedeals frontend and Reel intake) with `t-00-github-pages` (the deployed extraction, map, AI search, comparison and authentication workflows). `Harrys-Frontend` contains reference assets, rather than a separate working application. Existing feature branches are retained; main is not merged or modified.

## Result

- The new frontend uses the deployed `workflow/deals` and `workflow/jobs` functions, with one shared Convex Auth client for password and anonymous sessions.
- Discover, offer details, caption/screenshot submissions and processing status use real backend data. Map, AI search, restaurant comparison and submission history remain available at `/tools/`.
- Details and submission pages use query parameters so future deal/job IDs work in a static GitHub Pages export. Fonts, images and links respect `/DishDeals`.
- Canonical profile/deal/vote tables are preserved. Profile editing and voting remain unavailable until their real API adapters are implemented; preview actions are not presented as live persistence.
- Reel scraping remains disabled until its existing explicit provider-authorization gate and required provider key are configured. Caption/screenshot extraction is available now.

## Deployment and verification

The existing development deployment `proper-marmot-82` was backed up and updated successfully. API keys remain in Convex. Do not copy provider keys into frontend files or GitHub.

Validation passed: TypeScript, ESLint, 184 unit/backend tests, 23 repository workflow checks and the GitHub Pages static build. Browser checks against the real deployment confirmed anonymous login, a published Cactus Club offer, and a caption submission returning the correct no-deal result without publishing fabricated offers.

Compiled frontend assets are uploaded to `gh-pages`. The repository owner still needs to enable Pages as described in [the hosting guide](../GITHUB-PAGES.md). The previous Sites trial project currently returns “Sites project not found”; its public URL has not been refreshed with this frontend. Do not treat that older URL as evidence of this release.

Remaining acceptance checks include physical-phone testing, a two-restaurant comparison with sufficient real offers, Reel provider setup if desired, and implementing the missing canonical profile/vote adapters.
