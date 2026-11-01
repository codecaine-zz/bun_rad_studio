#!/usr/bin/env bun
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import * as nodePath from 'node:path';
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('texteditor-cli', '1.0.0')
  .setDescription('Zero-Dependency Console Text Viewer & Editor');

app.addFlagString('file', 'f', '', 'File to view or edit');
app.addFlagInt('head', 'n', 0, 'Show first N lines');
app.addFlagInt('tail', 't', 0, 'Show last N lines');
app.addFlagString('write', 'w', '', 'Write text content to the file');
app.addFlagString('append', 'a', '', 'Append a line of text to the file');
app.addFlagBool('number', 'l', true, 'Display line numbers');

if (!app.parseCli()) process.exit(0);

app.banner('SimpleCLI Text Editor', 'v1.0.0 - Headless Editor');

const fileArg = app.getPositionalArgs()[0] || app.getFlagString('file');
const headCount = app.getFlagInt('head');
const tailCount = app.getFlagInt('tail');
const writeText = app.getFlagString('write');
const appendText = app.getFlagString('append');
const showNumbers = app.getFlagBool('number');

if (fileArg) {
  const resolved = nodePath.resolve(fileArg);
  if (writeText) {
    writeFileSync(resolved, writeText.replace(/\\n/g, '\n'), 'utf8');
    app.success(`Wrote ${Buffer.byteLength(writeText)} bytes to ${fileArg}`);
  } else if (appendText) {
    const line = appendText.replace(/\\n/g, '\n');
    appendFileSync(resolved, line.endsWith('\n') ? line : `${line}\n`, 'utf8');
    app.success(`Appended text to ${fileArg}`);
  }

  if (existsSync(resolved) && !statSync(resolved).isDirectory()) {
    const st = statSync(resolved);
    const content = readFileSync(resolved, 'utf8');
    const allLines = content.split(/\r?\n/);
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

    app.info(`File: ${resolved} (${st.size} bytes, ${allLines.length} lines, ${wordCount} words)`);

    let startIdx = 0;
    let slice = allLines;
    if (headCount > 0) {
      slice = allLines.slice(0, headCount);
    } else if (tailCount > 0) {
      startIdx = Math.max(0, allLines.length - tailCount);
      slice = allLines.slice(startIdx);
    } else if (allLines.length > 40) {
      slice = allLines.slice(0, 40);
    }

    const padWidth = String(startIdx + slice.length).length;
    for (let i = 0; i < slice.length; i++) {
      const num = String(startIdx + i + 1).padStart(padWidth, ' ');
      console.log(showNumbers ? `${num} │ ${slice[i]}` : slice[i]);
    }
  }
}

app.info('Text editor session ready.');
