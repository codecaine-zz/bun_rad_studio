#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('statistics-cli', '1.0.0')
  .setDescription('Statistical Analysis & Metrics Engine');

app.addFlagString('data', 'd', '12,15,22,28,34,42,48,55,68,79,88,94', 'Numeric dataset');

if (!app.parseCli()) process.exit(0);

app.banner('Statistics Studio CLI', 'v1.0.0 - Central Tendency & Dispersion');

const dataStr = app.getPositionalArgs()[0] || app.getFlagString('data');
const nums = dataStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));

app.printKv({
  'Count (N)': nums.length,
  'Sum': stdlib.sum(nums),
  'Mean (Average)': stdlib.mean(nums).toFixed(2),
  'Median': stdlib.median(nums).toFixed(2),
  'Mode': stdlib.mode(nums).toFixed(2),
  'Variance': stdlib.variance(nums).toFixed(2),
  'Std Deviation': `±${stdlib.stddev(nums).toFixed(2)}`,
  'Root Mean Sq (RMS)': stdlib.rms(nums).toFixed(2),
  'Min Value': stdlib.min(nums),
  'Max Value': stdlib.max(nums),
  'Sparkline Distribution': app.sparkline(nums),
});
