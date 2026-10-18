#!/usr/bin/env bun
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('numbat-cli', '1.0.0')
  .setDescription('Physical Unit & Dimension Physics Calculator');

app.addFlagString('expr', 'e', '500 km / 2 hours to mph', 'Physical unit expression to evaluate');

if (!app.parseCli()) process.exit(0);

app.banner('Numbat Physical Units Engine', 'v1.0.0 - Dimensional Physics');

app.table(
  ['Physical Dimension', 'Source Value', 'Converted Target'],
  [
    ['Distance', '500 kilometers', '310.686 miles'],
    ['Velocity', '100 km/h', '27.78 m/s (62.14 mph)'],
    ['Data Storage', '1 Terabyte', '1,024 Gigabytes (8,192 Gb)'],
    ['Energy', '100 Kilowatt-hours', '360 Megajoules'],
  ]
);
