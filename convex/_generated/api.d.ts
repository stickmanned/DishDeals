/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as deals from "../deals.js";
import type * as http from "../http.js";
import type * as reels from "../reels.js";
import type * as reelActions from "../reelActions.js";
import type * as reelWorkflow from "../reelWorkflow.js";
import type * as test from "../test.js";
import type * as users from "../users.js";
import type * as votes from "../votes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  deals: typeof deals;
  http: typeof http;
  reels: typeof reels;
  reelActions: typeof reelActions;
  reelWorkflow: typeof reelWorkflow;
  test: typeof test;
  users: typeof users;
  votes: typeof votes;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: { workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow"> };
