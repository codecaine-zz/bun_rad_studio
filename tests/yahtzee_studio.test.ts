import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createYahtzeeStudio,
  generateYahtzeeStudioHtml,
  startYahtzeeServer,
  getYahtzeeAssetsDir,
} from "../applications/yahtzee_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("🎲 Yahtzee Royale Deluxe — Classic Dice Board Studio Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getYahtzeeAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("Yahtzee Royale Deluxe");
    expect(html).toContain("AudioEngine");
    expect(html).toContain("calculateCategoryScore");
    expect(html).toContain("createDieElement");
    expect(html).toContain("renderDice");
    expect(html).toContain("toggleDieKeep");
    expect(html).toContain("handleRollAction");
    expect(html).toContain("handleCategorySelect");
    expect(html).toContain("runAiTurn");
    expect(html).toContain("CATEGORIES");
    expect(html).toContain("scorecard-table");
    expect(html).toContain("die-wrapper");
  });

  it("2. generateYahtzeeStudioHtml injects desktop window shortcuts and storage polyfill", () => {
    const html = generateYahtzeeStudioHtml();
    expect(html).toContain("Yahtzee Royale Deluxe");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
    expect(html).toContain("localStorage");
  });

  it("3. Studio factory generates correct defaults and instance contracts", () => {
    const app = createYahtzeeStudio({ fullscreen: false, width: 1240, height: 860 });
    expect(app.title).toContain("Yahtzee Royale Deluxe");
    expect(app.width).toBe(1240);
    expect(app.height).toBe(860);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const server = startYahtzeeServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("Yahtzee Royale Deluxe");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json();
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("yahtzee_studio");
      expect(healthData.name).toContain("Yahtzee Royale Deluxe");
    } finally {
      server.stop(true);
    }
  });

  it("5. Launcher Studio automatically registers and surfaces Yahtzee Royale", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "yahtzee_studio" || a.id === "rad_yahtzee_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toContain("Yahtzee Royale Deluxe");
    expect(found?.icon).toBe("🎲");
    expect(found?.category).toBe("Games & Entertainment");
    expect(found?.description).toContain("Yahtzee");
  });
});
