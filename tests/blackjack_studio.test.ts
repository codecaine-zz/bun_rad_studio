import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createBlackjackStudio,
  generateBlackjackStudioHtml,
  startBlackjackServer,
  getBlackjackAssetsDir,
} from "../applications/blackjack_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("🪙 Blackjack Royale VIP — Multi-Hand Casino Studio Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getBlackjackAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("Blackjack Royale VIP");
    expect(html).toContain("AudioEngine");
    expect(html).toContain("calculateHandScore");
    expect(html).toContain("handleDealAction");
    expect(html).toContain("handleHitAction");
    expect(html).toContain("handleStandAction");
    expect(html).toContain("handleDoubleAction");
    expect(html).toContain("handleSplitAction");
    expect(html).toContain("handleSurrenderAction");
    expect(html).toContain("evaluatePerfectPairs");
    expect(html).toContain("evaluate21Plus3");
    expect(html).toContain("Hi-Lo");
    expect(html).toContain("Basic Strategy");
    expect(html).toContain("poker-card");
    expect(html).toContain("court-portrait-box");
  });

  it("2. generateBlackjackStudioHtml injects desktop window shortcuts and storage polyfill", () => {
    const html = generateBlackjackStudioHtml();
    expect(html).toContain("Blackjack Royale VIP");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
    expect(html).toContain("localStorage");
  });

  it("3. Studio factory generates correct defaults and instance contracts", () => {
    const app = createBlackjackStudio({ fullscreen: false, width: 1240, height: 860 });
    expect(app.title).toContain("Blackjack Royale VIP");
    expect(app.width).toBe(1240);
    expect(app.height).toBe(860);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const server = startBlackjackServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("Blackjack Royale VIP");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json();
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("blackjack_studio");
      expect(healthData.name).toContain("Blackjack Royale VIP");
    } finally {
      server.stop(true);
    }
  });

  it("5. Launcher Studio automatically registers and surfaces Blackjack Royale", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "blackjack_studio" || a.id === "rad_blackjack_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toContain("Blackjack Royale VIP");
    expect(found?.icon).toBe("🪙");
    expect(found?.category).toBe("Games & Entertainment");
    expect(found?.description).toContain("Blackjack");
  });
});
