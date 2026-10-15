param(
    [Parameter(Mandatory = $true)][string]$Shell,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [int]$Columns = 80,
    [int]$Rows = 24
)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'windows-terminal.cs')
    $setup = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'windows-terminal-shell.ps1'))
    $wslSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'windows-terminal-wsl.sh')).Replace("`r`n", "`n")
    $wsl = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($wslSource))
    $setup = $setup.Replace('__FILE_MANAGER_WSL_BOOTSTRAP__', $wsl)
    exit [FileManagerTerminal]::Run($Shell, $WorkingDirectory, $Columns, $Rows, $setup)
} catch {
    [Console]::Error.WriteLine("Windows terminal failed: " + $_.Exception.Message)
    exit 1
}
