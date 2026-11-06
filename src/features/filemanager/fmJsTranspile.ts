/**
 * TypeScript and JSX to JavaScript with Bun's own `Bun.Transpiler`, and a scan of what a JavaScript or TypeScript file
 * imports and exports. Used by the Convert window ("Make JavaScript from TypeScript") and the "More info" window.
 *
 * The transpiler only removes types and rewrites JSX: it does not type-check and does not bundle.
 */
/** File extensions recognized as TypeScript source files (`ts`, `tsx`, `mts`, `cts`). */
export const TS_EXTENSIONS = new Set(["ts", "tsx", "mts", "cts"]);
/** File extensions recognized as JavaScript source files (`js`, `jsx`, `mjs`, `cjs`). */
export const JS_EXTENSIONS = new Set(["js", "jsx", "mjs", "cjs"]);
/** Combined set of all supported TypeScript and JavaScript source file extensions. */
export const CODE_EXTENSIONS = new Set([...TS_EXTENSIONS, ...JS_EXTENSIONS]);

/** Runtime environment target passed to `Bun.Transpiler`. */
export type JsTarget = "browser" | "bun" | "node";
/** JSX factory preset (`react` or `preact`) used when transpiling JSX/TSX files. */
export type JsxStyle = "react" | "preact";

/** Configuration options for transpiling TypeScript/JSX source code into JavaScript. */
export interface TranspileOptions {
  target?: JsTarget;
  minifyWhitespace?: boolean;
  minifyIdentifiers?: boolean;
  minifySyntax?: boolean;
  jsx?: JsxStyle;
}

/** The transpiler's name for the kind of source a file extension holds. */
export function loaderFor(ext: string): "ts" | "tsx" | "jsx" {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "tsx") return "tsx";
  if (TS_EXTENSIONS.has(e)) return "ts";
  return "jsx";
}

/** The extension of the JavaScript file made from a source file: .mts gives .mjs, .cts gives .cjs, the rest .js. */
export function jsExtensionFor(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  return e === "mts" || e === "mjs"
    ? "mjs"
    : e === "cts" || e === "cjs"
      ? "cjs"
      : "js";
}

/** A failure of the transpiler in plain words, with line and column numbers (at most three problems). */
export class TranspileError extends Error {
  /** Creates a `TranspileError` with a human-readable summary message and structured line/column diagnostics. */
  constructor(
    message: string,
    readonly problems: Array<{ line: number; column: number; text: string }>,
  ) {
    super(message);
    this.name = "TranspileError";
  }
}

function describeProblems(err: any): TranspileError {
  const list: any[] =
    Array.isArray(err?.errors) && err.errors.length ? err.errors : [err];
  const problems = list.slice(0, 3).map((e) => ({
    line: Number(e?.position?.line ?? 0),
    column: Number(e?.position?.column ?? 0),
    text: String(e?.message ?? "Something here isn't valid")
      .replace(/\s+/g, " ")
      .slice(0, 200),
  }));
  const said = problems
    .map((p) =>
      p.line ? `line ${p.line}, column ${p.column}: ${p.text}` : p.text,
    )
    .join("; ");
  const more = list.length > 3 ? ` (and ${list.length - 3} more)` : "";
  return new TranspileError(
    `The code has a mistake, so it can't be converted. ${said.charAt(0).toUpperCase()}${said.slice(1)}${more}.`,
    problems,
  );
}

/** Turns TypeScript, TSX or JSX source into JavaScript. Throws a TranspileError for code with syntax errors. */
export function transpileSource(
  source: string,
  ext: string,
  options: TranspileOptions = {},
): string {
  const loader = loaderFor(ext);
  const jsx = options.jsx ?? "react";
  const minify = {
    whitespace: options.minifyWhitespace === true,
    identifiers: options.minifyIdentifiers === true,
    syntax: options.minifySyntax === true,
  };
  // `minify` works at run time (see the options of Bun.build) but is missing from Bun's typings for the transpiler.
  const transpiler = new Bun.Transpiler({
    loader,
    target: options.target ?? "browser",
    minify,
    // Without this the JSX becomes calls to a helper that is never imported; plain factory calls are self-explanatory.
    tsconfig: JSON.stringify({
      compilerOptions:
        jsx === "preact"
          ? { jsx: "react", jsxFactory: "h", jsxFragmentFactory: "Fragment" }
          : { jsx: "react" },
    }),
  } as Bun.TranspilerOptions);
  try {
    return transpiler.transformSync(source);
  } catch (err) {
    throw describeProblems(err);
  }
}

/** Static import and export declarations discovered by scanning a JavaScript or TypeScript module. */
export interface ModuleScan {
  imports: Array<{ kind: string; path: string }>;
  exports: string[];
}

/** Maximum number of import or export entries returned by `scanModule`. */
export const MAX_SCAN_ITEMS = 200;

/** What a JavaScript or TypeScript file imports (import, dynamic import, require) and exports. Throws a TranspileError for a syntax error. */
export function scanModule(source: string, ext: string): ModuleScan {
  const transpiler = new Bun.Transpiler({ loader: loaderFor(ext) });
  try {
    const found = transpiler.scan(source);
    const all = transpiler.scanImports(source);
    const seen = new Set<string>();
    const imports: ModuleScan["imports"] = [];
    for (const i of [...all, ...found.imports]) {
      const key = `${i.kind}\0${i.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        imports.push({ kind: i.kind, path: i.path });
      }
    }
    return {
      imports: imports.slice(0, MAX_SCAN_ITEMS),
      exports: found.exports.slice(0, MAX_SCAN_ITEMS),
    };
  } catch (err) {
    throw describeProblems(err);
  }
}
