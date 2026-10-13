import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createMathMunchersStudio,
  generateMathMunchersStudioHtml,
  startMathMunchersServer,
  getMathMunchersAssetsDir,
} from "../applications/math_munchers_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("👾 Math Munchers Deluxe — Cyber Legends Arcade Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getMathMunchersAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("Math Munchers");
    expect(html).toContain("AudioEngine");
    expect(html).toContain("troggles");
    expect(html).toContain("gameCanvas");
    expect(html).toContain("munchCurrentTile");
  });

  it("2. generateMathMunchersStudioHtml injects desktop window shortcuts", () => {
    const html = generateMathMunchersStudioHtml();
    expect(html).toContain("Math Munchers");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
  });

  it("3. Studio factory generates correct defaults and instance contracts", () => {
    const app = createMathMunchersStudio({ fullscreen: false, width: 1100, height: 850 });
    expect(app.title).toContain("Math Munchers Deluxe");
    expect(app.width).toBe(1100);
    expect(app.height).toBe(850);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("4. Server endpoint serves HTML, favicon, and health API successfully", async () => {
    const server = startMathMunchersServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("Math Munchers");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json() as any;
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("math_munchers_studio");
      expect(healthData.name).toContain("Math Munchers Deluxe");
    } finally {
      server.stop(true);
    }
  });

  it("5. Launcher Studio automatically registers and surfaces Math Munchers", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "math_munchers_studio" || a.id === "rad_math_munchers_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toBe("Math Munchers Deluxe");
    expect(found?.icon).toBe("👾");
    expect(found?.category).toBe("Games & Entertainment");
    expect(found?.description).toContain("Troggles");
  });
});
