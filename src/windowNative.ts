/**
 * The native window layer for programs that want to size, place, maximise and full-screen their window and ask
 * where it is. It wraps the platform calls behind one small interface (`WindowNative`), so the code that decides
 * what to do (fmWindowControl.ts) can be tested with a fake one.
 *
 * Coordinates are the window's top-left corner measured from the primary screen's top-left corner, y downwards (what
 * Windows uses; macOS's bottom-left origin is converted here).
 *
 *   macOS    NSWindow through libobjc: `zoom:` (fills the usable screen, keeping the menu bar and Dock), `toggleFullScreen:`,
 *            `setFrameTopLeftPoint:` and `stringWithSavedFrame` (the frame as text: Bun can't receive an NSRect struct).
 *            The screens (with their usable areas) come from one short JavaScript-for-Automation call.
 *   Windows  user32 (ShowWindow, SetWindowPos, GetWindowRect, IsZoomed, window styles for full screen). Not run in CI.
 *   Linux    GTK can't be called safely from Bun (see index.ts), so: the window's size from webview-bun, the screens from
 *            `xrandr`, maximise / full screen through `wmctrl` when it is installed on X11. Nothing can place the window.
 *
 * Every call is defensive: it never throws, and says "not possible" (false / null) so the caller can fall back.
 */
import { dlopen, FFIType, CString, ptr, type Pointer } from "bun:ffi";
import { spawnSync } from "child_process";
import type { SizeHint, Webview } from "webview-bun";
import type { FmScreen, Rect } from "./features/filemanager/fmWindow.ts";

/** How the window is now. */
export interface FrameInfo extends Rect {
  maximized: boolean;
  fullscreen: boolean;
}

export interface WindowBounds {
  width: number;
  height: number;
  /** null: let the system center the window. */
  x: number | null;
  y: number | null;
}

export type NativeWindowBackdrop = "none" | "vibrancy" | "mica" | "mica-alt" | "acrylic";

export interface WindowAppearanceOptions {
  /** Whether the active theme is dark (syncs macOS NSAppearance and Windows DWMWA_USE_IMMERSIVE_DARK_MODE). */
  dark?: boolean;
  /** Native OS window material (macOS vibrancy, Windows 11 DWM Mica / Mica Alt / Acrylic, or "none" fallback). */
  backdrop?: NativeWindowBackdrop;
  /** Windows 11 DWM corner preference (true = DWMWCP_ROUND, false = DWMWCP_ROUNDSMALL). */
  roundedCorners?: boolean;
}

export interface WindowNative {
  /** The monitors that exist now; the first is the primary. Empty when they can't be found out. */
  getScreens(): FmScreen[];
  /** Takes the window off the screen (and puts it back with `show`), so sizing it is not seen. */
  hide(): void;
  show(): void;
  setBounds(bounds: WindowBounds): void;
  /** Fills the screen's usable area. True when the window now does. */
  maximize(): boolean;
  unmaximize(): void;
  /** Enters or leaves the system's full-screen mode. True when the window is (or is going to be) in the wanted state. */
  setFullscreen(on: boolean): boolean;
  /** Optional platform support; changes stacking without moving, resizing or activating the window. */
  setAlwaysOnTop?(on: boolean): boolean;
  /** Optional platform support; syncs native macOS NSAppearance/Vibrancy or Windows 11/10 DWM Dark Mode & Mica/Acrylic backdrop with automatic RDP/legacy fallback. */
  setWindowAppearance?(opts: WindowAppearanceOptions): boolean;
  /** The window's frame and state, or null when it can't be read (the page's own numbers are then used). */
  getFrame(): FrameInfo | null;
}

/** webview-bun's `SizeHint.NONE` (imported as a type only, so this file loads without the native library). */
const NO_HINT = 0 as SizeHint;
const P = FFIType.pointer;
const sends = new Map<string, any>();
let registerSelector: ((name: Buffer) => Pointer) | undefined;

/** `objc_msgSend` with a given signature (each signature needs its own binding). */
function send(args: FFIType[], returns: FFIType): any {
  const key = `${args.join(",")}>${returns}`;
  let fn = sends.get(key);
  if (!fn) {
    fn = dlopen("libobjc.dylib", { objc_msgSend: { args, returns } }).symbols.objc_msgSend;
    sends.set(key, fn);
  }
  return fn;
}

const selectors = new Map<string, Pointer>();

function sel(name: string): Pointer {
  let cached = selectors.get(name);
  if (cached !== undefined) return cached;
  registerSelector ??= dlopen("libobjc.dylib", { sel_registerName: { args: [FFIType.cstring], returns: P } }).symbols.sel_registerName as unknown as (name: Buffer) => Pointer;
  cached = registerSelector(Buffer.from(`${name}\0`));
  selectors.set(name, cached);
  return cached;
}

const ok = (fn: () => void): boolean => {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------------------------------------------- macOS

/** The screens from AppKit: "x,y,w,h,visibleX,visibleY,visibleW,visibleH" per screen, bottom-left origin. */
const MAC_SCREENS_SCRIPT = 'ObjC.import("AppKit");var o=[],s=$.NSScreen.screens;for(var i=0;i<s.count;i++){var f=s.objectAtIndex(i).frame,v=s.objectAtIndex(i).visibleFrame;o.push([f.origin.x,f.origin.y,f.size.width,f.size.height,v.origin.x,v.origin.y,v.size.width,v.size.height].join(","))}o.join(";")';

/** Converts the AppKit text (bottom-left origin, y up) to screens with a top-left origin measured from the primary screen. */
export function parseMacScreens(text: string): FmScreen[] {
  const rows = text.trim().split(";").map((row) => row.split(",").map(Number)).filter((r) => r.length >= 8 && r.every(Number.isFinite));
  if (!rows.length) return [];
  const primaryHeight = rows[0]![3]!;
  return rows.map((r) => {
    const [fx, fy, fw, fh, vx, vy, vw, vh] = r as [number, number, number, number, number, number, number, number];
    return {
      x: fx,
      y: primaryHeight - (fy + fh),
      width: fw,
      height: fh,
      work: { x: vx, y: primaryHeight - (vy + vh), width: vw, height: vh },
    };
  });
}

/** "x y w h screenX screenY screenW screenH" (a saved NSWindow frame, bottom-left origin) to a top-left frame. */
export function parseMacFrame(text: string, primaryHeight: number): Rect | null {
  const n = text.trim().split(/\s+/).map(Number);
  if (n.length < 4 || !n.slice(0, 4).every(Number.isFinite) || !Number.isFinite(primaryHeight)) return null;
  const [x, y, w, h] = n as [number, number, number, number];
  return { x, y: primaryHeight - (y + h), width: w, height: h };
}

let macKeyBeepSilenced = false;
/**
 * Silences the macOS AppKit `NSBeep()` alert sound when function keys (e.g. F11 / NSF11FunctionKey) or custom shortcuts
 * are handled in JavaScript inside WKWebView without a matching NSMenuItem in the native responder chain.
 */
export function silenceMacKeyBeep(): void {
  if (macKeyBeepSilenced || process.platform !== "darwin") return;
  macKeyBeepSilenced = true;
  ok(() => {
    const objc = dlopen("libobjc.dylib", {
      objc_getClass: { args: [FFIType.cstring], returns: P },
      class_getMethodImplementation: { args: [P, P], returns: P },
      class_replaceMethod: { args: [P, P, P, FFIType.cstring], returns: P },
    }).symbols;
    const nsObject = objc.objc_getClass(Buffer.from("NSObject\0"));
    const nsResponder = objc.objc_getClass(Buffer.from("NSResponder\0"));
    const noopImp = nsObject ? objc.class_getMethodImplementation(nsObject, sel("self")) : null;
    if (noopImp && nsResponder) {
      objc.class_replaceMethod(nsResponder, sel("noResponderFor:"), noopImp, Buffer.from("v@::\0"));
    }
  });
  ok(() => {
    const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
      CGSSetSymbolicHotKeyEnabled: { args: [FFIType.i32, FFIType.bool], returns: FFIType.i32 },
    }).symbols;
    // Symbolic hotkeys 36 (F11) & 37 (Shift+F11) are Mission Control "Show Desktop", which swallows F11 before the app receives it.
    cg.CGSSetSymbolicHotKeyEnabled(36, false);
    cg.CGSSetSymbolicHotKeyEnabled(37, false);
  });
}

function macNative(wv: Webview): WindowNative {
  silenceMacKeyBeep();
  const win = (): Pointer => wv.unsafeWindowHandle as Pointer;
  let screens: FmScreen[] | null = null;
  let primaryHeight = 0;

  const getScreens = (): FmScreen[] => {
    if (screens) return screens;
    try {
      const out = spawnSync("osascript", ["-l", "JavaScript", "-e", MAC_SCREENS_SCRIPT], { encoding: "utf8", timeout: 3000 });
      screens = out.status === 0 ? parseMacScreens(String(out.stdout)) : [];
    } catch {
      screens = [];
    }
    if (!screens.length) {
      try {
        const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
          CGMainDisplayID: { args: [], returns: FFIType.u32 },
          CGDisplayPixelsWide: { args: [FFIType.u32], returns: FFIType.u64 },
          CGDisplayPixelsHigh: { args: [FFIType.u32], returns: FFIType.u64 },
        });
        const id = cg.symbols.CGMainDisplayID();
        const width = Number(cg.symbols.CGDisplayPixelsWide(id));
        const height = Number(cg.symbols.CGDisplayPixelsHigh(id));
        const menuBar = 38;
        if (width > 0 && height > 0) screens = [{ x: 0, y: 0, width, height, work: { x: 0, y: menuBar, width, height: Math.max(1, height - menuBar) } }];
      } catch {}
    }
    primaryHeight = screens?.[0]?.height ?? 0;
    return (screens ??= []);
  };

  const flag = (name: string): boolean => Boolean(send([P, P], FFIType.u8)(win(), sel(name)));
  const isFullscreen = (): boolean => (BigInt(send([P, P], FFIType.u64)(win(), sel("styleMask"))) & (1n << 14n)) !== 0n;
  const activateAndOrderFront = () => {
    send([P, P, P], FFIType.void)(win(), sel("makeKeyAndOrderFront:"), null);
    try {
      const objc = dlopen("libobjc.dylib", { objc_getClass: { args: [FFIType.cstring], returns: P } }).symbols;
      const nsAppClass = objc.objc_getClass(Buffer.from("NSApplication\0"));
      const nsApp = nsAppClass ? send([P, P], P)(nsAppClass, sel("sharedApplication")) : null;
      if (nsApp) send([P, P, FFIType.bool], FFIType.void)(nsApp, sel("activateIgnoringOtherApps:"), true);
    } catch {}
  };

  return {
    getScreens,
    hide: () => void ok(() => send([P, P, P], FFIType.void)(win(), sel("orderOut:"), null)),
    show: () => void ok(activateAndOrderFront),
    setBounds({ width, height, x, y }) {
      ok(() => { wv.size = { width, height, hint: NO_HINT }; });
      if (x !== null && y !== null) {
        getScreens();
        if (primaryHeight > 0) ok(() => send([P, P, FFIType.f64, FFIType.f64], FFIType.void)(win(), sel("setFrameTopLeftPoint:"), x, primaryHeight - y));
      } else {
        ok(() => send([P, P], FFIType.void)(win(), sel("center")));
      }
    },
    maximize() {
      try {
        if (isFullscreen()) return false;
        if (!flag("isZoomed")) send([P, P, P], FFIType.void)(win(), sel("zoom:"), null);
        return flag("isZoomed");
      } catch {
        return false;
      }
    },
    unmaximize() {
      ok(() => { if (flag("isZoomed")) send([P, P, P], FFIType.void)(win(), sel("zoom:"), null); });
    },
    setFullscreen(on) {
      try {
        if (isFullscreen() === on) return true;
        // The window needs the full-screen behavior switched on first (NSWindowCollectionBehaviorFullScreenPrimary).
        const behavior = BigInt(send([P, P], FFIType.u64)(win(), sel("collectionBehavior")));
        send([P, P, FFIType.u64], FFIType.void)(win(), sel("setCollectionBehavior:"), behavior | 128n);
        if (on && !flag("isVisible")) activateAndOrderFront();
        send([P, P, P], FFIType.void)(win(), sel("toggleFullScreen:"), null);
        return true;
      } catch {
        return false;
      }
    },
    setWindowAppearance(opts) {
      return ok(() => {
        const objc = dlopen("libobjc.dylib", { objc_getClass: { args: [FFIType.cstring], returns: P } }).symbols;
        const nsString = objc.objc_getClass(Buffer.from("NSString\0"));
        const nsAppearance = objc.objc_getClass(Buffer.from("NSAppearance\0"));
        if (!nsString || !nsAppearance) return;
        const vibrant = opts.backdrop && opts.backdrop !== "none";
        const name = opts.dark !== false
          ? (vibrant ? "NSAppearanceNameVibrantDark" : "NSAppearanceNameDarkAqua")
          : (vibrant ? "NSAppearanceNameVibrantLight" : "NSAppearanceNameAqua");
        const str = send([P, P, FFIType.cstring], P)(nsString, sel("stringWithUTF8String:"), Buffer.from(`${name}\0`));
        const app = str ? send([P, P, P], P)(nsAppearance, sel("appearanceNamed:"), str) : null;
        if (app) send([P, P, P], FFIType.void)(win(), sel("setAppearance:"), app);
      });
    },
    getFrame() {
      try {
        getScreens();
        const text = send([P, P], P)(win(), sel("stringWithSavedFrame"));
        if (!text) return null;
        const chars = send([P, P], P)(text, sel("UTF8String"));
        const rect = chars ? parseMacFrame(String(new CString(chars)), primaryHeight) : null;
        return rect ? { ...rect, maximized: flag("isZoomed"), fullscreen: isFullscreen() } : null;
      } catch {
        return null;
      }
    },
  };
}

// -------------------------------------------------------------------------------------------------------------- Windows

function windowsNative(wv: Webview): WindowNative {
  const hwnd = (): Pointer => wv.unsafeWindowHandle as Pointer;
  const user32 = () => dlopen("user32.dll", {
    ShowWindow: { args: [P, FFIType.i32], returns: FFIType.bool },
    BringWindowToTop: { args: [P], returns: FFIType.bool },
    SetForegroundWindow: { args: [P], returns: FFIType.bool },
    GetForegroundWindow: { args: [], returns: P },
    GetWindowThreadProcessId: { args: [P, P], returns: FFIType.u32 },
    AttachThreadInput: { args: [FFIType.u32, FFIType.u32, FFIType.bool], returns: FFIType.bool },
    IsZoomed: { args: [P], returns: FFIType.bool },
    SetWindowPos: { args: [P, P, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.u32], returns: FFIType.bool },
    GetWindowRect: { args: [P, P], returns: FFIType.bool },
    GetSystemMetrics: { args: [FFIType.i32], returns: FFIType.i32 },
    SystemParametersInfoW: { args: [FFIType.u32, FFIType.u32, P, FFIType.u32], returns: FFIType.bool },
    GetWindowLongPtrW: { args: [P, FFIType.i32], returns: FFIType.i64 },
    SetWindowLongPtrW: { args: [P, FFIType.i32, FFIType.i64], returns: FFIType.i64 },
    MonitorFromWindow: { args: [P, FFIType.u32], returns: P },
    GetMonitorInfoW: { args: [P, P], returns: FFIType.bool },
  }).symbols;
  const GWL_STYLE = -16;
  const WS_BORDERED = 0xc40000n; // WS_CAPTION | WS_THICKFRAME
  const SWP_FRAME = 0x0004 | 0x0010 | 0x0020; // NOZORDER | NOACTIVATE | FRAMECHANGED
  let before: { style: bigint; rect: Rect; maximized: boolean } | null = null;

  const rectOf = (u: ReturnType<typeof user32>): Rect | null => {
    const r = new Int32Array(4);
    if (!u.GetWindowRect(hwnd(), ptr(r))) return null;
    return { x: r[0]!, y: r[1]!, width: r[2]! - r[0]!, height: r[3]! - r[1]! };
  };
  const monitorRects = (u: ReturnType<typeof user32>): { frame: Rect; work: Rect } | null => {
    const info = new Int32Array(10); // MONITORINFO: cbSize, rcMonitor, rcWork, dwFlags
    info[0] = 40;
    if (!u.GetMonitorInfoW(u.MonitorFromWindow(hwnd(), 2), ptr(info))) return null;
    const r = (i: number): Rect => ({ x: info[i]!, y: info[i + 1]!, width: info[i + 2]! - info[i]!, height: info[i + 3]! - info[i + 1]! });
    return { frame: r(1), work: r(5) };
  };
  const fullscreenNow = (u: ReturnType<typeof user32>) => (BigInt(u.GetWindowLongPtrW(hwnd(), GWL_STYLE)) & WS_BORDERED) === 0n;

  return {
    getScreens() {
      try {
        const u = user32();
        const primary: Rect = { x: 0, y: 0, width: u.GetSystemMetrics(0), height: u.GetSystemMetrics(1) };
        const wa = new Int32Array(4);
        const work = u.SystemParametersInfoW(0x30, 0, ptr(wa), 0) ? { x: wa[0]!, y: wa[1]!, width: wa[2]! - wa[0]!, height: wa[3]! - wa[1]! } : primary;
        const screens: FmScreen[] = [{ ...primary, work }];
        // The area of the whole desktop beyond the primary monitor: left, right, above and below it.
        const vx = u.GetSystemMetrics(76), vy = u.GetSystemMetrics(77), vw = u.GetSystemMetrics(78), vh = u.GetSystemMetrics(79);
        const strips: Rect[] = [
          { x: vx, y: vy, width: -vx, height: vh },
          { x: primary.width, y: vy, width: vx + vw - primary.width, height: vh },
          { x: 0, y: vy, width: primary.width, height: -vy },
          { x: 0, y: primary.height, width: primary.width, height: vy + vh - primary.height },
        ];
        for (const s of strips) if (vw > 0 && vh > 0 && s.width > 0 && s.height > 0) screens.push({ ...s, work: s });
        return screens;
      } catch {
        return [];
      }
    },
    hide: () => void ok(() => user32().ShowWindow(hwnd(), 0)),
    show() {
      try {
        const u = user32();
        const window = hwnd();
        u.ShowWindow(window, 5);
        u.BringWindowToTop(window);
        if (u.SetForegroundWindow(window)) return;
        const foreground = u.GetForegroundWindow();
        const foregroundThread = foreground ? u.GetWindowThreadProcessId(foreground, null) : 0;
        const kernel32 = dlopen("kernel32.dll", { GetCurrentThreadId: { args: [], returns: FFIType.u32 } });
        try {
          const currentThread = kernel32.symbols.GetCurrentThreadId();
          // A hidden launcher may not own the foreground input queue. Share it only for this startup activation.
          if (foregroundThread && foregroundThread !== currentThread && u.AttachThreadInput(currentThread, foregroundThread, true)) {
            try {
              u.BringWindowToTop(window);
              if (u.SetForegroundWindow(window)) return;
            } finally {
              if (!u.AttachThreadInput(currentThread, foregroundThread, false)) console.warn("Could not detach the Windows foreground input queue.");
            }
          }
        } finally {
          kernel32.close();
        }
        console.warn("Windows declined the request to bring the window to the foreground. Select it from the taskbar.");
      } catch (error) {
        console.warn("Could not show and activate the Windows window:", error);
      }
    },
    setBounds({ width, height, x, y }) {
      ok(() => {
        const u = user32();
        let px = x, py = y;
        if (px === null || py === null) {
          const screen = u.GetSystemMetrics(0) > 0 ? { w: u.GetSystemMetrics(0), h: u.GetSystemMetrics(1) } : null;
          px = screen ? Math.max(0, Math.floor((screen.w - width) / 2)) : 0;
          py = screen ? Math.max(0, Math.floor((screen.h - height) / 2)) : 0;
        }
        // Outer size, as read back by GetWindowRect (webview-bun's `size` is the inner size and would grow the window each time).
        u.SetWindowPos(hwnd(), null, px, py, width, height, 0x0004 | 0x0010);
      });
    },
    maximize() {
      try {
        const u = user32();
        u.ShowWindow(hwnd(), 3);
        return Boolean(u.IsZoomed(hwnd()));
      } catch {
        return false;
      }
    },
    unmaximize: () => void ok(() => user32().ShowWindow(hwnd(), 9)),
    setAlwaysOnTop(on) {
      try {
        const u = user32();
        const after = (on ? -1 : -2) as Pointer; // HWND_TOPMOST / HWND_NOTOPMOST
        return Boolean(u.SetWindowPos(hwnd(), after, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010));
      } catch (error) {
        console.warn("Could not change the Windows always-on-top setting:", error);
        return false;
      }
    },
    setWindowAppearance(opts) {
      try {
        const u = user32();
        const window = hwnd();
        // SM_REMOTESESSION (0x1000 = 4096): disable heavy DWM Mica/Acrylic backdrops over Windows Remote Desktop.
        const isRemoteSession = u.GetSystemMetrics(0x1000) !== 0;
        const dwm = dlopen("dwmapi.dll", {
          DwmSetWindowAttribute: { args: [P, FFIType.u32, P, FFIType.u32], returns: FFIType.i32 },
        });
        try {
          const darkVal = new Int32Array([opts.dark !== false ? 1 : 0]);
          // DWMWA_USE_IMMERSIVE_DARK_MODE = 20 (Windows 11 / Win10 20H1+), fallback 19 (Win10 1809-1909)
          if (dwm.symbols.DwmSetWindowAttribute(window, 20, ptr(darkVal), 4) !== 0) {
            dwm.symbols.DwmSetWindowAttribute(window, 19, ptr(darkVal), 4);
          }
          if (opts.roundedCorners !== undefined) {
            // DWMWA_WINDOW_CORNER_PREFERENCE = 33 (2 = DWMWCP_ROUND, 3 = DWMWCP_ROUNDSMALL)
            const cornerVal = new Int32Array([opts.roundedCorners ? 2 : 3]);
            dwm.symbols.DwmSetWindowAttribute(window, 33, ptr(cornerVal), 4);
          }
          // DWMWA_SYSTEMBACKDROP_TYPE = 38 (Windows 11 22H2+): 1 = None, 2 = Mica, 3 = Acrylic, 4 = Mica Alt
          const effectiveBackdrop = isRemoteSession ? "none" : (opts.backdrop ?? "none");
          const backdropId =
            effectiveBackdrop === "mica"
              ? 2
              : effectiveBackdrop === "acrylic"
                ? 3
                : effectiveBackdrop === "mica-alt" || effectiveBackdrop === "vibrancy"
                  ? 4
                  : 1;
          const backdropVal = new Int32Array([backdropId]);
          if (dwm.symbols.DwmSetWindowAttribute(window, 38, ptr(backdropVal), 4) !== 0 && backdropId !== 1) {
            // Older Windows 10 / 11 21H2 build that does not support DWMWA_SYSTEMBACKDROP_TYPE: fall back cleanly.
            const fallbackVal = new Int32Array([1]);
            dwm.symbols.DwmSetWindowAttribute(window, 38, ptr(fallbackVal), 4);
          }
          return true;
        } finally {
          dwm.close();
        }
      } catch {
        return false;
      }
    },
    setFullscreen(on) {
      try {
        const u = user32();
        if (fullscreenNow(u) === on) return true;
        if (on) {
          const m = monitorRects(u);
          const rect = rectOf(u);
          if (!m || !rect) return false;
          before = { style: BigInt(u.GetWindowLongPtrW(hwnd(), GWL_STYLE)), rect, maximized: Boolean(u.IsZoomed(hwnd())) };
          if (before.maximized) u.ShowWindow(hwnd(), 9);
          u.SetWindowLongPtrW(hwnd(), GWL_STYLE, before.style & ~WS_BORDERED);
          u.SetWindowPos(hwnd(), null, m.frame.x, m.frame.y, m.frame.width, m.frame.height, SWP_FRAME);
        } else if (before) {
          u.SetWindowLongPtrW(hwnd(), GWL_STYLE, before.style);
          u.SetWindowPos(hwnd(), null, before.rect.x, before.rect.y, before.rect.width, before.rect.height, SWP_FRAME);
          if (before.maximized) u.ShowWindow(hwnd(), 3);
          before = null;
        } else {
          u.SetWindowLongPtrW(hwnd(), GWL_STYLE, BigInt(u.GetWindowLongPtrW(hwnd(), GWL_STYLE)) | WS_BORDERED);
          u.SetWindowPos(hwnd(), null, 0, 0, 0, 0, SWP_FRAME | 0x0002 | 0x0001); // keep position and size
        }
        return true;
      } catch {
        return false;
      }
    },
    getFrame() {
      try {
        const u = user32();
        const rect = rectOf(u);
        return rect ? { ...rect, maximized: Boolean(u.IsZoomed(hwnd())), fullscreen: fullscreenNow(u) } : null;
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------- Linux

/** Parses `xrandr --query`: "eDP-1 connected primary 1920x1080+0+0 ..." per active monitor, the primary first. */
export function parseXrandr(text: string): FmScreen[] {
  const found: Array<{ r: Rect; primary: boolean }> = [];
  for (const line of text.split("\n")) {
    const m = /^\S+ connected (primary )?(\d+)x(\d+)\+(-?\d+)\+(-?\d+)/.exec(line);
    if (m) found.push({ primary: !!m[1], r: { width: Number(m[2]), height: Number(m[3]), x: Number(m[4]), y: Number(m[5]) } });
  }
  found.sort((a, b) => Number(b.primary) - Number(a.primary));
  // The panel's size isn't known: leave room for a top bar, so a window sized to fit is never hidden behind it.
  const topBar = 32;
  return found.map(({ r }) => ({ ...r, work: { x: r.x, y: r.y + topBar, width: r.width, height: Math.max(1, r.height - topBar) } }));
}

function linuxNative(wv: Webview, title: () => string): WindowNative {
  const x11 = () => !!process.env.DISPLAY && process.env.XDG_SESSION_TYPE !== "wayland";
  const wmctrl = (...args: string[]): boolean => {
    if (!x11()) return false;
    try {
      return spawnSync("wmctrl", ["-r", title(), "-b", ...args], { timeout: 1500, stdio: "ignore" }).status === 0;
    } catch {
      return false;
    }
  };
  return {
    getScreens() {
      try {
        return parseXrandr(String(spawnSync("xrandr", ["--query"], { encoding: "utf8", timeout: 2000 }).stdout ?? ""));
      } catch {
        return [];
      }
    },
    hide() {},
    show() {},
    setBounds: ({ width, height }) => void ok(() => { wv.size = { width, height, hint: NO_HINT }; }),
    maximize: () => wmctrl("add,maximized_vert,maximized_horz"),
    unmaximize: () => void wmctrl("remove,maximized_vert,maximized_horz"),
    setFullscreen: (on) => wmctrl(on ? "add,fullscreen" : "remove,fullscreen"),
    setWindowAppearance: () => false,
    getFrame: () => null,
  };
}

/** The native layer for a window (`wv`) on this computer. `title` is only needed on Linux (wmctrl finds the window by it). */
export function createWindowNative(wv: Webview, title: () => string = () => ""): WindowNative {
  if (process.platform === "darwin") return macNative(wv);
  if (process.platform === "win32") return windowsNative(wv);
  return linuxNative(wv, title);
}
