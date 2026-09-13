$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$buildDir = Join-Path $projectRoot 'node_modules\webview-bun\build'
$targetLoader = Join-Path $buildDir 'WebView2Loader.dll'

function Find-Loader {
    $roots = @(
        'C:\Program Files (x86)\Microsoft\EdgeWebView',
        'C:\Program Files\Microsoft\EdgeWebView',
        'C:\Program Files (x86)\Microsoft\Edge\Application',
        'C:\Program Files\Microsoft\Edge\Application',
        'C:\Windows\System32',
        'C:\Windows\SysWOW64'
    )

    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $hits = Get-ChildItem -Path $root -Recurse -Filter 'WebView2Loader.dll' -ErrorAction SilentlyContinue
        if ($hits -and $hits.Count -gt 0) {
            return $hits[0].FullName
        }
    }

    return $null
}

$loader = Find-Loader
if (-not $loader) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Write-Host 'WebView2Loader.dll not found. Installing Microsoft Edge WebView2 runtime...'
        & winget install --id Microsoft.EdgeWebView2Runtime --exact --accept-source-agreements --accept-package-agreements
        $loader = Find-Loader
    }
}

if (-not $loader) {
    Write-Host 'No WebView2 runtime was found and winget was unavailable.'
    Write-Host 'Install Microsoft Edge WebView2 Runtime manually and rerun this script.'
    exit 1
}

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
Copy-Item $loader $targetLoader -Force

Write-Host "Installed x64 WebView2 loader to: $targetLoader"
