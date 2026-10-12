import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createRatScrewStudio,
  generateRatScrewStudioHtml,
  startRatScrewServer,
  getRatScrewAssetsDir,
} from "../applications/rat_screw_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("🎴 Egyptian Rat Screw Royale — Deluxe Reflex Card Studio Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getRatScrewAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("EGYPTIAN RAT SCREW");
    expect(html).toContain("AudioEngine");
    expect(html).toContain("SUITS");
    expect(html).toContain("RANKS");
    expect(html).toContain("evaluateCurrentPotSlap");
    expect(html).toContain("handleSlapAttempt");
    expect(html).toContain("poker-card");
    expect(html).toContain("court-portrait-box");
  });

  it("2. generateRatScrewStudioHtml injects desktop window shortcuts", () => {
    const html = generateRatScrewStudioHtml();
    expect(html).toContain("EGYPTIAN RAT SCREW");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
    expect(html).toContain("localStorage");
  });

  it("3. Studio factory generates correct defaults and instance contracts", () => {
    const app = createRatScrewStudio({ fullscreen: false, width: 1240, height: 860 });
    expect(app.title).toContain("Egyptian Rat Screw Royale");
    expect(app.width).toBe(1240);
    expect(app.height).toBe(860);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const server = startRatScrewServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("EGYPTIAN RAT SCREW");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json();
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("rat_screw_studio");
      expect(healthData.name).toContain("Egyptian Rat Screw Royale");
    } finally {
      server.stop(true);
    }
  });

  it("5. Launcher Studio automatically registers and surfaces Egyptian Rat Screw", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "rat_screw_studio" || a.id === "rad_rat_screw_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toContain("Egyptian Rat Screw Royale");
    expect(found?.icon).toBe("🎴");
    expect(found?.category).toBe("Games & Entertainment");
    expect(found?.description).toContain("reflex");
  });
});
