#!/usr/bin/env bun
/**
 * Command-line interface for `sd`, parsing search/replace patterns, flags, and target
 * file arguments to perform in-place replacements or diff previews.
 */
import { parseArgs } from "node:util";
import { runSdCoordinator } from "./sdCoordinator.ts";
import type { SdOptions } from "./sdTypes.ts";

/**
 * Parses command-line arguments into an `SdOptions` object, validating required positional patterns.
 */
export function parseSdArguments(args: string[]): SdOptions {
  let values: Record<string, any>;
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args,
      options: {
        "string-mode": { type: "boolean", short: "s", default: false },
        "fixed-strings": { type: "boolean", short: "F", default: false },
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
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (
    values.help ||
    (values.count ? positionals.length < 1 : positionals.length < 2)
  ) {
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
    stringMode: Boolean(values["string-mode"] || values["fixed-strings"]),
    flags: values.flags ?? "g",
    preview: values.preview ?? false,
    countOnly: values.count ?? false,
    ignoreCase: values["ignore-case"] ?? false,
    wholeWord: values.word ?? false,
    backupExt: values.backup,
    quiet: values.quiet ?? false,
  };
}

/**
 * Prints usage instructions and CLI options for `sd` to stdout.
 */
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
