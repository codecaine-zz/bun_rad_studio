$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

Remove-Item Env:WEBVIEW_PATH -ErrorAction SilentlyContinue

$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
Write-Host "Detected OS architecture: $arch"

$scriptPath = Join-Path $PSScriptRoot 'install-x64-webview2.ps1'
if (Test-Path $scriptPath) {
    & $scriptPath
}

$possibleBuns = @(
    'C:\Tools\bun-x64\bun-windows-x64\bun.exe',
    'C:\Program Files\Bun\bun.exe',
    'C:\Users\codecaine\.bun\bin\bun.exe',
    'bun'
)

$selected = $null
foreach ($candidate in $possibleBuns) {
    if ($candidate -eq 'bun') {
        $selected = 'bun'
        break
    }

    if (Test-Path $candidate) {
        $selected = $candidate
        break
    }
}

if (-not $selected) {
    throw 'No Bun runtime was found. Install Bun for x64 and rerun this script.'
}

Write-Host "Using Bun: $selected"

if ($selected -eq 'bun') {
    & bun run .\demos\23_all_themes_all_controls_showcase.ts
} else {
    & $selected run .\demos\23_all_themes_all_controls_showcase.ts
}
