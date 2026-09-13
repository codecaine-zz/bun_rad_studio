#!/usr/bin/env bun
import { existsSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import { runFdCoordinator } from "./fdCoordinator.ts";
import type { EntryTypeFilter, FdOptions } from "./fdTypes.ts";

export function parseFdArguments(args: string[]): FdOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      hidden: { type: "boolean", short: "H", default: false },
      type: { type: "string", short: "t" },
      extension: { type: "string", short: "e" },
      "max-depth": { type: "string", short: "d" },
      absolute: { type: "boolean", short: "a", default: false },
      "case-sensitive": { type: "boolean", short: "s" },
      "ignore-case": { type: "boolean", short: "i" },
      exec: { type: "string", short: "x" },
      exclude: { type: "string", short: "E" },
      size: { type: "string", short: "S" },
      "min-depth": { type: "string" },
      "changed-within": { type: "string" },
      empty: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printFdHelp();
    process.exit(0);
  }

  let pattern = positionals[0];
  let rootPath = positionals[1] ?? ".";

  if (positionals.length === 1 && pattern && existsSync(pattern)) {
    try {
      if (statSync(pattern).isDirectory()) {
        rootPath = pattern;
        pattern = undefined;
      }
    } catch {
      // Keep as pattern
    }
  }

  const maxDepth = values["max-depth"] ? parseInt(values["max-depth"], 10) : undefined;
  const minDepth = values["min-depth"] ? parseInt(values["min-depth"], 10) : undefined;
  let caseSensitive: boolean | undefined = undefined;
  if (values["case-sensitive"]) caseSensitive = true;
  if (values["ignore-case"]) caseSensitive = false;

  const execCmd = values.exec ? values.exec.split(" ") : undefined;
  const exclude = values.exclude ? values.exclude.split(",") : undefined;

  return {
    pattern,
    rootPath,
    typeFilter: values.type as EntryTypeFilter | undefined,
    extension: values.extension,
    hidden: values.hidden ?? false,
    maxDepth,
    minDepth,
    absolute: values.absolute ?? false,
    caseSensitive,
    execCmd,
    exclude,
    sizeFilter: values.size,
    changedWithin: values["changed-within"],
    empty: values.empty ?? false,
  };
}

export function printFdHelp(): void {
  console.log(`Usage: fd [options] [pattern] [path]

A simple, fast and user-friendly alternative to find.

Arguments:
  pattern              The search pattern (regex or substring)
  path                 The root directory of the search (default: .)

Options:
  -H, --hidden         Search hidden files and directories
  -t, --type <f|d|l|x> Filter by entry type: file (f), dir (d), symlink (l), exec (x)
  -e, --extension <ext> Filter results by file extension
  -d, --max-depth <n>  Limit directory traversal depth
      --min-depth <n>  Minimum directory traversal depth
  -S, --size <filter>  Filter by file size (e.g. +10M, -1k)
  -E, --exclude <pat>  Exclude files/directories matching comma-separated patterns
      --changed-within Filter files modified within duration (e.g. 10m, 2h, 7d)
      --empty          Filter empty files (0 bytes)
  -a, --absolute       Show absolute paths
  -s, --case-sensitive Case-sensitive search
  -i, --ignore-case    Case-insensitive search
  -x, --exec <cmd>     Execute command for each result ({} is replaced by path)
  -h, --help           Print help information
`);
}

async function main(): Promise<void> {
  const options = parseFdArguments(process.argv.slice(2));
  const output = await runFdCoordinator(options);
  for (const line of output) {
    console.log(line);
  }
}

if (import.meta.main) {
  await main();
}
