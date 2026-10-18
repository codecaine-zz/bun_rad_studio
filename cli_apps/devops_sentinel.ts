#!/usr/bin/env bun
import { SimpleCLI, sys, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('DevOps-Sentinel', '1.0.0')
  .setDescription('System Resource Guardian & Hardware Telemetry Sentinel');

app.addFlagInt('interval', 'i', 0, 'Continuous polling interval in seconds (0 = single snapshot)');
app.addFlagBool('notify', 'n', false, 'Send desktop notification on high resource thresholds');

if (!app.parseCli()) process.exit(0);

app.banner('DevOps Sentinel Telemetry Hub', 'v1.0.0 - Hardware & OS Health Monitor');

function renderSnapshot() {
  const cpuLoad = sys.cpuLoad();
  const ramTotal = sys.ramTotal();
  const ramUsed = sys.ramUsed();
  const ramPct = sys.ramPercent();
  const disk = sys.diskStats('/');
  const battery = sys.batteryPercent();
  const uptime = sys.osUptime();

  app.step(1, 'Host Telemetry & Hardware Info');
  app.printKv({
    'Platform & OS': `${sys.osPlatform()} (${sys.osArch()}) - ${sys.osRelease()}`,
    'CPU Model': sys.cpuModel(),
    'CPU Cores': `${sys.cpuCount()} physical/logical cores`,
    'Load Average (1m, 5m, 15m)': `${cpuLoad[0].toFixed(2)}, ${cpuLoad[1].toFixed(2)}, ${cpuLoad[2].toFixed(2)}`,
    'System Uptime': stdlib.humanDuration(uptime * 1000),
    'Local IPv4': sys.localIp(),
    'Wi-Fi SSID': sys.wifiSsid(),
    'Battery Level': `${battery}%`,
  });

  app.step(2, 'Resource Allocation Gauges');
  app.gauge('Memory (RAM)', Number((ramUsed / (1024 ** 3)).toFixed(2)), Number((ramTotal / (1024 ** 3)).toFixed(2)), 'GB');
  app.gauge('Root Disk (/)', Number((disk.usedBytes / (1024 ** 3)).toFixed(2)), Number((disk.totalBytes / (1024 ** 3)).toFixed(2)), 'GB');

  if (app.getFlagBool('notify') && (ramPct > 90 || disk.percent > 90)) {
    sys.notify('Sentinel Alert', `High resource utilization: RAM ${ramPct}%, Disk ${disk.percent}%`);
  }
}

renderSnapshot();
