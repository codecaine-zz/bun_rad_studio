#!/usr/bin/env bun
/**
 * Network Forensics Studio CLI
 * TCP port scanner, DNS records resolver, and HTTP TTFB latency probe
 * Built with native node:net and node:dns/promises
 */
import { SimpleCLI } from '../src/index.ts';
import * as net from 'node:net';
import * as dns from 'node:dns/promises';

const app = SimpleCLI.newApp('network-cli', '1.0.0')
  .setDescription('TCP Socket Port Scanner, DNS Resolver & HTTP TTFB Latency Probe');

app.addFlagString('scan', 's', '', 'Target host to scan for open TCP ports (e.g. 127.0.0.1, localhost)');
app.addFlagString('ports', 'p', '80,443,3000,4567,5173,5432,6379,8080', 'Comma-separated port numbers or range (e.g. 80-90)');
app.addFlagInt('timeout', 't', 500, 'Socket connect timeout in ms');
app.addFlagString('dns', 'd', '', 'Domain name to resolve DNS records (e.g. google.com)');
app.addFlagString('record', 'r', 'ALL', 'DNS record type: A, AAAA, MX, TXT, NS, ALL');
app.addFlagString('probe', 'P', '', 'URL to probe for HTTP Time-To-First-Byte (TTFB)');
app.addFlagBool('json', 'j', false, 'Output results as JSON');

if (!app.parseCli()) process.exit(0);

const isJson = app.getFlagBool('json');
if (!isJson) {
  app.banner('Network Forensics Studio CLI', 'v1.0.0 - Sockets & DNS Exploration');
}

function checkPort(host: string, port: number, timeout: number): Promise<{ port: number; status: 'OPEN' | 'CLOSED'; elapsed: number }> {
  return new Promise(resolve => {
    const start = performance.now();
    const socket = new net.Socket();
    let isSettled = false;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      if (!isSettled) {
        isSettled = true;
        const elapsed = Math.round(performance.now() - start);
        socket.destroy();
        resolve({ port, status: 'OPEN', elapsed });
      }
    });

    socket.on('timeout', () => {
      if (!isSettled) {
        isSettled = true;
        const elapsed = Math.round(performance.now() - start);
        socket.destroy();
        resolve({ port, status: 'CLOSED', elapsed });
      }
    });

    socket.on('error', () => {
      if (!isSettled) {
        isSettled = true;
        const elapsed = Math.round(performance.now() - start);
        socket.destroy();
        resolve({ port, status: 'CLOSED', elapsed });
      }
    });

    socket.connect(port, host);
  });
}

async function runPortScan(host: string) {
  const portStr = app.getFlagString('ports');
  const timeout = app.getFlagInt('timeout') || 500;
  const portsToScan: number[] = [];

  if (portStr.includes('-')) {
    const parts = portStr.split('-').map(Number);
    const startP = parts[0] ?? 80;
    const endP = parts[1] ?? 80;
    for (let p = startP; p <= endP; p++) portsToScan.push(p);
  } else {
    portStr.split(',').map(p => {
      const num = parseInt(p.trim(), 10);
      if (!isNaN(num)) portsToScan.push(num);
    });
  }

  app.info(`Scanning ${portsToScan.length} ports on ${host} (timeout: ${timeout}ms)...`);
  const results = await Promise.all(portsToScan.map(p => checkPort(host, p, timeout)));

  if (isJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const openPorts = results.filter(r => r.status === 'OPEN');
  app.success(`Found ${openPorts.length} OPEN ports:`);
  app.table(
    ['Port', 'Status', 'Latency'],
    results.map(r => [
      String(r.port),
      r.status === 'OPEN' ? app.green('OPEN') : app.red('CLOSED'),
      `${r.elapsed}ms`,
    ])
  );
}

async function runDns(domain: string) {
  const recType = app.getFlagString('record').toUpperCase();
  app.info(`Resolving DNS for ${domain} (Record: ${recType})...`);
  const records: Record<string, any> = {};

  try {
    if (recType === 'A' || recType === 'ALL') records['A'] = await dns.resolve4(domain).catch(() => []);
    if (recType === 'AAAA' || recType === 'ALL') records['AAAA'] = await dns.resolve6(domain).catch(() => []);
    if (recType === 'MX' || recType === 'ALL') records['MX'] = await dns.resolveMx(domain).catch(() => []);
    if (recType === 'TXT' || recType === 'ALL') records['TXT'] = await dns.resolveTxt(domain).catch(() => []);
    if (recType === 'NS' || recType === 'ALL') records['NS'] = await dns.resolveNs(domain).catch(() => []);

    if (isJson) {
      console.log(JSON.stringify(records, null, 2));
      return;
    }

    for (const [type, data] of Object.entries(records)) {
      app.panel(`DNS [${type}] Records`, Array.isArray(data) && data.length > 0 ? JSON.stringify(data, null, 2) : 'None found');
    }
  } catch (err: any) {
    app.error(`DNS query failed: ${err.message}`);
  }
}

async function runProbe(url: string) {
  app.info(`Probing TTFB latency for ${url}...`);
  const start = performance.now();
  try {
    const res = await fetch(url);
    const ttfb = (performance.now() - start).toFixed(2);
    const body = await res.arrayBuffer();
    const totalTime = (performance.now() - start).toFixed(2);

    if (isJson) {
      console.log(JSON.stringify({ url, status: res.status, ttfbMs: ttfb, totalMs: totalTime, sizeBytes: body.byteLength }, null, 2));
      return;
    }

    app.success(`Probe completed in ${totalTime}ms:`);
    app.printKv({
      'Endpoint': url,
      'HTTP Status': `${res.status} ${res.statusText}`,
      'TTFB Latency': `${ttfb}ms`,
      'Total Roundtrip': `${totalTime}ms`,
      'Payload Size': `${body.byteLength} bytes`,
    });
  } catch (err: any) {
    app.error(`Probe failed: ${err.message}`);
  }
}

async function main() {
  const scanHost = app.getFlagString('scan');
  const dnsDomain = app.getFlagString('dns');
  const probeUrl = app.getFlagString('probe');

  if (scanHost) {
    await runPortScan(scanHost);
  } else if (dnsDomain) {
    await runDns(dnsDomain);
  } else if (probeUrl) {
    await runProbe(probeUrl);
  } else {
    // Default demo: scan localhost
    await runPortScan('127.0.0.1');
  }
}

main();
