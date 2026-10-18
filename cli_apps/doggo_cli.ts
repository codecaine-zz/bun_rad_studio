#!/usr/bin/env bun
import { parseDoggoArguments } from "../src/features/doggo/doggoCli.ts";
import { runDoggoCoordinator } from "../src/features/doggo/doggoCoordinator.ts";

async function main(): Promise<void> {
  const options = parseDoggoArguments(process.argv.slice(2));
  const output = await runDoggoCoordinator(options);
  console.log(output);
}

if (import.meta.main) {
  await main();
}
