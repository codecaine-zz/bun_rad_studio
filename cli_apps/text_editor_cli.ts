#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('texteditor-cli', '1.0.0')
  .setDescription('Zero-Dependency Console Text Viewer & Editor');

if (!app.parseCli()) process.exit(0);

app.banner('SimpleCLI Text Editor', 'v1.0.0 - Headless Editor');
app.info('Text editor session ready.');
