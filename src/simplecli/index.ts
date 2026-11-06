/**
 * bun-simplcli - Comprehensive zero-dependency headless console & RAD toolkit for Bun
 */

export * from "./core/types.ts";
export * from "./core/ansi.ts";
export * from "./core/logger.ts";
export * from "./core/prompts.ts";
export * from "./core/pipeline.ts";
export * from "./core/config.ts";
export * from "./core/redis.ts";
export * from "./core/client.ts";
export * from "./core/SimpleCLI.ts";
export * from "./sys/index.ts";
export * from "./stdlib/index.ts";

import { SimpleCLI } from "./core/SimpleCLI.ts";

/** Creates a new `SimpleCLI` application instance with the specified name and version. */
export function newApp(name: string, version: string = "1.0.0"): SimpleCLI {
  return new SimpleCLI(name, version);
}

/** Alias for `newApp` that creates a new `SimpleCLI` application instance. */
export function createApp(name: string, version: string = "1.0.0"): SimpleCLI {
  return new SimpleCLI(name, version);
}

/** Initializes a `SimpleCLI` application using metadata inferred from `package.json` or the script filename. */
export function initApp(): SimpleCLI {
  return SimpleCLI.initApp();
}

export default SimpleCLI;
