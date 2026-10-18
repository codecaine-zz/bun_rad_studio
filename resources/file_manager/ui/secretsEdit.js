// The form for a new or existing item. Secret values are loaded into the boxes only when you start editing, are masked
// by default, are re-masked on blur, tab change and lock, and are emptied when the form closes. They are never put in
// attributes (boxes are filled through their `value` property).
import { call } from "./api.js";
import { announce, h } from "./dom.js";
import { confirmBox } from "./dialogs.js";
import { renderMarkdown } from "./codePreview.js";
import { toast } from "./menus.js";
import { generatorPanel } from "./secretsGen.js";
import { TYPE_NAMES } from "./secretsList.js";
import { errorText, registerWiper } from "./secretsState.js";
import { strengthOf } from "./vaultStrength.js";

let typeSpecs = null;
let counter = 0;

async function specsFor(type) {
  typeSpecs ??= (await call("secrets/types")).types;
  return typeSpecs[type] ?? [];
}

const KINDS = [["text", "Text"], ["hidden", "Hidden text"], ["url", "Web address"], ["date", "Date"], ["otp", "One-time code secret"]];
const isSecretKind = (k) => k === "hidden" || k === "otp";

/**
 * Draws the form into `host`. `onDone(id)` is called after a save (with the item's id) and `onDone(null)` after Cancel.
 * @param {HTMLElement} host
 * @param {{ id?: string, type?: string, scope: { add: (fn: () => void) => void }, onDone: (id: string | null) => void }} options
 */
export async function renderEditor(host, { id, type, scope, onDone }) {
  host.replaceChildren(h("p", { class: "sx-hint", role: "status" }, "Opening…"));
  let item = null;
  if (id) {
    try {
      item = (await call("secrets/get", { id })).item;
    } catch (err) {
      host.replaceChildren(h("p", { class: "sx-empty" }, errorText(err)));
      return;
    }
  }
  const kind = item ? item.type : type;
  const spec = item ? item.spec : await specsFor(kind);
  const n = ++counter;
  const secretInputs = [];
  const allInputs = [];
  const gens = [];
  const baseline = {};

  async function value(field) {
    if (!item) return "";
    try {
      return (await call("secrets/reveal", { id, field })).value;
    } catch {
      return "";
    }
  }

  const input = (name, { secret = false, multiline = false, label, tip, initial = "", type: t = "text" }) => {
    const elId = `sx-f${n}-${name}`;
    const el = multiline ? h("textarea", { id: elId, rows: secret ? "4" : "3", class: `text-input sx-input${secret ? " sx-masked" : ""}`, spellcheck: "false", autocomplete: "off", autocapitalize: "off", autocorrect: "off", title: tip })
      : h("input", { id: elId, type: secret ? "password" : t, class: "text-input sx-input", autocomplete: "off", spellcheck: "false", autocapitalize: "off", autocorrect: "off", title: tip });
    el.value = initial;
    allInputs.push(el);
    if (secret) secretInputs.push(el);
    baseline[elId] = initial;
    return { el, id: elId, label: h("label", { for: elId, class: "sx-flabel" }, label) };
  };

  const secretToggle = (el) => h("button", { type: "button", class: "btn sx-btn", "aria-pressed": "false", title: "Show what you typed, or hide it again. Make sure nobody is looking at your screen.", onclick: (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", String(on));
    e.currentTarget.textContent = on ? "Hide" : "Show";
    if (el instanceof HTMLTextAreaElement) el.classList.toggle("sx-masked", !on);
    else el.type = on ? "text" : "password";
  } }, "Show");

  const title = input("title", { label: "Title", tip: "A name you will recognize, such as “Bank” or “Home Wi-Fi”", initial: item?.title ?? "" });
  const favorite = h("input", { type: "checkbox", id: `sx-f${n}-fav`, title: "Show this item at the top of the list" });
  favorite.checked = item?.favorite ?? false;
  const fieldRows = [];
  const fieldInputs = {};
  for (const s of spec) {
    const secret = s.secret;
    let initial = "";
    if (item) initial = secret ? (item.present[s.key] ? await value(s.key) : "") : item.fields[s.key] ?? "";
    const f = input(s.key, { secret, multiline: s.kind === "multiline", label: s.label, tip: secret ? `The ${s.label.toLowerCase()} is stored encrypted` : `The ${s.label.toLowerCase()}`, initial, type: s.kind === "date" ? "text" : s.kind === "url" ? "url" : "text" });
    fieldInputs[s.key] = f.el;
    const extra = [];
    if (secret) extra.push(secretToggle(f.el));
    const meterText = h("span", { class: "sx-hint", role: "status" }, "");
    if (s.kind === "password") {
      const slot = h("div", { class: "sx-genslot", hidden: true });
      const update = () => { const st = f.el.value ? strengthOf(f.el.value) : null; meterText.textContent = st ? `${st.label}${st.bits ? ` (about ${st.bits} bits)` : ""}` : ""; };
      f.el.addEventListener("input", update);
      update();
      extra.push(h("button", { type: "button", class: "btn sx-btn", "aria-expanded": "false", title: "Make a strong random password or passphrase for this field", onclick: (e) => {
        const open = slot.hidden;
        e.currentTarget.setAttribute("aria-expanded", String(open));
        slot.hidden = !open;
        slot.replaceChildren();
        if (open) {
          const gen = generatorPanel({ onUse: (v) => { f.el.value = v; update(); slot.hidden = true; slot.replaceChildren(); e.currentTarget.setAttribute("aria-expanded", "false"); announce("Password filled in."); f.el.focus(); }, onClose: () => { slot.hidden = true; slot.replaceChildren(); e.currentTarget.setAttribute("aria-expanded", "false"); } });
          gens.push(gen);
          slot.append(gen.el);
        }
      } }, "Generate"));
      fieldRows.push(h("div", { class: "sx-frow" }, f.label, h("div", { class: "sx-fctl" }, f.el, extra), meterText, slot));
    } else fieldRows.push(h("div", { class: "sx-frow" }, f.label, h("div", { class: "sx-fctl" }, f.el, extra)));
  }

  const notes = input("notes", { label: "Notes", tip: "Free text. Markdown works: **bold**, lists, links. Stored encrypted.", multiline: true, secret: true, initial: item && item.notesLength > 0 ? await value("notes") : "" });
  const preview = h("div", { class: "sx-notes sx-preview", hidden: true, "aria-label": "Preview of the notes" });
  const previewButton = h("button", { type: "button", class: "btn sx-btn", "aria-pressed": "false", title: "Show how the notes will look, with the formatting applied", onclick: (e) => {
    const on = preview.hidden;
    preview.hidden = !on;
    notes.el.hidden = on;
    e.currentTarget.setAttribute("aria-pressed", String(on));
    e.currentTarget.textContent = on ? "Edit notes" : "Preview";
    if (on) {
      renderMarkdown(preview, notes.el.value);
      for (const el of preview.querySelectorAll("[title]")) el.removeAttribute("title");
    } else preview.replaceChildren();
  } }, "Preview");
  notes.el.classList.remove("sx-masked");
  const notesToggle = secretToggle(notes.el);
  notesToggle.setAttribute("aria-pressed", "true");
  notesToggle.textContent = "Hide";

  const folder = input("folder", { label: "Folder", tip: "Optional. Use / for sub-folders, for example Work/Servers", initial: item?.folder ?? "" });
  const tags = input("tags", { label: "Tags", tip: "Optional words to find this by, separated by commas", initial: item ? item.tags.join(", ") : "" });

  // custom fields
  const customList = h("div", { class: "sx-custom" });
  const customRows = [];
  const addCustom = async (c = null) => {
    const labelIn = h("input", { type: "text", class: "text-input sx-input", "aria-label": "Field name", placeholder: "Name", title: "What this field is called", autocomplete: "off" });
    labelIn.value = c?.label ?? "";
    const kindSel = h("select", { class: "text-input", "aria-label": "Kind of field", title: "Hidden fields and one-time code secrets are masked and only shown when you ask" }, KINDS.map(([v, l]) => h("option", { value: v }, l)));
    kindSel.value = c?.kind ?? "text";
    const valIn = h("input", { type: isSecretKind(kindSel.value) ? "password" : "text", class: "text-input sx-input", "aria-label": "Field value", placeholder: "Value", autocomplete: "off", spellcheck: "false", title: "The value" });
    valIn.value = c ? (isSecretKind(c.kind) ? (c.hasValue ? await value(`custom:${c.id}`) : "") : c.value ?? "") : "";
    allInputs.push(labelIn, valIn);
    secretInputs.push(valIn);
    kindSel.addEventListener("change", () => { valIn.type = isSecretKind(kindSel.value) ? "password" : "text"; });
    const row = { id: c?.id, labelIn, kindSel, valIn };
    const el = h("div", { class: "sx-crow" }, labelIn, kindSel, valIn, h("button", { type: "button", class: "btn sx-btn", "aria-label": "Remove this field", title: "Remove this custom field", onclick: () => { customRows.splice(customRows.indexOf(row), 1); el.remove(); } }, "Remove"));
    customRows.push(row);
    customList.append(el);
  };
  for (const c of item?.custom ?? []) await addCustom(c);

  const error = h("p", { class: "dialog-error sx-error", role: "alert", hidden: true });
  const saveBtn = h("button", { type: "submit", class: "btn primary", title: "Save this item inside the encrypted vault" }, "Save");
  const dirty = () => allInputs.some((el) => baseline[el.id] !== undefined && baseline[el.id] !== el.value) || customRows.length !== (item?.custom.length ?? 0);

  async function cancel() {
    if (dirty() && !(await confirmBox({ title: "Discard your changes?", message: "What you typed hasn't been saved.", confirmLabel: "Discard", cancelLabel: "Keep editing", danger: true }))) return;
    onDone(null);
  }

  async function submit(e) {
    e.preventDefault();
    error.hidden = true;
    saveBtn.disabled = true;
    const fields = {};
    for (const s of spec) fields[s.key] = fieldInputs[s.key].value;
    const payload = {
      title: title.el.value, favorite: favorite.checked, folder: folder.el.value, tags: tags.el.value.split(",").map((t) => t.trim()).filter(Boolean),
      notes: notes.el.value, fields, custom: customRows.map((r) => ({ id: r.id, label: r.labelIn.value, kind: r.kindSel.value, value: r.valIn.value })),
      ...(item ? {} : { type: kind }),
    };
    try {
      const res = await call("secrets/save", { id, item: payload });
      toast("Saved.", { kind: "success" });
      onDone(res.item.id);
    } catch (err) {
      error.textContent = errorText(err);
      error.hidden = false;
      saveBtn.disabled = false;
    }
  }

  const form = h("form", { class: "sx-form", "aria-label": item ? `Edit ${TYPE_NAMES[kind]}` : `New ${TYPE_NAMES[kind]}`, autocomplete: "off", novalidate: true, onsubmit: submit, "data-copy": "off" },
    h("h2", { class: "sx-title", tabindex: "-1" }, item ? "Edit item" : `New ${TYPE_NAMES[kind].toLowerCase()}`),
    h("div", { class: "sx-frow" }, title.label, h("div", { class: "sx-fctl" }, title.el, h("label", { class: "sx-check", title: "Show this item at the top of the list" }, favorite, " Favorite"))),
    fieldRows,
    h("div", { class: "sx-frow" }, notes.label, h("div", { class: "sx-fctl sx-notesctl" }, notes.el, preview, previewButton, notesToggle)),
    h("div", { class: "sx-frow" }, folder.label, h("div", { class: "sx-fctl" }, folder.el)),
    h("div", { class: "sx-frow" }, tags.label, h("div", { class: "sx-fctl" }, tags.el)),
    h("fieldset", { class: "sx-fieldset" }, h("legend", {}, "More fields"), customList, h("button", { type: "button", class: "btn sx-btn", title: "Add a field of your own, such as a security question or a PIN", onclick: () => addCustom() }, "Add a field")),
    error,
    h("div", { class: "sx-row" }, saveBtn, h("button", { type: "button", class: "btn", title: "Close this form without saving", onclick: cancel }, "Cancel")));
  host.replaceChildren(form);
  title.el.focus();

  const mask = () => {
    for (const el of secretInputs) {
      if (el instanceof HTMLTextAreaElement) el.classList.add("sx-masked");
      else el.type = "password";
    }
    if (!preview.hidden) previewButton.click();
    for (const b of form.querySelectorAll('button[aria-pressed="true"]')) if (b.textContent === "Hide") { b.setAttribute("aria-pressed", "false"); b.textContent = "Show"; }
    for (const g of gens) g.forget();
  };
  scope.add(registerWiper(mask));
  scope.add(() => {
    for (const g of gens) g.destroy();
    for (const el of allInputs) el.value = "";
    preview.replaceChildren();
  });
}
