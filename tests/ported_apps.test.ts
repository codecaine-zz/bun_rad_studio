import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import {
  createDrCodecaineStudio,
  generateDrCodecaineStudioHtml,
  startDrCodecaineStudioServer,
  getDrCodecaineAssetsDir,
} from "../applications/dr_codecaine_studio.ts";
import {
  createIntervalTimerStudio,
  generateIntervalTimerStudioHtml,
  startIntervalTimerStudioServer,
  getIntervalTimerAssetsDir,
} from "../applications/interval_timer_studio.ts";
import {
  createLoloStudio,
  generateLoloStudioHtml,
  startLoloStudioServer,
  getLoloAssetsDir,
} from "../applications/lolo_studio.ts";
import {
  createRodentsRevengeStudio,
  generateRodentsRevengeStudioHtml,
  startRodentsRevengeStudioServer,
  getRodentsRevengeAssetsDir,
} from "../applications/rodents_revenge_studio.ts";
import {
  createPacmanStudio,
  generatePacmanStudioHtml,
  startPacmanStudioServer,
  getPacmanAssetsDir,
} from "../applications/pacman_studio.ts";
import {
  createWordSearchStudio,
  generateWordSearchStudioHtml,
  startWordSearchStudioServer,
  getWordSearchAssetsDir,
} from "../applications/word_search_studio.ts";
import {
  createWorldTimeZonesStudio,
  generateWorldTimeZonesStudioHtml,
  startWorldTimeZonesStudioServer,
  getWorldTimeZonesAssetsDir,
} from "../applications/world_time_zones_studio.ts";
import { scanWorkspaceApps } from "../applications/launcher_studio.ts";

describe("⚡ Ported Applications Suite (Dr Codecaine, Interval Timer, Lolo, Rodent's Revenge, Word Search, World Time Zones)", () => {
  // ---------------------------------------------------------------------------
  // 1. Dr. Codecaine Arcade
  // ---------------------------------------------------------------------------
  describe("1. Dr. Codecaine Arcade", () => {
    it("Static assets are present and readable", () => {
      const dir = getDrCodecaineAssetsDir();
      expect(existsSync(join(dir, "index.html"))).toBe(true);
      expect(existsSync(join(dir, "favicon.svg"))).toBe(true);
      const html = readFileSync(join(dir, "index.html"), "utf8");
      expect(html).toContain("Dr. Codecaine");
      expect(html).toContain("TripleASoundEngine");
    });

    it("HTML generation injects desktop shortcuts", () => {
      const html = generateDrCodecaineStudioHtml();
      expect(html).toContain("Dr. Codecaine");
      expect(html).toContain("requestInitialFullscreen");
    });

    it("Desktop instance initializes properly", () => {
      const studio = createDrCodecaineStudio({ fullscreen: true });
      expect(studio.title).toContain("Dr. Codecaine");
      expect(studio.fullscreen).toBe(true);
      expect(typeof studio.run).toBe("function");
      expect(typeof studio.generateHtml).toBe("function");
    });

    it("Bun.serve server serves index, favicon, and health API", async () => {
      const server = startDrCodecaineStudioServer({ port: 0 });
      const base = `http://127.0.0.1:${server.port}`;
      try {
        const resIndex = await fetch(`${base}/`);
        expect(resIndex.status).toBe(200);
        expect(resIndex.headers.get("Content-Type")).toContain("text/html");

        const resFav = await fetch(`${base}/favicon.svg`);
        expect(resFav.status).toBe(200);
        expect(resFav.headers.get("Content-Type")).toContain("image/svg+xml");

        const resHealth = await fetch(`${base}/api/health`);
        expect(resHealth.status).toBe(200);
        const data = await resHealth.json();
        expect(data.status).toBe("ok");
        expect(data.app).toBe("dr_codecaine_studio");
      } finally {
        server.stop();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Interval Timer Suite
  // ---------------------------------------------------------------------------
  describe("2. Interval Timer Suite", () => {
    it("Static assets are present and readable", () => {
      const dir = getIntervalTimerAssetsDir();
      expect(existsSync(join(dir, "index.html"))).toBe(true);
      expect(existsSync(join(dir, "favicon.png"))).toBe(true);
      expect(existsSync(join(dir, "cache/codecaine_playlist.json"))).toBe(true);
      expect(existsSync(join(dir, "assets/animations/towel_single_arm_pull.gif"))).toBe(true);

      const html = readFileSync(join(dir, "index.html"), "utf8");
      expect(html).toContain("music-companion-panel");
      expect(html).not.toContain("<?php");
    });

    it("HTML generation injects desktop shortcuts", () => {
      const html = generateIntervalTimerStudioHtml();
      expect(html).toContain("requestInitialFullscreen");
    });

    it("Desktop instance initializes properly", () => {
      const studio = createIntervalTimerStudio({ fullscreen: true });
      expect(studio.title).toContain("Interval Timer");
      expect(studio.fullscreen).toBe(true);
    });

    it("Bun.serve server serves index, animation assets, playlist sync, and health API", async () => {
      const server = startIntervalTimerStudioServer({ port: 0 });
      const base = `http://127.0.0.1:${server.port}`;
      try {
        const resIndex = await fetch(`${base}/`);
        expect(resIndex.status).toBe(200);

        const resSync = await fetch(`${base}/api/sync_playlist`);
        expect(resSync.status).toBe(200);
        const syncData = await resSync.json();
        expect(syncData.success).toBe(true);
        expect(syncData.count).toBeGreaterThan(0);

        const resAnim = await fetch(`${base}/assets/animations/towel_single_arm_pull.gif`);
        expect(resAnim.status).toBe(200);

        const resHealth = await fetch(`${base}/api/health`);
        expect(resHealth.status).toBe(200);
        const data = await resHealth.json();
        expect(data.status).toBe("ok");
        expect(data.app).toBe("interval_timer_studio");
      } finally {
        server.stop();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Adventures of Lolo Remaster
  // ---------------------------------------------------------------------------
  describe("3. Adventures of Lolo Remaster", () => {
    it("Static assets are present and readable", () => {
      const dir = getLoloAssetsDir();
      expect(existsSync(join(dir, "index.html"))).toBe(true);
      expect(existsSync(join(dir, "manual.html"))).toBe(true);
      expect(existsSync(join(dir, "favicon.png"))).toBe(true);
      const html = readFileSync(join(dir, "index.html"), "utf8");
      expect(html).toContain("Adventures of Lolo");
    });

    it("HTML generation injects desktop shortcuts", () => {
      const html = generateLoloStudioHtml();
      expect(html).toContain("Adventures of Lolo");
      expect(html).toContain("requestInitialFullscreen");
    });

    it("Desktop instance initializes properly", () => {
      const studio = createLoloStudio({ fullscreen: true });
      expect(studio.title).toContain("Adventures of Lolo");
      expect(studio.fullscreen).toBe(true);
    });

    it("Bun.serve server serves index, manual, favicon, and health API", async () => {
      const server = startLoloStudioServer({ port: 0 });
      const base = `http://127.0.0.1:${server.port}`;
      try {
        const resIndex = await fetch(`${base}/`);
        expect(resIndex.status).toBe(200);

        const resManual = await fetch(`${base}/manual.html`);
        expect(resManual.status).toBe(200);

        const resHealth = await fetch(`${base}/api/health`);
        expect(resHealth.status).toBe(200);
        const data = await resHealth.json();
        expect(data.status).toBe("ok");
        expect(data.app).toBe("lolo_studio");
      } finally {
        server.stop();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Rodent's Revenge Deluxe
  // ---------------------------------------------------------------------------
  describe("4. Rodent's Revenge Deluxe", () => {
    it("Static assets are present and readable", () => {
      const dir = getRodentsRevengeAssetsDir();
      expect(existsSync(join(dir, "index.html"))).toBe(true);
      expect(existsSync(join(dir, "favicon.svg"))).toBe(true);
      const html = readFileSync(join(dir, "index.html"), "utf8");
      expect(html).toContain("Rodent's Revenge");
    });

    it("HTML generation injects desktop shortcuts", () => {
      const html = generateRodentsRevengeStudioHtml();
      expect(html).toContain("Rodent's Revenge");
      expect(html).toContain("requestInitialFullscreen");
    });

    it("Desktop instance initializes properly", () => {
      const studio = createRodentsRevengeStudio({ fullscreen: true });
      expect(studio.title).toContain("Rodent's Revenge");
      expect(studio.fullscreen).toBe(true);
    });

    it("Bun.serve server serves index, favicon, and health API", async () => {
      const server = startRodentsRevengeStudioServer({ port: 0 });
      const base = `http://127.0.0.1:${server.port}`;
      try {
        const resIndex = await fetch(`${base}/`);
        expect(resIndex.status).toBe(200);

        const resFav = await fetch(`${base}/favicon.svg`);
        expect(resFav.status).toBe(200);

        const resHealth = await fetch(`${base}/api/health`);
        expect(resHealth.status).toBe(200);
        const data = await resHealth.json();
        expect(data.status).toBe("ok");
        expect(data.app).toBe("rodents_revenge_studio");
      } finally {
        server.stop();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Neon Word Search Labyrinth
  // ---------------------------------------------------------------------------
  describe("5. Neon Word Search Labyrinth", () => {
    it("Static assets are present and readable", () => {
      const dir = getWordSearchAssetsDir();
      expect(existsSync(join(dir, "index.html"))).toBe(true);
      expect(existsSync(join(dir, "favicon.png"))).toBe(true);
      expect(existsSync(join(dir, "favicon.svg"))).toBe(true);
      const html = readFileSync(join(dir, "index.html"), "utf8");
      expect(html).toContain("Word Search");
    });

    it("HTML generation injects desktop shortcuts", () => {
      const html = generateWordSearchStudioHtml();
      expect(html).toContain("Word Search");
      expect(html).toContain("requestInitialFullscreen");
    });

    it("Desktop instance initializes properly", () => {
      const studio = createWordSearchStudio({ fullscreen: true });
      expect(studio.title).toContain("Word Search");
      expect(studio.fullscreen).toBe(true);
    });

    it("Bun.serve server serves index, favicon, and health API", async () => {
      const server = startWordSearchStudioServer({ port: 0 });
      const base = `http://127.0.0.1:${server.port}`;
      try {
        const resIndex = await fetch(`${base}/`);
        expect(resIndex.status).toBe(200);

        const resFav = await fetch(`${base}/favicon.svg`);
        expect(resFav.status).toBe(200);

        const resHealth = await fetch(`${base}/api/health`);
        expect(resHealth.status).toBe(200);
        const data = await resHealth.json();
        expect(data.status).toBe("ok");
        expect(data.app).toBe("word_search_studio");
      } finally {
        server.stop();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. World Time Zones Studio Pro
  // ---------------------------------------------------------------------------
  describe("6. World Time Zones Studio Pro", () => {
    it("Static assets are present and readable", () => {
      const dir = getWorldTimeZonesAssetsDir();
      expect(existsSync(join(dir, "index.html"))).toBe(true);
      expect(existsSync(join(dir, "favicon.png"))).toBe(true);
      expect(existsSync(join(dir, "favicon.svg"))).toBe(true);
      const html = readFileSync(join(dir, "index.html"), "utf8");
      expect(html).toContain("World Time Zones");
      expect(html).not.toContain("<?php");
    });

    it("HTML generation injects desktop shortcuts", () => {
      const html = generateWorldTimeZonesStudioHtml();
      expect(html).toContain("World Time Zones");
      expect(html).toContain("requestInitialFullscreen");
    });

    it("Desktop instance initializes properly", () => {
      const studio = createWorldTimeZonesStudio({ fullscreen: true });
      expect(studio.title).toContain("World Time Zones");
      expect(studio.fullscreen).toBe(true);
    });

    it("Bun.serve server serves index, favicon, and health API", async () => {
      const server = startWorldTimeZonesStudioServer({ port: 0 });
      const base = `http://127.0.0.1:${server.port}`;
      try {
        const resIndex = await fetch(`${base}/`);
        expect(resIndex.status).toBe(200);

        const resFav = await fetch(`${base}/favicon.svg`);
        expect(resFav.status).toBe(200);

        const resHealth = await fetch(`${base}/api/health`);
        expect(resHealth.status).toBe(200);
        const data = await resHealth.json();
        expect(data.status).toBe("ok");
        expect(data.app).toBe("world_time_zones_studio");
      } finally {
        server.stop();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6b. Cyberpunk Pac-Man Arcade
  // ---------------------------------------------------------------------------
  describe("6b. Cyberpunk Pac-Man Arcade", () => {
    it("Static assets are present and readable", () => {
      const dir = getPacmanAssetsDir();
      expect(existsSync(join(dir, "index.html"))).toBe(true);
      expect(existsSync(join(dir, "favicon.svg"))).toBe(true);
      const html = readFileSync(join(dir, "index.html"), "utf8");
      expect(html).toContain("Pac-Man");
      expect(html).not.toContain("<?=");
    });

    it("HTML generation injects desktop shortcuts", () => {
      const html = generatePacmanStudioHtml();
      expect(html).toContain("Pac-Man");
      expect(html).toContain("requestInitialFullscreen");
    });

    it("Desktop instance initializes properly", () => {
      const studio = createPacmanStudio({ fullscreen: true });
      expect(studio.title).toContain("Pac-Man");
      expect(studio.fullscreen).toBe(true);
    });

    it("Bun.serve server serves index, favicon, and health API", async () => {
      const server = startPacmanStudioServer({ port: 0 });
      const base = `http://127.0.0.1:${server.port}`;
      try {
        const resIndex = await fetch(`${base}/`);
        expect(resIndex.status).toBe(200);

        const resFav = await fetch(`${base}/favicon.svg`);
        expect(resFav.status).toBe(200);

        const resHealth = await fetch(`${base}/api/health`);
        expect(resHealth.status).toBe(200);
        const data = await resHealth.json();
        expect(data.status).toBe("ok");
        expect(data.app).toBe("pacman_studio");
      } finally {
        server.stop();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Launcher Studio Auto-Discovery of all 7 apps
  // ---------------------------------------------------------------------------
  it("7. Launcher Studio automatically discovers and registers all 7 new applications", () => {
    const apps = scanWorkspaceApps();
    const appNames = [
      "dr_codecaine_studio",
      "interval_timer_studio",
      "lolo_studio",
      "pacman_studio",
      "rodents_revenge_studio",
      "word_search_studio",
      "world_time_zones_studio",
    ];

    for (const name of appNames) {
      const found = apps.find((a) => a.name === name || a.id === `rad_${name}`);
      expect(found).toBeDefined();
      expect(found?.displayName.length).toBeGreaterThan(0);
      expect(found?.icon.length).toBeGreaterThan(0);
      expect(found?.category.length).toBeGreaterThan(0);
    }
  });
});
