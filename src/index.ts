/**
 * Bun RAD Studio - Unified Export Hub
 * Exports SimpleGUI (native macOS webview GUI engine) and SimpleCLI (headless console & RAD toolkit)
 */

export * from "./simplecli/index.ts";
export * from "./simplegui.ts";
export * from "./features/rad/index.ts";

// Names that more than one of the libraries above define, each with different behaviour. They used to be
// exported as `undefined`; each now refers to one definition on purpose (decision recorded in D-027).
// The `rad` versions stay available through their module namespaces: `logutils.Logger`, `logutils.LogLevel`,
// `cacheutils.LRUCache`, `fileutils.writeFileAtomic` (asynchronous, unlike SimpleGUI's).
export { LRUCache, Logger, LogLevel, TreeNode } from "./simplecli/index.ts";
export { writeFileAtomic } from "./simplegui.ts";
