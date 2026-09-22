/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crew from "../crew.js";
import type * as http from "../http.js";
import type * as lib_crewCore from "../lib/crewCore.js";
import type * as lib_firecrawl from "../lib/firecrawl.js";
import type * as lib_openaiClient from "../lib/openaiClient.js";
import type * as lib_phaseUtils from "../lib/phaseUtils.js";
import type * as lib_sandbox from "../lib/sandbox.js";
import type * as messages from "../messages.js";
import type * as phases_execute from "../phases/execute.js";
import type * as phases_plan from "../phases/plan.js";
import type * as phases_preview from "../phases/preview.js";
import type * as phases_test from "../phases/test.js";
import type * as projects from "../projects.js";
import type * as publish from "../publish.js";
import type * as published from "../published.js";
import type * as sessions from "../sessions.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crew: typeof crew;
  http: typeof http;
  "lib/crewCore": typeof lib_crewCore;
  "lib/firecrawl": typeof lib_firecrawl;
  "lib/openaiClient": typeof lib_openaiClient;
  "lib/phaseUtils": typeof lib_phaseUtils;
  "lib/sandbox": typeof lib_sandbox;
  messages: typeof messages;
  "phases/execute": typeof phases_execute;
  "phases/plan": typeof phases_plan;
  "phases/preview": typeof phases_preview;
  "phases/test": typeof phases_test;
  projects: typeof projects;
  publish: typeof publish;
  published: typeof published;
  sessions: typeof sessions;
  tasks: typeof tasks;
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
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
