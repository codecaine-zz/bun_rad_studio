/**
 * "Prettify": tidy a piece of source code the way the language's usual formatter would. Used by the File Manager's Code tab
 * (op `code/prettify`) and by NovaCode Studio Pro (`/api/prettify`).
 *
 * Built in, nothing to install: JavaScript, TypeScript, JSX/TSX, JSON, CSS, SCSS, Less, HTML, Vue, Markdown, YAML and GraphQL
 * (Prettier) and SQL (sql-formatter). Languages without a built-in formatter use the usual command-line formatter when it is
 * installed (Python: ruff or black; Go: gofmt; Rust: rustfmt; C, C++, Java, C#, Objective-C: clang-format; shell: shfmt;
 * Zig: zig fmt; Lua: stylua). They are run with an argument list, never a shell, with a time limit, and only ever receive the
 * text. When there is no formatter, C-style code gets its indentation tidied and everything else gets a whitespace tidy
 * (trailing spaces, blank-line runs, final newline), and the answer says so: it never pretends to have done more.
 */
import { spawn } from "child_process";
import * as localFormat from "../../resources/file_manager/ui/codeFormat.js";

const local: any = localFormat;

export const MAX_PRETTIFY_CHARS = 900_000;
export const TOOL_TIMEOUT_MS = 10_000;

export interface PrettifyInput {
  /** The file name or path (its extension picks the language) and/or the editor's language id. */
  path?: string;
  lang?: string;
  text: string;
  useTabs?: boolean;
  tabWidth?: number;
}

export interface PrettifyResult {
  ok: boolean;
  text?: string;
  /** Which formatter did the work: "Prettier", "sql-formatter", "ruff", "indentation tidy", "whitespace tidy" ... */
  engine?: string;
  /** True when only whitespace could be tidied, because no formatter for this language is available. */
  basic?: boolean;
  /** A short sentence for the person: what was used, or what is missing. */
  message?: string;
  error?: { message: string; line?: number; col?: number };
}

interface Tool { id: string; name: string; command: string; args: (o: { tab: number; tabs: boolean; ext: string }) => string[]; install: string }

const PRETTIER_PARSER: Record<string, { parser: string; plugins: string[] }> = {
  js: { parser: "babel", plugins: ["babel", "estree"] }, mjs: { parser: "babel", plugins: ["babel", "estree"] }, cjs: { parser: "babel", plugins: ["babel", "estree"] },
  jsx: { parser: "babel", plugins: ["babel", "estree"] },
  ts: { parser: "typescript", plugins: ["typescript", "estree"] }, mts: { parser: "typescript", plugins: ["typescript", "estree"] }, cts: { parser: "typescript", plugins: ["typescript", "estree"] },
  tsx: { parser: "typescript", plugins: ["typescript", "estree"] },
  json: { parser: "json", plugins: ["babel", "estree"] }, jsonc: { parser: "jsonc", plugins: ["babel", "estree"] }, json5: { parser: "json5", plugins: ["babel", "estree"] },
  webmanifest: { parser: "json", plugins: ["babel", "estree"] }, geojson: { parser: "json", plugins: ["babel", "estree"] },
  css: { parser: "css", plugins: ["postcss"] }, scss: { parser: "scss", plugins: ["postcss"] }, less: { parser: "less", plugins: ["postcss"] },
  html: { parser: "html", plugins: ["html", "postcss", "babel", "estree"] }, htm: { parser: "html", plugins: ["html", "postcss", "babel", "estree"] },
  xhtml: { parser: "html", plugins: ["html", "postcss", "babel", "estree"] },
  vue: { parser: "vue", plugins: ["html", "postcss", "babel", "estree", "typescript"] },
  md: { parser: "markdown", plugins: ["markdown"] }, markdown: { parser: "markdown", plugins: ["markdown"] },
  yml: { parser: "yaml", plugins: ["yaml"] }, yaml: { parser: "yaml", plugins: ["yaml"] },
  graphql: { parser: "graphql", plugins: ["graphql"] }, gql: { parser: "graphql", plugins: ["graphql"] },
};

/** The editor's language ids that name one language by themselves (when there is no file name to look at). */
const LANG_EXT: Record<string, string> = {
  javascript: "js", typescript: "ts", json: "json", css: "css", html: "html", markdown: "md", yaml: "yaml", sql: "sql",
  python: "py", go: "go", rust: "rs", c: "c", cpp: "cpp", java: "java", csharp: "cs", shell: "sh", zig: "zig", lua: "lua", xml: "xml",
  php: "php", kotlin: "kt", swift: "swift", ruby: "rb", v: "v",
};

const TOOLS: Record<string, Tool[]> = {
  py: [
    { id: "ruff", name: "ruff", command: "ruff", args: () => ["format", "--stdin-filename", "file.py", "-"], install: "ruff (pip install ruff)" },
    { id: "black", name: "black", command: "black", args: () => ["-q", "-"], install: "black (pip install black)" },
  ],
  go: [{ id: "gofmt", name: "gofmt", command: "gofmt", args: () => [], install: "Go (go.dev)" }],
  rs: [{ id: "rustfmt", name: "rustfmt", command: "rustfmt", args: () => ["--edition", "2021"], install: "rustfmt (rustup component add rustfmt)" }],
  sh: [{ id: "shfmt", name: "shfmt", command: "shfmt", args: ({ tab, tabs }) => ["-i", tabs ? "0" : String(tab)], install: "shfmt (brew install shfmt)" }],
  zig: [{ id: "zig", name: "zig fmt", command: "zig", args: () => ["fmt", "--stdin"], install: "Zig (ziglang.org)" }],
  lua: [{ id: "stylua", name: "stylua", command: "stylua", args: () => ["-"], install: "stylua (cargo install stylua)" }],
};
for (const ext of ["c", "h", "cpp", "cc", "cxx", "hpp", "java", "cs", "m", "mm"]) {
  TOOLS[ext] = [{ id: "clang-format", name: "clang-format", command: "clang-format", args: ({ tab, tabs, ext: e }) => [`--assume-filename=file.${e}`, `--style={BasedOnStyle: LLVM, IndentWidth: ${tab}, UseTab: ${tabs ? "Always" : "Never"}}`], install: "clang-format (brew install clang-format)" }];
}
TOOLS.sh = [...TOOLS.sh!];
for (const alias of ["bash", "zsh"]) TOOLS[alias] = TOOLS.sh!;

const C_FAMILY = new Set(["js", "mjs", "cjs", "ts", "java", "c", "h", "cpp", "cc", "cxx", "hpp", "cs", "go", "rs", "php", "kt", "swift"]);
const LOCAL_LANG: Record<string, string> = { java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp", cs: "csharp", go: "go", rs: "rust", php: "php", kt: "kotlin", swift: "swift" };

export function extensionOf(path = "", lang = ""): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot > 0 || (dot === 0 && name.length > 1)) return name.slice(dot + 1).toLowerCase();
  return LANG_EXT[lang.toLowerCase()] ?? "";
}

/** Is there anything better than a whitespace tidy for this file, with the tools that are installed or built in? */
export function isBuiltIn(ext: string): boolean {
  return ext in PRETTIER_PARSER || ext === "sql";
}

function runTool(command: string, args: string[], input: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string; missing: boolean; timedOut: boolean }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (code: number | null, missing = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, missing, timedOut });
    };
    let child;
    try {
      child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: { ...process.env, NO_COLOR: "1" } });
    } catch {
      return finish(null, true);
    }
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); finish(null); }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => { if (stdout.length < 4 * MAX_PRETTIFY_CHARS) stdout += d.toString("utf8"); });
    child.stderr.on("data", (d: Buffer) => { if (stderr.length < 16_384) stderr += d.toString("utf8"); });
    child.once("error", (err: NodeJS.ErrnoException) => finish(null, err.code === "ENOENT"));
    child.once("close", (code) => finish(code));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function withPrettier(text: string, ext: string, o: { tab: number; tabs: boolean }): Promise<PrettifyResult> {
  const spec = PRETTIER_PARSER[ext]!;
  const prettier: any = await import("prettier/standalone");
  const plugins = await Promise.all(spec.plugins.map((p) => loadPlugin(p)));
  try {
    const out = await prettier.format(text, { parser: spec.parser, plugins, tabWidth: o.tab, useTabs: o.tabs, endOfLine: "auto" });
    return { ok: true, text: out, engine: "Prettier" };
  } catch (e: any) {
    const loc = e?.loc?.start ?? e?.loc;
    const first = String(e?.message ?? e).split("\n")[0]!.replace(/\s*\(\d+:\d+\)\s*$/, "");
    return { ok: false, error: { message: first || "This code has a mistake the formatter can't get past.", line: loc?.line, col: loc?.column } };
  }
}

async function loadPlugin(name: string): Promise<any> {
  switch (name) {
    case "babel": return (await import("prettier/plugins/babel")).default ?? (await import("prettier/plugins/babel"));
    case "estree": return (await import("prettier/plugins/estree")).default ?? (await import("prettier/plugins/estree"));
    case "typescript": return (await import("prettier/plugins/typescript")).default ?? (await import("prettier/plugins/typescript"));
    case "postcss": return (await import("prettier/plugins/postcss")).default ?? (await import("prettier/plugins/postcss"));
    case "html": return (await import("prettier/plugins/html")).default ?? (await import("prettier/plugins/html"));
    case "markdown": return (await import("prettier/plugins/markdown")).default ?? (await import("prettier/plugins/markdown"));
    case "yaml": return (await import("prettier/plugins/yaml")).default ?? (await import("prettier/plugins/yaml"));
    case "graphql": return (await import("prettier/plugins/graphql")).default ?? (await import("prettier/plugins/graphql"));
    default: throw new Error(`unknown plugin ${name}`);
  }
}

async function withSql(text: string, o: { tab: number; tabs: boolean }): Promise<PrettifyResult> {
  const { format } = await import("sql-formatter");
  try {
    return { ok: true, text: format(text, { language: "sql", tabWidth: o.tab, useTabs: o.tabs, keywordCase: "upper" }), engine: "sql-formatter" };
  } catch (e: any) {
    return { ok: false, error: { message: String(e?.message ?? e).split("\n")[0]!, line: e?.line, col: e?.col } };
  }
}

/** Whitespace only: no trailing spaces, at most two blank lines in a row, one newline at the end. Line endings are kept. */
export function tidyWhitespace(text: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[ \t]+$/, ""));
  const out: string[] = [];
  let blank = 0;
  for (const l of lines) {
    blank = l === "" ? blank + 1 : 0;
    if (blank <= 2) out.push(l);
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.length ? out.join(eol) + eol : "";
}

/** `tools` is only for tests (another set of programs to try). */
export async function prettify(input: PrettifyInput, tools: Record<string, Tool[]> = TOOLS): Promise<PrettifyResult> {
  const text = input.text;
  if (typeof text !== "string") return { ok: false, error: { message: "There is no text to format." } };
  if (text.length > MAX_PRETTIFY_CHARS) return { ok: false, error: { message: "This file is too big to format here." } };
  const tab = Math.min(16, Math.max(1, Math.round(input.tabWidth ?? 2)));
  const tabs = input.useTabs === true;
  const ext = extensionOf(input.path, input.lang);
  const o = { tab, tabs };

  // Plain JSON is always spread over lines (Prettier would keep short objects on one line); comments and trailing commas need Prettier.
  if (ext === "json" || ext === "webmanifest" || ext === "geojson") {
    const r = local.formatJson(text, tabs ? "\t" : " ".repeat(tab));
    if (!r.error) return { ok: true, text: r.text, engine: "JSON formatter" };
    const second = await withPrettier(text, "jsonc", o);
    return second.ok ? second : { ok: false, error: r.error };
  }
  if (ext in PRETTIER_PARSER) return await withPrettier(text, ext, o);
  if (ext === "sql") return await withSql(text, o);
  if (ext === "xml" || ext === "svg" || ext === "xsl" || ext === "plist") {
    const r = local.formatCode("xml", text, tabs ? "\t" : " ".repeat(tab));
    return r.error ? { ok: false, error: r.error } : { ok: true, text: r.text, engine: "XML formatter" };
  }

  let missing: string | null = null;
  for (const t of tools[ext] ?? []) {
    const r = await runTool(t.command, t.args({ tab, tabs, ext }), text, TOOL_TIMEOUT_MS);
    if (r.missing) { missing ??= t.install; continue; }
    if (r.timedOut) return { ok: false, error: { message: `${t.name} took longer than ${Math.round(TOOL_TIMEOUT_MS / 1000)} seconds and was stopped.` } };
    if (r.code !== 0) {
      const why = r.stderr.replaceAll(/\u001b\[[0-9;]*m/g, "").trim().split("\n").slice(0, 3).join(" ");
      return { ok: false, error: { message: `${t.name}: ${why || "it couldn't format this text."}` } };
    }
    return { ok: true, text: r.stdout, engine: t.name };
  }

  if (C_FAMILY.has(ext) && LOCAL_LANG[ext]) {
    const r = local.formatCode(LOCAL_LANG[ext], text, tabs ? "\t" : " ".repeat(tab));
    if (r.text !== undefined) {
      return { ok: true, text: r.text, engine: "indentation tidy", basic: true, message: missing ? `Only the indentation was tidied. Install ${missing} for full formatting.` : "Only the indentation was tidied." };
    }
  }
  return {
    ok: true, text: tidyWhitespace(text), engine: "whitespace tidy", basic: true,
    message: missing ? `Only whitespace was tidied. Install ${missing} for full formatting.` : "Only whitespace was tidied: there is no formatter for this kind of file.",
  };
}

/**
 * The opposite: the same code on as few characters as possible. JSON and CSS (comments removed), and plain JavaScript
 * (comments and spaces removed, names kept). TypeScript and JSX are not minified: that would mean compiling them.
 */
export async function minify(input: Pick<PrettifyInput, "path" | "lang" | "text">): Promise<PrettifyResult> {
  const text = input.text;
  if (typeof text !== "string") return { ok: false, error: { message: "There is no text to minify." } };
  if (text.length > MAX_PRETTIFY_CHARS) return { ok: false, error: { message: "This file is too big to minify here." } };
  const ext = extensionOf(input.path, input.lang);
  if (ext === "json" || ext === "jsonc" || ext === "json5" || ext === "webmanifest" || ext === "geojson") {
    const r = local.minifyJson(text);
    return r.error ? { ok: false, error: r.error } : { ok: true, text: r.text, engine: "JSON minifier" };
  }
  if (ext === "css") {
    const r = local.minifyCss(text);
    return r.error ? { ok: false, error: r.error } : { ok: true, text: r.text, engine: "CSS minifier" };
  }
  if (ext === "js" || ext === "mjs" || ext === "cjs") {
    try {
      const t = new Bun.Transpiler({ loader: "js", minifyWhitespace: true });
      return { ok: true, text: t.transformSync(text), engine: "Bun minifier" };
    } catch (e: any) {
      const pos = e?.position ?? e?.errors?.[0]?.position;
      const message = String(e?.errors?.[0]?.message ?? e?.message ?? e).split("\n")[0]!;
      return { ok: false, error: { message, line: pos?.line, col: pos?.column } };
    }
  }
  return { ok: false, error: { message: "Minify works for JSON, CSS and JavaScript files. TypeScript and JSX would have to be compiled first, so they are left alone." } };
}
