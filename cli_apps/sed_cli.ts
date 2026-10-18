#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('sed-cli', '1.0.0')
  .setDescription('Stream Editor & Line Transformation Utility');

if (!app.parseCli()) process.exit(0);

app.banner('Stream Editor CLI (sed-cli)', 'v1.0.0');
app.info('Stream transformations active.');
