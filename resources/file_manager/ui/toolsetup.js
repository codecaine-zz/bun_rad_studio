// One-click setup of the helper programs: choose what to install (everything is ticked, so one click installs all),
// and the computer's package manager does the work. Installs that need a password (apt, dnf, pacman, or Homebrew when
// it isn't there yet) run in the built-in Terminal, where the person can watch and type the password; the rest run
// as background tasks.
import { ApiError, call } from "./api.js";
import { confirmBox, openDialog } from "./dialogs.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { terminalAvailable, typeInTerminal } from "./terminal.js";
import { plural } from "./util.js";

const MANAGER_WORDS = {
  brew: "Homebrew",
  apt: "apt (the Debian and Ubuntu installer)",
  dnf: "dnf (the Fedora installer)",
  pacman: "pacman (the Arch installer)",
};

const describeChoice = (c) => `${MANAGER_WORDS[c.id] ?? c.name}${c.installsItself ? ": Homebrew isn't installed yet, so it is installed and set up first" : ""}${c.needsPassword ? ". Asks for your computer's password in the Terminal" : ". No password needed"}`;

/** Sends the script to the Terminal (with a password prompt there), or starts background tasks when no password is needed. */
async function run({ ids, choice, options, startJob, closeOuter }) {
  const direct = options.platform === "win32" || (choice && choice.id === "brew" && !choice.installsItself);
  if (direct) {
    closeOuter?.();
    return startJob(ids);
  }
  if (!terminalAvailable()) {
    toast("The built-in Terminal isn't available here, so use the commands shown next to each program.", { kind: "error" });
    return null;
  }
  try {
    const plan = await call("tools/setup", { tools: ids, manager: choice.id, confirm: true });
    closeOuter?.();
    typeInTerminal(`${plan.command}\r`);
    const skipped = plan.skipped.length ? ` (${plural(plan.skipped.length, "program")} can't be installed this way: ${plan.skipped.map((s) => s.name).join(", ")})` : "";
    toast(`The installer is running in the Terminal at the bottom${plan.needsPassword ? ". Type your computer's password there when it asks (nothing shows as you type)" : ""}. When it says "All done", open Convert & process → Helper programs → Check again${skipped}.`, { kind: "info", timeout: 60000 });
    return plan;
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "The installer couldn't be prepared.", { kind: "error" });
    return null;
  }
}

/** The list of what to install, with a tick for each program. Resolves { ids, choice } or null. */
function pickPrograms(options, missing, preselectMain) {
  let choice = options.choices[0] ?? null;
  const boxes = new Map();
  const note = h("p", { class: "hint", role: "status" });
  const managerBox = h("div", { class: "setup-managers", role: "radiogroup", "aria-label": "How to install" });
  const list = h("div", { class: "setup-list" });
  const buttonsEl = {};

  const available = (t) => !choice || t.packages[choice.id] !== false;
  const chosenIds = () => [...boxes].filter(([id, box]) => box.checked && !box.disabled).map(([id]) => id);

  function refresh() {
    for (const t of missing) {
      const box = boxes.get(t.id);
      box.disabled = !available(t);
      if (box.disabled) box.checked = false;
      box.closest("label").classList.toggle("setup-off", box.disabled);
    }
    const n = chosenIds().length;
    note.textContent = choice ? describeChoice(choice) + "." : "Each program is installed with the package manager that Windows offers (winget or Scoop).";
    if (buttonsEl.install) {
      buttonsEl.install.textContent = n ? `Install ${plural(n, "program")}` : "Choose something to install";
      buttonsEl.install.disabled = n === 0;
    }
  }

  if (options.choices.length > 1) {
    for (const c of options.choices) {
      const radio = h("input", { type: "radio", name: "setup-manager", value: c.id, checked: c.id === choice.id, onchange: () => { choice = c; refresh(); } });
      managerBox.append(h("label", { class: "check", title: describeChoice(c) }, radio, h("span", {}, c.name)));
    }
  }
  const row = (t) => {
    const box = h("input", { type: "checkbox", checked: preselectMain ? !t.optional : true, onchange: refresh });
    boxes.set(t.id, box);
    return h("label", { class: "check setup-row", title: t.what }, box, h("span", {}, h("strong", {}, t.name), " — ", t.what, t.size ? ` ${t.size[0].toUpperCase()}${t.size.slice(1)}.` : ""));
  };
  list.append(h("h3", { class: "tools-heading" }, "Main helpers"), ...missing.filter((t) => !t.optional).map(row), h("h3", { class: "tools-heading" }, "More helpers"), ...missing.filter((t) => t.optional).map(row));
  const all = (value) => () => { for (const [id, box] of boxes) if (!box.disabled) box.checked = value; refresh(); };
  const mainOnly = () => { for (const t of missing) boxes.get(t.id).checked = !t.optional && !boxes.get(t.id).disabled; refresh(); };
  const tools = h("div", { class: "tool-row-buttons" },
    h("button", { type: "button", class: "btn", title: "Tick every program in the list", onclick: all(true) }, "Select all"),
    h("button", { type: "button", class: "btn", title: "Tick only the main helpers for pictures, video, sound and documents", onclick: mainOnly }, "Only the main ones"),
    h("button", { type: "button", class: "btn", title: "Untick everything", onclick: all(false) }, "Select none"));
  const dlg = openDialog({
    title: "Install helper programs",
    wide: true,
    body: [h("p", {}, "Everything that is missing is ticked, so you can install it all with one click. Untick anything you don't want."), options.choices.length > 1 ? managerBox : null, tools, list, note],
    buttons: [{ label: "Cancel", value: null }, { label: "Install", value: "go", primary: true }],
  });
  buttonsEl.install = dlg.el.querySelector(".dialog-buttons .btn.primary");
  refresh();
  return dlg.result.then((answer) => (answer === "go" ? { ids: chosenIds(), choice } : null));
}

/**
 * Starts the setup. `mode` is "everything" (asks once, then installs all that is missing) or "choose" (the list).
 * `startJob(ids)` starts the background install; `closeOuter()` closes the Convert window so the Terminal can be used.
 */
export async function startSetup({ mode, startJob, closeOuter }) {
  let options;
  try {
    options = await call("tools/setup/options");
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "The list of programs couldn't be loaded.", { kind: "error" });
    return null;
  }
  const missing = options.tools.filter((t) => !t.installed);
  if (!missing.length) {
    toast("All the helper programs are already installed.", { kind: "info" });
    return null;
  }
  if (mode === "choose") {
    const picked = await pickPrograms(options, missing, false);
    return picked && picked.ids.length ? run({ ids: picked.ids, choice: picked.choice, options, startJob, closeOuter }) : null;
  }
  const choice = options.choices[0] ?? null;
  const usable = missing.filter((t) => !choice || t.packages[choice.id] !== false);
  if (!usable.length) {
    toast("None of the missing programs can be installed with the package manager found here. Use the download links next to each one.", { kind: "error" });
    return null;
  }
  const big = usable.filter((t) => t.size);
  const ok = await confirmBox({
    title: "Install everything that is missing?",
    message: `This installs ${plural(usable.length, "program")}${big.length ? ` (${big.map((t) => `${t.name}: ${t.size}`).join("; ")})` : ""}. ${choice ? describeChoice(choice) + "." : "Windows' own installer (winget or Scoop) does the work."}`,
    confirmLabel: `Install all ${usable.length}`,
    details: usable.map((t) => t.name),
  });
  return ok ? run({ ids: usable.map((t) => t.id), choice, options, startJob, closeOuter }) : null;
}
