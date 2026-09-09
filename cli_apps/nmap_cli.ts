#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('nmap-cli', '1.0.0')
  .setDescription('High-Performance TCP Port Scanner & Service Discovery');

app.addFlagString('host', 'H', '127.0.0.1', 'Target host IPv4 or domain');
app.addFlagInt('start', 's', 20, 'Start port range');
app.addFlagInt('end', 'e', 100, 'End port range');

if (!app.parseCli()) process.exit(0);

app.banner('TCP Port Scanner (nmap-cli)', 'v1.0.0 - Network Reconnaissance');

const host = app.getFlagString('host');
const startPort = app.getFlagInt('start');
const endPort = app.getFlagInt('end');

async function main() {
  app.info(`Scanning ${host} ports ${startPort}..${endPort}...`);
  app.resetTimer();
  const openPorts = await sys.portScan(host, startPort, endPort, 400);
  const elapsed = app.elapsedMs();

  app.success(`Port scan finished in ${elapsed} ms. Found ${openPorts.length} open ports:`);
  const rows = openPorts.map(p => [host, p.toString(), 'OPEN', 'TCP']);
  app.table(['Target Host', 'Port', 'State', 'Protocol'], rows);
}

main();
