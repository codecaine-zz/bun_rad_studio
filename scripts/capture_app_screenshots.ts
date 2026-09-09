import { createOmnitoolStudio } from "../applications/omnitool_studio";
import { createBrewStudio } from "../applications/brew_studio";
import { createJqStudio } from "../applications/jq_studio";
import { createSqliteStudio } from "../applications/sqlite_studio";
import { createTaskTracker } from "../applications/task_manager";
import { createRegexStudio } from "../applications/regex_studio";
import { createApiStudio } from "../applications/api_studio";
import { createDataConvertStudio } from "../applications/dataconvert_studio";
import { createCryptoStudio } from "../applications/crypto_studio";
import { createWatchexecStudio } from "../applications/watchexec_studio";
import { createAppBundlerStudio } from "../applications/app_bundler_studio";
import { createCodeFreelanceShowcase } from "../demos/20_codefreelance_theme_demo";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { Sys } from "../src/simplecli/sys";

const apps: Record<string, () => any> = {
  "omnitool_studio": createOmnitoolStudio,
  "brew_studio": createBrewStudio,
  "jq_studio": createJqStudio,
  "sqlite_studio": createSqliteStudio,
  "task_manager": createTaskTracker,
  "regex_studio": createRegexStudio,
  "api_studio": createApiStudio,
  "dataconvert_studio": createDataConvertStudio,
  "crypto_studio": createCryptoStudio,
  "watchexec_studio": createWatchexecStudio,
  "app_bundler_studio": createAppBundlerStudio,
  "codefreelance_theme": createCodeFreelanceShowcase,
};

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = join(process.cwd(), "screenshots", "apps");
const TEMP_HTML_DIR = join(process.cwd(), ".temp_screens");

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(TEMP_HTML_DIR, { recursive: true });

console.log(`========================================================================`);
console.log(`📸 Bun RAD Studio - Automated Production Screenshot Pipeline`);
console.log(`========================================================================`);
console.log(`Chrome Binary: ${CHROME_BIN}`);
console.log(`Destination:   ${OUTPUT_DIR}`);
console.log(`Total Apps:    ${Object.keys(apps).length}\n`);

const results: { name: string; desktopPath: string; responsivePath: string; size: string }[] = [];

for (const [name, factory] of Object.entries(apps)) {
  console.log(`[Processing] Generating UI for ${name}...`);
  const win = factory();
  const html = win.generateHtml();

  const tempHtmlPath = join(TEMP_HTML_DIR, `${name}.html`);
  writeFileSync(tempHtmlPath, html, "utf8");

  // 1. Desktop High-Resolution (1200x850)
  const desktopOut = join(OUTPUT_DIR, `${name}_desktop.png`);
  const cmdDesktop = `"${CHROME_BIN}" --headless --disable-gpu --screenshot="${desktopOut}" --window-size=1200,850 "file://${tempHtmlPath}" 2>/dev/null`;
  Sys.exec(cmdDesktop);

  // 2. Responsive Medium Desktop / Compact View (960x720)
  const responsiveOut = join(OUTPUT_DIR, `${name}_responsive.png`);
  const cmdResponsive = `"${CHROME_BIN}" --headless --disable-gpu --screenshot="${responsiveOut}" --window-size=960,720 "file://${tempHtmlPath}" 2>/dev/null`;
  Sys.exec(cmdResponsive);

  const exists = existsSync(desktopOut);
  const size = exists ? (Bun.file(desktopOut).size / 1024).toFixed(1) + " KB" : "0 KB";

  console.log(`  ✔ Desktop:    ${desktopOut} (${size})`);
  console.log(`  ✔ Responsive: ${responsiveOut}\n`);

  results.push({ name, desktopPath: desktopOut, responsivePath: responsiveOut, size });
}

console.log(`========================================================================`);
console.log(`✨ All ${results.length} application screenshots captured successfully!`);
console.log(`========================================================================`);
