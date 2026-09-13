#!/usr/bin/env bun
import { parseProcsArguments } from "../src/features/procs/procsCli.ts";
import { runProcsCoordinator } from "../src/features/procs/procsCoordinator.ts";
import { runProcsTui } from "../src/features/procs/procsTui.ts";

async function main(): Promise<void> {
  const options = parseProcsArguments(process.argv.slice(2));

  if ((options.interactive || (options.watch && process.stdin.isTTY)) && !options.json && !options.killPid) {
    await runProcsTui(options.sortBy || "cpu", options.keyword);
    return;
  }

  const output = await runProcsCoordinator(options);
  console.log(output);

  if (options.watch) {
    setInterval(async () => {
      console.clear();
      const updated = await runProcsCoordinator(options);
      console.log(updated);
    }, 1000);
  }
}

if (import.meta.main) {
  await main();
}
