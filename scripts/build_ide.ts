/**
 * Builds the designer page `src/ide.html` from the pieces in `src/ide/`.
 *
 * The page used to be one 7,000-line file. It is now edited as numbered parts (markup and styles, then the
 * script split at function boundaries) and joined in order. `src/ide.html` stays committed because other code
 * reads it as a plain file (the dist build, the app bundler, the screenshot script, `getIdeHtml`), so the build
 * is checked rather than run on the fly.
 *
 *   bun run ide:build   joins the parts and writes src/ide.html
 *   bun run ide:check   exits 1 when src/ide.html is not exactly what the parts produce
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
export const PARTS_DIR = join(ROOT, "src", "ide");
export const OUTPUT = join(ROOT, "src", "ide.html");

/** The part files in build order: by their leading number (so 100_ comes after 20_, not before it). */
export function listParts(dir = PARTS_DIR): string[] {
  const names = readdirSync(dir).filter((n) => !n.startsWith("."));
  const bad = names.filter((n) => !/^\d+_[\w.-]+\.(js|html)$/.test(n));
  if (bad.length) throw new Error(`Unexpected file(s) in ${dir}: ${bad.join(", ")} (parts are named like 20_name.js or 05_name.html)`);
  const numbers = names.map((n) => parseInt(n, 10));
  if (new Set(numbers).size !== numbers.length) throw new Error(`Two parts in ${dir} share a number`);
  return names.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

export function buildIdeHtml(dir = PARTS_DIR): string {
  return listParts(dir).map((n) => readFileSync(join(dir, n), "utf8")).join("");
}

/** Line endings are compared as LF: a Windows checkout may convert them in either file. */
const lf = (s: string) => s.replace(/\r\n/g, "\n");

export function main(args: string[]): number {
  if (!existsSync(PARTS_DIR)) {
    console.error(`${PARTS_DIR} does not exist.`);
    return 2;
  }
  const built = buildIdeHtml();
  if (args.includes("--check")) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : "";
    if (lf(current) !== lf(built)) {
      console.error("src/ide.html does not match src/ide/. Edit the parts, not src/ide.html, then run: bun run ide:build");
      return 1;
    }
    console.log(`src/ide.html matches the ${listParts().length} parts in src/ide/.`);
    return 0;
  }
  writeFileSync(OUTPUT, built);
  console.log(`wrote src/ide.html from ${listParts().length} parts (${built.split("\n").length - 1} lines)`);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
