#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('tr-cli', '1.0.0')
  .setDescription('Character Translation & Transformation Utility');

app.addFlagString('text', 't', 'hello world', 'Input text');

if (!app.parseCli()) process.exit(0);

app.banner('Character Translation CLI (tr-cli)', 'v1.0.0');
const text = app.getFlagString('text') || app.getPositionalArgs().join(' ') || 'hello world';
app.printKv({
  'Original': text,
  'Uppercase': text.toUpperCase(),
  'Lowercase': text.toLowerCase(),
});
