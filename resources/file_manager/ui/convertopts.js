// The "Options" step of the Convert & process window: the fields an action needs (quality, times, page ranges...),
// where the new files go, how they are named, and the preview of what will be made.
import { h } from "./dom.js";
import { modeText, optionApplies, previewLine, wantsSlider } from "./convertdata.js";

let counter = 0;
const nextId = () => `cv-field-${++counter}`;

/** One field for one option. Returns the element and a function that reads its value. */
function field(option, onChange) {
  const id = nextId();
  const hintId = `${id}-hint`;
  const hint = option.hint ? h("p", { class: "hint cv-hint-line", id: hintId }, option.hint) : null;
  const described = { ...(hint ? { "aria-describedby": hintId } : {}), title: option.hint || option.label };
  const changed = () => onChange();

  if (option.kind === "toggle") {
    const box = h("input", { type: "checkbox", id, checked: option.default === true, ...described, onchange: changed });
    return { el: h("div", { class: "cv-field" }, h("label", { class: "cv-check", for: id }, box, option.label), hint), read: () => box.checked };
  }
  if (option.kind === "choice") {
    const choices = option.choices ?? [];
    const firstOk = choices.find((c) => c.available)?.value ?? choices[0]?.value;
    const wanted = choices.find((c) => c.value === option.default && c.available) ? option.default : firstOk;
    const select = h("select", { id, ...described, onchange: changed },
      choices.map((c) => h("option", { value: c.value, disabled: !c.available, selected: c.value === wanted, title: c.available ? null : c.why }, c.available ? c.label : `${c.label} (not available)`)));
    return { el: h("div", { class: "cv-field" }, h("label", { for: id }, option.label), select, hint), read: () => select.value };
  }
  if (option.kind === "number") {
    const unit = option.unit ? h("span", { class: "cv-unit" }, option.unit) : null;
    const number = h("input", { type: "number", id, class: "cv-number", min: option.min, max: option.max, step: option.step ?? 1, value: option.default, ...described });
    const read = () => {
      const n = Number(number.value);
      return Number.isFinite(n) && number.value !== "" ? Math.min(option.max ?? n, Math.max(option.min ?? n, n)) : option.default;
    };
    let slider = null;
    if (wantsSlider(option)) {
      slider = h("input", { type: "range", class: "cv-range", min: option.min, max: option.max, step: option.step ?? 1, value: option.default, "aria-label": option.label, title: option.hint || option.label, oninput: () => { number.value = slider.value; changed(); } });
      number.addEventListener("input", () => { if (slider && number.value !== "") slider.value = number.value; });
    }
    number.addEventListener("change", () => { number.value = String(read()); if (slider) slider.value = number.value; changed(); });
    number.addEventListener("input", changed);
    return { el: h("div", { class: "cv-field" }, h("label", { for: id }, option.label), h("div", { class: "cv-row" }, slider, number, unit), hint), read };
  }
  const isTime = option.kind === "time";
  const isPages = option.kind === "pages";
  const input = h("input", {
    type: "text", id, class: "cv-text", value: option.default ?? "", autocomplete: "off", spellcheck: "false", maxlength: option.maxLength ?? (isTime ? 12 : 120),
    placeholder: isTime ? "0:00" : isPages ? "1-3,5" : null, inputmode: isTime ? "decimal" : null, ...described, oninput: changed,
  });
  return { el: h("div", { class: "cv-field" }, h("label", { for: id }, option.label), input, hint), read: () => input.value };
}

/**
 * The option fields of an action.
 * @param {any} action
 * @param {string[]} exts  extensions of the selected files (some options matter only for some kinds of file)
 * @param {() => void} onChange
 */
export function buildOptions(action, exts, onChange) {
  const fields = action.options.filter((o) => optionApplies(o, exts)).map((o) => ({ option: o, ...field(o, onChange) }));
  return {
    el: h("div", { class: "cv-options" }, fields.map((f) => f.el)),
    count: fields.length,
    read() {
      const out = {};
      for (const f of fields) out[f.option.id] = f.read();
      return out;
    },
  };
}

/** Where the new files go and what they are called. */
export function buildDestination(onChange) {
  const where = nextId();
  const naming = nextId();
  const same = h("input", { type: "radio", name: where, id: `${where}-same`, checked: true, title: "Put each new file in the same folder as the original", onchange: () => sync() });
  const other = h("input", { type: "radio", name: where, id: `${where}-other`, title: "Put the new files in a folder you choose", onchange: () => sync() });
  const folder = h("input", { type: "text", id: `${where}-folder`, class: "cv-text", disabled: true, placeholder: "/Users/you/Documents/Converted", autocomplete: "off", spellcheck: "false", "aria-label": "Folder for the new files", title: "The full path of a folder that already exists", oninput: () => onChange() });
  const auto = h("input", { type: "radio", name: naming, id: `${naming}-auto`, checked: true, title: "Keep the old name and add the new file type", onchange: () => sync() });
  const custom = h("input", { type: "radio", name: naming, id: `${naming}-custom`, title: "Choose how the new files are named", onchange: () => sync() });
  const pattern = h("input", { type: "text", id: `${naming}-pattern`, class: "cv-text", disabled: true, placeholder: "{name} (small)", maxlength: 120, autocomplete: "off", spellcheck: "false", "aria-label": "Name pattern", title: "Use {name} for the old name, {n} for a number, {date} for today's date", oninput: () => onChange() });
  function sync() {
    folder.disabled = !other.checked;
    pattern.disabled = !custom.checked;
    onChange();
  }
  const el = h("fieldset", { class: "cv-dest" },
    h("legend", {}, "Where do the new files go, and what are they called?"),
    h("div", { class: "cv-choice" }, same, h("label", { for: `${where}-same` }, "Next to the originals (recommended)")),
    h("div", { class: "cv-choice" }, other, h("label", { for: `${where}-other` }, "In this folder:"), folder),
    h("div", { class: "cv-choice" }, auto, h("label", { for: `${naming}-auto` }, "Name them automatically")),
    h("div", { class: "cv-choice" }, custom, h("label", { for: `${naming}-custom` }, "Name them like this:"), pattern),
    h("p", { class: "hint" }, "In a name, {name} is the old name, {n} a number and {date} today's date. The file type is added for you. Nothing is ever replaced: a name that is taken gets (2), (3) and so on."),
  );
  return {
    el,
    read: () => ({ outputDir: other.checked && folder.value.trim() ? folder.value.trim() : undefined, pattern: custom.checked && pattern.value.trim() ? pattern.value.trim() : undefined }),
  };
}

/**
 * Shows the preview of what will be made.
 * @param {HTMLElement} box
 * @param {{ state: "loading" | "error" | "ready", message?: string, data?: any }} s
 */
export function renderPreview(box, s) {
  if (s.state === "loading") return box.replaceChildren(h("p", { class: "hint" }, "Checking what will be made…"));
  if (s.state === "error") return box.replaceChildren(h("p", { class: "cv-problem", role: "alert" }, s.message));
  const { items, skipped } = s.data;
  const shown = items.slice(0, 12);
  const list = h("ul", { class: "cv-preview-list" }, shown.map((it) => h("li", { class: it.problem ? "cv-preview-bad" : "" },
    h("span", { class: "cv-preview-name" }, previewLine(it)),
    it.problem ? h("span", { class: "cv-preview-why" }, ` — can't be done: ${it.problem}`) : h("span", { class: "cv-preview-engine" }, ` (${it.engine})`))));
  const where = [...new Set(items.map((it) => it.folder))];
  return box.replaceChildren(...[
    h("p", { class: "cv-preview-title" }, s.data.mode === "all" ? "One new item will be made:" : `${items.length === 1 ? "This" : `These ${items.length}`} new ${s.data.outKind === "folder" ? "folders" : "files"} will be made:`),
    list,
    items.length > shown.length ? h("p", { class: "hint" }, `…and ${items.length - shown.length} more.`) : null,
    where.length === 1 ? h("p", { class: "hint" }, `In: ${where[0]}`) : h("p", { class: "hint" }, "Each one goes next to its original."),
    skipped ? h("p", { class: "hint" }, `${skipped} selected ${skipped === 1 ? "item doesn't" : "items don't"} fit this action and will be left alone.`) : null,
  ].filter(Boolean));
}

/** The sentence under the title of the options step. */
export function optionsIntro(action, selectedCount) {
  return `${modeText(action, selectedCount)} The originals are never changed.`;
}
