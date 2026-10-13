import type { Engine } from "./types";

export interface SqlStatement {
  /** Statement text without the terminating delimiter, trimmed. */
  sql: string;
  /** Offsets into the original script ([start, end) covering the trimmed statement text). */
  start: number;
  end: number;
  /** 1-based line of the first character of the statement. */
  line: number;
}

interface Options {
  engine: Engine;
}

const isWordChar = (c: string) => /[A-Za-z0-9_$]/.test(c);

/**
 * Split a script into statements using a real tokenizer: quoted strings, quoted identifiers, comments,
 * PostgreSQL dollar quoting, MySQL `DELIMITER` lines and SQLite trigger bodies do not end a statement.
 * Comment-only fragments are dropped.
 */
export function splitStatements(script: string, opts: Options): SqlStatement[] {
  const { engine } = opts;
  const out: SqlStatement[] = [];
  let delimiter = ";";
  let i = 0;
  const n = script.length;
  let stmtStart = -1; // first significant char of current statement
  let lastSig = -1; // end (exclusive) of last significant char
  let trigger = false; // inside CREATE TRIGGER (sqlite) body tracking
  let blockDepth = 0;
  let sawBegin = false;
  let firstWords: string[] = [];

  const lineOf = (pos: number) => {
    let line = 1;
    for (let k = 0; k < pos; k++) if (script[k] === "\n") line++;
    return line;
  };

  const markSig = (from: number, to: number) => {
    if (stmtStart < 0) stmtStart = from;
    lastSig = to;
  };

  const flush = () => {
    if (stmtStart >= 0 && lastSig > stmtStart) {
      out.push({ sql: script.slice(stmtStart, lastSig).trim(), start: stmtStart, end: lastSig, line: lineOf(stmtStart) });
    }
    stmtStart = -1;
    lastSig = -1;
    trigger = false;
    blockDepth = 0;
    sawBegin = false;
    firstWords = [];
  };

  const atLineStart = (pos: number) => {
    for (let k = pos - 1; k >= 0 && script[k] !== "\n"; k--) if (script[k] !== " " && script[k] !== "\t" && script[k] !== "\r") return false;
    return true;
  };

  while (i < n) {
    const c = script[i]!;
    const next = script[i + 1];

    // MySQL client command: DELIMITER <token> on its own line, only between statements.
    if (engine === "mysql" && stmtStart < 0 && /d/i.test(c) && atLineStart(i) && /^delimiter[ \t]+/i.test(script.slice(i, i + 12))) {
      const eol = script.indexOf("\n", i);
      const lineEnd = eol < 0 ? n : eol;
      const token = script.slice(i, lineEnd).replace(/^delimiter[ \t]+/i, "").trim();
      if (token) delimiter = token;
      i = lineEnd + 1;
      continue;
    }

    // Comments
    if (c === "-" && next === "-" && (engine !== "mysql" || /[\s]/.test(script[i + 2] ?? "\n") || i + 2 >= n)) {
      const eol = script.indexOf("\n", i);
      i = eol < 0 ? n : eol + 1;
      continue;
    }
    if (engine === "mysql" && c === "#") {
      const eol = script.indexOf("\n", i);
      i = eol < 0 ? n : eol + 1;
      continue;
    }
    if (c === "/" && next === "*") {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (engine === "postgres" && script[i] === "/" && script[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (script[i] === "*" && script[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      // MySQL executable comments (/*! ... */) are real SQL: keep them in the statement.
      if (engine === "mysql" && script[start + 2] === "!") markSig(start, i);
      continue;
    }

    // Quoted strings / identifiers
    if (c === "'" || c === '"' || c === "`" || (engine === "sqlite" && c === "[")) {
      const start = i;
      const close = c === "[" ? "]" : c;
      const backslash = engine === "mysql" && c !== "`";
      const pgEscape = engine === "postgres" && c === "'" && i > 0 && /[eE]/.test(script[i - 1]!) && (i < 2 || !isWordChar(script[i - 2]!));
      i++;
      while (i < n) {
        const ch = script[i]!;
        if ((backslash || pgEscape) && ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === close) {
          if (c !== "[" && script[i + 1] === close) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      markSig(start, Math.min(i, n));
      continue;
    }

    // PostgreSQL dollar quoting: $$...$$ or $tag$...$tag$
    if (engine === "postgres" && c === "$" && !(i > 0 && isWordChar(script[i - 1]!))) {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(script.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const endIdx = script.indexOf(tag, i + tag.length);
        const start = i;
        i = endIdx < 0 ? n : endIdx + tag.length;
        markSig(start, i);
        continue;
      }
    }

    // Statement delimiter
    if (script.startsWith(delimiter, i) && !(trigger && (blockDepth > 0 || !sawBegin))) {
      flush();
      i += delimiter.length;
      continue;
    }

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (isWordChar(c)) {
      const start = i;
      while (i < n && isWordChar(script[i]!)) i++;
      const word = script.slice(start, i).toUpperCase();
      markSig(start, i);
      if (engine === "sqlite") {
        if (firstWords.length < 3) {
          firstWords.push(word);
          if (firstWords[0] === "CREATE" && firstWords.slice(1).some((w) => w === "TRIGGER")) trigger = true;
        }
        if (trigger) {
          if (word === "BEGIN") {
            blockDepth++;
            sawBegin = true;
          } else if (word === "CASE") blockDepth++;
          else if (word === "END" && blockDepth > 0) blockDepth--;
        }
      }
      continue;
    }

    markSig(i, i + 1);
    i++;
  }
  flush();
  return out;
}

/** The statement containing (or immediately preceding) a cursor offset; used for "run current statement". */
export function statementAt(script: string, offset: number, opts: Options): SqlStatement | null {
  const all = splitStatements(script, opts);
  if (all.length === 0) return null;
  for (const s of all) if (offset >= s.start && offset <= s.end) return s;
  let best: SqlStatement | null = null;
  for (const s of all) if (s.end <= offset) best = s;
  return best ?? all[0]!;
}

/** Leading keyword of a statement after comments, uppercased (for classification). */
export function leadingKeyword(sql: string): string {
  const m = /^(?:\s|--[^\n]*\n?|\/\*[\s\S]*?\*\/|#[^\n]*\n?)*([A-Za-z]+)/.exec(sql);
  return m ? m[1]!.toUpperCase() : "";
}
