// The "Encrypt…" dialog: choose a password, choose how strong the lock is, and lock the selected files and folders.
// Locked files get the extension .radenc and can be opened with this app or with `bun run cli:vault` (format:
// docs/reference/vault-format.md). Originals are never changed unless you ask for them to go to the Recycle Bin.
import { ApiError, call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { announce, h } from "./dom.js";
import { goTo, refresh } from "./nav.js";
import { state } from "./state.js";
import { formatSize, parentOf, plural } from "./util.js";
import { passwordFields } from "./vaultForm.js";
import { resultList, runView, summaryText } from "./vaultRun.js";

let counter = 0;

/** A labeled tick box with a tooltip and an optional explanation underneath. */
function tick({ label, hint, checked, title }) {
  const id = `vault-opt-${++counter}`;
  const input = h("input", { type: "checkbox", id, checked: checked || null, title });
  const el = h("div", { class: "vault-option" }, h("label", { for: id, title }, input, " ", label), hint ? h("p", { class: "vault-hint" }, hint) : null);
  return { el, input };
}

/** What the new file will be called, as shown before anything happens. */
export function plannedNames(entries, hideName) {
  return entries.map((e, i) => (hideName ? `Encrypted file ${i + 1}.radenc` : `${e.name}.radenc`));
}

/**
 * @param {Array<{ path: string, name: string, isDir: boolean, size?: number }>} entries
 */
export function openEncryptDialog(entries) {
  let run = null;
  let running = false;
  let taskId = "";
  const fields = passwordFields({ confirm: true });

  const detail = new Map();
  const itemList = h("ul", { class: "vault-items", "aria-label": "What will be locked" }, entries.map((e) => {
    const info = h("span", { class: "vault-item-detail" }, e.isDir ? "Folder, counting what's inside…" : formatSize(e.size ?? 0));
    detail.set(e.path, info);
    return h("li", {}, h("span", { class: "vault-item-name" }, `${e.isDir ? "📁" : "📄"} ${e.name}`), info);
  }));
  (async () => {
    for (const e of entries.filter((x) => x.isDir)) {
      try {
        const p = (await call("props", { paths: [e.path] })).properties;
        detail.get(e.path).textContent = `Folder: ${plural(p.files, "file")}, ${formatSize(p.size)}${p.partial ? " (and more)" : ""}`;
      } catch {
        detail.get(e.path).textContent = "Folder";
      }
    }
  })();

  const level = (value, label, text, checked) => {
    const id = `vault-level-${++counter}-${value}`;
    const input = h("input", { type: "radio", name: `vault-level-${counter}`, value, id, checked: checked || null, title: text });
    return { input, el: h("div", { class: "vault-option" }, h("label", { for: id, title: text }, input, " ", h("strong", {}, label)), h("p", { class: "vault-hint" }, text)) };
  };
  const standard = level("standard", "Standard (recommended)", "Uses 256 MB of memory and about half a second per item. Strong against even determined attackers if the password is good.", true);
  const maximum = level("maximum", "Maximum", "Uses 1 GB of memory and a few seconds per item. Needs a computer with plenty of free memory.", false);
  for (const r of [standard, maximum]) r.input.name = standard.input.name;

  const compress = tick({ label: "Compress first (makes the locked file smaller)", checked: true, title: "Squeezes the data before locking it. Pictures, videos and zip files don't get smaller, but nothing is lost either way." });
  const hide = tick({ label: "Hide the file name", checked: false, title: "Names the result “Encrypted file 1.radenc” instead of using the original name, so the name stays private. The real name is kept inside and comes back when you unlock.", hint: "The original name is stored inside the lock and comes back when you unlock." });
  const trash = tick({ label: "Move the original to the Recycle Bin after checking the locked copy", checked: false, title: "Only after the locked copy has been written and checked. Nothing is deleted for good: you can still restore the original from the Recycle Bin.", hint: "Off by default. The original is only moved after the locked copy has been checked." });
  const folder = h("input", { type: "text", class: "text-input", id: `vault-out-${++counter}`, placeholder: "Same folder as the original", autocomplete: "off", spellcheck: "false", title: "Where to put the locked files. Leave empty to put each one next to its original. Type or paste a full folder path." });
  hide.input.addEventListener("change", updateSummary);

  const summary = h("ul", { class: "vault-summary", "aria-label": "Files that will be created" });
  function updateSummary() {
    const names = plannedNames(entries, hide.input.checked);
    summary.replaceChildren(...names.slice(0, 6).map((n) => h("li", {}, n)), ...(names.length > 6 ? [h("li", {}, `…and ${names.length - 6} more`)] : []));
  }
  updateSummary();

  const warning = h("div", { class: "vault-warning", role: "note" },
    h("strong", {}, "There is no way to recover a lost password. "),
    "If you forget it, your files stay locked for good, and nobody can help, including us. Write the password down and keep it somewhere safe.",
  );

  const form = h("div", { class: "vault-form" },
    h("h3", {}, `What will be locked (${plural(entries.length, "item")})`),
    itemList,
    h("h3", {}, "Choose a password"),
    fields.el,
    warning,
    h("h3", {}, "How strong should the lock be?"),
    h("div", { role: "radiogroup", "aria-label": "Strength of the lock" }, standard.el, maximum.el),
    h("h3", {}, "Options"),
    compress.el,
    hide.el,
    trash.el,
    h("label", { class: "field", for: folder.id }, h("span", { class: "field-label" }, "Save the locked files in")),
    folder,
    h("h3", {}, "These files will be created"),
    summary,
    h("p", { class: "vault-hint" }, "If a name is already taken, a number is added. Nothing is ever replaced."),
    h("div", { class: "dialog-buttons" },
      h("button", { type: "button", class: "btn", title: "Close this window without locking anything.", onclick: () => dlg.close(null) }, "Cancel"),
      h("button", { type: "button", class: "btn primary vault-go", title: "Lock the items now. Your originals stay where they are unless you ticked the Recycle Bin option.", onclick: submit }, "Encrypt"),
    ),
  );
  const root = h("div", { class: "vault-dialog" }, form);
  const dlg = openDialog({ title: entries.length === 1 ? `Encrypt “${entries[0].name}”` : `Encrypt ${entries.length} items`, body: root, buttons: [], wide: true, initialFocus: fields.first });

  for (const input of [fields.first, fields.second, folder]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
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
    const go = form.querySelector(".vault-go");
    go.disabled = true;
    try {
      const res = await call("vault/encrypt", {
        paths: entries.map((e) => e.path),
        password: fields.password(),
        level: maximum.input.checked ? "maximum" : "standard",
        compress: compress.input.checked,
        hideName: hide.input.checked,
        outputDir: folder.value.trim() || undefined,
        afterwards: trash.input.checked ? "trash" : "keep",
      });
      fields.clear();
      taskId = res.task.id;
      running = true;
      run = runView({ task: res.task, kind: "encrypt", onDone: finished });
      root.replaceChildren(h("h3", {}, "Locking…"), run.el);
    } catch (err) {
      dlg.setError(err instanceof ApiError ? err.message : "That didn't work. Try again.");
      go.disabled = false;
      if (err instanceof ApiError && /password/i.test(err.message)) fields.focus();
    }
  }

  function finished(task) {
    running = false;
    Promise.resolve(refresh()).catch(() => {});
    if (!task) return;
    const outputs = task.items.filter((i) => i.output);
    const failedAll = task.items.every((i) => i.state === "error");
    const first = outputs[0];
    const buttons = [
      failedAll ? h("button", { type: "button", class: "btn", title: "Go back and try again with different settings.", onclick: () => root.replaceChildren(form) }, "Go back") : null,
      first ? h("button", { type: "button", class: "btn", title: "Open the folder that holds the locked file and select it.", onclick: () => { dlg.close(null); goTo(parentOf(first.output, state.sep), { select: first.output }); } }, "Show in folder") : null,
      h("button", { type: "button", class: "btn primary", title: "Close this window.", onclick: () => dlg.close(null) }, "Close"),
    ];
    root.replaceChildren(
      h("h3", {}, summaryText(task, "encrypt")),
      resultList(task, "encrypt"),
      ...(outputs.length ? [h("div", { class: "vault-warning", role: "note" }, "Remember: if you forget the password, these files can't be opened by anyone. Keep it somewhere safe.")] : []),
      h("div", { class: "dialog-buttons" }, buttons),
    );
    form.querySelector(".vault-go").disabled = false;
    announce(summaryText(task, "encrypt"));
    root.querySelector(".btn.primary")?.focus();
  }

  dlg.result.then(() => {
    fields.clear();
    run?.stop();
    if (running && taskId) call("vault/cancel", { id: taskId }).catch(() => {});
  });
  return dlg;
}
