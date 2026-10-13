import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createBalatroStudio,
  generateBalatroStudioHtml,
  startBalatroServer,
  getBalatroAssetsDir,
} from "../applications/balatro_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("🃏 Joker Royale — Balatro Deluxe Roguelike Poker Studio Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getBalatroAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("JOKER ROYALE");
    expect(html).toContain("AudioEngine");
    expect(html).toContain("POKER_HANDS");
    expect(html).toContain("JOKER_CATALOG");
    expect(html).toContain("evaluateHand");
    expect(html).toContain("calculateHandScore");
    expect(html).toContain("poker-card");
    expect(html).toContain("blindCard");
  });

  it("2. generateBalatroStudioHtml injects desktop window shortcuts", () => {
    const html = generateBalatroStudioHtml();
    expect(html).toContain("JOKER ROYALE");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
    expect(html).toContain("localStorage");
  });

  it("3. Studio factory generates correct defaults and instance contracts", () => {
    const app = createBalatroStudio({ fullscreen: false, width: 1200, height: 860 });
    expect(app.title).toContain("Joker Royale");
    expect(app.width).toBe(1200);
    expect(app.height).toBe(860);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const server = startBalatroServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("JOKER ROYALE");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json() as any;
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("balatro_studio");
      expect(healthData.name).toContain("Joker Royale");
    } finally {
      server.stop(true);
    }
  });

  it("5. Launcher Studio automatically registers and surfaces Joker Royale", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "balatro_studio" || a.id === "rad_balatro_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toContain("Joker Royale");
    expect(found?.icon).toBe("🃏");
    expect(found?.category).toBe("Games & Entertainment");
    expect(found?.description).toContain("Jokers");
  });
});
