import { expect, test } from "bun:test";
import { dlopen, FFIType } from "bun:ffi";
import { createWindowNative } from "../src/windowNative";

test.skipIf(process.platform !== "win32" || process.arch !== "x64")("show activates the Windows window without making it always-on-top or changing its saved mode", async () => {
  const { Webview } = await import("webview-bun");
  const user32 = dlopen("user32.dll", {
    GetForegroundWindow: { args: [], returns: FFIType.pointer },
    GetWindowLongPtrW: { args: [FFIType.pointer, FFIType.i32], returns: FFIType.i64 },
  });
  const previous = user32.symbols.GetForegroundWindow();
  const activation = dlopen("user32.dll", {
    SetForegroundWindow: { args: [FFIType.pointer], returns: FFIType.bool },
  });
  const window = new Webview(false);
  window.title = "Bun RAD Studio foreground test";
  const native = createWindowNative(window, () => window.title);
  const other = new Webview(false);
  other.title = "Bun RAD Studio other window";
  const otherNative = createWindowNative(other, () => other.title);
  try {
    for (const mode of ["normal", "maximize", "fullscreen"] as const) {
      otherNative.show();
      expect(user32.symbols.GetForegroundWindow()).toBe(other.unsafeWindowHandle);
      native.hide();
      native.setFullscreen(false);
      native.unmaximize();
      if (mode === "maximize") expect(native.maximize()).toBe(true);
      if (mode === "fullscreen") expect(native.setFullscreen(true)).toBe(true);
      native.show();
      expect(user32.symbols.GetForegroundWindow()).toBe(window.unsafeWindowHandle);
      const style = BigInt(user32.symbols.GetWindowLongPtrW(window.unsafeWindowHandle, -20));
      expect(style & 0x8n).toBe(0n);
      const frame = native.getFrame();
      expect(frame?.fullscreen).toBe(mode === "fullscreen");
      expect(frame?.maximized).toBe(mode === "maximize");
      otherNative.show();
      native.getFrame();
      expect(user32.symbols.GetForegroundWindow()).toBe(other.unsafeWindowHandle);
    }
    const frame = native.getFrame();
    expect(native.setAlwaysOnTop?.(true)).toBe(true);
    expect(BigInt(user32.symbols.GetWindowLongPtrW(window.unsafeWindowHandle, -20)) & 0x8n).toBe(0x8n);
    expect(native.getFrame()).toEqual(frame);
    expect(user32.symbols.GetForegroundWindow()).toBe(other.unsafeWindowHandle);
    expect(native.setAlwaysOnTop?.(false)).toBe(true);
    expect(BigInt(user32.symbols.GetWindowLongPtrW(window.unsafeWindowHandle, -20)) & 0x8n).toBe(0n);
    expect(native.getFrame()).toEqual(frame);
  } finally {
    native.setFullscreen(false);
    window.destroy();
    other.destroy();
    if (previous) activation.symbols.SetForegroundWindow(previous);
    activation.close();
    user32.close();
  }
}, 30000);
