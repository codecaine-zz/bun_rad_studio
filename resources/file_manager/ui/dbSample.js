// "New sample database…": pick one of the built-in, entirely synthetic sample datasets, choose a folder and a file name, and a
// brand-new SQLite file is created (never over an existing one) and saved as a connection. The server does all the work.
import { call } from "./api.js";
import { openDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { errorText, field } from "./dbState.js";
import { state } from "./state.js";

const fmt = (n) => Number(n).toLocaleString();
let catalogCache = null;

async function loadCatalog() {
  if (!catalogCache) catalogCache = await call("db/sample/catalog");
  return catalogCache;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Opens the dialog. Resolves with { path, summary, profile } after a sample was created, or null when cancelled. */
export async function showSampleDialog() {
  let cat;
  try {
    cat = await loadCatalog();
  } catch (err) {
    openDialog({ title: "New sample database", body: h("p", { class: "power-error", role: "alert" }, errorText(err, "The list of sample databases couldn't be loaded.")), buttons: [{ label: "Close", primary: true, value: null }] });
    return null;
  }
  const folderNow = state.location?.kind === "folder" && state.location.path ? state.location.path : state.home;
  let chosen = cat.datasets[0];
  let scale = "small";
  let nameTouched = false;

  const about = h("p", { class: "pw-hint db-sample-about", "aria-live": "polite" });
  const facts = h("p", { class: "pw-hint db-sample-facts" });
  const name = h("input", { type: "text", class: "text-input pw-mono", autocomplete: "off", spellcheck: "false", "aria-label": "File name", value: `sample_${chosen.id}` });
  const folder = h("input", { type: "text", class: "text-input pw-mono", autocomplete: "off", spellcheck: "false", "aria-label": "Folder for the new file", value: folderNow });
  const save = h("input", { type: "checkbox", checked: true, id: "db-sample-save" });
  const search = h("input", { type: "search", class: "text-input", placeholder: "Search the samples", "aria-label": "Search the sample databases", autocomplete: "off" });
  const list = h("div", { class: "db-sample-list", role: "radiogroup", "aria-label": "Sample database" });
  const scales = h("div", { class: "db-sample-scales", role: "radiogroup", "aria-label": "Amount of data" });

  const drawFacts = () => {
    about.textContent = chosen.description;
    const n = chosen.rows[scale];
    facts.textContent = `${chosen.tableCount} tables, ${chosen.viewCount} views, ${chosen.queryCount} example queries (saved in the _sample_queries table). ${fmt(n)} rows at ${cap(scale)}, about ${chosen.estimatedSeconds[scale]} s. ${chosen.syntheticNotice}`;
  };
  const drawScales = () => {
    scales.replaceChildren(
      ...cat.scales.map((s) => {
        const input = h("input", { type: "radio", name: "db-sample-scale", value: s, checked: s === scale, onchange: () => { scale = s; drawFacts(); } });
        return h("label", { class: "db-sample-scale", title: `${fmt(chosen.rows[s])} rows, about ${chosen.estimatedSeconds[s]} s` }, input, ` ${cap(s)} · ${fmt(chosen.rows[s])} rows`);
      }),
    );
  };
  const drawList = () => {
    const q = search.value.trim().toLowerCase();
    const shown = cat.datasets.filter((d) => !q || `${d.title} ${d.tagline} ${d.tags.join(" ")}`.toLowerCase().includes(q));
    list.replaceChildren(
      ...(shown.length
        ? shown.map((d) => {
            const input = h("input", {
              type: "radio", name: "db-sample", value: d.id, checked: d.id === chosen.id,
              onchange: () => {
                chosen = d;
                if (!nameTouched) name.value = `sample_${d.id}`;
                drawFacts();
                drawScales();
              },
            });
            return h("label", { class: "db-sample-item", title: d.tagline }, input, h("span", { class: "db-sample-title" }, d.title), h("span", { class: "pw-hint" }, ` ${d.tableCount} tables · ${d.viewCount} views · ${d.tags.join(", ")}`));
          })
        : [h("p", { class: "pw-hint", role: "status" }, "No sample matches that search.")]),
    );
  };
  search.addEventListener("input", drawList);
  name.addEventListener("input", () => { nameTouched = true; });
  drawList();
  drawScales();
  drawFacts();

  const dlg = openDialog({
    title: "New sample database",
    wide: true,
    body: [
      h("p", { class: "pw-hint" }, "Creates a new SQLite file with realistic but entirely synthetic data. An existing file is never overwritten."),
      search,
      list,
      about,
      h("div", { class: "db-field-label" }, "Amount of data"),
      scales,
      facts,
      field("Folder", folder, "An existing folder. None is created for you."),
      field("File name", name, ".sqlite is added when you leave it out."),
      h("label", { class: "db-sample-save" }, save, h("span", {}, " Also save it as a connection, so it can be opened in a studio window, a browser tab or an inline studio.")),
    ],
    buttons: [{ label: "Cancel", value: null }, { label: "Create sample database", value: "go", primary: true }],
    describe: "Choose a sample database, how much data, and where to create the SQLite file.",
    initialFocus: list.querySelector("input:checked") ?? search,
  });
  const go = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
  return await new Promise((resolve) => {
    go.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      dlg.setError("");
      go.disabled = true;
      go.textContent = "Creating…";
      dlg.el.setAttribute("aria-busy", "true");
      try {
        const r = await call("db/sample/create", { datasetId: chosen.id, scale, folder: folder.value, name: name.value, save: save.checked });
        dlg.close("go");
        resolve(r);
      } catch (err) {
        dlg.setError(errorText(err, "The sample database couldn't be created."));
        go.disabled = false;
        go.textContent = "Create sample database";
        dlg.el.removeAttribute("aria-busy");
      }
    }, true);
    dlg.result.then(() => resolve(null));
  });
}
