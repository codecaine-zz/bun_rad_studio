#!/usr/bin/env bun
/**
 * System Information & Package Workstation CLI
 * Complete Cross-Platform Hardware Intelligence & Subsystem Telemetry
 * Powered by systeminformation (all 60 APIs) + Native Bun & Node Subsystems
 */
import { SimpleCLI } from '../src/index.ts';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { executeSiMethod, SI_METHODS, SI_CATEGORIES } from '../applications/system_studio.ts';

const app = SimpleCLI.newApp('system-cli', '2.0.0')
  .setDescription('Cross-Platform Hardware Telemetry, Subsystem Explorer & Package Registry Inspector');

app.addFlagBool('telemetry', 't', false, 'Display full hardware and memory telemetry');
app.addFlagBool('cache', 'c', false, 'Inspect Bun global package cache footprint');
app.addFlagString('search', 's', '', 'Search packages on npm/bun registry');
app.addFlagBool('json', 'j', false, 'Output telemetry or search results in JSON format');
app.addFlagString('method', 'm', '', 'Execute specific systeminformation method (e.g. cpu, mem, fsSize)');
app.addFlagString('category', 'C', '', 'Execute all methods in a system category');
app.addFlagString('param', 'p', '', 'Optional parameter for the method (URL, query, process)');
app.addFlagBool('audit', 'a', false, 'Run comprehensive full-system hardware and OS audit');
app.addFlagBool('list-apis', 'l', false, 'List all 60 supported systeminformation APIs');

if (!app.parseCli()) process.exit(0);

app.banner('System & Package Workstation CLI', 'v2.0.0 - Complete Cross-Platform Hardware Telemetry');

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
  const targetMethod = app.getFlagString('method');
  const targetCategory = app.getFlagString('category');
  const methodParam = app.getFlagString('param');
  const doAudit = app.getFlagBool('audit');
  const listApis = app.getFlagBool('list-apis');

  // 1. List APIs
  if (listApis) {
    if (isJson) {
      console.log(JSON.stringify(SI_METHODS, null, 2));
    } else {
      app.panel('Available SystemInformation APIs (60 Total)', 'Organized across 10 domain categories');
      for (const cat of SI_CATEGORIES) {
        const methodsInCat = Object.values(SI_METHODS).filter(m => m.category === cat);
        app.info(`📁 ${cat} (${methodsInCat.length} methods):`);
        app.table(
          ['Method', 'Description', 'Accepts Param'],
          methodsInCat.map(m => [m.name, m.description, m.acceptsParam ? 'Yes' : 'No'])
        );
      }
    }
    return;
  }

  // 2. Target Method Execution
  if (targetMethod) {
    const res = await executeSiMethod(targetMethod, methodParam || undefined);
    if (isJson) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      if (res.success) {
        app.success(`Executed '${res.method}' in ${res.elapsedMs}ms (${res.category}):`);
        console.log(JSON.stringify(res.data, null, 2));
      } else {
        app.error(`Execution failed for '${targetMethod}': ${res.error}`);
      }
    }
    return;
  }

  // 3. Category Execution
  if (targetCategory) {
    const methods = Object.values(SI_METHODS).filter(
      m => m.category.toLowerCase().includes(targetCategory.toLowerCase())
    );
    if (methods.length === 0) {
      app.error(`No category matching '${targetCategory}'. Use --list-apis to see available categories.`);
      return;
    }
    app.info(`Running ${methods.length} methods in category '${methods[0].category}'...`);
    const results: Record<string, any> = {};
    for (const m of methods) {
      const res = await executeSiMethod(m.name, m.defaultParam);
      results[m.name] = res.success ? res.data : { error: res.error };
    }
    if (isJson) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      app.success(`Category '${methods[0].category}' execution complete:`);
      console.log(JSON.stringify(results, null, 2));
    }
    return;
  }

  // 4. Comprehensive Full System Audit
  if (doAudit) {
    app.info('Running comprehensive system audit (getAllData)...');
    const res = await executeSiMethod('getAllData');
    if (isJson) {
      console.log(JSON.stringify(res.data, null, 2));
    } else {
      app.success(`Audit completed in ${res.elapsedMs}ms:`);
      console.log(JSON.stringify(res.data, null, 2));
    }
    return;
  }

  // 5. Registry Search
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

  // 6. Cache Check
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

  // 7. Default Hardware Telemetry
  if (isJson) {
    console.log(JSON.stringify(telemetryData, null, 2));
  } else {
    app.panel('Hardware & System Telemetry', 'Subsystem readings via systeminformation & native node:os');
    app.printKv({
      'Operating System': telemetryData.platform,
      'Hostname': telemetryData.hostname,
      'CPU Topology': telemetryData.cpus,
      'System Memory': `${telemetryData.usedMemoryMb} MB / ${telemetryData.totalMemoryMb} MB (${telemetryData.memoryUsagePct})`,
      'System Uptime': telemetryData.uptimeHours,
      'Bun Engine': `v${telemetryData.bunVersion}`,
      'Node Engine': telemetryData.nodeCompatVersion,
      'API Surface': '60 systeminformation methods available (run `system-cli -l`)',
    });
  }
}

main();
