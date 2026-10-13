import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createSkiFreeStudio,
  generateSkiFreeStudioHtml,
  startSkiFreeServer,
  getSkiFreeAssetsDir,
} from "../applications/skifree_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("⛷️ SkiFree Deluxe — Winter Legends Arcade Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getSkiFreeAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("SkiFree");
    expect(html).toContain("AudioEngine");
    expect(html).toContain("yeti");
    expect(html).toContain("gameCanvas");
    expect(html).toContain("spawnRowObstacles");
  });

  it("2. generateSkiFreeStudioHtml injects desktop window shortcuts", () => {
    const html = generateSkiFreeStudioHtml();
    expect(html).toContain("SkiFree");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
  });

  it("3. Studio factory generates correct defaults and instance contracts", () => {
    const app = createSkiFreeStudio({ fullscreen: false, width: 1000, height: 800 });
    expect(app.title).toContain("SkiFree Deluxe");
    expect(app.width).toBe(1000);
    expect(app.height).toBe(800);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const server = startSkiFreeServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("SkiFree");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json() as any;
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("skifree_studio");
      expect(healthData.name).toContain("SkiFree Deluxe");
    } finally {
      server.stop(true);
    }
  });

  it("5. Launcher Studio automatically registers and surfaces SkiFree", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "skifree_studio" || a.id === "rad_skifree_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toBe("SkiFree Deluxe");
    expect(found?.icon).toBe("⛷️");
    expect(found?.category).toBe("Games & Entertainment");
    expect(found?.description).toContain("Yeti");
  });
});
