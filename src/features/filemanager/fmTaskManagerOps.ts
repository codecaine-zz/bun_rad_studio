/**
 * API operations for the Process & Task Manager power tool (`tasks/...`).
 *
 * Dispatches platform-specific actions for Windows (`win32`) vs *nix (`darwin`, `linux`),
 * enforces critical process safety checks, requires explicit confirmation (`confirm: true`)
 * for destructive or multi-process operations, and exports snapshots without overwriting files.
 */
import { promises as fsp } from "fs";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { FmError, uniqueName, validateName } from "./fmPaths";
import {
  ancestorsOf,
  assessTaskAction,
  buildProcessActionCommand,
  buildProcessTree,
  collectTaskSnapshot,
  defaultExecCommand,
  descendantsOf,
  findRogueDevServers,
  groupProcesses,
  inspectTaskProcess,
  processesToCsv,
  processesToJson,
  processesToMarkdown,
  processesToTsv,
  validPort,
  type TaskActionKind,
  type TaskProcessItem,
} from "./fmTaskManager";

const VALID_ACTIONS: readonly TaskActionKind[] = [
  "terminate",
  "kill",
  "suspend",
  "resume",
  "reload",
  "tree",
  "group",
  "priority",
];

const EXPORT_FORMATS = ["csv", "json", "tsv", "md"] as const;
type TaskExportFormat = (typeof EXPORT_FORMATS)[number];

function parseExportFormat(raw: unknown): TaskExportFormat {
  if (typeof raw === "string" && (EXPORT_FORMATS as readonly string[]).includes(raw)) {
    return raw as TaskExportFormat;
  }
  throw new FmError("BAD_FORMAT", "Choose CSV, JSON, TSV, or Markdown.");
}

function renderTaskExport(procs: TaskProcessItem[], format: TaskExportFormat, platform: FmContext["platform"]): string {
  switch (format) {
    case "csv":
      return processesToCsv(procs);
    case "tsv":
      return processesToTsv(procs);
    case "md":
      return processesToMarkdown(procs, platform);
    case "json":
      return processesToJson(procs, { platform });
  }
}

async function writeUniqueReport(
  ctx: FmContext,
  folderInput: unknown,
  baseName: string,
  ext: string,
  content: string,
): Promise<{ path: string; name: string }> {
  const folder = absolutePath(ctx, folderInput);
  await assertFolder(folder, "That folder");
  assertCreatable(ctx, folder);
  const p = pathApi(ctx);
  const safeBase = baseName.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "processes";
  const wanted = `${safeBase}.${ext}`;
  const problem = validateName(wanted, ctx.platform);
  if (problem) throw new FmError("BAD_NAME", problem);
  const existing = new Set(await fsp.readdir(folder));
  for (let attempt = 0; attempt < 20; attempt++) {
    const name = uniqueName(wanted, (n) => existing.has(n));
    const full = p.join(folder, name);
    try {
      await fsp.writeFile(full, content, { flag: "wx" });
      return { path: full, name };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
      existing.add(name);
    }
  }
  throw new FmError("EXISTS", "Couldn't find a free file name in that folder.");
}

export const taskManagerOperations: Record<string, FmHandler> = {
  async "tasks/list"(ctx) {
    const snap = await collectTaskSnapshot(ctx.platform, ctx.tasks);
    return {
      platform: snap.platform,
      profile: snap.profile,
      processes: snap.processes,
      groups: groupProcesses(snap.processes),
      tree: buildProcessTree(snap.processes),
      telemetry: snap.telemetry,
      selfPid: snap.selfPid,
      parentPid: snap.parentPid,
      currentUser: snap.currentUser,
    };
  },

  async "tasks/inspect"(ctx, b) {
    const pid = String(b.pid ?? "").trim();
    if (!/^\d+$/.test(pid)) throw new FmError("BAD_REQUEST", "Provide a valid numeric PID to inspect.");
    return await inspectTaskProcess(pid, ctx.platform, ctx.tasks);
  },

  async "tasks/action"(ctx, b) {
    const pid = String(b.pid ?? "").trim();
    const action = String(b.action ?? "") as TaskActionKind;
    if (!VALID_ACTIONS.includes(action)) {
      throw new FmError("BAD_REQUEST", "Choose a valid process action.");
    }
    const snap = await collectTaskSnapshot(ctx.platform, ctx.tasks);
    const proc = snap.processes.find((p) => p.pid === pid);
    const safetyCtx = {
      platform: ctx.platform,
      selfPid: snap.selfPid,
      parentPid: snap.parentPid,
      currentUser: snap.currentUser,
    };
    const assessment = assessTaskAction(proc, pid, action, safetyCtx);
    if (!assessment.allowed) {
      throw new FmError("PROTECTED", assessment.reason || "That process cannot be modified.");
    }
    if (assessment.confirm && b.confirm !== true) {
      throw new FmError("NEEDS_CONFIRM", assessment.confirm, {
        pid,
        action,
        name: proc?.name ?? `PID ${pid}`,
      });
    }

    const exec = ctx.tasks?.execCommand ?? defaultExecCommand;

    if (action === "tree") {
      const descendants = descendantsOf(snap.processes, pid);
      if (ctx.platform === "win32") {
        // Windows has native kernel-level process tree termination via `taskkill /T /F /PID`
        const cmd = buildProcessActionCommand("win32", "tree", pid);
        const res = await exec(cmd, "win32");
        if (res.exitCode !== 0) {
          throw new FmError("ACTION_FAILED", (res.stderr || res.stdout || "taskkill /T /F failed.").trim());
        }
        return {
          ok: true,
          action,
          platform: ctx.platform,
          pid,
          affectedPids: [...descendants, pid],
          command: cmd.join(" "),
          message: `Ended process tree for ${proc?.name ?? "PID"} (${pid}) and ${descendants.length} child process${descendants.length === 1 ? "" : "es"} via taskkill /T /F.`,
        };
      }
      // *nix: walk descendants deepest-first, then the root process
      const targets = [...descendants, pid];
      const stopped: string[] = [];
      for (const tPid of targets) {
        if (tPid === snap.selfPid || tPid === "1") continue;
        const cmd = buildProcessActionCommand(ctx.platform, "terminate", tPid);
        const res = await exec(cmd, ctx.platform);
        if (res.exitCode === 0) stopped.push(tPid);
      }
      return {
        ok: true,
        action,
        platform: ctx.platform,
        pid,
        affectedPids: stopped,
        command: `kill -15 ${targets.join(" ")}`,
        message: `Sent SIGTERM to ${stopped.length} process${stopped.length === 1 ? "" : "es"} in tree of ${proc?.name ?? pid}.`,
      };
    }

    if (action === "group") {
      if (!proc) throw new FmError("NOT_FOUND", `Process PID ${pid} is no longer running.`);
      const protectedSet = new Set([snap.selfPid, snap.parentPid, ...ancestorsOf(snap.processes, snap.selfPid)]);
      const peers = snap.processes.filter(
        (p) => p.name === proc.name && !protectedSet.has(p.pid) && !p.isCritical,
      );
      if (peers.length === 0) {
        throw new FmError("PROTECTED", `No safe instances of "${proc.name}" can be stopped.`);
      }
      const stopped: string[] = [];
      for (const peer of peers) {
        const subAction = ctx.platform === "win32" ? "kill" : "terminate";
        const cmd = buildProcessActionCommand(ctx.platform, subAction, peer.pid);
        const res = await exec(cmd, ctx.platform);
        if (res.exitCode === 0) stopped.push(peer.pid);
      }
      return {
        ok: true,
        action,
        platform: ctx.platform,
        pid,
        affectedPids: stopped,
        message: `Stopped ${stopped.length} of ${peers.length} "${proc.name}" process${peers.length === 1 ? "" : "es"}.`,
      };
    }

    const cmd = buildProcessActionCommand(ctx.platform, action, pid);
    const res = await exec(cmd, ctx.platform);
    if (res.exitCode !== 0) {
      throw new FmError(
        "ACTION_FAILED",
        (res.stderr || res.stdout || `Could not run ${action} on PID ${pid}.`).trim(),
      );
    }

    const actionSummary =
      action === "priority"
        ? ctx.platform === "win32"
          ? `Set ${proc?.name ?? `PID ${pid}`} priority to BelowNormal.`
          : `Lowered priority of ${proc?.name ?? `PID ${pid}`} (renice +10).`
        : ctx.platform === "win32"
          ? `Ended ${proc?.name ?? `PID ${pid}`} via ${cmd.join(" ")}.`
          : `Sent ${action} signal to ${proc?.name ?? `PID ${pid}`} (${cmd.join(" ")}).`;

    return {
      ok: true,
      action,
      platform: ctx.platform,
      pid,
      affectedPids: [pid],
      command: cmd.join(" "),
      message: actionSummary,
    };
  },

  async "tasks/kill-port"(ctx, b) {
    const port = validPort(b.port);
    if (!port) throw new FmError("BAD_REQUEST", "Enter a valid TCP port between 1 and 65535.");
    const snap = await collectTaskSnapshot(ctx.platform, ctx.tasks);
    const portTag = `:${port}`;
    const listeners = snap.processes.filter((p) => p.ports.includes(portTag));
    if (listeners.length === 0) {
      return {
        ok: true,
        port,
        killed: [],
        message: `No process is currently listening on TCP port ${port}.`,
      };
    }

    const safetyCtx = {
      platform: ctx.platform,
      selfPid: snap.selfPid,
      parentPid: snap.parentPid,
      currentUser: snap.currentUser,
    };
    for (const l of listeners) {
      const check = assessTaskAction(l, l.pid, "terminate", safetyCtx);
      if (!check.allowed) {
        throw new FmError("PROTECTED", check.reason || `Cannot stop listener ${l.name} (${l.pid}) on port ${port}.`);
      }
    }

    if (b.confirm !== true) {
      const listDesc = listeners.map((l) => `${l.name} (PID ${l.pid})`).join(", ");
      throw new FmError(
        "NEEDS_CONFIRM",
        `Stop ${listeners.length} process${listeners.length === 1 ? "" : "es"} listening on port :${port}?\n\n${listDesc}`,
        { port, listeners: listeners.map((l) => ({ pid: l.pid, name: l.name })) },
      );
    }

    const exec = ctx.tasks?.execCommand ?? defaultExecCommand;
    const killed: string[] = [];
    const force = b.force === true || ctx.platform === "win32";
    for (const l of listeners) {
      const cmd = buildProcessActionCommand(ctx.platform, force ? "kill" : "terminate", l.pid);
      const res = await exec(cmd, ctx.platform);
      if (res.exitCode === 0) killed.push(l.pid);
    }

    return {
      ok: true,
      port,
      killed,
      message: `Freed port :${port} by stopping ${killed.length} process${killed.length === 1 ? "" : "es"} (${listeners.map((l) => l.name).join(", ")}).`,
    };
  },

  async "tasks/clean-dev"(ctx, b) {
    const snap = await collectTaskSnapshot(ctx.platform, ctx.tasks);
    const safetyCtx = {
      platform: ctx.platform,
      selfPid: snap.selfPid,
      parentPid: snap.parentPid,
      currentUser: snap.currentUser,
    };
    const rogues = findRogueDevServers(snap.processes, safetyCtx);
    if (rogues.length === 0) {
      return {
        ok: true,
        cleaned: [],
        message: "No rogue or orphaned dev servers found.",
      };
    }

    if (b.confirm !== true) {
      const summary = rogues
        .map((r) => `• ${r.name} (PID ${r.pid}${r.ports.length ? `, ${r.ports.join(" ")}` : ""})`)
        .join("\n");
      throw new FmError(
        "NEEDS_CONFIRM",
        `Stop ${rogues.length} dev server process${rogues.length === 1 ? "" : "es"}?\n\n${summary}`,
        { count: rogues.length, pids: rogues.map((r) => r.pid) },
      );
    }

    const exec = ctx.tasks?.execCommand ?? defaultExecCommand;
    const cleaned: string[] = [];
    for (const r of rogues) {
      const cmd = buildProcessActionCommand(ctx.platform, ctx.platform === "win32" ? "kill" : "terminate", r.pid);
      const res = await exec(cmd, ctx.platform);
      if (res.exitCode === 0) cleaned.push(r.pid);
    }

    return {
      ok: true,
      cleaned,
      message: `Stopped ${cleaned.length} of ${rogues.length} dev server process${rogues.length === 1 ? "" : "es"}.`,
    };
  },

  async "tasks/export"(ctx, b) {
    const format = parseExportFormat(b.format);
    const snap = await collectTaskSnapshot(ctx.platform, ctx.tasks);
    const text = renderTaskExport(snap.processes, format, ctx.platform);
    return {
      format,
      count: snap.processes.length,
      text,
    };
  },

  async "tasks/save"(ctx, b) {
    const format = parseExportFormat(b.format);
    const snap = await collectTaskSnapshot(ctx.platform, ctx.tasks);
    const text = renderTaskExport(snap.processes, format, ctx.platform);
    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = typeof b.name === "string" && b.name.trim() ? b.name.trim() : `process-snapshot-${stamp}`;
    const saved = await writeUniqueReport(ctx, b.folder, baseName, format, text);
    return { ...saved, format, count: snap.processes.length };
  },
};
