$ErrorActionPreference = 'Stop'

$paths = @(
    'C:\Tools\bun-x64\bun-windows-x64',
    'C:\Program Files\Bun',
    (Join-Path $env:USERPROFILE '.bun\bin'),
    (Join-Path $env:LOCALAPPDATA 'bun\bin'),
    'C:\Users\codecaine\.bun\bin'
)

foreach ($dir in $paths) {
    if ($dir -and (Test-Path $dir)) {
        $env:PATH = "$dir;$env:PATH"
        Write-Host "Added Bun path: $dir"
    }
}

$bunExe = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunExe) {
    Write-Host 'No Bun executable was found in PATH.'
    exit 1
}

& $bunExe.Source --version
