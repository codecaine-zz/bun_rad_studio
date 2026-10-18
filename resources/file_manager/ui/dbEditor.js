// The connection editor: one dialog for SQLite, MySQL / MariaDB, PostgreSQL and Redis. The password box is write-only:
// the page never learns a saved password, only whether one exists, and typing a new one replaces it.
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { ENVIRONMENT_NAMES, db, engineInfo, errorText, field, loadOverview } from "./dbState.js";
import { selectedEntries } from "./selection.js";
import { state } from "./state.js";

const ENV_WORDS = { development: "Development", test: "Test", staging: "Staging", production: "Production (be careful)" };
const SQLITE_MODES = [
  ["readwrite", "Open for reading and writing"],
  ["readonly", "Open read-only"],
  ["create", "Create it if it is missing"],
  ["memory", "In memory (nothing is saved)"],
];
const SQLITE_TEMPLATES = [
  ["empty", "Empty database (no tables)"],
  ["starter", "Starter schema (users & items tables with sample rows)"],
  ["kv", "Key-Value store (kv_store table)"],
  ["notes", "Notes table (notes with title, body & tags)"],
];

/** Shows the result of Test connection: words first, then a few facts. */
export function renderTestResult(box, result) {
  clear(box);
  box.className = `db-test db-test-${result.ok ? "ok" : "bad"}`;
  box.append(
    h("p", { class: "db-test-line" }, h("span", { "aria-hidden": "true" }, result.ok ? "✅ " : "❌ "), h("strong", {}, result.ok ? "It works. " : "It didn't work. "), result.message),
    result.facts?.length ? h("p", { class: "pw-hint" }, `${result.facts.join(" · ")} · ${result.ms} ms`) : h("p", { class: "pw-hint" }, `${result.ms} ms`),
  );
}

const num = (input) => (input.value.trim() === "" ? undefined : Number(input.value));

/**
 * Opens the editor. `profile` edits a saved connection; otherwise `engine` starts a new one, optionally from `prefill`
 * (fields from a pasted address) and `passwordToken` (the password the server kept from it).
 * Resolves with the saved connection, or null.
 */
export async function showEditor({ profile = null, engine = profile?.engine, prefill = null, passwordToken = null, source = "manual" } = {}) {
  const info = engineInfo(engine);
  const p = { ...(profile ?? {}), ...(prefill ?? {}) };
  const isRedis = engine === "redis";
  const isSqlite = engine === "sqlite";
  const tlsOn = !!p.tls;
  const tlsObj = p.tls && typeof p.tls === "object" ? p.tls : {};
  let hasPassword = !!profile?.hasPassword;

  const name = h("input", { type: "text", class: "text-input", value: p.name ?? "", maxlength: "80", required: true, autocomplete: "off", spellcheck: "false" });
  const folder = h("input", { type: "text", class: "text-input", value: p.folder ?? "", maxlength: "80", list: "db-folders", autocomplete: "off" });
  const folders = h("datalist", { id: "db-folders" }, [...new Set(db.profiles.map((x) => x.folder).filter(Boolean))].map((f) => h("option", { value: f })));
  const tags = h("input", { type: "text", class: "text-input", value: (p.tags ?? []).join(", "), placeholder: "work, client-x", autocomplete: "off" });
  const environment = h("select", { class: "text-input" }, ENVIRONMENT_NAMES.map((e) => h("option", { value: e, selected: (p.environment ?? "development") === e }, ENV_WORDS[e])));
  const favorite = h("input", { type: "checkbox", checked: !!p.favorite });
  const readOnly = h("input", { type: "checkbox", checked: !!p.readOnly });

  // Engine fields.
  const host = h("input", { type: "text", class: "text-input", value: p.host ?? "", placeholder: "localhost", autocomplete: "off", spellcheck: "false" });
  const port = h("input", { type: "number", class: "text-input", value: p.port ?? "", min: "1", max: "65535", placeholder: info.defaultPort ? String(info.defaultPort) : "", inputmode: "numeric" });
  const user = h("input", { type: "text", class: "text-input", value: p.user ?? "", autocomplete: "off", spellcheck: "false", placeholder: isRedis ? "(none: the default user)" : "" });
  const database = h("input", { type: "text", class: "text-input", value: p.database ?? "", autocomplete: "off", spellcheck: "false" });
  const schema = h("input", { type: "text", class: "text-input", value: p.schema ?? "", placeholder: "public", autocomplete: "off", spellcheck: "false" });
  const dbIndex = h("input", { type: "number", class: "text-input", value: p.dbIndex ?? "", min: "0", max: "15", placeholder: "0", inputmode: "numeric" });
  const keyPrefix = h("input", { type: "text", class: "text-input", value: p.keyPrefix ?? "", autocomplete: "off", spellcheck: "false", placeholder: "app:" });
  const path = h("input", { type: "text", class: "text-input pw-mono", value: p.path ?? "", placeholder: "/Users/you/data.sqlite", autocomplete: "off", spellcheck: "false" });
  const mode = h("select", { class: "text-input" }, SQLITE_MODES.map(([v, l]) => h("option", { value: v, selected: (p.sqliteMode ?? "readwrite") === v }, l)));
  const connectTimeout = h("input", { type: "number", class: "text-input", value: p.connectTimeoutMs ? p.connectTimeoutMs / 1000 : "", min: "1", max: "120", placeholder: "10" });
  const statementTimeout = h("input", { type: "number", class: "text-input", value: p.statementTimeoutMs ? p.statementTimeoutMs / 1000 : "", min: "0", max: "3600", placeholder: "none" });
  const publicKey = h("input", { type: "checkbox", checked: !!p.allowPublicKeyRetrieval });
  const tls = h("input", { type: "checkbox", checked: tlsOn, "aria-controls": "db-tls-more" });
  const verify = h("input", { type: "checkbox", checked: tlsObj.verify !== false });
  const ca = h("textarea", { class: "text-input pw-mono db-ca", rows: "3", placeholder: "-----BEGIN CERTIFICATE-----", spellcheck: "false", "aria-label": "CA certificate (PEM text)" }, tlsObj.ca ?? "");
  const caPath = h("input", { type: "text", class: "text-input", placeholder: "/path/to/ca.pem", "aria-label": "Path of a CA certificate file", autocomplete: "off", spellcheck: "false" });
  const password = h("input", { type: "password", class: "text-input", autocomplete: "new-password", spellcheck: "false", "aria-describedby": "db-pw-hint", placeholder: hasPassword ? "Saved. Type a new password to replace it." : "" });
  const passwordHint = h("span", { id: "db-pw-hint", class: "db-field-hint" });
  const removePassword = h("button", { type: "button", class: "pw-btn", hidden: !hasPassword, title: "Delete the password saved for this connection. The connection itself stays." }, "Remove saved password");
  const testBox = h("div", { class: "db-test", role: "status", "aria-live": "polite" });
  const testButton = h("button", { type: "button", class: "pw-btn", title: "Try to connect with these settings (nothing is changed or saved)" }, "Test connection");
  const tlsMore = h("div", { id: "db-tls-more", class: "db-tls-more", hidden: !tlsOn },
    field("Check the server's certificate", verify, "Keep this on. Turn it off only for a server you trust on this computer, such as a test container.", "db-check"),
    isSqlite ? null : h("div", { class: "db-field" }, h("span", { class: "db-field-label" }, "Extra CA certificate (optional)"), ca,
      h("span", { class: "pw-row" }, caPath, h("button", { type: "button", class: "pw-btn", title: "Read a certificate file from this computer into the box above", onclick: loadCa }, "Load file"))),
  );

  function describePassword() {
    passwordHint.textContent = db.secretStore.persistent
      ? "Stored in your computer's keychain, never in the connection file. It is never shown again here."
      : "Your computer's keychain isn't available, so the password is kept only until the File Manager closes. You will be asked again next time.";
  }
  describePassword();
  const notice = !isSqlite && !db.secretStore.persistent ? h("p", { class: "db-notice", role: "note" }, h("span", { "aria-hidden": "true" }, "⚠ "), "The OS keychain isn't available, so a saved password lasts only until the File Manager closes.") : null;

  async function loadCa() {
    try {
      const r = await call("db/ca/read", { path: caPath.value.trim() });
      ca.value = r.pem;
      testBox.replaceChildren();
    } catch (err) {
      dlg.setError(errorText(err, "Couldn't read that file."));
    }
  }

  const sync = () => {
    tlsMore.hidden = !tls.checked;
    tls.setAttribute("aria-expanded", String(tls.checked));
  };
  tls.addEventListener("change", sync);
  sync();

  function collect() {
    const out = { engine, name: name.value.trim(), folder: folder.value.trim(), tags: tags.value.split(",").map((t) => t.trim()).filter(Boolean), environment: environment.value, favorite: favorite.checked, readOnly: readOnly.checked };
    if (isSqlite) {
      out.sqliteMode = mode.value;
      out.path = mode.value === "memory" ? ":memory:" : path.value.trim();
      return out;
    }
    out.host = host.value.trim() || "localhost";
    if (num(port) !== undefined) out.port = num(port);
    if (user.value.trim()) out.user = user.value.trim();
    if (isRedis) {
      if (num(dbIndex) !== undefined) out.dbIndex = num(dbIndex);
      if (keyPrefix.value.trim()) out.keyPrefix = keyPrefix.value.trim();
    } else {
      if (database.value.trim()) out.database = database.value.trim();
      if (engine === "postgres" && schema.value.trim()) out.schema = schema.value.trim();
      out.statementTimeoutMs = num(statementTimeout) === undefined ? 0 : Math.round(num(statementTimeout) * 1000);
      if (engine === "mysql" && publicKey.checked) out.allowPublicKeyRetrieval = true;
    }
    if (num(connectTimeout) !== undefined) out.connectTimeoutMs = Math.round(num(connectTimeout) * 1000);
    out.tls = !tls.checked ? false : !verify.checked || ca.value.trim() ? { ...(ca.value.trim() ? { ca: ca.value.trim() } : {}), ...(verify.checked ? {} : { verify: false }) } : true;
    return out;
  }

  testButton.addEventListener("click", async () => {
    dlg.setError("");
    testButton.disabled = true;
    clear(testBox);
    testBox.className = "db-test";
    testBox.append(h("p", { class: "pw-hint" }, "Connecting… (gives up after 10 seconds)"));
    try {
      const typed = password.value;
      const r = await call("db/test", { profile: collect(), ...(typed ? { password: typed } : passwordToken ? { passwordToken } : {}), ...(profile ? { draftOf: profile.id } : {}) });
      renderTestResult(testBox, r.result);
    } catch (err) {
      clear(testBox);
      dlg.setError(errorText(err, "The test couldn't run."));
    } finally {
      testButton.disabled = false;
    }
  });

  removePassword.addEventListener("click", async () => {
    if (!(await confirmBox({ title: "Remove the saved password?", message: `The password saved for "${profile.name}" is deleted from the keychain. You will need to type it again to connect.`, confirmLabel: "Remove password", danger: true }))) return;
    try {
      await call("db/password/clear", { id: profile.id, confirm: true });
      hasPassword = false;
      removePassword.hidden = true;
      password.placeholder = "";
      await loadOverview();
    } catch (err) {
      dlg.setError(errorText(err, "Couldn't remove the password."));
    }
  });

  const basics = [
    field("Name", name, "", "db-wide"), field("Folder", folder, "Connections with the same folder are listed together."), field("Tags", tags, "Separate with commas."),
    field("Environment", environment, "Production connections ask before a studio opens, because the studios can change data."),
    h("div", { class: "db-checks" },
      h("label", { class: "db-check" }, favorite, " Favorite"),
      h("label", { class: "db-check", title: "Marks the connection as one you should not change. The studios have no read-only switch, so this makes the File Manager ask before opening one." }, readOnly, " Read-only (ask before opening a studio)"),
    ),
  ];
  let specific;
  if (isSqlite) {
    const folderNow = () => (state.location?.kind === "folder" && state.location.path ? state.location.path : state.home || "");
    specific = [
      field("Database file", path, "A full path. Type it, or select the file in the file list and use the button.", "db-wide"),
      h("div", { class: "pw-row" },
        h("button", { type: "button", class: "pw-btn", title: "Use the file selected in the file list", onclick: () => {
          const sel = selectedEntries().find((e) => !e.isDir);
          if (sel) path.value = sel.path;
          else dlg.setError("Select a database file in the file list first.");
        } }, "Use the selected file"),
        h("button", { type: "button", class: "pw-btn", title: "Create a brand-new SQLite database file in the current folder and fill in its path", onclick: async () => {
          const parent = folderNow();
          if (!parent) { dlg.setError("Open a folder in the file list first."); return; }
          dlg.setError("");
          try {
            const desiredName = name.value.trim() || undefined;
            const r = await call("newsqlite", { parent, ...(desiredName ? { name: desiredName } : {}) });
            path.value = r.path;
            if (!name.value.trim()) name.value = r.name.replace(/\.(sqlite3?|db3?|s3db|sl3)$/i, "");
          } catch (err) {
            dlg.setError(errorText(err, "Couldn't create the SQLite file."));
          }
        } }, "Create new file in current folder"),
      ),
      field("How to open it", mode),
    ];
  } else {
    specific = [
      field("Host", host, "A name or an address, like localhost or db.example.com."),
      field("Port", port, info.defaultPort ? `Left empty, ${info.defaultPort} is used.` : ""),
      field(isRedis ? "User name (ACL)" : "User", user),
      field("Password", password, "", "db-wide"), passwordHint, removePassword,
      ...(isRedis
        ? [field("Database number", dbIndex, "0 to 15."), field("Key prefix", keyPrefix, "Test connection counts the keys that start with this.")]
        : [field("Database", database, engine === "mysql" ? "MySQL Studio needs one; without it, it opens my_app_dev." : ""), ...(engine === "postgres" ? [field("Schema", schema, "Left empty, public is used.")] : [])]),
      h("div", { class: "db-checks db-wide" }, h("label", { class: "db-check" }, tls, " Use TLS (an encrypted connection)")),
      tlsMore,
      field("Connect timeout (seconds)", connectTimeout, "Left empty, 10 seconds."),
      ...(isRedis ? [] : [field("Statement timeout (seconds)", statementTimeout, "Stops queries that run too long. Empty means no limit.")]),
      ...(engine === "mysql" ? [h("div", { class: "db-checks db-wide" }, h("label", { class: "db-check", title: "Lets the client fetch the server's public key over an unencrypted connection (needed by some MySQL logins). Off is safer." }, publicKey, " Allow public key retrieval"))] : []),
    ];
  }

  const dlg = openDialog({
    title: `${profile ? "Edit" : "New"} ${info.label} connection`,
    wide: true,
    describe: "Fill in the connection and choose Save.",
    body: h("div", { class: "db-editor" }, folders, notice, h("div", { class: "db-form" }, basics, specific), h("div", { class: "pw-row" }, testButton), testBox),
    buttons: [{ label: "Cancel", value: null }, { label: "Save", value: "save", primary: true }],
    initialFocus: name,
  });
  // Save keeps the dialog open when the server finds a problem, so nothing typed is lost.
  const saveButton = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  return await new Promise((resolve) => {
    saveButton.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      dlg.setError("");
      saveButton.disabled = true;
      try {
        const typed = password.value;
        const r = await call("db/profile/save", { id: profile?.id, profile: collect(), source, ...(typed ? { password: typed } : passwordToken ? { passwordToken } : {}) });
        await loadOverview();
        dlg.close(r.profile);
      } catch (err) {
        dlg.setError(err instanceof ApiError ? err.message : "That couldn't be saved.");
        saveButton.disabled = false;
      }
    }, true);
    dlg.result.then((v) => resolve(v && v !== "save" ? v : null));
  });
}

/**
 * One-step dialog to create a brand-new SQLite database file (empty or with a starter schema), optionally save it as a
 * connection in Databases, and open it immediately in SQLite Studio.
 */
export async function showNewSqliteDialog(opts = {}) {
  const folderNow = opts.folder || (state.location?.kind === "folder" && state.location.path ? state.location.path : state.home || "");
  const name = h("input", { type: "text", class: "text-input pw-mono", value: opts.name ?? "New database.sqlite", maxlength: "120", required: true, autocomplete: "off", spellcheck: "false" });
  const folder = h("input", { type: "text", class: "text-input pw-mono", value: folderNow, required: true, autocomplete: "off", spellcheck: "false" });
  const template = h("select", { class: "text-input" }, SQLITE_TEMPLATES.map(([v, l]) => h("option", { value: v, selected: (opts.template ?? "empty") === v }, l)));
  const saveProfile = h("input", { type: "checkbox", checked: opts.saveProfile !== false });
  const openNow = h("input", { type: "checkbox", checked: opts.openNow !== false });

  const dlg = openDialog({
    title: "New SQLite database",
    wide: true,
    describe: "Choose a file name, folder, and optional starter schema to create a new SQLite database.",
    body: h("div", { class: "db-editor" },
      h("p", { class: "pw-hint" }, "Creates a brand-new SQLite database file on disk. Existing files are never overwritten."),
      h("div", { class: "db-form" },
        field("File name", name, ".sqlite is added when you leave it out.", "db-wide"),
        field("Folder", folder, "An existing folder where the new file will be saved.", "db-wide"),
        field("Starter template", template, "Start empty or pre-populate common starter tables.", "db-wide"),
        h("div", { class: "db-checks db-wide" },
          h("label", { class: "db-check" }, saveProfile, " Save as a connection in Databases"),
          h("label", { class: "db-check" }, openNow, " Open immediately in SQLite Studio"),
        ),
      ),
    ),
    buttons: [{ label: "Cancel", value: null }, { label: "Create SQLite database", value: "create", primary: true }],
    initialFocus: name,
  });

  const createBtn = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  return await new Promise((resolve) => {
    createBtn.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      dlg.setError("");
      createBtn.disabled = true;
      createBtn.textContent = "Creating…";
      try {
        const r = await call("newsqlite", {
          parent: folder.value.trim(),
          name: name.value.trim() || undefined,
          template: template.value,
          saveProfile: saveProfile.checked,
        });
        if (saveProfile.checked) await loadOverview();
        dlg.close("create");
        resolve({ ...r, openNow: openNow.checked });
      } catch (err) {
        dlg.setError(errorText(err, "The SQLite database couldn't be created."));
        createBtn.disabled = false;
        createBtn.textContent = "Create SQLite database";
      }
    }, true);
    dlg.result.then((v) => { if (!v || v !== "create") resolve(null); });
  });
}
