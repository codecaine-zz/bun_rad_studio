import { mkdirSync, rmSync, truncateSync, writeFileSync } from "fs";
import { join } from "path";
import { Cdp, sleep } from "./cdp_recorder";
import { seedDemoWorkspace } from "./demo_workspace";
import type { Do } from "./step_video";
import { FM_HOME, type Chapter, type World } from "./fm_tutorial_script";
import {
  MASTER_CUSTOM_THEMES,
  getMasterCustomThemeExports,
  getMasterCustomThemesPackJson,
  getMasterCustomThemesPackShareCode,
} from "../../src/features/filemanager/fmMasterCustomThemes";

export const VIEW_H = 972;
export const RATE = "+8%";
export const GAP = 0.4;
export const RIG_MARK = "🍎 Mac Studio M4 Ultra · 32c CPU · 80c GPU · 192GB Unified · Pro Display XDR 6K 120Hz";

/** Shows a key combination on screen. */
export const showKeys = (d: Do, keys: string[]) => d.eval(`window.__cc.keys(${JSON.stringify(keys)})`);

/** Closes any open modal dialogs so the File Manager canvas is 100% unobstructed. */
export async function closeDialogs(d: Do) {
  for (let i = 0; i < 4 && (await d.eval<boolean>(`!!document.querySelector('.modal-backdrop')`)); i++) {
    await d.key("Escape", "Esc");
    await d.wait(400);
  }
  await d.eval(`document.querySelectorAll('.modal-backdrop').forEach(b => b.remove())`);
}

/** Moves a slider of the theme editor slowly, so the change can be seen. */
export async function slide(d: Do, label: string, from: number, to: number, step: number) {
  const sel = `.dialog input[aria-label='${label}']`;
  await d.hover(sel, 600);
  await d.eval(`(async () => { const r = document.querySelector(${JSON.stringify(sel)}); if (!r) return; const n = Math.round(Math.abs(${to} - ${from}) / ${step}); for (let i = 0; i <= n; i++) { r.value = String(${from} + Math.sign(${to} - ${from}) * ${step} * i); r.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((z) => setTimeout(z, 55)); } })()`);
  await d.wait(1000);
}

/** Chooses a value in one of the theme editor's lists. */
export async function pick(d: Do, label: string, value: string) {
  const sel = `.dialog select[aria-label='${label}']`;
  await d.hover(sel, 600);
  await d.eval(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); if (!s) return; s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await d.wait(800);
}

/**
 * Applies a theme while all modals are CLOSED so the viewer sees the full, unobstructed
 * File Manager in Icons View (#list.view-icons) with a sleek top-right corner HUD pill.
 */
export async function showThemeUnobstructed(
  d: Do,
  key: string,
  bannerTitle: string,
  bannerSub: string,
  opts: { anim?: string; holidayBurst?: boolean; hoverRow?: string; waitMs?: number; tierLabel?: string } = {},
) {
  const anim = opts.anim || "folder_3d_spin_turntable";
  const waitMs = opts.waitMs ?? 1350;
  const tierLabel = opts.tierLabel || "🔴 UNOBSTRUCTED 6K XDR ICONS VIEW · 120Hz ULTRA";
  await d.eval(`(async () => {
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    const { state } = await import('/ui/state.js');
    const { applyPalette, triggerHolidayCelebrationBurst } = await import('/ui/themes.js');
    const { applyAtmosphere } = await import('/ui/atmosphereFx.js');
    const { syncVisibleIcons } = await import('/ui/dom.js');
    if (state?.settings) {
      state.settings.atmosphereTier = 'ultra';
      state.settings.themeIconAnimation = ${JSON.stringify(anim)};
    }
    document.documentElement.dataset.fmIconAnim = ${JSON.stringify(anim)};
    applyPalette?.(${JSON.stringify(key)});
    if (${Boolean(opts.holidayBurst)}) {
      triggerHolidayCelebrationBurst?.(${JSON.stringify(key)});
    }
    try { applyAtmosphere?.(); } catch {}
    const listEl = document.getElementById('list');
    if (listEl) syncVisibleIcons(listEl);

    let banner = document.getElementById('fm-unobstructed-theme-hud');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'fm-unobstructed-theme-hud';
      banner.style.cssText = 'position:fixed;top:10px;right:18px;z-index:9999;pointer-events:none;padding:8px 14px;border-radius:12px;background:rgba(9,13,24,0.88);border:1.5px solid var(--accent, #ff8c1a);color:#fff;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 12px 28px rgba(0,0,0,0.55);backdrop-filter:blur(12px);max-width:470px;transition:all 0.2s ease;';
      document.body.appendChild(banner);
    }
    banner.innerHTML = '<div style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent, #ff8c1a);">' + ${JSON.stringify(tierLabel)} + '</div>'
      + '<div style="font-size:14px;font-weight:800;margin-top:2px;color:#ffffff;">' + ${JSON.stringify(bannerTitle)} + '</div>'
      + '<div style="font-size:11px;opacity:0.88;margin-top:1px;color:#cbd5e1;">' + ${JSON.stringify(bannerSub)} + '</div>';
  })()`);
  if (opts.hoverRow) {
    await d.hover(`#list .row[data-name=${JSON.stringify(opts.hoverRow)}]`, Math.min(750, waitMs)).catch(() => {});
    await d.wait(Math.max(250, waitMs - 750));
  } else {
    await d.wait(waitMs);
  }
}

export async function clearUnobstructedBanner(d: Do) {
  await d.eval(`document.getElementById('fm-unobstructed-theme-hud')?.remove()`);
}

export function createThemesTutorialEnv(opts: { tmpDir: string; cdpPort: number; fmPort: number }) {
  const ROOT = process.cwd();
  const TMP = opts.tmpDir;
  const HOME = join(TMP, FM_HOME);
  const DATA = join(TMP, "data");
  const GRAVE = join(TMP, "graveyard");
  const ZDOT = join(TMP, "zdot");

  function seedWorld(): World {
    rmSync(TMP, { recursive: true, force: true });
    for (const d of [HOME, DATA, GRAVE, ZDOT]) mkdirSync(d, { recursive: true });
    writeFileSync(
      join(ZDOT, ".zshrc"),
      [
        `export HOME=${JSON.stringify(HOME)}`,
        `unsetopt PROMPT_SP`,
        `PROMPT='%F{green}ada@studio%f:%F{blue}%~%f$ '`,
        `alias ll='ls -la'`,
        ``,
      ].join("\n"),
    );

    const w: World = {
      home: HOME,
      data: DATA,
      big: join(HOME, "Videos", "raw-footage.mp4"),
      put: (rel: string, body: string) => {
        const p = join(HOME, rel);
        mkdirSync(join(p, ".."), { recursive: true });
        writeFileSync(p, body);
      },
      dir: (rel: string) => mkdirSync(join(HOME, rel), { recursive: true }),
      bigFile: (rel: string, mb: number) => {
        const p = join(HOME, rel);
        mkdirSync(join(p, ".."), { recursive: true });
        writeFileSync(p, "Codecaine sample archive\n");
        truncateSync(p, mb * 1024 * 1024);
      },
    };

    seedDemoWorkspace(HOME, join(TMP, "frames"));

    // Rich semantic folders in shop-app so Icons View displays 14+ distinct 3D folders & crests
    for (const dirName of [
      "ai-models",
      "camera-raw",
      "docker",
      "games",
      "music-stems",
      "security-vault",
      "shaders",
      "custom_themes",
    ]) {
      w.dir?.(`Projects/shop-app/${dirName}`);
    }

    const customExports = getMasterCustomThemeExports();
    for (const baseDir of [join(HOME, "custom_themes"), join(HOME, "Projects", "shop-app", "custom_themes")]) {
      mkdirSync(baseDir, { recursive: true });
      for (const item of customExports) {
        writeFileSync(join(baseDir, `${item.slug}.json`), JSON.stringify(item.jsonPayload, null, 2) + "\n");
      }
      writeFileSync(join(baseDir, "master_all_systems_20_themes_pack.json"), JSON.stringify(getMasterCustomThemesPackJson(), null, 2) + "\n");
      writeFileSync(join(baseDir, "master_all_systems_20_themes_pack.ccfm.txt"), getMasterCustomThemesPackShareCode() + "\n");
      writeFileSync(join(baseDir, "pack_tier_1_low_featherweight.json"), JSON.stringify(getMasterCustomThemesPackJson("low"), null, 2) + "\n");
      writeFileSync(join(baseDir, "pack_tier_2_medium_balanced_60fps.json"), JSON.stringify(getMasterCustomThemesPackJson("medium"), null, 2) + "\n");
      writeFileSync(join(baseDir, "pack_tier_3_high_spec_120hz.json"), JSON.stringify(getMasterCustomThemesPackJson("high"), null, 2) + "\n");
      writeFileSync(join(baseDir, "pack_tier_4_ultra_6k_xdr_120hz.json"), JSON.stringify(getMasterCustomThemesPackJson("ultra"), null, 2) + "\n");
    }

    const styleGuideMd = [
      "# 🎨 Codecaine Professional Theme Design Style Guide",
      "",
      "## 1. Hardware Tier Budgets",
      "- **🟢 Low (`low`)**: 0% GPU load, `atmosphere: \"none\"`, crisp 1px borders.",
      "- **🟡 Medium (`medium`)**: 60fps 1-layer shader, `blur <= 18px`.",
      "- **🟠 High (`high`)**: 60–120Hz 2-layer shader mix, `blur <= 26px`.",
      "- **🔴 Ultra (`ultra`)**: Uncapped 120Hz ProMotion 6K XDR, 3-layer shader mix + 3D turntable icons.",
      "",
      "## 2. WCAG 2.1 Contrast Floors",
      "- Body text (`text` on `background` & `card`) >= **7.0:1 (AAA)**.",
      "- Accent controls (`accent` on `card`) >= **4.5:1 (AA)**.",
      "",
    ].join("\n");
    w.put("THEME_DESIGN_STYLE_GUIDE.md", styleGuideMd);
    w.put("custom_themes/00_THEME_DESIGN_STYLE_GUIDE.md", styleGuideMd);
    w.put("custom_themes/THEME_DESIGN_STYLE_GUIDE.md", styleGuideMd);
    w.put("Projects/shop-app/README.md", styleGuideMd);
    w.put("Projects/shop-app/THEME_DESIGN_STYLE_GUIDE.md", styleGuideMd);
    w.put("Projects/shop-app/custom_themes/00_THEME_DESIGN_STYLE_GUIDE.md", styleGuideMd);
    w.put("Projects/shop-app/custom_themes/THEME_DESIGN_STYLE_GUIDE.md", styleGuideMd);

    writeFileSync(
      join(DATA, "file_manager_themes.json"),
      JSON.stringify({ version: 1, themes: MASTER_CUSTOM_THEMES }, null, 2),
    );
    return w;
  }

  class ThemesEnv {
    c!: Cdp;
    private fm?: ReturnType<typeof Bun.spawn>;

    async start() {
      this.c = await Cdp.launch(opts.cdpPort, join(TMP, "chrome"), 1920, VIEW_H);
    }

    stop() {
      try {
        this.fm?.kill(9);
      } catch {}
      this.c?.close();
      rmSync(TMP, { recursive: true, force: true });
    }

    async open(ch: Chapter, world: World) {
      try {
        this.fm?.kill(9);
      } catch {}
      await sleep(400);
      const settingsPayload = JSON.stringify(
        {
          theme: "dark",
          palette: "holiday_halloween_jack_o_lantern",
          preferredLightPalette: "custom_0000000f",
          preferredDarkPalette: "polar_night",
          atmosphereTier: "ultra",
          themeIconAnimation: "folder_3d_spin_turntable",
          textSize: 100,
          view: "icons",
          sortBy: "name",
          sortDir: "asc",
          foldersFirst: true,
          showHidden: false,
          showInfoPanel: false,
          confirmTrash: true,
          favoriteThemes: [
            "holiday_halloween_jack_o_lantern",
            "polar_night",
            "cryo_icicle_blizzard",
            "custom_0000000d",
            "custom_0000000e",
            "custom_0000000f",
            "custom_00000010",
            "holiday_christmas_nutcracker_hearth",
          ],
          seenWelcome: true,
        },
        null,
        2,
      );
      writeFileSync(join(DATA, "file_manager.json"), settingsPayload);
      writeFileSync(join(DATA, "file_manager_settings.json"), settingsPayload);
      const path = (ch.path ?? `${HOME}/Projects/shop-app`).replace("<HOME>", HOME);
      this.fm = Bun.spawn(
        [
          process.execPath,
          join(ROOT, "applications", "file_manager_studio.ts"),
          "--server",
          "--port",
          String(opts.fmPort),
          "--home",
          HOME,
          "--data-dir",
          DATA,
          "--path",
          path,
        ],
        {
          cwd: "/tmp",
          stdout: "ignore",
          stderr: "ignore",
          env: {
            PATH: process.env.PATH ?? "",
            HOME: process.env.HOME ?? "",
            GRAVEYARD: GRAVE,
            SHELL: "/bin/zsh",
            ZDOTDIR: ZDOT,
            FM_SHOWCASE_MAC_ULTRA: "1",
          },
        },
      );
      for (let i = 0; i < 80; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${opts.fmPort}/`)).ok) break;
        } catch {}
        await sleep(250);
      }
      await this.c.goto(`http://127.0.0.1:${opts.fmPort}/`);
      await this.c.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start')?.click()`);
      await sleep(500);
      if (ch.view) {
        await this.c.eval(`document.querySelector(${JSON.stringify(ch.view)})?.click()`);
        await sleep(500);
      }
      void world;
    }
  }

  return { seedWorld, env: new ThemesEnv() };
}
