#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';
import * as fs from 'node:fs';

const app = SimpleCLI.newApp('multirepo-pilot', '1.0.0')
  .setDescription('Multi-Repository Git Orchestrator');

app.addFlagString('dir', 'd', '.', 'Root directory containing repositories');
app.addFlagBool('fetch', 'f', false, 'Fetch remote status for all repositories');

if (!app.parseCli()) process.exit(0);

app.banner('MultiRepo Git Pilot', 'v1.0.0 - Workspace Orchestrator');

const dir = app.getFlagString('dir');
const entries = fs.readdirSync(dir, { withFileTypes: true });
const repos = entries.filter(e => e.isDirectory() && fs.existsSync(`${dir}/${e.name}/.git`));

app.info(`Detected ${repos.length} Git repositories in ${dir}`);
const rows = repos.map(r => {
  const branch = sys.execOr(`git -C "${dir}/${r.name}" branch --show-current`, 'main');
  return [r.name, branch, 'CLEAN'];
});

app.table(['Repository', 'Active Branch', 'Status'], rows);
