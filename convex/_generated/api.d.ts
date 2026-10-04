/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as test from "../test.js";
// Offline type extension for Reel modules/component; regenerate through authorized
// Convex codegen before deployment. No backend sync was performed by this change.
import type * as auth from "../auth.js";
import type * as reels from "../reels.js";
import type * as reelActions from "../reelActions.js";
import type * as reelWorkflow from "../reelWorkflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  test: typeof test;
  auth: typeof auth;
  reels: typeof reels;
  reelActions: typeof reelActions;
  reelWorkflow: typeof reelWorkflow;
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
