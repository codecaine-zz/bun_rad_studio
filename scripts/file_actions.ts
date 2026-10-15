#!/usr/bin/env bun
/**
 * The File Manager's saved actions from a terminal: the same definitions, checks and queue as the Actions tool.
 *
 *   bun run files:actions list
 *   bun run files:actions check <action> <file>... [--set name=value]...
 *   bun run files:actions run   <action> <file>... [--set name=value]...
 *
 * <action> is an id or a name (as `list` shows them). Your original files are never changed. Exit code: 0 done, 1 problem.
 */
import { resolve } from "path";
import { createContext } from "../src/features/filemanager/fmCore";
import { actionOperations, whenRunDone, type ActionDef } from "../src/features/filemanager/fmActions";

const [command, name, ...rest] = process.argv.slice(2);
const files: string[] = [];
const params: Record<string, string | number> = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--set" && rest[i + 1]) {
    const [k, ...v] = rest[++i]!.split("=");
    const value = v.join("=");
    params[k!] = value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value;
  } else files.push(resolve(rest[i]!));
}

const ctx = createContext();
const op = (n: string, body: Record<string, unknown> = {}) => actionOperations[n]!(ctx, body) as Promise<any>;

function usage(): never {
  console.error("Usage: files:actions list | check <action> <file>... [--set name=value] | run <action> <file>... [--set name=value]");
  process.exit(1);
}

try {
  if (command === "list") {
    for (const a of (await op("actions/list")).actions as ActionDef[]) {
      console.log(`${a.id}\t${a.name}${a.source === "builtin" ? "" : ` (${a.source})`}\n    ${a.steps.map((s, i) => `${i + 1}. ${s.label}`).join("  ")}\n    results: ${a.output.folder}`);
    }
  } else if (command === "check" || command === "run") {
    if (!name) usage();
    const all = (await op("actions/list")).actions as ActionDef[];
    const action = all.find((a) => a.id === name || a.name.toLowerCase() === name!.toLowerCase());
    if (!action) throw new Error(`No action called "${name}". Run "list" to see them.`);
    const { check } = await op("actions/preflight", { action: action.id, inputs: files, params });
    for (const s of check.steps) console.log(`${s.available ? "✓" : "✗"} ${s.label} — ${s.note}`);
    for (const p of check.problems) console.log(`${p.level === "block" ? "⛔" : "⚠"} ${p.message}`);
    for (const r of check.rejected) console.log(`  left out: ${r.path}: ${r.reason}`);
    if (!check.ok) process.exit(1);
    if (command === "check") {
      console.log(`Ready: ${check.accepted.length} file(s) -> ${check.outputFolder}. Originals are never changed.`);
    } else {
      const { run } = await op("actions/run", { action: action.id, inputs: files, params });
      const done = await whenRunDone(ctx, run.id);
      for (const s of done.steps) console.log(`${s.state === "done" ? "✓" : "✗"} ${s.label}${s.message ? ` — ${s.message}` : ""}`);
      console.log(done.message);
      process.exit(done.state === "done" ? 0 : 1);
    }
  } else usage();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
process.exit(0);
