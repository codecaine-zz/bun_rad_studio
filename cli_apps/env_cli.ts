#!/usr/bin/env bun
/**
 * Environment Secret & Config Auditor CLI
 * Parses, validates, audits diffs against .env.example, and masks environment variables
 */

import { SimpleCLI, Ansi, AlertKind } from '../src/index.ts';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const app = SimpleCLI.newApp('env_cli', '1.0.0')
  .setDescription('Environment variable auditor, syntax validator, and .env.example diff inspector');

app.addFlagString('file', 'f', '.env', 'Path to .env file');
app.addFlagString('example', 'e', '.env.example', 'Path to .env.example file for comparison');
app.addFlagBool('unmask', 'u', false, 'Reveal raw secret values (default is masked)');
app.addFlagBool('json', 'j', false, 'Output results as JSON');

if (!app.parseCli()) {
  process.exit(0);
}

const envPath = resolve(process.cwd(), app.getFlagString('file'));
const examplePath = resolve(process.cwd(), app.getFlagString('example'));
const unmask = app.getFlagBool('unmask');

function parseEnv(content: string): { vars: Record<string, string>; errors: string[]; duplicates: string[] } {
  const vars: Record<string, string> = {};
  const errors: string[] = [];
  const duplicates: string[] = [];
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    if (!trimmed.includes('=')) {
      errors.push(`Line ${idx + 1}: Missing '=' separator ("${trimmed}")`);
      return;
    }

    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`Line ${idx + 1}: Invalid variable identifier "${key}"`);
    }

    if (vars[key] !== undefined) {
      duplicates.push(key);
    }

    // Strip wrapping quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    vars[key] = val;
  });

  return { vars, errors, duplicates };
}

function maskSecret(val: string): string {
  if (val.length <= 4) return '••••';
  return val.slice(0, 2) + '•'.repeat(Math.max(4, val.length - 4)) + val.slice(-2);
}

if (!existsSync(envPath)) {
  app.alert(AlertKind.CAUTION, 'File Not Found', `Target env file not found at: ${envPath}`);
  process.exit(1);
}

const envContent = readFileSync(envPath, 'utf8');
const { vars, errors, duplicates } = parseEnv(envContent);

let exampleVars: Record<string, string> | null = null;
let missingFromEnv: string[] = [];
let extraInEnv: string[] = [];

if (existsSync(examplePath)) {
  const exContent = readFileSync(examplePath, 'utf8');
  exampleVars = parseEnv(exContent).vars;
  const envKeys = new Set(Object.keys(vars));
  const exampleKeys = Object.keys(exampleVars);

  missingFromEnv = exampleKeys.filter(k => !envKeys.has(k));
  extraInEnv = Object.keys(vars).filter(k => !(k in (exampleVars ?? {})));
}

if (app.getFlagBool('json')) {
  app.output({
    file: envPath,
    totalVariables: Object.keys(vars).length,
    syntaxErrors: errors,
    duplicateKeys: duplicates,
    missingFromExample: missingFromEnv,
    variables: unmask ? vars : Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, maskSecret(v)])),
  });
  process.exit(0);
}

app.banner('Environment Secret & Config Auditor', `Inspecting ${app.getFlagString('file')}`);

const rows = Object.entries(vars).map(([key, val]) => {
  const isSecret = /(pass|secret|key|token|auth|pwd|cred|cert|private)/i.test(key);
  const displayVal = unmask ? val : (isSecret ? maskSecret(val) : val);
  const status = isSecret ? Ansi.yellow('SECRET') : Ansi.green('CONFIG');
  return [key, status, displayVal];
});

app.table(['Variable Name', 'Type', 'Value'], rows);

if (errors.length > 0) {
  app.println(`\n${Ansi.bold(Ansi.red('⚠️ Syntax Errors Detected:'))}`);
  errors.forEach(e => app.println(`  ${Ansi.red('✖')} ${e}`));
}

if (duplicates.length > 0) {
  app.println(`\n${Ansi.bold(Ansi.yellow('⚠️ Duplicate Variables Defined:'))}`);
  duplicates.forEach(d => app.println(`  ${Ansi.yellow('!')} ${d}`));
}

if (exampleVars) {
  app.panel('Comparison against .env.example', [
    `Total Example Variables: ${Object.keys(exampleVars).length}`,
    missingFromEnv.length > 0
      ? `${Ansi.red(`Missing in .env (${missingFromEnv.length}):`)} ${missingFromEnv.join(', ')}`
      : Ansi.green('✔ All example variables defined in .env'),
    extraInEnv.length > 0
      ? `${Ansi.cyan(`Additional in .env (${extraInEnv.length}):`)} ${extraInEnv.join(', ')}`
      : 'No extra variables',
  ].join('\n'));
} else {
  app.println(`\n${Ansi.dim(`ℹ No .env.example found for comparison at ${examplePath}`)}`);
}
