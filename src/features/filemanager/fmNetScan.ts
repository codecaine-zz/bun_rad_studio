/**
 * Port scans and TCP pings. Both run as background tasks: starting one returns at once with an id, the page asks
 * for progress with `status` and can `cancel`. At most two run at a time, a scan has a total time cap, and
 * cancelling (or stopping the server) closes every socket the task had open.
 */
import { scanResultsToCsv, serviceName, summarizeLatencies } from "../../network_tools";
import { FmError } from "./fmPaths";
import {
  NET_LIMITS, TOP_PORTS, addActivity, clampInt, clampTimeout, connectTarget, describeNetError, netState, parsePorts, pushLog, sleep, tcpConnect, timeout, validateHost, validatePort,
  type NetState, type NetTask, type ScanRow,
} from "./fmNetCore";
import type { FmContext } from "./fmCore";

function runningCount(state: NetState): number {
  let n = 0;
  for (const t of state.tasks.values()) if (t.state === "running") n++;
  return n;
}

function register(state: NetState, kind: NetTask["kind"], mode: string, host: string, port: number | null, total: number): NetTask {
  if (runningCount(state) >= NET_LIMITS.maxRunningTasks) throw new FmError("BUSY", `${NET_LIMITS.maxRunningTasks} checks are already running. Wait for one to finish or cancel it first.`);
  const finished = [...state.tasks.values()].filter((t) => t.state !== "running");
  for (const old of finished.slice(0, Math.max(0, finished.length - NET_LIMITS.maxFinishedTasks + 1))) state.tasks.delete(old.id);
  const task: NetTask = {
    id: `t${++state.taskCounter}`, kind, mode, host, port, total, done: 0, state: "running", startedAt: Date.now(), endedAt: null, results: [], samples: [], log: [],
    summary: "", headline: "", error: null, stoppedEarly: null, abort: new AbortController(), finished: Promise.resolve(), peakInFlight: 0,
  };
  state.tasks.set(task.id, task);
  return task;
}

const countOf = (task: NetTask, status: ScanRow["status"]) => task.results.filter((r) => r.status === status).length;

function finish(task: NetTask, state: NetTask["state"]): void {
  task.state = state;
  task.endedAt = Date.now();
}

/** Last resort: an unexpected problem ends the task with a message instead of leaving it "running" for ever. */
function failTask(task: NetTask, err: unknown): void {
  task.error = { code: "UNKNOWN", message: `The check stopped unexpectedly: ${(err as Error)?.message ?? "unknown problem"}` };
  finish(task, "error");
}

// ---------------------------------------------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------------------------------------------

export type ScanRequest = Record<string, unknown>;

export function startScan(ctx: FmContext, req: ScanRequest): NetTask {
  const host = validateHost(req.host);
  const mode = req.mode === undefined ? "single" : req.mode;
  let ports: number[];
  if (mode === "single") ports = [validatePort(req.port)];
  else if (mode === "top") ports = TOP_PORTS.map((p) => p.port);
  else if (mode === "list") ports = parsePorts(req.ports);
  else throw new FmError("BAD_MODE", 'The scan mode must be "single", "top" or "list".');
  const timeoutMs = clampTimeout(req.timeoutMs, NET_LIMITS.scanTimeoutMs);
  const concurrency = clampInt(req.concurrency, 1, NET_LIMITS.maxConcurrency, NET_LIMITS.defaultConcurrency);

  const state = netState(ctx);
  if (state.disposed) throw new FmError("STOPPED", "The File Manager is closing.");
  const task = register(state, "scan", String(mode), host, mode === "single" ? ports[0]! : null, ports.length);
  task.finished = runScan(state, task, connectTarget(host), ports, timeoutMs, concurrency).catch((err) => failTask(task, err));
  return task;
}

async function runScan(state: NetState, task: NetTask, target: string, ports: number[], timeoutMs: number, concurrency: number): Promise<void> {
  const verbose = ports.length <= 20;
  pushLog(task.log, "info", `Checking ${ports.length} port${ports.length === 1 ? "" : "s"} on ${task.host} (up to ${Math.min(concurrency, ports.length)} at a time, ${timeoutMs} ms each)...`);
  const stopCap = timeout(state, () => {
    task.stoppedEarly = "time-limit";
    task.abort.abort();
  }, NET_LIMITS.scanTimeCapMs);
  let next = 0;
  let inFlight = 0;
  const problem: { value: NetTask["error"] } = { value: null };
  const worker = async () => {
    while (!task.abort.signal.aborted) {
      const index = next++;
      if (index >= ports.length) return;
      const port = ports[index]!;
      inFlight++;
      task.peakInFlight = Math.max(task.peakInFlight, inFlight);
      const result = await tcpConnect(state, target, port, timeoutMs, task.abort.signal);
      inFlight--;
      if (result.status === "CANCELLED") return;
      if (result.status === "NAME_ERROR") {
        problem.value = describeNetError(result.code, task.host);
        addActivity(state, "scan", `${task.host}:${port}`, "name not found", result.latencyMs);
        task.stoppedEarly = "unreachable";
        task.abort.abort();
        return;
      }
      const status: ScanRow["status"] = result.status === "OPEN" ? "OPEN" : result.status === "TIMEOUT" ? "TIMEOUT" : "CLOSED";
      const row: ScanRow = { port, service: serviceName(port), status, latencyMs: result.latencyMs, ...(result.code ? { code: result.code } : {}) };
      task.results.push(row);
      task.done++;
      addActivity(state, "scan", `${task.host}:${port}`, status === "OPEN" ? "open" : status === "CLOSED" ? "closed" : "no answer", result.latencyMs);
      if (status === "OPEN") pushLog(task.log, "ok", `Port ${port} (${row.service}) is open - ${row.latencyMs} ms`);
      else if (verbose) pushLog(task.log, status === "CLOSED" ? "info" : "warn", `Port ${port} (${row.service}) is ${status === "CLOSED" ? "closed" : "not answering"}`);
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, ports.length) }, worker));
  } finally {
    stopCap();
  }
  const open = countOf(task, "OPEN");
  const closed = countOf(task, "CLOSED");
  const quiet = countOf(task, "TIMEOUT");
  const elapsed = Date.now() - task.startedAt;
  const took = elapsed < 1000 ? `${elapsed} ms` : `${(elapsed / 1000).toFixed(1)} s`;
  if (problem.value) {
    task.error = problem.value;
    finish(task, "error");
    pushLog(task.log, "error", problem.value.message);
    task.summary = "The scan stopped: the computer could not be found.";
  } else if (task.stoppedEarly === "time-limit") {
    finish(task, "done");
    task.summary = `Stopped after ${NET_LIMITS.scanTimeCapMs / 1000} seconds (the time limit). Checked ${task.done} of ${ports.length} ports: ${open} open.`;
    pushLog(task.log, "warn", task.summary);
  } else if (task.abort.signal.aborted) {
    task.stoppedEarly = task.stoppedEarly ?? "cancelled";
    finish(task, "cancelled");
    task.summary = `Cancelled. Checked ${task.done} of ${ports.length} ports before stopping: ${open} open.`;
    pushLog(task.log, "warn", task.summary);
  } else {
    finish(task, "done");
    task.summary = `Checked ${ports.length} port${ports.length === 1 ? "" : "s"} on ${task.host} in ${took}: ${open} open, ${closed} closed, ${quiet} with no answer.`;
    pushLog(task.log, "ok", task.summary);
  }
  const only = task.results[0];
  if (task.mode === "single" && only) task.headline = portSentence(only);
  else if (open > 0 && task.state === "done") task.headline = `${open} open port${open === 1 ? "" : "s"} found: ${task.results.filter((r) => r.status === "OPEN").map((r) => r.port).join(", ")}.`;
  else if (task.state === "done") task.headline = "No open ports were found.";
}

export function portSentence(r: ScanRow): string {
  const what = r.service !== "Custom" ? ` (usually ${r.service})` : "";
  if (r.status === "OPEN") return `Port ${r.port} is open: something is listening there${what}.`;
  if (r.status === "CLOSED") return `Port ${r.port} is closed: the computer answered, but nothing is listening there.`;
  return `Port ${r.port} gave no answer in time: a firewall may be blocking it, or the computer is off or unreachable.`;
}

// ---------------------------------------------------------------------------------------------------------------
// TCP ping
// ---------------------------------------------------------------------------------------------------------------

export function startPing(ctx: FmContext, req: Record<string, unknown>): NetTask {
  const host = validateHost(req.host);
  const port = validatePort(req.port ?? 443);
  const count = clampInt(req.count, 1, NET_LIMITS.maxPingCount, NET_LIMITS.defaultPingCount);
  const timeoutMs = clampTimeout(req.timeoutMs, 1000);
  const state = netState(ctx);
  if (state.disposed) throw new FmError("STOPPED", "The File Manager is closing.");
  const task = register(state, "ping", "ping", host, port, count);
  task.finished = runPing(state, task, connectTarget(host), port, count, timeoutMs).catch((err) => failTask(task, err));
  return task;
}

async function runPing(state: NetState, task: NetTask, target: string, port: number, count: number, timeoutMs: number): Promise<void> {
  pushLog(task.log, "info", `Timing ${count} connections to ${task.host}:${port}...`);
  for (let i = 0; i < count && !task.abort.signal.aborted; i++) {
    const r = await tcpConnect(state, target, port, timeoutMs, task.abort.signal);
    if (r.status === "CANCELLED") break;
    if (r.status === "NAME_ERROR") {
      task.error = describeNetError(r.code, task.host);
      pushLog(task.log, "error", task.error.message);
      addActivity(state, "ping", `${task.host}:${port}`, "name not found", r.latencyMs);
      break;
    }
    const ms = r.status === "OPEN" ? r.latencyMs : null;
    task.samples.push(ms);
    task.done++;
    addActivity(state, "ping", `${task.host}:${port}`, ms === null ? (r.status === "CLOSED" ? "refused" : "no answer") : "connected", r.latencyMs);
    pushLog(task.log, ms === null ? "warn" : "ok", ms === null ? `Connection ${i + 1}: no reply (${r.status === "CLOSED" ? "refused" : "timed out"})` : `Connection ${i + 1}: ${ms} ms`);
    if (i < count - 1) await sleep(state, 150, task.abort.signal);
  }
  const sum = summarizeLatencies(task.samples);
  if (task.error) {
    finish(task, "error");
    task.summary = "The ping stopped: the computer could not be found.";
  } else if (task.abort.signal.aborted) {
    task.stoppedEarly = "cancelled";
    finish(task, "cancelled");
    task.summary = `Cancelled after ${task.samples.length} of ${count} connections.`;
  } else {
    finish(task, "done");
    task.summary = sum.received === 0
      ? `No replies from ${task.host}:${port}. It may be off, offline, or blocked by a firewall.`
      : `${sum.received} of ${sum.sent} connections worked. Average ${sum.avg} ms${sum.lossPct > 0 ? `, ${sum.lossPct}% lost` : ", nothing lost"}.`;
  }
  task.headline = task.summary;
  pushLog(task.log, task.state === "done" && sum.received > 0 ? "ok" : "warn", task.summary);
}

// ---------------------------------------------------------------------------------------------------------------
// Progress and cancel
// ---------------------------------------------------------------------------------------------------------------

export function snapshot(task: NetTask, logFrom = 0, resultFrom = 0) {
  const sum = task.kind === "ping" ? summarizeLatencies(task.samples) : null;
  return {
    id: task.id, kind: task.kind, mode: task.mode, host: task.host, port: task.port, state: task.state,
    total: task.total, done: task.done,
    counts: { open: countOf(task, "OPEN"), closed: countOf(task, "CLOSED"), timeout: countOf(task, "TIMEOUT") },
    startedAt: task.startedAt, elapsedMs: (task.endedAt ?? Date.now()) - task.startedAt,
    resultFrom, resultCount: task.results.length, results: task.results.slice(resultFrom),
    logFrom, logCount: task.log.length, log: task.log.slice(logFrom),
    samples: task.samples, stats: sum,
    summary: task.summary, headline: task.headline, error: task.error, stoppedEarly: task.stoppedEarly,
  };
}

export function findTask(ctx: FmContext, id: unknown): NetTask {
  const task = typeof id === "string" ? netState(ctx).tasks.get(id) : undefined;
  if (!task) throw new FmError("NO_TASK", "That check isn't known any more. Start it again.");
  return task;
}

export function briefTasks(ctx: FmContext) {
  return [...netState(ctx).tasks.values()].map((t) => ({ id: t.id, kind: t.kind, mode: t.mode, host: t.host, state: t.state, done: t.done, total: t.total }));
}

/** Stops one running task (by id) or all of them, and waits until their sockets are closed. */
export async function cancelTasks(ctx: FmContext, id?: unknown): Promise<number> {
  const state = netState(ctx);
  const targets = id === undefined || id === null ? [...state.tasks.values()] : [findTask(ctx, id)];
  const running = targets.filter((t) => t.state === "running");
  for (const t of running) t.abort.abort();
  await Promise.all(running.map((t) => t.finished));
  return running.length;
}

export function scanCsv(task: NetTask): string {
  return scanResultsToCsv(task.host, [...task.results].sort((a, b) => a.port - b.port));
}
