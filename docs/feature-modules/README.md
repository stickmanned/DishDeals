# Imported modules

All four independent branches remain on GitHub. This trial imports their implementation into the canonical root scaffold at main commit `83035c1` without replacing its original table contracts.

| Feature | Source commit | Integrated paths |
| --- | --- | --- |
| Deal extraction | [91b957a](https://github.com/stickmanned/DishDeals/tree/91b957a37c063d0b7072bb2c92afe4882699bc66/ai-workflow) | `lib/workflow/`, `convex/workflow/ai.ts`, `jobs.ts`, `deals.ts` |
| Deal map | [2daac63](https://github.com/stickmanned/DishDeals/tree/2daac63731a46f20f3484bfa3c352f5ea3737e8b/map-component) | `vendor/restaurant-deals-map-0.1.0.tgz`, `components/TrialApp.tsx` |
| AI deal search | [f863315](https://github.com/stickmanned/DishDeals/tree/f86331538e5a366cbc8c106b2bb23baea01bad7d/ai-workflow) | `lib/workflow/search*.ts`, `convex/workflow/search.ts` |
| Restaurant comparison | [75c224c](https://github.com/stickmanned/DishDeals/tree/75c224cb405b0e1bf901e6c748a313a31f9ae0a8/ai-workflow) | `lib/workflow/compare*.ts`, `convex/workflow/compare.ts` |

Backend source comes from the comparison commit, which includes extraction and search. Original module tests are adapted to root paths and namespaced tables. The map package contains its previously built compiled assets and declarations, so the Next.js build does not depend on Vite-only worker imports.

Adaptations include namespaced additive tables, Convex Auth, durable user ownership, bounded job history, browser-supplied query time, Instagram URL rejection, current Gemini model defaults and the integrated web controls. [TRIAL.md](../TRIAL.md) documents setup and boundaries. Original standalone API documentation is available under the linked source commits; those old deployment commands are not instructions to replace this trial's root schema.
