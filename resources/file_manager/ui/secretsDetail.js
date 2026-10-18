// The right side of the Secrets tab for one item: its non-secret fields as text, its secrets hidden behind Reveal and
// Copy, the notes, custom fields, attachments, password history and dates. Everything secret comes from the server one
// field at a time, only when asked, and is hidden again after a short time.
import { call } from "./api.js";
import { h } from "./dom.js";
import { confirmBox, promptBox } from "./dialogs.js";
import { renderMarkdown } from "./codePreview.js";
import { pickFolder } from "./findPicker.js";
import { toast } from "./menus.js";
import { clock } from "./secretsClock.js";
import { NOTES_MS, fieldRow, plainField, secretField, totpField } from "./secretsFields.js";
import { TYPE_ICONS, TYPE_NAMES } from "./secretsList.js";
import { errorText, fullPath, registerWiper } from "./secretsState.js";
import { emit, state } from "./state.js";
import { formatDate, formatSize, joinPath } from "./util.js";

const URL_FIELDS = new Set(["url", "endpoint"]);

/** The notes: hidden until asked for, shown as formatted text for a minute, then hidden again. */
function notesSection(id, length, scope) {
  const body = h("div", { class: "sx-notes sx-secret", "aria-label": "Notes" });
  const button = h("button", { type: "button", class: "btn sx-btn", "aria-pressed": "false", title: "Show the notes for a minute, then hide them again", onclick: () => (shown ? hide() : show()) }, `Show notes (${length.toLocaleString("en-US")} characters)`);
  let shown = false;
  let timer = 0;
  let ticket = 0;
  function hide() {
    ticket++;
    clock.clearTimeout(timer);
    shown = false;
    body.replaceChildren();
    button.setAttribute("aria-pressed", "false");
    button.textContent = `Show notes (${length.toLocaleString("en-US")} characters)`;
  }
  async function show() {
    const mine = ++ticket;
    try {
      const res = await call("secrets/reveal", { id, field: "notes" });
      if (mine !== ticket) return;
      renderMarkdown(body, res.value);
      for (const el of body.querySelectorAll("[title]")) el.removeAttribute("title"); // a link's address is not copied into an attribute
      shown = true;
      button.setAttribute("aria-pressed", "true");
      button.textContent = "Hide notes";
      timer = clock.setTimeout(hide, NOTES_MS);
    } catch (err) {
      toast(errorText(err, "Couldn't show the notes."), { kind: "error" });
    }
  }
  scope.add(registerWiper(hide));
  scope.add(hide);
  return h("section", { class: "sx-section", "aria-label": "Notes", "data-copy": "off" }, h("h3", {}, "Notes"), h("div", { class: "sx-row" }, button), body);
}

async function openAddress(id) {
  try {
    await call("secrets/open-url", { id });
  } catch (err) {
    toast(errorText(err, "Couldn't open that address."), { kind: "error" });
  }
}

function attachmentsSection(item) {
  const list = item.attachmentList.map((a) => h("li", { class: "sx-attach" },
    h("span", { class: "sx-value" }, `${a.name} (${formatSize(a.size)})`),
    h("button", { type: "button", class: "btn sx-btn", "aria-label": `Save ${a.name} to a folder`, title: "Save a copy of this file to a folder on your computer. The copy is not encrypted.", onclick: () => saveOut(item, a) }, "Save as…"),
    item.deletedAt === null ? h("button", { type: "button", class: "btn sx-btn", "aria-label": `Remove ${a.name}`, title: "Remove this attachment from the item", onclick: async () => { try { await call("secrets/remove-attachment", { id: item.id, attachmentId: a.id }); emit("secrets-select", item.id); } catch (err) { toast(errorText(err), { kind: "error" }); } } }, "Remove") : null));
  return h("section", { class: "sx-section", "aria-label": "Attachments", "data-copy": "off" }, h("h3", {}, "Attachments"),
    list.length ? h("ul", { class: "sx-plainlist" }, list) : h("p", { class: "sx-hint" }, "No files attached."),
    item.deletedAt === null ? h("button", { type: "button", class: "btn sx-btn", title: "Store a small file (up to 1 MB) inside the vault, encrypted with everything else", onclick: () => attach(item) }, "Attach a file…") : null);
}

async function saveOut(item, a) {
  const folder = await pickFolder({ title: `Save “${a.name}” to`, start: state.home });
  if (!folder) return;
  try {
    const res = await call("secrets/save-attachment", { id: item.id, attachmentId: a.id, path: joinPath(folder, a.name, state.sep) });
    toast(`Saved. This copy is not encrypted: ${res.path}`);
  } catch (err) {
    toast(errorText(err), { kind: "error" });
  }
}

async function attach(item) {
  const done = await promptBox({
    title: "Attach a file", label: "Location of the file (up to 1 MB), for example ~/Documents/recovery-codes.txt", confirmLabel: "Attach", hint: "The file is copied into the vault and stored encrypted. The original is not changed.",
    submit: (text) => call("secrets/attach", { id: item.id, path: fullPath(text, state.home) }),
  });
  if (done) emit("secrets-select", item.id);
}

/** Draws item `id` into `host`. Resolves with the item's details (without secrets), or null when it can't be shown. */
export async function renderDetail(host, id, scope) {
  let item;
  try {
    item = (await call("secrets/get", { id })).item;
  } catch (err) {
    host.replaceChildren(h("p", { class: "sx-empty" }, errorText(err, "Couldn't open that item.")));
    return null;
  }
  const trashed = item.deletedAt !== null;
  const star = h("button", { type: "button", class: "btn sx-btn sx-star", "aria-pressed": String(item.favorite), "aria-label": item.favorite ? "Remove from favorites" : "Add to favorites", title: "Mark this item as a favorite so it appears at the top of the list", disabled: trashed, onclick: async () => { try { await call("secrets/save", { id, item: { favorite: !item.favorite } }); emit("secrets-items"); emit("secrets-select", id); } catch (err) { toast(errorText(err), { kind: "error" }); } } }, item.favorite ? "★" : "☆");
  const actions = trashed
    ? [
      h("button", { type: "button", class: "btn", title: "Put this item back in your list", onclick: async () => { await call("secrets/restore", { id }); toast("Restored."); emit("secrets-items"); } }, "Restore"),
      h("button", { type: "button", class: "btn danger", title: "Delete this item for good. This can't be undone.", onclick: async () => { if (await confirmBox({ title: "Delete for good?", message: `“${item.title}” will be deleted permanently. This can't be undone.`, confirmLabel: "Delete for good", danger: true })) { await call("secrets/delete", { id, permanent: true, confirm: true }); emit("secrets-items"); } } }, "Delete for good"),
    ]
    : [
      h("button", { type: "button", class: "btn primary", title: "Change this item", onclick: () => emit("secrets-edit", { id }) }, "Edit"),
      h("button", { type: "button", class: "btn", title: "Make a copy of this item", onclick: async () => { try { const r = await call("secrets/duplicate", { id }); sx_select(r.item.id); } catch (err) { toast(errorText(err), { kind: "error" }); } } }, "Duplicate"),
      h("button", { type: "button", class: "btn danger", title: "Move this item to the Trash. You can restore it from there.", onclick: async () => { try { await call("secrets/delete", { id }); emit("secrets-items"); toast("Moved to the Trash.", { action: { label: "Undo", run: async () => { await call("secrets/restore", { id }); emit("secrets-items"); } } }); } catch (err) { toast(errorText(err), { kind: "error" }); } } }, "Move to Trash"),
    ];

  const rows = [];
  for (const spec of item.spec) {
    const has = item.present[spec.key];
    if (spec.key === "totp" && has) rows.push(totpField({ id, field: "totp", label: spec.label, scope }));
    else if (spec.secret && has) rows.push(secretField({ id, field: spec.key, label: spec.label, scope, multiline: spec.kind === "multiline" }));
    else if (!spec.secret && item.fields[spec.key]) {
      rows.push(plainField({ id, field: spec.key, label: spec.label, value: item.fields[spec.key], extra: URL_FIELDS.has(spec.key) ? [h("button", { type: "button", class: "btn sx-btn", title: "Open this address in your web browser (only http and https addresses)", onclick: () => openAddress(id) }, "Open")] : [] }));
    }
  }
  for (const c of item.custom) {
    if (!c.hasValue) continue;
    if (c.kind === "otp") rows.push(totpField({ id, field: `custom:${c.id}`, label: c.label, scope }));
    else if (c.kind === "hidden") rows.push(secretField({ id, field: `custom:${c.id}`, label: c.label, scope }));
    else rows.push(plainField({ id, field: `custom:${c.id}`, label: c.label, value: c.value }));
  }
  const history = item.history.map((hh, i) => secretField({ id, field: `history:${i}`, label: `Old password from ${formatDate(hh.at)}`, scope }));
  const dates = [["Created", item.createdAt], ["Last changed", item.modifiedAt], ...("password" in item.present ? [["Password changed", item.pwChangedAt]] : [])];

  host.replaceChildren(h("div", { class: "sx-detail-body" },
    h("div", { class: "sx-detail-head" },
      h("span", { class: "sx-ico sx-big", "aria-hidden": "true" }, TYPE_ICONS[item.type] ?? "🗂️"),
      h("div", { class: "sx-titlebox" }, h("h2", { class: "sx-title", tabindex: "-1", id: "sx-detail-title" }, item.title), h("p", { class: "sx-hint" }, [TYPE_NAMES[item.type], item.folder, trashed ? "In the Trash" : ""].filter(Boolean).join(" · "))),
      star, h("span", { class: "sx-actions" }, actions)),
    rows.length ? h("section", { class: "sx-section", "aria-label": "Details", "data-copy": "off" }, rows) : null,
    item.notesLength > 0 ? notesSection(id, item.notesLength, scope) : null,
    item.tags.length ? h("section", { class: "sx-section", "aria-label": "Tags", "data-copy": "off" }, h("h3", {}, "Tags"), h("p", { class: "sx-tags" }, item.tags.map((t) => h("span", { class: "sx-tag" }, t)))) : null,
    attachmentsSection(item),
    history.length ? h("section", { class: "sx-section", "aria-label": "Password history", "data-copy": "off" }, h("h3", {}, "Password history"), history) : null,
    h("section", { class: "sx-section sx-dates", "aria-label": "Dates", "data-copy": "off" }, dates.map(([label, ms]) => fieldRow(label, h("span", { class: "sx-value" }, formatDate(ms))))),
  ));
  return item;
}

function sx_select(id) {
  emit("secrets-items");
  emit("secrets-pick", id);
}
