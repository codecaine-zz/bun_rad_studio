#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';
import * as fs from 'node:fs';

const app = SimpleCLI.newApp('API-Stress-Bench', '1.0.0')
  .setDescription('High-Performance HTTP API Benchmark & Latency Stress Tester');

app.addFlagString('url', 'u', 'https://httpbin.org/get', 'Target URL to benchmark');
app.addFlagString('method', 'm', 'GET', 'HTTP method (GET, POST, PUT, DELETE, HEAD)');
app.addFlagString('body', 'b', '', 'Request payload string for POST/PUT');
app.addFlagInt('requests', 'n', 20, 'Total number of requests to execute');
app.addFlagInt('concurrency', 'c', 4, 'Number of concurrent worker threads');
app.addFlagString('export', 'e', '', 'Export benchmark results to JSON file');

if (!app.parseCli()) process.exit(0);

app.banner('API Stress Bench & Latency Analyzer', 'v1.0.0 - High-Throughput HTTP Engine');

interface RequestResult {
  durationMs: number;
  statusCode: number;
  isSuccess: boolean;
  errorMsg: string;
}

async function main() {
  const targetUrl = app.getFlagString('url');
  const method = app.getFlagString('method').toUpperCase();
  const body = app.getFlagString('body');
  const totalReqs = app.getFlagInt('requests');
  const concurrency = app.getFlagInt('concurrency');
  const exportPath = app.getFlagString('export');

  if (!stdlib.isUrl(targetUrl)) {
    app.error(`Invalid URL format: "${targetUrl}". Must start with http:// or https://`);
    return;
  }

  app.printKv({
    'Target URL': targetUrl,
    'HTTP Method': method,
    'Total Count': `${totalReqs} requests`,
    'Concurrency': `${concurrency} worker threads`,
  });

  app.step(1, 'Executing high-concurrency benchmark run');

  const allResults: RequestResult[] = [];
  let reqsDone = 0;
  const startBench = performance.now();

  const worker = async (count: number) => {
    for (let i = 0; i < count; i++) {
      const t0 = performance.now();
      try {
        const res = await fetch(targetUrl, {
          method,
          body: ['GET', 'HEAD'].includes(method) ? undefined : (body || undefined),
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
        });
        await res.text();
        const durationMs = performance.now() - t0;
        allResults.push({
          durationMs,
          statusCode: res.status,
          isSuccess: res.status >= 200 && res.status < 400,
          errorMsg: '',
        });
      } catch (err: any) {
        const durationMs = performance.now() - t0;
        allResults.push({
          durationMs,
          statusCode: 0,
          isSuccess: false,
          errorMsg: err.message || String(err),
        });
      }
      reqsDone++;
      app.progressBar(reqsDone, totalReqs, 'Requests Dispatched');
    }
  };

  const reqsPerWorker = Math.floor(totalReqs / concurrency);
  const remainder = totalReqs % concurrency;
  const workers: Promise<void>[] = [];

  for (let w = 0; w < concurrency; w++) {
    const count = reqsPerWorker + (w === 0 ? remainder : 0);
    workers.push(worker(count));
  }

  await Promise.all(workers);

  const totalDurationSec = (performance.now() - startBench) / 1000;
  const throughputRps = totalDurationSec > 0 ? allResults.length / totalDurationSec : 0;

  app.step(2, 'Computing Statistical Metrics & Latency Distribution');

  const latencies = allResults.map(r => r.durationMs);
  const statusCounts: Record<number, number> = {};
  let successes = 0;
  let failures = 0;

  for (const r of allResults) {
    statusCounts[r.statusCode] = (statusCounts[r.statusCode] || 0) + 1;
    if (r.isSuccess) successes++;
    else failures++;
  }

  const meanLat = stdlib.mean(latencies);
  const medianLat = stdlib.median(latencies);
  const stdDevLat = stdlib.stddev(latencies);
  const rmsLat = stdlib.rms(latencies);
  const minLat = stdlib.min(latencies);
  const maxLat = stdlib.max(latencies);
  const p95Lat = stdlib.percentile(latencies, 95);

  app.printKv({
    'Total Duration': `${totalDurationSec.toFixed(2)} seconds`,
    'Throughput': `${throughputRps.toFixed(1)} req/sec`,
    'Success / Fail': `${app.green(successes.toString())} success / ${failures > 0 ? app.red(failures.toString()) : '0'} errors`,
    'Fastest (Min)': `${minLat.toFixed(2)} ms`,
    'Slowest (Max)': `${maxLat.toFixed(2)} ms`,
    'Average (Mean)': `${meanLat.toFixed(2)} ms`,
    'Median (p50)': `${medianLat.toFixed(2)} ms`,
    'p95 Latency': `${p95Lat.toFixed(2)} ms`,
    'Std Deviation': `±${stdDevLat.toFixed(2)} ms`,
    'Root Mean Sq': `${rmsLat.toFixed(2)} ms`,
    'Latency Sparkline': app.sparkline(latencies.slice(0, 30)),
  });

  app.step(3, 'HTTP Status Code Distribution Breakdown');
  const statusRows: (string | number)[][] = [];
  for (const [codeStr, count] of Object.entries(statusCounts)) {
    const code = parseInt(codeStr, 10);
    const codeLabel = code === 0 ? 'Network Error / Timeout' : code.toString();
    const pct = ((count / allResults.length) * 100).toFixed(1) + '%';
    statusRows.push([codeLabel, count, pct]);
  }
  app.table(['HTTP Status Code', 'Response Count', 'Percentage'], statusRows);

  if (exportPath) {
    app.step(4, 'Exporting Benchmark Metrics to JSON');
    const report = {
      target_url: targetUrl,
      method,
      total_requests: allResults.length,
      concurrency,
      duration_sec: totalDurationSec,
      throughput_rps: throughputRps,
      latency_mean_ms: meanLat,
      latency_median_ms: medianLat,
      latency_min_ms: minLat,
      latency_max_ms: maxLat,
      latency_std_dev_ms: stdDevLat,
      latency_p95_ms: p95Lat,
    };
    fs.writeFileSync(exportPath, JSON.stringify(report, null, 2), 'utf8');
    app.success(`Report saved to: ${exportPath}`);
  }

  app.divider('─', 64);
  app.success(`API benchmark completed in ${app.elapsedMs()} ms.`);
}

main();
