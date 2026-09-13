#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runRipCoordinator } from "./ripCoordinator.ts";
import type { RipOptions } from "./ripTypes.ts";

export function parseRipArguments(args: string[]): RipOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      unbury: { type: "boolean", short: "u", default: false },
      seance: { type: "boolean", short: "s", default: false },
      decompose: { type: "boolean", short: "d", default: false },
      permanent: { type: "boolean", short: "p", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      graveyard: { type: "string", short: "g" },
      info: { type: "string", short: "i" },
      prune: { type: "string" },
      size: { type: "boolean", default: false },
      "dry-run": { type: "boolean", short: "n", default: false },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printRipHelp();
    process.exit(0);
  }

  const unburyTarget = values.unbury ? positionals[0] : undefined;
  const targets = values.unbury ? [] : positionals;
  const pruneDays = values.prune ? parseInt(values.prune, 10) : undefined;

  return {
    targets,
    unbury: values.unbury ?? false,
    unburyTarget,
    seance: values.seance ?? false,
    decompose: values.decompose ?? false,
    permanent: values.permanent ?? false,
    verbose: values.verbose ?? false,
    graveyardDir: values.graveyard,
    infoTarget: values.info,
    pruneDays,
    dryRun: values["dry-run"] ?? false,
    showSize: values.size ?? false,
  };
}

export function printRipHelp(): void {
  console.log(`Usage: rip [options] [targets...]

A safe, fast alternative to rm with graveyard and undo support (rm-improved).

Arguments:
  targets              Files or directories to remove / bury

Options:
  -u, --unbury [item]  Restore the last buried item (or item matching query)
  -s, --seance         Inspect buried files in the graveyard
      --size           Display total storage size used by the graveyard
  -d, --decompose      Permanently purge all files in the graveyard
  -p, --permanent      Permanently remove target files without burying
  -n, --dry-run        Preview files that would be buried without moving them
      --prune <days>   Prune files older than specified days
  -i, --info <id>      Inspect details of a buried record
  -g, --graveyard <dir> Custom graveyard directory
  -v, --verbose        Verbose output
  -h, --help           Print help information
`);
}

async function main(): Promise<void> {
  const options = parseRipArguments(process.argv.slice(2));
  if (
    !options.seance &&
    !options.decompose &&
    !options.unbury &&
    !options.infoTarget &&
    !options.showSize &&
    options.pruneDays === undefined &&
    options.targets.length === 0
  ) {
    printRipHelp();
    process.exit(1);
  }

  try {
    const lines = await runRipCoordinator(options);
    for (const line of lines) {
      console.log(line);
    }
  } catch (error: any) {
    console.error(error.message);
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
