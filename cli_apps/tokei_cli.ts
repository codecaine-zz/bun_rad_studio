#!/usr/bin/env bun
import { parseTokeiArguments } from "../src/features/tokei/tokeiCli.ts";
import { runTokeiCoordinator } from "../src/features/tokei/tokeiCoordinator.ts";

async function main(): Promise<void> {
  const options = parseTokeiArguments(process.argv.slice(2));
  const output = await runTokeiCoordinator(options);
  console.log(output);
}

if (import.meta.main) {
  await main();
}
