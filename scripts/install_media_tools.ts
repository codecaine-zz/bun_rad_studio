/**
 * Checks for, and installs, the helper programs the File Manager's "Convert & process" window uses:
 * ffmpeg (video and sound), ImageMagick (pictures) and pandoc (documents).
 *
 *   bun run tools:check                    show what is installed
 *   bun run tools:install                  install what is missing (asks first)
 *   bun run tools:install ffmpeg pandoc    install only these
 *   bun run tools:install --yes            do not ask
 *
 * It uses the same catalog and install plans as the File Manager, so both always do the same thing:
 *   macOS / Linux with Homebrew:  brew install ffmpeg-full imagemagick-full pandoc
 *   Windows:                      winget (or Scoop) install
 *   Linux without Homebrew:       your system's package manager (it asks for your password in this terminal)
 * Where the package manager itself is missing, it prints how to get it instead of guessing.
 */
import { detectManagers, toolStatus } from "../src/features/filemanager/fmBatch";
import { createContext } from "../src/features/filemanager/fmCore";
import { TOOLS, TOOL_IDS, type ToolId } from "../src/features/filemanager/fmTools";

const args = process.argv.slice(2);
const command = args[0] === "install" || args[0] === "check" ? args[0] : "check";
const yes = args.includes("--yes") || args.includes("-y");
const named = args.filter((a) => (TOOL_IDS as string[]).includes(a)) as ToolId[];
const unknown = args.slice(args[0] === "install" || args[0] === "check" ? 1 : 0).filter((a) => !a.startsWith("-") && !(TOOL_IDS as string[]).includes(a));
if (unknown.length) {
  console.error(`Unknown program: ${unknown.join(", ")}. Choose from: ${TOOL_IDS.join(", ")}.`);
  process.exit(2);
}

const ctx = createContext({});
const status = await toolStatus(ctx);
const wanted = named.length ? named : TOOL_IDS;

console.log(`\nHelper programs on ${ctx.platform}:\n`);
for (const t of status.tools) {
  const mark = t.installed ? "✔" : "✖";
  console.log(`  ${mark} ${t.name.padEnd(12)} ${t.installed ? `${t.version ?? ""}  ${t.path}` : "not installed"}`);
}
const managerNames = Object.keys(detectManagers(ctx));
console.log(`\n  Package managers found: ${managerNames.length ? managerNames.join(", ") : "none"}\n`);

const missing = status.tools.filter((t) => !t.installed && wanted.includes(t.id));
if (command === "check" || !missing.length) {
  if (command === "install" && !missing.length) console.log("Nothing to install.");
  if (command === "check" && missing.length) console.log(`To install what is missing: bun run tools:install\n`);
  process.exit(missing.length && command === "check" ? 1 : 0);
}

async function confirm(question: string): Promise<boolean> {
  if (yes) return true;
  process.stdout.write(`${question} [y/N] `);
  for await (const line of console) return /^y(es)?$/i.test(line.trim());
  return false;
}

let failed = false;
for (const t of missing) {
  const plan = t.plan;
  console.log(`${TOOLS[t.id].name}: ${plan.note}`);
  if (!plan.argv) {
    console.log(`  How to get it: ${plan.display}`);
    if (plan.missingManager) console.log(`  ${plan.missingManager.name} (${plan.missingManager.url}):\n    ${plan.missingManager.command}\n  ${plan.missingManager.note}`);
    console.log(`  Or download it from ${t.website}\n`);
    failed = true;
    continue;
  }
  if (!(await confirm(`  Run: ${plan.display} ?`))) {
    console.log("  Skipped.\n");
    continue;
  }
  const proc = Bun.spawn(plan.argv, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) {
    console.log(`  The installer stopped with an error (code ${code}).\n`);
    failed = true;
  } else {
    console.log("");
  }
}
const after = await toolStatus(ctx);
for (const t of after.tools.filter((x) => wanted.includes(x.id))) console.log(`  ${t.installed ? "✔" : "✖"} ${t.name}`);
process.exit(failed || after.tools.some((t) => wanted.includes(t.id) && !t.installed) ? 1 : 0);
