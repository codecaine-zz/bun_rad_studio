#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('ifconfig-cli', '1.0.0')
  .setDescription('Network Interface & IP Configuration Inspector');

if (!app.parseCli()) process.exit(0);

app.banner('Network Interface Inspector', 'v1.0.0 - IP & Adapter Telemetry');

const ifaces = sys.networkInterfaces();
const rows: string[][] = [];

for (const [name, addrs] of Object.entries(ifaces)) {
  rows.push([name, addrs.join(', ')]);
}

app.table(['Interface Adapter', 'Assigned IP Addresses'], rows);
app.printKv({
  'Primary Local IP': sys.localIp(),
  'Primary MAC': sys.macAddress(),
  'Wi-Fi Network': sys.wifiSsid(),
});
