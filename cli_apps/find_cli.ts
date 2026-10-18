#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('find-cli', '1.0.0')
  .setDescription('UNIX-like File Hierarchy Search Utility');

app.addFlagString('name', 'n', '*', 'File name pattern');
app.addFlagString('dir', 'd', '.', 'Directory root');

if (!app.parseCli()) process.exit(0);

const name = app.getFlagString('name') || app.getPositionalArgs()[0] || '*';
const dir = app.getFlagString('dir');

const files = sys.findFiles(dir, name === '*' ? undefined : name);
app.banner('Find CLI File Inspector', `Search in ${dir} matching "${name}"`);
files.slice(0, 30).forEach(f => console.log(app.cyan(f)));
