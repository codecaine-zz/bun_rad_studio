// The form half of the Replace tool: what to find and replace, where to look, and what to do about backups.
// It only collects and shows values; sd.js decides what to do with them.
import { h } from "./dom.js";

let counter = 0;

/** A labelled text box (a <label> wrapping the input, so clicking the words focuses the box). */
function textField({ label, tip, value = "", placeholder = "", cls = "", mono = false }) {
  const input = h("input", { type: "text", value, placeholder, title: tip, spellcheck: "false", autocomplete: "off", class: mono ? "pw-mono" : null });
  const el = h("label", { class: `pw-field sd-field ${cls}`.trim(), title: tip }, h("span", {}, label), input);
  return { el, input };
}

function checkbox(label, tip, checked = false) {
  const input = h("input", { type: "checkbox", title: tip, checked });
  input.checked = checked;
  return { el: h("label", { class: "sd-check", title: tip }, input, h("span", {}, label)), input };
}

const lines = (text) => text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

/**
 * @param {{ presets: Array<any>, defaultExcludes: string[] }} info
 * @param {{ onEnter: () => void, useSelected: () => void, useFolder: () => void }} actions
 */
export function buildForm(info, actions) {
  const find = textField({ label: "Find", tip: "What to look for. By default this is a pattern (a regular expression, like \\d+ for numbers); tick “Plain text” to look for exactly what you type.", placeholder: "function (\\w+)Async", cls: "sd-grow", mono: true });
  const replace = textField({ label: "Replace with", tip: "What to put instead. In a pattern, $1, $2 and so on stand for the parts matched by the (brackets) in Find. Leave it empty to delete what was found.", placeholder: "function $1Sync", cls: "sd-grow", mono: true });
  const literal = checkbox("Plain text", "Look for exactly the characters you typed, so symbols like . * ( ) have no special meaning. Turn this on if you are not sure what a pattern is.");
  const wholeWord = checkbox("Whole word only", "Only match when the text is a whole word, not part of a longer one: “cat” is found in “cat sat” but not in “category”.");
  const ignoreCase = checkbox("Ignore capital letters", "Treat A and a as the same letter.");
  const escapes = checkbox("Replacement has \\n and \\t", "Turn \\n in the replacement into a line break, \\t into a tab and \\\\ into one backslash.");
  const flags = textField({ label: "Pattern flags", tip: "Advanced. Letters that change how a pattern works: g (all matches, always on), m (^ and $ match at each line), s (. also matches line breaks), i (ignore capitals), u (full Unicode). Leave as g if unsure.", value: "g", cls: "sd-flags", mono: true });

  const presetSelect = h("select", { title: "Fill in Find and Replace for a common job, like trimming spaces at the end of lines. You can still change them afterwards.", "aria-label": "Presets" },
    h("option", { value: "" }, "Choose a ready-made job…"), info.presets.map((p, i) => h("option", { value: String(i) }, p.label)));
  const preset = h("label", { class: "pw-field sd-field", title: "Fill in Find and Replace for a common job." }, h("span", {}, "Presets"), presetSelect);
  const swap = h("button", { type: "button", class: "pw-btn", title: "Swap what is in Find and Replace with. Handy for reversing a change.", onclick: () => {
    const f = find.input.value;
    find.input.value = replace.input.value;
    replace.input.value = f;
    changed();
  } }, "⇄ Swap Find and Replace");

  const targets = h("textarea", { rows: "3", title: "The files and folders to search, one per line. Folders are searched including everything inside them. You can type ~ for your home folder.", placeholder: "/Users/you/project/src", spellcheck: "false", class: "pw-mono sd-targets" });
  const targetsLabel = h("label", { class: "pw-field sd-field sd-grow", title: "The files and folders to search, one per line." }, h("span", {}, "Files and folders to search (one per line)"), targets);
  const useSelected = h("button", { type: "button", class: "pw-btn", title: "Fill in the items you have selected in the file list.", onclick: actions.useSelected }, "Use the selected items");
  const useFolder = h("button", { type: "button", class: "pw-btn", title: "Fill in the folder you were looking at in the file list.", onclick: actions.useFolder }, "Use the open folder");
  const exts = textField({ label: "Only these file types", tip: "Leave empty to look in every text file. Or list endings like ts, md, json to look only in those files.", placeholder: "ts, md, json", cls: "sd-narrow" });
  const exclude = textField({ label: "Skip names like", tip: "Files or folders to leave out, separated by commas or spaces: *.min.js, vendor, test/**. * stands for any letters.", placeholder: "*.min.js, vendor", cls: "sd-narrow" });
  const skipDefaults = checkbox(`Skip ${info.defaultExcludes.join(", ")}`, "Leave out folders that hold other programs' files or build results. Untick only if you really want to change files in them.", true);
  const hidden = checkbox("Include hidden files and folders", "Also search files and folders whose names start with a dot, like .env. They are skipped by default.");
  const backup = checkbox("Keep a backup of each changed file", "Before a file is changed, save its old content next to it, like notes.txt.bak. An existing backup is never overwritten.");
  const backupExt = textField({ label: "Backup ending", tip: "What the backup copy's name ends with, for example .bak or .orig.", value: ".bak", cls: "sd-ext", mono: true });

  const listeners = [];
  const presetListeners = [];
  const changed = () => listeners.forEach((fn) => fn());
  for (const input of [find.input, replace.input, flags.input, targets, exts.input, exclude.input, literal.input, wholeWord.input, ignoreCase.input, escapes.input, skipDefaults.input, hidden.input]) {
    input.addEventListener("input", changed);
    input.addEventListener("change", changed);
  }
  for (const input of [find.input, replace.input, flags.input, exts.input, exclude.input]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.onEnter();
      }
    });
  }
  presetSelect.addEventListener("change", () => {
    const p = info.presets[Number(presetSelect.value)];
    presetSelect.value = "";
    if (!p) return;
    find.input.value = p.find;
    replace.input.value = p.replace;
    flags.input.value = p.flags || "g";
    literal.input.checked = !!p.literal;
    wholeWord.input.checked = !!p.wholeWord;
    ignoreCase.input.checked = !!p.ignoreCase;
    escapes.input.checked = !!p.escapes;
    changed();
    presetListeners.forEach((fn) => fn(p));
  });

  const heading = (text, id) => h("h3", { id }, text);
  const id1 = `sd-h-${++counter}`;
  const id2 = `sd-h-${++counter}`;
  const el = h("div", { class: "sd-form" },
    h("section", { class: "pw-card", "aria-labelledby": id1 },
      heading("What to change", id1),
      h("div", { class: "pw-row sd-grid" }, find.el, replace.el),
      h("div", { class: "pw-row sd-checks" }, literal.el, wholeWord.el, ignoreCase.el, escapes.el),
      h("div", { class: "pw-row sd-grid" }, flags.el, preset, swap),
    ),
    h("section", { class: "pw-card", "aria-labelledby": id2 },
      heading("Where to look", id2),
      h("div", { class: "pw-row sd-grid" }, targetsLabel, h("div", { class: "sd-stack" }, useSelected, useFolder)),
      h("div", { class: "pw-row sd-grid" }, exts.el, exclude.el),
      h("div", { class: "pw-row sd-checks" }, skipDefaults.el, hidden.el),
      h("div", { class: "pw-row sd-grid" }, backup.el, backupExt.el),
    ),
  );

  return {
    el,
    targets,
    find: find.input,
    /** Called whenever something that changes the result is edited. */
    onChange: (fn) => listeners.push(fn),
    onPreset: (fn) => presetListeners.push(fn),
    targetLines: () => lines(targets.value),
    values: () => ({
      find: find.input.value, replace: replace.input.value, literal: literal.input.checked, wholeWord: wholeWord.input.checked, ignoreCase: ignoreCase.input.checked,
      escapes: escapes.input.checked, flags: flags.input.value.trim() || "g", exts: exts.input.value, exclude: exclude.input.value,
      defaultExcludes: skipDefaults.input.checked, hidden: hidden.input.checked,
    }),
    backup: () => ({ backup: backup.input.checked, backupExt: backupExt.input.value.trim() || ".bak" }),
    setTargets(paths) {
      const next = paths.join("\n");
      if (targets.value === next) return;
      targets.value = next;
      changed();
    },
    clear() {
      find.input.value = "";
      replace.input.value = "";
      changed();
    },
  };
}
