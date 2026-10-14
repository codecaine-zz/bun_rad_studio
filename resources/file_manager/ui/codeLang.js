// Languages the Code tab knows: how to recognise them, their comment styles, and how to run a file.
// Pure data and functions (no DOM), so they can be tested on their own.

/**
 * id, name, file extensions, whole file names, shebang words, line comment, block comment [open, close],
 * and how "Run" starts a file (`run`: a command prefix, or null when the terminal can't run it).
 */
export const LANGS = [
  { id: "plain", name: "Plain text", exts: ["txt", "text", "log", "nfo", "csv", "tsv"], files: [], she: [], line: "", block: null, run: null },
  { id: "javascript", name: "JavaScript", exts: ["js", "mjs", "cjs", "jsx"], files: [], she: ["node", "bun", "deno"], line: "//", block: ["/*", "*/"], run: "node" },
  { id: "typescript", name: "TypeScript", exts: ["ts", "mts", "cts", "tsx"], files: [], she: ["ts-node", "tsx"], line: "//", block: ["/*", "*/"], run: "bun" },
  { id: "json", name: "JSON", exts: ["json", "jsonc", "json5", "webmanifest", "geojson", "ipynb"], files: [".babelrc", ".eslintrc", "tsconfig.json"], she: [], line: "", block: null, run: null },
  { id: "html", name: "HTML", exts: ["html", "htm", "xhtml", "vue", "svelte", "ejs", "hbs"], files: [], she: [], line: "", block: ["<!--", "-->"], run: null },
  { id: "css", name: "CSS", exts: ["css", "scss", "sass", "less"], files: [], she: [], line: "", block: ["/*", "*/"], run: null },
  { id: "markdown", name: "Markdown", exts: ["md", "markdown", "mdx", "mkd"], files: ["readme"], she: [], line: "", block: ["<!--", "-->"], run: null },
  { id: "python", name: "Python", exts: ["py", "pyw", "pyi"], files: [], she: ["python", "python2", "python3"], line: "#", block: null, run: "python3" },
  { id: "go", name: "Go", exts: ["go"], files: [], she: [], line: "//", block: ["/*", "*/"], run: "go run" },
  { id: "rust", name: "Rust", exts: ["rs"], files: [], she: [], line: "//", block: ["/*", "*/"], run: null },
  { id: "c", name: "C", exts: ["c", "h"], files: [], she: [], line: "//", block: ["/*", "*/"], run: null },
  { id: "cpp", name: "C++", exts: ["cpp", "cc", "cxx", "hpp", "hh", "hxx", "ino"], files: [], she: [], line: "//", block: ["/*", "*/"], run: null },
  { id: "csharp", name: "C#", exts: ["cs", "csx"], files: [], she: [], line: "//", block: ["/*", "*/"], run: null },
  { id: "java", name: "Java", exts: ["java"], files: [], she: [], line: "//", block: ["/*", "*/"], run: "java" },
  { id: "kotlin", name: "Kotlin", exts: ["kt", "kts"], files: [], she: [], line: "//", block: ["/*", "*/"], run: null },
  { id: "swift", name: "Swift", exts: ["swift"], files: [], she: ["swift"], line: "//", block: ["/*", "*/"], run: "swift" },
  { id: "php", name: "PHP", exts: ["php", "phtml"], files: [], she: ["php"], line: "//", block: ["/*", "*/"], run: "php" },
  { id: "ruby", name: "Ruby", exts: ["rb", "rake", "gemspec", "ru"], files: ["gemfile", "rakefile"], she: ["ruby"], line: "#", block: null, run: "ruby" },
  { id: "lua", name: "Lua", exts: ["lua"], files: [], she: ["lua", "luajit"], line: "--", block: ["--[[", "]]"], run: "lua" },
  { id: "shell", name: "Shell", exts: ["sh", "bash", "zsh", "fish", "ksh", "command"], files: [".bashrc", ".zshrc", ".profile", ".bash_profile", ".zprofile", ".bash_aliases"], she: ["sh", "bash", "zsh", "dash", "ksh", "fish"], line: "#", block: null, run: "bash" },
  { id: "yaml", name: "YAML", exts: ["yml", "yaml"], files: [], she: [], line: "#", block: null, run: null },
  { id: "toml", name: "TOML", exts: ["toml"], files: ["cargo.lock", "poetry.lock"], she: [], line: "#", block: null, run: null },
  { id: "ini", name: "INI / config", exts: ["ini", "cfg", "conf", "properties", "editorconfig", "env", "desktop", "gitconfig", "gitattributes"], files: [".env", ".editorconfig", ".gitconfig", ".npmrc"], she: [], line: ";", block: null, run: null },
  { id: "sql", name: "SQL", exts: ["sql", "psql", "mysql"], files: [], she: [], line: "--", block: ["/*", "*/"], run: null },
  { id: "xml", name: "XML", exts: ["xml", "svg", "xsd", "xsl", "xslt", "plist", "csproj", "props", "targets", "rss", "atom", "wsdl", "xaml", "resx"], files: [], she: [], line: "", block: ["<!--", "-->"], run: null },
  { id: "diff", name: "Diff / patch", exts: ["diff", "patch"], files: [], she: [], line: "", block: null, run: null },
  { id: "dockerfile", name: "Dockerfile", exts: ["dockerfile"], files: ["dockerfile", "containerfile"], she: [], line: "#", block: null, run: null },
  { id: "makefile", name: "Makefile", exts: ["mk", "mak"], files: ["makefile", "gnumakefile"], she: [], line: "#", block: null, run: null },
  { id: "v", name: "V", exts: ["v", "vsh", "vv"], files: ["v.mod"], she: ["v"], line: "//", block: ["/*", "*/"], run: "v run" },
];

const BY_ID = new Map(LANGS.map((l) => [l.id, l]));
const BY_EXT = new Map();
const BY_FILE = new Map();
for (const lang of LANGS) {
  for (const e of lang.exts) BY_EXT.set(e, lang.id);
  for (const f of lang.files) BY_FILE.set(f, lang.id);
}

export const languageInfo = (id) => BY_ID.get(id) ?? BY_ID.get("plain");

/** The language for a file name (and, when the name doesn't tell, the first line: `#!/usr/bin/env python3`). */
export function detectLanguage(name = "", firstLine = "") {
  const base = String(name).split(/[\\/]/).pop().toLowerCase();
  if (BY_FILE.has(base)) return BY_FILE.get(base);
  if (base.startsWith("dockerfile.")) return "dockerfile";
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1) : "";
  if (ext && BY_EXT.has(ext)) return BY_EXT.get(ext);
  const she = /^#!\s*(?:\/usr\/bin\/env\s+(?:-S\s+)?|\/[\w/.-]*\/)?([\w.-]+)/.exec(String(firstLine).slice(0, 200));
  if (she) {
    const word = she[1].toLowerCase();
    const stripped = word.replace(/[\d.]+$/, "");
    for (const lang of LANGS) if (lang.she.includes(word) || lang.she.includes(stripped)) return lang.id;
  }
  if (/^<\?php/i.test(firstLine)) return "php";
  return "plain";
}

/** The comment markers of a language: { line, block } where either may be empty. */
export function commentSyntax(langId) {
  const lang = languageInfo(langId);
  return { line: lang.line, block: lang.block };
}

/** Does this file name look like something worth editing as text? (Known languages and plain text, or no extension at all.) */
export function looksLikeText(name = "") {
  const base = String(name).split(/[\\/]/).pop().toLowerCase();
  if (BY_FILE.has(base) || base.startsWith("dockerfile.")) return true;
  const dot = base.lastIndexOf(".");
  return dot <= 0 || BY_EXT.has(base.slice(dot + 1));
}
