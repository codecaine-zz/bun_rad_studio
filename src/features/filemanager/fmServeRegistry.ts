/**
 * The servers this File Manager session has started (live servers and PHP servers). Kept per File Manager server,
 * never saved: a server never survives a restart. At most MAX_SERVERS run at once, one per folder and kind,
 * and all of them end when the File Manager server stops.
 */
import { randomBytes } from "crypto";
import type { FmContext } from "./fmCore";
import { FmError, describeFsError } from "./fmPaths";
import { RingLog } from "./fmServeLog";
import { lanAddress, startStaticServer, type StaticServer } from "./fmServeStatic";
import { phpEnv, portInUse, startPhp, type PhpProcess } from "./fmServePhp";

export const MAX_SERVERS = 8;
export const LIVE_FIRST_PORT = 5500;
export const PHP_FIRST_PORT = 8000;
const MAX_PORT_TRIES = 100;
const MAX_STOPPED_KEPT = 8;

export type ServerKind = "static" | "php";
export type ServerStatus = "starting" | "running" | "stopping" | "stopped" | "failed";

export interface StartRequest {
  kind: ServerKind;
  /** The folder the person chose. */
  root: string;
  /** The folder actually served (the root, or a folder inside it). */
  docroot: string;
  /** null = pick a free port. */
  port: number | null;
  lan: boolean;
  liveReload: boolean;
  dotfiles: boolean;
  cors: boolean;
  listing: boolean;
  router: string;
  /** Absolute path of the php program (PHP servers). */
  php: string;
  phpVersion?: string | null;
  /** Folders that must never be served (the File Manager's own files). */
  forbidden: string[];
}

interface Entry {
  id: string;
  kind: ServerKind;
  root: string;
  docroot: string;
  host: string;
  port: number;
  lan: boolean;
  liveReload: boolean;
  dotfiles: boolean;
  cors: boolean;
  router: string;
  startedAt: number;
  status: ServerStatus;
  message: string;
  requests: number;
  lastRequestAt: number | null;
  log: RingLog;
  phpVersion: string | null;
  staticServer: StaticServer | null;
  phpProcess: PhpProcess | null;
}

export interface ServerSummary {
  id: string;
  kind: ServerKind;
  root: string;
  docroot: string;
  url: string;
  lanUrl: string | null;
  host: string;
  port: number;
  lan: boolean;
  status: ServerStatus;
  message: string;
  warning: string;
  startedAt: string;
  requests: number;
  lastRequestAt: string | null;
  liveReload: boolean;
  dotfiles: boolean;
  cors: boolean;
  router: string;
  clients: number;
  phpVersion: string | null;
  /** The PHP process id (PHP servers), so a leftover process can be found by hand. */
  pid: number | null;
}

const sameFolder = (ctx: FmContext, a: string, b: string) => (ctx.platform === "linux" ? a === b : a.toLowerCase() === b.toLowerCase());

function summarize(e: Entry): ServerSummary {
  const lan = e.lan ? lanAddress() : null;
  return {
    id: e.id, kind: e.kind, root: e.root, docroot: e.docroot,
    url: `http://127.0.0.1:${e.port}/`, lanUrl: lan ? `http://${lan}:${e.port}/` : null,
    host: e.host, port: e.port, lan: e.lan, status: e.status, message: e.message,
    warning: e.staticServer?.live?.warning ?? "",
    startedAt: new Date(e.startedAt).toISOString(), requests: e.requests, lastRequestAt: e.lastRequestAt ? new Date(e.lastRequestAt).toISOString() : null,
    liveReload: e.liveReload, dotfiles: e.dotfiles, cors: e.cors, router: e.router,
    clients: e.staticServer?.live?.clientCount ?? 0, phpVersion: e.phpVersion, pid: e.phpProcess?.pid ?? null,
  };
}

export class ServeRegistry {
  private entries = new Map<string, Entry>();

  constructor(private ctx: FmContext) {}

  list(): ServerSummary[] {
    return [...this.entries.values()].map(summarize);
  }

  summary(id: unknown): ServerSummary {
    return summarize(this.get(id));
  }

  log(id: unknown, since?: unknown): { lines: Array<{ n: number; t: number; text: string }>; cursor: number; dropped: boolean; status: ServerStatus } {
    const e = this.get(id);
    return { ...e.log.read(typeof since === "number" ? since : undefined), status: e.status };
  }

  private get(id: unknown): Entry {
    const e = typeof id === "string" ? this.entries.get(id) : undefined;
    if (!e) throw new FmError("NOT_FOUND", "That server isn't there any more. It may have been stopped already.");
    return e;
  }

  private active(): Entry[] {
    return [...this.entries.values()].filter((e) => e.status === "starting" || e.status === "running" || e.status === "stopping");
  }

  /** The running server for this folder and kind, if there is one. */
  findFor(root: string, kind: ServerKind): ServerSummary | undefined {
    const e = [...this.entries.values()].find((x) => x.kind === kind && sameFolder(this.ctx, x.root, root) && (x.status === "running" || x.status === "starting"));
    return e ? summarize(e) : undefined;
  }

  private usedPorts(): Set<number> {
    return new Set(this.active().map((e) => e.port));
  }

  /** Starts a server, or throws a plain-words error. An already running server for the same folder and kind is reported, not duplicated. */
  async start(req: StartRequest): Promise<ServerSummary> {
    const existing = this.findFor(req.root, req.kind);
    if (existing) throw new FmError("ALREADY_RUNNING", `A ${req.kind === "php" ? "PHP" : "live"} server is already running for this folder, at ${existing.url}`, { server: existing });
    if (this.active().length >= MAX_SERVERS) throw new FmError("TOO_MANY", `${MAX_SERVERS} servers are already running. Stop one before starting another.`);
    for (const [id, e] of this.entries) if ((e.status === "stopped" || e.status === "failed") && e.kind === req.kind && sameFolder(this.ctx, e.root, req.root)) this.entries.delete(id);

    const host = req.lan ? "0.0.0.0" : "127.0.0.1";
    const entry: Entry = {
      id: randomBytes(6).toString("hex"), kind: req.kind, root: req.root, docroot: req.docroot, host, port: 0, lan: req.lan,
      liveReload: req.kind === "static" && req.liveReload, dotfiles: req.dotfiles, cors: req.cors, router: req.router,
      startedAt: Date.now(), status: "starting", message: "", requests: 0, lastRequestAt: null, log: new RingLog(), phpVersion: req.phpVersion ?? null, staticServer: null, phpProcess: null,
    };
    this.entries.set(entry.id, entry);
    try {
      if (req.kind === "static") await this.startStatic(entry, req);
      else await this.startPhpServer(entry, req);
      // The File Manager may have been closed while this was starting.
      if (entry.status !== "starting") throw new FmError("STOPPED", "The server was stopped while it was starting.");
      entry.status = "running";
      entry.startedAt = Date.now();
      entry.log.add(`Serving ${entry.docroot} at http://127.0.0.1:${entry.port}/${req.lan ? ` (and on your network at port ${entry.port})` : ""}`);
      this.trimStopped();
      return summarize(entry);
    } catch (err) {
      await entry.staticServer?.stop().catch(() => {});
      entry.phpProcess?.killNow();
      this.entries.delete(entry.id);
      throw err;
    }
  }

  private async startStatic(entry: Entry, req: StartRequest): Promise<void> {
    const make = (port: number) => startStaticServer({
      root: entry.docroot, host: entry.host, port, lan: entry.lan, liveReload: entry.liveReload, dotfiles: entry.dotfiles, cors: entry.cors, listing: req.listing,
      platform: this.ctx.platform, forbidden: req.forbidden,
      log: (line) => entry.log.add(line),
      onRequest: () => { entry.requests++; entry.lastRequestAt = Date.now(); },
    });
    const inUse = (err: any) => err?.code === "EADDRINUSE" || /in use|EADDRINUSE/i.test(String(err?.message ?? ""));
    const failed = (err: unknown) => new FmError("START_FAILED", `The server couldn't start: ${describeFsError(err, "start the server").message}`);
    if (req.port !== null) {
      try {
        entry.staticServer = await make(req.port);
      } catch (err) {
        throw inUse(err) ? new FmError("PORT_IN_USE", `Port ${req.port} is already used by another program on this computer. Pick a different port, or leave the port on Auto.`) : failed(err);
      }
    } else {
      const taken = this.usedPorts();
      for (let port = LIVE_FIRST_PORT; port < LIVE_FIRST_PORT + MAX_PORT_TRIES && !entry.staticServer; port++) {
        if (taken.has(port)) continue;
        try {
          entry.staticServer = await make(port);
        } catch (err) {
          if (!inUse(err)) throw failed(err);
        }
      }
      if (!entry.staticServer) throw new FmError("PORT_IN_USE", `No free port was found from ${LIVE_FIRST_PORT} to ${LIVE_FIRST_PORT + MAX_PORT_TRIES - 1}. Type a port number yourself.`);
    }
    entry.port = entry.staticServer.port;
  }

  private async startPhpServer(entry: Entry, req: StartRequest): Promise<void> {
    let port = req.port;
    if (port === null) {
      for (let p = PHP_FIRST_PORT; p < PHP_FIRST_PORT + MAX_PORT_TRIES && port === null; p++) {
        if (this.usedPorts().has(p) || (await portInUse(entry.host, p))) continue;
        // Checked again after waiting, because another start may have taken it meanwhile.
        if (!this.usedPorts().has(p)) {
          port = p;
          entry.port = p;
        }
      }
      if (port === null) throw new FmError("PORT_IN_USE", `No free port was found from ${PHP_FIRST_PORT} to ${PHP_FIRST_PORT + MAX_PORT_TRIES - 1}. Type a port number yourself.`);
    } else if (this.usedPorts().has(port)) {
      throw new FmError("PORT_IN_USE", `Port ${port} is already used by another server started here. Pick a different port, or leave the port on Auto.`);
    }
    entry.port = port;
    const proc = await startPhp({
      php: req.php, host: entry.host, port, docroot: entry.docroot, router: req.router, env: phpEnv(this.ctx), log: entry.log,
      onRequest: () => { entry.requests++; entry.lastRequestAt = Date.now(); },
    });
    entry.phpProcess = proc;
    void proc.exited.then((code) => {
      if (entry.status === "running") {
        entry.status = "failed";
        entry.message = `PHP stopped by itself (exit code ${code}). The log shows what it said.`;
      }
    });
  }

  private trimStopped(): void {
    const stopped = [...this.entries.values()].filter((e) => e.status === "stopped" || e.status === "failed");
    for (const e of stopped.slice(0, Math.max(0, stopped.length - MAX_STOPPED_KEPT))) this.entries.delete(e.id);
  }

  /** Stops one server and forgets it. Stopping one that has already ended just removes it from the list. */
  async stop(id: unknown): Promise<ServerSummary> {
    const e = this.get(id);
    const was = summarize(e);
    if (e.status === "running" || e.status === "starting") {
      e.status = "stopping";
      try {
        await e.staticServer?.stop();
        await e.phpProcess?.stop();
      } finally {
        e.status = "stopped";
      }
    }
    this.entries.delete(e.id);
    return { ...was, status: "stopped" };
  }

  async stopAll(): Promise<number> {
    const ids = [...this.entries.keys()];
    let n = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        if (this.entries.get(id)?.status === "running") n++;
        await this.stop(id);
      } catch {}
    }));
    return n;
  }

  /** Ends everything without waiting (the File Manager is closing). */
  disposeNow(): void {
    for (const e of this.entries.values()) {
      e.status = "stopped";
      try { void e.staticServer?.stop(); } catch {}
      try { e.phpProcess?.killNow(); } catch {}
    }
    this.entries.clear();
  }
}

const registries = new WeakMap<FmContext, ServeRegistry>();

export function getServeRegistry(ctx: FmContext): ServeRegistry {
  let r = registries.get(ctx);
  if (!r) {
    r = new ServeRegistry(ctx);
    registries.set(ctx, r);
    const created = r;
    ctx.disposers.push(() => created.disposeNow());
  }
  return r;
}
