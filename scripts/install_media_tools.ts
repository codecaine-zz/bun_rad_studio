/**
 * Checks for, and installs, the helper programs the File Manager's "Convert & process" window uses.
 *
 *   bun run tools:check                      show what is installed
 *   bun run tools:install                    install the three main programs if missing (asks first)
 *   bun run tools:install --all              also the optional ones (LibreOffice and calibre are big downloads: it asks for each)
 *   bun run tools:install ffmpeg pandoc      install only these
 *   bun run tools:install libreoffice        an optional program, by name
 *   bun run tools:install --yes              do not ask
 *
 * Many conversions need nothing installed (data files, text, zip, tar.gz, gzip, Markdown to HTML, spreadsheets).
 * The main programs are ffmpeg (video and sound), ImageMagick (pictures) and pandoc (documents). The rest are optional:
 * Ghostscript and qpdf (PDF), LibreOffice (Office files), calibre (e-books), Tesseract (text in pictures), fontTools
 * and woff2 (fonts), 7-Zip, The Unarchiver and bsdtar (archives), poppler (PDF text), ExifTool (hidden details).
 *
 * It uses the same catalog and install plans as the File Manager, so both always do the same thing:
 *   macOS / Linux with Homebrew:  brew install ffmpeg-full imagemagick-full pandoc   (casks for LibreOffice and calibre)
 *   Windows:                      winget (or Scoop) install
 *   Linux without Homebrew:       your system's package manager (it asks for your password in this terminal)
 * Where the package manager itself is missing, it prints how to get it instead of guessing. Nothing is installed
 * without your confirmation.
 */
import { detectManagers, toolStatus } from "../src/features/filemanager/fmBatch";
import { createContext } from "../src/features/filemanager/fmCore";
import { TOOLS, TOOL_IDS, type ToolId } from "../src/features/filemanager/fmTools";

const args = process.argv.slice(2);
const command = args[0] === "install" || args[0] === "check" ? args[0] : "check";
const yes = args.includes("--yes") || args.includes("-y");
const all = args.includes("--all");
const named = args.filter((a) => (TOOL_IDS as string[]).includes(a)) as ToolId[];
const unknown = args.slice(args[0] === "install" || args[0] === "check" ? 1 : 0).filter((a) => !a.startsWith("-") && !(TOOL_IDS as string[]).includes(a));
if (unknown.length) {
  console.error(`Unknown program: ${unknown.join(", ")}. Choose from: ${TOOL_IDS.join(", ")}.`);
  process.exit(2);
}

const ctx = createContext({});
const status = await toolStatus(ctx);
const mainIds = TOOL_IDS.filter((id) => !TOOLS[id].optional);
const wanted = named.length ? named : all ? TOOL_IDS : mainIds;

console.log(`\nHelper programs on ${ctx.platform}:\n`);
for (const t of status.tools) {
  const mark = t.installed ? "✔" : "✖";
  const note = t.optional ? " (optional)" : "";
  console.log(`  ${mark} ${t.name.padEnd(24)} ${t.installed ? `${t.version ?? ""}  ${t.path}` : `not installed${note}`}`);
}
const managerNames = Object.keys(detectManagers(ctx));
console.log(`\n  Package managers found: ${managerNames.length ? managerNames.join(", ") : "none"}\n`);

const missing = status.tools.filter((t) => !t.installed && wanted.includes(t.id));
if (command === "check" || !missing.length) {
  if (command === "install" && !missing.length) console.log("Nothing to install.");
  if (command === "check" && status.tools.some((t) => !t.installed && !t.optional)) console.log(`To install the main programs: bun run tools:install\n`);
  if (command === "check" && status.tools.some((t) => !t.installed && t.optional)) console.log(`The optional ones (PDF tools, Office, e-books, OCR, fonts, archives): bun run tools:install --all\n`);
  // Only the main programs make "check" fail: the optional ones are never required.
  process.exit(status.tools.some((t) => !t.installed && !t.optional) && command === "check" ? 1 : 0);
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
  // Big downloads are always asked about, even with --yes, unless --yes was given on purpose together with the name.
  const big = !!plan.size && !named.includes(t.id) && yes;
  if (big) {
    console.log(`  Skipped (${plan.size}). Name it to install it: bun run tools:install ${t.id} --yes\n`);
    continue;
  }
  if (!(await confirm(`  Run: ${plan.display} ?${plan.size ? ` (${plan.size})` : ""}`))) {
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
