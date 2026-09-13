# Windows x64 runtime bundle

This folder contains the Windows x64 setup for `webview-bun` and the Edge WebView2 runtime.

## Files

- `run-demo-x64.ps1` — clears stale `WEBVIEW_PATH`, installs or locates the required loader, and runs the demo.
- `install-x64-webview2.ps1` — finds or installs the x64 WebView2 runtime and copies `WebView2Loader.dll` into the native library build directory.
- `set-bun-x64.ps1` — prepends a local x64 Bun install to `PATH` before launch.

## Typical use

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-x64\run-demo-x64.ps1
```

This is the easier path for most Windows users because the default `webview-bun` packages and Bun install commonly target x64.

## When to use it

Use this on standard Windows 10/11 x64 machines when:

- your machine is not ARM64
- `ERR_DLOPEN_FAILED` is thrown when loading `libwebview.dll`
- `WebView2Loader.dll` is missing
- `WEBVIEW_PATH` points to the wrong library or stale runtime
