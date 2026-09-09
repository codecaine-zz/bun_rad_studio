#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';
import * as fs from 'node:fs';

const app = SimpleCLI.newApp('jq-cli', '1.0.0')
  .setDescription('JSON Query, Filter, and Syntax Highlighter');

app.addFlagString('query', 'q', '.', 'Object key path selector');
app.addFlagString('file', 'f', '', 'Input JSON file path');

if (!app.parseCli()) process.exit(0);

const file = app.getFlagString('file') || app.getPositionalArgs()[0];
let jsonText = '';

if (file && fs.existsSync(file)) {
  jsonText = fs.readFileSync(file, 'utf8');
} else {
  jsonText = JSON.stringify({
    service: 'auth-gateway',
    status: 'healthy',
    version: '2.4.1',
    nodes: [{ id: 1, host: '10.0.0.1' }, { id: 2, host: '10.0.0.2' }],
    metrics: { requests_per_sec: 1420, error_rate: 0.001 },
  }, null, 2);
}

app.banner('JSON Query & Highlighter (jq-cli)', 'v1.0.0');
app.println(app.jsonHighlight(jsonText));
