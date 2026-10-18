/**
 * The built-in counter's language table: how to recognize a language (extension, file name, first line) and what its
 * comments and strings look like. Names follow tokei's, so the two engines' results line up. See fmDevCount.ts for
 * how a table entry is used.
 */

export interface QuoteDef {
  open: string;
  close: string;
  /** May continue on the next line. A string without this ends at the end of its line (a stray quote can't swallow the file). */
  multiline?: boolean;
  /** No backslash escapes (raw strings). */
  verbatim?: boolean;
  /** A documentation string (Python's docstring): counted as comments when "doc comments" are on. */
  doc?: boolean;
}

export interface LangDef {
  name: string;
  exts: string[];
  /** Whole file names (lower case), for files with no or a shared extension. */
  files?: string[];
  /** Program names after `#!` (or after `env`) that make an extension-less file this language. */
  shebangs?: string[];
  line?: string[];
  /** Line comments that document code (`///`). */
  docLine?: string[];
  block?: Array<[string, string]>;
  docBlock?: Array<[string, string]>;
  nested?: boolean;
  quotes?: QuoteDef[];
  /** `'x'` is a character, not a string (C family, Rust): skipped so `'"'` can't start a string. */
  charLit?: boolean;
  /** A `#` only starts a comment at the start of a word (shell: `$#` and `a#b` are not comments). */
  hashBoundary?: boolean;
  /** A block that only opens at the start of a line (Ruby's =begin, Perl's =pod). */
  lineStart?: Array<[string, string]>;
  /** Prose: every non-blank line counts as a comment (Markdown and plain text, like tokei). */
  literate?: boolean;
  /** Code of other languages lives inside: `<script>`/`<style>` in markup, fenced code blocks in Markdown (counted under their own language, like tokei). */
  embeds?: "html" | "markdown";
}

const dq: QuoteDef = { open: '"', close: '"' };
const sq: QuoteDef = { open: "'", close: "'" };
const tq = (q: string, extra: Partial<QuoteDef> = {}): QuoteDef => ({ open: q.repeat(3), close: q.repeat(3), multiline: true, ...extra });
const tick: QuoteDef = { open: "`", close: "`", multiline: true };
const slashes = { line: ["//"], block: [["/*", "*/"]] as Array<[string, string]> };
const cDocs = { docLine: ["///", "//!"], docBlock: [["/**", "*/"], ["/*!", "*/"]] as Array<[string, string]> };
const hash = { line: ["#"], quotes: [dq, sq] };
const xml = { block: [["<!--", "-->"]] as Array<[string, string]>, quotes: [dq, sq] };

const defs: LangDef[] = [
  // C family
  { name: "C", exts: ["c", "ec", "pgc"], ...slashes, ...cDocs, quotes: [dq], charLit: true },
  { name: "C Header", exts: ["h"], ...slashes, ...cDocs, quotes: [dq], charLit: true },
  { name: "C++", exts: ["cc", "cpp", "cxx", "c++", "pcc", "tpp"], ...slashes, ...cDocs, quotes: [dq, { open: 'R"(', close: ')"', multiline: true, verbatim: true }], charLit: true },
  { name: "C++ Header", exts: ["hh", "hpp", "hxx", "inl", "ipp"], ...slashes, ...cDocs, quotes: [dq], charLit: true },
  { name: "Objective-C", exts: ["m"], ...slashes, ...cDocs, quotes: [dq], charLit: true },
  { name: "Objective-C++", exts: ["mm"], ...slashes, ...cDocs, quotes: [dq], charLit: true },
  { name: "C#", exts: ["cs", "csx"], ...slashes, docLine: ["///"], quotes: [{ open: '@"', close: '"', multiline: true, verbatim: true }, tq('"', { verbatim: true }), dq], charLit: true },
  { name: "Java", exts: ["java"], ...slashes, docBlock: [["/**", "*/"]], quotes: [tq('"'), dq], charLit: true },
  { name: "Kotlin", exts: ["kt", "kts"], ...slashes, nested: true, docBlock: [["/**", "*/"]], quotes: [tq('"'), dq], charLit: true },
  { name: "Scala", exts: ["sc", "scala"], ...slashes, nested: true, docBlock: [["/**", "*/"]], quotes: [tq('"'), dq], charLit: true },
  { name: "Swift", exts: ["swift"], ...slashes, nested: true, docLine: ["///"], docBlock: [["/**", "*/"]], quotes: [tq('"'), dq] },
  { name: "Go", exts: ["go"], ...slashes, quotes: [tick, dq], charLit: true },
  { name: "Rust", exts: ["rs"], ...slashes, nested: true, ...cDocs, quotes: [{ open: 'r##"', close: '"##', multiline: true, verbatim: true }, { open: 'r#"', close: '"#', multiline: true, verbatim: true }, { open: 'r"', close: '"', multiline: true, verbatim: true }, { open: '"', close: '"', multiline: true }], charLit: true },
  { name: "Dart", exts: ["dart"], ...slashes, nested: true, docLine: ["///"], quotes: [tq('"'), tq("'"), dq, sq] },
  { name: "TypeScript", exts: ["ts", "mts", "cts"], ...slashes, quotes: [tick, dq, sq] },
  { name: "TSX", exts: ["tsx"], ...slashes, quotes: [tick, dq, sq] },
  { name: "JavaScript", exts: ["js", "mjs", "cjs"], shebangs: ["node", "bun", "deno"], ...slashes, quotes: [tick, dq, sq] },
  { name: "JSX", exts: ["jsx"], ...slashes, quotes: [tick, dq, sq] },
  { name: "D", exts: ["d"], ...slashes, block: [["/*", "*/"], ["/+", "+/"]], nested: true, quotes: [tick, dq] },
  { name: "Zig", exts: ["zig"], line: ["//"], quotes: [dq], charLit: true },
  { name: "Groovy", exts: ["groovy", "grt", "gtpl", "gvy"], ...slashes, quotes: [tq('"'), tq("'"), dq, sq] },
  { name: "PHP", exts: ["php"], shebangs: ["php"], line: ["//", "#"], block: [["/*", "*/"]], quotes: [dq, sq] },
  { name: "Solidity", exts: ["sol"], ...slashes, quotes: [dq, sq] },
  { name: "Protocol Buffers", exts: ["proto"], ...slashes, quotes: [dq, sq] },
  { name: "V", exts: ["v", "vv", "vsh"], shebangs: ["v"], line: ["//"], block: [["/*", "*/"]], nested: true, quotes: [{ open: "r'", close: "'", verbatim: true }, { open: 'r"', close: '"', verbatim: true }, dq, sq] },
  { name: "Odin", exts: ["odin"], ...slashes, nested: true, quotes: [tick, dq], charLit: true },
  { name: "Gleam", exts: ["gleam"], line: ["//"], quotes: [dq] },
  { name: "Cython", exts: ["pyx", "pxd", "pxi"], line: ["#"], quotes: [tq('"'), tq("'"), dq, sq] },
  { name: "Nim", exts: ["nim"], line: ["#"], block: [["#[", "]#"]], nested: true, quotes: [tq('"'), dq] },
  { name: "Crystal", exts: ["cr"], ...hash },
  { name: "Elixir", exts: ["ex", "exs"], line: ["#"], quotes: [tq('"', { doc: true }), tq("'"), dq, sq] },
  { name: "Ruby", exts: ["rb", "gemspec", "rake"], files: ["gemfile", "rakefile", "podfile", "vagrantfile", "guardfile"], shebangs: ["ruby"], ...hash, lineStart: [["=begin", "=end"]] },
  { name: "Python", exts: ["py", "pyw", "pyi"], shebangs: ["python", "python2", "python3"], line: ["#"], quotes: [tq('"', { doc: true }), tq("'", { doc: true }), dq, sq] },
  { name: "Perl", exts: ["pl", "pm"], shebangs: ["perl"], ...hash, lineStart: [["=pod", "=cut"], ["=head1", "=cut"]] },
  { name: "Raku", exts: ["raku", "rakumod", "rakutest"], shebangs: ["raku"], line: ["#"], block: [["#`(", ")"]], quotes: [dq, sq] },
  { name: "Lua", exts: ["lua", "luau"], shebangs: ["lua", "luajit"], line: ["--"], block: [["--[==[", "]==]"], ["--[=[", "]=]"], ["--[[", "]]"]], quotes: [{ open: "[==[", close: "]==]", multiline: true, verbatim: true }, { open: "[[", close: "]]", multiline: true, verbatim: true }, dq, sq] },
  { name: "Julia", exts: ["jl"], line: ["#"], block: [["#=", "=#"]], nested: true, quotes: [tq('"'), dq] },
  { name: "R", exts: ["r"], shebangs: ["rscript"], ...hash },
  // Shells and scripting
  { name: "Shell", exts: ["sh"], shebangs: ["sh", "dash", "ash"], ...hash, hashBoundary: true },
  { name: "BASH", exts: ["bash"], shebangs: ["bash"], ...hash, hashBoundary: true },
  { name: "Zsh", exts: ["zsh"], shebangs: ["zsh"], ...hash, hashBoundary: true },
  { name: "Korn shell", exts: ["ksh"], shebangs: ["ksh"], ...hash, hashBoundary: true },
  { name: "Fish", exts: ["fish"], shebangs: ["fish"], ...hash, hashBoundary: true },
  { name: "C Shell", exts: ["csh"], shebangs: ["csh", "tcsh"], ...hash, hashBoundary: true },
  { name: "Nushell", exts: ["nu"], shebangs: ["nu"], ...hash },
  { name: "PowerShell", exts: ["ps1", "psm1", "psd1"], shebangs: ["pwsh", "powershell"], line: ["#"], block: [["<#", "#>"]], quotes: [dq, sq] },
  { name: "Batch", exts: ["bat", "btm", "cmd"], line: ["::", "REM ", "rem ", "Rem "], quotes: [dq] },
  { name: "AWK", exts: ["awk"], shebangs: ["awk", "gawk", "mawk"], ...hash },
  { name: "Tcl", exts: ["tcl"], shebangs: ["tclsh", "wish"], line: ["#"], quotes: [dq] },
  { name: "Vim Script", exts: ["vim"], line: ['"'] },
  // Build, config and data
  { name: "Makefile", exts: ["makefile", "mak", "mk"], files: ["makefile", "gnumakefile"], ...hash },
  { name: "CMake", exts: ["cmake"], files: ["cmakelists.txt"], line: ["#"], block: [["#[[", "]]"]], quotes: [dq] },
  { name: "Dockerfile", exts: ["dockerfile", "dockerignore"], files: ["dockerfile", "containerfile"], line: ["#"], quotes: [dq, sq] },
  { name: "YAML", exts: ["yaml", "yml"], ...hash },
  { name: "TOML", exts: ["toml"], line: ["#"], quotes: [tq('"'), tq("'", { verbatim: true }), dq, { open: "'", close: "'", verbatim: true }] },
  { name: "INI", exts: ["ini"], line: [";", "#"], quotes: [dq] },
  { name: "HCL", exts: ["hcl", "tf", "tfvars"], line: ["#", "//"], block: [["/*", "*/"]], quotes: [dq] },
  { name: "Nix", exts: ["nix"], line: ["#"], block: [["/*", "*/"]], quotes: [{ open: "''", close: "''", multiline: true, verbatim: true }, dq] },
  { name: "Just", exts: ["just"], files: ["justfile"], ...hash },
  { name: "Bazel", exts: ["bzl", "bazel", "bzlmod"], files: ["build", "workspace"], line: ["#"], quotes: [tq('"'), dq, sq] },
  { name: "JSON", exts: ["json"], quotes: [dq] },
  { name: "GraphQL", exts: ["gql", "graphql"], line: ["#"], quotes: [tq('"'), dq] },
  { name: "SQL", exts: ["sql"], line: ["--"], block: [["/*", "*/"]], quotes: [sq, dq] },
  // Functional and others
  { name: "Haskell", exts: ["hs"], line: ["--"], block: [["{-", "-}"]], nested: true, quotes: [dq] },
  { name: "Elm", exts: ["elm"], line: ["--"], block: [["{-", "-}"]], nested: true, quotes: [tq('"'), dq] },
  { name: "PureScript", exts: ["purs"], line: ["--"], block: [["{-", "-}"]], nested: true, quotes: [dq] },
  { name: "Idris", exts: ["idr", "lidr"], line: ["--"], block: [["{-", "-}"]], nested: true, quotes: [dq] },
  { name: "Agda", exts: ["agda"], line: ["--"], block: [["{-", "-}"]], nested: true, quotes: [dq] },
  { name: "Lean", exts: ["lean", "hlean"], line: ["--"], block: [["/-", "-/"]], nested: true, quotes: [dq] },
  { name: "OCaml", exts: ["ml", "mli"], block: [["(*", "*)"]], nested: true, quotes: [dq] },
  { name: "F#", exts: ["fs", "fsi", "fsx", "fsscript"], line: ["//"], block: [["(*", "*)"]], quotes: [tq('"'), dq] },
  { name: "Erlang", exts: ["erl", "hrl"], line: ["%"], quotes: [dq] },
  { name: "Prolog", exts: ["p", "pro"], line: ["%"], block: [["/*", "*/"]], quotes: [dq, sq] },
  { name: "Clojure", exts: ["clj"], line: [";"], quotes: [dq] },
  { name: "ClojureScript", exts: ["cljs"], line: [";"], quotes: [dq] },
  { name: "ClojureC", exts: ["cljc"], line: [";"], quotes: [dq] },
  { name: "Scheme", exts: ["scm", "ss"], line: [";"], block: [["#|", "|#"]], nested: true, quotes: [dq] },
  { name: "Common Lisp", exts: ["lisp", "lsp", "asd"], line: [";"], block: [["#|", "|#"]], nested: true, quotes: [dq] },
  { name: "Racket", exts: ["rkt", "scrbl"], line: [";"], block: [["#|", "|#"]], nested: true, quotes: [dq] },
  { name: "Emacs Lisp", exts: ["el"], line: [";"], quotes: [dq] },
  { name: "FORTRAN Legacy", exts: ["f", "for", "ftn", "f77", "pfo"], line: ["!", "C ", "c ", "*"] },
  { name: "FORTRAN Modern", exts: ["f03", "f08", "f90", "f95", "fpp"], line: ["!"], quotes: [dq, sq] },
  { name: "Pascal", exts: ["pas"], line: ["//"], block: [["{", "}"], ["(*", "*)"]], quotes: [sq] },
  { name: "Ada", exts: ["ada", "adb", "ads", "pad"], line: ["--"], quotes: [dq] },
  { name: "VHDL", exts: ["vhd", "vhdl"], line: ["--"], block: [["/*", "*/"]], quotes: [dq] },
  { name: "Verilog", exts: ["vg", "vh"], ...slashes, quotes: [dq] },
  { name: "SystemVerilog", exts: ["sv", "svh"], ...slashes, quotes: [dq] },
  { name: "Assembly", exts: ["asm"], line: [";"], quotes: [dq, sq] },
  { name: "GNU Style Assembly", exts: ["s"], line: ["#", "//", "@"], block: [["/*", "*/"]], quotes: [dq] },
  { name: "Forth", exts: ["4th", "forth", "fr", "frt", "fth"], line: ["\\ "], block: [["(", ")"]] },
  { name: "Visual Basic", exts: ["vb"], line: ["'", "REM "] },
  { name: "TeX", exts: ["tex", "sty"], line: ["%"] },
  { name: "Cangjie", exts: ["cj"], ...slashes, nested: true, quotes: [tq('"'), dq] },
  // Prose and markup
  { name: "Markdown", exts: ["md", "markdown"], literate: true, embeds: "markdown" },
  { name: "Plain Text", exts: ["text", "txt"], literate: true },
  { name: "HTML", exts: ["html", "htm"], ...xml, embeds: "html" },
  { name: "XML", exts: ["xml", "xsd", "xsl", "xslt", "plist", "csproj", "vbproj", "fsproj", "props", "targets", "resx"], ...xml },
  { name: "SVG", exts: ["svg"], ...xml },
  { name: "Vue", exts: ["vue"], ...xml, embeds: "html" },
  { name: "Svelte", exts: ["svelte"], ...xml, embeds: "html" },
  { name: "Astro", exts: ["astro"], ...xml, embeds: "html" },
  { name: "CSS", exts: ["css"], block: [["/*", "*/"]], quotes: [dq, sq] },
  { name: "Sass", exts: ["sass", "scss"], ...slashes, quotes: [dq, sq] },
  { name: "LESS", exts: ["less"], ...slashes, quotes: [dq, sq] },
  { name: "Stylus", exts: ["styl"], ...slashes, quotes: [dq, sq] },
  { name: "Handlebars", exts: ["hbs", "handlebars"], block: [["{{!--", "--}}"], ["{{!", "}}"], ["<!--", "-->"]] },
  { name: "Mustache", exts: ["mustache"], block: [["{{!", "}}"]] },
  { name: "Jinja2", exts: ["j2", "jinja"], block: [["{#", "#}"], ["<!--", "-->"]] },
  { name: "Twig", exts: ["twig"], block: [["{#", "#}"], ["<!--", "-->"]] },
  { name: "Razor", exts: ["cshtml", "razor"], block: [["@*", "*@"], ["<!--", "-->"]] },
  { name: "Pug", exts: ["pug"], line: ["//-", "//"] },
];

export const LANGUAGES: readonly LangDef[] = defs;

const byExt = new Map<string, LangDef>();
const byFile = new Map<string, LangDef>();
const byShebang = new Map<string, LangDef>();
const byName = new Map<string, LangDef>();
for (const d of defs) {
  byName.set(d.name, d);
  for (const e of d.exts) if (!byExt.has(e)) byExt.set(e, d);
  for (const f of d.files ?? []) if (!byFile.has(f)) byFile.set(f, d);
  for (const s of d.shebangs ?? []) if (!byShebang.has(s)) byShebang.set(s, d);
}

export const languageByName = (name: string): LangDef | undefined => byName.get(name);

/** The language of a file by its name alone (a whole-name match wins over the extension), or null. */
export function languageForName(fileName: string): LangDef | null {
  const lower = fileName.toLowerCase();
  const whole = byFile.get(lower);
  if (whole) return whole;
  if (lower.startsWith("dockerfile.")) return byName.get("Dockerfile") ?? null;
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  return byExt.get(lower.slice(dot + 1)) ?? null;
}

/** The language named by a `#!` line (`#!/usr/bin/env python3`, `#!/bin/bash -e`), or null. */
export function languageForShebang(firstLine: string): LangDef | null {
  if (!firstLine.startsWith("#!")) return null;
  const parts = firstLine.slice(2).trim().split(/\s+/);
  let program = parts[0] ?? "";
  if (/(^|\/)env$/.test(program)) program = parts.find((p, i) => i > 0 && !p.startsWith("-") && !p.includes("=")) ?? "";
  const base = program.split("/").pop()!.toLowerCase();
  return byShebang.get(base) ?? byShebang.get(base.replace(/[\d.]+$/, "")) ?? null;
}
