[CmdletBinding()]
param(
    [ValidateSet('windows-arm64', 'windows-x64', 'windows-x64-baseline')]
    [string]$Target,
    [ValidateRange(1, 64)]
    [int]$Jobs = 2
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
try {
    Set-Location -LiteralPath $root
    $bun = Get-Command bun.exe -ErrorAction SilentlyContinue
    $bunExe = if ($bun) { $bun.Source } else { Join-Path $env:USERPROFILE '.bun\bin\bun.exe' }
    if (-not (Test-Path -LiteralPath $bunExe)) {
        throw 'Bun is required to build from source. Install it from https://bun.sh, then double-click build.cmd again. Downloaded releases do not need Bun or compilation.'
    }
    $env:PATH = (Split-Path -Parent $bunExe) + ';' + $env:PATH
    if (-not $Target) {
        $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
        $Target = if ($arch -eq 'ARM64') { 'windows-arm64' } else { 'windows-x64' }
    }
    & $bunExe install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed ($LASTEXITCODE)." }
    foreach ($script in @('release:build', 'release:file-manager')) {
        & $bunExe run $script -- --targets $Target --jobs $Jobs
        if ($LASTEXITCODE -ne 0) { throw "$script failed ($LASTEXITCODE). See the build output above." }
    }
    Write-Host "`nBuild complete: $root\release" -ForegroundColor Green
    Write-Host "Suite: release\bun-rad-studio-v*-$Target.zip"
    Write-Host "File Manager: release\file-manager\Codecaine-File-Manager-v*-$Target.zip"
    Write-Host 'Extract the whole archive, then double-click install.cmd. No compiler is needed to use it.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
