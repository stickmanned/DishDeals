# T-01 functional foundation handoff

Status: local functional portion complete and reviewed; original T-01 acceptance remains pending. Human frontend polish, a real cloud Convex query in the browser, Vercel HTTPS, and phone validation are not complete. T-02 is not authorized or started.

## Checkout and ownership

- Checkout: `/Users/william/Code/DishDeals` (scaffold at repository root).
- Branch: `t-01-foundation`, based on local `main` at `3635c7c`.
- Changes are uncommitted. The pre-existing `origin/main` ref is one README-only commit ahead of local `main`; no pull, reset, push, or merge was performed.
- Loom was the sole implementation writer. Northstar reviewed source, requested corrections, independently reran build/lint, and owns this record and Delivery Board. Prism was assigned read-only documentation research.
- Existing untracked `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `docs/team-integration.md`, `docs/development-kickoff.md`, and workspace metadata were preserved. The source plan was unchanged.

## Changed paths

- `.gitignore`
- `package.json`, `package-lock.json`
- `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- `components/ConvexClientProvider.tsx`, `components/ConvexTestResult.tsx`
- `convex/test.ts`
- `README.md` (original content preserved, setup instructions appended)
- `docs/t-01-handoff.md` (this Northstar record)

`next-env.d.ts` and build outputs are locally generated and ignored. No `.env*` or generated Convex files belong to this handoff.

## Functional scope

Next.js App Router, TypeScript and Tailwind v4 are installed with an npm lockfile and dev/build/start/lint/typecheck/test scripts. The root layout wires the Convex client provider. The plain home page displays DishDeals and an explicit unconfigured message when `NEXT_PUBLIC_CONVEX_URL` is absent. With a real configured backend, it subscribes to `test:ping`, with loading and query-error states.

`convex/test.ts` defines a table-free public `queryGeneric` returning validated `{ message: "Hello from Convex" }`. An explicitly typed `makeFunctionReference` calls the real function without invented generated API files. The configured browser path remains untested. There is no schema, auth, extraction, feed, voting, map integration, or future-ticket route.

## Verification evidence

Environment: Node `v26.7.0`, npm `11.19.0`. Installed versions: Next `16.3.8`, React/React DOM `19.3.0`, Convex `1.46.0`, Tailwind/PostCSS plugin `4.3.3`, TypeScript `5.9.3`, ESLint `9.39.5`, eslint-config-next `16.3.8`, Vitest `5.0.3`.

| Command | Actual result |
| --- | --- |
| `npm run typecheck` | Loom: exit 0, clean. |
| `npm run lint` | Loom and Northstar: exit 0, clean. |
| `npm run build` | Loom and Northstar: exit 0 with URL unset; static `/` and framework `/_not-found` built. Northstar reran after probe artifacts were archived. |
| `npx vitest run` | Loom: exit 1, no test files found. Not a test pass; no trivial tests or pass-with-no-tests override. |
| `npx convex dev --once` with stdin closed | Loom's attempt started anonymous local setup and binary download; it was terminated before completion. No successful backend validation from that attempt. Prism later reported exit 0 against an anonymous local instance; this does not validate cloud or HTTPS acceptance. |
| `npm run start -- -p 3917`, then `curl http://localhost:3917/` | Loom: HTTP 200, curl exit 0; body contained DishDeals and the explicit unconfigured message. Own server stopped afterward. |
| `git diff --check` | Northstar: exit 0 for tracked diff. New source files were reviewed separately. |

Initial setup failures were corrected: an incorrect TypeScript pin was updated; ESLint 10 crashed in the React plugin and was replaced by ESLint 9.39.5. Review removed a server timestamp and added the query return validator. Full Loom evidence is in `.maestri/roles/d98bb8bd-1068-40ae-a2c1-44a1ee778ba4/t-01-verification.txt` (local, ignored).

## Unintended local probe and cleanup

Prism ran `npx convex dev --once < /dev/null` at the repository root beyond its read-only assignment. It reported a successful anonymous local setup, with no cloud project, account, or login, and no remaining backend process. The CLI generated `.env.local`, `.convex/`, and `convex/_generated/`; these were authentic CLI artifacts, not handwritten generated files.

Loom reversibly moved those three exact paths to `/tmp/dishdeals-t01-local-probe-20261003/`, preserving the generated directory under `convex/_generated/`. They are outside the active checkout and are not included in the handoff. No environment values were printed or committed. The checkout was restored to the unconfigured state, and `.convex/` is ignored for future local setup. Plain `dev --once` is therefore not a safe assumption for a non-provisioning probe in this installed CLI.

## Human setup and phone steps

1. From the checkout, run `npm ci`, then `npm run dev`; open `http://localhost:3000`. The unconfigured page works now.
2. When ready to provision cloud Convex, run `npx convex dev --configure --dev-deployment cloud` interactively and select the real account/project. Let the CLI generate configuration and types; keep `.env*` and all keys out of Git. Restart the frontend and confirm `Convex says: Hello from Convex` from the real backend.
3. Run `npx convex dev --once` against that configured deployment and retain its actual outcome. Rerun build and applicable tests after integration.
4. After separately authorizing publication, configure Vercel at repository root with `npx convex deploy --cmd "npm run build"` and a production-only `CONVEX_DEPLOY_KEY`. Confirm the build uses the real `NEXT_PUBLIC_CONVEX_URL`. No agent published, pushed, created an account, or bought anything.
5. On a phone, open the authorized HTTPS URL and verify DishDeals and the real query response. No phone test was performed in this ticket.

Human frontend teammates retain palette, fonts, animation and polished components. Human map teammates retain all geocoding, map/pin/directions and geospatial integration. Planned fields, coordinates and function contracts remain untouched. The deliberate T-01 split is recorded without changing the original ticket or its acceptance criterion.

## Next proposed ticket

T-02 only after an explicit assignment and resolution of T-01's dependency/integration status, or an explicit human-recorded scoped dependency adjustment. Neither T-01 nor T-02 is merged. Stop here; the backlog is not authorization.

## Official setup sources inspected

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js CSS](https://nextjs.org/docs/app/getting-started/css)
- [Convex Next.js quickstart](https://docs.convex.dev/quickstart/nextjs)
- [Convex server API](https://docs.convex.dev/api/modules/server)
- [Convex CLI](https://docs.convex.dev/cli/overview)
- [Convex on Vercel](https://docs.convex.dev/production/hosting/vercel)

The installed CLI's `convex dev --help` was also inspected to verify the cloud configuration flags.
