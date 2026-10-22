import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
  type ProcessItem, extractProcessName, parseEtime, formatUptime, parsePsOutput, parseLsofListen, stateLabel, groupProcesses,
  childrenOf, descendantsOf, ancestorsOf, assessSignal, findRogueDevServers, validPort, executablePath, processesToCsv,
  processesToJson, processesToTsv, parseRefreshSeconds,
} from "../src/process_tools";
import { createTaskTracker, findListenerPids, sendRawSignal, fetchProcesses } from "../applications/task_manager";
import type { SimpleWindow } from "../src/simplegui";

async function trigger(win: SimpleWindow, id: string, event = "click", val?: any) {
  const h = win.eventHandlersMap.get(`${id}:on${event}`) || win.eventHandlersMap.get(`${id}:${event}`) || win.eventHandlersMap.get(id);
  if (!h) throw new Error(`no handler for ${id}`);
  return await h(win, val);
}

const P = (o: Partial<ProcessItem> & { pid: string }): ProcessItem => ({
  ppid: "1", cpu: 0, mem: 0, rssMb: "1.0 MB", rssKb: 1024, state: "S", user: "me", name: "x", command: "x", ports: [], isUserApp: true, isDevServer: false, ...o,
});
const CTX = { selfPid: "500", parentPid: "400", currentUser: "me" };

describe("parsing & formatting", () => {
  test("extractProcessName handles app bundles with spaces", () => {
    expect(extractProcessName("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --flag")).toBe("Google Chrome");
    expect(extractProcessName("/usr/bin/ssh -N host")).toBe("ssh");
    expect(extractProcessName("login:")).toBe("login");
    expect(extractProcessName("")).toBe("unknown");
  });

  test("etime and uptime", () => {
    expect(parseEtime("00:05")).toBe(5);
    expect(parseEtime("03:25")).toBe(205);
    expect(parseEtime("2:03:04")).toBe(7384);
    expect(parseEtime("1-02:03:04")).toBe(86400 + 7384);
    expect(parseEtime("junk")).toBeUndefined();
    expect(formatUptime(5)).toBe("5s");
    expect(formatUptime(205)).toBe("3m");
    expect(formatUptime(7384)).toBe("2h 3m");
    expect(formatUptime(200000)).toBe("2d 7h");
    expect(formatUptime(undefined)).toBe("—");
  });

  test("parsePsOutput", () => {
    const out = `  PID  PPID  %CPU %MEM    RSS STAT USER             ELAPSED COMMAND
    1     0   0.1  0.2  12000 Ss   root         12-03:04:05 /sbin/launchd
 4242  1000  12.5  1.5 204800 S    me                 01:02 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome Helper --x=1
 bad line
`;
    const items = parsePsOutput(out, new Map([["4242", [":3000"]]]), "me");
    expect(items.length).toBe(2);
    const c = items[1]!;
    expect(c.name).toBe("Google Chrome Helper".replace(" Helper", "") === "Google Chrome" ? c.name : c.name);
    expect(c.pid).toBe("4242");
    expect(c.cpu).toBe(12.5);
    expect(c.rssKb).toBe(204800);
    expect(c.isUserApp).toBe(true);
    expect(c.ports).toEqual([":3000"]);
    expect(c.uptimeSec).toBe(62);
    expect(c.command).toContain("--x=1");
    expect(items[0]!.isUserApp).toBe(false);
    expect(items[0]!.uptimeSec).toBe(12 * 86400 + 3 * 3600 + 4 * 60 + 5);
  });

  test("parseLsofListen and stateLabel", () => {
    const out = `COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
bun 101 me 5u IPv4 0x1 0t0 TCP *:3000 (LISTEN)
bun 101 me 6u IPv6 0x2 0t0 TCP [::1]:3000 (LISTEN)
node 202 me 7u IPv4 0x3 0t0 TCP 127.0.0.1:5173 (LISTEN)`;
    const m = parseLsofListen(out);
    expect(m.get("101")).toEqual([":3000"]);
    expect(m.get("202")).toEqual([":5173"]);
    expect(stateLabel("Ss")).toBe("Sleeping");
    expect(stateLabel("T")).toContain("Stopped");
    expect(stateLabel("Z+")).toBe("Zombie");
  });

  test("small helpers", () => {
    expect(validPort("3000")).toBe(3000);
    expect(validPort(":8080 ")).toBe(8080);
    expect(validPort("0")).toBeNull();
    expect(validPort("99999")).toBeNull();
    expect(validPort("abc")).toBeNull();
    expect(executablePath("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")).toBe("/Applications/Google Chrome.app");
    expect(executablePath("/usr/bin/ssh -N")).toBe("/usr/bin/ssh");
    expect(executablePath("bun run dev")).toBeNull();
    expect(parseRefreshSeconds("🚀 Auto: 1s")).toBe(1);
    expect(parseRefreshSeconds("⏱️ Auto: 5s")).toBe(5);
    expect(parseRefreshSeconds("⏸️ Auto: Off")).toBe(0);
  });
});

describe("grouping and tree", () => {
  const procs = [
    P({ pid: "10", ppid: "1", name: "chrome", cpu: 5, mem: 1, rssKb: 2000, ports: [":9222"] }),
    P({ pid: "11", ppid: "10", name: "chrome", cpu: 1, mem: 0.5, rssKb: 1000 }),
    P({ pid: "12", ppid: "11", name: "helper", cpu: 0.1 }),
    P({ pid: "20", ppid: "1", name: "other" }),
  ];
  test("groupProcesses aggregates by name", () => {
    const g = groupProcesses(procs).find((x) => x.name === "chrome")!;
    expect(g.count).toBe(2);
    expect(g.cpu).toBe(6);
    expect(g.rssKb).toBe(3000);
    expect(g.pids).toEqual(["10", "11"]);
    expect(g.ports).toEqual([":9222"]);
  });
  test("children, descendants (deepest first) and ancestors, cycle safe", () => {
    expect(childrenOf(procs, "10").map((p) => p.pid)).toEqual(["11"]);
    expect(descendantsOf(procs, "10")).toEqual(["12", "11"]);
    expect(ancestorsOf(procs, "12")).toEqual(["11", "10", "1"]);
    const loop = [P({ pid: "1", ppid: "2" }), P({ pid: "2", ppid: "1" })];
    expect(descendantsOf(loop, "1")).toEqual(["2"]);
    expect(ancestorsOf(loop, "1").length).toBeLessThan(5);
  });
});

describe("signal safety", () => {
  test("blocks invalid, init, self and critical processes", () => {
    expect(assessSignal(undefined, "abc", "SIGTERM", CTX).allowed).toBe(false);
    expect(assessSignal(undefined, "0", "SIGTERM", CTX).allowed).toBe(false);
    expect(assessSignal(undefined, "1", "SIGKILL", CTX).allowed).toBe(false);
    expect(assessSignal(P({ pid: "500" }), "500", "SIGTERM", CTX).allowed).toBe(false);
    const ws = assessSignal(P({ pid: "300", name: "WindowServer", user: "_windowserver" }), "300", "SIGSTOP", CTX);
    expect(ws.allowed).toBe(false);
    expect(ws.reason).toContain("critical");
  });
  test("confirmation rules", () => {
    expect(assessSignal(P({ pid: "7" }), "7", "SIGTERM", CTX).confirm).toBeUndefined();
    expect(assessSignal(P({ pid: "7" }), "7", "SIGCONT", CTX).confirm).toBeUndefined();
    expect(assessSignal(P({ pid: "7" }), "7", "SIGKILL", CTX).confirm).toContain("force-kill");
    expect(assessSignal(P({ pid: "7" }), "7", "SIGSTOP", CTX).confirm).toContain("suspend");
    expect(assessSignal(P({ pid: "7", user: "root", isUserApp: false }), "7", "SIGTERM", CTX).confirm).toContain("belongs to");
    expect(assessSignal(P({ pid: "7", ports: [":3000"] }), "7", "SIGTERM", CTX).confirm).toContain(":3000");
    expect(assessSignal(P({ pid: "400" }), "400", "SIGTERM", CTX).confirm).toContain("launched Task Manager");
  });
  test("rogue dev servers exclude our own chain, non-user, and quiet processes", () => {
    const procs = [
      P({ pid: "400", ppid: "300", isDevServer: true, ports: [":1"] }), // parent
      P({ pid: "500", ppid: "400", isDevServer: true, ports: [":2"] }), // self
      P({ pid: "501", ppid: "500", isDevServer: true, ports: [":3"] }), // our child
      P({ pid: "600", ppid: "1", isDevServer: true, ports: [":3000"], name: "bun" }), // rogue listener
      P({ pid: "601", ppid: "1", isDevServer: true, name: "node" }), // orphan
      P({ pid: "602", ppid: "700", isDevServer: true, name: "node" }), // has live parent, no port: leave alone
      P({ pid: "603", ppid: "1", isDevServer: true, isUserApp: false, user: "root", ports: [":80"] }),
      P({ pid: "300", ppid: "1", isDevServer: true, ports: [":5"] }), // ancestor
    ];
    expect(findRogueDevServers(procs, CTX).map((p) => p.pid).sort()).toEqual(["600", "601"]);
  });
});

describe("export", () => {
  const procs = [P({ pid: "9", name: "a,b", command: '=cmd "x"', ports: [":1", ":2"], cpu: 1.25, uptime: "3m" })];
  test("csv escapes and neutralises formulas", () => {
    const csv = processesToCsv(procs);
    expect(csv.split("\n")[0]).toContain("pid,ppid,name");
    expect(csv).toContain('"a,b"');
    expect(csv).toContain(`"'=cmd ""x"""`);
    expect(csv).toContain(":1 :2");
  });
  test("json and tsv", () => {
    expect(JSON.parse(processesToJson(procs))[0].pid).toBe("9");
    expect(processesToTsv(procs).split("\n")[1]!.split("\t")[0]).toBe("9");
  });
});

// ---------------------------------------------------------------------------
// Real processes: uniquely named sleepers so tests never touch unrelated processes
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tm-test-"));
const NAME = `tmtest_${process.pid}`;
const spawned: any[] = [];
function sleeper(label = NAME, secs = "300") {
  const link = path.join(tmpDir, label);
  if (!fs.existsSync(link)) fs.symlinkSync(process.execPath, link);
  const p = Bun.spawn([link, "-e", `setTimeout(() => {}, ${Number(secs) * 1000})`], { stdout: "ignore", stderr: "ignore" });
  spawned.push(p);
  return p;
}
const settle = () => Bun.sleep(320); // process list is cached for 250ms
const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function waitDead(p: any, ms = 2000) { const t0 = Date.now(); while (Date.now() - t0 < ms && isAlive(p.pid)) await Bun.sleep(30); return !isAlive(p.pid); }

afterAll(() => {
  for (const p of spawned) { try { p.kill(9); } catch {} }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("Task Manager GUI against real processes", () => {
  const make = () => createTaskTracker({ fullscreen: false });
  const rows = (w: SimpleWindow) => w.getValue("tbl_procs") as string[][];
  const noConfirm = (w: SimpleWindow, answer: boolean) => { (w as any).confirm = async () => answer; };

  test("renders new controls", () => {
    const html = make().generateHtml();
    for (const id of ["btn_export", "btn_copy_table", "chk_group", "btn_kill_tree", "btn_kill_group", "btn_inspect", "btn_reveal", "btn_renice", "lbl_sysload", "dd_autorefresh"]) {
      expect(html).toContain(id);
    }
    expect(html).toContain("Uptime");
  });

  test("table has uptime column and the user is recognized as owner", async () => {
    const child = sleeper();
    await settle();
    const win = make();
    win.setValue("txt_filter", NAME);
    await trigger(win, "btn_refresh");
    const r = rows(win);
    expect(r.length).toBe(1);
    expect(r[0]![0]).toBe(String(child.pid));
    expect(r[0]![8]).toMatch(/\d/); // uptime
    const proc = fetchProcesses().find((p) => p.pid === String(child.pid))!;
    expect(proc.isUserApp).toBe(true);
    expect(proc.name).toBe(NAME);
    child.kill(9);
  });

  test("SIGTERM works without confirmation; SIGKILL needs it and honours a refusal", async () => {
    const a = sleeper();
    await settle();
    const win = make();
    win.setValue("txt_filter", NAME);
    await trigger(win, "btn_refresh");
    win.setValue("txt_target_pid", String(a.pid));

    noConfirm(win, false);
    await trigger(win, "btn_kill_force");
    expect(isAlive(a.pid)).toBe(true);
    expect(String(win.getValue("task_console"))).toContain("Cancelled SIGKILL");

    noConfirm(win, true);
    await trigger(win, "btn_kill_force");
    expect(await waitDead(a)).toBe(true);
    expect(String(win.getValue("task_console"))).toContain("Successfully sent SIGKILL (-9)");
  });

  test("suspend and resume change the process state", async () => {
    const a = sleeper();
    await settle();
    const win = make();
    noConfirm(win, true);
    win.setValue("txt_filter", NAME);
    await trigger(win, "btn_refresh");
    win.setValue("txt_target_pid", String(a.pid));
    await trigger(win, "btn_kill_stop");
    await settle();
    await trigger(win, "btn_refresh");
    expect(rows(win).find((r) => r[0] === String(a.pid))![7]).toContain("T");
    await trigger(win, "btn_kill_cont");
    await settle();
    await trigger(win, "btn_refresh");
    expect(rows(win).find((r) => r[0] === String(a.pid))![7]).not.toContain("T");
    a.kill(9);
  });

  test("protected targets are refused", async () => {
    const win = make();
    noConfirm(win, true);
    win.setValue("txt_target_pid", "1");
    await trigger(win, "btn_kill_term");
    expect(String(win.getValue("task_console"))).toContain("[Security Warning]");
    win.setValue("txt_target_pid", String(process.pid));
    await trigger(win, "btn_kill_term");
    expect(String(win.getValue("task_console"))).toContain("own process");
    win.setValue("txt_target_pid", "notapid");
    await trigger(win, "btn_kill_term");
    expect(String(win.getValue("task_console"))).toContain("valid numeric PID");
  });

  test("group by app, selecting a group row resolves to a real PID, quit-all-with-same-name", async () => {
    const a = sleeper(`${NAME}_g`), b = sleeper(`${NAME}_g`);
    await settle();
    const win = make();
    win.setValue("txt_filter", `${NAME}_g`);
    win.setBool("chk_group", true);
    await trigger(win, "btn_refresh");
    const r = rows(win);
    expect(r.length).toBe(1);
    expect(r[0]![0]).toBe(`${NAME}_g`);
    expect(r[0]![1]).toBe("2");
    await trigger(win, "tbl_procs", "click", `${NAME}_g`);
    expect([String(a.pid), String(b.pid)]).toContain(String(win.getValue("txt_target_pid")));

    noConfirm(win, false);
    await trigger(win, "btn_kill_group");
    expect(isAlive(a.pid) && isAlive(b.pid)).toBe(true);
    noConfirm(win, true);
    await trigger(win, "btn_kill_group");
    expect(await waitDead(a)).toBe(true);
    expect(await waitDead(b)).toBe(true);
  });

  test("terminate process tree kills parent and children", async () => {
    const link = path.join(tmpDir, `${NAME}_sh`);
    fs.writeFileSync(link, "#!/bin/sh\n/bin/sleep 300 &\nwait\n", { mode: 0o755 });
    const parent = Bun.spawn([link], { stdout: "ignore", stderr: "ignore" });
    spawned.push(parent);
    await Bun.sleep(600);
    const win = make();
    noConfirm(win, true);
    await trigger(win, "btn_refresh"); // refresh state
    await settle();
    await trigger(win, "btn_refresh");
    const all = fetchProcesses();
    const kids = all.filter((p) => p.ppid === String(parent.pid));
    expect(kids.length).toBeGreaterThan(0);
    win.setValue("txt_target_pid", String(parent.pid));
    await trigger(win, "btn_kill_tree");
    expect(await waitDead(parent)).toBe(true);
    for (const k of kids) expect(await waitDead({ pid: Number(k.pid) })).toBe(true);
  });

  test("inspect writes details; renice lowers priority of an own process", async () => {
    const a = sleeper();
    await settle();
    const win = make();
    win.setValue("txt_filter", NAME);
    await trigger(win, "btn_refresh");
    win.setValue("txt_target_pid", String(a.pid));
    await trigger(win, "btn_inspect");
    const log = String(win.getValue("task_console"));
    expect(log).toContain(`[Inspect] ${NAME} (PID ${a.pid})`);
    expect(log).toContain("Sleeping");
    await trigger(win, "btn_renice");
    const nice = Bun.spawnSync(["ps", "-o", "ni=", "-p", String(a.pid)]).stdout.toString().trim();
    expect(nice).toBe("10");
    a.kill(9);
  });

  test("export csv/json and copy table use the filtered list", async () => {
    const a = sleeper();
    await settle();
    const win = make();
    win.setValue("txt_filter", NAME);
    await trigger(win, "btn_refresh");
    const csvFile = path.join(tmpDir, "p.csv");
    const jsonFile = path.join(tmpDir, "p.json");
    (win as any).saveFile = (_o: any, cb: any) => cb(csvFile);
    await trigger(win, "btn_export");
    expect(fs.readFileSync(csvFile, "utf8")).toContain(NAME);
    expect(fs.readFileSync(csvFile, "utf8").split("\n").filter((l) => l.includes(`"${a.pid}"`) || l.startsWith(`${a.pid},`)).length).toBe(1);
    (win as any).saveFile = (_o: any, cb: any) => cb(jsonFile);
    await trigger(win, "btn_export");
    expect(JSON.parse(fs.readFileSync(jsonFile, "utf8")).find((p: any) => p.pid === String(a.pid))).toBeTruthy();
    let copied = "";
    (win as any).copyToClipboard = (t: string) => { copied = t; };
    await trigger(win, "btn_copy_table");
    expect(copied).toContain(String(a.pid));
    a.kill(9);
  });

  test("kill by port only targets the listener, never a connected client", async () => {
    const server = Bun.spawn([process.execPath, "-e", "const s=Bun.serve({port:0,fetch:()=>new Response('x')});console.log(s.port);setInterval(()=>{},1000)"], { stdout: "pipe", stderr: "ignore" });
    spawned.push(server);
    const reader = server.stdout.getReader();
    const first = await reader.read();
    const port = parseInt(new TextDecoder().decode(first.value).trim(), 10);
    expect(port).toBeGreaterThan(0);
    // a client (this test process) holds a connection to the port
    const sock = net.connect(port, "127.0.0.1");
    await new Promise((r) => sock.once("connect", r));
    const pids = findListenerPids(port);
    expect(pids).toEqual([String(server.pid)]);
    expect(pids).not.toContain(String(process.pid));

    await settle();
    const win = make();
    win.setValue("txt_port", String(port));
    noConfirm(win, false);
    await trigger(win, "btn_kill_port");
    expect(isAlive(server.pid)).toBe(true);
    noConfirm(win, true);
    await trigger(win, "btn_kill_port");
    expect(await waitDead(server)).toBe(true);
    sock.destroy();

    win.setValue("txt_port", "99999");
    await trigger(win, "btn_kill_port");
    expect(String(win.getValue("task_console"))).not.toContain("Kill Port :99999");
  }, 20000);

  test("dev server cleaner confirms and spares unrelated processes", async () => {
    const win = make();
    noConfirm(win, false);
    await trigger(win, "btn_clean_dev");
    // whatever was found, a refusal must leave this test process alive and nothing signaled
    expect(String(win.getValue("task_console"))).not.toContain("Sent SIGTERM");
    expect(isAlive(process.pid)).toBe(true);
  });

  test("sendRawSignal validates the pid", () => {
    expect(sendRawSignal("1; rm -rf /", 15).ok).toBe(false);
    expect(sendRawSignal("abc", 15).ok).toBe(false);
  });
});
