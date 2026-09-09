#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('launchd-cli', '1.0.0')
  .setDescription('macOS launchd Service Manager & Supervisor');

app.addFlagBool('list', 'l', false, 'List running user daemons and agents');

if (!app.parseCli()) process.exit(0);

app.banner('macOS Launchd Supervisor', 'v1.0.0 - Daemon Controller');

const [out] = sys.exec('launchctl list');
const rows = (out || '').split('\n').slice(1, 20).map(l => l.split(/\s+/).slice(0, 3));
app.table(['PID', 'Status', 'Label'], rows);
