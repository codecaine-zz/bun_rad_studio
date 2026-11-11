#!/usr/bin/env bun
import { SimpleCLI } from "../src/index.ts";

const app = SimpleCLI.newApp("brew-cli", "1.0.0").setDescription(
  "Homebrew Package Manager Assistant & Health Dashboard",
);

app.addFlagString("search", "s", "", "Search for Homebrew formula or cask");
app.addFlagBool("list", "l", false, "List installed formulas");
app.addFlagBool("doctor", "d", false, "Run brew doctor diagnostic check");
app.addFlagBool("update", "u", false, "Run brew update and outdated check");

if (!app.parseCli()) process.exit(0);

app.banner("Homebrew Companion CLI", "v1.0.0 - Package Manager Guardian");

function runBrew(args: string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  try {
    const proc = Bun.spawnSync(["brew", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      stdout: proc.stdout.toString("utf8").trim(),
      stderr: proc.stderr.toString("utf8").trim(),
      exitCode: proc.exitCode,
    };
  } catch (err: any) {
    return {
      stdout: "",
      stderr: err?.message ?? String(err),
      exitCode: 127,
    };
  }
}

async function main() {
  const searchQ = app.getFlagString("search").trim();
  if (searchQ) {
    if (searchQ.startsWith("-")) {
      app.error(`Invalid search query "${searchQ}": must not start with '-'.`);
      process.exit(1);
    }
    app.info(`Searching Homebrew for "${searchQ}"...`);
    const res = runBrew(["search", "--", searchQ]);
    if (res.exitCode === 0 && res.stdout) {
      const formulas = res.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      app.table(
        ["Search Results", "Type"],
        formulas.slice(0, 15).map((f) => [f, "formula/cask"]),
      );
    } else if (res.exitCode === 127) {
      app.error(`Homebrew executable not found: ${res.stderr}`);
      process.exit(1);
    } else {
      app.warn(`No formulas found matching "${searchQ}"`);
    }
    return;
  }

  if (app.getFlagBool("list")) {
    app.info("Querying installed Homebrew packages...");
    const res = runBrew(["list", "--formula"]);
    if (res.exitCode !== 0) {
      app.error(
        `Failed to list Homebrew formulas: ${res.stderr || "brew unavailable"}`,
      );
      process.exit(1);
    }
    const items = res.stdout
      ? res.stdout
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
      : [];
    app.success(`Found ${items.length} installed formulas:`);
    app.println(
      items.slice(0, 20).join(", ") +
        (items.length > 20 ? ` ... (+${items.length - 20} more)` : ""),
    );
    return;
  }

  if (app.getFlagBool("doctor")) {
    app.info("Running brew doctor...");
    const res = runBrew(["doctor"]);
    if (res.exitCode === 0) {
      app.success("Your Homebrew system is ready to brew (healthy).");
    } else {
      app.warn("Brew doctor found warnings:");
      app.println(res.stdout || res.stderr);
      process.exit(1);
    }
    return;
  }

  if (app.getFlagBool("update")) {
    app.info("Running brew update & checking outdated packages...");
    const upd = runBrew(["update"]);
    if (upd.exitCode !== 0) {
      app.error(`brew update failed: ${upd.stderr || upd.stdout}`);
      process.exit(1);
    }
    const outdated = runBrew(["outdated"]);
    app.success("Homebrew updated.");
    if (outdated.stdout) {
      app.println(outdated.stdout);
    } else {
      app.info("All installed packages are up to date.");
    }
    return;
  }

  // Default dashboard
  const brewVersion = runBrew(["--version"]);
  const formulaList = runBrew(["list", "--formula"]);
  const caskList = runBrew(["list", "--cask"]);
  const prefixRes = runBrew(["--prefix"]);

  const formulaCount = formulaList.stdout
    ? formulaList.stdout.split("\n").filter((l) => l.trim().length > 0).length
    : 0;
  const caskCount = caskList.stdout
    ? caskList.stdout.split("\n").filter((l) => l.trim().length > 0).length
    : 0;

  app.printKv({
    "Homebrew Version":
      brewVersion.stdout.split("\n")[0] || "Homebrew not installed",
    "Installed Formulas": String(formulaCount),
    "Installed Casks": String(caskCount),
    "Prefix Path": prefixRes.stdout || "/opt/homebrew",
  });
}

main();
