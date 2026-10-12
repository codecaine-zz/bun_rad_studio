import { expect, test, describe } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { TypingStudio } from "../applications/typing_studio";

describe("⌨️ CyberType Deluxe — Mavis Beacon Master Edition", () => {
  const resourceDir = join(import.meta.dir, "../resources/typing_studio");

  test("1. Static assets and core components are present and structured", () => {
    const htmlPath = join(resourceDir, "index.html");
    const svgPath = join(resourceDir, "favicon.svg");

    expect(existsSync(htmlPath)).toBe(true);
    expect(existsSync(svgPath)).toBe(true);

    const html = readFileSync(htmlPath, "utf-8");
    expect(html).toContain("CyberType");
    expect(html).toContain("Mavis Master");
    expect(html).toContain("keyboard-box");
    expect(html).toContain("resultsOverlay");
  });

  test("2. Signature Mavis Beacon Dual Hands posture guide is wired", () => {
    const html = readFileSync(join(resourceDir, "index.html"), "utf-8");
    expect(html).toContain('id="handsWrapper"');
    expect(html).toContain('data-finger="l-pinky"');
    expect(html).toContain('data-finger="l-ring"');
    expect(html).toContain('data-finger="l-middle"');
    expect(html).toContain('data-finger="l-index"');
    expect(html).toContain('data-finger="thumb"');
    expect(html).toContain('data-finger="r-index"');
    expect(html).toContain('data-finger="r-middle"');
    expect(html).toContain('data-finger="r-ring"');
    expect(html).toContain('data-finger="r-pinky"');
    expect(html).toContain('id="fingerIndicator"');
  });

  test("3. Teaching curriculum, multiple modes, and arcade mini-game are present", () => {
    const html = readFileSync(join(resourceDir, "index.html"), "utf-8");
    expect(html).toContain('data-mode="time"');
    expect(html).toContain('data-mode="words"');
    expect(html).toContain('data-mode="lessons"');
    expect(html).toContain('data-mode="quote"');
    expect(html).toContain('data-mode="code"');
    expect(html).toContain('data-mode="weak"');
    expect(html).toContain('data-mode="arcade"');
    expect(html).toContain('id="arcadeOverlay"');
    expect(html).toContain('id="arcadeCanvas"');
  });

  test("4. WebAudio multi-switch audio profiles and themes are available", () => {
    const html = readFileSync(join(resourceDir, "index.html"), "utf-8");
    expect(html).toContain('value="thock"');
    expect(html).toContain('value="clicky"');
    expect(html).toContain('value="typewriter"');
    expect(html).toContain('value="cyber"');
    expect(html).toContain('value="theme-cyber"');
    expect(html).toContain('value="theme-mavis"');
    expect(html).toContain('value="theme-matrix"');
    expect(html).toContain('value="theme-synthwave"');
    expect(html).toContain('value="theme-nord"');
  });

  test("5. Performance telemetry, consistency, sparkline chart & weak key diagnosis are wired", () => {
    const html = readFileSync(join(resourceDir, "index.html"), "utf-8");
    expect(html).toContain('id="hudWPM"');
    expect(html).toContain('id="hudRaw"');
    expect(html).toContain('id="hudAcc"');
    expect(html).toContain('id="resConsistency"');
    expect(html).toContain('id="resChart"');
    expect(html).toContain('id="resWeakKeys"');
    expect(html).toContain('id="resBadges"');
  });

  test("6. Desktop app instance and background server operate correctly", async () => {
    const studio = new TypingStudio();
    expect(studio).toBeDefined();
    expect(typeof studio.start).toBe("function");

    // @ts-ignore
    studio.startServer();
    // @ts-ignore
    const port = studio.port;

    const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(healthRes.status).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson.status).toBe("ok");
    expect(healthJson.game).toBe("typing_studio");

    const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get("content-type")).toContain("text/html");

    const svgRes = await fetch(`http://127.0.0.1:${port}/favicon.svg`);
    expect(svgRes.status).toBe(200);
  });
});
