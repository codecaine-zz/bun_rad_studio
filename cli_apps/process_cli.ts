#!/usr/bin/env bun
/**
 * Process Monitor Studio CLI
 * Real-time macOS process manager, activity inspector, and signal controller
 */
import { SimpleCLI } from '../src/index.ts';

const app = SimpleCLI.newApp('process-cli', '1.0.0')
  .setDescription('Native macOS Process Explorer, Resource Monitor & Process Controller');

app.addFlagString('filter', 'f', '', 'Filter processes by name or command substring (e.g. bun, node, chrome)');
app.addFlagString('sort', 's', 'cpu', 'Sort by: cpu, mem, pid, user');
app.addFlagInt('limit', 'n', 20, 'Maximum number of processes to display');
app.addFlagString('kill', 'k', '', 'PID to terminate with signal');
app.addFlagString('signal', 'S', 'SIGTERM', 'Signal to send (SIGTERM, SIGKILL, SIGHUP)');
app.addFlagBool('json', 'j', false, 'Output process table as JSON');

if (!app.parseCli()) process.exit(0);

const killPid = app.getFlagString('kill');
const signal = app.getFlagString('signal').toUpperCase();

if (killPid) {
  const pidNum = parseInt(killPid, 10);
  if (isNaN(pidNum) || pidNum <= 1) {
    app.error(`Invalid PID ${killPid}. System PIDs <= 1 cannot be terminated.`);
    process.exit(1);
  }

  try {
    process.kill(pidNum, signal as any);
    app.success(`Sent signal ${signal} to process PID ${pidNum}`);
  } catch (err: any) {
    app.error(`Failed to kill PID ${pidNum}: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

app.banner('Process Monitor Studio CLI', 'v1.0.0 - Activity Telemetry & Process Controller');

async function getProcesses() {
  const proc = Bun.spawn(['ps', '-eo', 'pid,user,%cpu,%mem,rss,comm'], {
    stdout: 'pipe',
  });
  const text = await new Response(proc.stdout).text();
  const lines = text.trim().split('\n').slice(1);

  const filter = app.getFlagString('filter').toLowerCase();
  const list = lines.map(line => {
    const parts = line.trim().split(/\s+/);
    const pid = parts[0] || '';
    const user = parts[1] || '';
    const cpu = parseFloat(parts[2] || '0');
    const memPct = parseFloat(parts[3] || '0');
    const rssKb = parseInt(parts[4] || '0', 10);
    const comm = parts.slice(5).join(' ');
    const rssMb = (rssKb / 1024).toFixed(1);
    return { pid, user, cpu, memPct, rssMb, comm };
  }).filter(p => {
    if (!filter) return true;
    return p.comm.toLowerCase().includes(filter) || p.user.toLowerCase().includes(filter) || p.pid.includes(filter);
  });

  const sortMode = app.getFlagString('sort').toLowerCase();
  list.sort((a, b) => {
    if (sortMode === 'mem') return parseFloat(b.rssMb) - parseFloat(a.rssMb);
    if (sortMode === 'pid') return parseInt(b.pid, 10) - parseInt(a.pid, 10);
    if (sortMode === 'user') return a.user.localeCompare(b.user);
    return b.cpu - a.cpu; // default cpu
  });

  return list.slice(0, app.getFlagInt('limit') || 20);
}

async function main() {
  const list = await getProcesses();
  const isJson = app.getFlagBool('json');

  if (isJson) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }

  app.info(`Top ${list.length} processes (Sorted by: ${app.getFlagString('sort').toUpperCase()}):`);
  app.table(
    ['PID', 'USER', '%CPU', 'MEM (MB)', 'COMMAND'],
    list.map(p => [p.pid, p.user, `${p.cpu}%`, `${p.rssMb} MB`, p.comm.slice(0, 50)])
  );
}

main();
