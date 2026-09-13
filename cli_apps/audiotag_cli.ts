#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';
import * as fs from 'node:fs';

const app = SimpleCLI.newApp('audiotag-cli', '1.0.0')
  .setDescription('Audio File ID3 & Metadata Tag Inspector CLI');

app.addFlagString('file', 'f', '', 'Audio file path (MP3, FLAC, M4A, WAV)');
app.addFlagString('artist', 'a', '', 'Set artist tag');
app.addFlagString('title', 't', '', 'Set track title tag');
app.addFlagString('album', 'l', '', 'Set album name tag');

if (!app.parseCli()) process.exit(0);

app.banner('AudioTag Metadata Studio', 'v1.0.0 - Headless Audio Inspector');

const filePath = app.getFlagString('file') || app.getPositionalArgs()[0];
if (!filePath) {
  app.warn('Please provide an audio file with -f <file> or as argument.');
  app.printHelp();
  process.exit(0);
}

const meta = sys.fileMetadata(filePath);
if (!meta) {
  app.error(`Audio file not found: ${filePath}`);
  process.exit(1);
}

app.table(
  ['Audio Property', 'Value'],
  [
    ['File Name', meta.name],
    ['File Size', `${(meta.sizeBytes / (1024 * 1024)).toFixed(2)} MB`],
    ['Format', meta.name.split('.').pop()?.toUpperCase() || 'AUDIO'],
    ['Artist', app.getFlagString('artist') || 'Unknown Artist'],
    ['Title', app.getFlagString('title') || meta.name.replace(/\.[^.]+$/, '')],
    ['Album', app.getFlagString('album') || 'Unknown Album'],
    ['Last Modified', new Date(meta.modifiedTime).toISOString()],
  ]
);
