$global:FileManagerOriginalPrompt = $function:prompt
function global:prompt {
    $location = Get-Location
    if ($location.Provider.Name -eq 'FileSystem') {
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($location.ProviderPath))
        [Console]::Write(([char]27 + ']777;file-manager-cwd;' + $encoded + [char]7))
    }
    & $global:FileManagerOriginalPrompt
}
# A Command Prompt started from here (cmd, cmd.exe) reports its folder too, so pasted paths use cmd's quoting.
# Shells started from a Command Prompt (wsl, bash, pwsh, powershell, git-bash) are covered by doskey macros, set once
# for this console; they only affect what is typed at a cmd prompt.
if ($env:FILE_MANAGER_HELPERS -and (Test-Path -LiteralPath (Join-Path $env:FILE_MANAGER_HELPERS 'cmd-macros.txt'))) {
    Push-Location -LiteralPath $env:FILE_MANAGER_HELPERS
    try { & (Join-Path $env:SystemRoot 'System32\doskey.exe') /exename=cmd.exe /macrofile=cmd-macros.txt } catch {} finally { Pop-Location }
}
$env:PROMPT = '$E]777;file-manager-cwd-cmd;$P$E\$P$G'

$global:FileManagerWslBootstrap = '__FILE_MANAGER_WSL_BOOTSTRAP__'
function global:Invoke-FileManagerWsl {
    $exe = Join-Path $env:SystemRoot 'System32\wsl.exe'
    $launchArgs = @()
    for ($i = 0; $i -lt $args.Count; $i++) {
        if ($args[$i] -in @('-d', '--distribution', '--distribution-id', '-u', '--user', '--cd') -and $i + 1 -lt $args.Count) {
            $launchArgs += $args[$i], $args[++$i]
        } elseif ($args[$i] -eq '~') {
            $launchArgs += '--cd', '~'
        } else {
            # Commands and management options must keep their original WSL semantics.
            & $exe @args
            $global:LASTEXITCODE = $LASTEXITCODE
            return
        }
    }
    & $exe @launchArgs --exec sh -c "echo $global:FileManagerWslBootstrap | base64 -d | sh"
    $global:LASTEXITCODE = $LASTEXITCODE
}
function global:wsl { Invoke-FileManagerWsl @args }
function global:wsl.exe { Invoke-FileManagerWsl @args }

# PowerShell 7 (pwsh) and Windows PowerShell started from here report their folder too. With arguments they run as usual.
function global:Invoke-FileManagerPowerShell([string]$Exe, [object[]]$Rest) {
    if ($Rest.Count -eq 0 -and $env:FILE_MANAGER_PS_SETUP_FILE) {
        & $Exe -NoLogo -NoExit -Command 'Invoke-Expression ([IO.File]::ReadAllText($env:FILE_MANAGER_PS_SETUP_FILE))'
    } else {
        & $Exe @Rest
    }
    $global:LASTEXITCODE = $LASTEXITCODE
}
function global:powershell { Invoke-FileManagerPowerShell (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') $args }
function global:powershell.exe { Invoke-FileManagerPowerShell (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') $args }
if ($env:FILE_MANAGER_PWSH) {
    function global:pwsh { Invoke-FileManagerPowerShell $env:FILE_MANAGER_PWSH $args }
    function global:pwsh.exe { Invoke-FileManagerPowerShell $env:FILE_MANAGER_PWSH $args }
}

# Git Bash (and other MSYS bashes) report their folder, so pasted paths are written /c/Users/... They stay in this panel:
# git-bash would otherwise open a window of its own.
function global:Invoke-FileManagerGitBash([string]$Exe) {
    & $Exe --rcfile $env:FILE_MANAGER_GITBASH_RC -i
    $global:LASTEXITCODE = $LASTEXITCODE
}
function global:Find-FileManagerCommand([string]$Name) {
    Get-Command $Name -CommandType Application -All -ErrorAction SilentlyContinue | Where-Object { $_.Extension -eq '.exe' } | Select-Object -First 1
}
function global:Invoke-FileManagerBash {
    $found = Find-FileManagerCommand 'bash'
    if (-not $found) { Write-Error 'bash was not found. Install WSL or Git for Windows.'; return }
    if ($args.Count -eq 0) {
        # System32\bash.exe is WSL's; any other bash on this computer is an MSYS one (Git Bash, MSYS2).
        if ($found.Source.StartsWith((Join-Path $env:SystemRoot 'System32\'), [StringComparison]::OrdinalIgnoreCase)) { Invoke-FileManagerWsl; return }
        if ($env:FILE_MANAGER_GITBASH_RC) { Invoke-FileManagerGitBash $found.Source; return }
    }
    & $found.Source @args
    $global:LASTEXITCODE = $LASTEXITCODE
}
function global:bash { Invoke-FileManagerBash @args }
function global:bash.exe { Invoke-FileManagerBash @args }
function global:Invoke-FileManagerGitBashWindow {
    if ($args.Count -eq 0 -and $env:FILE_MANAGER_GITBASH) { Invoke-FileManagerGitBash $env:FILE_MANAGER_GITBASH; return }
    $found = Find-FileManagerCommand 'git-bash'
    if (-not $found) { Write-Error 'Git Bash was not found. Install Git for Windows.'; return }
    & $found.Source @args
    $global:LASTEXITCODE = $LASTEXITCODE
}
function global:git-bash { Invoke-FileManagerGitBashWindow @args }
function global:git-bash.exe { Invoke-FileManagerGitBashWindow @args }
