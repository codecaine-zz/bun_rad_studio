// The outline of a file ("Go to symbol"): functions, classes, headings and so on, found line by line with simple
// patterns. Every pattern is anchored at the start of the line and lines over 400 characters are skipped, so the
// time taken is proportional to the size of the text.

const JS_RULES = [
  [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w$]+)/, "function"],
  [/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([\w$]+)/, "class"],
  [/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=]+)?=>/, "function"],
  [/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s+)?function\b/, "function"],
  [/^\s*(?:export\s+)?interface\s+([\w$]+)/, "interface"],
  [/^\s*(?:export\s+)?(?:declare\s+)?type\s+([\w$]+)\s*(?:<[^=]*>)?\s*=/, "type"],
  [/^\s*(?:export\s+)?(?:const\s+)?enum\s+([\w$]+)/, "enum"],
  [/^\s*(?:export\s+)?(?:declare\s+)?namespace\s+([\w$.]+)/, "namespace"],
  [/^\s{2,}(?:(?:public|private|protected|static|async|get|set|readonly|override)\s+)*([\w$]+)\s*(?:<[^>]*>)?\([^)]*\)\s*(?::\s*[^{]+)?\{/, "method", (m) => !["if", "for", "while", "switch", "catch", "function", "return", "with", "else"].includes(m[1])],
];

const C_RULES = [
  [/^\s*(?:typedef\s+)?(struct|class|enum|union|namespace)\s+(\w+)/, null, null, (m) => ({ name: m[2], kind: m[1] })],
  [/^[A-Za-z_][\w \t*&:<>,~]*?[ \t*&]([A-Za-z_~][\w:]*)\s*\([^;]*$/, "function", (m, line) => line.length < 200 && !/^\s*(?:if|else|while|for|switch|return|do|case|typedef|using|goto|delete|new)\b/.test(line)],
];

const RULES = {
  "javascript": JS_RULES,
  "typescript": JS_RULES,
  python: [
    [/^(\s*)(?:async\s+)?def\s+(\w+)/, null, null, (m) => ({ name: m[2], kind: m[1] ? "method" : "function", level: Math.floor(m[1].length / 4) })],
    [/^(\s*)class\s+(\w+)/, null, null, (m) => ({ name: m[2], kind: "class", level: Math.floor(m[1].length / 4) })],
  ],
  go: [
    [/^func\s+(?:\(\s*\w*\s*\*?\s*([\w.]+)(?:\[[^\]]*\])?\s*\)\s*)?(\w+)/, null, null, (m) => ({ name: m[1] ? `${m[1]}.${m[2]}` : m[2], kind: m[1] ? "method" : "function" })],
    [/^type\s+(\w+)\s+(struct|interface)/, null, null, (m) => ({ name: m[1], kind: m[2] })],
  ],
  rust: [
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/, "function"],
    [/^\s*(?:pub(?:\([^)]*\))?\s+)?(struct|enum|trait|union|mod)\s+(\w+)/, null, null, (m) => ({ name: m[2], kind: m[1] })],
    [/^\s*impl(?:<[^>]*>)?\s+([\w:<>, ]+?)(?:\s+for\s+([\w:<>, ]+?))?\s*(?:where\b.*)?\{?\s*$/, null, null, (m) => ({ name: m[2] ? `${m[1]} for ${m[2]}` : m[1], kind: "impl" })],
  ],
  c: C_RULES,
  cpp: C_RULES,
  csharp: [
    [/^\s*(?:(?:public|private|protected|internal|static|abstract|sealed|partial|readonly|unsafe)\s+)*(class|interface|enum|struct|record|namespace)\s+([\w.]+)/, null, null, (m) => ({ name: m[2], kind: m[1] })],
    [/^\s+(?:(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed|extern|unsafe)\s+)+[\w<>[\],.? ]+\s+(\w+)\s*\(/, "method"],
  ],
  java: [
    [/^\s*(?:(?:public|private|protected|abstract|final|static|sealed)\s+)*(class|interface|enum|record)\s+(\w+)/, null, null, (m) => ({ name: m[2], kind: m[1] })],
    [/^\s+(?:(?:public|private|protected|static|final|abstract|synchronized|native|default)\s+)+[\w<>[\],.? ]+\s+(\w+)\s*\(/, "method"],
  ],
  kotlin: [
    [/^\s*(?:(?:public|private|protected|internal|abstract|open|data|sealed|inline|suspend|override)\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)/, "function"],
    [/^\s*(?:(?:public|private|protected|internal|abstract|open|data|sealed|enum|annotation|companion)\s+)*(class|object|interface)\s+(\w+)/, null, null, (m) => ({ name: m[2], kind: m[1] })],
  ],
  swift: [
    [/^\s*(?:(?:public|private|fileprivate|internal|open|static|class|final|override|mutating)\s+)*func\s+(\w+)/, "function"],
    [/^\s*(?:(?:public|private|fileprivate|internal|open|final)\s+)*(class|struct|enum|protocol|extension|actor)\s+(\w+)/, null, null, (m) => ({ name: m[2], kind: m[1] })],
  ],
  php: [
    [/^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?(\w+)/, "function"],
    [/^\s*(?:abstract\s+|final\s+)?(class|interface|trait|enum)\s+(\w+)/, null, null, (m) => ({ name: m[2], kind: m[1] })],
  ],
  ruby: [
    [/^(\s*)def\s+(?:self\.)?([\w?!=]+)/, null, null, (m) => ({ name: m[2], kind: "method", level: Math.floor(m[1].length / 2) })],
    [/^(\s*)(class|module)\s+([\w:]+)/, null, null, (m) => ({ name: m[3], kind: m[2], level: Math.floor(m[1].length / 2) })],
  ],
  lua: [[/^\s*(?:local\s+)?function\s+([\w.:]+)/, "function"], [/^\s*(?:local\s+)?([\w.]+)\s*=\s*function\b/, "function"]],
  shell: [[/^\s*(?:function\s+)?([\w-]+)\s*\(\s*\)\s*\{?/, "function"], [/^\s*function\s+([\w-]+)/, "function"]],
  sql: [[/^\s*create\s+(?:or\s+replace\s+)?(?:unique\s+)?(?:temp(?:orary)?\s+)?(table|view|materialized\s+view|function|procedure|index|trigger|schema|database)\s+(?:if\s+not\s+exists\s+)?([\w."`[\]]+)/i, null, null, (m) => ({ name: m[2], kind: m[1].toLowerCase() })]],
  makefile: [[/^([A-Za-z_.][\w./%-]*)\s*:(?![=:])/, "target"]],
  dockerfile: [[/^\s*FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i, null, null, (m) => ({ name: m[2] ?? m[1], kind: "stage" })]],
  diff: [[/^diff --git a\/(\S+)/, "file"]],
  toml: [[/^\s*\[\[?([^\]\n]+)\]\]?/, "section"]],
  ini: [[/^\s*\[([^\]\n]+)\]/, "section"]],
  yaml: [[/^([\w.-]+)\s*:(?:\s|$)/, "key"]],
  "v": [
    [/^(?:pub\s+)?fn\s+(?:\(\s*(?:mut\s+)?\w+\s+[&*]?([\w.[\]]+)\s*\)\s*)?(\w+)/, null, null, (m) => ({ name: m[1] ? `${m[1]}.${m[2]}` : m[2], kind: m[2].startsWith("test_") ? "test" : m[1] ? "method" : "function" })],
    [/^(?:pub\s+)?(struct|interface|enum|union)\s+(\w+)/, null, null, (m) => ({ name: m[2], kind: m[1] })],
    [/^(?:pub\s+)?type\s+(\w+)/, "type"],
    [/^(?:pub\s+)?const\s+(\w+)\s*=/, "const"],
    [/^module\s+([\w.]+)/, "module"],
    [/^import\s+([\w.]+)/, "import"],
  ],
};

const MAX_SYMBOLS = 5000;

/**
 * The outline of `text` for a language id: [{ name, kind, line (1-based), level }].
 * Markdown and HTML headings, CSS rules and JSON keys have special handling; other languages use the pattern tables.
 */
export function extractSymbols(text, lang) {
  const out = [];
  const lines = text.split("\n");
  const rules = RULES[lang];
  let fence = "";
  let depth = 0;
  let jsonIndent = null;
  for (let i = 0; i < lines.length && out.length < MAX_SYMBOLS; i++) {
    const line = lines[i];
    if (line.length > (lang === "c" || lang === "cpp" ? 160 : 400)) continue;
    if (lang === "markdown") {
      const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (f) fence = fence ? (line.trimStart().startsWith(fence) ? "" : fence) : f[1].slice(0, 3);
      if (fence) continue;
      const m = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (m) out.push({ name: m[2], kind: "heading", line: i + 1, level: m[1].length - 1 });
    } else if (lang === "html") {
      for (const m of line.matchAll(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/gi)) out.push({ name: m[2].replace(/<[^>]*>/g, "").trim() || `h${m[1]}`, kind: "heading", line: i + 1, level: Number(m[1]) - 1 });
      const id = /<(?:section|main|nav|header|footer|article|form|table)\b[^>]*\bid="([^"]+)"/i.exec(line);
      if (id) out.push({ name: `#${id[1]}`, kind: "element", line: i + 1, level: 0 });
    } else if (lang === "css") {
      const m = depth === 0 ? /^\s*([^\s@}/{][^{]*?|@[^{]+?)\s*\{/.exec(line) : null;
      if (m) out.push({ name: m[1].trim(), kind: m[1].startsWith("@") ? "at-rule" : "rule", line: i + 1, level: 0 });
      for (const ch of line) depth = ch === "{" ? depth + 1 : ch === "}" ? Math.max(0, depth - 1) : depth;
    } else if (lang === "json") {
      const m = /^(\t| {1,8})"([^"\n]{1,80})"\s*:/.exec(line);
      if (m) {
        jsonIndent ??= m[1];
        if (m[1] === jsonIndent) out.push({ name: m[2], kind: "key", line: i + 1, level: 0 });
      }
    } else if (rules) {
      for (const [re, kind, guard, build] of rules) {
        const m = re.exec(line);
        if (!m || (guard && !guard(m, line))) continue;
        const info = build ? build(m) : { name: m[1], kind };
        out.push({ name: info.name, kind: info.kind, line: i + 1, level: info.level ?? 0 });
        break;
      }
    }
  }
  return out;
}

/** The symbol the cursor is inside: the last one that starts on or before `line` (1-based), or null. */
export function symbolAt(symbols, line) {
  let found = null;
  for (const s of symbols) if (s.line <= line) found = s;
  return found;
}
