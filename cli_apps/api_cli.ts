#!/usr/bin/env bun
/**
 * API Studio Pro CLI -- Native HTTP/REST Client & Benchmark Runner
 * Built on Bun's ultra-fast native fetch() engine
 */
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('api-cli', '1.0.0')
  .setDescription('Native HTTP/REST Client, cURL Generator & Concurrency Benchmarker');

app.addFlagString('url', 'u', 'https://jsonplaceholder.typicode.com/posts/1', 'Target API endpoint URL');
app.addFlagString('method', 'm', 'GET', 'HTTP method: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS');
app.addFlagString('body', 'b', '', 'JSON or raw text request payload');
app.addFlagString('header', 'H', '', 'Custom HTTP header (format: "Key: Value")');
app.addFlagString('token', 't', '', 'Bearer token for Authorization header');
app.addFlagInt('bench', 'B', 0, 'Run concurrency benchmark with N requests (e.g. 10)');
app.addFlagBool('curl', 'c', false, 'Print executable cURL command instead of sending request');
app.addFlagBool('json', 'j', false, 'Output response payload only as formatted JSON');

if (!app.parseCli()) process.exit(0);

const url = app.getFlagString('url');
const method = app.getFlagString('method').toUpperCase();
const body = app.getFlagString('body');
const token = app.getFlagString('token');
const customHeader = app.getFlagString('header');
const benchCount = app.getFlagInt('bench');
const printCurl = app.getFlagBool('curl');
const jsonOnly = app.getFlagBool('json');

const headers: Record<string, string> = {};
if (token) headers['Authorization'] = `Bearer ${token}`;
if (['POST', 'PUT', 'PATCH'].includes(method) && !headers['Content-Type']) {
  headers['Content-Type'] = 'application/json';
}
if (customHeader && customHeader.includes(':')) {
  const [k, ...v] = customHeader.split(':');
  if (k) headers[k.trim()] = v.join(':').trim();
}

if (printCurl) {
  const hArgs = Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
  const dArg = body ? `-d '${body}'` : '';
  console.log(`curl -X ${method} "${url}" ${hArgs} ${dArg}`.trim());
  process.exit(0);
}

if (!jsonOnly) {
  app.banner('API Studio Pro CLI', 'v1.0.0 - Native HTTP/REST Client');
}

async function sendRequest() {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(method) && body ? body : undefined,
    });
    const elapsed = (performance.now() - start).toFixed(2);
    const text = await res.text();

    if (jsonOnly) {
      try {
        console.log(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        console.log(text);
      }
      return;
    }

    const statusBadge = res.ok ? app.green(`HTTP ${res.status} ${res.statusText}`) : app.red(`HTTP ${res.status} ${res.statusText}`);
    app.printKv({
      'Endpoint': `${method} ${url}`,
      'Status': statusBadge,
      'Latency': `${elapsed}ms`,
      'Size': `${text.length} bytes`,
    });

    console.log('\n--- Response Body ---');
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 2000));
    } catch {
      console.log(text.slice(0, 2000));
    }
  } catch (err: any) {
    app.error(`HTTP request failed: ${err.message}`);
    process.exit(1);
  }
}

async function runBenchmark(count: number) {
  app.info(`Benchmarking ${count} concurrent requests to ${url}...`);
  const timings: number[] = [];
  let successful = 0;

  const promises = Array.from({ length: count }).map(async () => {
    const s = performance.now();
    try {
      const res = await fetch(url, { method, headers });
      await res.arrayBuffer();
      const dur = performance.now() - s;
      timings.push(dur);
      if (res.ok) successful++;
    } catch {
      timings.push(performance.now() - s);
    }
  });

  await Promise.all(promises);

  timings.sort((a, b) => a - b);
  const min = (timings[0] ?? 0).toFixed(2);
  const max = (timings[timings.length - 1] ?? 0).toFixed(2);
  const avg = (timings.reduce((a, b) => a + b, 0) / (timings.length || 1)).toFixed(2);
  const p95 = (timings[Math.floor(timings.length * 0.95)] ?? Number(max)).toFixed(2);

  app.success(`Completed ${count} requests (${successful} successful):`);
  app.table(
    ['Requests', 'Min Latency', 'Avg Latency', 'p95 Latency', 'Max Latency'],
    [[String(count), `${min}ms`, `${avg}ms`, `${p95}ms`, `${max}ms`]]
  );
}

if (benchCount > 0) {
  runBenchmark(benchCount);
} else {
  sendRequest();
}
