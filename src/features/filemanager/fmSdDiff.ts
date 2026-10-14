/**
 * Unified diffs for the Replace tool: a line-by-line comparison (Myers' algorithm) of the text before and after,
 * written the way `diff -u` writes it, with a limit on how much is kept so one huge file can't fill the memory.
 */

type Kind = " " | "-" | "+";
interface Op {
  k: Kind;
  s: string;
}

export interface UnifiedDiff {
  text: string;
  hunks: number;
  added: number;
  removed: number;
  truncated: boolean;
}

export const DIFF_CONTEXT = 3;
/** Past this many differing lines in one stretch the comparison gives up on pairing lines and shows the stretch as replaced. */
const MAX_EDIT_DISTANCE = 1500;

export function splitLines(text: string): string[] {
  const parts = text.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** The shortest edit script from `a` to `b`, or null when it needs more than `maxD` edits. */
function myers(a: string[], b: string[], maxD: number): Op[] | null {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((s) => ({ k: "+", s }));
  if (m === 0) return a.map((s) => ({ k: "-", s }));
  const max = Math.min(n + m, maxD);
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found < 0; d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const i = k + off;
      let x = k === -d || (k !== d && v[i - 1]! < v[i + 1]!) ? v[i + 1]! : v[i - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[i] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found < 0) return null;

  const out: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const snap = trace[d]!;
    const at = (k: number) => snap[k + d + 1]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push({ k: " ", s: a[x - 1]! });
      x--;
      y--;
    }
    if (x === prevX) out.push({ k: "+", s: b[prevY]! });
    else out.push({ k: "-", s: a[prevX]! });
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    out.push({ k: " ", s: a[x - 1]! });
    x--;
    y--;
  }
  return out.reverse();
}

export function editScript(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const middle = myers(midA, midB, MAX_EDIT_DISTANCE) ?? [...midA.map((s): Op => ({ k: "-", s })), ...midB.map((s): Op => ({ k: "+", s }))];
  return [...a.slice(0, start).map((s): Op => ({ k: " ", s })), ...middle, ...a.slice(endA).map((s): Op => ({ k: " ", s }))];
}

/** A carriage return would be invisible, so a line that ends in one shows "␍" instead. */
const show = (s: string) => (s.endsWith("\r") ? `${s.slice(0, -1)}␍` : s);

export function unifiedDiff(path: string, before: string, after: string, limits: { maxLines: number; maxChars: number }): UnifiedDiff {
  const ops = editScript(splitLines(before), splitLines(after));
  let added = 0;
  let removed = 0;
  const oldBefore = new Int32Array(ops.length + 1);
  const newBefore = new Int32Array(ops.length + 1);
  const changes: number[] = [];
  ops.forEach((op, i) => {
    oldBefore[i + 1] = oldBefore[i]! + (op.k === "+" ? 0 : 1);
    newBefore[i + 1] = newBefore[i]! + (op.k === "-" ? 0 : 1);
    if (op.k === "+") added++;
    else if (op.k === "-") removed++;
    if (op.k !== " ") changes.push(i);
  });

  const lines: string[] = [`--- ${path}`, `+++ ${path}`];
  if (changes.length === 0) {
    lines.push("\\ Only the line break at the end of the file changed.");
    return { text: lines.join("\n"), hunks: 0, added, removed, truncated: false };
  }
  const groups: Array<[number, number]> = [];
  for (let g = 0; g < changes.length; g++) {
    const from = Math.max(0, changes[g]! - DIFF_CONTEXT);
    let last = changes[g]!;
    while (g + 1 < changes.length && changes[g + 1]! - last <= 2 * DIFF_CONTEXT) last = changes[++g]!;
    groups.push([from, Math.min(ops.length, last + DIFF_CONTEXT + 1)]);
  }

  let chars = lines[0]!.length + lines[1]!.length;
  let truncated = false;
  for (const [from, to] of groups) {
    const oldCount = oldBefore[to]! - oldBefore[from]!;
    const newCount = newBefore[to]! - newBefore[from]!;
    const oldStart = oldCount === 0 ? oldBefore[from]! : oldBefore[from]! + 1;
    const newStart = newCount === 0 ? newBefore[from]! : newBefore[from]! + 1;
    const rows = [`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...ops.slice(from, to).map((op) => `${op.k}${show(op.s)}`)];
    for (const row of rows) {
      if (lines.length >= limits.maxLines || chars + row.length + 1 > limits.maxChars) {
        truncated = true;
        break;
      }
      lines.push(row);
      chars += row.length + 1;
    }
    if (truncated) break;
  }
  if (truncated) lines.push("… This is only the start of the changes: the rest is too long to show here.");
  return { text: lines.join("\n"), hunks: groups.length, added, removed, truncated };
}
