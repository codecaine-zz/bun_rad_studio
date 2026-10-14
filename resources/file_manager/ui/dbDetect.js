// "Found in your environment": connections the File Manager noticed in this program's environment variables and
// `.env` files. Detection only looks (it never connects, and shows no password); saving always needs a click
// unless the person turned on automatic saving. After a connection is saved, the variables are no longer needed.
import { call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { db, engineInfo, errorText, loadOverview } from "./dbState.js";
import { toast } from "./menus.js";
import { openPower } from "./power.js";
import { emit } from "./state.js";

export const detected = { enabled: true, autoSave: false, cards: [], files: [], dismissed: 0, nodeEnv: "", loaded: false };

const FIELD_LABELS = { host: "Host", port: "Port", user: "User", database: "Database", schema: "Schema", tls: "TLS", path: "File", dbIndex: "Database number" };

/** Looks again (quietly: no messages). The answer is kept in `detected` and announced as "db-detect". */
export async function refreshDetect({ manual = false, quiet = false } = {}) {
  const r = await call("db/detect", { manual, quiet });
  Object.assign(detected, { enabled: r.enabled, autoSave: r.autoSave, cards: r.cards, files: r.files ?? [], dismissed: r.dismissed ?? 0, nodeEnv: r.nodeEnv ?? "", loaded: true });
  emit("db-detect");
  return r;
}

/** Once, when the File Manager starts: look quietly and say so only if something new turned up. */
export async function startQuietDetect() {
  if (typeof document === "undefined") return;
  try {
    const r = await refreshDetect({ quiet: true });
    if (r.autoSaved?.length) {
      await loadOverview();
      toast(`Saved ${r.autoSaved.length} database connection${r.autoSaved.length === 1 ? "" : "s"} from your environment to the Databases tool.`, { kind: "info", action: { label: "Open Databases", run: () => openPower("databases") } });
    } else if (r.announce) {
      const n = r.cards.length;
      toast(`Found ${n} database connection${n === 1 ? "" : "s"} in your environment. Open Databases to save ${n === 1 ? "it" : "them"} here.`, { kind: "info", action: { label: "Review", run: () => openPower("databases") } });
    }
  } catch {
    // Detection is a convenience: if it can't run, the tab still works.
  }
}

function kv(card) {
  const rows = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const f = card.fields[key];
    if (f) rows.push([label, key === "tls" ? (f.value ? "on" : "off") : String(f.value), f.name]);
  }
  rows.push(["Password", card.password.present ? "found (hidden)" : "none found", card.password.name ?? ""]);
  return h("dl", { class: "db-kv" }, rows.map(([k, v, from]) => [h("dt", {}, k), h("dd", {}, h("span", { class: k === "Password" ? "" : "pw-mono" }, v), from ? h("span", { class: "pw-hint" }, ` ← ${from}`) : null)]));
}

function provenance(card) {
  const sources = new Map();
  for (const f of Object.values(card.fields)) sources.set(f.source, f);
  if (card.password.present) sources.set(card.password.source, { loaded: true });
  const unloaded = card.files.filter((f) => !f.loaded);
  return h("div", { class: "db-from" },
    h("p", { class: "pw-hint" }, "Where each value was found:"),
    h("ul", { class: "db-sources" }, [...sources.keys()].map((s) => h("li", {}, s))),
    unloaded.length ? h("p", { class: "db-badge-note", role: "note" }, h("span", { "aria-hidden": "true" }, "📄 "), `Found in ${unloaded.map((f) => `\`${f.file}\``).join(", ")} but not loaded into the environment (the program was started somewhere else, or Bun was told not to read it).`) : null,
  );
}

/**
 * One card. `actions` supplies the buttons' work: save(card), dismiss(card, forever), update(card).
 * @param {any} card
 * @param {{ save: Function, dismiss?: Function, update?: Function }} actions
 */
export function renderCard(card, actions) {
  const info = engineInfo(card.engine);
  const buttons = [];
  if (card.status === "changed") {
    buttons.push(h("button", { type: "button", class: "pw-btn primary", title: "Replace the saved values with what the environment says now", onclick: () => actions.update?.(card) }, "Update the saved connection"));
    buttons.push(h("button", { type: "button", class: "pw-btn", title: "Keep the saved connection as it is and stop mentioning this change", onclick: () => actions.dismiss?.(card, false) }, "Not now"));
  } else if (card.status === "saved") {
    buttons.push(h("span", { class: "db-saved-note" }, h("span", { "aria-hidden": "true" }, "✓ "), `Already saved${card.profileName ? ` as "${card.profileName}"` : ""}`));
  } else {
    buttons.push(h("button", { type: "button", class: "pw-btn primary", title: "Create a connection from these values. The password goes to your computer's keychain.", onclick: () => actions.save(card) }, "Save to the manager"));
    if (actions.dismiss) {
      buttons.push(h("button", { type: "button", class: "pw-btn", title: "Leave it alone until the File Manager is opened again", onclick: () => actions.dismiss(card, false) }, "Not now"));
      buttons.push(h("button", { type: "button", class: "pw-btn", title: "Never offer this connection again (you can bring such connections back in the detection settings)", onclick: () => actions.dismiss(card, true) }, "Never for this one"));
    }
  }
  return h("article", { class: `db-card db-card-${card.status}`, role: "group", "aria-label": `${info.label}: ${card.name}`, dataset: { key: card.key, status: card.status } },
    h("h4", { class: "db-card-title" }, h("span", { "aria-hidden": "true" }, `${info.icon} `), `${info.label}: `, h("span", { class: "pw-mono" }, card.name), card.status === "changed" ? h("span", { class: "db-changed-tag" }, " — changed") : null),
    card.status === "changed" ? changedNotice(card) : null,
    kv(card),
    provenance(card),
    card.ignored.length ? h("p", { class: "pw-hint" }, `Also set but not used for this connection: ${card.ignored.join(", ")}.`) : null,
    card.warnings.length ? h("ul", { class: "db-warnings", role: "note" }, card.warnings.map((w) => h("li", {}, h("span", { "aria-hidden": "true" }, "⚠ "), w))) : null,
    h("div", { class: "pw-row db-card-actions" }, buttons),
  );
}

function changedNotice(card) {
  return h("div", { class: "db-diff", role: "note" },
    h("p", {}, h("strong", {}, "Your environment changed since this was saved. "), `Update the saved connection${card.profileName ? ` "${card.profileName}"` : ""}?`),
    h("ul", {}, [
      ...(card.diff ?? []).map((d) => h("li", {}, `${FIELD_LABELS[d.field] ?? d.field}: `, h("code", {}, d.saved || "(empty)"), " → ", h("code", {}, d.now || "(empty)"))),
      card.passwordChanged ? h("li", {}, "Password: different (not shown)") : null,
    ]),
  );
}

/** After saving: the variables are no longer needed, and the person may switch the environment off for that engine. */
export async function showSaved(result, engine) {
  const info = engineInfo(engine);
  const names = result.noLongerNeeded ?? [];
  const inFile = names.some((n) => n.origin.includes(".env"));
  const body = [
    h("p", {}, result.already ? `"${result.profile.name}" was already saved, so nothing new was made.` : `"${result.profile.name}" is saved. Its password (if there is one) is in ${db.secretStore.persistent ? "your computer's keychain" : "memory until the File Manager closes"}.`),
    h("p", {}, "The studios now use the saved connection, so the environment variables aren't needed for it."),
    names.length ? h("div", { class: "db-nolonger" },
      h("p", {}, h("strong", {}, inFile ? "These variables are no longer needed:" : "These environment variables are no longer needed:"), " you can remove them from your shell profile or .env file if you like. Nothing is edited for you."),
      h("ul", { class: "db-names" }, names.map((n) => h("li", {}, h("code", {}, n.name), h("span", { class: "pw-hint" }, ` — ${n.origin}`)))),
    ) : null,
    h("p", { class: "pw-hint" }, `You can also tell the File Manager to stop using environment variables for ${info.label} altogether.`),
  ];
  const dlg = openDialog({ title: "Saved to the manager", body, describe: "The connection is saved.", buttons: [{ label: "Done", value: "done", primary: true }, { label: `Stop using environment variables for ${info.label}`, value: "stop" }] });
  if ((await dlg.result) === "stop") {
    try {
      await call("db/engine/save", { engine, useEnv: false });
      await loadOverview();
      toast(`${info.label} studios no longer use environment variables or .env files.`, { kind: "info" });
    } catch (err) {
      toast(errorText(err, "Couldn't change that."), { kind: "error" });
    }
  }
}

/** The actions behind the buttons of a card found in the environment. */
export function environmentActions(after = () => {}) {
  return {
    async save(card) {
      try {
        const r = await call("db/detect/save", { key: card.key });
        await loadOverview();
        await refreshDetect();
        after(r.profile);
        await showSaved(r, card.engine);
      } catch (err) {
        toast(errorText(err, "That couldn't be saved."), { kind: "error" });
      }
    },
    async dismiss(card, forever) {
      try {
        await call("db/detect/dismiss", { key: card.key, forever });
        await refreshDetect();
        if (forever) toast("That connection won't be offered again. You can bring it back in the detection settings.", { kind: "info" });
      } catch (err) {
        toast(errorText(err, "That didn't work."), { kind: "error" });
      }
    },
    async update(card) {
      try {
        await call("db/detect/update", { id: card.profileId });
        await loadOverview();
        await refreshDetect();
        toast("The saved connection was updated from your environment.", { kind: "info" });
      } catch (err) {
        toast(errorText(err, "That couldn't be updated."), { kind: "error" });
      }
    },
  };
}

/** The banner at the top of the Databases tab. */
export function renderBanner(box) {
  clear(box);
  const open = detected.cards.filter((c) => c.status === "new" || c.status === "changed");
  box.hidden = open.length === 0;
  if (!open.length) return;
  const actions = environmentActions();
  box.append(
    h("h3", { class: "db-found-title" }, h("span", { "aria-hidden": "true" }, "🔎 "), "Found in your environment"),
    h("p", { class: "pw-hint" }, "These connections are set in this program's environment variables or `.env` files. Save one to the manager and the variables are no longer needed. Nothing has been connected to, and passwords are never shown."),
    h("div", { class: "db-cards" }, open.map((c) => renderCard(c, actions))),
  );
}

/** Detection settings: look automatically? save automatically? and bring back what was put aside. */
export function renderDetectSettings(box) {
  clear(box);
  const auto = h("input", { type: "checkbox", checked: db.settings.detect.auto, id: "db-detect-auto" });
  const save = h("input", { type: "checkbox", checked: db.settings.detect.autoSave, id: "db-detect-save", disabled: !db.settings.detect.auto });
  const change = async (patch) => {
    try {
      const r = await call("db/detect/settings", patch);
      db.settings.detect = r.detect;
      auto.checked = r.detect.auto;
      save.checked = r.detect.autoSave;
      save.disabled = !r.detect.auto;
      await refreshDetect();
    } catch (err) {
      toast(errorText(err, "That couldn't be changed."), { kind: "error" });
    }
  };
  auto.addEventListener("change", () => change({ auto: auto.checked }));
  save.addEventListener("change", async () => {
    if (save.checked && !(await confirmBox({ title: "Save detected connections automatically?", message: "Connections found in your environment will be saved to the manager as soon as they are noticed, without asking. Their passwords go to the keychain. You can turn this off again at any time.", confirmLabel: "Save automatically" }))) {
      save.checked = false;
      return;
    }
    change({ autoSave: save.checked });
  });
  box.append(
    h("details", { class: "db-detect-settings" },
      h("summary", {}, "Detection settings"),
      h("label", { class: "db-check", for: "db-detect-auto" }, auto, " Detect my environment variables automatically"),
      h("label", { class: "db-check", for: "db-detect-save", title: "Off by default: saving always takes one click unless you turn this on." }, save, " Save detected connections automatically"),
      h("button", { type: "button", class: "pw-btn", title: "Offer the connections you chose 'Never for this one' for, again", onclick: async () => { await call("db/detect/restore"); await refreshDetect(); toast("Connections you put aside will be offered again.", { kind: "info" }); } }, "Offer put-aside connections again"),
    ),
  );
}
