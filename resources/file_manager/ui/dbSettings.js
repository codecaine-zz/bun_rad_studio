// Per-engine settings: "defaults for this engine" (used when a connection leaves a field blank, and when none is chosen)
// and the switch for environment variables. Order of precedence: connection, these defaults, environment, studio defaults.
import { call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { db, engineInfo, errorText, field, loadOverview } from "./dbState.js";
import { toast } from "./menus.js";

/** Opens the settings of one engine. Resolves true when they were saved. */
export async function showEngineSettings(engine) {
  const info = engineInfo(engine);
  const s = db.settings.engines[engine] ?? { useEnv: true, defaults: {} };
  const d = s.defaults ?? {};
  const useEnv = h("input", { type: "checkbox", checked: s.useEnv, id: "db-use-env" });
  const host = h("input", { type: "text", class: "text-input", value: d.host ?? "", autocomplete: "off", spellcheck: "false" });
  const port = h("input", { type: "number", class: "text-input", value: d.port ?? "", min: "1", max: "65535", placeholder: info.defaultPort ? String(info.defaultPort) : "" });
  const user = h("input", { type: "text", class: "text-input", value: d.user ?? "", autocomplete: "off", spellcheck: "false" });
  const database = h("input", { type: "text", class: "text-input", value: d.database ?? "", autocomplete: "off", spellcheck: "false" });
  const schema = h("input", { type: "text", class: "text-input", value: d.schema ?? "", autocomplete: "off", spellcheck: "false" });
  const tls = h("select", { class: "text-input" }, [["", "Not set"], ["true", "On"], ["false", "Off"]].map(([v, l]) => h("option", { value: v, selected: (d.tls === undefined ? "" : String(d.tls)) === v }, l)));
  const sqlite = engine === "sqlite";
  const body = h("div", { class: "db-editor" },
    h("p", { class: "pw-hint" }, "Order of precedence: the connection you pick, then these defaults, then environment variables, then the studio's own defaults."),
    h("div", { class: "db-checks db-wide" }, h("label", { class: "db-check", for: "db-use-env", title: "On: with no connection chosen the studio reads this program's environment variables and .env files, as it always did, and a connection may fall back to them for blank fields. Off: they are never used for this engine." }, useEnv, " When no connection is selected, start the studio with my environment variables as before")),
    sqlite ? h("p", { class: "pw-hint" }, "SQLite has no other defaults: a connection is just a file.") : h("div", { class: "db-form" },
      field("Default host", host), field("Default port", port), field("Default user", user), field("Default database", database),
      ...(engine === "postgres" ? [field("Default schema", schema)] : []), field("Default TLS", tls),
    ),
  );
  const dlg = openDialog({ title: `${info.label}: defaults and environment`, wide: true, body, describe: "Choose defaults for this engine and whether environment variables are used.", buttons: [{ label: "Cancel", value: null }, { label: "Save", value: "save", primary: true }] });
  const save = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  return await new Promise((resolve) => {
    save.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      save.disabled = true;
      try {
        await call("db/engine/save", {
          engine, useEnv: useEnv.checked,
          defaults: sqlite ? {} : { host: host.value.trim(), port: port.value.trim(), user: user.value.trim(), database: database.value.trim(), schema: schema.value.trim(), ...(tls.value ? { tls: tls.value === "true" } : {}) },
        });
        await loadOverview();
        toast(`${info.label} settings saved.`, { kind: "info" });
        dlg.close("saved");
      } catch (err) {
        dlg.setError(errorText(err, "That couldn't be saved."));
        save.disabled = false;
      }
    }, true);
    dlg.result.then((v) => resolve(v === "saved"));
  });
}
