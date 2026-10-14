// The diff of the selected file, and the buttons that copy or save the changes and the report.
import { h } from "./dom.js";
import { renderDiff } from "./sdview.js";

const WAITING = "Select a file in the list above to see exactly what would change in it.";

/** @param {{ onCopy: () => void, onSavePatch: () => void, onSaveReport: () => void, onUseFolder: () => void }} actions */
export function buildInspector(actions) {
  const what = h("p", { class: "pw-status", role: "status" }, WAITING);
  const pane = h("div", { class: "pw-out sd-diff", tabindex: "0", role: "region", "aria-label": "Changes in the selected file" });
  const legend = h("p", { class: "pw-hint" }, "In the changes, lines starting with + are added, lines starting with − are removed, and the other lines are shown so you can see where you are.");
  const button = (label, tip, run, primary = false) => h("button", { type: "button", class: `pw-btn${primary ? " primary" : ""}`, title: tip, onclick: run }, label);
  const copy = button("Copy the changes", "Copy the changes of the ticked files to the clipboard, as text you can paste into an email or a review.", actions.onCopy);
  const savePatch = button("Save the changes as a patch file", "Save the changes of the ticked files as a new .patch file. An existing file is never replaced.", actions.onSavePatch);
  const saveReport = button("Save a report", "Save a short report (a table of the files and counts) as a new file. An existing file is never replaced.", actions.onSaveReport);
  const folder = h("input", { type: "text", title: "The folder where the new file will be made. You can type ~/Documents. Nothing already there is overwritten.", placeholder: "Folder to save into", spellcheck: "false", autocomplete: "off", class: "pw-mono" });
  const folderLabel = h("label", { class: "pw-field sd-field sd-grow", title: "The folder where the new file will be made." }, h("span", {}, "Save into folder"), folder);
  const useFolder = button("Use the open folder", "Fill in the folder you were looking at in the file list.", actions.onUseFolder);

  const el = h("section", { class: "pw-card", "aria-label": "Changes in the selected file" },
    h("h3", {}, "Changes in the selected file"), what, pane, legend,
    h("div", { class: "pw-row sd-grid" }, folderLabel, useFolder),
    h("div", { class: "pw-row" }, copy, savePatch, saveReport),
  );
  pane.hidden = true;

  return {
    el,
    folder,
    /** Shows `diff` for `path`; `note` replaces the diff when there is nothing to show. */
    show(path, diff, note, truncated) {
      const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
      what.textContent = note ? `${name}: ${note}` : `${name}${truncated ? " (the start of the changes; the rest is too long to show)" : ""}`;
      pane.hidden = !diff;
      if (diff) renderDiff(pane, diff);
    },
    clear() {
      what.textContent = WAITING;
      pane.hidden = true;
    },
    /** Which buttons make sense now. */
    setEnabled({ diff, report }) {
      copy.disabled = !diff;
      savePatch.disabled = !diff;
      saveReport.disabled = !report;
      const why = "Press Preview changes first, and tick at least one file.";
      copy.title = diff ? "Copy the changes of the ticked files to the clipboard, as text you can paste into an email or a review." : why;
      savePatch.title = diff ? "Save the changes of the ticked files as a new .patch file. An existing file is never replaced." : why;
      saveReport.title = report ? "Save a short report (a table of the files and counts) as a new file. An existing file is never replaced." : "Press Count matches or Preview changes first.";
    },
  };
}
