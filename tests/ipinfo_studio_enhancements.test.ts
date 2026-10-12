import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  isValidIpv4,
  isValidIp,
  ipv4ToInt,
  intToIpv4,
  parseIpv4Flexible,
  describeIpv4,
  prefixToMask,
  maskToPrefix,
  isValidCidr,
  cidrContains,
  cidrsOverlap,
  splitCidr,
  parseTargets,
  bulkLookup,
  bulkToTableRows,
  bulkToCsv,
  tableToTsv,
  tableToCsv,
  pushHistory,
  ipInfoUrl,
  bgpUrl,
  MAX_BULK_TARGETS,
  type BulkDeps,
} from "../src/features/ipinfo/ipinfoTools";
import { createIpInfoStudio } from "../applications/ipinfo_studio";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, id: string, event = "click", val?: any) {
  const h = win.eventHandlersMap.get(`${id}:on${event}`) || win.eventHandlersMap.get(`${id}:${event}`) || win.eventHandlersMap.get(id);
  if (!h) throw new Error(`no handler for ${id}`);
  return await h(win, val);
}

describe("validation & conversion", () => {
  test("strict IPv4 / IP validation", () => {
    expect(isValidIpv4("192.168.1.1")).toBe(true);
    expect(isValidIpv4("999.1.1.1")).toBe(false);
    expect(isValidIpv4("1.2.3")).toBe(false);
    expect(isValidIp("2001:db8::1")).toBe(true);
    expect(isValidIp("not-an-ip")).toBe(false);
  });
  test("int round trip", () => {
    expect(ipv4ToInt("192.168.1.1")).toBe(3232235777);
    expect(intToIpv4(3232235777)).toBe("192.168.1.1");
    expect(ipv4ToInt("255.255.255.255")).toBe(4294967295);
    expect(ipv4ToInt("0.0.0.0")).toBe(0);
    expect(() => ipv4ToInt("300.0.0.1")).toThrow();
  });
  test("parseIpv4Flexible accepts dotted, decimal and hex", () => {
    expect(parseIpv4Flexible("3232235777")).toBe("192.168.1.1");
    expect(parseIpv4Flexible("0xC0A80101")).toBe("192.168.1.1");
    expect(parseIpv4Flexible(" 10.0.0.1 ")).toBe("10.0.0.1");
    expect(() => parseIpv4Flexible("hello")).toThrow();
    expect(() => parseIpv4Flexible("99999999999")).toThrow();
  });
  test("describeIpv4", () => {
    const rows = Object.fromEntries(describeIpv4("192.168.1.1"));
    expect(rows["Integer"]).toBe("3232235777");
    expect(rows["Hexadecimal"]).toBe("0xC0A80101");
    expect(rows["Binary"]).toBe("11000000.10101000.00000001.00000001");
    expect(rows["Reverse DNS Zone"]).toBe("1.1.168.192.in-addr.arpa");
  });
  test("prefix <-> mask", () => {
    expect(prefixToMask(24)).toBe("255.255.255.0");
    expect(prefixToMask(0)).toBe("0.0.0.0");
    expect(prefixToMask(32)).toBe("255.255.255.255");
    expect(maskToPrefix("255.255.240.0")).toBe(20);
    expect(maskToPrefix("255.255.255.255")).toBe(32);
    expect(maskToPrefix("0.0.0.0")).toBe(0);
    expect(() => maskToPrefix("255.0.255.0")).toThrow();
    expect(() => prefixToMask(33)).toThrow();
  });
});

describe("CIDR math", () => {
  test("isValidCidr", () => {
    expect(isValidCidr("10.0.0.0/8")).toBe(true);
    expect(isValidCidr("10.0.0.0/33")).toBe(false);
    expect(isValidCidr("10.0.0.0")).toBe(false);
    expect(isValidCidr("999.0.0.0/8")).toBe(false);
  });
  test("cidrContains", () => {
    expect(cidrContains("192.168.1.0/24", "192.168.1.77")).toBe(true);
    expect(cidrContains("192.168.1.0/24", "192.168.2.1")).toBe(false);
    expect(cidrContains("192.168.1.55/24", "192.168.1.0")).toBe(true); // host bits ignored
    expect(cidrContains("0.0.0.0/0", "8.8.8.8")).toBe(true);
    expect(cidrContains("10.0.0.1/32", "10.0.0.1")).toBe(true);
    expect(cidrContains("10.0.0.1/32", "10.0.0.2")).toBe(false);
    expect(cidrContains("192.168.1.0/24", "3232235777")).toBe(true);
    expect(() => cidrContains("bad", "1.1.1.1")).toThrow();
  });
  test("cidrsOverlap", () => {
    expect(cidrsOverlap("10.0.0.0/8", "10.1.0.0/16")).toBe(true);
    expect(cidrsOverlap("10.0.0.0/16", "10.1.0.0/16")).toBe(false);
  });
  test("splitCidr", () => {
    const r = splitCidr("192.168.1.0/24", 26);
    expect(r.blocks).toEqual(["192.168.1.0/26", "192.168.1.64/26", "192.168.1.128/26", "192.168.1.192/26"]);
    expect(r.total).toBe(4);
    expect(r.truncated).toBe(false);
    const big = splitCidr("10.0.0.0/8", 24, 10);
    expect(big.total).toBe(65536);
    expect(big.blocks.length).toBe(10);
    expect(big.truncated).toBe(true);
    expect(() => splitCidr("10.0.0.0/24", 24)).toThrow();
    expect(() => splitCidr("10.0.0.0/24", 33)).toThrow();
    expect(() => splitCidr("nope", 26)).toThrow();
  });
});

describe("target parsing", () => {
  test("splits, strips comments/urls/ports, dedupes and keeps CIDR", () => {
    const { targets, skipped } = parseTargets(`
      # comment
      8.8.8.8, 1.1.1.1
      https://github.com/foo/bar?x=1
      GITHUB.com   10.0.0.0/24
      8.8.8.8  # dup
      example.org:8080
    `);
    expect(targets).toEqual(["8.8.8.8", "1.1.1.1", "github.com", "10.0.0.0/24", "example.org"]);
    expect(skipped).toBe(0);
  });
  test("caps the list", () => {
    const text = Array.from({ length: MAX_BULK_TARGETS + 7 }, (_, i) => `10.0.${Math.floor(i / 200)}.${i % 200}`).join("\n");
    const r = parseTargets(text);
    expect(r.targets.length).toBe(MAX_BULK_TARGETS);
    expect(r.skipped).toBe(7);
  });
  test("empty input", () => {
    expect(parseTargets("")).toEqual({ targets: [], skipped: 0 });
    expect(parseTargets("# only comment\n\n")).toEqual({ targets: [], skipped: 0 });
  });
});

describe("bulk lookup", () => {
  const deps: BulkDeps = {
    resolve: (t) => {
      if (t === "bad.invalid") throw new Error("Could not resolve");
      return t === "example.org" ? { ip: "93.184.216.34", domain: t } : { ip: t };
    },
    fetch: (ip) => ({ ip: ip!, city: "Testville", region: "TS", country: "US", org: "AS1 Test" }),
  };
  test("collects ok and error rows and reports progress", () => {
    const progress: number[] = [];
    const rows = bulkLookup(["8.8.8.8", "example.org", "bad.invalid", "10.0.0.0/24"], undefined, deps, (d) => progress.push(d));
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "error", "error"]);
    expect(rows[1]!.ip).toBe("93.184.216.34");
    expect(rows[2]!.error).toContain("Could not resolve");
    expect(rows[3]!.error).toContain("subnet calculator");
    expect(progress).toEqual([1, 2, 3, 4]);
  });
  test("formats table rows, csv and tsv safely", () => {
    const rows = bulkLookup(["8.8.8.8", "bad.invalid"], undefined, deps);
    const t = bulkToTableRows(rows);
    expect(t[0]![6]).toBe("OK");
    expect(t[1]![6]).toContain("Error:");
    const csv = bulkToCsv(rows);
    expect(csv.split("\n")[0]).toBe("target,ip,city,region,country,org,status,error");
    expect(csv).toContain('"8.8.8.8","8.8.8.8","Testville"');
    expect(tableToTsv(["a", "b"], [["x\ty", "z\nw"]])).toBe("a\tb\nx y\tz w");
    expect(tableToCsv(["a"], [['he said "hi"']])).toBe('"a"\n"he said ""hi"""');
  });
  test("real offline lookup of private/loopback addresses", () => {
    const rows = bulkLookup(["127.0.0.1", "192.168.1.1", "10.1.2.3"]);
    expect(rows.every((r) => r.status === "ok")).toBe(true);
    expect(rows[1]!.org).toContain("RFC 1918");
  });
});

describe("history & urls", () => {
  test("pushHistory dedupes, orders and caps", () => {
    let h = pushHistory([], { target: "a", summary: "1", time: "t" });
    h = pushHistory(h, { target: "b", summary: "2", time: "t" });
    h = pushHistory(h, { target: "A", summary: "3", time: "t" });
    expect(h.map((x) => x.target)).toEqual(["A", "b"]);
    for (let i = 0; i < 30; i++) h = pushHistory(h, { target: `x${i}`, summary: "", time: "" });
    expect(h.length).toBe(20);
    expect(h[0]!.target).toBe("x29");
  });
  test("urls are encoded", () => {
    expect(ipInfoUrl("8.8.8.8")).toBe("https://ipinfo.io/8.8.8.8");
    expect(bgpUrl("2001:db8::1")).toContain("2001%3Adb8%3A%3A1");
  });
});

describe("IpInfo Studio GUI toolkit", () => {
  const make = () => createIpInfoStudio({ fullscreen: false });
  const rows = (w: SimpleWindow) => w.getValue("tbl_details") as string[][];

  test("renders new controls", () => {
    const html = make().generateHtml();
    for (const id of ["txt_bulk", "btn_bulk_load", "btn_bulk_run", "btn_copy_ip", "btn_copy_table", "btn_save_results", "btn_open_ipinfo", "btn_open_bgp", "txt_check_ip", "btn_in_cidr", "txt_split_prefix", "btn_split_cidr", "btn_ip_formats", "btn_mask_convert", "tbl_history", "btn_clear_history"]) {
      expect(html).toContain(id);
    }
  });

  test("bulk lookup of offline targets fills the table and metrics", async () => {
    const win = make();
    win.setValue("txt_bulk", "127.0.0.1\n192.168.1.1\n# note\n10.0.0.0/24");
    await trigger(win, "btn_bulk_run");
    const r = rows(win);
    expect(r.length).toBe(3);
    expect(r[0]![0]).toBe("127.0.0.1");
    expect(r[2]![6]).toContain("Error");
    expect(String(win.getValue("lbl_metric_ip"))).toContain("Bulk: 3");
    expect(String(win.getValue("lbl_metric_location"))).toContain("Resolved: 2");
    expect(String(win.getValue("lbl_status_bar"))).toContain("2/3 resolved");
  });

  test("empty bulk list warns and leaves the table alone", async () => {
    const win = make();
    win.setValue("txt_bulk", "  \n# nothing");
    const before = JSON.stringify(rows(win));
    await trigger(win, "btn_bulk_run");
    expect(JSON.stringify(rows(win))).toBe(before);
  });

  test("CIDR membership, split, formats and mask conversion", async () => {
    const win = make();
    win.setValue("txt_target", "192.168.1.0/24");
    win.setValue("txt_check_ip", "192.168.1.77");
    await trigger(win, "btn_in_cidr");
    expect(rows(win).some((r) => r[0] === "Contained" && r[1] === "YES")).toBe(true);
    win.setValue("txt_check_ip", "10.0.0.1");
    await trigger(win, "btn_in_cidr");
    expect(rows(win).some((r) => r[0] === "Contained" && r[1] === "NO")).toBe(true);

    win.setValue("txt_split_prefix", "26");
    await trigger(win, "btn_split_cidr");
    expect(rows(win).map((r) => r[1])).toEqual(["192.168.1.0/26", "192.168.1.64/26", "192.168.1.128/26", "192.168.1.192/26"]);
    expect(String(win.getValue("lbl_status_bar"))).toContain("splits into 4");

    win.setValue("txt_target", "192.168.1.1");
    await trigger(win, "btn_ip_formats");
    expect(rows(win).some((r) => r[0] === "Integer" && r[1] === "3232235777")).toBe(true);

    win.setValue("txt_target", "/20");
    await trigger(win, "btn_mask_convert");
    expect(rows(win).some((r) => r[0] === "Netmask" && r[1] === "255.255.240.0")).toBe(true);
    win.setValue("txt_target", "255.255.255.0");
    await trigger(win, "btn_mask_convert");
    expect(rows(win).some((r) => r[0] === "Prefix Length" && r[1] === "/24")).toBe(true);
  });

  test("bad inputs report errors without breaking the table", async () => {
    const win = make();
    win.setValue("txt_target", "not-a-cidr");
    await trigger(win, "btn_in_cidr");
    await trigger(win, "btn_split_cidr");
    win.setValue("txt_target", "300.1.1.1");
    await trigger(win, "btn_ip_formats");
    expect(String(win.getValue("lbl_status_bar"))).toContain("❌");
    win.setValue("txt_target", "192.168.1.0/24");
    win.setValue("txt_split_prefix", "24");
    await trigger(win, "btn_split_cidr");
    expect(String(win.getValue("lbl_status_bar"))).toContain("must be longer");
  });

  test("history records lookups and replays a row", async () => {
    const win = make();
    win.setValue("txt_target", "192.168.1.1");
    await trigger(win, "btn_search");
    win.setValue("txt_target", "10.0.0.0/24");
    await trigger(win, "btn_search");
    const hist = win.getValue("tbl_history") as string[][];
    expect(hist.map((r) => r[0])).toEqual(["10.0.0.0/24", "192.168.1.1"]);
    await trigger(win, "tbl_history", "click", "192.168.1.1");
    expect(String(win.getValue("lbl_metric_ip"))).toContain("192.168.1.1");
    await trigger(win, "btn_clear_history");
    expect(win.getValue("tbl_history")).toEqual([]);
  });

  test("copy / open / save handlers tolerate empty and filled state", async () => {
    const win = make();
    await trigger(win, "btn_clear");
    await trigger(win, "btn_copy_ip");
    await trigger(win, "btn_copy_table");
    await trigger(win, "btn_save_results");
    await trigger(win, "btn_open_ipinfo");
    await trigger(win, "btn_open_bgp");
    win.setValue("txt_target", "192.168.1.1");
    await trigger(win, "btn_search");
    await trigger(win, "btn_copy_ip");
    await trigger(win, "btn_copy_table");
  });

  test("bulk load reads a file via the dialog callback", async () => {
    const f = path.join(os.tmpdir(), `ips-${Date.now()}.txt`);
    fs.writeFileSync(f, "127.0.0.1\n10.1.1.1\n");
    const win = make();
    (win as any).openFile = (_o: any, cb: (p: string | null) => void) => cb(f);
    await trigger(win, "btn_bulk_load");
    expect(String(win.getValue("txt_bulk"))).toContain("10.1.1.1");
    fs.rmSync(f);
  });
});
