#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';
import * as fs from 'node:fs';

const app = SimpleCLI.newApp('rg-cli', '1.0.0')
  .setDescription('Fast Recursive Code & Text Search (Ripgrep Style)');

app.addFlagString('query', 'q', '', 'Search query string');
app.addFlagString('dir', 'd', '.', 'Directory root to search');

if (!app.parseCli()) process.exit(0);

app.banner('Ripgrep Search Studio (rg-cli)', 'v1.0.0');

const q = app.getFlagString('query') || app.getPositionalArgs()[0];
const dir = app.getFlagString('dir');

if (!q) {
  app.warn('Please specify search query with -q <pattern>');
  process.exit(0);
}

const files = sys.findFiles(dir);
const re = new RegExp(q, 'i');
let matchCount = 0;

for (const file of files) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, idx) => {
      if (re.test(line)) {
        matchCount++;
        console.log(`${app.magenta(file)}:${app.green((idx + 1).toString())}: ${line.trim()}`);
      }
    });
  } catch {}
}
app.success(`Found ${matchCount} matching lines across workspace.`);
