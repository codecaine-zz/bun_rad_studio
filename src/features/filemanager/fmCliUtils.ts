/**
 * Built-in RAD Studio CLI Utilities for the File Manager.
 *
 * Discovers every command-line tool in `cli_apps/*.ts` (or bundled `cli/*.js` in a packaged build), provisions a
 * ready-to-run `cli_utils` folder inside `ctx.dataDir` with executable wrappers (`./<name>` and `./<stem>`), marks
 * `cli_apps/*.ts` executable (`0o755`), appends the CLI utilities folder to the built-in Terminal's `PATH`, and
 * provides direct headless execution (`cliutils/run`) for the File Manager UI and CLI.
 */
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import * as nodePath from "path";
import {
  absolutePath,
  assertFolder,
  pathApi,
  type FmContext,
  type FmHandler,
} from "./fmCore";
import { FmError, isSameOrInside } from "./fmPaths";

/** Metadata describing a command-line flag supported by a built-in RAD Studio CLI utility. */
export interface CliFlagInfo {
  /** Long flag name (without `--`), e.g. `expr`, `file`, `json`. */
  name: string;
  /** Single-letter short flag (without `-`), e.g. `e`, `f`, `j`. */
  short?: string;
  /** Parameter value type. */
  type: "string" | "bool" | "int";
  /** Default value when omitted. */
  defaultValue?: string | number | boolean;
  /** Human-readable description of the flag. */
  description: string;
}

/** An example invocation badge and argument string for a built-in CLI utility. */
export interface CliExampleInfo {
  /** Short badge label shown in the UI. */
  label: string;
  /** Arguments string passed to the utility. */
  args: string;
  /** Optional tooltip description of what the example does. */
  description?: string;
}

/** Catalog entry describing a built-in RAD Studio CLI utility, its aliases, flags, and executable wrapper paths. */
export interface CliUtilEntry {
  /** Short command name without `_cli`, e.g. `calc`, `fd`, `rad`, `api_stress_bench`. */
  id: string;
  /** File stem in `cli_apps/`, e.g. `calc_cli`, `fd_cli`, `rad_cli`, `api_stress_bench`. */
  stem: string;
  /** Dashed CLI name, e.g. `calc-cli`, `api-stress-bench`. */
  dashedName: string;
  /** Suite alias, e.g. `codecaine-calc`. */
  suiteName: string;
  /** Human-readable description of what the CLI utility does. */
  description: string;
  /** Category for grouping in the CLI Utilities tool tab. */
  category: string;
  /** Visual icon representing the tool in the File Manager UI. */
  icon: string;
  /** Discovered command-line flags supported by the utility. */
  flags: CliFlagInfo[];
  /** Ready-to-click example argument presets for the utility. */
  examples: CliExampleInfo[];
  /** Absolute path to the underlying `.ts` or `.js` CLI entrypoint. */
  scriptPath: string;
  /** Absolute path to the executable wrapper in `cliUtilsDir(ctx)`. */
  wrapperPath: string;
  /** Absolute path to the `<stem>` wrapper in `cliUtilsDir(ctx)`. */
  stemWrapperPath: string;
  /** Ready-to-run relative invocation in the terminal when inside `cliUtilsDir(ctx)`, e.g. `./calc`. */
  command: string;
  /** Ready-to-run relative stem invocation in the terminal when inside `cliUtilsDir(ctx)`, e.g. `./calc_cli`. */
  stemCommand: string;
}

/** Execution result from running a built-in CLI utility, including exit code, stdout/stderr, and duration. */
export interface CliRunResult {
  ok: boolean;
  tool: CliUtilEntry;
  command: string;
  args: string[];
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
  cleanOutput: string;
  durationMs: number;
  timedOut?: boolean;
}

const KNOWN_DESCRIPTIONS: Record<string, string> = {
  codecaine_suite_cli:
    "Codecaine Utility Suite Master CLI & Application Hub for all Studios and CLI tools",
  doggo_cli:
    "Modern DNS Client & Lookup Tool (A, AAAA, CNAME, MX, NS, TXT, SOA, PTR, SRV)",
  gdu_cli:
    "Fast Disk Usage Analyzer with Interactive Terminal UI & Directory Breakdown",
  ipinfo_cli:
    "IP Address Geolocation, ASN, Subnet CIDR & Network Intelligence CLI",
  procs_cli:
    "Modern Process Viewer & Interactive Task Inspector (ps/top replacement)",
  rad_cli:
    "Bun RAD Utilities CLI — 44-Module Rapid Application Development Showcase & Recipes",
  sd_cli:
    "Intuitive Find & Replace CLI (sed alternative with literal & regex preview)",
  subfinder_cli: "Passive Subdomain Discovery & DNS Enumeration CLI",
  tokei_cli: "Fast Codebase Line Counter & Language Breakdown Statistics CLI",
  vault_cli:
    "Encrypt and Decrypt Files & Folders (.radenc) with Password Protection",
  watchexec_cli: "Filesystem Watcher that Executes Commands When Files Change",
};

const KNOWN_FLAGS: Record<string, CliFlagInfo[]> = {
  codecaine_suite_cli: [
    {
      name: "list",
      short: "l",
      type: "bool",
      defaultValue: false,
      description: "List all apps and CLI tools",
    },
    {
      name: "doctor",
      type: "bool",
      defaultValue: false,
      description: "Verify suite installation and paths",
    },
    {
      name: "json",
      type: "bool",
      defaultValue: false,
      description: "Output suite catalog as JSON",
    },
  ],
  doggo_cli: [
    {
      name: "type",
      short: "t",
      type: "string",
      defaultValue: "A",
      description: "DNS record type (A, AAAA, MX, TXT, NS, CNAME)",
    },
    {
      name: "json",
      short: "j",
      type: "bool",
      defaultValue: false,
      description: "Format DNS response as JSON",
    },
  ],
  gdu_cli: [
    {
      name: "non-interactive",
      short: "n",
      type: "bool",
      defaultValue: false,
      description: "Print disk usage summary without TUI",
    },
    {
      name: "show-apparent-size",
      short: "a",
      type: "bool",
      defaultValue: false,
      description: "Show apparent file sizes",
    },
    {
      name: "max-depth",
      short: "d",
      type: "int",
      defaultValue: 1,
      description: "Maximum directory depth to display",
    },
  ],
  ipinfo_cli: [
    {
      name: "json",
      short: "j",
      type: "bool",
      defaultValue: false,
      description: "Output IP/CIDR details as JSON",
    },
    {
      name: "cidr",
      short: "c",
      type: "string",
      defaultValue: "",
      description: "Calculate CIDR subnet range details",
    },
  ],
  procs_cli: [
    {
      name: "tree",
      short: "t",
      type: "bool",
      defaultValue: false,
      description: "Display process hierarchy tree",
    },
    {
      name: "json",
      short: "j",
      type: "bool",
      defaultValue: false,
      description: "Output process table as JSON",
    },
  ],
  rad_cli: [
    {
      name: "list",
      short: "l",
      type: "bool",
      defaultValue: false,
      description: "List all 44 RAD modules",
    },
    {
      name: "demo",
      short: "d",
      type: "string",
      defaultValue: "",
      description: "Run a specific RAD module demo",
    },
  ],
  sd_cli: [
    {
      name: "preview",
      short: "p",
      type: "bool",
      defaultValue: false,
      description: "Preview replacements without modifying files",
    },
    {
      name: "fixed-strings",
      short: "F",
      type: "bool",
      defaultValue: false,
      description: "Treat find pattern as literal string",
    },
  ],
  subfinder_cli: [
    {
      name: "domain",
      short: "d",
      type: "string",
      defaultValue: "",
      description: "Target domain to enumerate subdomains",
    },
    {
      name: "json",
      short: "j",
      type: "bool",
      defaultValue: false,
      description: "Output discovered hosts as JSON",
    },
  ],
  tokei_cli: [
    {
      name: "sort",
      short: "s",
      type: "string",
      defaultValue: "code",
      description: "Sort by code, lines, blanks, comments, or files",
    },
    {
      name: "json",
      short: "j",
      type: "bool",
      defaultValue: false,
      description: "Output language breakdown as JSON",
    },
    {
      name: "hidden",
      type: "bool",
      defaultValue: false,
      description: "Include hidden files and directories",
    },
  ],
  vault_cli: [
    {
      name: "encrypt",
      short: "e",
      type: "string",
      defaultValue: "",
      description: "Encrypt a file or directory into .radenc",
    },
    {
      name: "decrypt",
      short: "d",
      type: "string",
      defaultValue: "",
      description: "Decrypt a .radenc archive",
    },
    {
      name: "info",
      short: "i",
      type: "string",
      defaultValue: "",
      description: "Inspect .radenc header metadata",
    },
  ],
  watchexec_cli: [
    {
      name: "exts",
      short: "e",
      type: "string",
      defaultValue: "ts,js,json",
      description: "Comma-separated extensions to watch",
    },
    {
      name: "postpone",
      short: "p",
      type: "bool",
      defaultValue: false,
      description: "Wait until first file change before running command",
    },
  ],
};

const KNOWN_EXAMPLES: Record<string, CliExampleInfo[]> = {
  calc_cli: [
    {
      label: "2^16 + 1024",
      args: '--expr "2^16 + 1024"',
      description: "Evaluate an arithmetic expression",
    },
    {
      label: "Trig & sqrt",
      args: '--expr "sqrt(144) + 25 * 4"',
      description: "Evaluate functions and operators",
    },
  ],
  fd_cli: [
    {
      label: "Find .ts files",
      args: '--pattern ".ts" --dir "."',
      description: "Search for TypeScript files in current directory",
    },
    {
      label: "Find README",
      args: '--pattern "README" --dir "."',
      description: "Find README files recursively",
    },
  ],
  rg_cli: [
    {
      label: "Search TODO",
      args: '--query "TODO" --path "."',
      description: "Fast regex search for TODO comments",
    },
    {
      label: "Search export",
      args: '--query "export function" --path "."',
      description: "Find exported functions",
    },
  ],
  tokei_cli: [
    {
      label: "Count current dir",
      args: ".",
      description: "Analyze lines of code in current directory",
    },
    {
      label: "Sort by files",
      args: "--sort files .",
      description: "Sort language statistics by file count",
    },
    {
      label: "JSON output",
      args: "--json .",
      description: "Export code metrics as JSON",
    },
  ],
  sd_cli: [
    {
      label: "Preview replace",
      args: "-p foo bar README.md",
      description: "Preview replacing foo with bar",
    },
    {
      label: "Help & usage",
      args: "--help",
      description: "Show sd find-and-replace options",
    },
  ],
  sed_cli: [
    {
      label: "Substitute preview",
      args: '--expr "s/foo/bar/g" --text "foo baz foo"',
      description: "Run stream regex substitution on inline text",
    },
    {
      label: "Help",
      args: "--help",
      description: "Show sed stream editor flags",
    },
  ],
  gawk_cli: [
    {
      label: "Print column 1",
      args: '--field "1" --delim "," --text "alpha,beta,gamma"',
      description: "Extract a column by delimiter",
    },
    {
      label: "Help",
      args: "--help",
      description: "Show gawk pattern scanner flags",
    },
  ],
  ouch_cli: [
    {
      label: "List archive",
      args: "--list archive.tar.gz",
      description: "Inspect contents of an archive",
    },
    {
      label: "Help",
      args: "--help",
      description: "Show compression and extraction flags",
    },
  ],
  jq_cli: [
    {
      label: "Format package.json",
      args: '--filter "." --file "package.json"',
      description: "Pretty-print and query package.json",
    },
    {
      label: "Extract scripts",
      args: '--filter ".scripts" --file "package.json"',
      description: "Extract scripts object from package.json",
    },
  ],
  json_cli: [
    {
      label: "Validate JSON",
      args: '--input \'{"name":"codecaine","ok":true}\'',
      description: "Format and validate a JSON payload",
    },
  ],
  sqlite_cli: [
    {
      label: "In-memory query",
      args: '--db ":memory:" --query "SELECT sqlite_version() AS version, 6*7 AS answer;"',
      description: "Execute SQL against an in-memory SQLite database",
    },
    {
      label: "List tables",
      args: '--db ":memory:" --tables',
      description: "List tables in a SQLite database",
    },
  ],
  exif_cli: [
    {
      label: "Inspect file metadata",
      args: '--file "package.json"',
      description: "Read file & media metadata headers",
    },
    {
      label: "JSON metadata",
      args: '--file "package.json" --json',
      description: "Output metadata inspection as JSON",
    },
  ],
  ocr_cli: [
    {
      label: "Extract text",
      args: '--image "package.json"',
      description: "Extract readable text strings from a file or image",
    },
  ],
  pandoc_cli: [
    {
      label: "Markdown → HTML",
      args: '--from "markdown" --to "html" --text "# Hello Codecaine\\n\\nFast **CLI** converter."',
      description: "Convert Markdown snippet to HTML",
    },
  ],
  text_editor_cli: [
    {
      label: "Inspect file",
      args: '--file "package.json" --head 15',
      description: "Preview top lines and stats of a file",
    },
  ],
  crypto_cli: [
    {
      label: "SHA-256 hash",
      args: '--algo "sha256" --text "codecaine"',
      description: "Compute cryptographic digest",
    },
  ],
  jwt_cli: [
    {
      label: "Sign demo JWT",
      args: '--secret "rad-secret" --payload \'{"sub":"admin","role":"devops"}\'',
      description: "Generate and inspect a signed JWT token",
    },
  ],
  ipinfo_cli: [
    {
      label: "CIDR calculator",
      args: "192.168.1.0/24",
      description: "Calculate subnet mask, host range, and broadcast",
    },
    {
      label: "Cloudflare DNS IP",
      args: "1.1.1.1 --json",
      description: "Inspect IP intelligence in JSON",
    },
  ],
  doggo_cli: [
    {
      label: "Lookup example.com",
      args: "example.com A",
      description: "Query DNS A records for example.com",
    },
  ],
  gdu_cli: [
    {
      label: "Analyze folder size",
      args: "-n -d 1 .",
      description: "Non-interactive disk usage breakdown of current directory",
    },
  ],
  procs_cli: [
    {
      label: "Process snapshot",
      args: "--help",
      description: "Show process viewer options and filters",
    },
  ],
  codecaine_suite_cli: [
    {
      label: "List suite tools",
      args: "list",
      description: "List all Codecaine Studio apps and CLI utilities",
    },
    {
      label: "Suite doctor",
      args: "doctor",
      description: "Verify Codecaine suite health",
    },
  ],
  rad_cli: [
    {
      label: "List 44 RAD modules",
      args: "--help",
      description: "Explore the 44 RAD modules and recipes",
    },
  ],
};

function categorizeCli(stem: string): string {
  const s = stem.toLowerCase();
  if (
    /^(api|dns|doggo|ifconfig|ipinfo|network|nmap|port_kill|recon|speedtest|subfinder|wget2|yt_dlp)/.test(
      s,
    )
  )
    return "Network & Web";
  if (/^(crypto|jwt|secrets|vault)/.test(s)) return "Security & Vault";
  if (
    /^(database|redis|sqlite|convert|dataconvert|jq|json|markdown|pandoc)/.test(
      s,
    )
  )
    return "Data & Databases";
  if (
    /^(audiotag|color|dot|exif|ffmpeg|imagemagick|media_studio|ocr|say)/.test(s)
  )
    return "Media & Graphics";
  if (/^(calc|calculator|graph|kalker|numbat|qalc|statistics)/.test(s))
    return "Math & Science";
  if (
    /^(brew|devops|disk|docker|gdu|launchd|launcher|process|procs|system|task_manager|terminal_recorder)/.test(
      s,
    )
  )
    return "System & DevOps";
  return "Files & DevTools";
}

function iconForCli(stem: string, category: string): string {
  const s = stem.toLowerCase();
  if (
    s.startsWith("calc") ||
    s.startsWith("kalker") ||
    s.startsWith("numbat") ||
    s.startsWith("qalc")
  )
    return "🧮";
  if (s.startsWith("graph") || s.startsWith("statistics")) return "📈";
  if (
    s.startsWith("fd") ||
    s.startsWith("fzf") ||
    s.startsWith("rg") ||
    s.startsWith("ugrep")
  )
    return "🔍";
  if (
    s.startsWith("bat") ||
    s.startsWith("text_editor") ||
    s.startsWith("markdown") ||
    s.startsWith("pandoc")
  )
    return "📝";
  if (s.startsWith("ouch") || s.startsWith("rip") || s.startsWith("zoxide"))
    return "📦";
  if (
    s.startsWith("sd") ||
    s.startsWith("sed") ||
    s.startsWith("gawk") ||
    s.startsWith("difft")
  )
    return "✂️";
  if (s.startsWith("tokei")) return "📊";
  if (
    s.startsWith("jq") ||
    s.startsWith("json") ||
    s.startsWith("dataconvert") ||
    s.startsWith("convert")
  )
    return "🧬";
  if (
    s.startsWith("sqlite") ||
    s.startsWith("database") ||
    s.startsWith("redis")
  )
    return "🗄️";
  if (
    s.startsWith("crypto") ||
    s.startsWith("jwt") ||
    s.startsWith("secrets") ||
    s.startsWith("vault")
  )
    return "🔐";
  if (s.startsWith("doggo") || s.startsWith("dns") || s.startsWith("subfinder"))
    return "🌐";
  if (
    s.startsWith("ipinfo") ||
    s.startsWith("ifconfig") ||
    s.startsWith("network") ||
    s.startsWith("nmap") ||
    s.startsWith("recon") ||
    s.startsWith("speedtest")
  )
    return "📡";
  if (
    s.startsWith("ffmpeg") ||
    s.startsWith("media") ||
    s.startsWith("audiotag") ||
    s.startsWith("say") ||
    s.startsWith("yt_dlp")
  )
    return "🎬";
  if (
    s.startsWith("imagemagick") ||
    s.startsWith("color") ||
    s.startsWith("exif") ||
    s.startsWith("ocr") ||
    s.startsWith("dot")
  )
    return "🖼️";
  if (s.startsWith("gdu") || s.startsWith("disk")) return "💾";
  if (
    s.startsWith("procs") ||
    s.startsWith("process") ||
    s.startsWith("task_manager") ||
    s.startsWith("system") ||
    s.startsWith("port_kill")
  )
    return "⚙️";
  if (
    s.startsWith("git") ||
    s.startsWith("gh") ||
    s.startsWith("lazygit") ||
    s.startsWith("tig")
  )
    return "🌿";
  if (
    s.startsWith("docker") ||
    s.startsWith("devops") ||
    s.startsWith("brew") ||
    s.startsWith("launchd")
  )
    return "🐳";
  if (
    s.startsWith("codecaine_suite") ||
    s.startsWith("rad") ||
    s.startsWith("launcher")
  )
    return "🚀";
  switch (category) {
    case "Network & Web":
      return "🌐";
    case "Security & Vault":
      return "🔐";
    case "Data & Databases":
      return "🗄️";
    case "Media & Graphics":
      return "🎨";
    case "Math & Science":
      return "🧮";
    case "System & DevOps":
      return "⚙️";
    default:
      return "🛠️";
  }
}

function shSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Finds the project root that holds `cli_apps/*.ts` or packaged `cli/*.js`. */
export function findCliSourceRoot(): {
  root: string;
  cliDir: string;
  ext: ".ts" | ".js";
  binDir: string | null;
} | null {
  const mainDir =
    typeof Bun !== "undefined" && Bun.main ? nodePath.dirname(Bun.main) : "";
  const execDir = process.execPath ? nodePath.dirname(process.execPath) : "";
  const candidates = [
    ...(process.env.CODECAINE_ROOT
      ? [nodePath.resolve(process.env.CODECAINE_ROOT)]
      : []),
    nodePath.resolve(import.meta.dir, "../../.."),
    nodePath.resolve(import.meta.dir, "../.."),
    nodePath.resolve(import.meta.dir, ".."),
    ...(mainDir
      ? [nodePath.resolve(mainDir), nodePath.resolve(mainDir, "..")]
      : []),
    ...(execDir
      ? [nodePath.resolve(execDir), nodePath.resolve(execDir, "..")]
      : []),
    nodePath.resolve(process.cwd()),
  ];
  const uniqueRoots: string[] = [];
  const seen = new Set<string>();
  for (const root of candidates) {
    if (!root || seen.has(root)) continue;
    seen.add(root);
    uniqueRoots.push(root);
  }
  for (const root of uniqueRoots) {
    const cliApps = nodePath.join(root, "cli_apps");
    if (existsSync(cliApps)) {
      try {
        if (statSync(cliApps).isDirectory()) {
          const bin = nodePath.join(root, "bin");
          return {
            root,
            cliDir: cliApps,
            ext: ".ts",
            binDir: existsSync(bin) ? bin : null,
          };
        }
      } catch {}
    }
  }
  for (const root of uniqueRoots) {
    const bundledCli = nodePath.join(root, "cli");
    if (existsSync(bundledCli)) {
      try {
        if (statSync(bundledCli).isDirectory()) {
          const bin = nodePath.join(root, "bin");
          return {
            root,
            cliDir: bundledCli,
            ext: ".js",
            binDir: existsSync(bin) ? bin : null,
          };
        }
      } catch {}
    }
  }
  return null;
}

function extractDescription(stem: string, head: string): string {
  if (KNOWN_DESCRIPTIONS[stem]) return KNOWN_DESCRIPTIONS[stem]!;
  const setDesc =
    /\.setDescription\(\s*(?:'([^']+)'|"([^"]+)"|`([^`]+)`)\s*,?\s*\)/.exec(
      head,
    );
  const matched = setDesc?.[1] ?? setDesc?.[2] ?? setDesc?.[3];
  if (matched && matched.trim()) return matched.trim();
  const banner = /\.banner\(\s*(?:'([^']+)'|"([^"]+)")/.exec(head);
  const bannerText = banner?.[1] ?? banner?.[2];
  if (bannerText && bannerText.trim()) return bannerText.trim();
  return `${stem.replace(/_cli$/, "").replace(/_/g, " ")} command-line utility`;
}

function extractFlags(stem: string, source: string): CliFlagInfo[] {
  if (KNOWN_FLAGS[stem]) return KNOWN_FLAGS[stem]!;
  const flags: CliFlagInfo[] = [];
  const seen = new Set<string>();

  const q = (g: number) => `(['"\`])((?:\\\\.|(?!\\${g}).)*)\\${g}`;
  const strRe = new RegExp(
    `\\.addFlagString\\(\\s*${q(1)}\\s*,\\s*${q(3)}\\s*,\\s*${q(5)}\\s*,\\s*${q(7)}\\s*,?\\s*\\)`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(source)) !== null) {
    const name = m[2]!.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    flags.push({
      name,
      short: m[4]?.trim() || undefined,
      type: "string",
      defaultValue: m[6] ?? "",
      description: m[8]?.trim() || name,
    });
  }

  const boolRe = new RegExp(
    `\\.addFlagBool\\(\\s*${q(1)}\\s*,\\s*${q(3)}\\s*,\\s*(true|false)\\s*,\\s*${q(6)}\\s*,?\\s*\\)`,
    "g",
  );
  while ((m = boolRe.exec(source)) !== null) {
    const name = m[2]!.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    flags.push({
      name,
      short: m[4]?.trim() || undefined,
      type: "bool",
      defaultValue: m[5] === "true",
      description: m[7]?.trim() || name,
    });
  }

  const intRe = new RegExp(
    `\\.addFlagInt\\(\\s*${q(1)}\\s*,\\s*${q(3)}\\s*,\\s*(-?\\d+)\\s*,\\s*${q(6)}\\s*,?\\s*\\)`,
    "g",
  );
  while ((m = intRe.exec(source)) !== null) {
    const name = m[2]!.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    flags.push({
      name,
      short: m[4]?.trim() || undefined,
      type: "int",
      defaultValue: Number(m[5]),
      description: m[7]?.trim() || name,
    });
  }

  return flags;
}

function buildExamples(stem: string, flags: CliFlagInfo[]): CliExampleInfo[] {
  if (KNOWN_EXAMPLES[stem]) return KNOWN_EXAMPLES[stem]!;
  const examples: CliExampleInfo[] = [];
  for (const f of flags.slice(0, 2)) {
    if (f.type === "bool") {
      examples.push({
        label: `--${f.name}`,
        args: `--${f.name}`,
        description: f.description,
      });
    } else if (f.type === "int") {
      const val =
        f.defaultValue !== undefined && f.defaultValue !== 0
          ? f.defaultValue
          : 10;
      examples.push({
        label: `--${f.name} ${val}`,
        args: `--${f.name} ${val}`,
        description: f.description,
      });
    } else {
      const sample =
        typeof f.defaultValue === "string" && f.defaultValue
          ? f.defaultValue
          : /file|path|input|image|db/i.test(f.name)
            ? "package.json"
            : /dir|folder/i.test(f.name)
              ? "."
              : /url|endpoint|host|domain/i.test(f.name)
                ? "example.com"
                : /expr|math|formula/i.test(f.name)
                  ? "2 + 2 * 10"
                  : "sample";
      examples.push({
        label: `--${f.name}`,
        args: `--${f.name} "${sample}"`,
        description: f.description,
      });
    }
  }
  examples.push({
    label: "--help",
    args: "--help",
    description: "Display command usage and available flags",
  });
  return examples;
}

let cachedCatalog: Array<
  Omit<
    CliUtilEntry,
    "wrapperPath" | "stemWrapperPath" | "command" | "stemCommand"
  >
> | null = null;

function discoverCatalog(): Array<
  Omit<
    CliUtilEntry,
    "wrapperPath" | "stemWrapperPath" | "command" | "stemCommand"
  >
> {
  if (cachedCatalog) return cachedCatalog;
  const loc = findCliSourceRoot();
  if (!loc) return [];
  let files: string[] = [];
  try {
    files = readdirSync(loc.cliDir)
      .filter((f) => f.endsWith(loc.ext))
      .sort();
  } catch {
    return [];
  }
  const items: Array<
    Omit<
      CliUtilEntry,
      "wrapperPath" | "stemWrapperPath" | "command" | "stemCommand"
    >
  > = [];
  for (const file of files) {
    const stem = file.slice(0, -loc.ext.length).replace(/-/g, "_");
    const id = stem.replace(/_cli$/, "");
    const dashedName = stem.replace(/_/g, "-");
    const suiteName = `codecaine-${id.replace(/_/g, "-")}`;
    const scriptPath = nodePath.join(loc.cliDir, file);
    let sourceHead = "";
    try {
      sourceHead = readFileSync(scriptPath, "utf8").slice(0, 8192);
    } catch {}
    const category = categorizeCli(stem);
    const flags = extractFlags(stem, sourceHead);
    items.push({
      id,
      stem,
      dashedName,
      suiteName,
      description: extractDescription(stem, sourceHead),
      category,
      icon: iconForCli(stem, category),
      flags,
      examples: buildExamples(stem, flags),
      scriptPath,
    });
  }
  cachedCatalog = items;
  return items;
}

/** The folder inside `ctx.dataDir` where ready-to-run CLI utility wrappers live. */
export function cliUtilsDir(
  ctx: Pick<FmContext, "dataDir" | "platform">,
): string {
  return pathApi(ctx).join(ctx.dataDir, "cli_utils");
}

function posixWrapperScript(execPath: string, scriptPath: string): string {
  const quotedExec = shSingleQuote(execPath);
  const quotedScript = shSingleQuote(scriptPath);
  return `#!/bin/sh
export BUN_BE_BUN=1
if [ -x ${quotedExec} ]; then
  exec ${quotedExec} ${quotedScript} "$@"
fi
exec bun ${quotedScript} "$@"
`;
}

function windowsCmdWrapper(execPath: string, scriptPath: string): string {
  return `@echo off\r\nset "BUN_BE_BUN=1"\r\n"${execPath}" "${scriptPath}" %*\r\n`;
}

const provisionedDirs = new Set<string>();

/**
 * Materializes the built-in `cli_utils` directory for `ctx` with executable wrappers for every `cli_apps/*.ts` tool,
 * so the user can open the terminal in `cliUtilsDir(ctx)` and run `./<name>` or `./<stem>` directly.
 */
export function ensureCliUtilsFolder(
  ctx: Pick<FmContext, "dataDir" | "platform">,
  options: { force?: boolean } = {},
): string {
  const dir = cliUtilsDir(ctx);
  if (!options.force && provisionedDirs.has(dir) && existsSync(dir)) return dir;
  const catalog = discoverCatalog();
  try {
    mkdirSync(dir, { recursive: true });
    if (lstatSync(dir).isSymbolicLink()) return dir;
    const execPath = process.execPath;
    for (const item of catalog) {
      const names = item.id === item.stem ? [item.id] : [item.id, item.stem];
      const shContent = posixWrapperScript(execPath, item.scriptPath);
      for (const name of names) {
        const target = nodePath.join(dir, name);
        try {
          if (lstatSync(target).isSymbolicLink()) unlinkSync(target);
        } catch {}
        writeFileSync(target, shContent, { mode: 0o755 });
        if (process.platform !== "win32") {
          try {
            chmodSync(target, 0o755);
          } catch {}
        }
        if (ctx.platform === "win32" || process.platform === "win32") {
          const cmdTarget = nodePath.join(dir, `${name}.cmd`);
          try {
            if (lstatSync(cmdTarget).isSymbolicLink()) unlinkSync(cmdTarget);
          } catch {}
          writeFileSync(
            cmdTarget,
            windowsCmdWrapper(execPath, item.scriptPath),
          );
        }
      }
    }
    provisionedDirs.add(dir);
  } catch {
    // A read-only test directory should not crash the server or terminal.
  }
  return dir;
}

/** Returns all built-in RAD Studio CLI utilities with their paths for `ctx`. */
export function listCliUtils(
  ctx: Pick<FmContext, "dataDir" | "platform">,
  options: { force?: boolean } = {},
): {
  folder: string;
  sourceFolder: string;
  binFolder: string;
  count: number;
  tools: CliUtilEntry[];
} {
  const folder = ensureCliUtilsFolder(ctx, options);
  const loc = findCliSourceRoot();
  const p = pathApi(ctx);
  const prefix = ctx.platform === "win32" ? ".\\" : "./";
  const ext = ctx.platform === "win32" ? ".cmd" : "";
  const tools: CliUtilEntry[] = discoverCatalog().map((item) => ({
    ...item,
    wrapperPath: p.join(folder, `${item.id}${ext}`),
    stemWrapperPath: p.join(folder, `${item.stem}${ext}`),
    command: `${prefix}${item.id}`,
    stemCommand: `${prefix}${item.stem}`,
  }));
  return {
    folder,
    sourceFolder: loc?.cliDir ?? "",
    binFolder: loc?.binDir ?? "",
    count: tools.length,
    tools,
  };
}

/**
 * Builds the environment for a built-in Terminal session, ensuring the built-in CLI utilities folder (and repo `bin/`
 * folder when present) are appended to `PATH` so tools can be run either as `./<name>` inside `cli_utils` or as
 * `<name>` / `<stem>` / `codecaine-<name>` from any folder without shadowing system commands.
 */
export function terminalEnv(
  ctx: Pick<FmContext, "dataDir" | "platform">,
  baseEnv: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const dir = ensureCliUtilsFolder(ctx);
  const loc = findCliSourceRoot();
  const sep = ctx.platform === "win32" ? ";" : ":";
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (typeof v === "string") env[k] = v;
  }
  const pathKey =
    ctx.platform === "win32" && "Path" in env && !("PATH" in env)
      ? "Path"
      : "PATH";
  const current = (env[pathKey] ?? env.PATH ?? env.Path ?? "")
    .split(sep)
    .filter(Boolean);
  const extras = [dir, ...(loc?.binDir ? [loc.binDir] : [])];
  for (const extra of extras) {
    if (extra && !current.includes(extra)) current.push(extra);
  }
  const joined = current.join(sep);
  env[pathKey] = joined;
  if (ctx.platform === "win32") {
    env.Path = joined;
    env.PATH = joined;
  }
  env.RAD_CLI_UTILS_DIR = dir;
  if (loc?.cliDir) env.RAD_CLI_APPS_DIR = loc.cliDir;
  if (ctx.platform !== "win32") {
    env.TERM = "xterm-256color";
    env.COLORTERM = "truecolor";
  }
  return env;
}

/** Strips ANSI color/cursor escape codes from CLI output for plain-text display and saving. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
}

/**
 * Parses a command-line arguments string into an argv array without invoking a shell.
 * Supports single quotes, double quotes, and backslash escaping.
 */
export function parseCliArgsString(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  if (/[\0\r\n]/.test(raw)) {
    throw new FmError(
      "BAD_INPUT",
      "Arguments cannot contain newline or null characters.",
    );
  }
  const out: string[] = [];
  let cur = "";
  let inToken = false;
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (quote === "'") {
      if (ch === "'") {
        quote = null;
      } else {
        cur += ch;
      }
      continue;
    }
    if (quote === '"') {
      if (ch === '"') {
        quote = null;
      } else if (ch === "\\" && i + 1 < raw.length) {
        const next = raw[++i]!;
        if (next === "n") cur += "\n";
        else if (next === "t") cur += "\t";
        else cur += next;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inToken = true;
      continue;
    }
    if (ch === "\\" && i + 1 < raw.length) {
      cur += raw[++i]!;
      inToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) {
        out.push(cur);
        cur = "";
        inToken = false;
      }
      continue;
    }
    cur += ch;
    inToken = true;
  }
  if (quote !== null) {
    throw new FmError(
      "BAD_INPUT",
      `Unclosed ${quote === '"' ? "double" : "single"} quote in arguments.`,
    );
  }
  if (inToken) out.push(cur);
  return out;
}

/** Finds a built-in CLI utility by id, stem, dashed name, or suite alias. */
export function resolveCliTool(
  ctx: Pick<FmContext, "dataDir" | "platform">,
  query: string,
): CliUtilEntry {
  const cleaned = String(query ?? "")
    .trim()
    .replace(/^(?:\.\/|\.\\)/, "")
    .replace(/\.(?:cmd|ts|js)$/i, "")
    .toLowerCase();
  if (!cleaned) {
    throw new FmError("BAD_INPUT", "No CLI utility name was provided.");
  }
  const { tools } = listCliUtils(ctx);
  const normalizedUnderscore = cleaned.replace(/-/g, "_");
  const match = tools.find(
    (t) =>
      t.id.toLowerCase() === cleaned ||
      t.id.toLowerCase() === normalizedUnderscore ||
      t.stem.toLowerCase() === cleaned ||
      t.stem.toLowerCase() === normalizedUnderscore ||
      t.dashedName.toLowerCase() === cleaned ||
      t.suiteName.toLowerCase() === cleaned,
  );
  if (!match) {
    throw new FmError("NOT_FOUND", `Unknown CLI utility "${query}".`);
  }
  return match;
}

const MAX_CAPTURE_BYTES = 256 * 1024;

async function readStreamBounded(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        const remaining = MAX_CAPTURE_BYTES - total;
        if (remaining > 0) {
          chunks.push(
            value.byteLength <= remaining
              ? value
              : value.subarray(0, remaining),
          );
        }
        total += value.byteLength;
      }
    }
  } catch {}
  const merged = Buffer.concat(chunks);
  const text = merged.toString("utf8");
  return total > MAX_CAPTURE_BYTES
    ? `${text}\n… [output truncated at 256 KB]`
    : text;
}

const PURE_INLINE_CLI_IDS = new Set([
  "calc",
  "sed",
  "tr",
  "cut",
  "regex",
  "color",
  "crypto",
  "markdown",
  "json",
]);

const SANDBOX_BLOCKED_CLI_IDS = new Set([
  "watchexec",
  "watcher",
  "rip",
  "port_kill",
  "process",
  "procs",
  "task_manager",
  "docker",
  "brew",
  "launchd",
  "launcher",
  "app_bundler",
  "bundler",
  "multirepo_git_pilot",
  "terminal_recorder_studio",
]);

function isUnconfirmedInlineCliAllowed(
  entry: CliUtilEntry,
  argv: string[],
  ctx: FmContext,
): boolean {
  if (ctx.sandboxRoot) return false;
  if (
    argv.length > 0 &&
    argv.every(
      (a) => a === "--help" || a === "-h" || a === "--version" || a === "-V",
    )
  ) {
    return true;
  }
  if (!PURE_INLINE_CLI_IDS.has(entry.id)) return false;
  const riskyFlagRe =
    /^(-i|--in-place|-f|--file|-o|--output|--out|-w|--write|--eval|--exec|--path|--dir|--db|--delete|--force)(?:=|$)/;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (riskyFlagRe.test(arg)) return false;
    if (arg === "--") return false;
  }
  return true;
}

function enforceCliSandboxContainment(
  ctx: FmContext,
  entry: CliUtilEntry,
  cwd: string,
  argv: string[],
): void {
  if (!ctx.sandboxRoot) return;
  if (SANDBOX_BLOCKED_CLI_IDS.has(entry.id)) {
    throw new FmError(
      "FORBIDDEN",
      `CLI utility "${entry.id}" is restricted when a workspace sandbox root is active.`,
    );
  }
  const realSandbox = (() => {
    try {
      return realpathSync(ctx.sandboxRoot!);
    } catch {
      return ctx.sandboxRoot!;
    }
  })();
  const realCwd = (() => {
    try {
      return realpathSync(cwd);
    } catch {
      return cwd;
    }
  })();
  if (!isSameOrInside(realCwd, realSandbox, ctx.platform)) {
    throw new FmError(
      "FORBIDDEN",
      "Working folder is outside the allowed sandbox root.",
    );
  }
  const p = pathApi(ctx);
  for (const arg of argv) {
    if (!arg || arg.startsWith("-") || arg === ":memory:") continue;
    if (
      arg.includes("..") ||
      arg.includes("/") ||
      arg.includes("\\") ||
      /^[A-Za-z]:/.test(arg)
    ) {
      const resolvedArg = p.isAbsolute(arg)
        ? p.resolve(arg)
        : p.resolve(realCwd, arg);
      if (!isSameOrInside(resolvedArg, realSandbox, ctx.platform)) {
        throw new FmError(
          "FORBIDDEN",
          `Argument "${arg}" resolves outside the allowed sandbox root.`,
        );
      }
      try {
        const realArg = realpathSync(resolvedArg);
        if (!isSameOrInside(realArg, realSandbox, ctx.platform)) {
          throw new FmError(
            "FORBIDDEN",
            `Argument "${arg}" points outside the allowed sandbox root.`,
          );
        }
      } catch (err) {
        if (err instanceof FmError) throw err;
      }
    }
  }
}

/**
 * Runs a built-in CLI utility directly via `Bun.spawn` (without a shell) and captures its output.
 */
export async function runCliUtil(
  ctx: FmContext,
  options: {
    tool: string;
    args?: string | string[];
    cwd?: string;
    timeoutMs?: number;
  },
): Promise<CliRunResult> {
  const entry = resolveCliTool(ctx, options.tool);
  let argv: string[];
  if (Array.isArray(options.args)) {
    argv = options.args.map((a) => {
      const s = String(a);
      if (s.includes("\0"))
        throw new FmError(
          "BAD_INPUT",
          "Arguments cannot contain null characters.",
        );
      return s;
    });
  } else if (typeof options.args === "string") {
    argv = parseCliArgsString(options.args);
  } else {
    argv = [];
  }

  let cwd = ctx.sandboxRoot || ensureCliUtilsFolder(ctx);
  if (typeof options.cwd === "string" && options.cwd.trim()) {
    const resolved = absolutePath(ctx, options.cwd);
    await assertFolder(resolved, "That working folder");
    cwd = resolved;
  }
  enforceCliSandboxContainment(ctx, entry, cwd, argv);

  const timeoutMs = Math.max(
    500,
    Math.min(60_000, Number(options.timeoutMs) || 15_000),
  );
  const env = {
    ...terminalEnv(ctx),
    BUN_BE_BUN: "1",
  };

  const startedAt = performance.now();
  let timedOut = false;
  const proc = Bun.spawn([process.execPath, entry.scriptPath, ...argv], {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill();
    } catch {}
  }, timeoutMs);

  let stdout = "";
  let stderr = "";
  let exitCode = 1;
  try {
    [stdout, stderr, exitCode] = await Promise.all([
      readStreamBounded(proc.stdout),
      readStreamBounded(proc.stderr),
      proc.exited,
    ]);
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
  const combined = [stdout, stderr]
    .filter(Boolean)
    .join(stdout && stderr && !stdout.endsWith("\n") ? "\n" : "");
  const cleanOutput = stripAnsi(combined);
  const formattedArgs = argv
    .map((a) => (/[\s"'\\]/.test(a) ? `"${a.replace(/["\\]/g, "\\$&")}"` : a))
    .join(" ");

  return {
    ok: exitCode === 0 && !timedOut,
    tool: entry,
    command: formattedArgs
      ? `${entry.command} ${formattedArgs}`
      : entry.command,
    args: argv,
    cwd,
    exitCode: timedOut ? 124 : exitCode,
    stdout,
    stderr,
    output: combined,
    cleanOutput,
    durationMs,
    ...(timedOut ? { timedOut: true } : {}),
  };
}

/** File Manager API handlers for listing, provisioning, and executing built-in RAD Studio CLI utilities. */
export const cliUtilsOperations: Record<string, FmHandler> = {
  async "cliutils/list"(ctx) {
    return listCliUtils(ctx);
  },
  async "cliutils/ensure"(ctx, b) {
    return listCliUtils(ctx, { force: b.force === true });
  },
  async "cliutils/run"(ctx, b) {
    const toolName = typeof b.tool === "string" ? b.tool : "";
    const entry = resolveCliTool(ctx, toolName);
    const rawArgs = Array.isArray(b.args)
      ? b.args.map(String)
      : typeof b.args === "string"
        ? b.args
        : "";
    const parsedArgv = Array.isArray(rawArgs)
      ? rawArgs
      : parseCliArgsString(rawArgs);
    if (
      b.confirm !== true &&
      !isUnconfirmedInlineCliAllowed(entry, parsedArgv, ctx)
    ) {
      throw new FmError(
        "NEEDS_CONFIRM",
        `Running CLI utility "${entry.id}" requires confirmation.`,
        { tool: entry.id },
      );
    }
    return runCliUtil(ctx, {
      tool: toolName,
      args: rawArgs,
      cwd: typeof b.cwd === "string" && b.cwd.trim() ? b.cwd : undefined,
      timeoutMs: typeof b.timeoutMs === "number" ? b.timeoutMs : undefined,
    });
  },
};
