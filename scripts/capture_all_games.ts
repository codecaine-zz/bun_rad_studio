import { generateCalculatorStudioHtml } from "../applications/calculator_studio";
import { generateLoloStudioHtml } from "../applications/lolo_studio";
import { generateCodecaineBrosStudioHtml } from "../applications/codecaine_bros_studio";
import { generateConnect4StudioHtml } from "../applications/connect4_studio";
import { generateMazeStudioHtml } from "../applications/maze_generator_studio";
import { generatePongStudioHtml } from "../applications/pong_studio";
import { generateTicTacToeStudioHtml } from "../applications/tictactoe_studio";
import { generateDrCodecaineStudioHtml } from "../applications/dr_codecaine_studio";
import { generatePacmanStudioHtml } from "../applications/pacman_studio";
import { generateRodentsRevengeStudioHtml } from "../applications/rodents_revenge_studio";
import { generateWordSearchStudioHtml } from "../applications/word_search_studio";
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from "fs";
import { join } from "path";
import { Sys } from "../src/simplecli/sys";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROJECT_SHOTS_DIR = join(process.cwd(), "screenshots", "apps");
const ARTIFACT_SHOTS_DIR = "/Users/codecaine/.gemini/antigravity-ide/brain/05dc4d06-ef14-469e-a99c-7da1df4784ad/screenshots";
const TEMP_DIR = join(process.cwd(), ".temp_screens");

mkdirSync(PROJECT_SHOTS_DIR, { recursive: true });
mkdirSync(ARTIFACT_SHOTS_DIR, { recursive: true });
mkdirSync(TEMP_DIR, { recursive: true });

// Read IntuitionLab HTML directly
const intuitionLabHtmlPath = join(process.cwd(), "resources/universal_calculator/intuitionlab/index.html");
const intuitionLabHtml = existsSync(intuitionLabHtmlPath) ? readFileSync(intuitionLabHtmlPath, "utf8") : "<h1>IntuitionLab</h1>";

const appTargets = [
  { name: "codecaine_bros", title: "Codecaine Bros. Overclocked Retro Arcade", getHtml: generateCodecaineBrosStudioHtml },
  { name: "lolo", title: "Adventures of Lolo Remaster", getHtml: generateLoloStudioHtml },
  { name: "calculator_studio", title: "Orbit Universal Computing Suite", getHtml: () => generateCalculatorStudioHtml({ inline: true }) },
  { name: "calculator_intuitionlab", title: "IntuitionLab Visual STEM Simulations", getHtml: () => intuitionLabHtml },
  { name: "connect4", title: "Cyberpunk Connect 4 Neon AI", getHtml: generateConnect4StudioHtml },
  { name: "maze_generator", title: "Cyberpunk Maze Runner Neon Labyrinth", getHtml: generateMazeStudioHtml },
  { name: "pong", title: "Neon Cyber Pong Kinetic Arcade", getHtml: generatePongStudioHtml },
  { name: "tictactoe", title: "Neon Tic-Tac-Toe AI & 2-Player Arcade", getHtml: generateTicTacToeStudioHtml },
  { name: "dr_codecaine", title: "Dr. Codecaine Neon Medicine Arcade", getHtml: generateDrCodecaineStudioHtml },
  { name: "pacman", title: "Cyberpunk Pac-Man Arcade Neon Remaster", getHtml: generatePacmanStudioHtml },
  { name: "rodents_revenge", title: "Rodent's Revenge Deluxe Master Edition", getHtml: generateRodentsRevengeStudioHtml },
  { name: "word_search", title: "Neon Word Search Labyrinth", getHtml: generateWordSearchStudioHtml },
];

console.log(`Starting rapid screenshot pipeline for ${appTargets.length} applications...`);

const results: { name: string; title: string; size: string; path: string }[] = [];

for (const target of appTargets) {
  const html = target.getHtml();
  const tempPath = join(TEMP_DIR, `${target.name}.html`);
  writeFileSync(tempPath, html, "utf8");

  const outProj = join(PROJECT_SHOTS_DIR, `${target.name}_desktop.png`);
  const outArt = join(ARTIFACT_SHOTS_DIR, `${target.name}_desktop.png`);

  const cmd = `"${CHROME_BIN}" --headless=new --disable-gpu --no-sandbox --user-data-dir="/tmp/chrome_shot_profile" --window-size=1280,900 --screenshot="${outProj}" "file://${tempPath}" 2>/dev/null`;
  Sys.exec(cmd);

  if (existsSync(outProj)) {
    copyFileSync(outProj, outArt);
    const size = (Bun.file(outProj).size / 1024).toFixed(1) + " KB";
    console.log(`✔ [${target.name}] ${target.title}: ${size}`);
    results.push({ name: target.name, title: target.title, size, path: outArt });
  } else {
    console.error(`❌ [${target.name}] Failed to capture screenshot`);
  }
}

console.log(`\n============================================================`);
console.log(`Captured ${results.length} of ${appTargets.length} application screenshots!`);
for (const r of results) {
  console.log(`- ${r.title} (${r.name}): ${r.size}`);
}
