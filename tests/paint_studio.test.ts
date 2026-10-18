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
import { HELP_SKIP, HELP_TIPS } from "../src/shared/help";
import { auditHtml, uncovered } from "../src/shared/helpAudit";

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
    expect(html).toContain("strokeBufferCanvas");
    expect(html).toContain("gridCanvas");
    expect(html).toContain("previewCanvas");
    expect(html).toContain("vectorLayerWrap");
    expect(html).toContain("tool_brush");
    expect(html).toContain("tool_pencil");
    expect(html).toContain("tool_airbrush");
    expect(html).toContain("tool_pen");
    expect(html).toContain("tool_marker");
    expect(html).toContain("tool_watercolor");
    expect(html).toContain("tool_clone");
    expect(html).toContain("tool_bucket");
    expect(html).toContain("tool_gradient");
    expect(html).toContain("tool_eraser");
    expect(html).toContain("tool_line");
    expect(html).toContain("tool_curve");
    expect(html).toContain("tool_rect");
    expect(html).toContain("tool_circle");
    expect(html).toContain("tool_polygon");
    expect(html).toContain("tool_star");
    expect(html).toContain("tool_select");
    expect(html).toContain("tool_hand");
    expect(html).toContain("tool_picker");
    expect(html).toContain("tool_text");
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

  it("7. Includes complete pro paint features: multi-layer management, symmetry, selection/crop, filters, adjustments, and project I/O", () => {
    const html = generatePaintStudioHtml();
    // Multi-layer management
    expect(html).toContain("addPaintLayer");
    expect(html).toContain("duplicateActiveLayer");
    expect(html).toContain("mergeActiveLayerDown");
    expect(html).toContain("deleteActiveLayer");
    expect(html).toContain("layerBlendSelect");
    expect(html).toContain("layerOpacitySlider");

    // Symmetry & Mandala modes
    expect(html).toContain("symmetrySelect");
    expect(html).toContain("getSymmetryPoints");
    expect(html).toContain("radial12");

    // Selection marquee, copy/cut/paste, and crop
    expect(html).toContain("cropToSelection");
    expect(html).toContain("copySelection");
    expect(html).toContain("cutSelection");
    expect(html).toContain("pasteSelection");
    expect(html).toContain("flipSelection");

    // Image filters & color adjustments
    expect(html).toContain("applyCanvasFilter");
    expect(html).toContain("transformCanvas");
    expect(html).toContain("previewColorAdjustments");
    expect(html).toContain("commitColorAdjustments");

    // Draggable floating text tool & file import/export
    expect(html).toContain("floatingTextOverlay");
    expect(html).toContain("commitFloatingText");
    expect(html).toContain("saveProjectJson");
    expect(html).toContain("importFileObject");
  });

  it("8. All inline JavaScript blocks compile without syntax errors and every UI control has a help tip", async () => {
    const html = generatePaintStudioHtml();
    const scriptMatches = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)];
    expect(scriptMatches.length).toBeGreaterThanOrEqual(3);
    for (const match of scriptMatches) {
      const code = match[1]!;
      expect(() => new Function(code)).not.toThrow();
    }

    const controls = await auditHtml(html, HELP_TIPS.paint_studio!);
    const missing = uncovered(controls, HELP_SKIP.paint_studio ?? []);
    expect(missing).toEqual([]);
  });

  it("9. Vector Coloring Book Studio provides 106 unique multi-region illustrations with Color-by-Number, Group Fill, SVG Fill Styles, Auto-Color, and Line Styler", async () => {
    const mod = await import("../resources/paint/coloring_library.js" as any);
    const lib = mod.COLORING_LIBRARY as Array<any>;
    expect(lib.length).toBe(106);

    const uniqueSvgs = new Set(lib.map((item) => item.svg));
    expect(uniqueSvgs.size).toBe(106);

    for (const item of lib) {
      const targetMatches = item.svg.match(/color-fill-target/g) || [];
      expect(targetMatches.length).toBeGreaterThanOrEqual(14);
      expect(item.regionsCount).toBe(targetMatches.length);
      expect(Array.isArray(item.palette)).toBe(true);
      expect(item.palette.length).toBe(8);
      expect(item.svg).toContain('data-group="');
      expect(item.svg).toContain('data-num="');
      expect(item.svg).toContain('data-hint="#');
    }

    const html = generatePaintStudioHtml();
    expect(html).toContain("vecFillStyleSelect");
    expect(html).toContain("vecGroupFillCheck");
    expect(html).toContain("btnColorByNumber");
    expect(html).toContain("btnAutoColorArt");
    expect(html).toContain("btnRandomizeArt");
    expect(html).toContain("btnFavoriteArt");
    expect(html).toContain("vecLineColorInput");
    expect(html).toContain("vecLineWidthSlider");
    expect(html).toContain("galleryDifficultySelect");
    expect(html).toContain("galleryStatusSelect");
    expect(html).toContain("btnRandomArt");
    expect(html).toContain("autoColorVectorArt");
    expect(html).toContain("surpriseColorVectorArt");
    expect(html).toContain("renderColorByNumberOverlay");
    expect(html).toContain("getSvgFillValue");
  });
});

