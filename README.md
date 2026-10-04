# DishDeals

stormhacks project

## T-01 foundation: setup and run

Functional scaffold only: Next.js App Router, TypeScript, Tailwind CSS v4, Convex. Polished styling and fonts belong to the frontend teammate. T-02 adds the canonical schemas and seven contract tests. Auth, extraction and maps remain later work.

### Local setup

```bash
npm install
npm run dev
```

Without a Convex URL, the home page shows "DishDeals" and a visible "Convex is not configured: NEXT_PUBLIC_CONVEX_URL is unset" message. The build also works unconfigured. Nothing is mocked.

### Convex (human step)

1. Run `npx convex dev --configure --dev-deployment cloud` and select your real account and project. This is a human step; agents do not create accounts or deployments. Plain `npx convex dev --once` can auto-initialize an anonymous *local* backend (it writes `.env.local`, `.convex/` and `convex/_generated/` with a local URL). A local success does not satisfy cloud or Vercel HTTPS acceptance.
2. The cloud setup writes `.env.local` with `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`, and generates `convex/_generated/`.
3. Do not commit `.env*` or any key. `.env*` is git-ignored. Keep server-only keys out of `NEXT_PUBLIC_*` variables.
4. `npm run dev` should then show "Convex says: Hello from Convex".

`convex/test.ts` is a table-free `queryGeneric` (`test:ping`, validated with `returns: v.object({ message: v.string() })`). `components/ConvexTestResult.tsx` calls it through an explicitly typed `makeFunctionReference`, This scaffold originally preceded code generation; authentic generated files are now tracked in T-02. Switching this test to `api.test.ping` is optional later cleanup. `convex/_generated/` is not git-ignored; Convex recommends committing it, and authentic generated files are now committed in the T-02 baseline.

### Checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run build       # next build (works with NEXT_PUBLIC_CONVEX_URL unset)
npm test           # seven schema contract tests in T-02
npx convex dev --once   # not validated by the scaffold; may auto-create an anonymous LOCAL backend (see above)
```

### Deployment (human, pending)

Vercel build command: `npx convex deploy --cmd "npm run build"`. In Vercel, set a production-only `CONVEX_DEPLOY_KEY` (from the Convex dashboard). The deploy sets `NEXT_PUBLIC_CONVEX_URL` for the build; do not hard-code or fabricate a URL. The Vercel HTTPS URL showing the Convex test result, and live Convex acceptance, remain pending until a human provisions and authorizes them.

### References

- Next.js installation: https://nextjs.org/docs/app/getting-started/installation
- Next.js CSS / Tailwind: https://nextjs.org/docs/app/getting-started/css
- Convex Next.js quickstart: https://docs.convex.dev/quickstart/nextjs
- Convex server API (`queryGeneric`, `FunctionReference`): https://docs.convex.dev/api/modules/server
- Convex on Vercel: https://docs.convex.dev/production/hosting/vercel

## Parallel agent workflow

Read [the workflow](docs/agent-workflow.md), [task ownership](docs/workflow/tasks.json) and [teammate integration decision](docs/decisions/0001-teammate-backend-integration.md). Northstar coordinates and reviews, Loom owns complex auth, Cinder owns validity, Mica owns distance math, and Prism reconciles extraction. Small bounded tasks default to Gemini Flash, with at most three Gemini requests concurrently. Every builder has its own Git worktree; human teammates retain polished frontend and all maps.

`npm run agents -- status` shows the roster and published branches; `npm run check` runs local quality checks. No provider credentials or deployment are required by CI. T-03/T-04A/T-04B/T-05R packets are prepared; Northstar must assign the bounded batch after setup integration.

## Codebase wiki

For a navigable, continuously-updated map of the codebase (architecture, data model, "where is X" / "how do I add Y"), see [docs/wiki/overview.md](docs/wiki/overview.md) and [docs/wiki/codemap.md](docs/wiki/codemap.md).
