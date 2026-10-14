/** "Imports and exports" of a JavaScript or TypeScript file for the "More info" window, found with Bun's own parser. */
import { Rows, type InfoGroup } from "./fmInfoCommon";
import { CODE_EXTENSIONS, TranspileError, scanModule } from "./fmJsTranspile";

const SHOWN = 30;

const KIND_LABEL: Record<string, string> = {
  "import-statement": "Imports",
  "dynamic-import": "Loaded later with import()",
  "require-call": "Loaded with require()",
};

const list = (items: string[]) => (items.length > SHOWN ? `${items.slice(0, SHOWN).join(", ")} … and ${items.length - SHOWN} more` : items.join(", "));

/** True for the file types this reads. */
export const hasCodeScan = (ext: string): boolean => CODE_EXTENSIONS.has(ext.toLowerCase());

/**
 * The group of rows for a code file (none for other file types). `complete` is false when only the first part of a
 * large file was read: the scan would be misleading, so it says so instead.
 */
export function codeGroups(text: string, ext: string, complete: boolean): InfoGroup[] {
  if (!hasCodeScan(ext)) return [];
  const r = new Rows();
  if (!complete) {
    r.add("Imports and exports", "Not checked: the file is larger than the 4 MB sample");
  } else {
    try {
      const scan = scanModule(text.replace(/^\uFEFF/, ""), ext);
      const byKind = new Map<string, string[]>();
      for (const i of scan.imports) {
        const paths = byKind.get(i.kind) ?? [];
        paths.push(i.path);
        byKind.set(i.kind, paths);
      }
      for (const [kind, paths] of byKind) r.add(KIND_LABEL[kind] ?? "Other references", `${paths.length} — ${list(paths)}`, "The other modules and files this file pulls in.");
      const named = scan.exports.filter((e) => e !== "default");
      if (scan.exports.includes("default")) r.add("Default export", "Yes", "What other files get when they import this file without braces.");
      if (named.length) r.add("Exports", `${named.length} — ${list(named)}`, "The names other files can import from this file.");
      if (!scan.imports.length && !scan.exports.length) r.add("Imports and exports", "None found: this file doesn't import or export anything, so it runs as a plain script.", "A plain script shares one global space with the other scripts on the page.");
    } catch (err) {
      if (!(err instanceof TranspileError)) throw err;
      r.add("Syntax check", err.message.replace(/^The code has a mistake, so it can't be converted\. /, "Mistake found: "), "The parser couldn't read the file, so the imports and exports aren't listed.", "warn");
    }
  }
  const g = r.group("modules", "Imports and exports", "What this code file loads and offers to other files (read with Bun's own parser; the file is not run).");
  return g ? [g] : [];
}
