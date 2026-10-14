// The pictures of code completion: the suggestion list that drops down under the caret and the little signature
// tip above it. They only draw what they're told to; codeAssist.js decides what to show.
import { h } from "./dom.js";

const GLYPH = { function: "ƒ", method: "ƒ", member: "•", field: "•", variable: "x", local: "x", class: "C", type: "T", snippet: "✂", keyword: "k", builtin: "b", symbol: "s", other: "·", word: "a" };
const KIND_NAMES = { function: "function", method: "method", member: "member", field: "field", variable: "variable", local: "local name", class: "class", type: "type", snippet: "snippet", keyword: "keyword", builtin: "built-in", symbol: "name in this file", other: "name", word: "word in your files" };

/** Puts `el` next to a caret rectangle inside `box`: under it (or over it when there is no room under it). */
function place(el, box, rect, preferBelow = true) {
  const width = el.offsetWidth || 260;
  const height = el.offsetHeight || 120;
  const left = Math.max(4, Math.min(rect.x, (box.clientWidth || 600) - width - 8));
  const fitsBelow = rect.y + rect.h + 2 + height <= (box.clientHeight || 400);
  const fitsAbove = rect.y - 2 - height >= 0;
  const below = preferBelow ? fitsBelow || !fitsAbove : !fitsAbove;
  el.style.left = `${left}px`;
  el.style.top = `${below ? rect.y + rect.h + 2 : rect.y - height - 2}px`;
}

export function createPopup(box, ta, id) {
  const list = h("div", { class: "code-ac", role: "listbox", id, "aria-label": "Suggestions. Use the up and down arrows, then Enter or Tab.", hidden: true });
  const tip = h("div", { class: "code-sig", role: "status", hidden: true });
  box.append(list, tip);
  let items = [];
  let selected = 0;

  function paint() {
    list.replaceChildren(...items.map((it, i) => h("div", {
      role: "option", id: `${id}-${i}`, class: `code-ac-item${i === selected ? " code-ac-sel" : ""}`, "aria-selected": String(i === selected), title: `${KIND_NAMES[it.kind] ?? it.kind}${it.detail ? `: ${it.detail}` : ""}`,
      dataset: { index: String(i) },
    }, h("span", { class: `code-ac-kind code-ac-k-${it.kind}`, "aria-hidden": "true" }, GLYPH[it.kind] ?? "·"), h("span", { class: "code-ac-label" }, it.label), it.detail ? h("span", { class: "code-ac-detail" }, it.detail) : null)));
    ta.setAttribute("aria-activedescendant", `${id}-${selected}`);
    list.children[selected]?.scrollIntoView?.({ block: "nearest" });
  }

  return {
    el: list,
    get visible() { return !list.hidden; },
    get selected() { return selected; },
    get items() { return items; },
    /** Draws the list (keeping the highlighted row where it was when `keep` is true). */
    show(next, rect, { keep = false, onPick } = {}) {
      items = next;
      selected = keep ? Math.min(selected, items.length - 1) : 0;
      list.onmousedown = (e) => e.preventDefault();
      list.onclick = (e) => {
        const row = e.target.closest?.("[role=option]");
        if (row) onPick?.(Number(row.dataset.index));
      };
      list.hidden = false;
      paint();
      place(list, box, rect);
      ta.setAttribute("aria-expanded", "true");
      ta.setAttribute("aria-controls", id);
    },
    move(step) {
      if (!items.length) return;
      selected = (selected + step + items.length) % items.length;
      paint();
    },
    jump(to) {
      selected = Math.max(0, Math.min(items.length - 1, to));
      paint();
    },
    hide() {
      if (list.hidden) return;
      list.hidden = true;
      items = [];
      ta.setAttribute("aria-expanded", "false");
      ta.removeAttribute("aria-activedescendant");
    },
    /** The signature tip: `sig` is { name, params: string[], active, detail } or null to hide it. */
    showSignature(sig, rect) {
      if (!sig) {
        tip.hidden = true;
        return;
      }
      tip.replaceChildren(h("strong", {}, sig.name), "(", ...sig.params.flatMap((p, i) => [i ? ", " : "", h("span", { class: i === sig.active ? "code-sig-on" : "" }, p)]), ")", sig.detail ? h("span", { class: "code-sig-detail" }, ` · ${sig.detail}`) : null);
      tip.hidden = false;
      place(tip, box, rect, false);
    },
    hideSignature() {
      tip.hidden = true;
    },
    destroy() {
      list.remove();
      tip.remove();
    },
  };
}
