/**
 * Lists the controls of an app's page and which of them have a help tip, to write or check its dictionary:
 *   bun run scripts/help_controls.ts env_studio           every control (use the app file name, e.g. process_studio)
 *   bun run scripts/help_controls.ts env_studio --missing only the ones without a tip
 * Needs the app's file to export `createXxxStudio()` with `generateHtml()` (the SimpleGUI studios do).
 */
import { auditHtml, describe, uncovered } from "../src/shared/helpAudit";
import { HELP_SKIP, HELP_TIPS } from "../src/shared/help";
import { helpIdOf, pageFor } from "../src/shared/helpPages";

const appId = process.argv[2];
if (!appId) {
  console.error("usage: bun run scripts/help_controls.ts <app id> [--missing]");
  process.exit(2);
}
const html = await pageFor(appId);
const helpId = helpIdOf(html) ?? appId;
const controls = await auditHtml(html, HELP_TIPS[helpId] ?? {});
console.log(`page: ${appId}   dictionary id: ${helpId}   (src/shared/help/${helpId}.ts)\n`);
const missingOnly = process.argv.includes("--missing");
const gaps = new Set(uncovered(controls, HELP_SKIP[helpId] ?? []));
for (const c of controls) {
  const mark = c.tip ? "✔" : gaps.has(c) ? "✖" : "–";
  if (missingOnly && mark !== "✖") continue;
  console.log(`${mark} ${describe(c)}${c.tip ? `  → ${c.tip.slice(0, 60)}` : ""}`);
}
console.log(`\n${controls.length} controls; ${gaps.size} still need a tip.`);
process.exit(0);
