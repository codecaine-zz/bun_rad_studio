#!/usr/bin/env bun
/**
 * System & Package Workstation CLI
 * Zero Homebrew reliance -- Pure native Bun & Node subsystem hardware telemetry and package inspector
 */
import { SimpleCLI } from '../src/index.ts';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { join } from 'node:path';

const app = SimpleCLI.newApp('system-cli', '1.0.0')
  .setDescription('Hardware Telemetry, Bun Global Cache & Package Registry Inspector');

app.addFlagBool('telemetry', 't', false, 'Display full hardware and memory telemetry');
app.addFlagBool('cache', 'c', false, 'Inspect Bun global package cache footprint');
app.addFlagString('search', 's', '', 'Search packages on npm/bun registry');
app.addFlagBool('json', 'j', false, 'Output telemetry or search results in JSON format');

if (!app.parseCli()) process.exit(0);

app.banner('System & Package Workstation CLI', 'v1.0.0 - Hardware Telemetry & Registry Explorer');

const totalMem = os.totalmem();
const freeMem = os.freemem();
const usedMem = totalMem - freeMem;
const cpus = os.cpus();
const uptimeHours = (os.uptime() / 3600).toFixed(1);

const telemetryData = {
  platform: `${os.type()} ${os.release()} (${os.arch()})`,
  hostname: os.hostname(),
  cpus: `${cpus.length}x ${cpus[0]?.model || 'Generic CPU'}`,
  totalMemoryMb: Math.round(totalMem / (1024 * 1024)),
  usedMemoryMb: Math.round(usedMem / (1024 * 1024)),
  freeMemoryMb: Math.round(freeMem / (1024 * 1024)),
  memoryUsagePct: ((usedMem / totalMem) * 100).toFixed(1) + '%',
  uptimeHours: `${uptimeHours} hours`,
  bunVersion: Bun.version,
  nodeCompatVersion: process.version,
};

async function inspectBunCache() {
  const cacheDir = join(os.homedir(), '.bun', 'install', 'cache');
  let exists = fs.existsSync(cacheDir);
  let totalSize = 0;
  let fileCount = 0;

  if (exists) {
    try {
      const files = fs.readdirSync(cacheDir);
      fileCount = files.length;
      for (const f of files.slice(0, 500)) {
        try {
          const st = fs.statSync(join(cacheDir, f));
          totalSize += st.size;
        } catch {}
      }
    } catch {}
  }

  const cacheMb = (totalSize / (1024 * 1024)).toFixed(2);
  return { cacheDir, exists, fileCount, approximateSizeMb: cacheMb };
}

async function searchRegistry(query: string) {
  app.info(`Searching npm/bun registry for "${query}"...`);
  try {
    const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`);
    if (!res.ok) throw new Error(`Registry responded with HTTP ${res.status}`);
    const data = await res.json() as any;
    const objects = data.objects || [];
    return objects.map((item: any) => ({
      name: item.package.name,
      version: item.package.version,
      description: (item.package.description || '').slice(0, 60),
      author: item.package.publisher?.username || item.package.author?.name || 'Unknown',
      date: (item.package.date || '').slice(0, 10),
    }));
  } catch (err: any) {
    app.error(`Registry search failed: ${err.message}`);
    return [];
  }
}

async function main() {
  const isJson = app.getFlagBool('json');
  const searchQ = app.getFlagString('search');
  const checkCache = app.getFlagBool('cache');

  if (searchQ) {
    const results = await searchRegistry(searchQ);
    if (isJson) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      app.success(`Found ${results.length} packages:`);
      app.table(
        ['Package Name', 'Version', 'Publisher', 'Updated', 'Description'],
        results.map((r: any) => [r.name, r.version, r.author, r.date, r.description])
      );
    }
    return;
  }

  if (checkCache) {
    const c = await inspectBunCache();
    if (isJson) {
      console.log(JSON.stringify(c, null, 2));
    } else {
      app.panel('Bun Global Module Cache', `Location: ${c.cacheDir}`);
      app.printKv({
        'Directory Exists': c.exists ? app.green('Yes') : app.red('No'),
        'Cached Tarballs': `${c.fileCount} packages`,
        'Disk Allocation': `${c.approximateSizeMb} MB (sample)`,
      });
    }
    return;
  }

  // Default: Telemetry
  if (isJson) {
    console.log(JSON.stringify(telemetryData, null, 2));
  } else {
    app.panel('Hardware & System Telemetry', 'Subsystem readings via native node:os');
    app.printKv({
      'Operating System': telemetryData.platform,
      'Hostname': telemetryData.hostname,
      'CPU Topology': telemetryData.cpus,
      'System Memory': `${telemetryData.usedMemoryMb} MB / ${telemetryData.totalMemoryMb} MB (${telemetryData.memoryUsagePct})`,
      'System Uptime': telemetryData.uptimeHours,
      'Bun Engine': `v${telemetryData.bunVersion}`,
      'Node Engine': telemetryData.nodeCompatVersion,
    });
  }
}

main();
