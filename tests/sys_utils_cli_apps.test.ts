import { describe, it, expect } from "bun:test";
import { resolve } from "node:path";

describe("⚡ Bun Sys Utils Modern CLI Suite Specification", () => {
  const runCli = async (script: string, args: string[] = []): Promise<{ stdout: string; stderr: string; output: string; exitCode: number }> => {
    const fullScript = resolve(process.cwd(), script);
    const proc = Bun.spawn(["bun", fullScript, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    return { stdout, stderr, output: stdout + stderr, exitCode };
  };

  it("1. Tokei CLI outputs code analysis", async () => {
    const res = await runCli("cli_apps/tokei_cli.ts", ["src/shared"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("TypeScript");
  });

  it("2. Sd CLI counts pattern matches without modifying files", async () => {
    const res = await runCli("cli_apps/sd_cli.ts", ["-c", "name", "package.json"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toMatch(/match\(es\)/);
  });

  it("3. Gdu CLI executes in non-interactive mode", async () => {
    const res = await runCli("cli_apps/gdu_cli.ts", ["-n", "-s", "src/shared"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("shared");
  });

  it("4. Doggo CLI performs DNS query", async () => {
    const res = await runCli("cli_apps/doggo_cli.ts", ["example.com", "A", "--short"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it("5. IpInfo CLI displays help or calculates CIDR", async () => {
    const res = await runCli("cli_apps/ipinfo_cli.ts", ["192.168.1.0/24"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("192.168.1.0");
    expect(res.output).toContain("255.255.255.0");
  });

  it("6. Subfinder CLI runs domain query with silent flag or displays help", async () => {
    const res = await runCli("cli_apps/subfinder_cli.ts", ["--help"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("subfinder");
  });

  it("7. Procs CLI parses and lists active processes", async () => {
    const res = await runCli("cli_apps/procs_cli.ts", ["-n", "5"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("PID");
  });

  it("8. Watchexec CLI displays help with correct usage flags", async () => {
    const res = await runCli("cli_apps/watchexec_cli.ts", ["--help"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("watchexec");
  });

  it("9. Fd CLI searches for files in workspace", async () => {
    const res = await runCli("cli_apps/fd_cli.ts", ["package.json", "."]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("package.json");
  });

  it("10. Rip CLI displays seance graveyard status", async () => {
    const res = await runCli("cli_apps/rip_cli.ts", ["--seance"]);
    expect(res.exitCode).toBe(0);
  });
});
