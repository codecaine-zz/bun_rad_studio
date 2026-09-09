#!/usr/bin/env bun
/**
 * Network Speed & Latency Benchmarker CLI
 * Benchmarks HTTP ping, download throughput, and latency distribution with sparklines
 */

import { SimpleCLI, Ansi, AlertKind } from '../src/index.ts';

const app = SimpleCLI.newApp('speedtest_cli', '1.0.0')
  .setDescription('Fast network latency and download bandwidth benchmarker');

app.addFlagInt('samples', 's', 5, 'Number of ping samples to collect');
app.addFlagBool('json', 'j', false, 'Output results as JSON');

if (!app.parseCli()) {
  process.exit(0);
}

const samples = app.getFlagInt('samples') || 5;

const pingTargets = [
  { name: 'Cloudflare DNS', url: 'https://1.1.1.1' },
  { name: 'Google DNS', url: 'https://8.8.8.8' },
  { name: 'Fastly CDN', url: 'https://www.fastly.com' },
];

async function measurePing(url: string): Promise<number> {
  const start = performance.now();
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    await res.text();
    return Math.round(performance.now() - start);
  } catch {
    return -1;
  }
}

async function measureDownload(sizeMb: number = 10): Promise<{ mbps: number; durationMs: number; bytes: number }> {
  // Using cloudflare speed test 10MB test file or fallback
  const testUrl = `https://speed.cloudflare.com/__down?bytes=${sizeMb * 1024 * 1024}`;
  const start = performance.now();
  try {
    const res = await fetch(testUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    let receivedBytes = 0;
    const reader = res.body.getReader();
    const totalBytes = sizeMb * 1024 * 1024;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        if (!app.getFlagBool('json') && process.stdout.isTTY) {
          app.progressBar(receivedBytes, totalBytes, 'Downloading payload');
        }
      }
    }

    const durationSec = (performance.now() - start) / 1000;
    const mbps = Number(((receivedBytes * 8) / (durationSec * 1024 * 1024)).toFixed(2));
    return { mbps, durationMs: Math.round(durationSec * 1000), bytes: receivedBytes };
  } catch {
    // Fallback lightweight measure
    const smallStart = performance.now();
    const res = await fetch('https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js');
    const txt = await res.text();
    const durationSec = (performance.now() - smallStart) / 1000;
    const mbps = Number(((txt.length * 8) / (durationSec * 1024 * 1024)).toFixed(2));
    return { mbps, durationMs: Math.round(durationSec * 1000), bytes: txt.length };
  }
}

async function run() {
  if (!app.getFlagBool('json')) {
    app.banner('Network Speed & Latency Benchmarker', 'Zero-Dependency Bandwidth & RTT Sentinel');
  }

  const pingResults: { target: string; pings: number[]; avg: number }[] = [];

  for (const t of pingTargets) {
    const pings: number[] = [];
    for (let i = 0; i < samples; i++) {
      const p = await measurePing(t.url);
      if (p > 0) pings.push(p);
    }
    const avg = pings.length > 0 ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : 0;
    pingResults.push({ target: t.name, pings, avg });
  }

  if (!app.getFlagBool('json')) {
    app.println(`\n${Ansi.bold('📡 Latency Distribution:')}`);
    const rows = pingResults.map(r => [
      r.target,
      `${r.avg} ms`,
      r.pings.length > 0 ? `${Math.min(...r.pings)} ms` : '-',
      r.pings.length > 0 ? `${Math.max(...r.pings)} ms` : '-',
      app.sparkline(r.pings),
    ]);
    app.table(['Endpoint', 'Avg Latency', 'Min', 'Max', 'Sparkline'], rows);

    app.println(`\n${Ansi.bold('🚀 Testing Download Bandwidth...')}`);
  }

  const dl = await measureDownload(10);

  if (app.getFlagBool('json')) {
    app.output({
      pingResults,
      download: {
        mbps: dl.mbps,
        bytes: dl.bytes,
        durationMs: dl.durationMs,
      },
    });
    process.exit(0);
  }

  app.println('');
  app.panel('Speed Benchmark Results', [
    `Download Throughput : ${Ansi.bold(Ansi.green(`${dl.mbps} Mbps`))} (${(dl.mbps / 8).toFixed(2)} MB/s)`,
    `Transferred Payload : ${(dl.bytes / (1024 * 1024)).toFixed(2)} MB in ${(dl.durationMs / 1000).toFixed(2)}s`,
    `Primary Latency RTT : ${Ansi.cyan(`${pingResults[0]?.avg ?? 0} ms`)} (${pingResults[0]?.target})`,
  ].join('\n'));
}

run();
