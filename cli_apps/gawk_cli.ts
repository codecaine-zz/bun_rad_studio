#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('gawk-cli', '1.0.0')
  .setDescription('Pattern Scanning & Text Processing Engine');

app.addFlagString('pattern', 'p', '', 'Filter regex pattern');
app.addFlagString('file', 'f', '', 'Input text file');

if (!app.parseCli()) process.exit(0);

app.banner('Gawk Text Processing Engine', 'v1.0.0 - Pattern Matcher');
app.info('Text scanning and formatting active.');
