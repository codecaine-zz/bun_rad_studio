import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createPokerStudio,
  generatePokerStudioHtml,
  startPokerServer,
  getPokerAssetsDir,
} from "../applications/poker_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("♠️ Texas Hold'em & 5-Card Draw Poker Royale — Deluxe Casino Studio Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getPokerAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("Texas Hold'em");
    expect(html).toContain("5-Card Draw");
    expect(html).toContain("AudioEngine");
    expect(html).toContain("SUITS");
    expect(html).toContain("RANKS");
    expect(html).toContain("evaluate5Cards");
    expect(html).toContain("evaluate7Cards");
    expect(html).toContain("Doyle Brunson");
    expect(html).toContain("Phil Hellmuth");
    expect(html).toContain("Johnny Chan");
    expect(html).toContain("Daniel Negreanu");
    expect(html).toContain("Gus Hansen");
    expect(html).toContain("poker-card");
    expect(html).toContain("court-portrait-box");
  });

  it("2. generatePokerStudioHtml injects desktop window shortcuts and storage polyfill", () => {
    const html = generatePokerStudioHtml();
    expect(html).toContain("Texas Hold'em");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
    expect(html).toContain("localStorage");
  });

  it("3. Studio factory generates correct defaults and instance contracts", () => {
    const app = createPokerStudio({ fullscreen: false, width: 1240, height: 860 });
    expect(app.title).toContain("Poker Royale");
    expect(app.width).toBe(1240);
    expect(app.height).toBe(860);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const server = startPokerServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("Texas Hold'em");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json();
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("poker_studio");
      expect(healthData.name).toContain("Texas Hold'em & 5-Card Draw Poker Royale");
    } finally {
      server.stop(true);
    }
  });

  it("5. Launcher Studio automatically registers and surfaces Poker Royale", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "poker_studio" || a.id === "rad_poker_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toContain("Texas Hold'em & 5-Card Draw Poker Royale");
    expect(found?.icon).toBe("♠️");
    expect(found?.category).toBe("Games & Entertainment");
    expect(found?.description).toContain("Texas Hold'em and 5-Card Draw");
  });
});
