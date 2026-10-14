// The arithmetic behind the permissions section, with no page in it: showing a mode as digits and letters, reading
// digits, what each preset does, and working out the change to send from what the person ticked. The server does
// the same sums again before it changes anything; this only drives what the boxes show.

export const R = 4;
export const W = 2;
export const X = 1;
export const SETUID = 0o4000;
export const SETGID = 0o2000;
export const STICKY = 0o1000;
export const MODE_MASK = 0o7777;

/** The three rows of the grid: who, and the bit of each permission. */
export const CLASSES = [
  { id: "owner", label: "Owner", shift: 6, who: "the owner" },
  { id: "group", label: "Group", shift: 3, who: "people in the file's group" },
  { id: "others", label: "Others", shift: 0, who: "everyone else" },
];

export const PERMISSIONS = [
  { id: "read", label: "Read", bit: R },
  { id: "write", label: "Write", bit: W },
  { id: "run", label: "Run", bit: X },
];

/** Every bit the boxes control, in the order they are shown. */
export const ALL_BITS = [
  ...CLASSES.flatMap((c) => PERMISSIONS.map((p) => p.bit << c.shift)),
  SETUID,
  SETGID,
  STICKY,
];

export function octalOf(mode) {
  const m = mode & MODE_MASK;
  return m > 0o777 ? m.toString(8).padStart(4, "0") : m.toString(8).padStart(3, "0");
}

/** "rw-r--r--", with s/S/t/T for the special bits (the same text as the More info panel). */
export function symbolicOf(mode) {
  const m = mode & MODE_MASK;
  let s = "";
  for (let i = 0; i < 9; i++) s += m & (0o400 >> i) ? "rwx"[i % 3] : "-";
  if (m & SETUID) s = s.slice(0, 2) + (s[2] === "x" ? "s" : "S") + s.slice(3);
  if (m & SETGID) s = s.slice(0, 5) + (s[5] === "x" ? "s" : "S") + s.slice(6);
  if (m & STICKY) s = s.slice(0, 8) + (s[8] === "x" ? "t" : "T");
  return s;
}

/** "644", "0644" or "4755" as a number; null for anything else. */
export function parseOctal(text) {
  const t = String(text ?? "").trim();
  return /^[0-7]{3,4}$/.test(t) ? Number.parseInt(t, 8) : null;
}

/** The name of a bit for a screen reader: "Owner can read". */
export function bitName(bit) {
  if (bit === SETUID) return "Run as the owner (setuid)";
  if (bit === SETGID) return "Run as the group, or new files join the folder's group (setgid)";
  if (bit === STICKY) return "Only owners can delete inside (sticky)";
  for (const c of CLASSES) for (const p of PERMISSIONS) if (p.bit << c.shift === bit) return `${c.label} can ${p.label.toLowerCase()}`;
  return "";
}

// ---------------------------------------------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------------------------------------------

const readAll = (mode, isDir) => mode | 0o444 | (isDir || mode & 0o111 ? 0o111 : 0);

/**
 * The presets. `file` and `dir` are the exact modes (null: leave that kind alone); `change` is what is sent for them,
 * `filesOnly` presets leave folders alone, and `after` shows what one item becomes.
 */
export const PRESETS = [
  { id: "private", label: "Private", tip: "Only you can use it: files 600, folders 700.", file: 0o600, dir: 0o700 },
  { id: "normal", label: "Normal", tip: "You can change it, everyone else can only read it: files 644, folders 755.", file: 0o644, dir: 0o755 },
  { id: "group", label: "Shared with my group", tip: "You and your group can change it, everyone else can only read it: files 664, folders 775.", file: 0o664, dir: 0o775 },
  { id: "readonly", label: "Read-only", tip: "Nobody can change it: files 444, folders 555. You can undo this.", file: 0o444, dir: 0o555 },
  { id: "exec", label: "Make executable (+x)", tip: "Lets the file run as a program or script. Folders are left alone.", change: { symbolic: "a+x" }, filesOnly: true, after: (m, d) => (d ? m : m | 0o111) },
  { id: "noexec", label: "Remove execute (−x)", tip: "Stops the file running as a program. Folders are left alone, because a folder needs it to be opened.", change: { symbolic: "a-x" }, filesOnly: true, after: (m, d) => (d ? m : m & ~0o111) },
  { id: "readall", label: "Everyone can read", tip: "Adds read for everyone. Folders and files that already run also get the right to open or run.", change: { symbolic: "a+rX" }, after: readAll },
];

/** What a preset makes of one item. */
export function presetAfter(preset, mode, isDir) {
  if (preset.after) return preset.after(mode, isDir);
  const target = isDir ? preset.dir : preset.file;
  return target === null || target === undefined ? mode : target;
}

/** The request body part for a preset. */
export function presetChange(preset) {
  if (preset.change) return { ...preset.change };
  return { set: { file: preset.file, dir: preset.dir } };
}

// ---------------------------------------------------------------------------------------------------------------
// Tri-state bits
// ---------------------------------------------------------------------------------------------------------------

/** For one bit across several modes: "on" when all have it, "off" when none, "mixed" otherwise. */
export function bitState(modes, bit) {
  let on = 0;
  for (const m of modes) if (m & bit) on++;
  return on === 0 ? "off" : on === modes.length ? "on" : "mixed";
}

export function statesOf(modes) {
  return Object.fromEntries(ALL_BITS.map((bit) => [bit, modes.length ? bitState(modes, bit) : "off"]));
}

/** The mode all items would have, or null when some bit differs between items. */
export function commonMode(states) {
  let mode = 0;
  for (const bit of ALL_BITS) {
    if (states[bit] === "mixed") return null;
    if (states[bit] === "on") mode |= bit;
  }
  return mode;
}

/** The rwx text for the grid, with a question mark for a position that differs between items. */
export function statesSymbolic(states) {
  const letters = "rwx";
  let s = "";
  for (let i = 0; i < 9; i++) {
    const bit = 0o400 >> i;
    s += states[bit] === "mixed" ? "?" : states[bit] === "on" ? letters[i % 3] : "-";
  }
  const special = (bit, at, lower, upper) => {
    if (states[bit] === "off") return;
    const x = s[at];
    const ch = states[bit] === "mixed" ? "?" : x === "x" ? lower : upper;
    s = s.slice(0, at) + ch + s.slice(at + 1);
  };
  special(SETUID, 2, "s", "S");
  special(SETGID, 5, "s", "S");
  special(STICKY, 8, "t", "T");
  return s;
}

/**
 * The change to send for what the person did. `initial` and `desired` map each bit to "on", "off" or "mixed".
 * Only bits that differ from the start are sent: a bit turned on is added, one turned off is removed.
 * Returns null when nothing differs.
 */
export function bitsChange(initial, desired) {
  let add = 0;
  let remove = 0;
  for (const bit of ALL_BITS) {
    if (desired[bit] === initial[bit] || desired[bit] === "mixed") continue;
    if (desired[bit] === "on") add |= bit;
    else remove |= bit;
  }
  return add || remove ? { ...(add ? { add } : {}), ...(remove ? { remove } : {}) } : null;
}
