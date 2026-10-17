import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Data, Format, NtExecutable, NtExecutableResource, Resource } from "resedit";
import { ROOT } from "./common";
import manifest from "../../icons/desktop/manifest.json";

export const DESKTOP_ICONS = join(ROOT, "icons", "desktop");
const ALIASES: Record<string, string> = {
  "database-studio": "sqlite-studio",
  "json-studio": "jq-studio",
  "watcher-studio": "watchexec-studio",
  "redis-studio-server": "redis-studio",
  "sqlite-studio-server": "sqlite-studio",
  "subprocess-pipe-studio-server": "subprocess-pipe-studio",
  "system-studio-server": "system-studio",
  "studio-codegen": "rad-studio",
};

export function desktopInfo(id: string): { title: string; png: string; ico: string } {
  const key = ALIASES[id] ?? id;
  const entry = (manifest as Record<string, { title: string }>)[key];
  if (!entry) throw new Error(`No Mac artwork for ${id}. Export its icon to icons/desktop and update manifest.json before releasing.`);
  const png = join(DESKTOP_ICONS, `${key}.png`);
  const ico = join(DESKTOP_ICONS, `${key}.ico`);
  if (!existsSync(png) || !existsSync(ico)) throw new Error(`Missing desktop artwork for ${id}`);
  return { title: id === "studio-codegen" ? "Studio Code Generator" : entry.title + (id.endsWith("-server") ? " Server" : ""), png, ico };
}

/** Bun puts a data-only .bun section after .rsrc, which resedit's resource reader otherwise rejects. */
export function windowsResources(binary: Buffer): NtExecutableResource {
  const image = NtExecutable.from(binary);
  const resource = image.getSectionByEntry(Format.ImageDirectoryEntry.Resource);
  if (!resource) return NtExecutableResource.from(image);
  const sections = image.getAllSections();
  const index = sections.indexOf(resource);
  const copy = Buffer.from(binary);
  const peOffset = copy.readUInt32LE(0x3c);
  copy.writeUInt16LE(index + 1, peOffset + 6);
  return NtExecutableResource.from(NtExecutable.from(copy));
}

/** Append resources rather than moving .bun or any native code's virtual addresses. */
export function embedWindowsIcon(exe: string, ico: string): void {
  const binary = readFileSync(exe);
  const image = NtExecutable.from(binary);
  const resources = windowsResources(binary);
  const icon = Data.IconFile.from(readFileSync(ico));
  resources.entries = resources.entries.filter(entry => entry.type !== 3 && entry.type !== 14);
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, icon.icons.map(i => i.data));
  image.newHeader.optionalHeaderDataDirectory.set(Format.ImageDirectoryEntry.Resource, { virtualAddress: 0, size: 0 });
  resources.outputResource(image);
  writeFileSync(exe, Buffer.from(image.generate()));
}

export function stageDesktopIcons(dir: string, names: string[]): void {
  const out = join(dir, "share", "icons");
  mkdirSync(out, { recursive: true });
  for (const name of names) {
    const icon = desktopInfo(name);
    cpSync(icon.png, join(out, `${name}.png`));
    cpSync(icon.ico, join(out, `${name}.ico`));
  }
}

export function windowsDesktopLauncher(name: string, runtime = "bun.exe"): string {
  return `$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $env:USERPROFILE '.bun_rad_studio\\logs\\${name}.log'
try {
  New-Item -ItemType Directory -Path (Split-Path $logFile) -Force | Out-Null
  Set-Location -LiteralPath $root
  $env:BUN_BE_BUN = '1'
  if (-not $env:WEBVIEW_PATH) { $env:WEBVIEW_PATH = Join-Path $root 'lib\\libwebview.dll' }
  $runtime = (Resolve-Path -LiteralPath (Join-Path $root 'runtime\\${runtime}')).Path
  $script = (Resolve-Path -LiteralPath (Join-Path $root 'apps\\${name}.js')).Path
  $ErrorActionPreference = 'Continue'
  & $runtime $script @args *> $logFile
  $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw "Application exited with code $LASTEXITCODE." }
} catch {
  $message = '${name} could not start. ' + $_.Exception.Message + "\`nSee " + $logFile + "\`nInstall WebView2 and the Visual C++ 2015-2022 x64 Redistributable, including on ARM."
  Write-Warning $message
  Add-Type -AssemblyName System.Windows.Forms
  [void][System.Windows.Forms.MessageBox]::Show($message, 'Bun RAD Studio')
  exit 1
}
`.replace(/\r?\n/g, "\r\n");
}

export function windowsInstallScript(names: string[]): string {
  const apps = names.map(id => ({ id, title: desktopInfo(id).title }));
  return `param([switch]$Uninstall, [switch]$Desktop)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Bun RAD Studio'
$apps = '${JSON.stringify(apps).replace(/'/g, "''")}' | ConvertFrom-Json
$shell = New-Object -ComObject WScript.Shell
foreach ($app in $apps) {
  $folders = @($menu)
  if ($Desktop) { $folders += [Environment]::GetFolderPath('Desktop') }
  foreach ($folder in $folders) {
    $path = Join-Path $folder ($app.title + '.lnk')
    if ($Uninstall) {
      if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path }
      continue
    }
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    $link = $shell.CreateShortcut($path)
    $link.TargetPath = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    $link.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $root ('bin\\' + $app.id + '.ps1')) + '"'
    $link.WorkingDirectory = $root
    $link.IconLocation = (Join-Path $root ('share\\icons\\' + $app.id + '.ico')) + ',0'
    $link.Description = $app.title
    $link.Save()
  }
}
Write-Host 'Done. Keep the extracted folder in place; rerun install.cmd if you move it.'
`;
}

export const WINDOWS_SETUP = `param([switch]$InstallDependencies)
$ErrorActionPreference = 'Stop'
function Get-MissingPrerequisites {
  $webview = @(
    "\${env:ProgramFiles(x86)}\\Microsoft\\EdgeWebView\\Application\\*\\msedgewebview2.exe"
    "$env:ProgramFiles\\Microsoft\\EdgeWebView\\Application\\*\\msedgewebview2.exe"
    "$env:LOCALAPPDATA\\Microsoft\\EdgeWebView\\Application\\*\\msedgewebview2.exe"
  ) | Where-Object { Test-Path -Path $_ }
  $vc = @(
    'HKLM:\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64'
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64'
  ) | Where-Object { (Get-ItemProperty -LiteralPath $_ -Name Installed -ErrorAction SilentlyContinue).Installed -eq 1 }
  $missing = @()
  if (-not $webview) { $missing += @{ Name = 'Microsoft Edge WebView2'; Url = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703'; File = 'MicrosoftEdgeWebview2Setup.exe'; Arguments = '/install' } }
  if (-not $vc) { $missing += @{ Name = 'Visual C++ 2015-2022 x64 Redistributable'; Url = 'https://aka.ms/vs/17/release/vc_redist.x64.exe'; File = 'vc_redist.x64.exe'; Arguments = '/install /passive /norestart' } }
  return $missing
}
try {
  $missing = @(Get-MissingPrerequisites)
  if ($missing.Count -eq 0) { Write-Host 'Windows desktop prerequisites are installed.'; exit 0 }
  if (-not $InstallDependencies) {
    throw ('Missing: ' + (($missing | ForEach-Object { $_.Name }) -join ', ') + '. Run install.cmd to set them up, including on Windows ARM.')
  }
  Write-Host ('Missing: ' + (($missing | ForEach-Object { $_.Name }) -join ', '))
  $answer = Read-Host 'Download and run the official Microsoft installers? Windows may ask for permission [y/N]'
  if ($answer -notmatch '^(y|yes)$') { throw 'Setup cancelled. No shortcuts were installed. Run install.cmd when ready.' }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $temp = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $temp | Out-Null
  try {
    foreach ($item in $missing) {
      $file = Join-Path $temp $item.File
      Write-Host ('Downloading ' + $item.Name + ' from Microsoft...')
      Invoke-WebRequest -Uri $item.Url -OutFile $file -UseBasicParsing
      $signature = Get-AuthenticodeSignature -LiteralPath $file
      if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(,|$)') {
        throw ('Microsoft installer signature verification failed: ' + $item.Name)
      }
      $installer = Start-Process -FilePath $file -ArgumentList $item.Arguments -Wait -PassThru
      if ($installer.ExitCode -notin @(0, 1638, 3010)) { throw ($item.Name + ' installation failed with code ' + $installer.ExitCode) }
      if ($installer.ExitCode -eq 3010) { Write-Warning 'Windows needs a restart before the desktop apps can run.' }
    }
  } finally {
    foreach ($item in $missing) {
      $file = Join-Path $temp $item.File
      if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    Remove-Item -LiteralPath $temp
  }
  $remaining = @(Get-MissingPrerequisites)
  if ($remaining.Count -gt 0) { throw ('Prerequisites are still missing: ' + (($remaining | ForEach-Object { $_.Name }) -join ', ') + '. Restart Windows if requested, then rerun install.cmd.') }
  Write-Host 'Windows desktop setup completed.'
} catch {
  Write-Error $_ -ErrorAction Continue
  exit 1
}
`.replace(/\r?\n/g, "\r\n");

export function windowsInstallCommand(shortcuts: boolean): string {
  return `@echo off\r\nsetlocal\r\n` +
    (shortcuts ? `if /I "%~1"=="-Uninstall" goto shortcuts\r\n` : "") +
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -InstallDependencies\r\nif errorlevel 1 goto failed\r\n` +
    (shortcuts ? `:shortcuts\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*\r\nif errorlevel 1 goto failed\r\n` : "") +
    `echo Setup complete. You can now open the desktop apps.\r\npause\r\nexit /b 0\r\n:failed\r\necho Setup failed. See the error above.\r\npause\r\nexit /b 1\r\n`;
}
