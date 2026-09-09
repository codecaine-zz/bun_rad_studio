#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('regex-cli', '1.0.0')
  .setDescription('Regular Expression Tester & Capture Group Visualizer');

app.addFlagString('pattern', 'p', '([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})', 'RegEx pattern');
app.addFlagString('text', 't', 'Contact support@domain.com or admin@internal.io', 'Input text to match');

if (!app.parseCli()) process.exit(0);

app.banner('RegEx Workbench CLI', 'v1.0.0 - Expression Tester');

const pat = app.getFlagString('pattern');
const text = app.getFlagString('text');

try {
  const re = new RegExp(pat, 'g');
  const matches = [...text.matchAll(re)];
  app.info(`Found ${matches.length} matches for /${pat}/g:`);
  const rows = matches.map(m => [m[0], m.slice(1).join(', ')]);
  app.table(['Full Match', 'Captured Groups'], rows);
} catch (err: any) {
  app.error(`Invalid RegEx: ${err.message}`);
}
