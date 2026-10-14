/**
 * Which developer tools are installed and their versions, for the Dev tab. Each tool is found in the usual places and
 * asked for its version with `--version` (an argument list, no shell, a short time limit). Answers are kept for a few
 * minutes. Nothing is ever installed: missing tools only get an install hint to read.
 */
import type { FmContext } from "./fmCore";
import { capture } from "./fmToolDetect";
import { childEnv, findExecutable, searchDirs } from "./fmTools";

interface ToolDef {
  id: string;
  name: string;
  /** Program names to look for, best first. */
  programs: string[];
  args: string[];
  group: "runtime" | "build" | "vcs" | "other";
  brew?: string;
  apt?: string;
  winget?: string;
  other?: string;
}

const TOOLS: ToolDef[] = [
  { id: "git", name: "Git", programs: ["git"], args: ["--version"], group: "vcs", brew: "git", apt: "git", winget: "Git.Git" },
  { id: "gh", name: "GitHub CLI", programs: ["gh"], args: ["--version"], group: "vcs", brew: "gh", apt: "gh", winget: "GitHub.cli" },
  { id: "bun", name: "Bun", programs: ["bun"], args: ["--version"], group: "runtime", brew: "oven-sh/bun/bun", other: "curl -fsSL https://bun.sh/install | bash", winget: "Oven-sh.Bun" },
  { id: "node", name: "Node.js", programs: ["node"], args: ["--version"], group: "runtime", brew: "node", apt: "nodejs", winget: "OpenJS.NodeJS" },
  { id: "npm", name: "npm", programs: ["npm"], args: ["--version"], group: "runtime", brew: "node", apt: "npm" },
  { id: "pnpm", name: "pnpm", programs: ["pnpm"], args: ["--version"], group: "runtime", brew: "pnpm", other: "npm install -g pnpm", winget: "pnpm.pnpm" },
  { id: "yarn", name: "Yarn", programs: ["yarn"], args: ["--version"], group: "runtime", brew: "yarn", other: "npm install -g yarn" },
  { id: "deno", name: "Deno", programs: ["deno"], args: ["--version"], group: "runtime", brew: "deno", winget: "DenoLand.Deno" },
  { id: "python3", name: "Python 3", programs: ["python3", "python"], args: ["--version"], group: "runtime", brew: "python", apt: "python3", winget: "Python.Python.3.12" },
  { id: "pip", name: "pip", programs: ["pip3", "pip"], args: ["--version"], group: "runtime", brew: "python", apt: "python3-pip" },
  { id: "go", name: "Go", programs: ["go"], args: ["version"], group: "runtime", brew: "go", apt: "golang", winget: "GoLang.Go" },
  { id: "rustc", name: "Rust compiler", programs: ["rustc"], args: ["--version"], group: "runtime", brew: "rust", other: "curl https://sh.rustup.rs -sSf | sh", winget: "Rustlang.Rustup" },
  { id: "cargo", name: "Cargo", programs: ["cargo"], args: ["--version"], group: "build", brew: "rust", other: "curl https://sh.rustup.rs -sSf | sh", winget: "Rustlang.Rustup" },
  { id: "v", name: "V", programs: ["v"], args: ["version"], group: "runtime", brew: "vlang", other: "https://github.com/vlang/v#installing-v-from-source" },
  { id: "java", name: "Java runtime", programs: ["java"], args: ["-version"], group: "runtime", brew: "openjdk", apt: "default-jre", winget: "EclipseAdoptium.Temurin.21.JDK" },
  { id: "javac", name: "Java compiler", programs: ["javac"], args: ["-version"], group: "build", brew: "openjdk", apt: "default-jdk", winget: "EclipseAdoptium.Temurin.21.JDK" },
  { id: "dotnet", name: ".NET SDK", programs: ["dotnet"], args: ["--version"], group: "runtime", brew: "dotnet", apt: "dotnet-sdk-8.0", winget: "Microsoft.DotNet.SDK.8" },
  { id: "ruby", name: "Ruby", programs: ["ruby"], args: ["--version"], group: "runtime", brew: "ruby", apt: "ruby", winget: "RubyInstallerTeam.Ruby.3.3" },
  { id: "php", name: "PHP", programs: ["php"], args: ["--version"], group: "runtime", brew: "php", apt: "php-cli", winget: "PHP.PHP.8.3" },
  { id: "swift", name: "Swift", programs: ["swift"], args: ["--version"], group: "runtime", other: "Install Xcode or the Swift toolchain from swift.org", brew: "swift" },
  { id: "clang", name: "clang", programs: ["clang"], args: ["--version"], group: "build", brew: "llvm", apt: "clang", other: "xcode-select --install" },
  { id: "gcc", name: "gcc", programs: ["gcc"], args: ["--version"], group: "build", brew: "gcc", apt: "build-essential", other: "xcode-select --install" },
  { id: "make", name: "make", programs: ["make", "gmake"], args: ["--version"], group: "build", brew: "make", apt: "make", other: "xcode-select --install" },
  { id: "cmake", name: "CMake", programs: ["cmake"], args: ["--version"], group: "build", brew: "cmake", apt: "cmake", winget: "Kitware.CMake" },
  { id: "docker", name: "Docker", programs: ["docker"], args: ["--version"], group: "other", brew: "--cask docker", apt: "docker.io", winget: "Docker.DockerDesktop" },
  { id: "tokei", name: "tokei", programs: ["tokei"], args: ["--version"], group: "other", brew: "tokei", apt: "tokei", other: "cargo install tokei", winget: "XAMPPRocky.tokei" },
  { id: "rg", name: "ripgrep", programs: ["rg"], args: ["--version"], group: "other", brew: "ripgrep", apt: "ripgrep", winget: "BurntSushi.ripgrep.MSVC" },
  { id: "fd", name: "fd", programs: ["fd", "fdfind"], args: ["--version"], group: "other", brew: "fd", apt: "fd-find", winget: "sharkdp.fd" },
  { id: "jq", name: "jq", programs: ["jq"], args: ["--version"], group: "other", brew: "jq", apt: "jq", winget: "jqlang.jq" },
];

export interface EnvTool {
  id: string;
  name: string;
  group: ToolDef["group"];
  installed: boolean;
  path: string | null;
  version: string | null;
  /** What to type to install it; shown only. */
  hint: string;
  note?: string;
}

const CACHE_MS = 5 * 60_000;
/** One version request gets this long; the whole check gets TOTAL_MS, so one slow program never holds up the table. */
const PROBE_MS = 2500;
const TOTAL_MS = 8000;
const PARALLEL = 12;
const LATE_NOTE = "Found, but it didn't answer in time. Try Check again.";
const cache = new WeakMap<FmContext, { at: number; tools: EnvTool[] }>();

function hintFor(t: ToolDef, platform: FmContext["platform"]): string {
  if (platform === "darwin") return t.brew ? `brew install ${t.brew}` : t.other ?? "";
  if (platform === "linux") return t.apt ? `sudo apt install ${t.apt}` : t.brew ? `brew install ${t.brew}` : t.other ?? "";
  return t.winget ? `winget install ${t.winget}` : t.other ?? "";
}

export function parseToolVersion(text: string): string | null {
  const line = text.split(/\r?\n/).find((l) => /\d+\.\d+/.test(l)) ?? "";
  return /(\d+\.\d+(?:\.\d+)*[\w.+-]*)/.exec(line)?.[1] ?? null;
}

async function probe(ctx: FmContext, t: ToolDef, dirs: string[], env: Record<string, string>, tools: { xcode: boolean | null }): Promise<EnvTool> {
  const base: EnvTool = { id: t.id, name: t.name, group: t.group, installed: false, path: null, version: null, hint: hintFor(t, ctx.platform) };
  const path = findExecutable(ctx.platform, t.programs, dirs);
  if (!path) return base;
  // On a Mac without the command line tools, /usr/bin programs are stubs that pop up an installer window. Don't start them.
  if (ctx.platform === "darwin" && path.startsWith("/usr/bin/") && tools.xcode === false) return { ...base, path, note: "Needs the Xcode command line tools (xcode-select --install)." };
  const out = await capture([path, ...t.args], env, PROBE_MS);
  const version = out.code === 0 || out.text.trim() ? parseToolVersion(out.text) : null;
  if (out.code === null || (out.code !== 0 && !version)) return { ...base, path, note: "Found, but it didn't answer a version request." };
  return { ...base, installed: true, path, version };
}

/** The tools and their versions. Answers are kept for five minutes; `refresh` asks again. */
export async function detectEnvironment(ctx: FmContext, refresh = false): Promise<{ tools: EnvTool[]; checkedAt: number; cached: boolean }> {
  const hit = cache.get(ctx);
  if (hit && !refresh && Date.now() - hit.at < CACHE_MS) return { tools: hit.tools, checkedAt: hit.at, cached: true };
  const extra = ctx.toolDirs ? [] : [`${ctx.home}/.bun/bin`, `${ctx.home}/.cargo/bin`, `${ctx.home}/go/bin`, "/usr/local/go/bin", `${ctx.home}/.deno/bin`, `${ctx.home}/.local/bin`, "/usr/local/share/dotnet", `${ctx.home}/.dotnet`, "/opt/homebrew/opt/openjdk/bin", "/usr/local/opt/openjdk/bin"];
  const dirs = [...searchDirs(ctx), ...extra];
  const env = childEnv(ctx);
  let xcode: boolean | null = null;
  if (ctx.platform === "darwin" && !ctx.toolDirs) xcode = (await capture(["xcode-select", "-p"], env, PROBE_MS)).code === 0;
  const done = new Map<string, EnvTool>();
  const queue = [...TOOLS];
  let timedOut = false;
  const workers = Promise.all(Array.from({ length: PARALLEL }, async () => {
    for (let t = queue.shift(); t && !timedOut; t = queue.shift()) done.set(t.id, await probe(ctx, t, dirs, env, { xcode }));
  }));
  let limit: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([workers, new Promise<void>((resolve) => { limit = setTimeout(resolve, TOTAL_MS); })]);
  clearTimeout(limit);
  timedOut = true;
  // Anything still waiting (or never started) is reported as slow instead of making the page wait for it.
  const tools: EnvTool[] = TOOLS.map((t) => {
    const got = done.get(t.id);
    if (got) return got;
    const path = findExecutable(ctx.platform, t.programs, dirs);
    return { id: t.id, name: t.name, group: t.group, installed: false, path, version: null, hint: hintFor(t, ctx.platform), ...(path ? { note: LATE_NOTE } : {}) };
  });
  const slow = tools.some((t) => t.note === LATE_NOTE);
  const at = Date.now();
  if (!slow) cache.set(ctx, { at, tools });
  return { tools, checkedAt: at, cached: false };
}
