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

  it("6. Embedded scripts parse cleanly and include full Balatro Deluxe catalogs, persistent deck, FX, and modals", () => {
    const dir = getBalatroAssetsDir();
    const html = readFileSync(join(dir, "index.html"), "utf8");

    // Extract all inline <script> blocks and ensure every block has valid JavaScript syntax
    const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scriptMatches.length).toBeGreaterThanOrEqual(2);
    for (const match of scriptMatches) {
      expect(() => new Function(match[1])).not.toThrow();
    }

    // Verify expanded catalogs and core systems
    expect(html).toContain("PLANET_CATALOG");
    expect(html).toContain("SPECTRAL_CATALOG");
    expect(html).toContain("VOUCHER_CATALOG");
    expect(html).toContain("SKIP_TAGS");
    expect(html).toContain("selectedDeckType");
    expect(html).toContain("runDeck");
    expect(html).toContain("instantiateJoker");
    expect(html).toContain("buyBooster");
    expect(html).toContain("openRunInfoModal");

    // Verify fixed FxEngine particle and popup methods
    expect(html).toContain("spawnGlassShatter");
    expect(html).toContain("spawnCoinShower");
    expect(html).toContain("spawnLuckyStars");
    expect(html).toContain("spawnFloatingPopup");

    // Verify iconic Balatro Jokers and secret hands
    expect(html).toContain("Flush House");
    expect(html).toContain("Flush Five");
    expect(html).toContain('id: "blueprint"');
    expect(html).toContain('id: "brainstorm"');
    expect(html).toContain('id: "baron"');
    expect(html).toContain('id: "triboulet"');
    expect(html).toContain('id: "hanging_chad"');
    expect(html).toContain('id: "four_fingers"');
    expect(html).toContain('id: "shortcut"');

    // Verify new UI modals, round score progress bar, and modern CSS features
    expect(html).toContain("roundScoreVal");
    expect(html).toContain("blindProgressBar");
    expect(html).toContain("btnSkipBlind");
    expect(html).toContain("deckTypeSelect");
    expect(html).toContain("packModal");
    expect(html).toContain("runInfoModal");
    expect(html).toContain("btnEndlessMode");
    expect(html).toContain("--in-oklab");
    expect(html).toContain("isolation: isolate");
    expect(html).toContain("text-wrap: balance");
    expect(html).toContain("text-wrap: pretty");
  });
});

