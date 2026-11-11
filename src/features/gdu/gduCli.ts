#!/usr/bin/env bun
/**
 * Command-line entry point and argument parser for the `gdu` disk usage analyzer.
 */
import { parseArgs } from "node:util";
import { analyzeDirectory, runGduCoordinator } from "./gduCoordinator.ts";
import { runGduTui } from "./gduTui.ts";
import type { GduOptions } from "./gduTypes.ts";

/**
 * Parses CLI flags and positional target directory arguments into a structured `GduOptions` object.
 */
export function parseGduArguments(args: string[]): GduOptions {
  let values: Record<string, any>;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args,
      options: {
        "non-interactive": { type: "boolean", short: "n", default: false },
        "show-item-count": { type: "boolean", short: "C", default: false },
        "show-relative-size": { type: "boolean", short: "B", default: false },
        "show-disks": { type: "boolean", short: "d", default: false },
        summarize: { type: "boolean", short: "s", default: false },
        "no-hidden": { type: "boolean", short: "H", default: false },
        "no-cross": { type: "boolean", short: "x", default: false },
        top: { type: "string", short: "t" },
        si: { type: "boolean", default: false },
        "ignore-dirs": { type: "string", short: "i" },
        "max-depth": { type: "string", short: "L" },
        sort: { type: "string", short: "S" },
        json: { type: "boolean", short: "j", default: false },
        "min-size": { type: "string", short: "m" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (values.help) {
    printGduHelp();
    process.exit(0);
  }

  const targetDir = positionals[0] ?? ".";
  const top = values.top ? parseInt(values.top, 10) : undefined;
  const maxDepth = values["max-depth"]
    ? parseInt(values["max-depth"], 10)
    : undefined;
  const ignoreDirs = values["ignore-dirs"]
    ? values["ignore-dirs"].split(",")
    : [];
  const sortBy = values.sort as GduOptions["sortBy"];

  return {
    targetDir,
    nonInteractive: values["non-interactive"] ?? false,
    showItemCount: values["show-item-count"] ?? false,
    showRelativeSize: values["show-relative-size"] ?? false,
    showDisks: values["show-disks"] ?? false,
    summarize: values.summarize ?? false,
    noHidden: values["no-hidden"] ?? false,
    noCross: values["no-cross"] ?? false,
    top,
    si: values.si ?? false,
    ignoreDirs,
    maxDepth,
    sortBy,
    minSize: values["min-size"],
    json: values.json ?? false,
  };
}

/**
 * Prints usage instructions and available CLI flags for `gdu` to stdout.
 */
export function printGduHelp(): void {
  console.log(`Usage: gdu [directory_to_scan] [flags]

Pretty fast disk usage analyzer written in Bun.

Arguments:
  [directory_to_scan]          Directory to scan (default: ".")

Flags:
  -n, --non-interactive        Do not run in interactive mode (print report)
  -j, --json                   Output directory tree and usage as JSON
  -m, --min-size <size>        Filter out items smaller than size (e.g. 1M, 500k)
  -C, --show-item-count        Show number of items in directory
  -B, --show-relative-size     Show relative size bar [##########]
  -s, --summarize              Show only a total
  -d, --show-disks             Show all mounted disks
  -t, --top <int>              Show only top X largest files/dirs
  -L, --max-depth <n>          Maximum recursion depth
  -S, --sort <size|name|count> Sort items by size, name, or count
  -H, --no-hidden              Ignore hidden directories (beginning with dot)
  -i, --ignore-dirs <paths>    Paths to ignore (comma-separated)
      --si                     Show sizes with decimal SI prefixes (kB, MB, GB)
  -h, --help                   Print help information
`);
}

async function main(): Promise<void> {
  const options = parseGduArguments(process.argv.slice(2));
  if (
    !options.nonInteractive &&
    process.stdin.isTTY &&
    !options.json &&
    !options.showDisks
  ) {
    const root = await analyzeDirectory(options);
    await runGduTui(root);
    return;
  }
  const lines = await runGduCoordinator(options);
  for (const line of lines) {
    console.log(line);
  }
}

if (import.meta.main) {
  await main();
}
