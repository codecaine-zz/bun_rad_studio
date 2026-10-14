// The "Decrypt…" dialog: shows what a .radenc file is (without needing the password), then unlocks it.
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { announce, h } from "./dom.js";
import { goTo, refresh } from "./nav.js";
import { state } from "./state.js";
import { formatSize, parentOf } from "./util.js";
import { passwordFields } from "./vaultForm.js";
import { resultList, runView, summaryText } from "./vaultRun.js";

let counter = 0;
const LEVEL_WORDS = { standard: "Standard", maximum: "Maximum", custom: "Custom" };

/** A friendly sentence about what `vault/inspect` found. */
export function describeInspect(info) {
  if (!info.valid) {
    if (info.reason === "not-radenc") return "This isn't a RADENC encrypted file, so it can't be unlocked here. (Files locked by this app end in .radenc.)";
    if (info.reason === "folder") return "This is a folder. Only .radenc files can be unlocked.";
    if (info.reason === "unsupported") return "This file was made by a newer or different program, so this version can't open it.";
    return "This file asks for settings that aren't safe to use, so it was refused.";
  }
  const level = LEVEL_WORDS[info.level] ?? "Custom";
  return `A RADENC encrypted file. Lock strength: ${level}. ${info.compressed ? "Compressed." : "Not compressed."} Size: ${formatSize(info.size)}.`;
}

/**
 * @param {Array<{ path: string, name: string, isDir?: boolean }>} entries
 */
export function openDecryptDialog(entries) {
  let run = null;
  let running = false;
  let taskId = "";
  const valid = new Set();
  const fields = passwordFields({ confirm: false });

  const details = new Map();
  const infoList = h("ul", { class: "vault-items", "aria-label": "The files to unlock" }, entries.map((e) => {
    const detail = h("span", { class: "vault-item-detail" }, "Looking inside…");
    details.set(e.path, detail);
    return h("li", {}, h("span", { class: "vault-item-name" }, `🔒 ${e.name}`), detail);
  }));
  const folder = h("input", { type: "text", class: "text-input", id: `vault-dout-${++counter}`, placeholder: "Next to the locked file", autocomplete: "off", spellcheck: "false", title: "Where to put the unlocked files. Leave empty to put each one next to its locked file. Type or paste a full folder path." });
  const trashId = `vault-dtrash-${++counter}`;
  const trashTitle = "After a successful unlock, the .radenc file goes to the Recycle Bin. Off by default.";
  const trash = h("input", { type: "checkbox", id: trashId, title: trashTitle });
  const go = h("button", { type: "button", class: "btn primary vault-go", title: "Unlock now. The locked file itself is never changed.", disabled: true, onclick: submit }, "Decrypt");

  const form = h("div", { class: "vault-form" },
    h("h3", {}, entries.length === 1 ? "What this file is" : `What these files are (${entries.length})`),
    infoList,
    h("h3", {}, "Enter the password"),
    fields.el,
    h("label", { class: "field", for: folder.id }, h("span", { class: "field-label" }, "Save the unlocked files in")),
    folder,
    h("div", { class: "vault-option" }, h("label", { for: trashId, title: trashTitle }, trash, " Move the locked file to the Recycle Bin after unlocking it")),
    h("p", { class: "vault-hint" }, "Unlocked items get their original names. If a name is taken, a number is added; nothing is ever replaced."),
    h("div", { class: "dialog-buttons" }, h("button", { type: "button", class: "btn", title: "Close this window without unlocking anything.", onclick: () => dlg.close(null) }, "Cancel"), go),
  );
  const root = h("div", { class: "vault-dialog" }, form);
  const dlg = openDialog({ title: entries.length === 1 ? `Decrypt “${entries[0].name}”` : `Decrypt ${entries.length} files`, body: root, buttons: [], wide: true, initialFocus: fields.first });

  (async () => {
    for (const e of entries) {
      const row = details.get(e.path);
      try {
        const info = await call("vault/inspect", { path: e.path });
        if (info.valid) valid.add(e.path);
        row.textContent = describeInspect(info);
        row.classList.toggle("vault-bad", !info.valid);
      } catch (err) {
        row.textContent = err instanceof ApiError ? err.message : "Couldn't look at this file.";
        row.classList.add("vault-bad");
      }
    }
    go.disabled = valid.size === 0;
    if (valid.size === 0) dlg.setError(entries.length === 1 ? "This file can't be unlocked." : "None of these files can be unlocked.");
  })();

  for (const input of [fields.first, folder]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!go.disabled) submit();
      }
    });
  }

  async function submit() {
    dlg.setError("");
    const problem = fields.problem();
    if (problem) {
      dlg.setError(problem);
      fields.focus();
      return;
    }
    go.disabled = true;
    try {
      const res = await call("vault/decrypt", {
        paths: entries.filter((e) => valid.has(e.path)).map((e) => e.path),
        password: fields.password(),
        outputDir: folder.value.trim() || undefined,
        afterwards: trash.checked ? "trash" : "keep",
      });
      fields.clear();
      taskId = res.task.id;
      running = true;
      run = runView({ task: res.task, kind: "decrypt", onDone: finished });
      root.replaceChildren(h("h3", {}, "Unlocking…"), run.el);
    } catch (err) {
      dlg.setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
      go.disabled = false;
    }
  }

  function finished(task) {
    running = false;
    Promise.resolve(refresh()).catch(() => {});
    if (!task) return;
    const outputs = task.items.filter((i) => i.output);
    const first = outputs[0];
    const failedAll = task.items.every((i) => i.state === "error");
    const buttons = [
      failedAll ? h("button", { type: "button", class: "btn", title: "Go back and type the password again.", onclick: () => { root.replaceChildren(form); go.disabled = false; fields.focus(); } }, "Try again") : null,
      first ? h("button", { type: "button", class: "btn", title: "Open the folder that holds the unlocked item and select it.", onclick: () => { dlg.close(null); goTo(parentOf(first.output, state.sep), { select: first.output }); } }, "Show in folder") : null,
      h("button", { type: "button", class: "btn primary", title: "Close this window.", onclick: () => dlg.close(null) }, "Close"),
    ];
    root.replaceChildren(h("h3", {}, summaryText(task, "decrypt")), resultList(task, "decrypt"), h("div", { class: "dialog-buttons" }, buttons));
    announce(summaryText(task, "decrypt"));
    root.querySelector(".btn.primary")?.focus();
  }

  dlg.result.then(() => {
    fields.clear();
    run?.stop();
    if (running && taskId) call("vault/cancel", { id: taskId }).catch(() => {});
  });
  return dlg;
}
