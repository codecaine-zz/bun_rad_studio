#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runProcsCoordinator } from "./procsCoordinator.ts";
import { runProcsTui } from "./procsTui.ts";
import type { ProcsOptions, SortField } from "./procsTypes.ts";

export function parseProcsArguments(args: string[]): ProcsOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      tree: { type: "boolean", short: "t", default: false },
      "sort-cpu": { type: "boolean", default: false },
      "sort-mem": { type: "boolean", default: false },
      "sort-pid": { type: "boolean", default: false },
      user: { type: "string", short: "u" },
      ports: { type: "boolean", short: "P", default: false },
      limit: { type: "string", short: "n" },
      json: { type: "boolean", short: "j", default: false },
      kill: { type: "string", short: "k" },
      signal: { type: "string", default: "SIGTERM" },
      watch: { type: "boolean", short: "w", default: false },
      interactive: { type: "boolean", short: "i", default: false },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printProcsHelp();
    process.exit(0);
  }

  let sortBy: SortField | undefined = undefined;
  if (values["sort-cpu"]) sortBy = "cpu";
  else if (values["sort-mem"]) sortBy = "mem";
  else if (values["sort-pid"]) sortBy = "pid";

  const limit = values.limit ? parseInt(values.limit, 10) : undefined;
  const killPid = values.kill ? parseInt(values.kill, 10) : undefined;

  return {
    keyword: positionals[0],
    user: values.user,
    ports: values.ports ?? false,
    tree: values.tree ?? false,
    sortBy,
    watch: values.watch ?? false,
    limit,
    json: values.json ?? false,
    killPid,
    signal: values.signal,
    interactive: values.interactive ?? false,
  };
}

export function printProcsHelp(): void {
  console.log(`Usage: procs [options] [keyword]

A modern replacement for ps.

Arguments:
  [keyword]            Filter processes by PID, user, or command

Options:
  -u, --user <user>    Filter processes by owner username
  -P, --ports          Display listening network ports for each process
  -i, --interactive    Interactive process monitor TUI with live navigation & kill
  -n, --limit <n>      Limit process output to top N rows
  -j, --json           Output processes in structured JSON format
  -k, --kill <PID>     Send signal to terminate specified PID
  --signal <SIG>       Signal to send with --kill (default: SIGTERM)
  -t, --tree           Display processes in a hierarchical tree
  --sort-cpu           Sort processes by CPU usage descending
  --sort-mem           Sort processes by memory usage descending
  --sort-pid           Sort processes by PID ascending
  -w, --watch          Watch mode (refresh display every second)
  -h, --help           Print help information
`);
}

async function renderOnce(options: ProcsOptions): Promise<void> {
  const output = await runProcsCoordinator(options);
  if (options.watch) {
    console.clear();
  }
  console.log(output);
}

async function main(): Promise<void> {
  const options = parseProcsArguments(process.argv.slice(2));

  if ((options.interactive || (options.watch && process.stdin.isTTY)) && !options.json && !options.killPid) {
    await runProcsTui(options.sortBy || "cpu", options.keyword);
    return;
  }

  await renderOnce(options);

  if (options.watch) {
    setInterval(async () => {
      await renderOnce(options);
    }, 1000);
  }
}

if (import.meta.main) {
  await main();
}
