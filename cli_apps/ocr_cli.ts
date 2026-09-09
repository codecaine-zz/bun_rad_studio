#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('ocr-cli', '1.0.0')
  .setDescription('Optical Character Recognition Text Extractor');

app.addFlagString('image', 'i', '', 'Input image file path');

if (!app.parseCli()) process.exit(0);

app.banner('OCR Text Extraction Studio', 'v1.0.0 - Image to Text Engine');
app.info('Optical character recognition completed.');
