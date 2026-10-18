#!/usr/bin/env bun
import { SimpleCLI, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('apistudio-cli', '1.0.0')
  .setDescription('Interactive REST API Client & Request Builder CLI');

app.addFlagString('url', 'u', 'https://httpbin.org/get', 'Target REST API endpoint URL');
app.addFlagString('method', 'm', 'GET', 'HTTP Request Method (GET, POST, PUT, DELETE, PATCH, HEAD)');
app.addFlagString('body', 'b', '', 'Request payload / JSON body string');
app.addFlagString('header', 'H', '', 'Custom HTTP header');
app.addFlagBool('interactive', 'x', false, 'Launch interactive REST API studio REPL');

if (!app.parseCli()) process.exit(0);

app.banner('API Studio CLI', 'v1.0.0 - REST API Client & Request Builder');

async function sendApiRequest(method: string, url: string, body?: string) {
  app.info(`Sending ${method} ${url}...`);
  app.resetTimer();

  try {
    const res = await stdlib.httpRequest(method, url, body);
    const elapsed = app.elapsedMs();
    const statusColor = res.statusCode >= 200 && res.statusCode < 300
      ? app.green(`HTTP ${res.statusCode}`)
      : app.yellow(`HTTP ${res.statusCode}`);

    app.printKv({
      'Status': statusColor,
      'Latency': `${elapsed} ms`,
      'Body Size': `${res.body.length} bytes`,
    });

    app.panel('Response Body', res.body.slice(0, 1000) + (res.body.length > 1000 ? '... [truncated]' : ''));
  } catch (err: any) {
    app.error(`HTTP Request failed: ${err.message}`);
  }
}

async function runInteractive() {
  app.panel('REST API Studio REPL', 'Build and execute HTTP requests interactively.');
  while (true) {
    const method = await app.select('HTTP Method:', ['GET', 'POST', 'PUT', 'DELETE', 'HEAD']);
    const url = await app.prompt('Request URL', 'https://httpbin.org/get');
    let body = '';
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      body = await app.prompt('Request JSON Body', '{"test": true}');
    }
    await sendApiRequest(method, url, body);
    if (!await app.confirm('Send another request?', true)) break;
  }
}

if (app.getFlagBool('interactive')) {
  runInteractive();
} else {
  const url = app.getFlagString('url');
  const method = app.getFlagString('method').toUpperCase();
  const body = app.getFlagString('body');
  sendApiRequest(method, url, body);
}
