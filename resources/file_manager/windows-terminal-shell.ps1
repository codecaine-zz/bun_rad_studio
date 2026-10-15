$global:FileManagerOriginalPrompt = $function:prompt
function global:prompt {
    $location = Get-Location
    if ($location.Provider.Name -eq 'FileSystem') {
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($location.ProviderPath))
        [Console]::Write(([char]27 + ']777;file-manager-cwd;' + $encoded + [char]7))
    }
    & $global:FileManagerOriginalPrompt
}

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
