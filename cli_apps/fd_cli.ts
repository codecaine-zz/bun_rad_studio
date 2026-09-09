#!/usr/bin/env bun
import { SimpleCLI, sys, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('fd-cli', '1.0.0')
  .setDescription('Fast Filesystem Search & Directory Traversal Tool');

app.addFlagString('pattern', 'p', '', 'Search pattern or file name substring');
app.addFlagString('dir', 'd', '.', 'Root directory to start search');

if (!app.parseCli()) process.exit(0);

app.banner('Fast File Finder (fd-cli)', 'v1.0.0 - High-Speed Traversal');

const pattern = app.getFlagString('pattern') || app.getPositionalArgs()[0] || '';
const rootDir = app.getFlagString('dir');

app.resetTimer();
const matches = sys.findFiles(rootDir, pattern ? new RegExp(pattern, 'i') : undefined);
const elapsed = app.elapsedMs();

app.success(`Found ${matches.length} matching files in ${elapsed} ms:`);
const rows = matches.slice(0, 25).map(m => {
  const meta = sys.fileMetadata(m);
  return [meta?.name || m, stdlib.humanSize(meta?.sizeBytes || 0), m];
});

app.table(['File Name', 'Size', 'Full Path'], rows);
if (matches.length > 25) {
  app.println(app.dim(`  ... and ${matches.length - 25} more files`));
}
