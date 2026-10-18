#!/usr/bin/env bun
import { SimpleCLI, sys, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('disk-cli', '1.0.0')
  .setDescription('Disk Storage Capacity & Partition Usage Visualizer');

app.addFlagString('path', 'p', '/', 'Target mount point or directory path to inspect');

if (!app.parseCli()) process.exit(0);

app.banner('Disk Storage Analyzer', 'v1.0.0 - Storage Metrics & Partition Gauges');

const targetPath = app.getFlagString('path') || '/';
const stats = sys.diskStats(targetPath);

app.printKv({
  'Inspected Path': targetPath,
  'Total Capacity': stdlib.humanSize(stats.totalBytes),
  'Used Space': stdlib.humanSize(stats.usedBytes),
  'Free Available': stdlib.humanSize(stats.freeBytes),
  'Utilization': `${stats.percent.toFixed(1)}%`,
});

app.gauge('Partition Utilization', Number((stats.usedBytes / (1024 ** 3)).toFixed(1)), Number((stats.totalBytes / (1024 ** 3)).toFixed(1)), 'GB');
