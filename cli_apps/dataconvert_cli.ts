#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';
import * as fs from 'node:fs';

const app = SimpleCLI.newApp('dataconvert-cli', '1.0.0')
  .setDescription('Tabular Data Converter (CSV, JSON, Markdown, TSV)');

app.addFlagString('input', 'i', '', 'Input file path');
app.addFlagString('from', 'f', 'csv', 'Source format (csv, json, tsv)');
app.addFlagString('to', 't', 'json', 'Target format (csv, json, markdown, tsv)');
app.addFlagString('out', 'o', '', 'Output destination file path');

if (!app.parseCli()) process.exit(0);

app.banner('Data Convert Studio', 'v1.0.0 - Universal Tabular Data Converter');

const inPath = app.getFlagString('input') || app.getPositionalArgs()[0];
let rawData = '';

if (inPath && fs.existsSync(inPath)) {
  rawData = fs.readFileSync(inPath, 'utf8');
} else {
  rawData = 'id,name,role,salary\n1,Alice,Tech Lead,150000\n2,Bob,Frontend Engineer,120000\n3,Charlie,DevOps Architect,140000';
  app.info('No input file provided. Using sample CSV dataset.');
}

const fromFmt = app.getFlagString('from').toLowerCase();
const toFmt = app.getFlagString('to').toLowerCase();

let headers: string[] = [];
let rows: string[][] = [];

if (fromFmt === 'json') {
  const parsed = JSON.parse(rawData);
  if (Array.isArray(parsed) && parsed.length > 0) {
    headers = Object.keys(parsed[0]);
    rows = parsed.map(obj => headers.map(h => String(obj[h] ?? '')));
  }
} else {
  const delim = fromFmt === 'tsv' ? '	' : ',';
  const tableData = stdlib.csvParse(rawData, delim);
  if (tableData.length > 0) {
    headers = tableData[0] || [];
    rows = tableData.slice(1);
  }
}

app.info(`Parsed ${rows.length} rows with columns: [${headers.join(', ')}]`);

let output = '';
if (toFmt === 'json') {
  output = app.tableToJson(headers, rows);
} else if (toFmt === 'markdown') {
  output = app.tableToMarkdown(headers, rows);
} else if (toFmt === 'tsv') {
  output = [headers.join('	'), ...rows.map(r => r.join('	'))].join('\n');
} else {
  output = app.tableToCsv(headers, rows);
}

const outPath = app.getFlagString('out');
if (outPath) {
  fs.writeFileSync(outPath, output, 'utf8');
  app.success(`Saved converted data to: ${outPath}`);
} else {
  app.panel(`Converted Output (${toFmt.toUpperCase()})`, output);
}
