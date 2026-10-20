/**
 * God-Mode Tutorial 04 — The 45 `rad.*` Utility Modules & 10 System CLI Engines as Functions
 *
 * Run:  bun run examples/god_mode_tutorial/04_rad_and_system_engines.ts
 */
import { rad } from "../../src/features/rad/index.ts";
import { searchFiles } from "../../src/features/fd/fdCoordinator.ts";
import { buildReplacerRegex, replaceText } from "../../src/features/sd/sdDoers.ts";
import { computeCodeStats } from "../../src/features/tokei/tokeiCoordinator.ts";
import { analyzeDirectory } from "../../src/features/gdu/gduCoordinator.ts";
import { formatBytes } from "../../src/features/gdu/gduDoers.ts";
import { shouldTrigger } from "../../src/features/watchexec/watchexecDoers.ts";

// 1. Strings, Arrays, Validation & Sparklines (rad.*)
console.log("slug   →", rad.strutils.slugify("Codecaine File Manager v1.5 God-Mode!"));
console.log("email  →", rad.strutils.maskEmail("architect@bun-rad-studio.dev"));
console.log("chunk  →", JSON.stringify(rad.arrutils.chunk(["macOS", "Win11", "Linux", "BSD"], 2)));
console.log("spark  →", rad.cliutils.renderSparkline([12, 48, 72, 96, 110, 120, 120]));

// 2. In-Memory SQLite KV, Statistics, Semver & SHA-256 Crypto (rad.*)
const db = rad.sqliteutils.openDb(":memory:");
rad.sqliteutils.createKvTable(db, "telemetry");
rad.sqliteutils.setKv(db, "telemetry", "flagship_gpu", "M4 Ultra 80c + Dual RTX 5090");
console.log("sqlite →", rad.sqliteutils.getKv(db, "telemetry", "flagship_gpu"));
console.log("stats  → mean fps:", rad.statutils.mean([119.8, 120.0, 120.2]), "| semver:", rad.semverutils.satisfiesRange("1.5.0", "^1.4.0"));
console.log("sha256 →", rad.cryptoutils.sha256("bun_rad_studio_v1.5.0").slice(0, 24) + "...");

// 3. The 10 System CLI Tools Called Directly as Plain TypeScript Functions
const matches = await searchFiles({
  pattern: "godmode", rootPath: "examples", hidden: false, absolute: false,
});
console.log("fd     →", matches.length, "matched files, first:", matches[0]?.displayPath);

console.log("sd     →", replaceText("Target: 60Hz Standard", buildReplacerRegex("60Hz Standard", true, "g"), "120Hz ProMotion HDR"));

const codeStats = await computeCodeStats({
  paths: ["examples/god_mode_tutorial"], sort: "code", showFiles: false, hidden: false,
});
console.log("tokei  →", codeStats.map((s) => `${s.language}: ${s.stats.code} LOC`).join(", "));

const diskUsage = await analyzeDirectory({
  targetDir: "examples/god_mode_tutorial", nonInteractive: true, showItemCount: true,
  showRelativeSize: true, showDisks: false, summarize: false, noHidden: true, si: false, ignoreDirs: [],
});
console.log("gdu    →", formatBytes(diskUsage.size), `(${diskUsage.itemCount} files)`);
console.log("watch  → trigger rebuild on .ts?", shouldTrigger("src/simplegui.ts", ["ts"], ["node_modules"]));
