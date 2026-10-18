#!/usr/bin/env bun
import { parseWatchexecArguments } from "../src/features/watchexec/watchexecCli.ts";
import { runWatchexecCoordinator } from "../src/features/watchexec/watchexecCoordinator.ts";

async function main(): Promise<void> {
  const options = parseWatchexecArguments(process.argv.slice(2));
  await runWatchexecCoordinator(options);
}

if (import.meta.main) {
  await main();
}
