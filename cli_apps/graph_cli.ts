#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('graph-cli', '1.0.0')
  .setDescription('Terminal Unicode Graph, Bar Chart & Sparkline Visualizer');

app.addFlagString('data', 'd', '12,24,45,67,89,95,70,40,20,15', 'Comma-separated numeric series');
app.addFlagString('title', 't', 'System Performance Metrics', 'Chart title');

if (!app.parseCli()) process.exit(0);

app.banner('Terminal Graph & Distribution Visualizer', 'v1.0.0 - ASCII/Unicode Graphs');

const dataStr = app.getFlagString('data') || app.getPositionalArgs()[0] || '10,30,50,80,100,75,45,25';
const nums = dataStr.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));

const spark = app.sparkline(nums);
app.info(`Sparkline Trend: ${app.bold(app.cyan(spark))}`);

const barData: Record<string, number> = {};
nums.forEach((val, idx) => {
  barData[`Tick #${idx + 1}`] = val;
});

app.barChart(app.getFlagString('title'), barData, 30);
