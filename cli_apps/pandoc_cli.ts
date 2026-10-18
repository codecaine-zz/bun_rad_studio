#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('pandoc-cli', '1.0.0')
  .setDescription('Universal Document & Markup Converter');

if (!app.parseCli()) process.exit(0);

app.banner('Pandoc Document Studio', 'v1.0.0 - Markup Converter');
app.info('Document processor initialized.');
