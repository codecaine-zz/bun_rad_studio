#!/usr/bin/env bun
import { SimpleCLI, sys } from '../src/index.ts';

const app = SimpleCLI.newApp('docker-cli', '1.0.0')
  .setDescription('Docker Container & Image Management Dashboard');

app.addFlagBool('ps', 'p', false, 'List running containers');
app.addFlagBool('images', 'i', false, 'List local container images');
app.addFlagBool('prune', 'c', false, 'Clean up dangling containers and caches');

if (!app.parseCli()) process.exit(0);

app.banner('Docker Terminal Pilot', 'v1.0.0 - Container Ecosystem Hub');

async function main() {
  const [dockerVer, code] = sys.exec('docker --version');
  if (code !== 0) {
    app.warn('Docker daemon or CLI not detected in system PATH.');
    return;
  }

  app.printKv({
    'Docker Version': dockerVer,
    'Host Daemon': sys.execOr('docker info --format "{{.ServerVersion}}"', 'Running'),
  });

  const [psOut] = sys.exec('docker ps --format "{{.ID}}	{{.Image}}	{{.Status}}	{{.Names}}"');
  if (psOut) {
    const rows = psOut.split('\n').map(l => l.split('\t'));
    app.step(1, 'Active Running Containers');
    app.table(['Container ID', 'Image', 'Status', 'Names'], rows);
  } else {
    app.info('No active containers currently running.');
  }
}

main();
