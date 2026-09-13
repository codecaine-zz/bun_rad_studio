#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runWatchexecCoordinator } from "./watchexecCoordinator.ts";
import type { WatchexecOptions } from "./watchexecTypes.ts";

export function parseWatchexecArguments(args: string[]): WatchexecOptions {
  // Find where "--" or positional command begins
  const dashIndex = args.indexOf("--");
  const parseableArgs = dashIndex !== -1 ? args.slice(0, dashIndex) : args;
  const commandAfterDash = dashIndex !== -1 ? args.slice(dashIndex + 1) : [];

  const { values, positionals } = parseArgs({
    args: parseableArgs,
    options: {
      watch: { type: "string", short: "w" },
      exts: { type: "string", short: "e" },
      ignore: { type: "string", short: "i" },
      debounce: { type: "string", short: "d", default: "100" },
      clear: { type: "boolean", short: "c", default: false },
      restart: { type: "boolean", short: "r", default: true },
      "no-restart": { type: "boolean", default: false },
      postpone: { type: "boolean", short: "p", default: false },
      filter: { type: "string", short: "f" },
      shell: { type: "string", short: "s" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printWatchexecHelp();
    process.exit(0);
  }

  const command = commandAfterDash.length > 0 ? commandAfterDash : positionals;
  if (command.length === 0) {
    printWatchexecHelp();
    process.exit(1);
  }

  const extensions = values.exts
    ? values.exts.split(",").map((s) => s.trim().replace(/^\./, ""))
    : undefined;

  const defaultIgnores = ["node_modules", ".git", ".graveyard", "dist", "build"];
  const userIgnores = values.ignore ? values.ignore.split(",").map((s) => s.trim()) : [];
  const ignorePatterns = [...defaultIgnores, ...userIgnores];
  const filterPatterns = values.filter ? values.filter.split(",").map((s) => s.trim()) : undefined;

  const watchPaths = values.watch ? values.watch.split(",").map((s) => s.trim()) : ["."];
  const debounceMs = parseInt(values.debounce ?? "100", 10);
  const restart = values["no-restart"] ? false : (values.restart ?? true);
  const runOnStart = !values.postpone;

  return {
    watchPaths,
    command,
    extensions,
    filterPatterns,
    ignorePatterns,
    debounceMs: isNaN(debounceMs) ? 100 : debounceMs,
    clear: values.clear ?? false,
    restart,
    runOnStart,
    shell: values.shell,
  };
}

export function printWatchexecHelp(): void {
  console.log(`Usage: watchexec [options] [--] <command...>

Executes commands in response to file modifications.

Arguments:
  <command...>         Command to execute when watched files change

Options:
  -w, --watch <path>   Path(s) to watch (default: ".")
  -e, --exts <exts>    Comma-separated list of file extensions to watch (e.g. "ts,js,json")
  -i, --ignore <pat>   Comma-separated list of path patterns to ignore
  -d, --debounce <ms>  Debounce delay before triggering command (default: 100ms)
  -c, --clear          Clear screen before running command
  -r, --restart        Restart command if already running (default: true)
  -s, --shell <shell>  Run command using shell (e.g. "bash", "sh", "zsh")
  --no-restart         Do not restart command if already running
  --postpone           Wait for first change event before running command
  -h, --help           Print help information
`);
}

async function main(): Promise<void> {
  const options = parseWatchexecArguments(process.argv.slice(2));
  const watcher = await runWatchexecCoordinator(options);

  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
}

if (import.meta.main) {
  await main();
}
