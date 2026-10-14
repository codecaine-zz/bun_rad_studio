/**
 * The arithmetic of file permissions, with no disk access: reading and applying a `chmod`-style text like
 * "u+rwx,g=rX,o-rwx", checking a change request from the page, and working out what a change would do to one mode.
 *
 * Bits: owner r/w/x = 0o400/0o200/0o100, group = 0o040/0o020/0o010, others = 0o004/0o002/0o001,
 * setuid 0o4000, setgid 0o2000, sticky 0o1000. Only these twelve bits are ever read or written; the type bits
 * (file, folder, link) are not part of a mode here and so can never be disturbed.
 */
import { FmError, type Platform } from "./fmPaths";

export const MODE_MASK = 0o7777;
export const EXEC_BITS = 0o111;
export const SETUID = 0o4000;
export const SETGID = 0o2000;
export const STICKY = 0o1000;
export const MAX_SYMBOLIC_LENGTH = 200;

export type Scope = "all" | "files" | "dirs";

/** One `[ugoa]*` part and what it does: "+", "-" or "=" followed by letters, or the class to copy from. */
export interface SymbolicAction {
  op: "+" | "-" | "=";
  /** Any of r w x X s t (each at most once). */
  letters: string;
  /** "u", "g" or "o" when the permissions are copied from another class (`g=u`). */
  copyFrom: "u" | "g" | "o" | null;
}
export interface SymbolicClause {
  /** 1 = owner, 2 = group, 4 = others; 7 when no letter was given. */
  who: number;
  actions: SymbolicAction[];
}

function badMode(message: string): FmError {
  return new FmError("BAD_MODE", message);
}

/**
 * Reads "u+rwx,g=rX,o-rwx" (the grammar of chmod: who = u g o a, operator = + - =, what = r w x X s t or one of u g o
 * to copy from, clauses separated by commas). Anything else is refused with a sentence that says what was wrong.
 * No letters before the operator means everyone (without the "umask" rule that the chmod program applies).
 */
export function parseSymbolic(text: unknown): SymbolicClause[] {
  if (typeof text !== "string") throw badMode("Type the change as text, like u+x or go-w.");
  if (text.length === 0) throw badMode("Type a change, like u+x or go-w.");
  if (text.length > MAX_SYMBOLIC_LENGTH) throw badMode(`That is too long (at most ${MAX_SYMBOLIC_LENGTH} characters).`);
  if (!/^[\x21-\x7e]+$/.test(text)) throw badMode("Use only the letters u g o a, the signs + - =, the letters r w x X s t, and commas. No spaces or other characters.");
  const clauses: SymbolicClause[] = [];
  for (const part of text.split(",")) {
    if (part === "") throw badMode("There is an empty part between commas.");
    let i = 0;
    let who = 0;
    while (i < part.length && "ugoa".includes(part[i]!)) {
      const c = part[i]!;
      who |= c === "u" ? 1 : c === "g" ? 2 : c === "o" ? 4 : 7;
      i++;
    }
    if (i >= part.length || !"+-=".includes(part[i]!)) throw badMode(`"${part}" needs a + (add), - (remove) or = (set exactly) after the who letters.`);
    const actions: SymbolicAction[] = [];
    while (i < part.length) {
      const op = part[i]! as "+" | "-" | "=";
      if (!"+-=".includes(op)) throw badMode(`"${part[i]}" can't be used here. After a sign use r, w, x, X, s, t, or one of u, g, o.`);
      i++;
      let letters = "";
      let copyFrom: "u" | "g" | "o" | null = null;
      while (i < part.length && !"+-=".includes(part[i]!)) {
        const c = part[i]!;
        if ("rwxXst".includes(c)) {
          if (copyFrom) throw badMode(`"${part}" mixes a copy (like g=u) with letters. Use one or the other.`);
          if (letters.includes(c)) throw badMode(`"${c}" appears twice in "${part}".`);
          letters += c;
        } else if ("ugo".includes(c)) {
          if (copyFrom || letters) throw badMode(`"${part}" mixes a copy (like g=u) with other letters. Use one or the other.`);
          copyFrom = c as "u" | "g" | "o";
        } else {
          throw badMode(c === "a" ? `"a" belongs before the sign (a+r), not after it.` : `"${c}" isn't a permission letter. Use r, w, x, X, s or t.`);
        }
        i++;
      }
      actions.push({ op, letters, copyFrom });
    }
    clauses.push({ who: who || 7, actions });
  }
  return clauses;
}

/** What a symbolic change makes of `old` (twelve bits). `isDir` decides what a capital X means. */
export function applySymbolic(clauses: SymbolicClause[], old: number, isDir: boolean): number {
  const original = old & MODE_MASK;
  let mode = original;
  const classBits = (m: number, which: "u" | "g" | "o") => (which === "u" ? (m >> 6) & 7 : which === "g" ? (m >> 3) & 7 : m & 7);
  for (const clause of clauses) {
    for (const action of clause.actions) {
      let perm = 0;
      let special = 0;
      if (action.copyFrom) {
        perm = classBits(mode, action.copyFrom);
      } else {
        for (const c of action.letters) {
          if (c === "r") perm |= 4;
          else if (c === "w") perm |= 2;
          else if (c === "x") perm |= 1;
          else if (c === "X") {
            if (isDir || (original & EXEC_BITS) !== 0) perm |= 1;
          } else if (c === "s") special |= (clause.who & 1 ? SETUID : 0) | (clause.who & 2 ? SETGID : 0);
          else if (c === "t") special |= clause.who & 4 ? STICKY : 0;
        }
      }
      const bits = (clause.who & 1 ? perm << 6 : 0) | (clause.who & 2 ? perm << 3 : 0) | (clause.who & 4 ? perm : 0) | special;
      const mask = (clause.who & 1 ? 0o700 | SETUID : 0) | (clause.who & 2 ? 0o070 | SETGID : 0) | (clause.who & 4 ? 0o007 | STICKY : 0);
      if (action.op === "+") mode |= bits;
      else if (action.op === "-") mode &= ~bits;
      else mode = (mode & ~mask) | bits;
    }
  }
  return mode & MODE_MASK;
}

// ---------------------------------------------------------------------------------------------------------------
// The change a request asks for
// ---------------------------------------------------------------------------------------------------------------

export type ModeEdit =
  | { kind: "set"; file: number | null; dir: number | null }
  | { kind: "bits"; add: number; remove: number }
  | { kind: "symbolic"; clauses: SymbolicClause[] };

export interface FlagChange {
  locked?: boolean;
  hidden?: boolean;
  readonly?: boolean;
}

export interface Change {
  edit: ModeEdit | null;
  recursive: { scope: Scope; xOnlyIfExecutable: boolean } | null;
  flags: FlagChange;
}

function wholeMode(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MODE_MASK) throw badMode(`${what} must be a whole number from 0 to ${MODE_MASK} (that is 0 to 7777 in octal).`);
  return value;
}

/** Checks the `change` of a request. Throws a plain-words FmError for anything that isn't exactly what is allowed. */
export function parseChange(raw: unknown, platform: Platform): Change {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new FmError("BAD_REQUEST", "Say what to change.");
  const c = raw as Record<string, unknown>;
  const known = new Set(["set", "add", "remove", "symbolic", "recursive", "flags"]);
  for (const key of Object.keys(c)) if (!known.has(key)) throw new FmError("BAD_REQUEST", `"${key}" isn't something that can be changed here.`);

  let edit: ModeEdit | null = null;
  const hasSet = c.set !== undefined;
  const hasBits = c.add !== undefined || c.remove !== undefined;
  const hasSym = c.symbolic !== undefined;
  if ((hasSet ? 1 : 0) + (hasBits ? 1 : 0) + (hasSym ? 1 : 0) > 1) throw new FmError("BAD_REQUEST", "Give one kind of change: exact permissions, bits to add or remove, or a text like u+x.");
  if (hasSet) {
    if (c.set !== null && typeof c.set === "object" && !Array.isArray(c.set)) {
      const s = c.set as Record<string, unknown>;
      for (const key of Object.keys(s)) if (key !== "file" && key !== "dir") throw new FmError("BAD_REQUEST", `"${key}" isn't "file" or "dir".`);
      if (s.file === undefined && s.dir === undefined) throw badMode("Give the permissions for files, folders or both.");
      edit = { kind: "set", file: s.file === undefined ? null : wholeMode(s.file, "The permissions for files"), dir: s.dir === undefined ? null : wholeMode(s.dir, "The permissions for folders") };
    } else {
      const m = wholeMode(c.set, "The permissions");
      edit = { kind: "set", file: m, dir: m };
    }
  } else if (hasBits) {
    const add = c.add === undefined ? 0 : wholeMode(c.add, "The permissions to add");
    const remove = c.remove === undefined ? 0 : wholeMode(c.remove, "The permissions to remove");
    if (add & remove) throw badMode("The same permission can't be both added and removed.");
    edit = { kind: "bits", add, remove };
  } else if (hasSym) {
    edit = { kind: "symbolic", clauses: parseSymbolic(c.symbolic) };
  }

  let recursive: Change["recursive"] = null;
  if (c.recursive !== undefined && c.recursive !== null && c.recursive !== false) {
    if (typeof c.recursive !== "object" || Array.isArray(c.recursive)) throw new FmError("BAD_REQUEST", "The 'everything inside' option isn't valid.");
    const r = c.recursive as Record<string, unknown>;
    for (const key of Object.keys(r)) if (key !== "scope" && key !== "xOnlyIfExecutable") throw new FmError("BAD_REQUEST", `"${key}" isn't an option for 'everything inside'.`);
    const scope = r.scope === undefined ? "all" : r.scope;
    if (scope !== "all" && scope !== "files" && scope !== "dirs") throw new FmError("BAD_REQUEST", "Choose files and folders, only files, or only folders.");
    if (r.xOnlyIfExecutable !== undefined && typeof r.xOnlyIfExecutable !== "boolean") throw new FmError("BAD_REQUEST", "'Only where it already runs' must be on or off.");
    recursive = { scope, xOnlyIfExecutable: r.xOnlyIfExecutable === true };
  }

  const flags: FlagChange = {};
  if (c.flags !== undefined && c.flags !== null) {
    if (typeof c.flags !== "object" || Array.isArray(c.flags)) throw new FmError("BAD_REQUEST", "The extra settings aren't valid.");
    const f = c.flags as Record<string, unknown>;
    for (const key of Object.keys(f)) {
      if (key !== "locked" && key !== "hidden" && key !== "readonly") throw new FmError("BAD_REQUEST", `"${key}" isn't a setting that can be changed here.`);
      if (f[key] === undefined) continue;
      if (typeof f[key] !== "boolean") throw new FmError("BAD_REQUEST", `"${key}" must be on or off.`);
      flags[key] = f[key] as boolean;
    }
    if (flags.locked !== undefined && platform !== "darwin") throw new FmError("UNSUPPORTED", "Locking is only available on macOS.");
    if (flags.hidden !== undefined && platform === "linux") throw new FmError("UNSUPPORTED", "On Linux a file is hidden when its name starts with a dot. Rename it to change that.");
    if (flags.readonly !== undefined && platform !== "win32") throw new FmError("UNSUPPORTED", "Read-only is a Windows setting. Here, turn off the Write boxes instead.");
  }
  if (edit && platform === "win32") throw new FmError("UNSUPPORTED", "Windows doesn't use these read/write/run permissions. Use the Read-only and Hidden settings instead. Windows access rules (ACLs) aren't edited here.");
  if (!edit && Object.keys(flags).length === 0) throw new FmError("BAD_REQUEST", "Nothing to change.");
  return { edit, recursive, flags };
}

/** The mode `old` becomes under `change` (twelve bits). A change with no mode part leaves it alone. */
export function newModeFor(old: number, isDir: boolean, change: Change): number {
  const before = old & MODE_MASK;
  const edit = change.edit;
  if (!edit) return before;
  let mode = before;
  if (edit.kind === "set") {
    const target = isDir ? edit.dir : edit.file;
    if (target !== null) mode = target;
  } else if (edit.kind === "bits") {
    mode = (before & ~edit.remove) | edit.add;
  } else {
    mode = applySymbolic(edit.clauses, before, isDir);
  }
  // "Run" is only given to files that already run (the capital X rule); a file that doesn't run keeps it off.
  if (change.recursive?.xOnlyIfExecutable && !isDir && (before & EXEC_BITS) === 0) mode &= ~EXEC_BITS;
  return mode & MODE_MASK;
}

// ---------------------------------------------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------------------------------------------

export type RiskCode = "world-writable" | "owner-lockout" | "special-bits" | "many-items";

export interface Risk {
  code: RiskCode;
  message: string;
}

/** Which risky things this one change does, derived from the modes only. */
export function risksOfChange(before: number, after: number, isDir: boolean): RiskCode[] {
  const out: RiskCode[] = [];
  if (before === after) return out;
  if ((after & 0o002) !== 0 && (before & 0o002) === 0) out.push("world-writable");
  const lost = before & ~after;
  if ((lost & 0o600) !== 0 || (isDir && (lost & 0o100) !== 0)) out.push("owner-lockout");
  if (!isDir && (after & (SETUID | SETGID) & ~before) !== 0) out.push("special-bits");
  return out;
}

export const RISK_MESSAGES: Record<RiskCode, string> = {
  "world-writable": "Anyone with an account on this computer would be able to change or replace these items.",
  "owner-lockout": "You would lose your own read, write or open access to some items, so you might not be able to change them back without Undo.",
  "special-bits": "Run-as-owner or run-as-group makes a program run with its owner's or group's rights instead of yours. Only use it if you know why it's needed.",
  "many-items": "This changes a lot of items at once.",
};

// ---------------------------------------------------------------------------------------------------------------
// Showing a mode
// ---------------------------------------------------------------------------------------------------------------

/** "644", or four digits ("4755") when a special bit is set. */
export function octalOf(mode: number): string {
  const m = mode & MODE_MASK;
  return m > 0o777 ? m.toString(8).padStart(4, "0") : m.toString(8).padStart(3, "0");
}

/** "rw-r--r--", with s/S/t/T for the special bits. */
export function symbolicOf(mode: number): string {
  const m = mode & MODE_MASK;
  let s = "";
  for (let i = 0; i < 9; i++) s += m & (0o400 >> i) ? "rwx"[i % 3] : "-";
  if (m & SETUID) s = s.slice(0, 2) + (s[2] === "x" ? "s" : "S") + s.slice(3);
  if (m & SETGID) s = s.slice(0, 5) + (s[5] === "x" ? "s" : "S") + s.slice(6);
  if (m & STICKY) s = s.slice(0, 8) + (s[8] === "x" ? "t" : "T");
  return s;
}
