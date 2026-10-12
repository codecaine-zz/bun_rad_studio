import { describe, it, expect } from "bun:test";
import { flattenData, diffData, toCsv, toMarkdown, toHtmlReport, exportFormatInfo, systemReportClientSource } from "../src/system_report";
import { generateEnterpriseAppHtml } from "../applications/system_studio";
import { startSystemStudioServer } from "../applications/system_studio_server";
import { existsSync, readFileSync, rmSync } from "fs";

describe("system_report helpers", () => {
  it("flattens nested data to paths", () => {
    expect(flattenData({ a: { b: 1, c: [10, { d: 2 }] }, e: [], f: {} })).toEqual({
      "a.b": 1, "a.c[0]": 10, "a.c[1].d": 2, e: "[]", f: "{}",
    });
    expect(flattenData(5)).toEqual({ value: 5 });
  });

  it("diffs snapshots", () => {
    const d = diffData({ cpu: { load: 10, cores: 8 }, gone: 1 }, { cpu: { load: 55, cores: 8 }, fresh: true });
    expect(d.changed).toEqual([{ path: "cpu.load", from: 10, to: 55 }]);
    expect(d.added).toEqual([{ path: "fresh", value: true }]);
    expect(d.removed).toEqual([{ path: "gone", value: 1 }]);
    expect(d.unchanged).toBe(1);
  });

  it("exports CSV for tables and flat objects", () => {
    expect(toCsv([{ n: "a,b", v: 1 }, { n: "c", v: 2 }])).toBe('n,v\n"a,b",1\nc,2');
    expect(toCsv({ cpu: { cores: 8 } })).toBe("path,value\ncpu.cores,8");
  });

  it("exports Markdown and HTML (escaped)", () => {
    const md = toMarkdown("cpu", { cpu: { brand: "A|B" } }, { platform: "test", generated: "now" });
    expect(md).toContain("# System report: `cpu`");
    expect(md).toContain("A\\|B");
    const html = toHtmlReport("x", { s: "<script>alert(1)</script>" }, { generated: "now" });
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(exportFormatInfo("md").ext).toBe("md");
    expect(exportFormatInfo("whatever").ext).toBe("json");
  });

  it("client source is valid standalone JavaScript", () => {
    const api = new Function(systemReportClientSource() + "\nreturn { flattenData, diffData, toCsv, toMarkdown, toHtmlReport };")();
    expect(api.flattenData({ a: [1] })).toEqual({ "a[0]": 1 });
    expect(api.diffData({ a: 1 }, { a: 2 }).changed.length).toBe(1);
    expect(api.toCsv([{ a: 1 }])).toBe("a\n1");
  });
});

describe("System Studio page", () => {
  const html = generateEnterpriseAppHtml();

  it("contains the new productivity controls", () => {
    for (const id of ["btnTheme", "btnHelp", "quickChips", "selAutoRefresh", "chkAlerts", "btnFav", "btnCompare", "selExportFormat", "jsonSearch", "overlay"]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("every inline <script> block parses", () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThanOrEqual(3);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
  });

  it("server exports reports in the requested format", async () => {
    const srv = startSystemStudioServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${srv.port}`;
      const res: any = await (await fetch(`${base}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "cpu/../x", format: "csv", content: "a,b\n1,2" }),
      })).json();
      expect(res.success).toBe(true);
      expect(res.filename.endsWith(".csv")).toBe(true);
      expect(res.filename).not.toContain("/");
      expect(readFileSync(res.path, "utf8")).toBe("a,b\n1,2");
      if (existsSync(res.path)) rmSync(res.path);

      const legacy: any = await (await fetch(`${base}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "cpu", jsonStr: '{"a":1}' }),
      })).json();
      expect(legacy.filename.endsWith(".json")).toBe(true);
      if (existsSync(legacy.path)) rmSync(legacy.path);
    } finally {
      srv.stop(true);
    }
  });
});
