#!/usr/bin/env bun
import { SimpleCLI } from "../src/index.ts";
import * as fs from "node:fs";
import * as path from "node:path";

const app = SimpleCLI.newApp("multirepo-pilot", "1.0.0").setDescription(
  "Multi-Repository Git Orchestrator",
);

app.addFlagString("dir", "d", ".", "Root directory containing repositories");
app.addFlagBool(
  "fetch",
  "f",
  false,
  "Fetch remote status for all repositories",
);

if (!app.parseCli()) process.exit(0);

app.banner("MultiRepo Git Pilot", "v1.0.0 - Workspace Orchestrator");

function runGitInRepo(
  repoDir: string,
  args: string[],
): { stdout: string; exitCode: number } {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd: repoDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: proc.stdout.toString("utf8").trim(),
    exitCode: proc.exitCode,
  };
}

const dir = path.resolve(app.getFlagString("dir"));
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  app.error(`Directory not found: ${dir}`);
  process.exit(1);
}

const doFetch = app.getFlagBool("fetch");
const entries = fs.readdirSync(dir, { withFileTypes: true });
const repos = entries.filter(
  (e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, ".git")),
);

app.info(`Detected ${repos.length} Git repositories in ${dir}`);
const rows = repos.map((r) => {
  const repoPath = path.join(dir, r.name);
  if (doFetch) {
    runGitInRepo(repoPath, ["fetch", "--quiet"]);
  }
  const branchRes = runGitInRepo(repoPath, ["branch", "--show-current"]);
  const branch =
    branchRes.exitCode === 0 && branchRes.stdout ? branchRes.stdout : "HEAD";
  const statusRes = runGitInRepo(repoPath, ["status", "--porcelain"]);
  const status =
    statusRes.exitCode === 0 && statusRes.stdout.length === 0
      ? "CLEAN"
      : "DIRTY";
  return [r.name, branch, status];
});

app.table(["Repository", "Active Branch", "Status"], rows);
