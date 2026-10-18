// The set-up form of the Watch tool: what to watch, what to run, and the options. It only draws and reads the
// fields; watch.js decides what to do with them.
import { h } from "./dom.js";

/** A labeled field: the label text is visible, and the tip shows when hovering the label or the control. */
function field(text, control, tip, extraClass = "") {
  control.title = tip;
  return h("label", { class: `pw-field watch-field ${extraClass}`.trim(), title: tip }, text, control);
}

function check(text, tip, checked) {
  const input = h("input", { type: "checkbox", title: tip, checked });
  return { input, el: h("label", { class: "watch-check", title: tip }, input, ` ${text}`) };
}

const listText = (items) => (items ?? []).join(", ");

/**
 * @param {{ presets: Array<{ id: string, label: string, command: string, hint: string }>, shells: Array<{ id: string, label: string }>, defaults: { exts: string[], ignore: string[], debounce: number }, maxCommandLength: number }} info
 * @param {{ onStart: () => void, currentFolder: () => string }} hooks
 */
export function buildWatchForm(info, { onStart, currentFolder }) {
  const preset = h("select", { class: "watch-select" },
    h("option", { value: "" }, "Custom: I'll type my own command"),
    info.presets.map((p) => h("option", { value: p.id }, p.label)));
  const presetHint = h("p", { class: "pw-hint watch-preset-hint" }, "Pick a ready-made command, or type your own below.");
  const command = h("input", { type: "text", class: "pw-mono watch-wide", spellcheck: "false", autocomplete: "off", maxlength: info.maxCommandLength, placeholder: "For example: bun test" });
  const path = h("input", { type: "text", class: "watch-path", spellcheck: "false", autocomplete: "off", placeholder: "For example: ~/Projects/my-app/src" });
  const cwd = h("input", { type: "text", class: "watch-path", spellcheck: "false", autocomplete: "off", placeholder: "Leave empty to use the watched folder" });
  const exts = h("input", { type: "text", spellcheck: "false", autocomplete: "off", placeholder: "ts, js, json (empty = every file)", value: listText(info.defaults.exts) });
  const ignore = h("input", { type: "text", spellcheck: "false", autocomplete: "off", placeholder: "node_modules, .git", value: listText(info.defaults.ignore) });
  const debounce = h("input", { type: "number", min: "50", max: "10000", step: "50", value: String(info.defaults.debounce), class: "watch-number" });
  const filters = h("input", { type: "text", spellcheck: "false", autocomplete: "off", placeholder: "Optional: only files whose path contains…" });
  const shell = h("select", { class: "watch-select" }, h("option", { value: "" }, "Default"), info.shells.map((s) => h("option", { value: s.id }, s.label)));

  const clear = check("Clear the console before each run", "Empties the console each time the command starts, so it only shows the latest run.", false);
  const postpone = check("Wait for the first change", "On: nothing runs until a file changes. Off: the command also runs once right after you start watching.", true);
  const restart = check("Restart on change", "On: if the command is still running when files change again, it is stopped and started afresh. Off: the change is ignored until it finishes.", true);
  const notify = check("Tell me when a run finishes", "Shows a small message when a run succeeds or fails.", true);

  const message = h("p", { class: "pw-status watch-message", role: "status" });
  const startButton = h("button", { type: "button", class: "pw-btn primary", title: "Start watching the folder. You will be asked to confirm the command first.", onclick: () => onStart() }, "▶ Start watching");

  preset.addEventListener("change", () => {
    const chosen = info.presets.find((p) => p.id === preset.value);
    presetHint.textContent = chosen ? chosen.hint : "Pick a ready-made command, or type your own below.";
    if (chosen) command.value = chosen.command;
    command.focus();
  });
  command.addEventListener("input", () => {
    const chosen = info.presets.find((p) => p.id === preset.value);
    if (chosen && chosen.command !== command.value) {
      preset.value = "";
      presetHint.textContent = "Pick a ready-made command, or type your own below.";
    }
  });

  const el = h("section", { class: "pw-card watch-form", "aria-label": "Set up a watcher" },
    h("h3", {}, "Set up a watcher"),
    h("p", { class: "pw-hint" }, "A watcher runs a command on your computer every time files in a folder change, like running your tests each time you save."),
    h("div", { class: "pw-row watch-grid" },
      field("Ready-made command", preset, "Fills in the command box for you. You can still edit the command afterwards."),
      field("Command to run", command, "The command that runs after files change, exactly as you would type it in a terminal.", "watch-grow")),
    presetHint,
    h("div", { class: "pw-row watch-grid" },
      field("Folder to watch", path, "The folder to keep an eye on, including everything inside it. You can type ~ for your home folder.", "watch-grow"),
      h("button", { type: "button", class: "pw-btn", title: "Fill in the folder you are looking at in the File Manager.", onclick: () => { path.value = currentFolder(); path.focus(); } }, "📁 Use current folder")),
    h("div", { class: "pw-row watch-grid" },
      field("Run the command in", cwd, "The folder the command starts in. Leave it empty to use the watched folder.", "watch-grow"),
      h("button", { type: "button", class: "pw-btn", title: "Run the command in the folder you are looking at in the File Manager.", onclick: () => { cwd.value = currentFolder(); cwd.focus(); } }, "📁 Use current folder")),
    h("div", { class: "pw-row watch-grid" },
      field("File types", exts, "Only changes to files with these endings start the command. Separate them with commas. Leave empty to react to every file.", "watch-grow"),
      field("Ignore (skip paths containing)", ignore, "Changes to paths containing any of these words are skipped. Separate them with commas.", "watch-grow"),
      field("Wait after a change (ms)", debounce, "Waits this many milliseconds after the last change before running, so saving many files at once only runs once. Between 50 and 10000.")),
    h("div", { class: "pw-row watch-checks" }, clear.el, postpone.el, restart.el, notify.el),
    h("details", { class: "watch-advanced" },
      h("summary", { title: "Extra options for people who know what they need." }, "More options"),
      h("div", { class: "pw-row watch-grid" },
        field("Only paths matching", filters, "Optional. Only changes to files whose path contains this text (or matches it as a pattern) start the command. Separate several with commas.", "watch-grow"),
        field("Run it with", shell, "Which command line program runs the command. The default is right for nearly everyone."))),
    h("div", { class: "pw-row" }, startButton, message));

  return {
    el,
    /** The values as typed. Folders are still text, to be resolved by the caller. */
    read() {
      return {
        command: command.value.trim(), path: path.value.trim(), cwd: cwd.value.trim(), exts: exts.value, ignore: ignore.value, filters: filters.value,
        shell: shell.value, debounce: Number(debounce.value) || info.defaults.debounce,
        clear: clear.input.checked, postponeInitial: postpone.input.checked, restart: restart.input.checked,
      };
    },
    notifyOn: () => notify.input.checked,
    write(v) {
      command.value = v.command ?? "";
      path.value = v.path ?? "";
      cwd.value = v.cwd ?? "";
      exts.value = listText(v.exts);
      ignore.value = listText(v.ignore);
      filters.value = listText(v.filters);
      debounce.value = String(v.debounce ?? info.defaults.debounce);
      shell.value = v.shell ?? "";
      clear.input.checked = v.clear === true;
      postpone.input.checked = v.postponeInitial !== false;
      restart.input.checked = v.restart !== false;
      preset.value = "";
    },
    setPath(value) {
      path.value = value;
    },
    hasPath: () => path.value.trim() !== "",
    focusCommand: () => command.focus(),
    setMessage(text, bad = false) {
      message.textContent = text;
      message.classList.toggle("pw-bad", bad);
    },
    setCanStart(can, reason) {
      startButton.disabled = !can;
      startButton.title = can ? "Start watching the folder. You will be asked to confirm the command first." : reason;
    },
  };
}
