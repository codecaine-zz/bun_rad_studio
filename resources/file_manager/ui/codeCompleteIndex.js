// Builds the "index" of one open file for code completion: the functions, classes, variables, imports and members it
// declares, and which words it uses. One linear pass over the lines, with a cap on size: files over 1 MB are only
// scanned for words near the caret (see wordsAround), and at most 20,000 symbols are kept. DOM-free.
import { familyOf } from "./codeCompleteData.js";

export const MAX_INDEX_CHARS = 1_000_000;
export const MAX_SYMBOLS = 20_000;
const MAX_LINE = 400;
const MAX_WORDS = 20_000;

const ID = "[A-Za-z_$][\\w$]*";
const KEYWORDS_NOT_NAMES = new Set("if for while switch catch return else do try finally new delete typeof await yield throw case default function class import export from with match defer unsafe spawn go select lock rlock assert in is as or and not elif except pass del print using fixed foreach sizeof".split(" "));

/** Rule = [regex, kind, nameGroup, paramsGroup, typeGroup]. Lines are trimmed before matching. */
const R = (re, kind, name = 1, params = 0, type = 0) => [re, kind, name, params, type];
const JS_FN = R(new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s*(${ID})\\s*(?:<[^>(]*>)?\\s*\\(([^)]*)`), "function", 1, 2);
const JS_ARROW = R(new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+(${ID})\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\(([^)]*)\\)|(${ID}))\\s*(?::[^=]+)?=>`), "function", 1, 2);
const JS_TYPE = R(new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:class|interface|enum|type)\\s+(${ID})`), "class");
const JS_VAR = R(new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+(${ID})\\s*(?::\\s*([^=;]+?))?\\s*(?:=|;|$)`), "variable", 1, 0, 2);
const JS_METHOD = R(new RegExp(`^(?:(?:public|private|protected|static|async|override|abstract|get|set)\\s+)*\\*?(${ID})\\s*(?:<[^>(]*>)?\\s*\\(([^)]*)\\)?\\s*(?::\\s*[^{]+)?\\{?\\s*$`), "method", 1, 2);
const JS_FIELD = R(new RegExp(`^(?:(?:public|private|protected|static|readonly|declare)\\s+)*(#?${ID})\\s*[?!]?\\s*(?::\\s*([^=;]+?))?\\s*(?:=|;|$)`), "field", 1, 0, 2);
const PY_VAR = R(/^([A-Za-z_]\w*)\s*(?::\s*([\w.[\], |]+?))?\s*=(?!=)\s*/, "variable", 1, 0, 2);

const RULES = {
  js: { fn: [JS_FN, JS_ARROW], type: [JS_TYPE], variable: [JS_VAR], method: JS_METHOD, field: JS_FIELD, classKinds: /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|interface)\b/ },
  python: {
    fn: [R(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)/, "function", 1, 2)], type: [R(/^class\s+([A-Za-z_]\w*)/, "class")], variable: [PY_VAR], classKinds: /^class\b/,
    method: R(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)/, "method", 1, 2), field: R(/^self\.([A-Za-z_]\w*)\s*(?::\s*([\w.[\], |]+?))?\s*=(?!=)/, "field", 1, 0, 2),
  },
  go: {
    fn: [R(/^func\s+(?:\(\s*\w*\s*\*?(\w+)[^)]*\)\s*)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(([^)]*)/, "function", 2, 3)], type: [R(/^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)?/, "class")],
    variable: [R(/^(?:var|const)\s+([A-Za-z_]\w*)\s*([\w.*[\]]+)?/, "variable", 1, 0, 2), R(/^([A-Za-z_]\w*)\s*:=/, "variable")], classKinds: /^type\s+\w+\s+(?:struct|interface)\b/,
    field: R(/^([A-Za-z_]\w*)\s+([\w.*[\]]+)/, "field", 1, 0, 2),
  },
  rust: {
    fn: [R(/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(([^)]*)/, "function", 1, 2)], type: [R(/^(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|type|union)\s+([A-Za-z_]\w*)/, "class")],
    variable: [R(/^let\s+(?:mut\s+)?([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*(?:=|;)/, "variable", 1, 0, 2), R(/^(?:pub\s+)?(?:const|static)\s+([A-Z_a-z]\w*)\s*:\s*([^=]+?)\s*=/, "variable", 1, 0, 2)],
    classKinds: /^(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|union)\b|^impl\b/, field: R(/^(?:pub(?:\([^)]*\))?\s+)?([A-Za-z_]\w*)\s*:\s*([^,]+?),?$/, "field", 1, 0, 2), method: null,
  },
  jvm: {
    fn: [R(/^(?:(?:public|private|protected|static|final|abstract|synchronized|override|open|internal|async|virtual|suspend|inline)\s+)*fun\s+(?:<[^>]*>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(([^)]*)/, "function", 1, 2),
      R(/^(?:(?:public|private|protected|static|final|abstract|synchronized|override|virtual|internal|async|sealed|new)\s+)*[\w<>[\],.?]+\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:throws [\w, .]+)?\s*(?:\{|=>|;)?\s*$/, "function", 1, 2)],
    type: [R(/^(?:(?:public|private|protected|static|final|abstract|sealed|open|data|internal|partial|enum)\s+)*(?:class|interface|enum|record|object|struct|trait)\s+([A-Za-z_]\w*)/, "class")],
    variable: [R(/^(?:val|var)\s+([A-Za-z_]\w*)\s*(?::\s*([\w<>?,. []+?))?\s*(?:=|$)/, "variable", 1, 0, 2), R(/^(?:final\s+)?(var|[A-Z][\w<>[\],.?]*|int|long|double|float|boolean|char|byte|short|string)\s+([A-Za-z_]\w*)\s*(?:=|;)/, "variable", 2, 0, 1)],
    classKinds: /^(?:(?:public|private|protected|static|final|abstract|sealed|open|data|internal|partial)\s+)*(?:class|interface|record|object|struct)\b/,
    field: R(/^(?:(?:public|private|protected|static|final|readonly|const|volatile|override|lateinit)\s+)*(?:(?:val|var)\s+)?([\w<>[\],.?]+\s+)?([A-Za-z_]\w*)\s*(?:=|;|:)/, "field", 2, 0, 1),
  },
  c: {
    fn: [R(/^(?!(?:return|else|if|for|while|switch|case|typedef|delete|new)\b)[\w:<>*&\s~]+?[\s*&]([A-Za-z_]\w*)\s*\(([^;)]*)\)?\s*(?:const)?\s*(?:\{|$)/, "function", 1, 2)], type: [R(/^(?:typedef\s+)?(?:struct|class|enum|union|namespace)\s+([A-Za-z_]\w*)/, "class"), R(/^#define\s+([A-Za-z_]\w*)/, "variable")],
    variable: [R(/^(?:(?:const|static|unsigned|signed|extern|volatile|auto|register)\s+)*(?!(?:return|else|delete|new|goto|throw|case|typedef|using|struct|class)\b)([A-Za-z_][\w:<>,]*)(?:\s*[*&]+\s*|\s+)([A-Za-z_]\w*)\s*(?:=|;|\[)/, "variable", 2, 0, 1)], classKinds: /^(?:typedef\s+)?(?:struct|class|union)\b/,
    field: R(/^(?:(?:const|static|unsigned|signed|volatile|mutable|public:|private:|protected:)\s+)*[A-Za-z_][\w:<>]*(?:\s*[*&]+\s*|\s+)([A-Za-z_]\w*)\s*(?:=|;|\[)/, "field"),
  },
  php: {
    fn: [R(/^(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?([A-Za-z_]\w*)\s*\(([^)]*)/, "function", 1, 2)], type: [R(/^(?:abstract\s+|final\s+)?(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/, "class")],
    variable: [R(/^(\$[A-Za-z_]\w*)\s*=(?!=)/, "variable")], classKinds: /^(?:abstract\s+|final\s+)?(?:class|interface|trait)\b/, field: R(/^(?:(?:public|private|protected|static|readonly)\s+)+(?:[\w?\\]+\s+)?(\$[A-Za-z_]\w*)/, "field"),
  },
  ruby: {
    fn: [R(/^def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)\s*\(?([^)]*)/, "function", 1, 2)], type: [R(/^(?:class|module)\s+([A-Z]\w*)/, "class")], variable: [R(/^([a-z_]\w*)\s*=(?!=)/, "variable")], classKinds: /^(?:class|module)\b/,
    field: R(/^(@[A-Za-z_]\w*)\s*=(?!=)/, "field"), method: R(/^def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)\s*\(?([^)]*)/, "method", 1, 2),
  },
  swift: {
    fn: [R(/^(?:(?:public|private|internal|fileprivate|open|static|class|final|override|mutating)\s+)*func\s+([A-Za-z_]\w*)\s*(?:<[^>]*>)?\s*\(([^)]*)/, "function", 1, 2)], type: [R(/^(?:(?:public|private|internal|final|open)\s+)*(?:class|struct|enum|protocol|extension|actor)\s+([A-Za-z_]\w*)/, "class")],
    variable: [R(/^(?:let|var)\s+([A-Za-z_]\w*)\s*(?::\s*([\w<>?[\]]+))?/, "variable", 1, 0, 2)], classKinds: /^(?:(?:public|private|internal|final|open)\s+)*(?:class|struct|enum|protocol|extension|actor)\b/,
    field: R(/^(?:(?:public|private|internal|fileprivate|static|lazy|weak)\s+)*(?:let|var)\s+([A-Za-z_]\w*)\s*(?::\s*([\w<>?[\]]+))?/, "field", 1, 0, 2),
  },
  shell: { fn: [R(/^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{?/, "function"), R(/^function\s+([A-Za-z_][\w-]*)/, "function")], type: [], variable: [R(/^(?:export\s+|local\s+|readonly\s+)?([A-Za-z_]\w*)=/, "variable")], classKinds: null },
  v: {
    fn: [R(/^(?:pub\s+)?fn\s+(?:\(\s*(?:mut\s+)?\w+\s+&?(?:mut\s+)?([\w.]+)(?:\[[^\]]*\])?\s*\)\s*)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(([^)]*)/, "function", 2, 3)],
    type: [R(/^(?:pub\s+)?(?:struct|interface|enum|union)\s+([A-Za-z_]\w*)/, "class"), R(/^(?:pub\s+)?type\s+([A-Za-z_]\w*)/, "class")],
    variable: [R(/^(?:mut\s+)?([A-Za-z_]\w*(?:\s*,\s*(?:mut\s+)?[A-Za-z_]\w*)*)\s*:=/, "variable"), R(/^(?:pub\s+)?(?:const|__global)\s+([A-Za-z_]\w*)\s*=/, "variable"), R(/^(?:pub\s+)?const\s+([a-z_]\w*)/, "variable")],
    classKinds: /^(?:pub\s+)?(?:struct|interface|union)\b/, field: R(/^([A-Za-z_]\w*)\s+([\w.[\]&?!*]+)(?:\s*=.*)?$/, "field", 1, 0, 2),
  },
};
RULES.jvm.method = null;
RULES.go.method = null;

const IMPORTS = {
  js: [/^import\s+(?:type\s+)?([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?\s*(?:\*\s+as\s+([\w$]+))?\s*from\s*["']/, /^(?:const|let|var)\s+(?:\{([^}]*)\}|([\w$]+))\s*=\s*require\(/],
  python: [/^import\s+([\w., ]+)/, /^from\s+[\w.]+\s+import\s+\(?([\w., *]+)/], go: [/^import\s+(?:(\w+)\s+)?"([^"]+)"/], rust: [/^use\s+([\w:{}, *]+);/], v: [/^import\s+([\w.]+)(?:\s+as\s+(\w+))?/],
};

/** Split "a, b = 1, {c}" style parameter lists at top-level commas. */
export function splitTop(text) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if ("([{<".includes(ch)) depth++;
    else if (")]}>".includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const TYPE_FIRST = new Set(["jvm", "c", "php"]);
const SKIP_WORDS = new Set(["mut", "final", "const", "ref", "var", "val", "in", "out", "inout", "self", "cls", "this", "shared", "volatile", "static", "unsigned", "signed", "struct"]);

/** Parameters of a function header -> [{ name, type }]. Handles name-first (js, python, go, rust, v, swift) and type-first (Java, C, PHP) styles. */
export function parseParams(text, family) {
  const out = [];
  const segs = splitTop(String(text ?? "").slice(0, 300));
  let pendingNames = [];
  for (const raw of segs) {
    const seg = raw.replace(/\s*=[^]*$/, "").replace(/^\.{3}/, "").trim();
    if (!seg) continue;
    const words = seg.split(/[\s:]+/).filter((w) => w && !SKIP_WORDS.has(w.replace(/^[&*]+/, "")));
    if (!words.length) continue;
    if (TYPE_FIRST.has(family)) {
      const name = words[words.length - 1].replace(/^[&*]+/, "");
      if (/^\$?[A-Za-z_]\w*$/.test(name)) out.push({ name, type: words.slice(0, -1).join(" ") });
      continue;
    }
    const name = words[0].replace(/^[&*]+|[?]$/g, "");
    if (!/^\$?[A-Za-z_][\w$]*$/.test(name)) continue;
    if (words.length === 1 && (family === "go" || family === "v") && !/^[A-Z]/.test(name)) { pendingNames.push(name); continue; }
    const type = words.slice(1).join(" ").replace(/^&/, "");
    for (const n of pendingNames) out.push({ name: n, type });
    pendingNames = [];
    out.push({ name, type });
  }
  for (const n of pendingNames) out.push({ name: n, type: "" });
  return out;
}

export const indentOf = (line) => {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === " ") n++;
    else if (c === "\t") n += 4;
    else return n;
  }
  return -1;
};

function importNames(lang, family, line) {
  const out = [];
  for (const re of IMPORTS[family] ?? []) {
    const m = re.exec(line);
    if (!m) continue;
    for (const g of m.slice(1)) {
      if (!g) continue;
      for (const part of g.split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop().split(/[.:/]/).pop().replace(/[{}*]/g, "").trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) out.push({ name, full: part.trim().split(/\s+as\s+/)[0] });
      }
    }
    if (family === "v" && m[1]) out.push({ name: m[2] ?? m[1].split(".").pop(), full: m[1] });
    break;
  }
  return out;
}

/** An empty index (used for files that can't or shouldn't be indexed). */
export function emptyIndex(lang = "plain") {
  return { lang, family: familyOf(lang), big: false, decls: [], words: new Map(), owners: new Map(), uses: new Map(), imports: [], keys: new Set(), tables: new Map(), classes: new Set(), indents: new Uint16Array(0), lineCount: 0, symbolCount: 0 };
}

/** Words (3+ characters) in the lines around `line`: the whole index for big files. */
export function wordsAround(text, caret, radius = 60) {
  const from = text.lastIndexOf("\n", Math.max(0, caret - radius * 80));
  const words = new Map();
  for (const m of text.slice(from < 0 ? 0 : from, caret + radius * 80).matchAll(/[A-Za-z_$][\w$]{2,40}/g)) words.set(m[0], (words.get(m[0]) ?? 0) + 1);
  return words;
}

export function buildIndex(text, lang, caret = 0) {
  const index = emptyIndex(lang);
  const family = index.family;
  if (text.length > MAX_INDEX_CHARS) { index.big = true; index.words = wordsAround(text, caret); return index; }
  const lines = text.split("\n");
  index.lineCount = lines.length;
  index.indents = new Uint16Array(lines.length);
  const rules = RULES[family] ?? null;
  const owners = [];
  const fns = [];
  const addOwner = (name, member) => {
    const list = index.owners.get(name) ?? [];
    if (list.length < 400 && !list.some((x) => x.name === member.name)) list.push(member);
    index.owners.set(name, list);
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const ind = indentOf(raw);
    index.indents[i] = ind < 0 ? 65535 : Math.min(ind, 65000);
    for (const m of raw.length > 2000 ? [] : raw.slice(0, MAX_LINE).matchAll(/[A-Za-z_$][\w$]{2,40}/g)) {
      if (index.words.size < MAX_WORDS || index.words.has(m[0])) index.words.set(m[0], (index.words.get(m[0]) ?? 0) + 1);
    }
    if (ind < 0 || raw.length > MAX_LINE) continue;
    const line = raw.trim();
    if (family === "json") { const k = /^"([^"\\\n]{1,80})"\s*:/.exec(line); if (k) index.keys.add(k[1]); continue; }
    if (family === "yaml" || family === "toml" || family === "ini") { const k = /^[-\s]*([\w.-]{1,60})\s*[:=]/.exec(line); if (k) index.keys.add(k[1]); continue; }
    if (family === "sql") { sqlLine(index, line); continue; }
    if (family === "css") { for (const m of line.matchAll(/[.#]([A-Za-z_][\w-]{1,40})(?=[\s,{.:>#[+~]|$)/g)) index.keys.add(m[1]); for (const m of line.matchAll(/(--[\w-]{1,40})\s*:/g)) index.keys.add(m[1]); continue; }
    if (family === "web") { for (const m of line.matchAll(/\b(?:class|id)="([^"]{1,200})"/g)) for (const c of m[1].split(/\s+/)) if (c) index.keys.add(c); for (const m of line.matchAll(/<([A-Za-z][\w:-]{1,40})/g)) index.keys.add(`<${m[1]}`); continue; }
    if (!rules || index.symbolCount >= MAX_SYMBOLS) continue;
    if (line.startsWith("//") || line.startsWith("#") && family !== "c" && family !== "shell" && family !== "php" || line.startsWith("*") || line.startsWith("/*")) { if (!line.startsWith("#define")) continue; }
    while (owners.length && ind <= owners[owners.length - 1].indent && line !== "{") owners.pop();
    const owner = owners.length ? owners[owners.length - 1] : null;
    while (fns.length && ind <= fns[fns.length - 1] && line !== "{") fns.pop();
    const inBody = fns.length > 0;
    const decl = (d) => {
      index.symbolCount++;
      index.decls.push({ line: i, indent: ind, ...d });
      if (d.kind === "class") index.classes.add(d.name);
    };
    for (const imp of importNames(lang, family, line)) { index.imports.push(imp); decl({ name: imp.name, kind: "import", detail: imp.full }); }
    let matched = false;
    for (const rule of [...(rules.fn ?? [])]) {
      const m = rule[0].exec(line);
      if (!m || KEYWORDS_NOT_NAMES.has(m[rule[2]])) continue;
      const name = m[rule[2]];
      const params = m[rule[3]] ?? m[3] ?? "";
      const recv = family === "go" || family === "v" ? m[1] : "";
      const kind = recv || owner?.kind === "class" && family !== "go" ? "method" : "function";
      const ownerName = recv || owner?.name;
      decl({ name, kind, params, owner: ownerName });
      fns.push(ind);
      if (ownerName && kind === "method") addOwner(ownerName, { name, kind: "method", params });
      for (const p of parseParams(params || (m[3] && !m[2] ? m[3] : ""), family)) decl({ name: p.name, kind: "param", type: p.type, inner: true });
      matched = true;
      break;
    }
    if (!matched && owner && rules.method && family === "js" && owner.kind === "class" && ind > owner.indent) {
      const m = rules.method[0].exec(line);
      if (m && !KEYWORDS_NOT_NAMES.has(m[1])) {
        decl({ name: m[1], kind: "method", params: m[2] ?? "", owner: owner.name });
        addOwner(owner.name, { name: m[1], kind: "method", params: m[2] ?? "" });
        for (const p of parseParams(m[2], family)) decl({ name: p.name, kind: "param", type: p.type, inner: true });
        matched = true;
      }
    }
    if (!matched) {
      for (const rule of rules.type ?? []) {
        const m = rule[0].exec(line);
        if (!m) continue;
        decl({ name: m[1], kind: "class" });
        const isOwner = rules.classKinds?.test(line) || /^impl\b/.test(line);
        if (isOwner && /[{:]\s*$|\{|^class\b|^impl\b/.test(line)) owners.push({ name: m[1], indent: ind, kind: "class" });
        else if (/^(?:class|module)\b/.test(line) && family === "ruby") owners.push({ name: m[1], indent: ind, kind: "class" });
        matched = true;
        break;
      }
    }
    if (!matched && family === "rust") {
      const impl = /^impl(?:<[^>]*>)?\s+(?:[\w:<>]+\s+for\s+)?([A-Za-z_]\w*)/.exec(line);
      if (impl) { owners.push({ name: impl[1], indent: ind, kind: "class" }); continue; }
    }
    if (!matched && owner && !inBody && ind > owner.indent && rules.field && !(rules.fn ?? []).some((r) => r[0].test(line))) {
      const f = rules.field[0].exec(line);
      const name = f?.[rules.field[2]];
      const notField = family === "v" ? /^(?:pub|mut|pub mut|__global):?$/.test(name ?? "") || /^(pub|mut)/.test(line) && line.endsWith(":") : false;
      if (f && name && !KEYWORDS_NOT_NAMES.has(name) && !notField && ind <= owner.indent + 12) {
        const type = f[rules.field[4]] ?? "";
        if (family === "v" && /^[a-z_]\w*\(/.test(line)) { addOwner(owner.name, { name, kind: "method", params: /\(([^)]*)\)/.exec(line)?.[1] ?? "" }); }
        else { addOwner(owner.name, { name, kind: "field", type: type.trim() }); decl({ name, kind: "field", type: type.trim(), owner: owner.name }); }
        matched = true;
      }
    }
    if (!matched) {
      const self = family === "python" ? /^self\.([A-Za-z_]\w*)\s*(?::\s*([\w.[\], |]+?))?\s*=(?!=)/.exec(line) : /^this\.(#?[A-Za-z_$][\w$]*)\s*=(?!=)/.exec(line);
      if (self && owners.length) { addOwner(owners[owners.length - 1].name, { name: self[1], kind: "field", type: self[2] ?? "" }); matched = true; }
    }
    if (!matched) {
      for (const rule of rules.variable ?? []) {
        const m = rule[0].exec(line);
        if (!m) continue;
        const init = line.slice(m[0].length, m[0].length + 80);
        const names = rule[2] === 1 ? m[1].split(",").map((s) => s.replace(/^\s*mut\s+/, "").trim()) : [m[rule[2]]];
        for (const name of names) if (/^\$?[A-Za-z_$][\w$]*$/.test(name) && !KEYWORDS_NOT_NAMES.has(name)) decl({ name, kind: "variable", type: (rule[4] && m[rule[4]] || "").trim().replace(/^(?:var|val|auto)$/, ""), init: names.length === 1 ? (/^[=:]*\s*(.*)$/.exec(init)?.[1] ?? "") : "" });
        matched = true;
        break;
      }
      const forLoop = family === "python" ? /^for\s+([\w, ]+?)\s+in\b/.exec(line) : family === "v" ? /^for\s+([\w, ]+?)\s+in\b/.exec(line) : /^for\s*\(?\s*(?:const|let|var|auto|int)?\s*([A-Za-z_$][\w$]*)\s+(?:of|in)\b/.exec(line);
      if (forLoop) for (const n of forLoop[1].split(",")) if (/^[A-Za-z_]\w*$/.test(n.trim())) decl({ name: n.trim(), kind: "variable" });
      const destructure = family === "js" ? /^(?:const|let|var)\s+[{[]\s*([^}\]]{1,200})[}\]]\s*=/.exec(line) : null;
      if (destructure) for (const part of destructure[1].split(",")) { const n = part.split("=")[0].split(":").pop().replace("...", "").trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) decl({ name: n, kind: "variable" }); }
    }
  }
  for (const m of text.slice(0, MAX_INDEX_CHARS).matchAll(/([A-Za-z_$][\w$]{0,40})(?:\.|->|::)([A-Za-z_$][\w$]{0,40})/g)) {
    const set = index.uses.get(m[1]) ?? new Set();
    if (set.size < 200 && index.uses.size < 4000) { set.add(m[2]); index.uses.set(m[1], set); }
  }
  return index;
}

function sqlLine(index, line) {
  const create = /^create\s+(?:temp\w*\s+)?table\s+(?:if\s+not\s+exists\s+)?["`]?(\w+)/i.exec(line);
  if (create) { index.tables.set(create[1], index.tables.get(create[1]) ?? new Set()); index.sqlCurrent = create[1]; return; }
  if (index.sqlCurrent) {
    const col = /^["`]?(\w+)["`]?\s+(?:integer|int|text|varchar|real|blob|numeric|boolean|bool|date|datetime|timestamp|serial|bigint|float|double|decimal|char|uuid|json)/i.exec(line);
    if (col) index.tables.get(index.sqlCurrent)?.add(col[1]);
    if (line.startsWith(")")) index.sqlCurrent = "";
  }
  for (const m of line.matchAll(/\b(?:from|join|into|update)\s+["`]?(\w+)["`]?(?:\s+(?:as\s+)?(\w+))?/gi)) {
    if (!index.tables.has(m[1])) index.tables.set(m[1], new Set());
    if (m[2] && !/^(where|on|set|join|left|right|inner|outer|group|order|limit|values|using|cross|union)$/i.test(m[2])) index.sqlAliases = { ...(index.sqlAliases ?? {}), [m[2]]: m[1] };
  }
  for (const m of line.matchAll(/\b(\w+)\.(\w+)\b/g)) { const alias = index.sqlAliases?.[m[1]] ?? m[1]; if (index.tables.has(alias)) index.tables.get(alias).add(m[2]); }
}
