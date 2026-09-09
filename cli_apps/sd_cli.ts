#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('sd-cli', '1.0.0')
  .setDescription('Search & Replace Text Utility with Line Diffs');

app.addFlagString('find', 'f', 'staging', 'Find substring or regex');
app.addFlagString('replace', 'r', 'production', 'Replacement string');

if (!app.parseCli()) process.exit(0);

app.banner('Search & Replace Studio (sd-cli)', 'v1.0.0');

const oldText = 'env: staging\nport: 8080\ndebug: true';
const newText = oldText.replace(new RegExp(app.getFlagString('find'), 'g'), app.getFlagString('replace'));

app.step(1, 'Colorized Transformation Diff');
app.diff(oldText, newText);
