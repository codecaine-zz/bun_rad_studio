// "Versions" section of the Dev tool: compare two version numbers, check one against a range (^1.2.0, >=2 <3), sort a list,
// and check the project folder's required versions against the developer tools installed here (Bun.semver on the server).
import { call } from "./api.js";
import { copyItemButton } from "./copyclip.js";
import { announce, h } from "./dom.js";
import { btn, createStatus, createTable, errorText, field } from "./devCore.js";

const input = (id, label, title, placeholder, value = "") => {
  const el = h("input", { type: "text", id, class: "dev-input", spellcheck: "false", autocomplete: "off", title, placeholder, value, "aria-label": label });
  return { el, field: field(label, el) };
};

export function createVersions(env) {
  // ---- Compare ----------------------------------------------------------------------------------------------------
  const a = input("dev-ver-a", "First version", "A version with three numbers, like 1.4.2. A leading v is fine.", "1.4.2");
  const b = input("dev-ver-b", "Second version", "The version to compare it with, like 1.10.0.", "1.10.0");
  const compareStatus = createStatus();
  const compareNotes = h("ul", { class: "pw-hint dev-notes" });
  const compareButton = btn("Compare", "Say which of the two versions is older. Numbers are compared as numbers, so 1.10.0 is newer than 1.9.0.", async () => {
    compareNotes.replaceChildren();
    try {
      const r = await call("dev/semver", { action: "compare", a: a.el.value, b: b.el.value });
      compareStatus.set(`${r.order === 0 ? "＝" : r.order < 0 ? "↓" : "↑"} ${r.message}`);
      compareNotes.replaceChildren(...r.notes.map((n) => h("li", {}, n)));
      announce(r.message);
    } catch (err) {
      compareStatus.set(errorText(err, "Those couldn't be compared."), true);
    }
  }, { primary: true });
  const compareCard = h("div", { class: "pw-card", "data-copy": "Compare two versions" }, h("h3", {}, "Compare two versions"),
    h("p", { class: "pw-hint" }, "Which version is older? Versions are compared the way package managers do it (semantic versioning): 1.10.0 is newer than 1.9.0, and a pre-release like 1.0.0-beta comes before 1.0.0."),
    h("div", { class: "pw-row" }, a.field, b.field, compareButton), compareStatus.el, compareNotes);

  // ---- Range ------------------------------------------------------------------------------------------------------
  const version = input("dev-ver-v", "Version", "The version to check, like 1.5.0.", "1.5.0");
  const range = input("dev-ver-r", "Range", "What is allowed: ^1.2.0 (compatible with 1.2.0), ~1.2.0 (patch updates only), >=2 <3, 1.x, or alternatives joined with ||.", "^1.2.0");
  const rangeStatus = createStatus();
  const rangeNotes = h("ul", { class: "pw-hint dev-notes" });
  const rangeButton = btn("Check", "Find out whether the version is allowed by the range, the way npm and Bun decide when installing.", async () => {
    rangeNotes.replaceChildren();
    try {
      const r = await call("dev/semver", { action: "range", version: version.el.value, range: range.el.value });
      rangeStatus.set(`${r.satisfies ? "✔" : "✖"} ${r.message}`);
      rangeNotes.replaceChildren(...r.notes.map((n) => h("li", {}, n)));
      announce(r.message);
    } catch (err) {
      rangeStatus.set(errorText(err, "That couldn't be checked."), true);
    }
  }, { primary: true });
  const rangeCard = h("div", { class: "pw-card", "data-copy": "Check a version against a range" }, h("h3", {}, "Check a version against a range"),
    h("p", { class: "pw-hint" }, "A range says which versions a project accepts. ^1.2.0 means 1.2.0 up to (not including) 2.0.0; ~1.2.0 means 1.2.x only; >=2 <3 means any 2.x; 1.x means any 1.something."),
    h("div", { class: "pw-row" }, version.field, range.field, rangeButton), rangeStatus.el, rangeNotes);

  // ---- Sort -------------------------------------------------------------------------------------------------------
  const list = h("textarea", { id: "dev-ver-list", class: "dev-input dev-list", rows: "5", spellcheck: "false", title: "One version on each line. Lines that aren't versions are reported, not guessed at.", placeholder: "1.10.0\n1.2.0\n1.9.3-beta.1", "aria-label": "Versions to sort, one on each line" });
  const descending = h("input", { type: "checkbox", id: "dev-ver-desc", title: "Put the newest version first instead of last." });
  const sortStatus = createStatus();
  const sorted = h("pre", { class: "pw-out dev-sorted", tabindex: "0", "aria-label": "Sorted versions", title: "The versions, sorted. Use the Copy button to copy them." });
  const sortCopy = copyItemButton({ label: "the sorted versions", getText: () => sorted.textContent ?? "" });
  const sortButton = btn("Sort", "Sort the versions in the box by their real order (not alphabetically).", async () => {
    try {
      const r = await call("dev/semver", { action: "sort", text: list.value, descending: descending.checked });
      sorted.textContent = r.sorted.join("\n");
      const extra = [r.duplicates ? `${r.duplicates} repeated ${r.duplicates === 1 ? "line was" : "lines were"} counted once.` : "", r.invalid.length ? `Not versions, left out: ${r.invalid.map(([n, t]) => `line ${n} “${t}”`).join(", ")}.` : ""].filter(Boolean).join(" ");
      sortStatus.set(`${r.sorted.length} ${r.sorted.length === 1 ? "version" : "versions"} sorted${descending.checked ? ", newest first" : ", oldest first"}. ${extra}`.trim());
    } catch (err) {
      sorted.textContent = "";
      sortStatus.set(errorText(err, "That couldn't be sorted."), true);
    }
  }, { primary: true });
  const sortCard = h("div", { class: "pw-card", "data-copy": "Sort versions" }, h("h3", {}, "Sort a list of versions"),
    h("p", { class: "pw-hint" }, "Paste versions (for example the output of git tag), one on each line. They are sorted by version number, so 1.10.0 comes after 1.9.0."),
    list, h("div", { class: "pw-row" }, field("Newest first", descending, { inline: true }), sortButton), sortStatus.el, h("div", { class: "dev-sorted-row" }, sortCopy), sorted);

  // ---- Project ----------------------------------------------------------------------------------------------------
  const projectStatus = createStatus();
  const projectHost = h("div", {});
  const MARK = { ok: "✓ OK", older: "! Too old", newer: "! Too new", missing: "✗ Not installed", unknown: "? Can't tell" };
  const projectButton = btn("Check this project", "Read package.json (engines), .tool-versions, .nvmrc and similar files in the folder above, and compare them with the developer tools installed on this computer. Nothing is changed.", async () => {
    const root = env.getRoot();
    if (!root) return projectStatus.set("Choose a folder at the top first.", true);
    projectStatus.set("Reading the project and asking your tools for their versions…");
    try {
      const r = await call("dev/semver", { action: "project", root });
      if (!r.requirements.length) {
        projectHost.replaceChildren();
        return projectStatus.set(r.sources.length ? `Found ${r.sources.join(", ")}, but nothing in it names a tool and version to check.` : "This folder has no package.json engines, .tool-versions, .nvmrc or similar file that asks for a version.");
      }
      const table = createTable({ caption: "Versions the project asks for", columns: [
        { key: "tool", label: "Tool", rowHeader: true }, { key: "wanted", label: "Asked for" }, { key: "installed", label: "Installed" }, { key: "status", label: "Result" }, { key: "source", label: "Written in" }] });
      table.render(r.requirements.map((x) => ({ cells: [x.tool, x.wanted, x.installed ?? "—", h("span", { title: x.message }, MARK[x.status]), x.source] })));
      projectHost.replaceChildren(table.el);
      const problems = r.requirements.filter((x) => x.status !== "ok").length;
      projectStatus.set(problems ? `${problems} of ${r.requirements.length} need attention. Hover a result for details.` : `All ${r.requirements.length} requirements are met.`, problems > 0);
    } catch (err) {
      projectStatus.set(errorText(err, "The project couldn't be checked."), true);
    }
  }, { primary: true });
  const projectCard = h("div", { class: "pw-card", "data-copy": "Does this computer meet the project's versions" }, h("h3", {}, "Does this computer meet the project's versions?"),
    h("p", { class: "pw-hint" }, "Reads the engines in package.json, .tool-versions, .nvmrc and similar files in the folder chosen above, and compares them with the Node, Bun, Python and other tools installed here."),
    h("div", { class: "pw-row" }, projectButton), projectStatus.el, projectHost);

  return { el: h("div", { class: "dev-section" }, compareCard, rangeCard, sortCard, projectCard) };
}
