/**
 * Turning a run's results into files: a plain host list, a spreadsheet (CSV), JSON, and a Markdown report with
 * notes in plain words. Cells that a spreadsheet would run as a formula are neutralised, Markdown from the network
 * is escaped, and a file is only ever created, never overwritten.
 */
import { promises as fsp } from "node:fs";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext } from "./fmCore";
import { FmError, cleanName, parseTypedPath, uniqueName, validateName } from "./fmPaths";
import { csvCell } from "../subfinder/subfinderNames";
import type { DiscoverySummary, SourceStatus } from "../subfinder/subfinderEngine";
import type { SubdomainResult } from "../subfinder/subfinderTypes";

export type ExportFormat = "txt" | "csv" | "json";

export interface RunMeta {
  domain: string;
  unicode: string;
  startedAt: number;
  endedAt: number | null;
  state: string;
  steps: { resolve: boolean; probeHttp: boolean; ports: number[]; wildcard: boolean; allowPrivate: boolean };
  sources: SourceStatus[];
  summary: DiscoverySummary | null;
  maxResults: number;
}

const byHost = (a: SubdomainResult, b: SubdomainResult) => (a.host < b.host ? -1 : a.host > b.host ? 1 : 0);

export function toTxt(rows: SubdomainResult[]): string {
  return [...rows].sort(byHost).map((r) => r.host).join("\n") + (rows.length ? "\n" : "");
}

export function toCsv(rows: SubdomainResult[]): string {
  const head = ["host", "sources", "ip addresses", "http status", "page title", "open ports", "wildcard", "note"];
  const lines = [...rows].sort(byHost).map((r) => [r.host, r.sources.join(" "), (r.ip ?? []).join(" "), r.httpStatus ?? "", r.httpTitle ?? "", (r.openPorts ?? []).join(" "), r.isWildcard ? "yes" : "", r.note ?? ""].map(csvCell).join(","));
  return `${[head.join(","), ...lines].join("\r\n")}\r\n`;
}

export function toJson(meta: RunMeta, rows: SubdomainResult[]): string {
  return `${JSON.stringify({
    target: meta.domain,
    exportedAt: new Date().toISOString(),
    count: rows.length,
    results: [...rows].sort(byHost).map((r) => ({ host: r.host, sources: r.sources, ips: r.ip ?? [], httpStatus: r.httpStatus ?? null, httpTitle: r.httpTitle ?? null, httpScheme: r.httpScheme ?? null, openPorts: r.openPorts ?? [], wildcard: r.isWildcard === true, note: r.note ?? null })),
  }, null, 2)}\n`;
}

/** Text from the network placed in Markdown: formatting characters are escaped and it stays on one line. */
export function mdEscape(value: unknown): string {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/[\\`*_{}[\]<>()#+!|~&]/g, (c) => `\\${c}`).trim();
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const REPORT_TABLE_LIMIT = 1000;

/** A Markdown report with the date, target, sources, counts, the hosts and notes in plain words. */
export function toReport(meta: RunMeta, rows: SubdomainResult[], now = new Date()): string {
  const live = rows.filter((r) => (r.ip?.length ?? 0) > 0).length;
  const http = rows.filter((r) => r.httpStatus !== undefined).length;
  const withPorts = rows.filter((r) => (r.openPorts?.length ?? 0) > 0).length;
  const wildcard = rows.filter((r) => r.isWildcard).length;
  const active = meta.steps.resolve || meta.steps.probeHttp || meta.steps.ports.length > 0;
  const lines: string[] = [];
  lines.push(`# Subdomain report: ${mdEscape(meta.domain)}`, "");
  lines.push(`- **Date:** ${now.toISOString().replace("T", " ").slice(0, 19)} UTC`);
  lines.push(`- **Target:** ${mdEscape(meta.domain)}${meta.unicode !== meta.domain ? ` (shown as ${mdEscape(meta.unicode)})` : ""}`);
  lines.push(`- **Run:** ${meta.state === "cancelled" ? "stopped before it finished" : "finished"}${meta.endedAt ? `, ${Math.max(1, Math.round((meta.endedAt - meta.startedAt) / 1000))} s` : ""}`);
  lines.push(`- **Hosts found:** ${rows.length}${meta.summary?.truncated ? ` (stopped at the limit of ${meta.maxResults})` : ""}`);
  lines.push(`- **Steps used:** passive sources${meta.steps.resolve ? ", DNS lookups" : ""}${meta.steps.wildcard ? ", wildcard check" : ""}${meta.steps.probeHttp ? ", HTTP/HTTPS probing" : ""}${meta.steps.ports.length ? `, port probing (${meta.steps.ports.join(", ")})` : ""}`, "");
  lines.push("## Sources", "", "| Source | Result | Hosts |", "| --- | --- | ---: |");
  for (const s of meta.sources) lines.push(`| ${mdEscape(s.label)} | ${s.state === "done" ? "answered" : mdEscape(s.error ?? s.state)} | ${s.count} |`);
  lines.push("", "## Counts", "");
  lines.push(`- Hosts: ${rows.length}`);
  if (meta.steps.resolve) lines.push(`- With an IP address (live in DNS): ${live}`);
  if (meta.steps.probeHttp) lines.push(`- Answered over HTTP or HTTPS: ${http}`);
  if (meta.steps.ports.length) lines.push(`- With at least one open port: ${withPorts}`);
  if (meta.summary?.wildcard.tested) lines.push(`- Matching the wildcard answer: ${wildcard}`);
  lines.push("", "## Hosts", "");
  const shown = [...rows].sort(byHost).slice(0, REPORT_TABLE_LIMIT);
  if (shown.length === 0) lines.push("No hosts were found.");
  else {
    lines.push("| Host | Found by | IP addresses | HTTP | Title | Open ports |", "| --- | --- | --- | --- | --- | --- |");
    for (const r of shown) lines.push(`| ${mdEscape(r.host)} | ${mdEscape(r.sources.join(", "))} | ${mdEscape((r.ip ?? []).join(", "))} | ${r.httpStatus ?? ""} | ${mdEscape(r.httpTitle ?? "")} | ${mdEscape((r.openPorts ?? []).join(", "))} |`);
    if (rows.length > shown.length) lines.push("", `${plural(rows.length - shown.length, "more host")} are not listed here. Use Export to get the full list.`);
  }
  lines.push("", "## Notes in plain words", "");
  lines.push(`- This list comes from public sources (${meta.sources.filter((s) => s.state === "done").map((s) => mdEscape(s.label)).join(", ") || "none answered"}). It is a good starting point, not a complete or guaranteed list: sources can be out of date or miss names.`);
  const failed = meta.sources.filter((s) => s.state !== "done");
  if (failed.length) lines.push(`- ${plural(failed.length, "source")} did not answer: ${failed.map((s) => `${mdEscape(s.label)} (${mdEscape(s.error ?? s.state)})`).join("; ")}.`);
  if (!active) lines.push("- Only passive sources were used. No computer at the target was contacted, so nothing here says whether a name is still in use.");
  else lines.push(`- Active steps were used (${[meta.steps.resolve && "DNS lookups", meta.steps.probeHttp && "HTTP/HTTPS probing", meta.steps.ports.length > 0 && "port probing"].filter(Boolean).join(", ")}). Only do that for domains you own or are allowed to test.`);
  if (meta.steps.resolve) lines.push("- A host with no IP address may be retired, internal, or only reachable some other way.");
  if (meta.summary?.wildcard.detected) lines.push(`- The domain answers for names that cannot exist (a wildcard, ${mdEscape(meta.summary.wildcard.ips.join(", "))}). Hosts marked as matching it may not be real separate sites.`);
  if (meta.summary && meta.summary.blocked > 0) lines.push(`- Hosts that pointed to private or internal addresses (${meta.summary.blocked}) ${meta.steps.allowPrivate ? "were probed because you allowed that" : "were not probed"}.`);
  if (meta.summary?.truncated) lines.push(`- The result limit (${meta.maxResults}) was reached, so some hosts were not kept.`);
  lines.push("- Names that are not under the target domain were ignored.", "");
  return lines.join("\n");
}

export function renderExport(format: ExportFormat, meta: RunMeta, rows: SubdomainResult[]): string {
  return format === "csv" ? toCsv(rows) : format === "json" ? toJson(meta, rows) : toTxt(rows);
}

/** Creates `wanted` (or the next free variant of that name) in `folderInput`, never replacing a file. Checks the folder and the name first. */
export async function writeNewFile(ctx: FmContext, folderInput: unknown, nameInput: unknown, fallbackName: string, extension: string, content: string): Promise<{ path: string; name: string }> {
  if (typeof folderInput !== "string" || !folderInput.trim()) throw new FmError("BAD_PATH", "Choose a folder to save in.");
  const typed = parseTypedPath(folderInput, ctx.home, ctx.home, ctx.platform);
  const folder = absolutePath(ctx, typed ?? "");
  await assertFolder(folder, "That folder");
  assertCreatable(ctx, folder);
  let wanted = fallbackName;
  if (typeof nameInput === "string" && nameInput.trim()) {
    const reason = validateName(nameInput, ctx.platform);
    if (reason) throw new FmError("BAD_NAME", reason);
    wanted = cleanName(nameInput);
    if (!wanted.toLowerCase().endsWith(extension)) wanted += extension;
  } else if (nameInput !== undefined && nameInput !== null && nameInput !== "") {
    throw new FmError("BAD_NAME", "Type a file name, or leave it empty.");
  }
  const p = pathApi(ctx);
  const taken = new Set(await fsp.readdir(folder));
  // "wx" never replaces a file; if one appears between the check and the write, the next free name is tried.
  for (let attempt = 0; attempt < 50; attempt++) {
    const name = uniqueName(wanted, (n) => taken.has(n));
    try {
      await fsp.writeFile(p.join(folder, name), content, { flag: "wx", encoding: "utf8" });
      return { path: p.join(folder, name), name };
    } catch (err: any) {
      if (err?.code !== "EEXIST") throw err;
      taken.add(name);
    }
  }
  throw new FmError("NO_FREE_NAME", "Could not find a free name for the file.");
}
