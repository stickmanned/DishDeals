# GitHub Pages frontend

This hosting option uses the same integrated frontend and the existing Convex development backend. Provider keys remain in Convex. The editable source is on `t-00-github-pages`; compiled public frontend files are on `gh-pages`. Neither branch changes main.

## Enable the prepared site

The current GitHub account has write access but no admin/maintainer access. A repository administrator or maintainer must open the repository's **Settings → Pages**, choose **Deploy from a branch**, select **gh-pages** and **/(root)**, and save. GitHub then builds and publishes the site. The expected project URL is `https://stickmanned.github.io/DishDeals/`; it is not a confirmed working URL until GitHub reports successful publication.

See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Build an update

Use Node 24 and `npm ci`. On PowerShell:

```powershell
$env:NEXT_PUBLIC_CONVEX_URL = 'https://proper-marmot-82.ca-central-1.convex.cloud'
npm.cmd run build:pages
```

The script builds with `/DishDeals` as the base path and writes `out/.nojekyll`. Publish the contents of `out/` to the root of the separate `gh-pages` branch. Do not publish `.env.local`, the project source tree, node_modules, or provider keys. Review future source changes and repeat this build/publication step; this initial branch-based setup does not install automatic deployment of source updates.

For a renamed repository, set `NEXT_PUBLIC_BASE_PATH` to its new path before building. A root-domain host can continue using `npm run build` without a base path. Refer to [the trial guide](TRIAL.md) for features, review steps and remaining acceptance checks.
