#!/usr/bin/env bun
/**
 * Regex Studio Pro CLI -- Regular Expression Tester & Code Generator
 */
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('regex-cli', '1.0.0')
  .setDescription('Regular Expression Pattern Tester, Substitution Engine & Code Generator');

app.addFlagString('pattern', 'p', '([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})', 'RegEx pattern');
app.addFlagString('flags', 'F', 'g', 'RegEx flags (g, i, m, s, u)');
app.addFlagString('text', 't', 'Contact support@company.com or security@dev.internal.net for access.', 'Input text to match');
app.addFlagString('replace', 'r', '', 'Replacement template (supports $1, $2, etc.)');
app.addFlagBool('code-ts', 'c', false, 'Generate production-ready TypeScript code snippet');
app.addFlagBool('json', 'j', false, 'Output matches in structured JSON format');

if (!app.parseCli()) process.exit(0);

const pat = app.getFlagString('pattern');
const flags = app.getFlagString('flags');
const text = app.getFlagString('text');
const replaceStr = app.getFlagString('replace');
const isTs = app.getFlagBool('code-ts');
const isJson = app.getFlagBool('json');

if (!isJson && !isTs) {
  app.banner('Regex Studio Pro CLI', 'v1.0.0 - Expression Evaluator');
}

if (isTs) {
  console.log(`// Auto-Generated TypeScript Regex Snippet
const pattern = /${pat}/${flags};
const text = ${JSON.stringify(text)};

export function findMatches(input: string = text) {
  return Array.from(input.matchAll(pattern)).map(match => ({
    fullMatch: match[0],
    groups: match.slice(1),
    index: match.index,
  }));
}
`);
  process.exit(0);
}

try {
  const re = new RegExp(pat, flags);
  const matches = [...text.matchAll(re)];

  if (isJson) {
    const jsonMatches = matches.map(m => ({
      match: m[0],
      groups: m.slice(1),
      index: m.index,
    }));
    console.log(JSON.stringify(jsonMatches, null, 2));
    process.exit(0);
  }

  app.info(`Found ${matches.length} matches for /${pat}/${flags}:`);

  if (matches.length > 0) {
    const rows = matches.map((m, idx) => [
      `#${idx + 1}`,
      String(m.index ?? 0),
      m[0],
      m.slice(1).map((g, gi) => `$${gi + 1}: ${g}`).join(' | ') || '(none)',
    ]);
    app.table(['#', 'Index', 'Full Match', 'Captured Groups'], rows);
  }

  if (replaceStr !== '') {
    const replaced = text.replace(re, replaceStr);
    app.panel('Substitution Result', replaced);
  }
} catch (err: any) {
  app.error(`Invalid RegEx /${pat}/${flags}/: ${err.message}`);
  process.exit(1);
}
