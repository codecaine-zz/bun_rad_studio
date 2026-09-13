import { describe, expect, it } from "bun:test";
import {
  buildProcessTree,
  filterProcesses,
  formatJsonProcesses,
  formatTreeLines,
  parsePsLine,
  parsePsOutput,
  sortProcesses,
} from "./procsDoers.ts";
import type { ProcessInfo } from "./procsTypes.ts";

const samplePsOutput = `
  PID  PPID USER              %CPU %MEM STAT      TIME COMMAND
    1     0 root               0.1  0.1 Ss     2:21.80 /sbin/launchd
  321     1 root               1.5  0.2 Ss     1:12.97 /usr/libexec/logd
  450     1 codecaine         12.0  3.5 S      0:45.10 /opt/homebrew/bin/bun run
  500   450 codecaine          0.0  0.5 S      0:01.00 /bin/zsh
`;

describe("procs doers", () => {
  it("parses single ps line correctly", () => {
    const line = "  450     1 codecaine         12.0  3.5 S      0:45.10 /opt/homebrew/bin/bun run";
    const parsed = parsePsLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed?.pid).toBe(450);
    expect(parsed?.ppid).toBe(1);
    expect(parsed?.user).toBe("codecaine");
    expect(parsed?.cpu).toBe(12.0);
    expect(parsed?.mem).toBe(3.5);
    expect(parsed?.stat).toBe("S");
    expect(parsed?.time).toBe("0:45.10");
    expect(parsed?.command).toBe("/opt/homebrew/bin/bun run");
  });

  it("parses ps output block", () => {
    const procs = parsePsOutput(samplePsOutput);
    expect(procs.length).toBe(4);
    expect(procs[0]?.pid).toBe(1);
  });

  it("filters processes by keyword", () => {
    const procs = parsePsOutput(samplePsOutput);
    const filtered = filterProcesses(procs, "bun");
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.pid).toBe(450);
  });

  it("sorts processes by cpu and mem", () => {
    const procs = parsePsOutput(samplePsOutput);
    const sortedCpu = sortProcesses(procs, "cpu");
    expect(sortedCpu[0]?.pid).toBe(450);

    const sortedPid = sortProcesses(procs, "pid");
    expect(sortedPid[0]?.pid).toBe(1);
  });

  it("builds process tree hierarchy", () => {
    const procs = parsePsOutput(samplePsOutput);
    const tree = buildProcessTree(procs);
    expect(tree.length).toBe(1); // root PID 1
    expect(tree[0]?.process.pid).toBe(1);
    expect(tree[0]?.children.length).toBe(2); // PID 321 and 450

    const lines = formatTreeLines(tree);
    expect(lines.length).toBe(4);
  });

  it("formats processes as JSON", () => {
    const procs = parsePsOutput(samplePsOutput);
    const json = formatJsonProcesses(procs);
    expect(json).toContain('"pid": 1');
    expect(JSON.parse(json).length).toBe(4);
  });

  it("filters processes by user", () => {
    const { filterProcessesByUser } = require("./procsDoers.ts");
    const procs = parsePsOutput(samplePsOutput);
    const rootProcs = filterProcessesByUser(procs, "root");
    expect(rootProcs.length).toBe(2);
    expect(rootProcs.every((p: any) => p.user === "root")).toBe(true);

    const userProcs = filterProcessesByUser(procs, "codecaine");
    expect(userProcs.length).toBe(2);
  });

  it("parses lsof output and attaches listening ports", () => {
    const { parseLsofOutput, attachListeningPorts } = require("./procsDoers.ts");
    const rawLsof = `COMMAND     PID      USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
rapportd    450 codecaine   10u  IPv4  0x41ec8278c949b30      0t0  TCP *:49152 (LISTEN)
node        500 codecaine    9u  IPv4  0xcf5aabd609dea729      0t0  TCP *:3000 (LISTEN)
`;
    const portMap = parseLsofOutput(rawLsof);
    expect(portMap.get(450)).toEqual(["49152"]);
    expect(portMap.get(500)).toEqual(["3000"]);

    const procs = parsePsOutput(samplePsOutput);
    const withPorts = attachListeningPorts(procs, portMap);
    const p450 = withPorts.find((p) => p.pid === 450);
    expect(p450?.ports).toEqual(["49152"]);
  });
});
