// The right-hand side of the Databases tab: the chosen connection with its buttons, the result of Test connection, and
// the Effective settings panel.
import { call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { renderEffective } from "./dbEffective.js";
import { renderTestResult, showEditor } from "./dbEditor.js";
import { showEngineSettings } from "./dbSettings.js";
import { db, engineInfo, environmentBadge, errorText, loadOverview, passwordWords, selectedProfile, summaryOf, studiosFor } from "./dbState.js";
import { openShortcut } from "./dbShortcuts.js";
import { importButton } from "./dbStaging.js";
import { openStudio } from "./dbStudio.js";
import { toast } from "./menus.js";
import { emit } from "./state.js";

function row(label, value) {
  return value === null || value === undefined || value === "" ? null : [h("dt", {}, label), h("dd", {}, value)];
}

const tlsWords = (p) => (!p.tls ? "Off" : typeof p.tls === "object" ? `On${p.tls.verify === false ? ", certificate not checked" : ""}${p.tls.ca ? ", with an extra CA" : ""}` : "On");

async function chooseCopy(p) {
  const dlg = openDialog({
    title: `Copy "${p.name}"`,
    body: [h("p", {}, p.hasPassword ? "Should the copy also get the saved password? Without it, you will type the password again for the copy." : "The copy gets the same settings.")],
    buttons: [{ label: "Cancel", value: null }, ...(p.hasPassword ? [{ label: "Copy without the password", value: "no" }, { label: "Copy the password too", value: "yes", primary: true }] : [{ label: "Copy", value: "no", primary: true }])],
    describe: "Choose whether the copy keeps the saved password.",
  });
  return await dlg.result;
}

/** Fills `box` for the selected connection (or an introduction when none is chosen). */
export function renderDetail(box) {
  clear(box);
  const p = selectedProfile();
  if (!p) {
    box.append(
      h("h3", { class: "db-h" }, "Database connections"),
      h("p", { class: "pw-hint" }, "Choose a connection on the left, or add one. Passwords are kept in your computer's keychain, and a connection you save here is used instead of environment variables."),
      h("h4", { class: "db-h2" }, "Defaults and environment variables, per engine"),
      h("div", { class: "pw-row" }, db.engines.map((e) => h("button", { type: "button", class: "pw-btn", title: `Defaults for ${e.label}, and whether environment variables are used`, onclick: async () => { if (await showEngineSettings(e.id)) emit("db-overview"); } }, `${e.icon} ${e.label}…`))),
    );
    return;
  }
  const info = engineInfo(p.engine);
  const running = studiosFor(p.id);
  const testBox = h("div", { class: "db-test", role: "status", "aria-live": "polite" });
  const effective = h("div", { class: "db-effective", "aria-live": "polite" });
  const envSettings = db.settings.engines[p.engine] ?? { useEnv: true };

  const openBtn = h("button", { type: "button", class: "pw-btn primary", title: `Open ${info.studioName} for this connection, here in the tab`, disabled: !info.studioAvailable }, `Open in ${info.studioName}`);
  openBtn.addEventListener("click", () => openStudio({ profileId: p.id }));
  const windowBtn = h("button", { type: "button", class: "pw-btn", title: `Open ${info.studioName} for this connection as its own desktop window (Shift+Enter in the list uses the choice in Settings)`, disabled: !info.studioAvailable }, "Open in a window");
  windowBtn.addEventListener("click", () => openShortcut(p, "window"));
  const browserBtn = h("button", { type: "button", class: "pw-btn", title: `Open ${info.studioName} for this connection in your web browser`, disabled: !info.studioAvailable }, "Open in my browser");
  browserBtn.addEventListener("click", () => openShortcut(p, "browser"));
  const testBtn = h("button", { type: "button", class: "pw-btn", title: "Try to connect now (10 seconds at most; nothing is changed)" }, "Test connection");
  testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    clear(testBox);
    testBox.className = "db-test";
    testBox.append(h("p", { class: "pw-hint" }, "Connecting… (gives up after 10 seconds)"));
    try {
      renderTestResult(testBox, (await call("db/test", { id: p.id })).result);
    } catch (err) {
      clear(testBox);
      testBox.append(h("p", { class: "power-error", role: "alert" }, errorText(err, "The test couldn't run.")));
    }
    testBtn.disabled = false;
  });
  const act = (label, title, fn, cls = "pw-btn") => h("button", { type: "button", class: cls, title, onclick: fn }, label);
  const changed = async () => {
    await loadOverview();
    emit("db-overview");
  };
  const buttons = h("div", { class: "pw-row db-actions" },
    openBtn, windowBtn, browserBtn, importButton(p), testBtn,
    act("Edit…", "Change this connection", async () => { if (await showEditor({ profile: p })) await changed(); }),
    act("Duplicate…", "Make a copy of this connection", async () => {
      const choice = await chooseCopy(p);
      if (!choice) return;
      try {
        const r = await call("db/profile/duplicate", { id: p.id, copyPassword: choice === "yes" });
        db.selectedId = r.profile.id;
        await changed();
        toast(`Copied as "${r.profile.name}".`, { kind: "info" });
      } catch (err) {
        toast(errorText(err, "That couldn't be copied."), { kind: "error" });
      }
    }),
    act(p.favorite ? "★ Unfavourite" : "☆ Favourite", "Keep this connection near the top of the list", async () => {
      try {
        await call("db/profile/favorite", { id: p.id, favorite: !p.favorite });
        await changed();
      } catch (err) {
        toast(errorText(err, "That didn't work."), { kind: "error" });
      }
    }),
    act("Delete…", "Delete this connection and its saved password", async () => {
      if (!(await confirmBox({ title: `Delete "${p.name}"?`, message: "The connection and its saved password are deleted. The database itself is not touched.", confirmLabel: "Delete", danger: true }))) return;
      try {
        await call("db/profile/delete", { id: p.id, confirm: true });
        db.selectedId = null;
        await changed();
      } catch (err) {
        toast(errorText(err, "That couldn't be deleted."), { kind: "error" });
      }
    }, "pw-btn danger"),
  );

  const tag = (t) => h("span", { class: "db-tag" }, t);
  // append() would print "null" for a missing part, so the parts are filtered first.
  const parts = [
    h("h3", { class: "db-h" }, h("span", { "aria-hidden": "true" }, `${info.icon} `), p.name, " ", environmentBadge(p.environment), p.favorite ? h("span", { class: "db-fav", title: "Favourite" }, " ★") : null),
    h("dl", { class: "db-kv" },
      row("Kind", info.label),
      row(p.engine === "sqlite" ? "File" : "Server", summaryOf(p)),
      row("User", p.user),
      row("Schema", p.schema),
      p.engine === "sqlite" ? row("Opened", { readwrite: "For reading and writing", readonly: "Read-only", create: "Created if missing", memory: "In memory" }[p.sqliteMode ?? "readwrite"]) : row("TLS", tlsWords(p)),
      row("Password", passwordWords(p)),
      row("Read-only", p.readOnly ? "Yes: the File Manager asks before opening a studio" : null),
      row("Folder", p.folder),
      row("Tags", p.tags?.length ? h("span", {}, p.tags.map(tag)) : null),
      row("Made from", p.meta?.source === "environment" ? `Your environment (${(p.meta.variables ?? []).join(", ")})` : p.meta?.source === "dotenv" ? `A .env file (${(p.meta.variables ?? []).join(", ")})` : p.meta?.source === "envfile" ? "A .env file you chose" : p.meta?.source === "local" ? "The Redis server running on this computer (found automatically)" : null),
    ),
    running.length ? h("p", { class: "pw-hint" }, `${info.studioName} is open for this connection. `, h("button", { type: "button", class: "pw-btn", onclick: () => emit("db-view", { view: "studio", id: running[0].id }) }, "Show it")) : null,
    buttons,
    testBox,
    h("div", { class: "db-env-toggle" },
      h("label", { class: "db-check", title: "On: a studio started without a connection reads this program's environment variables and .env files, and this connection may fall back to them for blank fields. Off: they are never used for this engine." },
        h("input", { type: "checkbox", checked: envSettings.useEnv, onchange: async (e) => {
          try {
            await call("db/engine/save", { engine: p.engine, useEnv: e.target.checked });
            await loadOverview();
            await renderEffective(effective, { id: p.id });
          } catch (err) {
            toast(errorText(err, "That couldn't be changed."), { kind: "error" });
          }
        } }),
        ` Use environment variables for ${info.label} (turn off to stop using them)`),
      h("button", { type: "button", class: "pw-btn", title: `Defaults for ${info.label}`, onclick: async () => { if (await showEngineSettings(p.engine)) await renderEffective(effective, { id: p.id }); } }, "Defaults…"),
    ),
    effective,
  ];
  box.append(...parts.filter(Boolean));
  renderEffective(effective, { id: p.id });
}
