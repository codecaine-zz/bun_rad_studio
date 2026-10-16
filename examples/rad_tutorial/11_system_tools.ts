// RAD tutorial 11: the system tools as plain functions. Run it with:  bun run examples/rad_tutorial/11_system_tools.ts
import { searchFiles } from "../../src/features/fd/fdCoordinator.ts";
import { buildReplacerRegex, replaceText } from "../../src/features/sd/sdDoers.ts";
import { computeCodeStats } from "../../src/features/tokei/tokeiCoordinator.ts";
import { analyzeDirectory } from "../../src/features/gdu/gduCoordinator.ts";
import { formatBytes } from "../../src/features/gdu/gduDoers.ts";
import { shouldTrigger } from "../../src/features/watchexec/watchexecDoers.ts";

// fd: find files by name
const found = await searchFiles({ pattern: "simplegui", rootPath: "src", hidden: false, absolute: false });
console.log("fd     ", found.length, "files match, first:", found[0]?.displayPath);

// sd: search and replace in text
console.log("sd     ", replaceText("Hello World", buildReplacerRegex("World", true, "g"), "Bun"));

// tokei: count lines of code
const stats = await computeCodeStats({ paths: ["examples"], sort: "code", showFiles: false, hidden: false });
console.log("tokei  ", stats.map((s) => `${s.language} ${s.stats.code} lines`).join(", "));

// gdu: how big is a folder
const root = await analyzeDirectory({ targetDir: "examples", nonInteractive: true, showItemCount: true, showRelativeSize: true, showDisks: false, summarize: false, noHidden: true, si: false, ignoreDirs: [] });
console.log("gdu    ", formatBytes(root.size));

// watchexec: would this change restart a watcher?
console.log("watch  ", shouldTrigger("src/index.ts", ["ts"], ["node_modules"]));
