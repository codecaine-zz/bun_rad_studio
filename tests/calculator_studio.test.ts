import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import {
  createCalculatorStudio,
  generateCalculatorStudioHtml,
  startCalculatorStudioServer,
  getCalculatorAssetsDir,
} from "../applications/calculator_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("⚡ Orbit Universal Computing Suite & Graphic Studio Test Suite", () => {
  it("1. Static assets are present, readable and uncorrupted", () => {
    const assetsDir = getCalculatorAssetsDir();
    expect(existsSync(join(assetsDir, "index.html"))).toBe(true);
    expect(existsSync(join(assetsDir, "styles.css"))).toBe(true);
    expect(existsSync(join(assetsDir, "app.js"))).toBe(true);
    expect(existsSync(join(assetsDir, "favicon.svg"))).toBe(true);

    const indexHtml = readFileSync(join(assetsDir, "index.html"), "utf8");
    expect(indexHtml.length).toBeGreaterThan(10000);
    expect(indexHtml).toContain("ORBIT");
    expect(indexHtml).toContain("Unit &amp; Currency");
    expect(indexHtml).toContain("Scientific Studio");
    expect(indexHtml).toContain("Programmer Lab");
    expect(indexHtml).toContain("Graphic Charts");
    expect(indexHtml).toContain("Calculus &amp; Grapher");
    expect(indexHtml).toContain("Matrix &amp; Linear Alg");
    expect(indexHtml).toContain("Geometry &amp; Triangles");
    expect(indexHtml).toContain("Wealth &amp; FIRE");
    expect(indexHtml).toContain("Physics &amp; Solvers");
    expect(indexHtml).toContain("Electronics &amp; Circuits");
    expect(indexHtml).toContain("Smart Utilities");
    expect(indexHtml).toContain("Paper Tape Journal");

    const appJs = readFileSync(join(assetsDir, "app.js"), "utf8");
    expect(appJs.length).toBeGreaterThan(50000);
    expect(appJs).toContain("CATEGORIES");
    expect(appJs).toContain("CHART_PRESETS");
    expect(appJs).toContain("PHYSICAL_CONSTANTS");
  });

  it("2. generateCalculatorStudioHtml produces standalone self-contained bundle", () => {
    const html = generateCalculatorStudioHtml({ inline: true });
    expect(html.length).toBeGreaterThan(300000);
    expect(html).toContain("<style>");
    expect(html).toContain("</style>");
    expect(html).toContain("<script>");
    expect(html).toContain("</script>");
    expect(html).toContain("requestInitialFullscreen");
    expect(html).toContain("window.quitApp");
  });

  it("3. createCalculatorStudio initializes with proper desktop defaults", () => {
    const studio = createCalculatorStudio({ fullscreen: true });
    expect(studio.title).toContain("Orbit Universal Computing Suite");
    expect(studio.fullscreen).toBe(true);
    expect(typeof studio.run).toBe("function");
    expect(typeof studio.generateHtml).toBe("function");

    const html = studio.generateHtml();
    expect(html.length).toBeGreaterThan(10000);
    expect(html).toContain("requestInitialFullscreen");
  });

  it("4. startCalculatorStudioServer serves all assets and API routes with zero errors", async () => {
    const server = startCalculatorStudioServer({ port: 0, host: "127.0.0.1" });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    try {
      // Index HTML
      const resIndex = await fetch(`${baseUrl}/`);
      expect(resIndex.status).toBe(200);
      expect(resIndex.headers.get("Content-Type")).toContain("text/html");
      const htmlText = await resIndex.text();
      expect(htmlText).toContain("Orbit Universal Computing Suite");

      // Stylesheet
      const resCss = await fetch(`${baseUrl}/styles.css`);
      expect(resCss.status).toBe(200);
      expect(resCss.headers.get("Content-Type")).toContain("text/css");

      // JavaScript
      const resJs = await fetch(`${baseUrl}/app.js`);
      expect(resJs.status).toBe(200);
      expect(resJs.headers.get("Content-Type")).toContain("application/javascript");

      // Favicon
      const resFavicon = await fetch(`${baseUrl}/favicon.svg`);
      expect(resFavicon.status).toBe(200);
      expect(resFavicon.headers.get("Content-Type")).toContain("image/svg+xml");

      // Health API
      const resHealth = await fetch(`${baseUrl}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json();
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("calculator_studio");
      expect(healthData.version).toBe("2.7.0");
    } finally {
      server.stop();
    }
  });

  it("5. Launcher Studio automatically discovers and registers Calculator Studio", () => {
    const apps = scanWorkspaceApps();
    const calcApp = apps.find(
      (a) => a.name === "calculator_studio" || a.id === "rad_calculator_studio"
    );
    expect(calcApp).toBeDefined();
    expect(calcApp?.displayName).toContain("Calculator");
    expect(calcApp?.icon).toBe("🧮");
  });
});
