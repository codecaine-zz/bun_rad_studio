/**
 * Runs the File Manager window's size and position in the window's process: places it at start-up from the saved
 * preference, answers the page's reports ("the window changed"), and applies "Fill the screen" / "True full screen" /
 * Reset right away. All native work goes through a `WindowNative`, so tests use a fake one.
 *
 * The window's own event loop blocks this process, so nothing here can run on a timer: the page asks. It calls
 * `fmWindowPoll()` about twice a second to learn the window's real frame (a web view can't tell its own position on
 * every system) and `fmWindowChanged(...)` when that really changed.
 */
import type { FrameInfo, WindowNative } from "../../windowNative.ts";
import {
  DEFAULT_WINDOW_SIZE,
  isWindowMode,
  mergeNormalBounds,
  planWindow,
  readWindowPrefs,
  reduceReport,
  resetWindowPrefs,
  sanitizeWindowState,
  writeWindowPrefs,
  type FmScreen,
  type WindowMode,
  type WindowPlan,
  type WindowPrefs,
} from "./fmWindow";

export interface WindowControllerOptions {
  native: WindowNative;
  dataDir: string;
  /** False when the person gave an explicit size on the command line: that is used once, and nothing is restored or saved. */
  persist?: boolean;
  /** The size of the window when it is not maximised and nothing is remembered. */
  defaults?: { width: number; height: number };
  now?: () => number;
  /** Reports this soon after the app itself moved the window are ignored (they are the app's own doing, not the person's). */
  graceMs?: number;
}

export interface ChangeResult {
  ok: boolean;
  /** The report was written as the new preference. */
  saved: boolean;
  /** Too soon after the app's own change: the page should send it again later. */
  ignored: boolean;
  mode: WindowMode;
  /** This change moved the preference to "Remember my window". */
  modeSwitched: boolean;
}

export interface ApplyResult {
  ok: boolean;
  /** False while the window is still on its way (leaving full screen takes a moment): the page asks again. */
  settled: boolean;
  mode: WindowMode;
  /** The wanted state wasn't possible here and the window fills the screen instead. */
  fellBack?: boolean;
}

export interface WindowController {
  prefs(): WindowPrefs;
  /** Where the window goes now: the saved preference against the screens that exist. */
  plan(): WindowPlan;
  /** Sizes, places and shows the window (hidden while it is being set up). */
  open(plan: WindowPlan): void;
  /** The window's real frame, or null when it can't be read. Also retries a "fill the screen" that wasn't possible yet. */
  poll(): FrameInfo | null;
  changed(report: unknown): ChangeResult;
  /** "Use this window as my preference now". */
  save(report?: unknown): { ok: boolean; mode: WindowMode };
  /** Forgets the preference and fills the screen now. */
  reset(): ApplyResult;
  /** Applies a mode to the open window now (the preference itself is saved by the server operation `window/set`). */
  apply(mode: unknown): ApplyResult;
  setAlwaysOnTop(on: unknown): { ok: boolean; alwaysOnTop: boolean; message?: string };
}

const guard = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const MAX_FILL_RETRIES = 12;

export function createWindowController(options: WindowControllerOptions): WindowController {
  const { native, dataDir } = options;
  const persist = options.persist !== false;
  const defaults = options.defaults ?? DEFAULT_WINDOW_SIZE;
  const now = options.now ?? Date.now;
  const graceMs = options.graceMs ?? 1500;
  let loaded: WindowPrefs = persist ? readWindowPrefs(dataDir) : { mode: "fill", state: null };
  let graceUntil = 0;
  let screens: FmScreen[] | null = null;
  let fillRetries = 0;
  let fillPending = false;

  const getScreens = () => (screens ??= guard(() => native.getScreens(), []));
  const startGrace = () => {
    graceUntil = now() + graceMs;
  };
  const workArea = () => getScreens()[0]?.work ?? null;

  /** Fills the usable screen. False while that isn't done yet (leaving full screen takes a moment). */
  function fill(): boolean {
    const frame = guard(() => native.getFrame(), null);
    if (frame?.fullscreen) {
      guard(() => native.setFullscreen(false), false);
      return false;
    }
    if (guard(() => native.maximize(), false)) return true;
    // Maximising isn't possible (yet): at least make the window as big as the usable screen.
    const work = workArea();
    if (work) guard(() => native.setBounds({ x: work.x, y: work.y, width: work.width, height: work.height }), undefined);
    return true;
  }

  return {
    prefs: () => loaded,
    plan() {
      const p = planWindow(loaded, getScreens(), defaults);
      return persist ? p : { ...p, mode: "normal" };
    },
    open(plan) {
      guard(() => native.hide(), undefined);
      guard(() => native.setBounds({ x: plan.x, y: plan.y, width: plan.width, height: plan.height }), undefined);
      if (plan.mode === "maximize") {
        if (!guard(() => native.maximize(), false)) {
          if (plan.work) guard(() => native.setBounds({ x: plan.work!.x, y: plan.work!.y, width: plan.work!.width, height: plan.work!.height }), undefined);
          fillPending = true;
        }
      } else if (plan.mode === "fullscreen") {
        if (!guard(() => native.setFullscreen(true), false)) {
          if (plan.work) guard(() => native.setBounds({ x: plan.work!.x, y: plan.work!.y, width: plan.work!.width, height: plan.work!.height }), undefined);
          fillPending = true;
        }
      }
      if (loaded.alwaysOnTop && !guard(() => native.setAlwaysOnTop?.(true), false)) {
        console.warn("The saved always-on-top preference could not be applied.");
      }
      guard(() => native.show(), undefined);
      startGrace();
    },
    poll() {
      if (fillPending && fillRetries++ < MAX_FILL_RETRIES) {
        if (guard(() => native.maximize(), false)) fillPending = false;
      }
      return guard(() => native.getFrame(), null);
    },
    changed(report) {
      const result = (extra: Partial<ChangeResult>): ChangeResult => ({ ok: true, saved: false, ignored: false, mode: loaded.mode, modeSwitched: false, ...extra });
      if (!persist) return result({});
      if (now() < graceUntil) return result({ ignored: true });
      try {
        // Read the file again: the Settings dialog may have changed the mode since.
        loaded = readWindowPrefs(dataDir);
        const r = reduceReport(loaded, report);
        if (!r.save) return result({});
        loaded = writeWindowPrefs(dataDir, r.prefs);
        return result({ saved: true, mode: loaded.mode, modeSwitched: r.modeSwitched });
      } catch {
        return result({ ok: false });
      }
    },
    save(report) {
      if (!persist) return { ok: false, mode: loaded.mode };
      try {
        const page = report && typeof report === "object" ? (report as Record<string, unknown>) : {};
        const frame = guard(() => native.getFrame(), null);
        const state = sanitizeWindowState({ ...page, ...(frame ?? {}) });
        if (!state) return { ok: false, mode: loaded.mode };
        const previous = readWindowPrefs(dataDir);
        loaded = writeWindowPrefs(dataDir, { ...previous, mode: "remember", state: mergeNormalBounds(previous.state, state) });
        return { ok: true, mode: loaded.mode };
      } catch {
        return { ok: false, mode: loaded.mode };
      }
    },
    reset() {
      if (loaded.alwaysOnTop && !guard(() => native.setAlwaysOnTop?.(false), false)) {
        console.warn("Could not turn off always-on-top while resetting the window.");
        return { ok: false, settled: false, mode: loaded.mode };
      }
      try {
        loaded = resetWindowPrefs(dataDir);
      } catch (error) {
        console.warn("Could not reset the window preference:", error);
        if (loaded.alwaysOnTop) guard(() => native.setAlwaysOnTop?.(true), false);
        return { ok: false, settled: false, mode: loaded.mode };
      }
      startGrace();
      return { ok: true, settled: fill(), mode: "fill" };
    },
    apply(mode) {
      if (!isWindowMode(mode)) return { ok: false, settled: false, mode: loaded.mode };
      startGrace();
      if (mode === "fill") return { ok: true, settled: fill(), mode };
      if (mode === "remember") return { ok: true, settled: true, mode };
      if (guard(() => native.setFullscreen(true), false)) {
        const frame = guard(() => native.getFrame(), null);
        return { ok: true, settled: frame ? frame.fullscreen : true, mode };
      }
      return { ok: true, settled: fill(), mode, fellBack: true };
    },
    setAlwaysOnTop(on) {
      const previous = loaded.alwaysOnTop === true;
      if (typeof on !== "boolean") return { ok: false, alwaysOnTop: previous, message: "Always on top must be on or off." };
      if (!persist) return { ok: false, alwaysOnTop: previous, message: "Window preferences are disabled when an explicit window size is supplied." };
      if (!guard(() => native.setAlwaysOnTop?.(on), false)) {
        return { ok: false, alwaysOnTop: previous, message: "Always on top isn't available for this window." };
      }
      try {
        loaded = writeWindowPrefs(dataDir, { ...readWindowPrefs(dataDir), alwaysOnTop: on });
        return { ok: true, alwaysOnTop: on };
      } catch (error) {
        if (!guard(() => native.setAlwaysOnTop?.(previous), false)) console.warn("Could not restore the previous always-on-top setting.");
        console.warn("Could not save always-on-top:", error);
        return { ok: false, alwaysOnTop: previous, message: "The always-on-top preference couldn't be saved." };
      }
    },
  };
}

export interface Bindable {
  bind(name: string, callback: (...args: any[]) => unknown): void;
}

/** The functions the page can call (`window.fmWindowPoll()` and so on). They never throw: a failure is an `{ ok: false }` answer. */
export function bindWindowControl(webview: Bindable, controller: WindowController): void {
  const safe = <A extends unknown[], R>(fn: (...a: A) => R, fallback: R) => (...a: A): R => guard(() => fn(...a), fallback);
  webview.bind("fmWindowPoll", safe(() => controller.poll(), null));
  webview.bind("fmWindowChanged", safe((report: unknown) => controller.changed(report), { ok: false, saved: false, ignored: false, mode: "fill" as WindowMode, modeSwitched: false }));
  webview.bind("fmWindowSave", safe((report?: unknown) => controller.save(report), { ok: false, mode: "fill" as WindowMode }));
  webview.bind("fmWindowReset", safe(() => controller.reset(), { ok: false, settled: false, mode: "fill" as WindowMode }));
  webview.bind("fmWindowApply", safe((mode: unknown) => controller.apply(mode), { ok: false, settled: false, mode: "fill" as WindowMode }));
  webview.bind("fmWindowAlwaysOnTop", safe((on: unknown) => controller.setAlwaysOnTop(on), { ok: false, alwaysOnTop: false, message: "Couldn't change always on top." }));
}

export interface ManagedWindowOptions<W extends Bindable> {
  /** Creates the window (with this size, which is only the default: the real size is set next). */
  createWindow: (size: { width: number; height: number }) => W;
  createNative: (window: W) => WindowNative;
  dataDir: string;
  /** Forget the saved window first (`--reset-window`). */
  reset?: boolean;
  /** An explicit size from the command line. */
  fixedSize?: { width: number; height: number };
  now?: () => number;
}

export interface ManagedWindow<W extends Bindable> {
  window: W;
  controller: WindowController;
  plan: WindowPlan;
}

/**
 * Opens the window the way the preference says: create it (it is taken off the screen at once, before anything can
 * be drawn), size and place it, maximise or full-screen it, show it, and give the page its functions. Nothing here
 * throws: whatever the system refuses, the window just stays at the size it was made with.
 */
export function openManagedWindow<W extends Bindable>(options: ManagedWindowOptions<W>): ManagedWindow<W> {
  if (options.reset) guard(() => resetWindowPrefs(options.dataDir), undefined);
  const defaults = options.fixedSize ?? DEFAULT_WINDOW_SIZE;
  const window = options.createWindow(defaults);
  const native = options.createNative(window);
  guard(() => native.hide(), undefined);
  const controller = createWindowController({ native, dataDir: options.dataDir, persist: !options.fixedSize, defaults, now: options.now });
  const plan = controller.plan();
  controller.open(plan);
  bindWindowControl(window, controller);
  return { window, controller, plan };
}
