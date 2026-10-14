import { existsSync, promises as fsp } from "fs";
import * as nodePath from "path";
import { absolutePath, assertCreatable, assertFolder, type FmContext, type FmHandler } from "./fmCore";
import { FmError, uniqueName, validateName } from "./fmPaths";
import { clampSize } from "./fmTerminal";
import { MAX_ACTIVE_WATCHERS, MAX_HISTORY, getWatchHub, type ShellChoice, type WatchConfig, type Watcher } from "./fmWatch";

export const MAX_COMMAND_LENGTH = 4000;
const MAX_LIST_ITEMS = 100;
const MAX_ITEM_LENGTH = 200;

export const DEFAULT_EXTENSIONS = ["ts", "js", "json", "html", "css"];
export const DEFAULT_IGNORE = ["node_modules", ".git", "dist", "build", ".cache", ".graveyard"];
export const DEFAULT_DEBOUNCE = 150;

interface Preset {
  id: string;
  label: string;
  command: string;
  hint: string;
}

/** The ready-made commands. Picking one only fills the command box; the person can still edit it. */
export function presetsFor(platform: FmContext["platform"]): Preset[] {
  const win = platform === "win32";
  const list: Preset[] = [
    { id: "hello", label: "Say hello (safe demo)", command: "echo Hello from the watcher", hint: "Only prints a message, so it is a safe way to see how watching works." },
    { id: "changed", label: "Show the changed file (demo)", command: win ? "echo Changed: %WATCHEXEC_TRIGGERED_PATH%" : 'echo "Changed: $WATCHEXEC_TRIGGERED_PATH"', hint: "Prints the file that changed, using the WATCHEXEC_TRIGGERED_PATH variable that every triggered run receives." },
    { id: "bun-test", label: "Run tests (bun test)", command: "bun test", hint: "Runs the tests of a Bun project." },
    { id: "bun-run", label: "Run the program (bun run index.ts)", command: "bun run index.ts", hint: "Starts index.ts with Bun each time something changes." },
    { id: "tsc", label: "Check types (tsc)", command: "bunx tsc --noEmit", hint: "Finds type mistakes in a TypeScript project without producing files." },
    { id: "eslint", label: "Check style (eslint)", command: "bunx eslint .", hint: "Runs the ESLint code checker on the folder." },
    { id: "bun-build", label: "Build (bun build)", command: "bun build ./index.ts --outdir ./dist", hint: "Bundles index.ts into the dist folder (which the watcher ignores by default)." },
    { id: "npm-test", label: "Run tests (npm test)", command: "npm test", hint: "Runs the test script of a Node project." },
    { id: "npm-build", label: "Build (npm run build)", command: "npm run build", hint: "Runs the build script of a Node project." },
    { id: "npm-dev", label: "Start dev script (npm run dev)", command: "npm run dev", hint: "Runs the dev script of a Node project; it is restarted after each change." },
    { id: "pytest", label: "Run tests (pytest)", command: win ? "python -m pytest" : "python3 -m pytest", hint: "Runs the tests of a Python project." },
    { id: "cargo-test", label: "Run tests (cargo test)", command: "cargo test", hint: "Runs the tests of a Rust project." },
    { id: "go-test", label: "Run tests (go test)", command: "go test ./...", hint: "Runs the tests of a Go project." },
  ];
  if (!win) list.push({ id: "make", label: "Build (make)", command: "make", hint: "Runs make in the folder." });
  return list;
}

export function shellsFor(platform: FmContext["platform"]): Array<{ id: ShellChoice; label: string }> {
  return platform === "win32"
    ? [{ id: "cmd", label: "Command Prompt (cmd)" }, { id: "powershell", label: "Windows PowerShell" }]
    : [{ id: "sh", label: "sh (default)" }, { id: "bash", label: "bash" }, { id: "zsh", label: "zsh" }];
}

/** A list typed as "a, b" or given as an array: trimmed, without blanks or repeats. */
function listOf(value: unknown, what: string): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\n]/) : value === undefined || value === null ? [] : null;
  if (!raw) throw new FmError("BAD_REQUEST", `${what} should be a list.`);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") throw new FmError("BAD_REQUEST", `${what} should be a list of text.`);
    const text = item.trim();
    if (!text || out.includes(text)) continue;
    if (text.length > MAX_ITEM_LENGTH || text.includes("\0")) throw new FmError("BAD_REQUEST", `One of the entries in "${what}" is too long or isn't valid.`);
    out.push(text);
  }
  if (out.length > MAX_LIST_ITEMS) throw new FmError("BAD_REQUEST", `"${what}" can have at most ${MAX_LIST_ITEMS} entries.`);
  return out;
}

export function parseConfig(ctx: FmContext, b: Record<string, any>): WatchConfig & { cwdGiven: boolean } {
  const command = typeof b.command === "string" ? b.command.trim() : "";
  if (!command) throw new FmError("BAD_REQUEST", "Type the command to run when files change.");
  if (command.length > MAX_COMMAND_LENGTH) throw new FmError("BAD_REQUEST", `That command is too long (the limit is ${MAX_COMMAND_LENGTH} characters).`);
  if (command.includes("\0")) throw new FmError("BAD_REQUEST", "That command isn't valid.");

  const exts = listOf(b.exts, "Extensions").map((e) => e.replace(/^[.*]+/, "").toLowerCase());
  for (const e of exts) if (!/^[\w+-]{1,20}$/.test(e)) throw new FmError("BAD_REQUEST", `"${e}" isn't a file extension. Use letters and numbers, like ts, js or json.`);
  const filters = listOf(b.filters, "Filters");
  for (const f of filters) {
    try {
      new RegExp(f);
    } catch {
      throw new FmError("BAD_REQUEST", `The filter "${f}" isn't a valid pattern. Use plain text, or check the brackets and symbols.`);
    }
  }

  let shell: ShellChoice | null = null;
  if (b.shell !== undefined && b.shell !== null && b.shell !== "") {
    const choice = shellsFor(ctx.platform).find((s) => s.id === b.shell);
    if (!choice) throw new FmError("BAD_REQUEST", "That shell isn't available on this computer.");
    shell = choice.id;
  }

  return {
    watchPath: absolutePath(ctx, b.path),
    cwd: typeof b.cwd === "string" && b.cwd.trim() ? absolutePath(ctx, b.cwd) : "",
    cwdGiven: typeof b.cwd === "string" && !!b.cwd.trim(),
    command,
    exts,
    ignore: listOf(b.ignore, "Ignore patterns"),
    filters,
    debounce: clampSize(b.debounce, DEFAULT_DEBOUNCE, 50, 10_000),
    clear: b.clear === true,
    postponeInitial: b.postponeInitial === true,
    restart: b.restart !== false,
    shell,
  };
}

function find(ctx: FmContext, b: Record<string, any>): Watcher {
  const watcher = typeof b.id === "string" ? getWatchHub(ctx).watchers.get(b.id) : undefined;
  if (!watcher) throw new FmError("NOT_FOUND", "That watcher isn't there any more. It may have been removed.");
  return watcher;
}

function summary(w: Watcher) {
  return {
    id: w.id,
    state: w.state,
    running: w.running,
    path: w.config.watchPath,
    cwd: w.config.cwd,
    command: w.config.command,
    triggerCount: w.triggerCount,
    lastEvent: w.lastEvent,
    message: w.message,
  };
}

function stamp(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

/** API operations of the "Watch" power tool, namespaced `watch/...`. */
export const watchOperations: Record<string, FmHandler> = {
  async "watch/presets"(ctx) {
    return {
      presets: presetsFor(ctx.platform),
      shells: shellsFor(ctx.platform),
      defaults: { exts: DEFAULT_EXTENSIONS, ignore: DEFAULT_IGNORE, debounce: DEFAULT_DEBOUNCE },
      maxWatchers: MAX_ACTIVE_WATCHERS,
      maxCommandLength: MAX_COMMAND_LENGTH,
    };
  },

  async "watch/start"(ctx, b) {
    if (b.confirm !== true) throw new FmError("NEEDS_CONFIRM", "Starting a watcher runs a command on this computer every time files change, so it needs your confirmation.");
    const { cwdGiven, ...config } = parseConfig(ctx, b);
    await assertFolder(config.watchPath, "The folder to watch");
    if (!cwdGiven) config.cwd = config.watchPath;
    else await assertFolder(config.cwd, "The folder to run the command in");
    const watcher = getWatchHub(ctx).create(config);
    return { id: watcher.id };
  },

  async "watch/stop"(ctx, b) {
    find(ctx, b).stop();
    return { stopped: true };
  },

  async "watch/remove"(ctx, b) {
    find(ctx, b);
    return { removed: getWatchHub(ctx).remove(b.id) };
  },

  async "watch/run"(ctx, b) {
    return { result: await find(ctx, b).run(null) };
  },

  async "watch/kill"(ctx, b) {
    return { killed: find(ctx, b).kill() };
  },

  async "watch/clear"(ctx, b) {
    const w = find(ctx, b);
    if (b.log !== false) w.log.clear();
    if (b.history === true) w.history.length = 0;
    return { cleared: true };
  },

  async "watch/state"(ctx, b) {
    const w = find(ctx, b);
    w.checkFolder();
    return {
      ...summary(w),
      status: w.status,
      pid: w.pid,
      history: w.history.slice(0, MAX_HISTORY),
      ...w.log.read(b.since, b.epoch),
      config: { exts: w.config.exts, ignore: w.config.ignore, filters: w.config.filters, debounce: w.config.debounce, clear: w.config.clear, postponeInitial: w.config.postponeInitial, restart: w.config.restart, shell: w.config.shell },
    };
  },

  async "watch/list"(ctx) {
    return { watchers: [...getWatchHub(ctx).watchers.values()].map(summary), max: MAX_ACTIVE_WATCHERS };
  },

  async "watch/export"(ctx, b) {
    const w = find(ctx, b);
    const folder = absolutePath(ctx, b.folder);
    await assertFolder(folder, "The folder to save the log in");
    assertCreatable(ctx, folder);
    const wanted = b.name === undefined || b.name === null || b.name === "" ? `watcher-log-${stamp()}.txt` : b.name;
    const problem = validateName(wanted, ctx.platform);
    if (problem) throw new FmError("BAD_NAME", problem);
    const { text, truncated } = w.log.snapshot();
    const content = (truncated ? "[The oldest output was dropped to keep the log a reasonable size.]\n" : "") + text;
    // "wx" never overwrites: if the name is taken in the meantime, the next free one is used.
    for (let attempt = 0; attempt < 20; attempt++) {
      const name = uniqueName(String(wanted).trim(), (candidate) => existsSync(nodePath.join(folder, candidate)));
      const target = nodePath.join(folder, name);
      try {
        await fsp.writeFile(target, content, { flag: "wx" });
        return { path: target, name, bytes: Buffer.byteLength(content) };
      } catch (err: any) {
        if (err?.code !== "EEXIST") throw err;
      }
    }
    throw new FmError("NO_FREE_NAME", "Could not find a free name for the log.");
  },
};
