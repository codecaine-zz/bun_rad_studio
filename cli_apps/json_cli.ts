#!/usr/bin/env bun
/**
 * JSON Query Studio Pro CLI
 * High-performance JSON processor powered natively by Bun JavaScript/V8 engine
 * Zero Homebrew or external jq binary required
 */
import { SimpleCLI } from '../src/index.ts';
import { evaluateBunJsonQuery } from '../applications/jq_studio.ts';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const app = SimpleCLI.newApp('json-cli', '1.0.0')
  .setDescription('Native JSON Query, Filter, Formatting & Extraction CLI');

app.addFlagString('file', 'f', '', 'Path to JSON file (or pass raw JSON via pipe/stdin)');
app.addFlagString('query', 'q', '.', 'JSON selector or query expression (e.g. .users[].name, keys, length)');
app.addFlagBool('format', 'p', false, 'Pretty-print formatted JSON (2 spaces indentation)');
app.addFlagBool('minify', 'm', false, 'Minify JSON output into a single compact line');
app.addFlagString('data', 'd', '', 'Raw JSON string input');
app.addFlagBool('stdin', 's', false, 'Read JSON input from piped stdin');
app.addFlagBool('keys', 'k', false, 'Shortcut to extract top-level object keys');
app.addFlagBool('count', 'c', false, 'Shortcut to count array elements or object keys');

if (!app.parseCli()) process.exit(0);

async function readInput(): Promise<string> {
  const rawData = app.getFlagString('data');
  if (rawData) return rawData;

  const filePath = app.getFlagString('file') || app.getPositionalArgs()[0];
  if (filePath && existsSync(resolve(process.cwd(), filePath))) {
    return readFileSync(resolve(process.cwd(), filePath), 'utf8');
  }

  if (app.getFlagBool('stdin')) {
    const stdinChunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      stdinChunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(stdinChunks).toString('utf8');
  }

  // Default sample
  return JSON.stringify({
    status: 'success',
    timestamp: new Date().toISOString(),
    users: [
      { id: 1, name: 'Alice Smith', role: 'admin', active: true },
      { id: 2, name: 'Bob Jones', role: 'developer', active: true },
      { id: 3, name: 'Charlie Brown', role: 'designer', active: false }
    ],
    meta: { page: 1, total: 3 }
  }, null, 2);
}

async function main() {
  const rawInput = await readInput();
  if (!rawInput.trim()) {
    app.error('No JSON input provided.');
    process.exit(1);
  }

  let filter = app.getFlagString('query');
  if (app.getFlagBool('keys')) filter = 'keys';
  if (app.getFlagBool('count')) filter = 'length';

  const isFormat = app.getFlagBool('format');
  const isMinify = app.getFlagBool('minify');

  let parsedInput: any;
  try {
    parsedInput = JSON.parse(rawInput);
  } catch (err: any) {
    app.error(`Invalid JSON syntax: ${err.message}`);
    process.exit(1);
  }

  const start = performance.now();
  let queryResult: any;
  try {
    queryResult = evaluateBunJsonQuery(parsedInput, filter);
  } catch (err: any) {
    app.error(`Query evaluation error: ${err.message}`);
    process.exit(1);
  }
  const elapsed = (performance.now() - start).toFixed(3);

  if (process.stdout.isTTY && !isMinify) {
    app.banner('JSON Query Studio CLI', `v1.0.0 - Evaluated in ${elapsed}ms`);
  }

  if (typeof queryResult === 'string' && !isFormat && !isMinify) {
    console.log(queryResult);
  } else if (isMinify) {
    console.log(JSON.stringify(queryResult));
  } else {
    console.log(JSON.stringify(queryResult, null, 2));
  }
}

main();
