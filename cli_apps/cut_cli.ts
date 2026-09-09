#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';
import * as fs from 'node:fs';

const app = SimpleCLI.newApp('cut-cli', '1.0.0')
  .setDescription('Stream & File Column/Field Cutting Utility');

app.addFlagString('delimiter', 'd', '	', 'Field delimiter character (default: Tab)');
app.addFlagString('fields', 'f', '1', 'Comma-separated field indices (1-indexed, e.g. "1,3")');
app.addFlagString('file', 'i', '', 'Input file path');

if (!app.parseCli()) process.exit(0);

const delim = app.getFlagString('delimiter') || '	';
const fieldIndices = app.getFlagString('fields').split(',').map(s => parseInt(s.trim(), 10) - 1);
const filePath = app.getFlagString('file') || app.getPositionalArgs()[0];

let input = '';
if (filePath && fs.existsSync(filePath)) {
  input = fs.readFileSync(filePath, 'utf8');
} else {
  input = `Alice\t28\tEngineer
Bob\t34\tDesigner
Charlie\t22\tDevOps`;
}

const lines = input.trim().split('\n');
const rows: string[][] = [];

for (const line of lines) {
  const parts = line.split(delim);
  const selected = fieldIndices.map(idx => parts[idx] ?? '');
  rows.push(selected);
}

app.banner('Cut CLI Column Extractor', `Delimiter: ${JSON.stringify(delim)} | Fields: ${app.getFlagString('fields')}`);
app.table(fieldIndices.map(i => `Field ${i + 1}`), rows);
