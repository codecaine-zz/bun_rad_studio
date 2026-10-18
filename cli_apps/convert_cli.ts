#!/usr/bin/env bun
/**
 * Data Converter Studio CLI -- Multi-Format Bidirectional Data Transformer
 * Transforms CSV, TSV, JSON, YAML, Base64, and Markdown tables
 */
import { SimpleCLI } from '../src/index.ts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const app = SimpleCLI.newApp('convert-cli', '1.0.0')
  .setDescription('Multi-format Data Transformer (CSV, TSV, JSON, YAML, Base64, Markdown Table)');

app.addFlagString('from', 'f', 'csv', 'Source format: csv, tsv, json, yaml, base64, md');
app.addFlagString('to', 't', 'json', 'Target format: json, csv, tsv, yaml, base64, md');
app.addFlagString('input', 'i', '', 'Input file path');
app.addFlagString('data', 'd', '', 'Raw data string input');
app.addFlagBool('stdin', 's', false, 'Read input data from piped stdin');
app.addFlagString('out', 'o', '', 'Output file path');

if (!app.parseCli()) process.exit(0);

const fromFmt = app.getFlagString('from').toLowerCase();
const toFmt = app.getFlagString('to').toLowerCase();
const inPath = app.getFlagString('input') || app.getPositionalArgs()[0];
const outPath = app.getFlagString('out');

async function getInputData(): Promise<string> {
  const rawData = app.getFlagString('data');
  if (rawData) return rawData;

  if (inPath && existsSync(resolve(process.cwd(), inPath))) {
    return readFileSync(resolve(process.cwd(), inPath), 'utf8');
  }
  if (app.getFlagBool('stdin')) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  // Sample CSV
  return `id,name,role,active\n1,Sarah Jenkins,Engineering Lead,true\n2,David Miller,DevOps Architect,true\n3,Emma Watson,Security Analyst,false`;
}

function parseInput(raw: string, fmt: string): { headers: string[]; rows: any[] } {
  if (fmt === 'json') {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const headers = arr.length > 0 ? Object.keys(arr[0]) : [];
    return { headers, rows: arr };
  }

  if (fmt === 'base64') {
    const decoded = Buffer.from(raw.trim(), 'base64').toString('utf8');
    try {
      return parseInput(decoded, 'json');
    } catch {
      return parseInput(decoded, 'csv');
    }
  }

  // CSV / TSV parsing
  const delim = fmt === 'tsv' ? '\t' : ',';
  const lines = raw.trim().split('\n').filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = (lines[0] ?? '').split(delim).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(l => {
    const vals = l.split(delim).map(v => {
      const clean = v.trim().replace(/^"|"$/g, '');
      if (clean === 'true') return true;
      if (clean === 'false') return false;
      if (!isNaN(Number(clean)) && clean !== '') return Number(clean);
      return clean;
    });
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? null; });
    return obj;
  });

  return { headers, rows };
}

function formatOutput(data: { headers: string[]; rows: any[] }, fmt: string): string {
  const { headers, rows } = data;

  if (fmt === 'json') {
    return JSON.stringify(rows, null, 2);
  }

  if (fmt === 'yaml') {
    return rows.map(r => {
      const entries = Object.entries(r).map(([k, v]) => `  ${k}: ${typeof v === 'string' ? `"${v}"` : v}`).join('\n');
      return `- \n${entries}`;
    }).join('\n');
  }

  if (fmt === 'md' || fmt === 'markdown') {
    const headerRow = `| ${headers.join(' | ')} |`;
    const dividerRow = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRows = rows.map(r => `| ${headers.map(h => String(r[h] ?? '')).join(' | ')} |`).join('\n');
    return `${headerRow}\n${dividerRow}\n${dataRows}`;
  }

  if (fmt === 'base64') {
    return Buffer.from(JSON.stringify(rows)).toString('base64');
  }

  const delim = fmt === 'tsv' ? '\t' : ',';
  const headerLine = headers.join(delim);
  const rowLines = rows.map(r => headers.map(h => {
    const val = String(r[h] ?? '');
    return val.includes(delim) || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
  }).join(delim));
  return [headerLine, ...rowLines].join('\n');
}

async function main() {
  const raw = await getInputData();
  try {
    const parsed = parseInput(raw, fromFmt);
    const formatted = formatOutput(parsed, toFmt);

    if (outPath) {
      writeFileSync(resolve(process.cwd(), outPath), formatted, 'utf8');
      app.success(`Converted ${fromFmt.toUpperCase()} to ${toFmt.toUpperCase()} -> ${outPath}`);
    } else {
      console.log(formatted);
    }
  } catch (err: any) {
    app.error(`Conversion failed: ${err.message}`);
    process.exit(1);
  }
}

main();
