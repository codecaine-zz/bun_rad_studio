process.env.SCREENSHOT_MODE = "1";

import { createApiStudio } from "../applications/api_studio";
import { createAppBundlerStudio } from "../applications/app_bundler_studio";
import { createBrewStudio } from "../applications/brew_studio";
import { createColorStudio } from "../applications/color_studio";
import { createCryptoStudio } from "../applications/crypto_studio";
import { createDatabaseStudio } from "../applications/database_studio";
import { createDataConvertStudio } from "../applications/dataconvert_studio";
import { createDevToolsStudio } from "../applications/devtools_studio";
import { createEnvStudio } from "../applications/env_studio";
import { createGitStudio } from "../applications/git_studio";
import { createJqStudio } from "../applications/jq_studio";
import { createJsonStudio } from "../applications/json_studio";
import { createMarkdownStudio } from "../applications/markdown_studio";
import { createNetworkStudio } from "../applications/network_studio";
import { createOmnitoolStudio } from "../applications/omnitool_studio";
import { createProcessStudio } from "../applications/process_studio";
import { createRedisStudio } from "../applications/redis_studio";
import { createRegexStudio } from "../applications/regex_studio";
import { createSqliteStudio } from "../applications/sqlite_studio";
import { createSystemInformationStudio } from "../applications/system_studio";
import { createTaskTracker } from "../applications/task_manager";
import { createWatcherStudio } from "../applications/watcher_studio";
import { createWatchexecStudio } from "../applications/watchexec_studio";
import { createCodeFreelanceShowcase } from "../demos/20_codefreelance_theme_demo";
import { createErgonomicsShowcase } from "../demos/18_simplegui_ergonomics_demo";
import { htmlContent as productivityHtml } from "../demos/13_productivity_controls_studio";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { Sys } from "../src/simplecli/sys";

// Map of all 24 production applications & showcases
const apps: Record<string, () => { generateHtml: () => string }> = {
  "api_studio": createApiStudio,
  "app_bundler_studio": createAppBundlerStudio,
  "brew_studio": createBrewStudio,
  "color_studio": createColorStudio,
  "crypto_studio": createCryptoStudio,
  "database_studio": () => createDatabaseStudio(":memory:"),
  "dataconvert_studio": createDataConvertStudio,
  "devtools_studio": createDevToolsStudio,
  "env_studio": createEnvStudio,
  "git_studio": createGitStudio,
  "jq_studio": createJqStudio,
  "json_studio": createJsonStudio,
  "markdown_studio": createMarkdownStudio,
  "network_studio": createNetworkStudio,
  "omnitool_studio": createOmnitoolStudio,
  "process_studio": createProcessStudio,
  "redis_studio": createRedisStudio,
  "regex_studio": createRegexStudio,
  "sqlite_studio": createSqliteStudio,
  "system_studio": createSystemInformationStudio,
  "task_manager": createTaskTracker,
  "watcher_studio": createWatcherStudio,
  "watchexec_studio": createWatchexecStudio,
  "codefreelance_theme": createCodeFreelanceShowcase,
};

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = join(process.cwd(), "screenshots", "apps");
const ROOT_DIR = process.cwd();
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

// 1. Capture screenshots for each application
for (const [name, factory] of Object.entries(apps)) {
  console.log(`[Processing] Generating UI for ${name}...`);
  const appInstance = factory();
  const html = appInstance.generateHtml();

  const tempHtmlPath = join(TEMP_HTML_DIR, `${name}.html`);
  writeFileSync(tempHtmlPath, html, "utf8");

  // A. Desktop High-Resolution (1200x850)
  const desktopOut = join(OUTPUT_DIR, `${name}_desktop.png`);
  const cmdDesktop = `"${CHROME_BIN}" --headless --disable-gpu --screenshot="${desktopOut}" --window-size=1200,850 "file://${tempHtmlPath}" 2>/dev/null`;
  Sys.exec(cmdDesktop);

  // B. Responsive Medium Desktop / Compact View (960x720)
  const responsiveOut = join(OUTPUT_DIR, `${name}_responsive.png`);
  const cmdResponsive = `"${CHROME_BIN}" --headless --disable-gpu --screenshot="${responsiveOut}" --window-size=960,720 "file://${tempHtmlPath}" 2>/dev/null`;
  Sys.exec(cmdResponsive);

  const exists = existsSync(desktopOut);
  const size = exists ? (Bun.file(desktopOut).size / 1024).toFixed(1) + " KB" : "0 KB";

  console.log(`  ✔ Desktop:    ${desktopOut} (${size})`);
  console.log(`  ✔ Responsive: ${responsiveOut}\n`);

  results.push({ name, desktopPath: desktopOut, responsivePath: responsiveOut, size });
}

// 2. Capture root showcases & README screenshots
console.log(`[Processing Root Showcase Screenshots]...`);

// A. IDE Visual Designer screenshot (screenshot.png)
const ideHtmlPath = join(ROOT_DIR, "src", "ide.html");
const ideOut = join(ROOT_DIR, "screenshot.png");
console.log(`  Capturing IDE Visual Designer (${ideOut})...`);
Sys.exec(`"${CHROME_BIN}" --headless --disable-gpu --screenshot="${ideOut}" --window-size=1280,880 "file://${ideHtmlPath}" 2>/dev/null`);
console.log(`  ✔ IDE Designer: ${ideOut} (${(Bun.file(ideOut).size / 1024).toFixed(1)} KB)`);

// B. Modern Productivity UI Controls Studio (screenshot_productivity.png)
const productivityHtmlPath = join(TEMP_HTML_DIR, "productivity_showcase.html");
writeFileSync(productivityHtmlPath, productivityHtml, "utf8");
const prodOut = join(ROOT_DIR, "screenshot_productivity.png");
console.log(`  Capturing Productivity Controls Studio (${prodOut})...`);
Sys.exec(`"${CHROME_BIN}" --headless --disable-gpu --screenshot="${prodOut}" --window-size=1200,850 "file://${productivityHtmlPath}" 2>/dev/null`);
console.log(`  ✔ Productivity Controls: ${prodOut} (${(Bun.file(prodOut).size / 1024).toFixed(1)} KB)`);

// C. SimpleGUI Ergonomics & Shortcuts Demo (screenshot_ergonomics.png)
const ergonomicsHtml = createErgonomicsShowcase().generateHtml();
const ergonomicsHtmlPath = join(TEMP_HTML_DIR, "ergonomics_showcase.html");
writeFileSync(ergonomicsHtmlPath, ergonomicsHtml, "utf8");
const ergoOut = join(ROOT_DIR, "screenshot_ergonomics.png");
console.log(`  Capturing Ergonomics Demo (${ergoOut})...`);
Sys.exec(`"${CHROME_BIN}" --headless --disable-gpu --screenshot="${ergoOut}" --window-size=1200,850 "file://${ergonomicsHtmlPath}" 2>/dev/null`);
console.log(`  ✔ Ergonomics Showcase: ${ergoOut} (${(Bun.file(ergoOut).size / 1024).toFixed(1)} KB)\n`);

console.log(`========================================================================`);
console.log(`✨ All ${results.length} application screenshots + 3 root showcases updated!`);
console.log(`========================================================================`);
