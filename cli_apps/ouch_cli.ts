#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('ouch-cli', '1.0.0')
  .setDescription('Universal Archive Compressor & Decompressor (zip, tar, gz)');

app.addFlagString('compress', 'c', '', 'Create compressed archive');
app.addFlagString('extract', 'x', '', 'Extract compressed archive');

if (!app.parseCli()) process.exit(0);

app.banner('Universal Archive Manager (ouch-cli)', 'v1.0.0');
app.info('Archive utility ready.');
