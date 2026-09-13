$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

Remove-Item Env:WEBVIEW_PATH -ErrorAction SilentlyContinue

$platform = [System.Runtime.InteropServices.RuntimeInformation]::OSDescription
$arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture

Write-Host "Platform: $platform"
Write-Host "Architecture: $arch"

$scriptPath = Join-Path $PSScriptRoot 'install-arm64-webview2.ps1'
if (Test-Path $scriptPath) {
    & $scriptPath
}

$possibleBuns = @(
    'C:\Tools\bun-x64\bun-windows-x64\bun.exe',
    'C:\Users\codecaine\.bun\bin\bun.exe',
    'C:\Program Files\Bun\bun.exe',
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
    throw 'No Bun runtime was found. Install Bun first.'
}

Write-Host "Using Bun: $selected"

if ($selected -eq 'bun') {
    & bun run .\demos\23_all_themes_all_controls_showcase.ts
} else {
    & $selected run .\demos\23_all_themes_all_controls_showcase.ts
}
