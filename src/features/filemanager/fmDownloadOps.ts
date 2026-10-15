/**
 * The Downloads tool's API: add web addresses, watch them download, pause, resume and remove them.
 * The work is done by DownloadManager (fmDownloads.ts); one manager lives for as long as the File Manager runs, and its
 * list is kept in the data folder so unfinished downloads can be resumed after a restart.
 */
import * as nodePath from "path";
import { assertCreatable, absolutePath, type FmContext, type FmHandler } from "./fmCore";
import { DownloadManager, MAX_CONNECTIONS, probeUrl, safeFileName, type DlRequest } from "./fmDownloads";
import { FmError } from "./fmPaths";
import { revealItem } from "./fmOpen";

const managers = new WeakMap<FmContext, DownloadManager>();

const MAX_URLS_PER_ADD = 200;

export function downloadsOf(ctx: FmContext): DownloadManager {
  let m = managers.get(ctx);
  if (!m) {
    m = new DownloadManager({ file: nodePath.join(ctx.dataDir, "file_manager_downloads.json"), defaultFolder: nodePath.join(ctx.home, "Downloads") });
    managers.set(ctx, m);
    const own = m;
    ctx.disposers.push(() => own.closeAll());
  }
  return m;
}

/** One address per line; blank lines and lines starting with # are ignored. Accepts an array too. */
export function parseUrlList(input: unknown): string[] {
  const lines = Array.isArray(input) ? input.map(String) : typeof input === "string" ? input.split(/\r?\n/) : [];
  return lines.map((l) => l.trim()).filter((l): l is string => l.length > 0 && !l.startsWith("#"));
}

function problem(err: unknown): FmError {
  if (err instanceof FmError) return err;
  return new FmError("BAD_REQUEST", String((err as any)?.message ?? err).split("\n")[0] ?? "That didn't work.");
}

const snapshot = (ctx: FmContext) => {
  const m = downloadsOf(ctx);
  return { items: m.list(), settings: m.getSettings(), maxConnections: MAX_CONNECTIONS };
};

export const downloadOperations: Record<string, FmHandler> = {
  async "dl/list"(ctx) {
    return snapshot(ctx);
  },

  /** What a server says about an address: its name, size and whether it can be split and resumed. */
  async "dl/probe"(_ctx, b) {
    const urls = parseUrlList(b.url);
    if (urls.length !== 1) throw new FmError("BAD_REQUEST", "Give one address.");
    try {
      const r = await probeUrl(urls[0]!, b.headers && typeof b.headers === "object" ? b.headers : undefined, fetch, AbortSignal.timeout(15000));
      return { name: r.name, size: r.size, ranges: r.ranges, mime: r.mime ?? null };
    } catch (err: any) {
      throw problem(err);
    }
  },

  async "dl/add"(ctx, b) {
    const urls = parseUrlList(b.urls ?? b.url);
    if (urls.length === 0) throw new FmError("BAD_REQUEST", "Paste at least one web address.");
    if (urls.length > MAX_URLS_PER_ADD) throw new FmError("BAD_REQUEST", `Add at most ${MAX_URLS_PER_ADD} addresses at a time.`);
    let folder: string | undefined;
    if (typeof b.folder === "string" && b.folder.trim()) {
      folder = absolutePath(ctx, b.folder);
      assertCreatable(ctx, folder);
    }
    const name = typeof b.name === "string" && b.name.trim() && urls.length === 1 ? safeFileName(b.name) : undefined;
    const requests: DlRequest[] = urls.map((url) => ({
      url,
      folder,
      name,
      connections: b.connections === undefined ? undefined : Number(b.connections),
      headers: b.headers && typeof b.headers === "object" ? b.headers : undefined,
      checksum: typeof b.checksum === "string" && urls.length === 1 ? b.checksum : undefined,
      start: b.start !== false,
    }));
    try {
      const added = downloadsOf(ctx).add(requests);
      return { added: added.map((i) => i.id), ...snapshot(ctx) };
    } catch (err) {
      throw problem(err);
    }
  },

  async "dl/pause"(ctx, b) {
    downloadsOf(ctx).pause(String(b.id));
    return snapshot(ctx);
  },
  async "dl/resume"(ctx, b) {
    downloadsOf(ctx).resume(String(b.id));
    return snapshot(ctx);
  },
  async "dl/pauseAll"(ctx) {
    downloadsOf(ctx).pauseAll();
    return snapshot(ctx);
  },
  async "dl/resumeAll"(ctx) {
    downloadsOf(ctx).resumeAll();
    return snapshot(ctx);
  },
  async "dl/remove"(ctx, b) {
    await downloadsOf(ctx).remove(String(b.id), b.deleteFile === true);
    return snapshot(ctx);
  },
  async "dl/clear"(ctx) {
    downloadsOf(ctx).clearFinished();
    return snapshot(ctx);
  },
  async "dl/settings"(ctx, b) {
    const patch = b.settings && typeof b.settings === "object" ? { ...b.settings } : {};
    const m = downloadsOf(ctx);
    let folder: string | undefined;
    if (typeof patch.folder === "string" && patch.folder.trim()) {
      folder = absolutePath(ctx, patch.folder);
      assertCreatable(ctx, folder);
    }
    m.setSettings({
      ...(patch.connections !== undefined ? { connections: Number(patch.connections) } : {}),
      ...(patch.maxConcurrent !== undefined ? { maxConcurrent: Number(patch.maxConcurrent) } : {}),
      ...(patch.speedLimit !== undefined ? { speedLimit: Number(patch.speedLimit) } : {}),
      ...(patch.retries !== undefined ? { retries: Number(patch.retries) } : {}),
      ...(folder ? { folder } : {}),
    });
    return snapshot(ctx);
  },
  /** Shows a finished file (or the folder of an unfinished one) in the system's file browser. */
  async "dl/reveal"(ctx, b) {
    const item = downloadsOf(ctx).get(String(b.id));
    if (!item) throw new FmError("NOT_FOUND", "That download isn't in the list any more.");
    return await revealItem(ctx, item.state === "done" ? item.path : item.folder);
  },
};
