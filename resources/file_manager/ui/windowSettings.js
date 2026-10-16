// Settings → Window: how the File Manager's window opens (fill the screen, remember my window, true full screen),
// what is remembered, and the way back to the default. Only in the desktop app; in a browser there is no window to manage.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { bridge, buildReport, hasDesktopWindow, pageMetrics, untilSettled } from "./windowState.js";

export const WINDOW_MODES = [
  ["fill", "Fill the screen (default)", "The window opens as large as the screen allows, keeping the menu bar and the Dock (or task bar) in view."],
  ["remember", "Remember my window", "The window opens with the size and position you last left it at."],
  ["fullscreen", "True full screen", "The window uses the computer's full-screen mode. On a Mac it gets its own desktop: press Right Option+/, or choose another window mode here, to leave it. Esc does not leave full screen, so it keeps working inside the tools."],
];

/** "Saved: 1280 × 820 at 120, 80", with what else is remembered. */
export function savedText(state) {
  if (!state) return "Nothing is saved yet: the window fills the screen.";
  const extra = [state.maximized ? "fills the screen" : "", state.fullscreen ? "full screen" : ""].filter(Boolean).join(", ");
  return `Saved: ${state.width} × ${state.height} at ${state.x}, ${state.y}${extra ? ` (${extra})` : ""}`;
}

const failure = (err) => toast(err instanceof ApiError ? err.message : "Something went wrong with the window.", { kind: "error" });

/** Forgets the remembered window and fills the screen now. */
export async function resetWindowToDefault() {
  try {
    await call("window/reset");
  } catch (err) {
    return failure(err);
  }
  await untilSettled(() => bridge.reset(), () => bridge.apply("fill"));
  toast("Window reset: the File Manager fills the screen.");
}

/** What the page knows beyond the window's frame (which the window process reads itself where it can). */
function pageFields() {
  const m = pageMetrics();
  return buildReport(null, m) ?? { screenWidth: Math.round(m.screenWidth), screenHeight: Math.round(m.screenHeight), dpr: m.dpr };
}

/** The Window section of the Settings dialog, or null when this isn't the desktop app. */
export function windowSection() {
  if (!hasDesktopWindow()) return null;
  const saved = h("p", { class: "hint", "data-window-saved": "" }, "");
  const radios = new Map();
  let known = null;

  async function refresh() {
    try {
      const { mode, state } = await call("window/get");
      known = state;
      for (const [value, input] of radios) input.checked = value === mode;
      saved.textContent = savedText(state);
    } catch {
      saved.textContent = "";
    }
  }

  const choose = async (mode) => {
    try {
      await call("window/set", { mode });
    } catch (err) {
      return failure(err);
    }
    const answer = await untilSettled(() => bridge.apply(mode), () => bridge.apply(mode));
    // "Remember my window" with nothing remembered yet remembers the window as it is now.
    if (mode === "remember" && !known) await bridge.save(pageFields());
    if (answer?.fellBack) toast("True full screen isn't available on this computer, so the window fills the screen instead.");
    refresh();
  };
  for (const [value] of WINDOW_MODES) {
    radios.set(value, h("input", { type: "radio", name: "fm-window-mode", value, onchange: (e) => { if (e.target.checked) choose(value); } }));
  }
  const group = h("div", { role: "radiogroup", "aria-labelledby": "fm-window-heading" },
    WINDOW_MODES.map(([value, label, tip]) => h("label", { class: "check", title: tip }, radios.get(value), h("span", {}, label))));

  const useNow = h("button", { type: "button", class: "btn", title: "Remembers how this window looks right now (its size, position and whether it fills the screen) and uses that the next time. Switches to “Remember my window”.",
    onclick: async () => {
      const answer = await bridge.save(pageFields());
      if (answer?.ok) toast("Saved: the window will open like this next time.");
      else toast("The window's size couldn't be read, so nothing was saved.", { kind: "error" });
      refresh();
    } }, "Use this window as my preference now");
  const reset = h("button", { type: "button", class: "btn", title: "Forgets the remembered window and makes the File Manager fill the screen again, right now.",
    onclick: async () => {
      await resetWindowToDefault();
      refresh();
    } }, "Reset window to default");

  refresh();
  return h("section", { class: "window-settings", "aria-labelledby": "fm-window-heading", "data-copy": "off" },
    h("h3", { id: "fm-window-heading" }, "Window"),
    h("p", { class: "hint" }, "The File Manager opens filling the screen. When you resize or move the window, it remembers that for next time. Reset goes back to filling the screen."),
    group,
    saved,
    h("div", { class: "range-row" }, useNow, reset),
  );
}
