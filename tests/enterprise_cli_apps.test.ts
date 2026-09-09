import { describe, it, expect } from "bun:test";
import { resolve } from "node:path";

describe("⚡ Enterprise 16-Application CLI Suite Specification", () => {
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

  it("1. Database CLI executes in-memory queries and displays schema", async () => {
    const res = await runCli("cli_apps/database_cli.ts", ["--db", ":memory:", "--query", "SELECT 42 as answer"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Database Studio CLI");
    expect(res.output).toContain("42");
  });

  it("2. System CLI displays hardware telemetry and memory", async () => {
    const res = await runCli("cli_apps/system_cli.ts", ["--telemetry"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("System & Package Workstation CLI");
    expect(res.output).toContain("System Memory");
  });

  it("3. Task Watcher CLI supports single execution (--once)", async () => {
    const res = await runCli("cli_apps/watcher_cli.ts", ["--once", "--exec", "echo 'watcher_test_ok'"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Task Watcher CLI");
    expect(res.output).toContain("completed with exit code 0");
  });

  it("4. JSON Query CLI queries nested fields", async () => {
    const res = await runCli("cli_apps/json_cli.ts", ["--query", ".users[0].name"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Alice Smith");
  });

  it("5. DevTools CLI executes native file search (fd)", async () => {
    const res = await runCli("cli_apps/devtools_cli.ts", ["--tool", "fd", "--pattern", "package.json", "--target", "./"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("DevTools Studio Pro CLI");
    expect(res.output).toContain("package.json");
  });

  it("6. Process Monitor CLI lists top processes", async () => {
    const res = await runCli("cli_apps/process_cli.ts", ["--limit", "5"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Process Monitor Studio CLI");
    expect(res.output).toContain("PID");
  });

  it("7. API CLI generates cURL command", async () => {
    const res = await runCli("cli_apps/api_cli.ts", ["--url", "https://api.test/v1", "--curl"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("curl -X GET");
    expect(res.output).toContain("https://api.test/v1");
  });

  it("8. Convert CLI converts CSV to JSON", async () => {
    const res = await runCli("cli_apps/convert_cli.ts", ["--from", "csv", "--to", "json"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain('"name": "Sarah Jenkins"');
  });

  it("9. Crypto CLI calculates SHA-256 and UUID", async () => {
    const res = await runCli("cli_apps/crypto_cli.ts", ["--text", "EnterpriseSecurity2026", "--algo", "sha256"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Crypto & Hashing Studio CLI");
    expect(res.output).toContain("SHA256 Hash computed");

    const uuidRes = await runCli("cli_apps/crypto_cli.ts", ["--uuid"]);
    expect(uuidRes.exitCode).toBe(0);
    expect(uuidRes.output).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
  });

  it("10. Regex CLI tests patterns and extracts groups", async () => {
    const res = await runCli("cli_apps/regex_cli.ts", ["--pattern", "([a-z]+)@([a-z.]+)", "--text", "admin@domain.com"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Regex Studio Pro CLI");
    expect(res.output).toContain("admin@domain.com");
  });

  it("11. Bundler CLI validates entry point requirement", async () => {
    const res = await runCli("cli_apps/bundler_cli.ts", ["--entry", "./non_existent_file.ts"]);
    expect(res.exitCode).toBe(1);
    expect(res.output).toContain("Entry file not found");
  });

  it("12. Network Forensics CLI probes localhost port", async () => {
    const res = await runCli("cli_apps/network_cli.ts", ["--scan", "127.0.0.1", "--ports", "4567,9999", "--timeout", "100"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Network Forensics Studio CLI");
    expect(res.output).toContain("127.0.0.1");
  });

  it("13. Git CLI displays status table", async () => {
    const res = await runCli("cli_apps/git_cli.ts", ["--status"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Git Workbench CLI");
    expect(res.output).toContain("Branch");
  });

  it("14. Markdown CLI computes reading statistics", async () => {
    const res = await runCli("cli_apps/markdown_cli.ts", ["--file", "./README.md", "--stats"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Markdown Studio Pro CLI");
    expect(res.output).toContain("Words");
    expect(res.output).toContain("Reading Time");
  });

  it("15. Color CLI converts HEX and computes WCAG contrast", async () => {
    const res = await runCli("cli_apps/color_cli.ts", ["--color", "#0284c7"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Color & Design Token Studio CLI");
    expect(res.output).toContain("Contrast vs White");
    expect(res.output).toContain("50-950 Tonal Scale");
  });

  it("16. Environment CLI audits .env file", async () => {
    const res = await runCli("cli_apps/env_cli.ts", ["--file", "./.env"]);
    expect(res.exitCode).toBe(0);
    expect(res.output).toContain("Environment Secret & Config Auditor");
  });
});
