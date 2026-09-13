# Windows ARM runtime bundle

This folder contains the Windows ARM64 runtime setup needed for `webview-bun` when the bundled native library is x64-only or when a system WebView2 runtime must be placed in the expected runtime search path.

## Files

- `run-demo-arm.ps1` — detects the machine architecture, repairs the WebView2 loader path, and runs the demo.
- `install-arm64-webview2.ps1` — extracts a downloaded WebView2 ARM64 CAB and copies the `WebView2Loader.dll` next to the native library.
- `set-bun-arm64.ps1` — optionally points Bun to a local ARM64 Bun installation if you want to run with ARM64 Bun.

## Typical use

From PowerShell in the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-arm\run-demo-arm.ps1
```

This script tries to:

1. remove a stale `WEBVIEW_PATH`
2. locate a valid WebView2 ARM64 loader
3. copy it to the `webview-bun/build` folder
4. run the demo with the correct Bun runtime if available
