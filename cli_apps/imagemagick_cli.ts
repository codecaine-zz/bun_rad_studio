#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('imagemagick-cli', '1.0.0')
  .setDescription('Batch Image Converter, Resizer & Thumbnail Engine');

app.addFlagString('input', 'i', '', 'Input image path');
app.addFlagString('resize', 'r', '800x600', 'Target geometry resize dimensions');
app.addFlagString('format', 'f', 'webp', 'Target output image format');

if (!app.parseCli()) process.exit(0);

app.banner('ImageMagick Batch Studio', 'v1.0.0 - Image Pipeline');
app.printKv({
  'Geometry': app.getFlagString('resize'),
  'Target Format': app.getFlagString('format').toUpperCase(),
});
