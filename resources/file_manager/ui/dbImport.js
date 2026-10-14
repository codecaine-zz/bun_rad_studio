// Ways to bring a connection in without typing it: paste an address, import what the environment says, or import a
// `.env` file the person points at. Nothing is saved until the person confirms in the editor or on a card.
import { call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { detected, environmentActions, refreshDetect, renderCard, showSaved } from "./dbDetect.js";
import { showEditor } from "./dbEditor.js";
import { engineInfo, errorText, loadOverview } from "./dbState.js";
import { toast } from "./menus.js";
import { on } from "./state.js";

/** "Paste a connection address": mysql://, mariadb://, postgres://, postgresql://, redis://, rediss://, sqlite:/path. */
export async function showPasteUrl() {
  const input = h("input", { type: "text", class: "text-input pw-mono db-url", autocomplete: "off", spellcheck: "false", placeholder: "postgres://user:password@host:5432/database", "aria-label": "Connection address" });
  const dlg = openDialog({
    title: "Paste a connection address",
    body: [
      h("p", { class: "pw-hint" }, "mysql://, mariadb://, postgres://, postgresql://, redis://, rediss://, sqlite:/full/path or a full file path. The form is filled in for you to check; the password goes to the keychain and is never kept in the address."),
      h("label", { class: "db-field db-wide" }, h("span", { class: "db-field-label" }, "Address"), input),
    ],
    buttons: [{ label: "Cancel", value: null }, { label: "Fill in the form", value: "go", primary: true }],
    describe: "Paste a connection address to fill in the connection form.",
    initialFocus: input,
  });
  const go = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  const parsed = await new Promise((resolve) => {
    go.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      dlg.setError("");
      go.disabled = true;
      try {
        const r = await call("db/url/parse", { text: input.value });
        // The page no longer needs the text (it may hold a password).
        input.value = "";
        dlg.close("go");
        resolve(r);
      } catch (err) {
        dlg.setError(errorText(err, "That address couldn't be read."));
        go.disabled = false;
      }
    }, true);
    dlg.result.then(() => resolve(null));
  });
  if (!parsed) return null;
  const f = parsed.fields;
  const info = engineInfo(parsed.engine);
  const prefill = { name: `${info.label}: ${f.path ? f.path.split(/[\\/]/).pop() : f.host ?? "localhost"}`.slice(0, 80), host: f.host, port: f.port, user: f.user, database: f.database, schema: f.schema, tls: f.tls, path: f.path, sqliteMode: f.sqliteMode, dbIndex: f.dbIndex, connectTimeoutMs: f.connectTimeoutMs };
  for (const k of Object.keys(prefill)) if (prefill[k] === undefined) delete prefill[k];
  if (parsed.notes.length) toast(parsed.notes.join(" "), { kind: "info" });
  return await showEditor({ engine: parsed.engine, prefill, passwordToken: parsed.passwordToken, source: "url" });
}

function cardList(box, actions) {
  const draw = () => {
    clear(box);
    if (!detected.cards.length) {
      box.append(h("p", { class: "pw-hint", role: "status" }, "No database connection settings were found in this program's environment variables or in the `.env` files of its own folders."));
      return;
    }
    for (const c of detected.cards) box.append(renderCard(c, actions));
  };
  return draw;
}

/** "Import from environment": every connection found, with a preview; each is saved only when its button is pressed. */
export async function showEnvImport({ chooseFile } = {}) {
  const box = h("div", { class: "db-cards", "aria-live": "polite" });
  const files = h("p", { class: "pw-hint" });
  const actions = environmentActions();
  const draw = cardList(box, actions);
  const off = on("db-detect", () => {
    draw();
    drawFiles();
  });
  function drawFiles() {
    const read = detected.files.filter((f) => !f.skipped).map((f) => `${f.file} (${f.shown})`);
    files.textContent = read.length ? `.env files looked at, read-only: ${read.join(", ")}. ` : "No .env files were found in the application's folders. ";
  }
  const dlg = openDialog({
    title: "Import from environment",
    wide: true,
    body: [h("p", { class: "pw-hint" }, "This looks at the environment variables this program was started with and at the `.env` files in its own folders (read-only; nothing is run). It never connects to anything, and passwords are hidden."), box, files],
    buttons: [{ label: "Close", value: null, primary: true }, ...(chooseFile ? [{ label: "Import a .env file from another folder…", value: "file" }] : [])],
    describe: "Connections found in your environment.",
  });
  try {
    await refreshDetect({ manual: true });
  } catch (err) {
    dlg.setError(errorText(err, "The environment couldn't be read."));
  }
  const choice = await dlg.result;
  off();
  if (choice === "file") await chooseFile();
}

/** Asks for a `.env` file's path (or uses the one given) and previews what it contains. */
export async function showEnvFileImport(path = "") {
  let file = path;
  if (!file) {
    const input = h("input", { type: "text", class: "text-input pw-mono", placeholder: "/Users/you/project/.env", autocomplete: "off", spellcheck: "false", "aria-label": "Path of the .env file" });
    const ask = openDialog({
      title: "Import a .env file",
      body: [h("p", { class: "pw-hint" }, "Type the full path of a .env file. It is only read, never changed, and nothing is saved until you choose."), h("label", { class: "db-field db-wide" }, h("span", { class: "db-field-label" }, "File"), input)],
      buttons: [{ label: "Cancel", value: null }, { label: "Look at it", value: "go", primary: true }], initialFocus: input, describe: "Type the path of a .env file.",
    });
    if ((await ask.result) !== "go") return;
    file = input.value.trim();
  }
  let preview;
  try {
    preview = await call("db/envfile/preview", { path: file });
  } catch (err) {
    toast(errorText(err, "That file couldn't be read."), { kind: "error" });
    return;
  }
  const box = h("div", { class: "db-cards" });
  const actions = {
    async save(card) {
      try {
        const r = await call("db/envfile/import", { path: file, key: card.key });
        await loadOverview();
        dlg.close(null);
        await showSaved({ ...r, noLongerNeeded: [] }, card.engine);
      } catch (err) {
        dlg.setError(errorText(err, "That couldn't be saved."));
      }
    },
  };
  const dlg = openDialog({
    title: `Import from ${preview.file.name}`,
    wide: true,
    body: [h("p", { class: "pw-hint" }, `${preview.file.shown}/${preview.file.name}: ${preview.file.count} setting${preview.file.count === 1 ? "" : "s"}. Nothing is written until you press Save to the manager, and the file is never changed.`), box],
    buttons: [{ label: "Close", value: null, primary: true }],
    describe: "Connections found in the chosen .env file.",
  });
  if (!preview.cards.length) box.append(h("p", { class: "pw-hint", role: "status" }, "No database connection settings were found in that file."));
  for (const c of preview.cards) box.append(renderCard(c, actions));
  await dlg.result;
}
