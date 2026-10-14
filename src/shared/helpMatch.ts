/** The pure part of the help tooltips: which tip belongs to an element. See `helpTips.ts` for the overview and key formats. */
export type HelpTips = Record<string, string>;

/** What the matcher needs to know about one element. */
export interface ElementInfo {
  tag: string;
  id: string;
  classes: string[];
  text: string;
  placeholder: string;
  aria: string;
  name: string;
  title: string;
  type: string;
  role: string;
}

/** The elements that get a tooltip. */
export const INTERACTIVE_SELECTOR = "button, .tab-btn, input:not([type=hidden]), select, textarea, a[href], summary, [role=button], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [role=radio], [role=option]";

/** Lower case, no leading icons or emoji, one space between words. */
export function normalizeLabel(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9)\]'"?!]+$/, "")
    .trim()
    .toLowerCase();
}

/** The tip for an element from a dictionary, or null. */
export function matchTip(info: ElementInfo, tips: Record<string, string>, normalize: (s: string) => string): string | null {
  if (info.id && tips["#" + info.id]) return tips["#" + info.id]!;
  const norm: Record<string, string> = {};
  const starts: Array<[string, string]> = [];
  for (const key of Object.keys(tips)) {
    if (key.startsWith("aria:")) norm["a" + normalize(key.slice(5))] = tips[key]!;
    else if (key.startsWith("text^:")) starts.push([normalize(key.slice(6)), tips[key]!]);
    else if (key.startsWith("text:")) norm["t" + normalize(key.slice(5))] = tips[key]!;
    else if (key.startsWith("ph:")) norm["p" + normalize(key.slice(3))] = tips[key]!;
    else if (key.startsWith("name:")) norm["n" + key.slice(5)] = tips[key]!;
  }
  const aria = normalize(info.aria);
  if (aria && norm["a" + aria]) return norm["a" + aria]!;
  const text = normalize(info.text);
  if (text && norm["t" + text]) return norm["t" + text]!;
  if (text) for (const [start, tip] of starts) if (text.startsWith(start)) return tip;
  const ph = normalize(info.placeholder);
  if (ph && norm["p" + ph]) return norm["p" + ph]!;
  if (info.name && norm["n" + info.name]) return norm["n" + info.name]!;
  for (const c of info.classes) if (tips["." + c]) return tips["." + c]!;
  return null;
}


/** A control that needs no tip (digits on a calculator, say). `why` is required so skips stay honest. */
export interface SkipRule {
  id?: string;
  idPrefix?: string;
  text?: string;
  class?: string;
  /** Matches an element whose type attribute is this (for example "range"). */
  type?: string;
  why: string;
}

export function isSkipped(info: ElementInfo, rules: SkipRule[], normalize: (s: string) => string): boolean {
  return rules.some((r) =>
    (r.id !== undefined && info.id === r.id) ||
    (r.idPrefix !== undefined && info.id.startsWith(r.idPrefix)) ||
    (r.text !== undefined && normalize(info.text) === normalize(r.text)) ||
    (r.class !== undefined && info.classes.includes(r.class)) ||
    (r.type !== undefined && info.type === r.type));
}
