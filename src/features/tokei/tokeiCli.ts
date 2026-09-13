#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runTokeiCoordinator } from "./tokeiCoordinator.ts";
import type { TokeiOptions, TokeiSortField } from "./tokeiTypes.ts";

export function parseTokeiArguments(args: string[]): TokeiOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      sort: { type: "string", short: "s", default: "code" },
      files: { type: "boolean", default: false },
      hidden: { type: "boolean", short: "H", default: false },
      json: { type: "boolean", short: "j", default: false },
      markdown: { type: "boolean", short: "m", default: false },
      exclude: { type: "string", short: "e" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printTokeiHelp();
    process.exit(0);
  }

  const paths = positionals.length > 0 ? positionals : ["."];
  const validSorts: TokeiSortField[] = ["files", "lines", "blank", "comment", "code"];
  const sort = validSorts.includes(values.sort as TokeiSortField)
    ? (values.sort as TokeiSortField)
    : "code";

  const excludes = values.exclude ? values.exclude.split(",").map((s) => s.trim()) : undefined;

  return {
    paths,
    sort,
    showFiles: values.files ?? false,
    hidden: values.hidden ?? false,
    json: values.json ?? false,
    markdown: values.markdown ?? false,
    excludes,
  };
}

export function printTokeiHelp(): void {
  console.log(`Usage: tokei [options] [paths...]

Count lines of code fast.

Arguments:
  [paths...]           Paths to scan (default: ".")

Options:
  -s, --sort <column>  Sort table by: files, lines, blank, comment, code (default: "code")
  --files              Show individual file breakdowns
  -H, --hidden         Count hidden files
  -j, --json           Output stats in JSON format
  -m, --markdown       Output stats as a Markdown table
  -e, --exclude <pat>  Exclude file patterns (comma-separated)
  -h, --help           Print help information
`);
}

async function main(): Promise<void> {
  const options = parseTokeiArguments(process.argv.slice(2));
  const output = await runTokeiCoordinator(options);
  console.log(output);
}

if (import.meta.main) {
  await main();
}
