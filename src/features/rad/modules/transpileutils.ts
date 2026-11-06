/**
 * In-memory TypeScript/TSX transpilation, import/export AST scanning, type stripping,
 * and runtime evaluation powered by `Bun.Transpiler`.
 */
// Feature: RAD - transpileutils
// In-memory TypeScript/TSX transpilation, import scanning, and AST inspection powered by native Bun.Transpiler
import { Transpiler } from "bun";

/**
 * Source language loader supported by `Bun.Transpiler`.
 */
export type TranspileLoader = "ts" | "tsx" | "js" | "jsx";

/**
 * Configuration options for {@link transpileTs}.
 */
export interface TranspileOptions {
  loader?: TranspileLoader;
  minify?: boolean;
  inlineSourceMap?: boolean;
}

/**
 * Exported symbol names and import specifiers discovered by {@link analyzeCode}.
 */
export interface CodeAnalysis {
  exports: string[];
  imports: {
    path: string;
    kind: string;
  }[];
}

// Doer: Transpile TypeScript or TSX to vanilla JavaScript in memory
/**
 * Transpiles TypeScript/TSX/JSX source code into JavaScript in memory using `Bun.Transpiler`.
 */
export function transpileTs(source: string, options: TranspileOptions = {}): string {
  const transpiler = new Transpiler({
    loader: options.loader ?? "ts",
    minifyWhitespace: options.minify ?? false,
  });
  return transpiler.transformSync(source);
}

// Doer: Scan all imports from code without executing it
/**
 * Scans `source` for static and dynamic `import` statements without executing the code.
 */
export function scanImports(source: string, loader: TranspileLoader = "ts"): { path: string; kind: string }[] {
  const transpiler = new Transpiler({ loader });
  return transpiler.scanImports(source);
}

// Doer: Scan all exports and imports in a single AST pass
/**
 * Scans `source` in a single AST pass to extract both `exports` and `imports`.
 */
export function analyzeCode(source: string, loader: TranspileLoader = "ts"): CodeAnalysis {
  const transpiler = new Transpiler({ loader });
  const result = transpiler.scan(source);
  return {
    exports: result.exports,
    imports: result.imports,
  };
}

// Coordinator: Strip TypeScript types quickly for runtime execution
/**
 * Strips TypeScript type annotations from `source` and returns runnable JavaScript.
 */
export function stripTypes(source: string): string {
  return transpileTs(source, { loader: "ts", minify: false });
}

// Coordinator: Evaluate TypeScript code block in memory and return result
/**
 * Transpiles a TypeScript code snippet wrapped in an IIFE and evaluates it in memory.
 */
export function evalTs<T = any>(source: string): T {
  const js = transpileTs(`(() => {\n${source}\n})()`, { loader: "ts" });
  // eslint-disable-next-line no-eval
  return eval(js) as T;
}

/**
 * Namespace of TypeScript transpilation, AST import/export scanning, and evaluation utilities.
 */
export const transpileutils = {
  transpileTs,
  scanImports,
  analyzeCode,
  stripTypes,
  evalTs,
};
