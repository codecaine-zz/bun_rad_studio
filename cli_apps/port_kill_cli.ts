#!/usr/bin/env bun
/**
 * Port Sentinel & Process Killer CLI
 * Inspects listening TCP network ports and terminates stuck developer processes
 */

import { SimpleCLI, Sys, Ansi, AlertKind } from '../src/index.ts';

const app = SimpleCLI.newApp('port_kill_cli', '1.0.0')
  .setDescription('Inspect active listening network ports and terminate stuck dev processes');

app.addFlagInt('port', 'p', 0, 'Target specific TCP port to inspect or kill');
app.addFlagBool('kill', 'k', false, 'Kill processes matching the specified port');
app.addFlagBool('force', 'f', false, 'Force kill (SIGKILL -9)');
app.addFlagBool('json', 'j', false, 'Output active listening ports as JSON');

if (!app.parseCli()) {
  process.exit(0);
}

interface PortEntry {
  port: number;
  pid: number;
  process: string;
  user: string;
  proto: string;
}

function getListeningPorts(): PortEntry[] {
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';
  const entries: PortEntry[] = [];

  try {
    if (isMac || isLinux) {
      const [out, code] = Sys.exec('lsof -iTCP -sTCP:LISTEN -P -n');
      if (code === 0) {
        const lines = out.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line) continue;
          const parts = line.split(/\s+/);
          if (parts.length >= 9) {
            const proc = parts[0] || 'unknown';
            const pid = parseInt(parts[1] || '0', 10);
            const user = parts[2] || 'unknown';
            const nameField = parts[8] || ''; // e.g. *:3000 or 127.0.0.1:8080
            const portMatch = nameField.match(/:(\d+)$/);
            if (portMatch && portMatch[1]) {
              const port = parseInt(portMatch[1], 10);
              entries.push({ port, pid, process: proc, user, proto: 'TCP' });
            }
          }
        }
      }
    }
  } catch {
    // Fallback empty
  }

  // Deduplicate by port + pid
  const unique = new Map<string, PortEntry>();
  for (const e of entries) {
    unique.set(`${e.port}-${e.pid}`, e);
  }

  return Array.from(unique.values()).sort((a, b) => a.port - b.port);
}

const ports = getListeningPorts();
const targetPort = app.getFlagInt('port');
const shouldKill = app.getFlagBool('kill');
const force = app.getFlagBool('force');

if (app.getFlagBool('json')) {
  app.output(targetPort > 0 ? ports.filter(p => p.port === targetPort) : ports);
  process.exit(0);
}

app.banner('Port Sentinel & Process Killer', 'Zero-Dependency Dev Server & Network Process Manager');

if (ports.length === 0) {
  app.alert(AlertKind.INFO, 'Network Clean', 'No active listening TCP ports detected.');
  process.exit(0);
}

if (targetPort > 0) {
  const matching = ports.filter(p => p.port === targetPort);
  if (matching.length === 0) {
    app.alert(AlertKind.WARNING, 'Port Free', `No active process found listening on port ${targetPort}.`);
    process.exit(0);
  }

  const rows = matching.map(m => [`:${m.port}`, m.pid, m.process, m.user, m.proto]);
  app.table(['Port', 'PID', 'Process', 'User', 'Protocol'], rows);

  if (shouldKill) {
    for (const m of matching) {
      try {
        process.kill(m.pid, force ? 'SIGKILL' : 'SIGTERM');
        app.println(`  ${Ansi.green('✔')} Terminated process ${Ansi.bold(m.process)} (PID ${m.pid}) on port :${m.port}`);
      } catch (err: any) {
        app.println(`  ${Ansi.red('✖')} Failed killing PID ${m.pid}: ${err.message}`);
      }
    }
  }
} else {
  const rows = ports.map(m => [`:${m.port}`, m.pid, m.process, m.user, m.proto]);
  app.table(['Port', 'PID', 'Process', 'User', 'Protocol'], rows);

  (async () => {
    const choices = ports.map(p => `:${p.port} - ${p.process} (PID: ${p.pid}, user: ${p.user})`);
    choices.push('Cancel / Exit');

    const selected = await app.select('Select a process to terminate:', choices);
    if (!selected || selected === 'Cancel / Exit') {
      process.exit(0);
    }

    const match = ports.find(p => selected.includes(`:${p.port}`) && selected.includes(`(PID: ${p.pid}`));
    if (match) {
      const confirmKill = await app.confirm(`Are you sure you want to kill ${match.process} (PID ${match.pid}) on port :${match.port}?`, true);
      if (confirmKill) {
        try {
          process.kill(match.pid, 'SIGTERM');
          app.println(`\n${Ansi.green('✔')} Successfully killed ${Ansi.bold(match.process)} (PID ${match.pid}) on port :${match.port}`);
        } catch (err: any) {
          app.println(`\n${Ansi.red('✖')} Error killing PID ${match.pid}: ${err.message}`);
        }
      }
    }
  })();
}
