$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$buildDir = Join-Path $projectRoot 'node_modules\webview-bun\build'
$targetLoader = Join-Path $buildDir 'WebView2Loader.dll'

$searchRoots = @(
    'C:\Program Files (x86)\Microsoft\EdgeWebView',
    'C:\Program Files\Microsoft\EdgeWebView',
    'C:\Program Files (x86)\Microsoft\Edge\Application',
    'C:\Program Files\Microsoft\Edge\Application',
    'C:\Windows\System32',
    'C:\Windows\SysWOW64'
)

function Find-Loader {
    foreach ($root in $searchRoots) {
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
    Write-Host 'No WebView2Loader.dll found on this machine.'
    Write-Host 'Download the ARM64 fixed runtime CAB from Microsoft and extract it, then rerun this script.'
    Write-Host 'Example CAB path:'
    Write-Host 'C:\Users\codecaine\AppData\Local\Temp\MicrosoftEdgeDownloads\...\Microsoft.WebView2.FixedVersionRuntime.*.arm64.cab'
    exit 1
}

New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
Copy-Item $loader $targetLoader -Force

Write-Host "Installed ARM64 WebView2 loader to: $targetLoader"
