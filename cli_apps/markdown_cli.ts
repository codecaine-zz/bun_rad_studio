#!/usr/bin/env bun
/**
 * Markdown Studio Pro CLI -- Document Statistics & Standalone HTML Generator
 */
import { SimpleCLI } from '../src/index.ts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const app = SimpleCLI.newApp('markdown-cli', '1.0.0')
  .setDescription('Markdown Document Statistics, Reading Time & Standalone HTML Report Generator');

app.addFlagString('file', 'f', '', 'Path to Markdown file (.md)');
app.addFlagString('export-html', 'e', '', 'Export path for standalone styled HTML report');
app.addFlagBool('stats', 's', false, 'Calculate word count, characters and reading time');
app.addFlagBool('stdout', 'p', false, 'Output converted HTML directly to stdout');

if (!app.parseCli()) process.exit(0);

const inPath = app.getFlagString('file') || app.getPositionalArgs()[0];
if (!inPath || !existsSync(resolve(process.cwd(), inPath))) {
  app.error(`Markdown file not found: ${inPath || '(none specified)'}`);
  process.exit(1);
}

const fullPath = resolve(process.cwd(), inPath);
const content = readFileSync(fullPath, 'utf8');

function computeStats(md: string) {
  const words = (md.match(/\b\w+\b/g) || []).length;
  const chars = md.length;
  const lines = md.split('\n').length;
  const readMinutes = Math.max(1, Math.round(words / 200));
  return { words, chars, lines, readMinutes };
}

function convertMarkdownToHtml(md: string): string {
  let html = md
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    .replace(/\n\n/gim, '</p><p>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Document</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 860px; margin: 40px auto; padding: 0 20px; color: #1e293b; background: #f8fafc; }
    h1, h2, h3 { color: #0f172a; margin-top: 1.5em; }
    h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 0.3em; }
    code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: monospace; }
    pre { background: #0f172a; color: #f8fafc; padding: 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <p>${html}</p>
</body>
</html>`;
}

async function main() {
  const stats = computeStats(content);
  const exportPath = app.getFlagString('export-html');
  const printStdout = app.getFlagBool('stdout');

  if (printStdout) {
    console.log(convertMarkdownToHtml(content));
    return;
  }

  app.banner('Markdown Studio Pro CLI', `Document: ${inPath}`);
  app.printKv({
    'File Path': fullPath,
    'Lines': `${stats.lines} lines`,
    'Words': `${stats.words} words`,
    'Characters': `${stats.chars} characters`,
    'Reading Time': `~${stats.readMinutes} min read (at 200 wpm)`,
  });

  if (exportPath) {
    const fullExport = resolve(process.cwd(), exportPath);
    writeFileSync(fullExport, convertMarkdownToHtml(content), 'utf8');
    app.success(`Exported standalone HTML report to: ${fullExport}`);
  }
}

main();
