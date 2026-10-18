#!/usr/bin/env bun
/**
 * DevTools Studio Pro CLI -- 6-in-1 Native Developer Utility Suite
 * Zero Homebrew reliance -- Replaces rg, fd, sd, watchexec, rip, and jq with native Bun primitives
 */
import { SimpleCLI } from '../src/index.ts';
import { bunNativeRipgrep, bunNativeFd, bunNativeSd, bunNativeRip } from '../applications/omnitool_studio.ts';
import { evaluateBunJsonQuery } from '../applications/jq_studio.ts';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const app = SimpleCLI.newApp('devtools-cli', '1.0.0')
  .setDescription('6-in-1 Native Developer Suite: Code Search (rg), File Finder (fd), Find & Replace (sd), Trash (rip), and JSON (jq)');

app.addFlagString('tool', 't', 'rg', 'Tool to execute: rg (search), fd (find), sd (replace), rip (safe trash), jq (json)');
app.addFlagString('pattern', 'p', '', 'Search pattern, file glob, regex, or replacement match');
app.addFlagString('replace', 'r', '', 'Replacement string (for sd tool)');
app.addFlagString('target', 'd', './', 'Target directory or file path');
app.addFlagBool('case-sensitive', 's', false, 'Case-sensitive matching');
app.addFlagBool('json', 'j', false, 'Output results in JSON format');

if (!app.parseCli()) process.exit(0);

const tool = app.getFlagString('tool').toLowerCase();
const pattern = app.getFlagString('pattern') || app.getPositionalArgs()[0] || '';
const replaceStr = app.getFlagString('replace');
const target = app.getFlagString('target') || './';
const caseSensitive = app.getFlagBool('case-sensitive');
const isJson = app.getFlagBool('json');

app.banner('DevTools Studio Pro CLI', `v1.0.0 - Native Tool Engine [${tool.toUpperCase()}]`);

async function main() {
  const start = performance.now();
  let result: { output: string; success: boolean } = { output: '', success: false };

  switch (tool) {
    case 'rg':
    case 'grep':
    case 'search': {
      if (!pattern) {
        app.error('rg requires --pattern <string>');
        process.exit(1);
      }
      app.info(`Searching for /${pattern}/ in ${target}...`);
      const res = await bunNativeRipgrep(target, pattern, { caseSensitive });
      result = { output: res.output, success: true };
      break;
    }

    case 'fd':
    case 'find': {
      app.info(`Finding files matching "${pattern || '*'}" in ${target}...`);
      const res = await bunNativeFd(target, pattern);
      result = { output: res.output, success: true };
      break;
    }

    case 'sd':
    case 'replace': {
      if (!pattern) {
        app.error('sd requires --pattern <search_regex> and --replace <replacement>');
        process.exit(1);
      }
      app.info(`Replacing /${pattern}/ with "${replaceStr}" in ${target}...`);
      const res = await bunNativeSd(target, pattern, replaceStr, false);
      result = { output: res.output, success: true };
      break;
    }

    case 'rip':
    case 'trash': {
      if (!target || target === './') {
        app.error('rip requires a specific target file path via --target <file>');
        process.exit(1);
      }
      app.info(`Moving "${target}" to ~/.Trash...`);
      result = bunNativeRip(target);
      break;
    }

    case 'jq':
    case 'json': {
      let jsonContent = '';
      if (existsSync(resolve(process.cwd(), target))) {
        jsonContent = readFileSync(resolve(process.cwd(), target), 'utf8');
      } else {
        jsonContent = pattern; // treat pattern as input or query
      }
      const query = pattern && existsSync(resolve(process.cwd(), target)) ? pattern : '.';
      result = evaluateBunJsonQuery(jsonContent, query);
      break;
    }

    default:
      app.error(`Unknown tool "${tool}". Supported tools: rg, fd, sd, rip, jq`);
      process.exit(1);
  }

  const elapsed = (performance.now() - start).toFixed(2);
  if (result.success) {
    app.success(`Engine [${tool.toUpperCase()}] finished in ${elapsed}ms`);
    console.log(result.output);
  } else {
    app.error(`Engine [${tool.toUpperCase()}] failed: ${result.output}`);
    process.exit(1);
  }
}

main();
