import { expect, test, describe } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { TypingStudio } from "../applications/typing_studio";

describe("⌨️ CyberType Deluxe — Mavis Edition", () => {
  const resourceDir = join(import.meta.dir, "../resources/typing_studio");

  test("1. Static assets are present, readable, and properly structured", () => {
    const htmlPath = join(resourceDir, "index.html");
    const svgPath = join(resourceDir, "favicon.svg");

    expect(existsSync(htmlPath)).toBe(true);
    expect(existsSync(svgPath)).toBe(true);

    const htmlContent = readFileSync(htmlPath, "utf-8");
    expect(htmlContent).toContain("CyberType");
    expect(htmlContent).toContain("keyboard-box");
    expect(htmlContent).toContain("results-overlay");
  });

  test("2. HTML structure has correctly wired classes and ids", () => {
    const htmlPath = join(resourceDir, "index.html");
    const htmlContent = readFileSync(htmlPath, "utf-8");

    expect(htmlContent).toContain('id="typeCanvas"');
    expect(htmlContent).toContain('id="wordsWrapper"');
    expect(htmlContent).toContain('id="typeCursor"');
    expect(htmlContent).toContain('id="resWPM"');
  });

  test("3. Studio factory generates correct defaults and instance contracts", () => {
    const studio = new TypingStudio();
    expect(studio).toBeDefined();
    expect(typeof studio.start).toBe("function");
  });

  test("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const studio = new TypingStudio();
    // @ts-ignore - access private method for testing
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
    expect(svgRes.headers.get("content-type")).toContain("image/svg+xml");
  });
});
