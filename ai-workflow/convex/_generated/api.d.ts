/* eslint-disable */
  /**
   * Generated `api` utility.
   *
   * THIS CODE IS AUTOMATICALLY GENERATED.
   *
   * To regenerate, run `npx convex dev`.
   * @module
   */
  
  import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
  import type * as ai from "../ai.js";
import type * as auth from "../auth.js";
import type * as deals from "../deals.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as maintenance from "../maintenance.js";
import type * as search from "../search.js";

  /**
   * A utility for referencing Convex functions in your app's API.
   *
   * Usage:
   * ```js
   * const myFunctionReference = api.myModule.myFunction;
   * ```
   */
  declare const fullApi: ApiFromModules<{
    "ai": typeof ai,
"auth": typeof auth,
"deals": typeof deals,
"http": typeof http,
"jobs": typeof jobs,
"maintenance": typeof maintenance,
"search": typeof search,
  }>;
  export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
  export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
  