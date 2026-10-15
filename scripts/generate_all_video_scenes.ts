// Automated scene capture for YouTube Video Production
import { join } from "path";
import { Sys } from "../src/simplecli/sys";

const SETTINGS_FILE = "/Users/codecaine/.bun_rad_studio/file_manager.json";
const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = join(process.cwd(), "youtube_production", "frames");
const FM_URL = "http://127.0.0.1:51292/";

interface SceneConfig {
  filename: string;
  name: string;
  workspace: "files" | "home" | "tools" | "split" | "dual";
  activeTool?: string;
  splitTool?: string;
  theme?: "dark" | "light" | "auto";
  palette?: string;
  showInfoPanel?: boolean;
  view?: "details" | "list" | "icons";
  lastPath?: string;
  dualPath?: string;
}

const scenes: SceneConfig[] = [
  {
    filename: "01_home_dashboard.png",
    name: "Home Dashboard & Quick Launch Center",
    workspace: "home",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "02_files_workspace.png",
    name: "Everyday Files Workspace & Details View",
    workspace: "files",
    theme: "dark",
    palette: "codefreelance",
    view: "details",
    showInfoPanel: true,
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "03_dual_pane.png",
    name: "Dual-Pane Productivity Flow (F5/F6 Copy/Move)",
    workspace: "dual",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
    dualPath: "/Users/codecaine/Desktop",
  },
  {
    filename: "04_split_view.png",
    name: "Split View Workspace",
    workspace: "split",
    splitTool: "code",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "05_code_studio.png",
    name: "Built-In Code Studio & V-Lang Editor",
    workspace: "tools",
    activeTool: "code",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "06_dev_station.png",
    name: "Developer Suite (Tokei Lines of Code, Git, Disk)",
    workspace: "tools",
    activeTool: "dev",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "07_database_hub.png",
    name: "Database Hub (SQLite, MySQL, Postgres, Redis)",
    workspace: "tools",
    activeTool: "databases",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "08_secrets_vault.png",
    name: "Secrets & AES-256 Encrypted Vaults",
    workspace: "tools",
    activeTool: "secrets",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "09_crypto_tools.png",
    name: "Crypto, Argon2id & Multi-Hash Verifier",
    workspace: "tools",
    activeTool: "crypto",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "10_live_server.png",
    name: "Zero-Config Live Web & PHP Development Server",
    workspace: "tools",
    activeTool: "serve",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "11_network_ip.png",
    name: "Network & Subnet CIDR IP Forensics",
    workspace: "tools",
    activeTool: "ip",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "12_subfinder_recon.png",
    name: "Subdomain Discovery (Subfinder Recon)",
    workspace: "tools",
    activeTool: "subs",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "13_rip_graveyard.png",
    name: "Rip Graveyard & Safe Undoable Deletion",
    workspace: "tools",
    activeTool: "grave",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "14_find_replace.png",
    name: "Deep Find & Multi-File Search/Replace Engine",
    workspace: "tools",
    activeTool: "find",
    theme: "dark",
    palette: "codefreelance",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "15_theme_cyberpunk.png",
    name: "Futuristic Cyberpunk Glow Theme",
    workspace: "files",
    theme: "dark",
    palette: "cyberpunk",
    view: "icons",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
  {
    filename: "16_theme_sonoma.png",
    name: "Apple Sonoma Emerald Theme",
    workspace: "files",
    theme: "dark",
    palette: "sonoma_emerald",
    view: "details",
    lastPath: "/Users/codecaine/bun_rad_studio",
  },
];

async function main() {
  console.log(`🎬 Capturing ${scenes.length} Production UI Frames for Video Demo...`);
  const originalConfigText = await Bun.file(SETTINGS_FILE).text();
  const baseConfig = JSON.parse(originalConfigText);

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i]!;
    console.log(`[${i + 1}/${scenes.length}] Preparing: ${sc.name} (${sc.filename})...`);

    const cfg = {
      ...baseConfig,
      startWith: "last",
      workspace: sc.workspace,
      activeTool: sc.activeTool ?? baseConfig.activeTool,
      splitTool: sc.splitTool ?? baseConfig.splitTool,
      theme: sc.theme ?? "dark",
      palette: sc.palette ?? "codefreelance",
      showInfoPanel: sc.showInfoPanel ?? false,
      view: sc.view ?? "details",
      lastPath: sc.lastPath ?? "/Users/codecaine/bun_rad_studio",
      dualPath: sc.dualPath ?? "/Users/codecaine/Desktop",
      seenWelcome: true,
    };

    await Bun.write(SETTINGS_FILE, JSON.stringify(cfg, null, 2));

    const outPath = join(OUTPUT_DIR, sc.filename);
    const cmd = `"${CHROME_BIN}" --headless --disable-gpu --user-data-dir=/tmp/isolated_chrome_screens --no-first-run --screenshot="${outPath}" --window-size=1920,1080 "${FM_URL}" 2>/dev/null`;
    Sys.exec(cmd);

    const exists = await Bun.file(outPath).exists();
    const size = exists ? (Bun.file(outPath).size / 1024).toFixed(1) + " KB" : "MISSING";
    console.log(`  ✔ Rendered: ${sc.filename} (${size})`);
  }

  // Restore original config
  await Bun.write(SETTINGS_FILE, originalConfigText);
  console.log("✨ All production frames captured successfully!");
}

main().catch(console.error);
