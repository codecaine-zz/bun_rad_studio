$ErrorActionPreference = 'Stop'

$armBun = 'C:\Program Files\Bun\bun.exe'
if (Test-Path $armBun) {
    $env:PATH = "$([System.IO.Path]::GetDirectoryName($armBun));$env:PATH"
    Write-Host "ARM64 Bun configured: $armBun"
    & $armBun --version
} else {
    Write-Host 'No ARM64 Bun installation found at C:\Program Files\Bun\bun.exe'
    Write-Host 'Install Bun for ARM64 and rerun this script.'
}
