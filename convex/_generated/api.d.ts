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
import type * as crons from "../crons.js";
import type * as dealImage from "../dealImage.js";
import type * as dealUploads from "../dealUploads.js";
import type * as deals from "../deals.js";
import type * as extract from "../extract.js";
import type * as geocode from "../geocode.js";
import type * as geocodeState from "../geocodeState.js";
import type * as http from "../http.js";
import type * as instagramPageProbe from "../instagramPageProbe.js";
import type * as reelActions from "../reelActions.js";
import type * as reelSource from "../reelSource.js";
import type * as reelWorkflow from "../reelWorkflow.js";
import type * as reels from "../reels.js";
import type * as seed from "../seed.js";
import type * as test from "../test.js";
import type * as trial from "../trial.js";
import type * as users from "../users.js";
import type * as votes from "../votes.js";
import type * as workflow_ai from "../workflow/ai.js";
import type * as workflow_auth from "../workflow/auth.js";
import type * as workflow_compare from "../workflow/compare.js";
import type * as workflow_deals from "../workflow/deals.js";
import type * as workflow_jobs from "../workflow/jobs.js";
import type * as workflow_maintenance from "../workflow/maintenance.js";
import type * as workflow_search from "../workflow/search.js";
import type * as workflowTables from "../workflowTables.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  dealImage: typeof dealImage;
  dealUploads: typeof dealUploads;
  deals: typeof deals;
  extract: typeof extract;
  geocode: typeof geocode;
  geocodeState: typeof geocodeState;
  http: typeof http;
  instagramPageProbe: typeof instagramPageProbe;
  reelActions: typeof reelActions;
  reelSource: typeof reelSource;
  reelWorkflow: typeof reelWorkflow;
  reels: typeof reels;
  seed: typeof seed;
  test: typeof test;
  trial: typeof trial;
  users: typeof users;
  votes: typeof votes;
  "workflow/ai": typeof workflow_ai;
  "workflow/auth": typeof workflow_auth;
  "workflow/compare": typeof workflow_compare;
  "workflow/deals": typeof workflow_deals;
  "workflow/jobs": typeof workflow_jobs;
  "workflow/maintenance": typeof workflow_maintenance;
  "workflow/search": typeof workflow_search;
  workflowTables: typeof workflowTables;
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

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  geospatial: import("@convex-dev/geospatial/_generated/component.js").ComponentApi<"geospatial">;
};
