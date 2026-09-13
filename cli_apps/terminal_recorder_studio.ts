#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('terminal-recorder', '1.0.0')
  .setDescription('Terminal Recording Assistant & VHS Tape Generator');

app.addFlagString('cmd', 'c', 'bun run bin/simplcli.ts calc 0xFF', 'Command to record');
app.addFlagString('theme', 't', 'TokyoNight', 'VHS terminal theme');
app.addFlagString('out', 'o', 'demo.gif', 'Output GIF path');

if (!app.parseCli()) process.exit(0);

app.banner('Terminal Recorder Studio', 'v1.0.0 - VHS Script Generator');

const cmd = app.getFlagString('cmd');
const theme = app.getFlagString('theme');
const out = app.getFlagString('out');

const vhsTape = `Output ${out}
Set FontSize 16
Set Width 1200
Set Height 600
Set Theme "${theme}"
Type "${cmd}"
Enter
Sleep 3s`;

app.panel('Generated VHS Tape Script', vhsTape);
