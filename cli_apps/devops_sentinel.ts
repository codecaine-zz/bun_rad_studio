#!/usr/bin/env bun
import { SimpleCLI, sys, stdlib } from '../src/index.ts';

const app = SimpleCLI.newApp('DevOps-Sentinel', '1.0.0')
  .setDescription('System Resource Guardian & Hardware Telemetry Sentinel');

app.addFlagInt('interval', 'i', 0, 'Continuous polling interval in seconds (0 = single snapshot)');
app.addFlagBool('notify', 'n', false, 'Send desktop notification on high resource thresholds');

if (!app.parseCli()) process.exit(0);

app.banner('DevOps Sentinel Telemetry Hub', 'v1.0.0 - Hardware & OS Health Monitor');

function formatGb(bytes: number): string {
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

function renderSnapshot() {
  const cpuLoad = sys.cpuLoad();
  const mem = sys.memoryInfo(true);
  const ramTotal = mem.total;
  const ramUsed = mem.used;
  const ramPct = mem.percent;
  const disk = sys.diskStats('/');
  const battery = sys.batteryPercent();
  const uptime = sys.osUptime();

  const memBreakdown = process.platform === 'darwin'
    ? `App ${formatGb(mem.active)} | Wired ${formatGb(mem.wired)} | Compressed ${formatGb(mem.compressed)} | Cached ${formatGb(mem.cached)}`
    : process.platform === 'linux'
      ? `Active ${formatGb(mem.active)} | Cached/Buffers ${formatGb(mem.cached)} | Available ${formatGb(mem.free)}`
      : `In Use ${formatGb(mem.used)} | Available (incl. Standby) ${formatGb(mem.free)}`;

  const diskLabel = process.platform === 'win32'
    ? `System Disk (${process.env.SystemDrive || 'C:'}\\)`
    : 'Root Disk (/)';

  app.step(1, 'Host Telemetry & Hardware Info');
  app.printKv({
    'Platform & OS': `${sys.osPlatform()} (${sys.osArch()}) - ${sys.osRelease()}`,
    'CPU Model': sys.cpuModel(),
    'CPU Cores': `${sys.cpuCount()} physical/logical cores`,
    'Load Average (1m, 5m, 15m)': `${cpuLoad[0].toFixed(2)}, ${cpuLoad[1].toFixed(2)}, ${cpuLoad[2].toFixed(2)}`,
    'Memory Used / Available': `${formatGb(ramUsed)} used / ${formatGb(mem.free)} available (of ${formatGb(ramTotal)})`,
    'Memory Breakdown': memBreakdown,
    'System Uptime': stdlib.humanDuration(uptime * 1000),
    'Local IPv4': sys.localIp(),
    'Wi-Fi SSID': sys.wifiSsid(),
    'Battery Level': `${battery}%`,
  });

  app.step(2, 'Resource Allocation Gauges');
  app.gauge('Memory (RAM)', Number((ramUsed / (1024 ** 3)).toFixed(2)), Number((ramTotal / (1024 ** 3)).toFixed(2)), 'GB');
  app.gauge(diskLabel, Number((disk.usedBytes / (1024 ** 3)).toFixed(2)), Number((disk.totalBytes / (1024 ** 3)).toFixed(2)), 'GB');

  if (app.getFlagBool('notify') && (ramPct > 90 || disk.percent > 90)) {
    sys.notify('Sentinel Alert', `High resource utilization: RAM ${ramPct}%, Disk ${disk.percent}%`);
  }
}

const intervalSec = app.getFlagInt('interval');
renderSnapshot();
if (intervalSec > 0) {
  setInterval(() => {
    console.log('');
    renderSnapshot();
  }, intervalSec * 1000);
}
