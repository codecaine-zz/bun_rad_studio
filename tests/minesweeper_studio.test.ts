import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createMinesweeperStudio,
  generateMinesweeperStudioHtml,
  startMinesweeperServer,
  getMinesweeperAssetsDir,
} from "../applications/minesweeper_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("⚡ Minesweeper Pro — Championship Deluxe Master Edition Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getMinesweeperAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("Minesweeper Pro");
    expect(html).toContain("SoundEngine");
    expect(html).toContain("calculate3BV");
    expect(html).toContain("handleChord");
    expect(html).toContain("theme-graveyard");
  });

  it("2. generateMinesweeperStudioHtml injects desktop window shortcuts", () => {
    const html = generateMinesweeperStudioHtml();
    expect(html).toContain("Minesweeper Pro");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
  });

  it("3. Studio factory generates correct defaults and instance contracts", () => {
    const app = createMinesweeperStudio({ fullscreen: false, width: 1000, height: 800 });
    expect(app.title).toContain("Minesweeper Pro");
    expect(app.width).toBe(1000);
    expect(app.height).toBe(800);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const server = startMinesweeperServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("Minesweeper Pro");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json() as any;
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("minesweeper_studio");
      expect(healthData.name).toContain("Minesweeper Pro");
    } finally {
      server.stop(true);
    }
  });

  it("5. Launcher Studio automatically registers and surfaces Minesweeper Pro", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "minesweeper_studio" || a.id === "rad_minesweeper_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toBe("Minesweeper Pro Championship");
    expect(found?.icon).toBe("💣");
    expect(found?.category).toBe("Games & Entertainment");
    expect(found?.description).toContain("safe first-click");
  });
});
