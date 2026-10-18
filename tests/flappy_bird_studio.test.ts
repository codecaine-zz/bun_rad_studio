import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createFlappyBirdStudio,
  generateFlappyBirdStudioHtml,
  startFlappyBirdServer,
  getFlappyBirdAssetsDir,
} from "../applications/flappy_bird_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("🐦 Flappy Bird Deluxe — Cyber Legends Arcade Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getFlappyBirdAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("Flappy Bird");
    expect(html).toContain("AudioEngine");
    expect(html).toContain("triggerFlap");
    expect(html).toContain("gameCanvas");
    expect(html).toContain("pipes");
  });

  it("2. generateFlappyBirdStudioHtml injects desktop window shortcuts", () => {
    const html = generateFlappyBirdStudioHtml();
    expect(html).toContain("Flappy Bird");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
  });

  it("3. Studio factory generates correct defaults and instance contracts", () => {
    const app = createFlappyBirdStudio({ fullscreen: false, width: 950, height: 750 });
    expect(app.title).toContain("Flappy Bird Deluxe");
    expect(app.width).toBe(950);
    expect(app.height).toBe(750);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const server = startFlappyBirdServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("Flappy Bird");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json() as any;
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("flappy_bird_studio");
      expect(healthData.name).toContain("Flappy Bird Deluxe");
    } finally {
      server.stop(true);
    }
  });

  it("5. Launcher Studio automatically registers and surfaces Flappy Bird", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "flappy_bird_studio" || a.id === "rad_flappy_bird_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toBe("Codecaine Flappy Bird Deluxe");
    expect(found?.icon).toBe("🐦");
    expect(found?.category).toBe("Games & Entertainment");
    expect(found?.description).toContain("kinetic");
  });
});
