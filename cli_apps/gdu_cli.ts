#!/usr/bin/env bun
import { parseGduArguments } from "../src/features/gdu/gduCli.ts";
import { analyzeDirectory, runGduCoordinator } from "../src/features/gdu/gduCoordinator.ts";
import { runGduTui } from "../src/features/gdu/gduTui.ts";

async function main(): Promise<void> {
  const options = parseGduArguments(process.argv.slice(2));
  if (!options.nonInteractive && process.stdin.isTTY && !options.json && !options.showDisks) {
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
