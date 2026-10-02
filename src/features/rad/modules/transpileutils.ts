// Feature: RAD - transpileutils
// In-memory TypeScript/TSX transpilation, import scanning, and AST inspection powered by native Bun.Transpiler
import { Transpiler } from "bun";

export type TranspileLoader = "ts" | "tsx" | "js" | "jsx" | "json";

export interface TranspileOptions {
  loader?: TranspileLoader;
  minify?: boolean;
  inlineSourceMap?: boolean;
}

export interface CodeAnalysis {
  exports: string[];
  imports: {
    path: string;
    kind: string;
  }[];
}

// Doer: Transpile TypeScript or TSX to vanilla JavaScript in memory
export function transpileTs(source: string, options: TranspileOptions = {}): string {
  const transpiler = new Transpiler({
    loader: options.loader ?? "ts",
    minifyWhitespace: options.minify ?? false,
    inlineStyleKeyframes: false,
  });
  return transpiler.transformSync(source);
}

// Doer: Scan all imports from code without executing it
export function scanImports(source: string, loader: TranspileLoader = "ts"): { path: string; kind: string }[] {
  const transpiler = new Transpiler({ loader });
  return transpiler.scanImports(source);
}

// Doer: Scan all exports and imports in a single AST pass
export function analyzeCode(source: string, loader: TranspileLoader = "ts"): CodeAnalysis {
  const transpiler = new Transpiler({ loader });
  const result = transpiler.scan(source);
  return {
    exports: result.exports,
    imports: result.imports,
  };
}

// Coordinator: Strip TypeScript types quickly for runtime execution
export function stripTypes(source: string): string {
  return transpileTs(source, { loader: "ts", minify: false });
}

// Coordinator: Evaluate TypeScript code block in memory and return result
export function evalTs<T = any>(source: string): T {
  const js = transpileTs(`(() => {\n${source}\n})()`, { loader: "ts" });
  // eslint-disable-next-line no-eval
  return eval(js) as T;
}

export const transpileutils = {
  transpileTs,
  scanImports,
  analyzeCode,
  stripTypes,
  evalTs,
};
