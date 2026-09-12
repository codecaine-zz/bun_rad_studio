process.env.SCREENSHOT_MODE = "1";

import { createThemeShowcase } from "../demos/23_all_themes_all_controls_showcase";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { Sys } from "../src/simplecli/sys";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = join(process.cwd(), "screenshots");
const TEMP_HTML_DIR = join(process.cwd(), ".temp_screens");

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(TEMP_HTML_DIR, { recursive: true });

async function capturePalette(theme: string = "midnight", filename: string = "command_palette_modal.png") {
    const app = createThemeShowcase(theme);
    let html = app.generateHtml();

    // Inject auto-opening script for the command palette
    const autoOpenScript = `
    <script>
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.showcase_cmd_openPalette) {
                window.showcase_cmd_openPalette();
                const inp = document.getElementById('showcase_cmd_input');
                if (inp) {
                    inp.value = 'File';
                    window.showcase_cmd_filterPalette('File');
                }
            }
        }, 150);
    });
    </script>
    </body>`;
    html = html.replace("</body>", autoOpenScript);

    const tempHtmlPath = join(TEMP_HTML_DIR, `cmd_palette_${theme}.html`);
    writeFileSync(tempHtmlPath, html, "utf8");

    const outPath = join(OUTPUT_DIR, filename);
    const cmd = `"${CHROME_BIN}" --headless --disable-gpu --screenshot="${outPath}" --window-size=1200,900 "file://${tempHtmlPath}" 2>/dev/null`;
    Sys.exec(cmd);

    console.log(`Captured Command Palette screenshot: ${outPath} (${Bun.file(outPath).size} bytes)`);
}

async function main() {
    await capturePalette("midnight", "command_palette_modal.png");
    await capturePalette("codefreelance", "command_palette_codefreelance.png");
}

main().catch(console.error);
