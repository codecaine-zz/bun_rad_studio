/**
 * API operations for the System Information power tool (`sysinfo/...`).
 *
 * Provides live KPI overview, section drill-downs (Hardware, CPU, Memory, Disks, Network,
 * Graphics, Peripherals, Software), deep `systeminformation` probes, snapshot diffing,
 * and report exporting (JSON, CSV, Markdown, HTML).
 */
import { promises as fsp } from "fs";
import { absolutePath, assertCreatable, assertFolder, pathApi, type FmContext, type FmHandler } from "./fmCore";
import { FmError, uniqueName, validateName } from "./fmPaths";
import {
  SYSINFO_PROBE_CATALOG,
  collectSysinfoOverview,
  collectSysinfoSection,
  diffSysinfoSnapshots,
  formatSysinfoReport,
  runSysinfoProbe,
  type SysinfoSectionId,
} from "./fmSysinfo";

export const SYSINFO_SECTIONS: Array<{ id: SysinfoSectionId; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "hardware", label: "Hardware & BIOS", icon: "🔧" },
  { id: "cpu", label: "CPU & Thermal", icon: "🧠" },
  { id: "memory", label: "Memory (RAM)", icon: "💾" },
  { id: "disks", label: "Disks & Volumes", icon: "💽" },
  { id: "network", label: "Network & NICs", icon: "🌐" },
  { id: "graphics", label: "GPUs & Displays", icon: "🖥️" },
  { id: "peripherals", label: "USB, BT & Power", icon: "🔌" },
  { id: "software", label: "OS & Versions", icon: "📦" },
];

const VALID_SECTIONS = new Set<string>(SYSINFO_SECTIONS.map((s) => s.id));
const EXPORT_FORMATS = ["json", "csv", "md", "html"] as const;
type SysinfoExportFormat = (typeof EXPORT_FORMATS)[number];

function parseFormat(raw: unknown): SysinfoExportFormat {
  if (typeof raw === "string" && (EXPORT_FORMATS as readonly string[]).includes(raw)) {
    return raw as SysinfoExportFormat;
  }
  throw new FmError("BAD_FORMAT", "Choose JSON, CSV, Markdown, or HTML.");
}

function parseSection(raw: unknown): SysinfoSectionId {
  const s = typeof raw === "string" ? raw.trim() : "overview";
  if (VALID_SECTIONS.has(s)) return s as SysinfoSectionId;
  throw new FmError("BAD_REQUEST", `Unknown system info section: "${s}".`);
}

async function resolveExportPayload(
  ctx: FmContext,
  b: Record<string, any>,
): Promise<{ title: string; data: unknown }> {
  if (typeof b.method === "string" && b.method.trim()) {
    const probe = await runSysinfoProbe(
      b.method.trim(),
      typeof b.param === "string" ? b.param : "",
      ctx.platform,
      ctx.sysinfo,
    );
    return { title: `Probe: ${probe.label} (${probe.method})`, data: probe.data };
  }
  const section = b.section ? parseSection(b.section) : "overview";
  if (section === "overview") {
    const ov = await collectSysinfoOverview(ctx.platform, ctx.sysinfo);
    return { title: `System Overview (${ov.os.hostname})`, data: ov };
  }
  const sec = await collectSysinfoSection(section, ctx.platform, ctx.sysinfo);
  return { title: `System Section: ${section}`, data: sec.raw };
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
  const safeBase = baseName.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "system-report";
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

export const sysinfoOperations: Record<string, FmHandler> = {
  async "sysinfo/overview"(ctx) {
    const overview = await collectSysinfoOverview(ctx.platform, ctx.sysinfo);
    return {
      overview,
      sections: SYSINFO_SECTIONS,
      catalog: SYSINFO_PROBE_CATALOG,
    };
  },

  async "sysinfo/section"(ctx, b) {
    const section = parseSection(b.section);
    return await collectSysinfoSection(section, ctx.platform, ctx.sysinfo);
  },

  async "sysinfo/probe"(ctx, b) {
    const method = typeof b.method === "string" ? b.method.trim() : "";
    if (!method) throw new FmError("BAD_REQUEST", "Choose a system probe to run.");
    if (!SYSINFO_PROBE_CATALOG.some((c) => c.method === method)) {
      throw new FmError("BAD_REQUEST", `Unsupported system probe: "${method}".`);
    }
    const param = typeof b.param === "string" ? b.param.slice(0, 200) : "";
    try {
      return await runSysinfoProbe(method, param, ctx.platform, ctx.sysinfo);
    } catch (err: any) {
      throw new FmError("PROBE_FAILED", String(err?.message ?? err));
    }
  },

  async "sysinfo/diff"(_ctx, b) {
    if (b.before === undefined || b.after === undefined) {
      throw new FmError("BAD_REQUEST", "Provide both 'before' and 'after' snapshots to compare.");
    }
    return {
      diff: diffSysinfoSnapshots(b.before, b.after),
    };
  },

  async "sysinfo/export"(ctx, b) {
    const format = parseFormat(b.format);
    const { title, data } = await resolveExportPayload(ctx, b);
    const text = formatSysinfoReport(title, data, format, ctx.platform);
    return { format, title, text };
  },

  async "sysinfo/save"(ctx, b) {
    const format = parseFormat(b.format);
    const { title, data } = await resolveExportPayload(ctx, b);
    const text = formatSysinfoReport(title, data, format, ctx.platform);
    const stamp = new Date().toISOString().slice(0, 10);
    const defaultName = typeof b.method === "string" && b.method ? `sysinfo-${b.method}-${stamp}` : `system-report-${stamp}`;
    const baseName = typeof b.name === "string" && b.name.trim() ? b.name.trim() : defaultName;
    const saved = await writeUniqueReport(ctx, b.folder, baseName, format, text);
    return { ...saved, format, title };
  },
};
