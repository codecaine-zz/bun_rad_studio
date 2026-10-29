/** Shared by Linux release installers; ROOT must be the extracted archive's physical path. */
export function linuxSandboxSetup(profileName: string, executable: string): string {
  return `PROFILE="/etc/apparmor.d/${profileName}"
APPARMOR=0
UNINSTALL=0
OLLAMA=0
for arg in "$@"; do
  case "$arg" in
    --apparmor) APPARMOR=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --ollama|--with-ollama) OLLAMA=1 ;;
    *) echo "Usage: sh install.sh [--apparmor] [--ollama] [--uninstall]" >&2; exit 1 ;;
  esac
done
if [ "$APPARMOR" = 1 ]; then
  PARSER="$(command -v apparmor_parser || true)"
  if [ -z "$PARSER" ] && [ -x /usr/sbin/apparmor_parser ]; then PARSER=/usr/sbin/apparmor_parser; fi
  if [ -z "$PARSER" ]; then
    echo "AppArmor tools not found. On Ubuntu, install them with: sudo apt install apparmor" >&2
    exit 1
  fi
  if [ "$UNINSTALL" = 1 ]; then
    if [ -f "$PROFILE" ]; then
      sudo "$PARSER" -R "$PROFILE"
      sudo rm -f "$PROFILE"
    fi
  else
    # Reject AppArmor pattern and quoting characters so the permission stays executable-specific.
    if ! printf '%s\\n' "$ROOT" | LC_ALL=C grep -Eq '^/[a-zA-Z0-9_./ +@=-]+$' || [ "$(printf '%s' "$ROOT" | wc -l)" -ne 0 ]; then
      echo "For AppArmor, move the download to a path containing only letters, numbers, spaces or _ . / + @ = - and try again." >&2
      exit 1
    fi
    if [ ! -x "$ROOT/${executable}" ]; then
      echo "Missing executable. Extract the whole archive before installing." >&2
      exit 1
    fi
    TMP_PROFILE="$(mktemp)"
    trap 'rm -f "$TMP_PROFILE"' EXIT HUP INT TERM
    cat > "$TMP_PROFILE" <<EOF
abi <abi/4.0>,
include <tunables/global>

profile ${profileName} "$ROOT/${executable}" flags=(unconfined) {
  userns,
}
EOF
    "$PARSER" --skip-kernel-load --skip-cache "$TMP_PROFILE"
    echo "Installing an executable-specific AppArmor user-namespace permission (sudo required)."
    sudo install -m 644 "$TMP_PROFILE" "$PROFILE"
    sudo "$PARSER" -r "$PROFILE"
    echo "AppArmor profile loaded. Rerun sh install.sh --apparmor if you move this folder."
  fi
elif [ "$UNINSTALL" = 1 ] && [ -f "$PROFILE" ]; then
  echo "To also remove the AppArmor profile, run: sh install.sh --uninstall --apparmor"
fi
`;
}

export const LINUX_SANDBOX_WARNING = `if [ "$APPARMOR" = 0 ] && [ -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns ] && [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns)" = 1 ]; then
  echo "Ubuntu restricts sandbox user namespaces. If a native window does not open, run: sh install.sh --apparmor"
fi
if [ "\${OLLAMA:-0}" = 1 ] && [ -f "$ROOT/install-ollama.sh" ]; then
  sh "$ROOT/install-ollama.sh"
fi
`;

/**
 * Single-command Ubuntu/Linux installer for Ollama and starter AI models (Qwen 3.5 + LFM3-Omni).
 * Uses the release archive's bundled Bun binary (with Bun.zstdDecompressSync) so zero sudo,
 * zero curl, and zero external zstd package are required on Ubuntu/Debian/Fedora/Arch.
 */
export function linuxOllamaInstallScript(executableRelPath: string): string {
  return `#!/bin/sh
# Single-step installer for Ollama (~/.local/bin/ollama, no sudo required) and starter AI models
# (qwen3.5:4b / qwen3.5:latest + lfm3-omni:latest) for Codecaine File Manager on Ubuntu & Linux.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
BUN_BIN="$ROOT/${executableRelPath}"
if [ ! -x "$BUN_BIN" ]; then
  chmod +x "$BUN_BIN" 2>/dev/null || true
fi
export PATH="\${HOME}/.local/bin:\${PATH}"
BUN_BE_BUN=1 exec "$BUN_BIN" -e '
import { existsSync, mkdirSync, chmodSync, rmSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const home = process.env.HOME || "/tmp";
const localDir = join(home, ".local");
const binDir = join(localDir, "bin");
mkdirSync(binDir, { recursive: true });

const arch = process.arch === "arm64" || (process.arch as string) === "aarch64" ? "arm64" : "amd64";
let totalRamGb = 16;
try {
  const mem = readFileSync("/proc/meminfo", "utf8");
  const m = /MemTotal:\\s*(\\d+)\\s*kB/i.exec(mem);
  if (m) totalRamGb = Math.round((Number(m[1]) / (1024 * 1024)) * 10) / 10;
} catch {}

console.log("==> Codecaine 1-Step Ollama + AI Models Installer (Linux " + arch + ", " + totalRamGb + " GB RAM)");

let ollamaBin = Bun.which("ollama") || (existsSync(join(binDir, "ollama")) ? join(binDir, "ollama") : "");
if (!ollamaBin) {
  const url = "https://ollama.com/download/ollama-linux-" + arch + ".tar.zst";
  console.log("==> Downloading Ollama for Linux (" + arch + ") into " + localDir + " (no sudo required)...");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    console.error("Failed to download " + url + " (HTTP " + res.status + ")");
    process.exit(1);
  }
  const total = Number(res.headers.get("content-length") || 0);
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastPct = -1;
  if (res.body) {
    const reader = res.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (total > 0) {
          const pct = Math.floor((received / total) * 100);
          if (pct >= lastPct + 10) {
            lastPct = pct;
            process.stdout.write("    Downloaded " + (received / 1048576).toFixed(1) + " MB / " + (total / 1048576).toFixed(1) + " MB (" + pct + "%)\\r");
          }
        }
      }
    }
    process.stdout.write("\\n");
  }
  const compressed = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    compressed.set(c, offset);
    offset += c.byteLength;
  }
  console.log("==> Decompressing ollama-linux-" + arch + ".tar.zst with built-in Zstandard decoder...");
  const tarBytes = Bun.zstdDecompressSync(compressed);
  const tmpTar = join(localDir, "ollama-linux-" + process.pid + ".tar");
  await Bun.write(tmpTar, tarBytes);
  console.log("==> Extracting Ollama into " + localDir + "...");
  const tarRes = Bun.spawnSync(["tar", "-xf", tmpTar, "-C", localDir], { stdout: "inherit", stderr: "inherit" });
  rmSync(tmpTar, { force: true });
  if (tarRes.exitCode !== 0) {
    console.error("Failed to extract Ollama archive.");
    process.exit(1);
  }
  ollamaBin = join(binDir, "ollama");
  if (existsSync(ollamaBin)) chmodSync(ollamaBin, 0o755);
  console.log("==> Installed Ollama at " + ollamaBin);
} else {
  console.log("==> Found existing Ollama binary at " + ollamaBin);
}

for (const rc of [".bashrc", ".profile", ".zshrc"]) {
  try {
    const p = join(home, rc);
    if (existsSync(p)) {
      const txt = readFileSync(p, "utf8");
      if (!txt.includes(".local/bin")) {
        appendFileSync(p, "\\n# Added by Codecaine File Manager\\nexport PATH=\\"\\$HOME/.local/bin:\\$PATH\\"\\n");
      }
    }
  } catch {}
}

async function isReachable() {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/version", { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

if (!(await isReachable())) {
  console.log("==> Starting background Ollama daemon (ollama serve on 127.0.0.1:11434)...");
  const child = Bun.spawn([ollamaBin, "serve"], {
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
    env: { ...process.env, OLLAMA_HOST: "127.0.0.1:11434" },
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await Bun.sleep(300);
    if (await isReachable()) break;
  }
}

const customModels = process.argv.slice(1).filter((a) => !a.startsWith("-"));
const defaultModels = totalRamGb > 16
  ? ["qwen3.5:latest", "qwen3.5:4b", "lfm3-omni:latest"]
  : ["qwen3.5:4b", "lfm3-omni:latest"];
const modelsToPull = customModels.length > 0 ? customModels : defaultModels;

console.log("==> Pulling starter AI models (" + modelsToPull.join(", ") + ")...");
for (const model of modelsToPull) {
  console.log("\\n==> Pulling " + model + "...");
  const pullRes = Bun.spawnSync([ollamaBin, "pull", model], { stdout: "inherit", stderr: "inherit" });
  if (pullRes.exitCode !== 0 && model === "lfm3-omni:latest") {
    console.log("==> Falling back to qwen2.5:1.5b for compact cross-platform assistant...");
    Bun.spawnSync([ollamaBin, "pull", "qwen2.5:1.5b"], { stdout: "inherit", stderr: "inherit" });
  }
}

console.log("\\n==> All done! Ollama and starter AI models (" + modelsToPull.join(", ") + ") are installed and ready.");
' "$@"
`;
}

