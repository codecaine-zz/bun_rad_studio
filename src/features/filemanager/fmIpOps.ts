import { lstatSync, promises as fsp } from "fs";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { formatsAnswer, inCidrAnswer, interfacesAnswer, maskAnswer, splitAnswer, subnetAnswer } from "./fmIpCalc";
import { bulkAnswer, lookupAnswer, splitTargets } from "./fmIpLookup";
import { buildExternalUrl } from "./fmIpNet";
import { openCommand } from "./fmOpen";
import { FmError, cleanName, uniqueName, validateName } from "./fmPaths";

/** The IP info tool's operations (namespaced `ip/...`). Each takes the page's JSON and answers with a table, plain text, JSON and CSV. */

/** Anything unexpected becomes a plain message (never request data such as the token); disk errors keep their own wording. */
async function guarded<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err: any) {
    if (err instanceof FmError || (typeof err?.code === "string" && /^E[A-Z]+$/.test(err.code))) throw err;
    throw new FmError("IP_FAILED", "That didn't work. Check what you typed and try again.");
  }
}

const MAX_SAVE_BYTES = 1024 * 1024;
const MAX_LIST_BYTES = 256 * 1024;

async function openUrl(ctx: FmContext, body: Record<string, any>) {
  // The page only names a kind and a target; the address is built (and its host checked) here.
  const url = buildExternalUrl(body.kind, body.target, body.provider);
  const cmd = openCommand(ctx.platform, url);
  try {
    await ctx.launch(cmd.command, cmd.args);
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new FmError("NO_OPENER", ctx.platform === "linux" ? "Opening a web page needs the 'xdg-open' program (package 'xdg-utils'), which this computer doesn't seem to have." : `Couldn't start "${cmd.command}" to open that.`);
    throw new FmError("OPEN_FAILED", "Couldn't open the web page.");
  }
  return { opened: url };
}

function taken(path: string): boolean {
  try {
    return lstatSync(path) !== undefined;
  } catch {
    return false;
  }
}

/** Writes the results to a NEW file: the name is made unique and an existing file is never touched. */
async function saveResults(ctx: FmContext, body: Record<string, any>) {
  const folder = absolutePath(ctx, body.folder);
  await assertFolder(folder, "That folder");
  assertCreatable(ctx, folder);
  const format = body.format === "csv" ? "csv" : body.format === "json" ? "json" : null;
  if (!format) throw new FmError("BAD_FORMAT", "Choose JSON or CSV.");
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) throw new FmError("NOTHING_TO_SAVE", "There is nothing to save yet. Look something up first.");
  if (Buffer.byteLength(text) > MAX_SAVE_BYTES) throw new FmError("TOO_LARGE", "That is too much to save in one file.");
  if (format === "json") {
    try {
      JSON.parse(text);
    } catch {
      throw new FmError("BAD_REQUEST", "Those results can't be saved as JSON.");
    }
  }
  const wanted = (cleanName(body.name) || "ipinfo_results").replace(/\.(json|csv)$/i, "");
  const reason = validateName(`${wanted}.${format}`, ctx.platform);
  if (reason) throw new FmError("BAD_NAME", reason);
  const p = pathApi(ctx);
  const ci = ctx.platform !== "linux";
  const existing = new Set((await fsp.readdir(folder).catch(() => [] as string[])).map((n) => (ci ? n.toLowerCase() : n)));
  const raced = new Set<string>();
  const data = text.endsWith("\n") ? text : `${text}\n`;
  for (let attempt = 0; attempt < 25; attempt++) {
    const name = uniqueName(`${wanted}.${format}`, (n) => raced.has(n) || existing.has(ci ? n.toLowerCase() : n));
    try {
      await fsp.writeFile(p.join(folder, name), data, { flag: "wx", encoding: "utf8" });
      return { path: p.join(folder, name), name, folder, bytes: Buffer.byteLength(data) };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
      raced.add(name);
    }
  }
  throw new FmError("NO_FREE_NAME", "Couldn't find a free file name. Try a different name.");
}

/** Reads a text file of addresses (the first 256 KB) for the bulk lookup. */
async function loadList(ctx: FmContext, body: Record<string, any>) {
  const path = absolutePath(ctx, body.path);
  let st;
  try {
    st = await fsp.stat(path);
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new FmError("NOT_FOUND", "That file doesn't exist.");
    throw err;
  }
  if (!st.isFile()) throw new FmError("NOT_A_FILE", "That isn't a file. Choose a text file with one address per line.");
  const length = Math.min(st.size, MAX_LIST_BYTES);
  const buffer = Buffer.alloc(length);
  const handle = await fsp.open(path, "r");
  try {
    await handle.read(buffer, 0, length, 0);
  } finally {
    await handle.close();
  }
  if (buffer.includes(0)) throw new FmError("NOT_TEXT", "That doesn't look like a text file. Choose a plain text file with one address per line.");
  let text = buffer.toString("utf8");
  const truncated = st.size > MAX_LIST_BYTES;
  if (truncated) text = text.slice(0, Math.max(0, text.lastIndexOf("\n")));
  const { targets, skipped } = splitTargets(text);
  return { name: pathApi(ctx).basename(path), text, truncated, count: targets.length, skipped };
}

export const ipOperations: Record<string, FmHandler> = {
  async "ip/lookup"(_ctx, b) {
    return await guarded(() => lookupAnswer(b.target, b.token));
  },
  async "ip/myip"(_ctx, b) {
    return await guarded(() => lookupAnswer("myip", b.token));
  },
  async "ip/subnet"(_ctx, b) {
    return await guarded(() => subnetAnswer(b.cidr ?? b.target));
  },
  async "ip/interfaces"() {
    return await guarded(() => interfacesAnswer());
  },
  async "ip/bulk"(_ctx, b) {
    return await guarded(() => bulkAnswer(b.targets ?? b.text, b.token));
  },
  async "ip/incidr"(_ctx, b) {
    return await guarded(() => inCidrAnswer(b.cidr, b.ip));
  },
  async "ip/split"(_ctx, b) {
    return await guarded(() => splitAnswer(b.cidr, b.prefix, b.limit));
  },
  async "ip/formats"(_ctx, b) {
    return await guarded(() => formatsAnswer(b.ip));
  },
  async "ip/mask"(_ctx, b) {
    return await guarded(() => maskAnswer(b.value));
  },
  async "ip/openurl"(ctx, b) {
    return await guarded(() => openUrl(ctx, b));
  },
  async "ip/save"(ctx, b) {
    return await guarded(() => saveResults(ctx, b));
  },
  async "ip/loadlist"(ctx, b) {
    return await guarded(() => loadList(ctx, b));
  },
};
