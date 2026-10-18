#!/usr/bin/env bun
/**
 * Task Watcher CLI -- Continuous File Watcher & Automated Command Runner
 * Powered by native node:fs.watch and Bun.spawn with zero external watcher binaries
 */
import { SimpleCLI } from '../src/index.ts';
import { watch, existsSync, type FSWatcher } from 'node:fs';
import { resolve } from 'node:path';

const app = SimpleCLI.newApp('watcher-cli', '1.0.0')
  .setDescription('Native Recursive File Watcher & Automated Task Trigger');

app.addFlagString('path', 'p', './src', 'Directory to watch for file changes');
app.addFlagString('exec', 'x', 'bun test', 'Command to execute on file change');
app.addFlagString('ext', 'e', 'ts,js,json,html,css', 'Comma-separated file extensions to monitor');
app.addFlagString('ignore', 'i', 'node_modules,.git,dist,.temp', 'Comma-separated ignore patterns');
app.addFlagInt('debounce', 'd', 200, 'Debounce time in milliseconds');
app.addFlagBool('once', '1', false, 'Execute command once immediately and exit without watching');

if (!app.parseCli()) process.exit(0);

const rawPath = app.getFlagString('path');
const targetDir = resolve(process.cwd(), rawPath);
const execCmd = app.getFlagString('exec');
const debounceMs = app.getFlagInt('debounce') || 200;
const onceMode = app.getFlagBool('once');

const exts = new Set(
  app.getFlagString('ext')
    .split(',')
    .map(e => e.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)
);

const ignoreList = app.getFlagString('ignore')
  .split(',')
  .map(i => i.trim())
  .filter(Boolean);

app.banner('Task Watcher CLI', 'v1.0.0 - Native Continuous Build & Test Watcher');

async function runTask(triggerFile?: string) {
  const ts = new Date().toLocaleTimeString();
  if (triggerFile) {
    app.info(`[${ts}] Change detected: ${triggerFile} -> Executing: "${execCmd}"`);
  } else {
    app.info(`[${ts}] Running command: "${execCmd}"`);
  }

  const start = performance.now();
  try {
    const parts = execCmd.split(' ');
    const proc = Bun.spawn(parts, {
      stdout: 'inherit',
      stderr: 'inherit',
      env: process.env,
    });
    const exitCode = await proc.exited;
    const elapsed = (performance.now() - start).toFixed(2);
    if (exitCode === 0) {
      app.success(`Command completed with exit code 0 in ${elapsed}ms`);
    } else {
      app.error(`Command failed with exit code ${exitCode} in ${elapsed}ms`);
    }
  } catch (err: any) {
    app.error(`Failed to spawn process: ${err.message}`);
  }
}

async function main() {
  if (onceMode) {
    await runTask();
    process.exit(0);
  }

  if (!existsSync(targetDir)) {
    app.error(`Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  app.panel('Watcher Configuration', `Monitoring: ${targetDir}`);
  app.printKv({
    'Target Directory': targetDir,
    'Trigger Command': execCmd,
    'Extensions': Array.from(exts).join(', '),
    'Debounce': `${debounceMs}ms`,
    'Status': app.green('Active (Press Ctrl+C to terminate)'),
  });

  // Run initial trigger
  await runTask();

  let debounceTimer: Timer | null = null;

  try {
    const watcher: FSWatcher = watch(targetDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;

      for (const ig of ignoreList) {
        if (filename.includes(ig)) return;
      }

      const parts = filename.split('.');
      const fileExt = parts.length > 1 ? parts.pop()?.toLowerCase() : '';
      if (fileExt && !exts.has(fileExt)) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        runTask(filename);
      }, debounceMs);
    });

    process.on('SIGINT', () => {
      watcher.close();
      console.log('\n');
      app.info('Watcher stopped safely.');
      process.exit(0);
    });
  } catch (err: any) {
    app.error(`Watcher failure: ${err.message}`);
    process.exit(1);
  }
}

main();
