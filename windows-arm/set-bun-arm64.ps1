$ErrorActionPreference = 'Stop'

$paths = @(
    'C:\Program Files\Bun',
    'C:\Tools\bun-arm64',
    (Join-Path $env:USERPROFILE '.bun\bin'),
    (Join-Path $env:LOCALAPPDATA 'bun\bin'),
    'C:\Users\codecaine\.bun\bin'
)

foreach ($dir in $paths) {
    if ($dir -and (Test-Path $dir)) {
        $env:PATH = "$dir;$env:PATH"
        Write-Host "Added ARM64 Bun path: $dir"
    }
}

$bunExe = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunExe) {
    Write-Host 'No Bun executable was found in PATH.'
    Write-Host 'Install Bun for ARM64 and rerun this script.'
    exit 1
}

& $bunExe.Source --version
