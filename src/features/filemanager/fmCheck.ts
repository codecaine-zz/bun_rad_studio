/**
 * "Is this file what its name says?" The answer for one file: a short verdict in plain words, or nothing.
 *
 * Only the first 600 bytes are read, through a file handle opened without following links. Nothing is run or
 * interpreted. Anything that goes wrong (the file vanished, isn't readable, is a special file) means "nothing to say".
 */
import * as fs from "fs";
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { pathApi, type FmContext } from "./fmCore";
import { FmError, splitName } from "./fmPaths";
import { SNIFF_BYTES, kindInfo, sniffType, type Sniffed } from "./fmSniff";
import { checkName, expectedFor, judge, judgedExtension, visibleName, withoutTrailing } from "./fmSniffRules";

export type Severity = "danger" | "warning" | "notice";

export interface FileCheck {
  severity: Severity;
  code: string;
  /** A short headline. */
  title: string;
  /** One or two plain sentences about this file. */
  detail: string;
  /** What the contents really are (null when they couldn't be looked at). */
  actual: { kind: string; label: string } | null;
  /** The usual extension of the real format, without the dot. Only for harmless mismatches. */
  suggestedExtension?: string;
  /** The name with that extension, for a one-click rename. */
  suggestedName?: string;
  /** The name with invisible characters spelled out. Only when it has any. */
  visibleName?: string;
}

/** Real formats that have no single usual extension (or none that is safe to suggest). */
const NO_SUGGESTION = new Set(["ole2", "text", "binary", "script", "pe", "elf", "macho", "javaclass"]);

const brief = (s: Sniffed): { kind: string; label: string } => ({ kind: s.kind, label: s.label });

/** The verdict from the extension and the real content alone (no name-only traps). Pure. */
export function judgeContent(name: string, actual: Sniffed): FileCheck | null {
  const ext = judgedExtension(name);
  const rule = expectedFor(ext);
  if (!rule || rule.kinds.has(actual.kind)) return null;
  const shown = visibleName(name);
  if (actual.danger) {
    const script = actual.family === "script";
    return {
      severity: "danger",
      code: script ? "SCRIPT_DISGUISED" : "PROGRAM_DISGUISED",
      title: script ? "This is a script in disguise" : "This is a program in disguise",
      detail: `This file is named "${shown}", but it is really ${actual.label}. Opening it could run it on your computer.`,
      actual: brief(actual),
    };
  }
  const verdict = judge(rule, actual);
  if (verdict === "ok") return null;
  const check: FileCheck = verdict === "same"
    ? {
        severity: "notice",
        code: "WRONG_FORMAT",
        title: "A different format than its name says",
        detail: `This file is named "${shown}", but it is really ${actual.label}. That is a different format of the same sort of file, so most programs will still cope.`,
        actual: brief(actual),
      }
    : {
        severity: "warning",
        code: "WRONG_KIND",
        title: "Not the kind of file its name says",
        detail: `This file is named "${shown}", but it is really ${actual.label}. Programs that expect a .${ext} file may not be able to open it.`,
        actual: brief(actual),
      };
  const suggestion = actual.extensions[0];
  if (suggestion && !NO_SUGGESTION.has(actual.kind) && !ext.includes(".") && ext !== "tar" && suggestion !== ext) {
    check.suggestedExtension = suggestion;
    check.suggestedName = `${splitName(withoutTrailing(name))[0]}.${suggestion}`;
  }
  return check;
}

/** Combines the name-only traps with the content verdict: the more serious one wins. Pure. */
export function composeCheck(name: string, actual: Sniffed | null): FileCheck | null {
  const content = actual ? judgeContent(name, actual) : null;
  if (content?.severity === "danger") return content;
  const trap = checkName(name);
  if (trap) {
    return {
      severity: "danger",
      code: trap.code,
      title: trap.title,
      detail: actual && actual.danger ? `${trap.detail} The contents are ${actual.label}.` : trap.detail,
      actual: actual ? brief(actual) : null,
      ...(trap.visibleName ? { visibleName: trap.visibleName } : {}),
    };
  }
  return content;
}

async function readSample(path: string): Promise<Uint8Array | null> {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);
  let handle: fsp.FileHandle | null = null;
  try {
    handle = await fsp.open(path, flags);
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

const PDF_JUNK = /%PDF-/;

/**
 * Checks one file on disk. Directories, special files and vanished files have nothing to say; a link or an
 * unreadable file is judged by its name alone. Never throws.
 */
export async function checkFile(path: string, name?: string): Promise<FileCheck | null> {
  try {
    const shown = name ?? nodePath.basename(path);
    let st: fs.Stats;
    try {
      st = await fsp.lstat(path);
    } catch (err: any) {
      // Only a file that is there but can't be looked at is judged by its name alone.
      return err?.code === "EACCES" || err?.code === "EPERM" ? composeCheck(shown, null) : null;
    }
    if (st.isDirectory() || (!st.isFile() && !st.isSymbolicLink())) return null;
    let actual: Sniffed | null = null;
    if (st.isFile() && st.size > 0) {
      const sample = await readSample(path);
      if (sample && sample.length > 0) {
        actual = sniffType(sample);
        // PDF readers accept some junk before the header; a "text" PDF that carries one is still a PDF.
        if (actual && actual.family === "text" && judgedExtension(shown) === "pdf" && PDF_JUNK.test(Buffer.from(sample).toString("latin1"))) actual = kindInfo("pdf") ?? actual;
      }
    }
    return composeCheck(shown, actual);
  } catch {
    return null;
  }
}

/** Opening a file that is dangerously not what its name says needs the person's say-so. */
export async function assertOpenAllowed(ctx: FmContext, path: string, confirmed: boolean): Promise<void> {
  if (confirmed) return;
  const check = await checkFile(path, pathApi(ctx).basename(path));
  if (check?.severity !== "danger") return;
  throw new FmError("TYPE_MISMATCH", `${check.detail} It needs your confirmation to open.`, { check });
}
