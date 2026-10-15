// Settings → Keyboard shortcuts: see every shortcut, change it by pressing the new keys, and put it back. A change that would
// clash with another action (or use a key the computer or the text needs) is refused with a sentence saying why.
import { confirmBox, openDialog } from "./dialogs.js";
import { announce, h } from "./dom.js";
import { keysOf, rejectedChanges } from "./keymap.js";
import { saveSettings } from "./nav.js";
import { ACTIONS, FIXED, SCOPES, canonical, checkAssign, defaultsFor, formatShortcut, sanitizeOverrides, specFromEvent } from "./shortcuts.js";
import { state } from "./state.js";
import { toast } from "./menus.js";

const MAX_PER_ACTION = 3;

/** Every action grouped for display: [{ scope, groups: [{ name, items: [...] }] }]. */
function sections() {
  return Object.keys(SCOPES).map((scope) => {
    const groups = new Map();
    for (const a of ACTIONS.filter((x) => x.scope === scope)) {
      if (!groups.has(a.group)) groups.set(a.group, []);
      groups.get(a.group).push(a);
    }
    return { scope, groups: [...groups].map(([name, items]) => ({ name, items })) };
  }).filter((s) => s.groups.length);
}

const sameList = (a, b, platform) => a.length === b.length && a.every((k, i) => canonical(k, platform) === canonical(b[i], platform));

/**
 * Saves a new list of shortcuts for one action. `overrides` start from what is saved now; the result is cleaned by the same rules
 * the server uses, so what is shown is what will be kept.
 */
async function saveFor(id, specs) {
  const next = { ...(state.settings.shortcuts ?? {}), [id]: specs };
  await saveSettings({ shortcuts: sanitizeOverrides(next, state.platform) });
}

export function showShortcutsDialog() {
  const platform = state.platform;
  const search = h("input", { type: "search", class: "input", placeholder: "Search shortcuts", "aria-label": "Search shortcuts" });
  const status = h("p", { class: "shortcut-status", role: "status", "aria-live": "polite" }, "Click a shortcut, then press the new keys. Esc cancels.");
  const list = h("div", { class: "shortcut-list" });
  let recording = null; // { id, index, stop }

  const allKeys = () => new Map(ACTIONS.map((a) => [a.id, keysOf(a.id)]));
  const say = (message, bad = false) => {
    status.textContent = message;
    status.classList.toggle("shortcut-bad", bad);
    announce(message);
  };

  function stopRecording() {
    if (recording) window.removeEventListener("keydown", recording.onKey, true);
    recording = null;
  }

  async function commit(action, index, spec) {
    const mine = [...keysOf(action.id)];
    const others = new Map(allKeys());
    const without = mine.filter((_, i) => i !== index);
    others.set(action.id, without);
    const problem = checkAssign(action, spec, others, platform);
    if (problem) return say(`${problem.reason} Nothing was changed.`, true);
    const specs = index >= mine.length ? [...mine, spec] : mine.map((k, i) => (i === index ? spec : k));
    await saveFor(action.id, specs);
    say(`“${action.label}” is now ${formatShortcut(spec, platform)}.`);
    draw();
  }

  function record(action, index, button) {
    stopRecording();
    const old = button.textContent;
    button.textContent = "Press the new keys…";
    button.classList.add("recording");
    const finish = () => {
      stopRecording();
      draw();
    };
    // The window sees the key before the dialog does, so Esc here cancels the recording and not the dialog.
    const onKey = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        say("Cancelled. Nothing was changed.");
        return finish();
      }
      const got = specFromEvent(e, platform);
      if (got === null) return; // only a modifier so far
      if (got.error) {
        say(got.error, true);
        return finish();
      }
      finish();
      await commit(action, index, got.spec);
    };
    recording = { id: action.id, index, onKey, restore: old };
    window.addEventListener("keydown", onKey, true);
    say(`Press the keys for “${action.label}”. Esc cancels.`);
  }

  function row(action) {
    const specs = keysOf(action.id);
    const defaults = defaultsFor(action, platform);
    const chips = specs.map((spec, i) => {
      const chip = h("button", { type: "button", class: "shortcut-chip", title: "Click, then press the new keys", "aria-label": `Change ${formatShortcut(spec, platform)} for ${action.label}`, onclick: (e) => record(action, i, e.currentTarget) }, formatShortcut(spec, platform));
      const remove = h("button", { type: "button", class: "shortcut-x", title: "Remove this shortcut", "aria-label": `Remove ${formatShortcut(spec, platform)} from ${action.label}`, onclick: async () => {
        await saveFor(action.id, specs.filter((_, j) => j !== i));
        say(`Removed ${formatShortcut(spec, platform)} from “${action.label}”.`);
        draw();
      } }, "×");
      return h("span", { class: "shortcut-slot" }, chip, remove);
    });
    if (!specs.length) chips.push(h("span", { class: "shortcut-none" }, "No shortcut"));
    const add = specs.length < MAX_PER_ACTION
      ? h("button", { type: "button", class: "shortcut-add", title: specs.length ? "Add another shortcut" : "Choose a shortcut", "aria-label": `Add a shortcut for ${action.label}`, onclick: (e) => record(action, specs.length, e.currentTarget) }, specs.length ? "＋" : "Set…")
      : null;
    const changed = !sameList(specs, defaults, platform);
    const reset = changed ? h("button", { type: "button", class: "shortcut-reset", title: "Put back the original shortcuts", "aria-label": `Reset ${action.label}`, onclick: async () => {
      const next = { ...(state.settings.shortcuts ?? {}) };
      delete next[action.id];
      await saveSettings({ shortcuts: sanitizeOverrides(next, platform) });
      say(`“${action.label}” is back to ${defaults.length ? defaults.map((d) => formatShortcut(d, platform)).join(" or ") : "no shortcut"}.`);
      draw();
    } }, "Reset") : null;
    return h("div", { class: "shortcut-row", dataset: { action: action.id } }, h("span", { class: "shortcut-label" }, action.label), h("span", { class: "shortcut-keys" }, chips, add), reset);
  }

  function draw() {
    const q = search.value.trim().toLowerCase();
    const parts = [];
    for (const s of sections()) {
      const body = [];
      for (const g of s.groups) {
        const items = g.items.filter((a) => !q || `${a.label} ${g.name} ${keysOf(a.id).map((k) => formatShortcut(k, platform)).join(" ")}`.toLowerCase().includes(q));
        if (!items.length) continue;
        body.push(h("h4", {}, g.name), ...items.map(row));
      }
      if (body.length) parts.push(h("section", {}, h("h3", {}, SCOPES[s.scope]), ...body));
    }
    const fixed = FIXED.filter((x) => !q || `${x.label} ${x.keys.join(" ")}`.toLowerCase().includes(q));
    if (fixed.length) {
      parts.push(h("section", {}, h("h3", {}, "Fixed keys (can't be changed)"), ...fixed.map((x) => h("div", { class: "shortcut-row shortcut-fixed" }, h("span", { class: "shortcut-label" }, `${x.label}${x.scope === "code" ? " (Code editor)" : ""}`), h("span", { class: "shortcut-keys" }, x.keys.map((k) => h("kbd", { class: "shortcut-kbd" }, formatShortcut(k, platform))))))));
    }
    const bad = rejectedChanges();
    if (bad.length && !q) {
      parts.unshift(h("p", { class: "dialog-error", role: "alert" }, `${bad.length} saved shortcut${bad.length === 1 ? " was" : "s were"} left out because ${bad.length === 1 ? "it clashes" : "they clash"} with something else: ${bad.map((b) => `${formatShortcut(b.spec, platform)} (${ACTIONS.find((a) => a.id === b.id)?.label})`).join(", ")}.`));
    }
    if (!parts.length) parts.push(h("p", { class: "hint" }, "No shortcut matches that."));
    list.replaceChildren(...parts);
  }

  search.addEventListener("input", draw);
  draw();
  const dlg = openDialog({
    title: "Keyboard shortcuts",
    wide: true,
    describe: "Change the keys that start actions. A shortcut that another action already uses is refused.",
    body: [
      h("p", { class: "hint" }, "Click a shortcut and press the keys you want. Each action can have up to three. A key that is already used, or that the computer or the text needs, is refused with a reason. Changes are saved at once."),
      search,
      status,
      list,
    ],
    buttons: [
      { label: "Reset all", value: "reset" },
      { label: "Done", primary: true, value: true },
    ],
    initialFocus: search,
  });
  dlg.result.then(async (v) => {
    stopRecording();
    if (v !== "reset") return;
    if (!(await confirmBox({ title: "Reset every shortcut?", message: "All shortcuts go back to the ones the program came with. Your changes are lost.", confirmLabel: "Reset all", danger: true }))) return;
    await saveSettings({ shortcuts: {} });
    toast("Every shortcut is back to its original keys.", { kind: "success" });
  });
  return dlg;
}
