param(
    [Parameter(Mandatory = $true)][string]$Shell,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [int]$Columns = 80,
    [int]$Rows = 24
)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'windows-terminal.cs')
    exit [FileManagerTerminal]::Run($Shell, $WorkingDirectory, $Columns, $Rows)
} catch {
    [Console]::Error.WriteLine("Windows terminal failed: " + $_.Exception.Message)
    exit 1
}
