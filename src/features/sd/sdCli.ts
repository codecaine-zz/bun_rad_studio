#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runSdCoordinator } from "./sdCoordinator.ts";
import type { SdOptions } from "./sdTypes.ts";

export function parseSdArguments(args: string[]): SdOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      "string-mode": { type: "boolean", short: "s", default: false },
      flags: { type: "string", short: "f", default: "g" },
      preview: { type: "boolean", short: "p", default: false },
      count: { type: "boolean", short: "c", default: false },
      "ignore-case": { type: "boolean", short: "i", default: false },
      word: { type: "boolean", short: "w", default: false },
      backup: { type: "string", short: "b" },
      quiet: { type: "boolean", short: "q", default: false },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help || (values.count ? positionals.length < 1 : positionals.length < 2)) {
    printSdHelp();
    process.exit(values.help ? 0 : 1);
  }

  let findPattern: string;
  let replacePattern: string = "";
  let files: string[] = [];

  if (values.count) {
    findPattern = positionals[0]!;
    files = positionals.slice(1);
  } else {
    findPattern = positionals[0]!;
    replacePattern = positionals[1]!;
    files = positionals.slice(2);
  }

  return {
    findPattern,
    replacePattern,
    files,
    stringMode: values["string-mode"] ?? false,
    flags: values.flags ?? "g",
    preview: values.preview ?? false,
    countOnly: values.count ?? false,
    ignoreCase: values["ignore-case"] ?? false,
    wholeWord: values.word ?? false,
    backupExt: values.backup,
    quiet: values.quiet ?? false,
  };
}

export function printSdHelp(): void {
  console.log(`Usage: sd [options] <find> <replace> [files...]
       sd -c [options] <find> [files...]

An intuitive find & replace CLI (sed alternative).

Arguments:
  <find>               Regular expression or literal string to search for
  <replace>            Replacement string (supports $1, $2 for regex captures)
  [files...]           Files to modify in place (reads from stdin if omitted)

Options:
  -s, --string-mode    Treat find pattern as literal string instead of regex
  -f, --flags <flags>  Regex flags (default: "g")
  -w, --word           Match whole words only
  -p, --preview        Preview replacement diffs without modifying files
  -c, --count          Count occurrences without modifying files
  -i, --ignore-case    Case-insensitive matching
  -b, --backup <ext>   Create backup file before writing (e.g. ".bak")
  -q, --quiet          Quiet mode; suppress line diffs
  -h, --help           Print help information
`);
}

async function main(): Promise<void> {
  const options = parseSdArguments(process.argv.slice(2));
  const output = await runSdCoordinator(options);
  for (const line of output) {
    console.log(line);
  }
}

if (import.meta.main) {
  await main();
}
