import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  createPaintStudio,
  generatePaintStudioHtml,
  startPaintServer,
  getPaintAssetsDir,
} from "../applications/paint_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";
import { COLORING_LIBRARY } from "../resources/paint/coloring_library.js";

describe("🎨 Chroma Studio Pro — Advanced Paint & Vector Coloring Studio Suite", () => {
  it("1. Static assets are present, readable, and properly structured", () => {
    const dir = getPaintAssetsDir();
    expect(existsSync(join(dir, "index.html"))).toBe(true);
    expect(existsSync(join(dir, "favicon.svg"))).toBe(true);
    expect(existsSync(join(dir, "coloring_library.js"))).toBe(true);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("Chroma Studio Pro");
    expect(html).toContain("bgCanvas");
    expect(html).toContain("drawCanvas");
    expect(html).toContain("previewCanvas");
    expect(html).toContain("vectorLayerWrap");
    expect(html).toContain("tool_brush");
    expect(html).toContain("tool_airbrush");
    expect(html).toContain("tool_bucket");
    expect(html).toContain("tool_eraser");
    expect(html).toContain("floodFill");
    expect(html).toContain("loadVectorArtwork");
  });

  it("2. Coloring library contains over 100 high-quality vector graphics across 10 categories", () => {
    expect(Array.isArray(COLORING_LIBRARY)).toBe(true);
    expect(COLORING_LIBRARY.length).toBeGreaterThanOrEqual(100);
    expect(COLORING_LIBRARY.length).toBe(106);

    const requiredCategories = [
      "animals", "mandala", "fantasy", "nature", "space",
      "vehicles", "food", "architecture", "popart", "ocean"
    ];

    const categoryCounts: Record<string, number> = {};
    for (const item of COLORING_LIBRARY) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(typeof item.category).toBe("string");
      expect(typeof item.svg).toBe("string");
      expect(item.svg).toContain("<svg");
      expect(item.svg).toContain("</svg>");
      expect(item.svg).toContain("color-fill-target");

      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    }

    for (const cat of requiredCategories) {
      expect(categoryCounts[cat]).toBeGreaterThanOrEqual(10);
    }
  });

  it("3. generatePaintStudioHtml injects desktop window shortcuts and storage polyfill", () => {
    const html = generatePaintStudioHtml();
    expect(html).toContain("Chroma Studio Pro");
    expect(html).toContain("window.addEventListener");
    expect(html).toContain("btnHub");
    expect(html).toContain("localStorage");
  });

  it("4. Studio factory generates correct defaults and instance contracts", () => {
    const app = createPaintStudio({ fullscreen: false, width: 1380, height: 920 });
    expect(app.title).toContain("Chroma Studio Pro");
    expect(app.width).toBe(1380);
    expect(app.height).toBe(920);
    expect(app.fullscreen).toBe(false);
    expect(typeof app.generateHtml).toBe("function");
    expect(typeof app.run).toBe("function");
  });

  it("5. Server endpoint serves HTML, favicon, library module, and health API successfully", async () => {
    const server = startPaintServer({ port: 0, host: "127.0.0.1" });
    try {
      const base = `http://127.0.0.1:${server.port}`;

      // Root endpoint
      const resHtml = await fetch(`${base}/`);
      expect(resHtml.status).toBe(200);
      const textHtml = await resHtml.text();
      expect(textHtml).toContain("Chroma Studio Pro");

      // Favicon endpoint
      const resFav = await fetch(`${base}/favicon.svg`);
      expect(resFav.status).toBe(200);
      expect(resFav.headers.get("content-type")).toContain("image/svg+xml");

      // Coloring Library JS Module endpoint
      const resLib = await fetch(`${base}/coloring_library.js`);
      expect(resLib.status).toBe(200);
      const textLib = await resLib.text();
      expect(textLib).toContain("COLORING_LIBRARY");
      expect(textLib).toContain("Royal African Lion");

      // Health check endpoint
      const resHealth = await fetch(`${base}/api/health`);
      expect(resHealth.status).toBe(200);
      const healthData = await resHealth.json() as any;
      expect(healthData.status).toBe("ok");
      expect(healthData.app).toBe("paint_studio");
      expect(healthData.totalVectorGraphics).toBe(106);
    } finally {
      server.stop(true);
    }
  });

  it("6. Launcher Studio automatically registers and surfaces Chroma Studio Pro", () => {
    const apps = scanWorkspaceApps();
    const found = apps.find((a) => a.name === "paint_studio" || a.id === "rad_paint_studio");
    expect(found).toBeDefined();
    expect(found?.displayName).toContain("Chroma Studio Pro");
    expect(found?.icon).toBe("🎨");
    expect(found?.category).toBe("Design & Media");
    expect(found?.description).toContain("106+ vector coloring book");
  });
});
