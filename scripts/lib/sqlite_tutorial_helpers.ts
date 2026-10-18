// Helpers for the SQLite tutorial's chapters: the File Manager's Databases tool, and the studio that runs inside it.
// The studio is a page in a frame (on the other loopback address), and inside that frame is the studio's own page,
// so its elements are reached with the recorder's `frame ||| frame ||| selector` syntax.
import type { Do } from "./step_video";

/** The frame the File Manager puts around the studio, and the studio's own page inside it. */
export const SF = ".db-studio-frame ||| iframe";
/** Prefix for a selector that lives inside the studio page. */
export const S = `${SF} ||| `;

export type D = Do;

/** Runs JavaScript inside the studio page. */
export const inStudio = <T = any>(d: D, expr: string): Promise<T | null> => d.c.evalFrame<T>(SF, expr);

/** Chooses an option of a <select> in the studio and tells the page, as a click on the option would. */
export const pick = (d: D, id: string, value: string) =>
  inStudio(d, `(() => { const s = document.getElementById(${JSON.stringify(id)}); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);

/** Gives the n-th visible text box of the open studio dialog a name the recorder can click, and returns whether it exists. */
export async function tagModalInput(d: D, n: number, tag: string, scope = "[class*=modal]"): Promise<boolean> {
  return !!(await inStudio<boolean>(d, `(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(scope + " input:not([type=checkbox]):not([type=radio]), " + scope + " textarea")})].filter((e) => e.offsetWidth > 0 && !e.disabled);
    const e = els[${n}]; if (!e) return false; e.setAttribute("data-tut", ${JSON.stringify(tag)}); return true; })()`));
}

/** Clicks into a text box of the studio, selects what is in it and types the new text. */
export async function fill(d: D, selector: string, text: string, perChar = 45) {
  await d.click(S + selector, { pause: 350 });
  await selectText(d, selector);
  await d.type(text, perChar);
}

/** Sets a studio element's value and fires the events a person typing would (for long text we don't want to watch being typed). */
export const setValue = (d: D, selector: string, value: string) =>
  inStudio(d, `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);

/** Dismisses the first-run welcome window of the File Manager (it is not what this video is about). */
export const skipWelcome = (d: D) => d.eval(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start')?.click()`);

/** Opens Find & more → Databases. */
export async function openDatabasesTool(d: D) {
  await d.click("#tool-power", { pause: 500 });
  await d.click("#power-tab-databases", { pause: 1200 });
}

/** Saves the connection the .env file offered, quickly and out of view, so a chapter can start with a saved connection. */
export async function saveFoundConnection(d: D) {
  await d.click("button >> Save to the manager", { pause: 900 });
  await d.click(".dialog button >> Done", { pause: 600 });
}

/** Starts the studio for the saved shop connection, closes its welcome box and (optionally) gives it the whole window. */
export async function startStudio(d: D, focus = true) {
  await d.click(".db-row >> shop.sqlite", { pause: 600 });
  await d.click("button >> Open in SQLite Studio", { pause: 500 });
  await d.waitFor(S + "#msgBoxBtnOk", 30000);
  await d.wait(500);
  await d.click(S + "#msgBoxBtnOk", { pause: 700 });
  if (focus) await d.click("#focus-toggle", { pause: 800 });
}

/** The prelude of every studio chapter: connection saved, studio running, customers open. */
export async function studioReady(d: D, table = "customers") {
  await skipWelcome(d);
  await d.wait(400);
  await openDatabasesTool(d);
  await saveFoundConnection(d);
  await startStudio(d);
  await d.click(S + `.tree-item-title >> ${table}`, { pause: 700 });
}

/** Selects all the text of a studio text box, so that what is typed next replaces it (real select-all keys do not reach the frame reliably). */
export const selectText = (d: D, selector: string) =>
  inStudio(d, `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); e.select(); })()`);

/** Selects all the text of whatever text box has the focus in the studio. */
export const selectActive = (d: D) => inStudio(d, `(() => { const e = document.activeElement; if (e && e.select) e.select(); })()`);

/** Gives the text box of one field of the open row form (New row, Edit row, Duplicate) a name the recorder can click. */
export async function tagField(d: D, field: string, tag: string): Promise<boolean> {
  return !!(await inStudio<boolean>(d, `(() => {
    const label = [...document.querySelectorAll('.crud-label')].find((l) => l.firstChild && l.firstChild.textContent.trim() === ${JSON.stringify(field)});
    const box = label && label.nextElementSibling && label.nextElementSibling.querySelector('input[type=text], input:not([type]), textarea');
    if (!box) return false; box.setAttribute('data-tut', ${JSON.stringify(tag)}); return true; })()`));
}

/** Gives the last visible button whose whole text is `text` a name the recorder can click (the topmost one: a dialog's own button). */
export async function tagButton(d: D, text: string, tag: string): Promise<boolean> {
  return !!(await inStudio<boolean>(d, `(() => {
    const b = [...document.querySelectorAll('button')].filter((x) => x.offsetWidth > 0 && x.textContent.trim() === ${JSON.stringify(text)}).pop();
    if (!b) return false; b.setAttribute('data-tut', ${JSON.stringify(tag)}); return true; })()`));
}

/** Gives the smallest visible element whose whole text is `text` (a chip, a tab, a label) a name the recorder can click. */
export async function tagText(d: D, text: string, tag: string, scope = "[class*=modal]"): Promise<boolean> {
  return !!(await inStudio<boolean>(d, `(() => {
    const all = [...document.querySelectorAll(${JSON.stringify(scope + " *")})].filter((x) => x.offsetWidth > 0 && x.textContent.trim() === ${JSON.stringify(text)});
    const e = all.find((x) => x.children.length === 0) || all[all.length - 1];
    if (!e) return false; e.setAttribute('data-tut', ${JSON.stringify(tag)}); return true; })()`));
}
