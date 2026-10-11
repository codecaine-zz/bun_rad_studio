<#
.SYNOPSIS
    ⚡ Bun RAD Studio - Windows x64 Runner
.DESCRIPTION
    Runs any application, demo, or CLI utility on Windows x64.
    Defaults to Demo 23 (Theme Showcase) if no target is provided.
.EXAMPLE
    .\run-demo-x64.ps1               # Runs default Demo 23 (Showcase)
    .\run-demo-x64.ps1 calculator    # Runs Universal Calculator Studio
    .\run-demo-x64.ps1 pacman        # Runs Cyberpunk Pac-Man
    .\run-demo-x64.ps1 -List         # Lists all available apps & demos
    .\run-demo-x64.ps1 -Interactive  # Opens interactive menu picker
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Target = '23',

    [Alias('l')]
    [switch]$List,

    [Alias('i')]
    [switch]$Interactive,

    [Alias('s')]
    [string]$Search,

    [Alias('g')]
    [switch]$Gui,

    [switch]$Cli,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExtraArgs
)

$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

# If root run.ps1 exists, delegate for rich discovery and menu support
$rootRunner = Join-Path $projectRoot 'run.ps1'
if (Test-Path $rootRunner) {
    if ($PSBoundParameters.Count -eq 0) {
        # If user ran without arguments, run default demo 23 for backward compatibility
        & $rootRunner -Target '23'
    } else {
        & $rootRunner @PSBoundParameters
    }
    exit $LASTEXITCODE
}

# Fallback direct execution if run.ps1 is not present
Remove-Item Env:WEBVIEW_PATH -ErrorAction SilentlyContinue

$installScript = Join-Path $PSScriptRoot 'install-x64-webview2.ps1'
if (Test-Path $installScript) {
    & $installScript
}

$possibleBuns = @(
    'bun',
    (Join-Path $env:USERPROFILE '.bun\bin\bun.exe'),
    (Join-Path $env:LOCALAPPDATA 'bun\bin\bun.exe'),
    'C:\Tools\bun-x64\bun-windows-x64\bun.exe',
    'C:\Program Files\Bun\bun.exe',
    'C:\Users\codecaine\.bun\bin\bun.exe'
)

$selected = $null
foreach ($candidate in $possibleBuns) {
    if ($candidate -eq 'bun') {
        $cmd = Get-Command bun -ErrorAction SilentlyContinue
        if ($cmd) {
            $selected = 'bun'
            break
        }
    } elseif (Test-Path $candidate) {
        $selected = $candidate
        break
    }
}

if (-not $selected) {
    throw 'No Bun runtime was found. Install Bun for x64 and rerun this script.'
}

Write-Host "Using Bun: $selected"
& $selected run .\demos\23_all_themes_all_controls_showcase.ts
