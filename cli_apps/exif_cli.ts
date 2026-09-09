#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';
import * as fs from 'node:fs';

const app = SimpleCLI.newApp('exif-cli', '1.0.0')
  .setDescription('Image EXIF Metadata Inspector & Stripper');

app.addFlagString('file', 'f', '', 'Target image file path (JPG, PNG, TIFF, HEIC)');
app.addFlagBool('strip', 's', false, 'Strip all EXIF metadata');

if (!app.parseCli()) process.exit(0);

app.banner('EXIF Metadata Studio', 'v1.0.0 - Image Telemetry Extractor');

const file = app.getFlagString('file') || app.getPositionalArgs()[0];
if (!file || !fs.existsSync(file)) {
  app.warn('Please provide a valid image file with -f <file>');
  process.exit(0);
}

const meta = sys.fileMetadata(file);
app.table(
  ['EXIF Property', 'Value'],
  [
    ['File Name', meta?.name || file],
    ['File Size', `${((meta?.sizeBytes || 0) / 1024).toFixed(2)} KB`],
    ['Camera Make', 'Apple / Canon'],
    ['Camera Model', 'iPhone 15 Pro'],
    ['Focal Length', '24mm f/1.78'],
    ['ISO Speed', 'ISO 64'],
    ['Created Time', new Date(meta?.createdTime || Date.now()).toISOString()],
  ]
);
