param(
    [Parameter(Mandatory = $true)][string]$Shell,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [int]$Columns = 80,
    [int]$Rows = 24
)
$ErrorActionPreference = 'Stop'
$helpers = $null
$code = 1
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'windows-terminal.cs')
    $setup = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'windows-terminal-shell.ps1'))
    $wslSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'windows-terminal-wsl.sh')).Replace("`r`n", "`n")
    $wsl = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($wslSource))
    $setup = $setup.Replace('__FILE_MANAGER_WSL_BOOTSTRAP__', $wsl)

    # Every shell started inside this terminal (PowerShell 7, Windows PowerShell, the Command Prompt, WSL, Git Bash)
    # reports its folder. Their helpers live in a private folder that is removed when the terminal closes.
    try {
        $temp = [IO.Path]::GetTempPath()
        foreach ($old in Get-ChildItem -LiteralPath $temp -Directory -Filter 'codecaine-file-manager-terminal-*' -ErrorAction SilentlyContinue) {
            $owner = 0
            if ([int]::TryParse($old.Name.Substring(32), [ref]$owner) -and -not (Get-Process -Id $owner -ErrorAction SilentlyContinue)) {
                Remove-Item -LiteralPath $old.FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        $helpers = Join-Path $temp ('codecaine-file-manager-terminal-' + $PID)
        [void][IO.Directory]::CreateDirectory($helpers)
        $utf8 = New-Object Text.UTF8Encoding($false)
        $setupFile = Join-Path $helpers 'shell-setup.ps1'
        [IO.File]::WriteAllText($setupFile, $setup, $utf8)
        $gitRc = Join-Path $helpers 'gitbash-rc.sh'
        [IO.File]::WriteAllText($gitRc, [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'windows-terminal-gitbash.sh')).Replace("`r`n", "`n"), $utf8)

        $find = { param($name) Get-Command $name -CommandType Application -All -ErrorAction SilentlyContinue | Where-Object { $_.Extension -eq '.exe' } | Select-Object -First 1 }
        $pwsh = & $find 'pwsh'
        $bash = & $find 'bash'
        $git = & $find 'git'
        $gitRoots = @()
        if ($git) { $gitRoots += Split-Path (Split-Path $git.Source) }
        $gitRoots += @("$env:ProgramFiles\Git", "${env:ProgramFiles(x86)}\Git", "$env:LOCALAPPDATA\Programs\Git")
        $gitRoot = $gitRoots | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin\bash.exe')) } | Select-Object -First 1
        $systemBash = $bash -and $bash.Source.StartsWith((Join-Path $env:SystemRoot 'System32\'), [StringComparison]::OrdinalIgnoreCase)

        $env:FILE_MANAGER_PS_SETUP_FILE = $setupFile
        $env:FILE_MANAGER_GITBASH_RC = $gitRc.Replace('\', '/')
        $env:FILE_MANAGER_PWSH = if ($pwsh) { $pwsh.Source } else { '' }
        $env:FILE_MANAGER_BASH = if ($bash) { $bash.Source } else { '' }
        $env:FILE_MANAGER_GITBASH = if ($gitRoot) { Join-Path $gitRoot 'bin\bash.exe' } else { '' }
        $env:FILE_MANAGER_GITBASH_WINDOW = if ($gitRoot) { Join-Path $gitRoot 'git-bash.exe' } else { '' }
        # MSYS and Cygwin profiles otherwise move a new shell to the home folder.
        $env:CHERE_INVOKING = '1'

        # Command Prompt macros (doskey) only change what a person types at a cmd prompt with no arguments; scripts and
        # commands with arguments run the real programs unchanged.
        # WSL gets its start-up script's path through WSLENV (/p turns it into a Linux path), which keeps the macro short.
        # In doskey macros $$ stands for a single $.
        $wslScript = Join-Path $helpers 'wsl-start.sh'
        [IO.File]::WriteAllText($wslScript, $wslSource, $utf8)
        $env:FILE_MANAGER_WSL_SCRIPT = $wslScript
        $env:WSLENV = 'FILE_MANAGER_WSL_SCRIPT/p' + $(if ($env:WSLENV) { ':' + $env:WSLENV } else { '' })
        $wslExe = '"%SystemRoot%\System32\wsl.exe"'
        $wslStart = $wslExe + ' --exec sh -c "exec sh \"$$FILE_MANAGER_WSL_SCRIPT\""'
        $ps5 = '"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"'
        $psSetup = ' -NoLogo -NoExit -Command "Invoke-Expression ([IO.File]::ReadAllText($$env:FILE_MANAGER_PS_SETUP_FILE))"'
        $gitStart = '"%FILE_MANAGER_GITBASH%" --rcfile "%FILE_MANAGER_GITBASH_RC%" -i'
        $macros = New-Object Collections.Generic.List[string]
        $macro = { param($names, $start, $real) foreach ($n in $names) { $macros.Add("$n=if ""`$1""=="""" ($start) else ($real `$*)") } }
        & $macro @('wsl', 'wsl.exe') $wslStart $wslExe
        & $macro @('powershell', 'powershell.exe') ($ps5 + $psSetup) $ps5
        if ($pwsh) { & $macro @('pwsh', 'pwsh.exe') ('"%FILE_MANAGER_PWSH%"' + $psSetup) '"%FILE_MANAGER_PWSH%"' }
        if ($bash) { & $macro @('bash', 'bash.exe') $(if ($systemBash) { $wslStart } else { '"%FILE_MANAGER_BASH%" --rcfile "%FILE_MANAGER_GITBASH_RC%" -i' }) '"%FILE_MANAGER_BASH%"' }
        if ($gitRoot) { & $macro @('git-bash', 'git-bash.exe') $gitStart '"%FILE_MANAGER_GITBASH_WINDOW%"' }
        [IO.File]::WriteAllLines((Join-Path $helpers 'cmd-macros.txt'), $macros, [Text.Encoding]::ASCII)
        $env:FILE_MANAGER_HELPERS = $helpers
    } catch {
        # Without the helpers the terminal still works; shells started inside it just don't report their folder.
        [Console]::Error.WriteLine("Terminal helpers unavailable: " + $_.Exception.Message)
    }
    $code = [FileManagerTerminal]::Run($Shell, $WorkingDirectory, $Columns, $Rows, $setup)
} catch {
    [Console]::Error.WriteLine("Windows terminal failed: " + $_.Exception.Message)
    $code = 1
} finally {
    if ($helpers) { Remove-Item -LiteralPath $helpers -Recurse -Force -ErrorAction SilentlyContinue }
}
exit $code
