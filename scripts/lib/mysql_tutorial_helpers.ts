import type { Do } from "./step_video";
import { STUDIO } from "./mysql_tutorial_env";

/** Marks the input of a column in the studio's open row form, so the next click can find it: click(STUDIO + "[data-vid=f]"). */
export async function tagField(d: Do, column: string) {
  const ok = await d.c.evalFrame("iframe ||| iframe", `(() => {
    document.querySelectorAll('[data-vid]').forEach((e) => e.removeAttribute('data-vid'));
    const label = [...document.querySelectorAll('.crud-label')].find((x) => x.firstChild && x.firstChild.textContent.trim() === ${JSON.stringify(column)});
    const input = label?.nextElementSibling?.querySelector('input[type=text], input:not([type]), select, textarea');
    if (!input) return false;
    input.setAttribute('data-vid', 'f');
    return true; })()`);
  if (!ok) throw new Error(`no field ${column} in the form`);
}

/** Runs a script inside the studio's own page. */
export const inStudio = <T = any>(d: Do, js: string): Promise<T | null> => d.c.evalFrame<T>("iframe ||| iframe", js);

/** Chooses an option of a <select> in the studio the way a person would (the value changes and the page is told). */
export async function choose(d: Do, selectCss: string, optionText: string) {
  const ok = await inStudio<boolean>(d, `(() => { const s = document.querySelector(${JSON.stringify(selectCss)}); const o = s && [...s.options].find((x) => x.textContent.includes(${JSON.stringify(optionText)}));
    if (!o) return false; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  if (!ok) throw new Error(`no option ${optionText} in ${selectCss}`);
}

export const S = STUDIO;

/** Presses a button of the studio's open dialog (not the page's own button of the same name). */
export async function dialogButton(d: Do, text: string) {
  const ok = await inStudio<boolean>(d, `(() => {
    document.querySelectorAll('[data-vid]').forEach((e) => e.removeAttribute('data-vid'));
    const b = [...document.querySelectorAll('button')].find((x) => x.closest('[class*=modal]') && x.textContent.trim().includes(${JSON.stringify(text)}) && !x.disabled && x.getBoundingClientRect().width > 0);
    if (!b) return false;
    b.setAttribute('data-vid', 'mb');
    return true; })()`);
  if (!ok) throw new Error(`no dialog button ${text}`);
  await d.click(S + "[data-vid=mb]", { pause: 1200 });
}

/** Chooses an option in the first visible <select> that offers it (for dialogs whose controls have no names). */
export async function chooseAnywhere(d: Do, optionText: string) {
  const ok = await inStudio<boolean>(d, `(() => {
    for (const s of document.querySelectorAll('select')) {
      if (s.getBoundingClientRect().width === 0) continue;
      const o = [...s.options].find((x) => x.textContent.trim() === ${JSON.stringify(optionText)});
      if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }
    }
    return false; })()`);
  if (!ok) throw new Error(`no select offers ${optionText}`);
}
