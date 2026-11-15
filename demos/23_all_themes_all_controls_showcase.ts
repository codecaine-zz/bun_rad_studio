/**
 * ⚡ Bun RAD Studio Demo 23: Complete Theme & All Controls Showcase Studio
 *
 * Demonstrates:
 * - Dynamic discovery of every canonical theme in SIMPLEGUI_THEMES (Light, Dark, OS Heritage & FX Shaders)
 * - Live Theme Swatch, Tier & Rendering Telemetry Strip + Interactive Filterable Theme Gallery Rail
 * - Every type of SimpleGUI control rendered simultaneously on a single well-proportioned studio form:
 *   • Title & Section Headers, Theme Selector, Live Swatches & Semantic Tier Badges
 *   • Single-line Text, Password, Search, Masked Input, Tag & Token Fields, Inline Editable Label, Textarea
 *   • Checkboxes, Toggles/Switches, Segmented Control, Dropdowns, Multi-ListBox, Number Stepper
 *   • Color Well, Date Picker, Time Picker, Sliders, Progress Bars, Hotkey Badges, Status Badges
 *   • Multi-Select Data Table, Dual Transfer List, Hierarchical TreeGrid, Workspace Tree View
 *   • Side-by-Side Diff Viewer, Interactive Resizable Splitter, Closable Tabs, Kanban Sprint Board
 *   • Primary Theme-Accent Button, Secondary/Ghost Modal & Export Actions, Random Theme Switcher, Danger Exit
 * - Strict synthetic demo placeholder data throughout (zero personal, host, or local filesystem identifiers)
 */

import {
  simplegui,
  SimpleWindow,
  SIMPLEGUI_THEMES,
  VLANG_THEME_NAMES,
  getTheme,
  autoShortThemeName,
} from "../index.ts";
import { DEFAULT_FAVORITE_SIMPLEGUI_THEMES } from "../src/shared/simpleguiThemes.ts";

export { DEFAULT_FAVORITE_SIMPLEGUI_THEMES };

export type ShowcaseThemeTier = "fx" | "os" | "light" | "dark";

export interface ShowcaseThemeEntry {
  key: string;
  name: string;
  shortName: string;
  description: string;
  isDark: boolean;
  isDefaultFavorite: boolean;
  tier: ShowcaseThemeTier;
  tierLabel: string;
  bg: string;
  cardBg: string;
  cardBorder: string;
  fg: string;
  accent: string;
  secondary: string;
  fxSummary: string;
}

export interface ShowcaseCatalogSummary {
  entries: ShowcaseThemeEntry[];
  total: number;
  favoritesCount: number;
  darkCount: number;
  lightCount: number;
  osCount: number;
  fxCount: number;
}

const OS_HERITAGE_PATTERN =
  /\b(win95|win98|winxp|win11|windows|ubuntu|adwaita|gnome|mint|pop_os|fedora|kde|breeze|mac_os|macos|apple_|aqua|sonoma|beos|haiku|amiga|nextstep|irix|cde|solaris|gameboy|c64|commodore|dos|atari|amber_crt)\b/i;

function classifyThemeTier(key: string, theme: any): {
  tier: ShowcaseThemeTier;
  tierLabel: string;
  fxSummary: string;
} {
  if (theme && theme.fx) {
    const parts: string[] = [];
    if (theme.fx.backdrop && theme.fx.backdrop !== "none") {
      parts.push(`backdrop:${theme.fx.backdrop}`);
    }
    if (theme.fx.glow && theme.fx.glow !== "none") {
      parts.push(`glow:${theme.fx.glow}`);
    }
    if (theme.fx.motion && theme.fx.motion !== "none") {
      parts.push(`motion:${theme.fx.motion}`);
    }
    if (theme.fx.chrome && theme.fx.chrome !== "none") {
      parts.push(`chrome:${theme.fx.chrome}`);
    }
    return {
      tier: "fx",
      tierLabel: "FX Shader",
      fxSummary: parts.length > 0 ? parts.join(" · ") : "GPU Shader Pipeline",
    };
  }
  if (OS_HERITAGE_PATTERN.test(`${key} ${theme?.name || ""}`)) {
    return {
      tier: "os",
      tierLabel: "OS & Heritage",
      fxSummary: "Native Crisp CSS · Zero Shader Overhead",
    };
  }
  if (!theme?.is_dark) {
    return {
      tier: "light",
      tierLabel: "Studio Light",
      fxSummary: "Daylight Calibrated · Crisp Hairline Chrome",
    };
  }
  return {
    tier: "dark",
    tierLabel: "Studio Dark",
    fxSummary: "Studio Low-Glare · Layered Surface Depth",
  };
}

function escapeAttr(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let cachedThemeCount = -1;
let cachedCatalog: ShowcaseCatalogSummary | null = null;

/**
 * Dynamically builds the canonical, deduplicated catalog of all themes registered in `SIMPLEGUI_THEMES`.
 * Preserves canonical `VLANG_THEME_NAMES` ordering first and automatically includes any additional
 * themes registered in `SIMPLEGUI_THEMES` (deduplicated by `theme.name`).
 */
export function getShowcaseThemeCatalog(): ShowcaseCatalogSummary {
  const currentKeys = Object.keys(SIMPLEGUI_THEMES);
  if (cachedCatalog && cachedThemeCount === currentKeys.length) {
    return cachedCatalog;
  }

  const defaultFavSet = new Set<string>(DEFAULT_FAVORITE_SIMPLEGUI_THEMES);
  const seenNames = new Set<string>();
  const orderedKeys: string[] = [];

  for (const favKey of DEFAULT_FAVORITE_SIMPLEGUI_THEMES) {
    const t = SIMPLEGUI_THEMES[favKey];
    if (t && !seenNames.has(t.name)) {
      seenNames.add(t.name);
      orderedKeys.push(favKey);
    }
  }
  for (const canonicalKey of VLANG_THEME_NAMES) {
    const t = SIMPLEGUI_THEMES[canonicalKey];
    if (t && !seenNames.has(t.name)) {
      seenNames.add(t.name);
      orderedKeys.push(canonicalKey);
    }
  }
  for (const [k, t] of Object.entries(SIMPLEGUI_THEMES)) {
    if (t && !seenNames.has(t.name)) {
      seenNames.add(t.name);
      orderedKeys.push(k);
    }
  }

  let favoritesCount = 0;
  let darkCount = 0;
  let lightCount = 0;
  let osCount = 0;
  let fxCount = 0;

  const entries: ShowcaseThemeEntry[] = orderedKeys.map((key) => {
    const t: any = getTheme(key);
    const { tier, tierLabel, fxSummary } = classifyThemeTier(key, t);
    const isDefaultFavorite = defaultFavSet.has(key);
    if (isDefaultFavorite) favoritesCount++;
    if (t.is_dark) darkCount++;
    else lightCount++;
    if (tier === "os") osCount++;
    if (tier === "fx") fxCount++;

    return {
      key,
      name: t.name,
      shortName: t.short_name || autoShortThemeName(key) || t.name,
      description: t.description || "",
      isDark: Boolean(t.is_dark),
      isDefaultFavorite,
      tier,
      tierLabel,
      bg: t.background_color,
      cardBg: t.card_background || (t.is_dark ? "#1e293b" : "#ffffff"),
      cardBorder:
        t.card_border ||
        (t.is_dark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.12)"),
      fg: t.font_color || t.foreground_color || (t.is_dark ? "#f1f5f9" : "#0f172a"),
      accent: t.accent_color,
      secondary: t.secondary_accent || t.accent_color,
      fxSummary,
    };
  });

  cachedThemeCount = currentKeys.length;
  cachedCatalog = {
    entries,
    total: entries.length,
    favoritesCount,
    darkCount,
    lightCount,
    osCount,
    fxCount,
  };
  return cachedCatalog;
}

function buildShowcaseGalleryHtml(
  activeKey: string,
  activeTheme: any,
  catalog: ShowcaseCatalogSummary,
): string {
  const activeTierInfo = classifyThemeTier(activeKey, activeTheme);
  const activeCardBg =
    activeTheme.card_background || (activeTheme.is_dark ? "#1e293b" : "#ffffff");
  const activeCardBorder =
    activeTheme.card_border ||
    (activeTheme.is_dark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.12)");
  const activeSec = activeTheme.secondary_accent || activeTheme.accent_color;

  const resolvedEntry =
    catalog.entries.find(
      (e) => e.key === activeKey || e.name === activeTheme.name,
    ) || catalog.entries[0];
  const canonicalActiveKey = resolvedEntry ? resolvedEntry.key : activeKey;
  const isActiveFav = Boolean(resolvedEntry?.isDefaultFavorite);

  const swatchItems = [
    { id: "bg", label: "Canvas", color: activeTheme.background_color },
    { id: "card", label: "Surface", color: activeCardBg },
    { id: "border", label: "Border", color: activeCardBorder },
    { id: "pri", label: "Primary", color: activeTheme.accent_color },
    { id: "sec", label: "Secondary", color: activeSec },
    {
      id: "fg",
      label: "Foreground",
      color:
        activeTheme.font_color ||
        activeTheme.foreground_color ||
        (activeTheme.is_dark ? "#f1f5f9" : "#0f172a"),
    },
  ];

  const swatchesHtml = swatchItems
    .map(
      (s) =>
        `<span class="sg-sw-chip" title="${escapeAttr(s.label)}: ${escapeAttr(s.color)}">` +
        `<span id="sg_dot_${s.id}" class="sg-sw-dot" data-no-theme="1" style="background:${escapeAttr(s.color)};"></span>` +
        `<span class="sg-sw-lbl">${escapeAttr(s.label)}</span>` +
        `<code id="sg_hex_${s.id}" class="sg-sw-hex">${escapeAttr(s.color)}</code>` +
        `</span>`,
    )
    .join("");

  const galleryPillsHtml = catalog.entries
    .map((entry) => {
      const isAct = entry.key === canonicalActiveKey;
      const isFav = entry.isDefaultFavorite;
      return (
        `<button type="button" class="sg-gal-pill${isAct ? " is-active" : ""}${isFav ? " is-fav" : ""}" data-no-theme="1" ` +
        `data-theme-key="${escapeAttr(entry.key)}" data-tier="${entry.tier}" data-polarity="${entry.isDark ? "dark" : "light"}" data-favorite="${isFav ? "1" : "0"}" ` +
        `${isFav ? "" : 'style="display:none" '}` +
        `title="${escapeAttr(entry.name)} (${escapeAttr(entry.tierLabel)}) — ${escapeAttr(entry.description)}">` +
        `<span class="sg-gal-dots" data-no-theme="1">` +
        `<i data-no-theme="1" style="background:${escapeAttr(entry.bg)};"></i>` +
        `<i data-no-theme="1" style="background:${escapeAttr(entry.accent)};"></i>` +
        `</span>` +
        `<span class="sg-gal-name">${escapeAttr(entry.shortName)}</span>` +
        `<span class="sg-gal-star" data-no-theme="1" data-fav-star="1" title="Toggle favorite for ${escapeAttr(entry.name)}">${isFav ? "★" : "☆"}</span>` +
        `</button>`
      );
    })
    .join("");

  const catalogClientIndex = JSON.stringify(
    catalog.entries.map((e) => ({
      k: e.key,
      n: e.name,
      t: e.tier,
      tl: e.tierLabel,
      fx: e.fxSummary,
    })),
  ).replace(/</g, "\\u003c");
  const defaultFavoritesJson = JSON.stringify(
    DEFAULT_FAVORITE_SIMPLEGUI_THEMES,
  ).replace(/</g, "\\u003c");

  return (
    `<style id="sg-showcase-strip-style">` +
    `.sg-showcase-strip{display:flex;flex-direction:column;gap:8px;width:100%;height:100%;padding:9px 12px;border-radius:10px;background:var(--card-bg,#1e293b);border:1px solid var(--sg-hairline-strong,var(--card-border,rgba(148,163,184,.24)));box-shadow:inset 0 1px 0 var(--sg-specular-card,rgba(255,255,255,.06)),var(--sg-shadow-sm,0 2px 8px rgba(0,0,0,.16));box-sizing:border-box;overflow:hidden}` +
    `.sg-strip-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:nowrap;min-width:0}` +
    `.sg-strip-meta{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;min-width:0;overflow:hidden}` +
    `.sg-tier-pill,.sg-fx-pill,.sg-count-pill,.sg-fav-toggle-btn{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em;line-height:1.3;white-space:nowrap;flex:0 0 auto}` +
    `.sg-tier-pill{background:color-mix(in srgb,var(--accent,#38bdf8) 16%,transparent);color:var(--accent,#38bdf8);border:1px solid color-mix(in srgb,var(--accent,#38bdf8) 38%,transparent)}` +
    `.sg-fx-pill{background:color-mix(in srgb,var(--secondary-accent,var(--accent,#38bdf8)) 13%,transparent);color:var(--theme-fg,#e2e8f0);border:1px solid var(--sg-hairline,var(--card-border,rgba(148,163,184,.25)));font-weight:600;max-width:210px;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto}` +
    `.sg-count-pill{background:color-mix(in srgb,var(--theme-fg,#94a3b8) 7%,transparent);color:var(--theme-muted,#94a3b8);border:1px solid var(--sg-hairline,var(--card-border,rgba(148,163,184,.2)));font-weight:600}` +
    `.sg-fav-toggle-btn{background:color-mix(in srgb,var(--theme-fg,#94a3b8) 8%,transparent);color:var(--theme-muted,#94a3b8);border:1px solid var(--sg-hairline,var(--card-border,rgba(148,163,184,.24)));cursor:pointer;transition:background-color .14s ease,color .14s ease,border-color .14s ease}` +
    `.sg-fav-toggle-btn:hover{color:var(--theme-fg,#e2e8f0);border-color:color-mix(in srgb,var(--warning,#f59e0b) 52%,var(--card-border,transparent))}` +
    `.sg-fav-toggle-btn.is-fav{background:color-mix(in srgb,var(--warning,#f59e0b) 18%,transparent);color:var(--warning,#f59e0b);border-color:color-mix(in srgb,var(--warning,#f59e0b) 48%,transparent)}` +
    `.sg-sw-row{display:flex;align-items:center;gap:5px;flex-wrap:nowrap;flex:0 0 auto}` +
    `.sg-sw-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:6px;background:var(--input-bg,rgba(15,23,42,.25));border:1px solid var(--sg-hairline,var(--card-border,rgba(148,163,184,.22)));font-size:11px}` +
    `.sg-sw-dot{width:10px;height:10px;border-radius:50%;border:1px solid rgba(128,128,128,.45);flex:0 0 auto}` +
    `.sg-sw-lbl{color:var(--theme-muted,#94a3b8);font-weight:600;font-size:10px}` +
    `.sg-sw-hex{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;color:var(--theme-fg,#e2e8f0);background:transparent;padding:0}` +
    `.sg-strip-rail-wrap{display:flex;align-items:center;gap:6px;min-width:0}` +
    `.sg-flt-grp{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:7px;background:var(--input-bg,rgba(15,23,42,.22));border:1px solid var(--sg-hairline,var(--card-border,rgba(148,163,184,.22)));flex:0 0 auto}` +
    `.sg-flt-btn,.sg-step-btn{border:1px solid transparent;background:transparent;color:var(--theme-muted,#94a3b8);font-size:11px;font-weight:700;padding:3px 7px;border-radius:5px;cursor:pointer;line-height:1.2;white-space:nowrap;transition:background-color .14s ease,color .14s ease,border-color .14s ease}` +
    `.sg-flt-btn:hover,.sg-step-btn:hover{color:var(--theme-fg,#e2e8f0);background:color-mix(in srgb,var(--theme-fg,#94a3b8) 10%,transparent)}` +
    `.sg-flt-btn.is-on{background:var(--accent,#38bdf8);color:var(--btn-fg,#fff)}` +
    `.sg-step-btn{background:var(--input-bg,rgba(15,23,42,.22));border-color:var(--sg-hairline,var(--card-border,rgba(148,163,184,.24)));color:var(--theme-fg,#e2e8f0);padding:4px 8px;flex:0 0 auto}` +
    `.sg-gal-rail{display:flex;align-items:center;gap:5px;overflow-x:auto;overflow-y:hidden;flex:1;min-width:0;padding:2px 1px;scrollbar-width:thin}` +
    `.sg-gal-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;border:1px solid var(--sg-hairline,var(--card-border,rgba(148,163,184,.24)));background:var(--input-bg,rgba(15,23,42,.2));color:var(--theme-fg,#e2e8f0);font-size:11px;font-weight:600;white-space:nowrap;cursor:pointer;flex:0 0 auto;transition:border-color .14s ease,background-color .14s ease,transform .1s ease}` +
    `.sg-gal-pill:hover{border-color:color-mix(in srgb,var(--accent,#38bdf8) 55%,var(--card-border,transparent));background:color-mix(in srgb,var(--accent,#38bdf8) 10%,var(--input-bg,transparent))}` +
    `.sg-gal-pill.is-active{border-color:var(--accent,#38bdf8);background:color-mix(in srgb,var(--accent,#38bdf8) 20%,var(--input-bg,transparent));color:var(--accent,#38bdf8);font-weight:700;box-shadow:0 0 0 1px color-mix(in srgb,var(--accent,#38bdf8) 32%,transparent)}` +
    `.sg-gal-star{font-size:11px;line-height:1;opacity:.55;margin-left:1px;padding:0 1px;transition:opacity .14s ease,color .14s ease,transform .1s ease}` +
    `.sg-gal-pill.is-fav .sg-gal-star{opacity:1;color:var(--warning,#f59e0b)}` +
    `.sg-gal-pill:hover .sg-gal-star{opacity:.95}` +
    `.sg-gal-star:hover{transform:scale(1.2);opacity:1!important}` +
    `.sg-gal-pill:focus-visible,.sg-flt-btn:focus-visible,.sg-step-btn:focus-visible,.sg-fav-toggle-btn:focus-visible{outline:2px solid var(--accent,#38bdf8);outline-offset:2px}` +
    `.sg-gal-dots{display:inline-flex;align-items:center}` +
    `.sg-gal-dots i{width:9px;height:9px;border-radius:50%;border:1px solid rgba(128,128,128,.45);display:inline-block}` +
    `.sg-gal-dots i+i{margin-left:-3px}` +
    `@media (prefers-reduced-motion:reduce){.sg-gal-pill,.sg-flt-btn,.sg-step-btn,.sg-fav-toggle-btn,.sg-gal-star{transition:none!important}}` +
    `</style>` +
    `<div class="sg-showcase-strip" id="sg_showcase_strip" data-active-theme="${escapeAttr(canonicalActiveKey)}" data-active-filter="favorites">` +
    `<div class="sg-strip-top">` +
    `<div class="sg-strip-meta">` +
    `<span id="sg_tier_badge" class="sg-tier-pill">✦ ${escapeAttr(activeTierInfo.tierLabel)}</span>` +
    `<span id="sg_fx_badge" class="sg-fx-pill">${escapeAttr(activeTierInfo.fxSummary)}</span>` +
    `<button type="button" id="sg_toggle_active_fav" class="sg-fav-toggle-btn${isActiveFav ? " is-fav" : ""}" data-no-theme="1" aria-pressed="${isActiveFav ? "true" : "false"}" title="Star or unstar active theme in Favorites">${isActiveFav ? "★ Favorited" : "☆ Favorite"}</button>` +
    `<span id="sg_catalog_counts" class="sg-count-pill">${catalog.total} Themes · ${catalog.favoritesCount} ★ · ${catalog.darkCount} Dark · ${catalog.lightCount} Light · ${catalog.osCount} OS · ${catalog.fxCount} FX</span>` +
    `</div>` +
    `<div class="sg-sw-row">${swatchesHtml}</div>` +
    `</div>` +
    `<div class="sg-strip-rail-wrap">` +
    `<div class="sg-flt-grp" role="tablist" aria-label="Filter themes by tier">` +
    `<button type="button" class="sg-flt-btn is-fav-flt is-on" id="sg_flt_favorites" data-no-theme="1" data-filter="favorites">★ Favorites (${catalog.favoritesCount})</button>` +
    `<button type="button" class="sg-flt-btn" data-no-theme="1" data-filter="all">All (${catalog.total})</button>` +
    `<button type="button" class="sg-flt-btn" data-no-theme="1" data-filter="dark">Dark (${catalog.darkCount})</button>` +
    `<button type="button" class="sg-flt-btn" data-no-theme="1" data-filter="light">Light (${catalog.lightCount})</button>` +
    `<button type="button" class="sg-flt-btn" data-no-theme="1" data-filter="os">OS (${catalog.osCount})</button>` +
    `<button type="button" class="sg-flt-btn" data-no-theme="1" data-filter="fx">FX (${catalog.fxCount})</button>` +
    `</div>` +
    `<button type="button" class="sg-step-btn" id="sg_prev_theme" data-no-theme="1" title="Previous theme">◀</button>` +
    `<div class="sg-gal-rail" id="sg_gal_rail">${galleryPillsHtml}</div>` +
    `<button type="button" class="sg-step-btn" id="sg_next_theme" data-no-theme="1" title="Next theme">▶</button>` +
    `</div>` +
    `</div>` +
    `<script>(function(){` +
    `var CAT=${catalogClientIndex};` +
    `var DEF_FAVS=${defaultFavoritesJson};` +
    `var STORE_KEY="simplegui.showcase.favorites.v1";` +
    `var strip=document.getElementById("sg_showcase_strip");` +
    `var rail=document.getElementById("sg_gal_rail");` +
    `if(!strip||!rail)return;` +
    `var knownKeys={};for(var ci=0;ci<CAT.length;ci++)knownKeys[CAT[ci].k]=true;` +
    `var favMap={};` +
    `function loadFavs(){` +
    `var list=null;` +
    `try{var raw=window.localStorage&&window.localStorage.getItem(STORE_KEY);if(raw){var parsed=JSON.parse(raw);if(Array.isArray(parsed)){var valid=parsed.filter(function(k){return typeof k==="string"&&knownKeys[k];});if(valid.length>0)list=valid;}}}catch(_e){}` +
    `if(!list)list=DEF_FAVS.slice();` +
    `favMap={};for(var fi=0;fi<list.length;fi++)favMap[list[fi]]=true;` +
    `}` +
    `function saveFavs(){` +
    `try{if(window.localStorage){var keys=Object.keys(favMap).filter(function(k){return !!favMap[k];});window.localStorage.setItem(STORE_KEY,JSON.stringify(keys));}}catch(_e){}` +
    `}` +
    `function countFavs(){var n=0;for(var k in favMap){if(Object.prototype.hasOwnProperty.call(favMap,k)&&favMap[k])n++;}return n;}` +
    `var activeFilter=strip.getAttribute("data-active-filter")||"favorites";` +
    `function applyFilter(f){` +
    `activeFilter=f||"all";` +
    `strip.setAttribute("data-active-filter",activeFilter);` +
    `Array.prototype.forEach.call(strip.querySelectorAll(".sg-flt-btn"),function(x){x.classList.toggle("is-on",(x.getAttribute("data-filter")||"all")===activeFilter);});` +
    `Array.prototype.forEach.call(rail.querySelectorAll(".sg-gal-pill"),function(p){` +
    `var k=p.getAttribute("data-theme-key")||"";` +
    `var show=activeFilter==="all"||(activeFilter==="favorites"&&!!favMap[k])||(activeFilter==="dark"&&p.getAttribute("data-polarity")==="dark")||(activeFilter==="light"&&p.getAttribute("data-polarity")==="light")||(p.getAttribute("data-tier")===activeFilter);` +
    `p.style.display=show?"":"none";` +
    `});` +
    `}` +
    `function syncFavoritesDom(){` +
    `var favCount=countFavs();` +
    `var fltFav=document.getElementById("sg_flt_favorites");` +
    `if(fltFav)fltFav.textContent="\u2605 Favorites ("+favCount+")";` +
    `var cur=strip.getAttribute("data-active-theme")||"";` +
    `var actFavBtn=document.getElementById("sg_toggle_active_fav");` +
    `if(actFavBtn){var isCurFav=!!favMap[cur];actFavBtn.classList.toggle("is-fav",isCurFav);actFavBtn.setAttribute("aria-pressed",isCurFav?"true":"false");actFavBtn.textContent=isCurFav?"\u2605 Favorited":"\u2606 Favorite";}` +
    `Array.prototype.forEach.call(rail.querySelectorAll(".sg-gal-pill"),function(p){` +
    `var k=p.getAttribute("data-theme-key")||"";` +
    `var isF=!!favMap[k];` +
    `p.classList.toggle("is-fav",isF);` +
    `p.setAttribute("data-favorite",isF?"1":"0");` +
    `var st=p.querySelector("[data-fav-star]");` +
    `if(st)st.textContent=isF?"\u2605":"\u2606";` +
    `});` +
    `applyFilter(activeFilter);` +
    `}` +
    `function toggleFavorite(key){` +
    `if(!key||!knownKeys[key])return;` +
    `if(favMap[key])delete favMap[key];else favMap[key]=true;` +
    `saveFavs();` +
    `syncFavoritesDom();` +
    `}` +
    `loadFavs();` +
    `syncFavoritesDom();` +
    `function pickTheme(key){` +
    `var sel=document.getElementById("dd_theme_selector");` +
    `if(sel){sel.value=key;sel.dispatchEvent(new Event("change",{bubbles:true}));}` +
    `else if(typeof window.handleEvent==="function"){window.handleEvent("dd_theme_selector","change",key);}` +
    `}` +
    `function visiblePills(){` +
    `return Array.prototype.slice.call(rail.querySelectorAll(".sg-gal-pill")).filter(function(b){return b.style.display!=="none";});` +
    `}` +
    `rail.addEventListener("click",function(e){` +
    `var star=e.target&&e.target.closest?e.target.closest("[data-fav-star]"):null;` +
    `var btn=e.target&&e.target.closest?e.target.closest(".sg-gal-pill"):null;` +
    `if(!btn)return;` +
    `var k=btn.getAttribute("data-theme-key");` +
    `if(star){e.stopPropagation();e.preventDefault();if(k)toggleFavorite(k);return;}` +
    `if(k)pickTheme(k);` +
    `});` +
    `var actFavToggle=document.getElementById("sg_toggle_active_fav");` +
    `if(actFavToggle){actFavToggle.addEventListener("click",function(){toggleFavorite(strip.getAttribute("data-active-theme")||"");});}` +
    `Array.prototype.forEach.call(strip.querySelectorAll(".sg-flt-btn"),function(fb){` +
    `fb.addEventListener("click",function(){` +
    `applyFilter(fb.getAttribute("data-filter")||"all");` +
    `});` +
    `});` +
    `function stepTheme(dir){` +
    `var vis=visiblePills();if(!vis.length)return;` +
    `var cur=strip.getAttribute("data-active-theme")||"";` +
    `var idx=vis.findIndex(function(b){return b.getAttribute("data-theme-key")===cur;});` +
    `var next=idx<0?vis[dir>0?0:vis.length-1]:vis[(idx+dir+vis.length)%vis.length];` +
    `if(next)pickTheme(next.getAttribute("data-theme-key"));` +
    `}` +
    `var prevBtn=document.getElementById("sg_prev_theme"),nextBtn=document.getElementById("sg_next_theme");` +
    `if(prevBtn)prevBtn.addEventListener("click",function(){stepTheme(-1);});` +
    `if(nextBtn)nextBtn.addEventListener("click",function(){stepTheme(1);});` +
    `function setSwatch(id,val){` +
    `var d=document.getElementById("sg_dot_"+id),h=document.getElementById("sg_hex_"+id);` +
    `if(d&&val)d.style.background=val;if(h&&val)h.textContent=val;` +
    `}` +
    `window.__sgSyncShowcaseThemeMeta=function(m){` +
    `if(!m)return;` +
    `var entry=null;for(var i=0;i<CAT.length;i++){if(CAT[i].k===m.key||CAT[i].n===m.name){entry=CAT[i];break;}}` +
    `var canon=entry?entry.k:(m.key||"");` +
    `strip.setAttribute("data-active-theme",canon);` +
    `setSwatch("bg",m.bg);setSwatch("card",m.cardBg);setSwatch("border",m.cardBorder);` +
    `setSwatch("pri",m.accent);setSwatch("sec",m.secondary||m.accent);setSwatch("fg",m.fg);` +
    `var tb=document.getElementById("sg_tier_badge"),fb=document.getElementById("sg_fx_badge");` +
    `if(tb)tb.textContent="\u2726 "+(entry?entry.tl:(m.fx?"FX Shader":(m.isDark?"Studio Dark":"Studio Light")));` +
    `if(fb)fb.textContent=entry?entry.fx:(m.fx?"GPU Shader Pipeline":"Native Crisp CSS \u00B7 Zero Shader Overhead");` +
    `var actFavBtn=document.getElementById("sg_toggle_active_fav");` +
    `if(actFavBtn){var isCurFav=!!favMap[canon];actFavBtn.classList.toggle("is-fav",isCurFav);actFavBtn.setAttribute("aria-pressed",isCurFav?"true":"false");actFavBtn.textContent=isCurFav?"\u2605 Favorited":"\u2606 Favorite";}` +
    `Array.prototype.forEach.call(rail.querySelectorAll(".sg-gal-pill"),function(p){` +
    `var on=p.getAttribute("data-theme-key")===canon;` +
    `p.classList.toggle("is-active",on);` +
    `if(on&&p.style.display!=="none"&&p.scrollIntoView)p.scrollIntoView({block:"nearest",inline:"nearest"});` +
    `});` +
    `};` +
    `})();<\/script>`
  );
}

export function createThemeShowcase(
  themeName: string = DEFAULT_FAVORITE_SIMPLEGUI_THEMES[0] || "oled_obsidian_pro",
): SimpleWindow {
  const themeObj = getTheme(themeName);
  const catalog = getShowcaseThemeCatalog();

  const win = simplegui.createWindow(
    `⚡ Bun RAD Studio - All Controls Form Showcase [Theme: ${themeObj.name}]`,
    1200,
    2140,
    {
      theme: themeName,
    },
  );

  // ==========================================
  // 1. TOP HEADER & THEME SWITCHER BAR
  // ==========================================
  win.beginRow();
  win
    .addLabel("lbl_theme_title", `🎨 ${themeObj.name}`)
    .font(20, themeObj.accent_color, "800")
    .width(300);

  win
    .addBadge(
      themeObj.is_dark ? "🌙 DARK" : "☀️ LIGHT",
      themeObj.is_dark ? "info" : "warning",
    )
    .id("bdg_theme_mode")
    .width(100);

  win
    .addBadge(`PRI ${themeObj.accent_color}`, "success")
    .id("bdg_theme_pri")
    .width(125);

  win
    .addBadge(
      `SEC ${themeObj.secondary_accent || themeObj.accent_color}`,
      "info",
    )
    .id("bdg_theme_sec")
    .width(130);

  // Live interactive theme selector surfacing all canonical SIMPLEGUI_THEMES
  win.addThemeSelector("dd_theme_selector", "Theme:", false, 210);
  win.endRow();

  win
    .addLabel(
      "lbl_theme_desc",
      `${themeObj.description} • Unified single-form showcase across ${catalog.total} built-in themes & 35+ RAD controls`,
    )
    .font(12, themeObj.is_dark ? "#94a3b8" : "#334155");

  // ==========================================
  // 1a. LIVE SWATCHES, TIER TELEMETRY & QUICK THEME GALLERY
  // ==========================================
  win
    .rawHtml(buildShowcaseGalleryHtml(win.theme, themeObj, catalog))
    .id("themeSwatchStrip")
    .width(1140)
    .height(94);

  // ==========================================
  // 1b. DESKTOP TOOLBAR & COMMAND PALETTE STRIP
  // ==========================================
  win.beginRow();
  win
    .addToolBar(
      "main_toolbar",
      [
        { id: "tb_new", label: "New", icon: "📄" },
        { id: "tb_open", label: "Open", icon: "📂" },
        { id: "tb_save", label: "Save", icon: "💾" },
        "---",
        { id: "tb_bold", label: "Bold", icon: "𝗕", toggle: true, active: true },
        {
          id: "tb_italic",
          label: "Italic",
          icon: "𝘐",
          toggle: true,
          active: false,
        },
        "---",
        { id: "tb_run", label: "Run", icon: "▶" },
        { id: "tb_build", label: "Build", icon: "📦" },
      ],
      (w, item) => {
        w.toast(`Toolbar - Action: ${item}`);
      },
    )
    .width(730);

  win
    .addCommandPalette(
      "showcase_cmd",
      [
        {
          id: "cmd_save",
          label: "File: Save All Changes",
          category: "File",
          shortcut: "⌘S",
          icon: "💾",
        },
        {
          id: "cmd_theme",
          label: "Preferences: Switch Theme",
          category: "Preferences",
          shortcut: "⌘T",
          icon: "🎨",
        },
        {
          id: "cmd_build",
          label: "Build: Compile Desktop Bundle",
          category: "Build",
          shortcut: "⌘B",
          icon: "📦",
        },
        {
          id: "cmd_test",
          label: "Test: Run Full Verification Suite",
          category: "Test",
          shortcut: "⌘⇧T",
          icon: "🧪",
        },
        {
          id: "cmd_term",
          label: "Terminal: Open Integrated Console",
          category: "View",
          shortcut: "⌃`",
          icon: "💻",
        },
      ],
      (w, cmdId) => {
        w.showAlert(`Executed command: ${cmdId}`, "Command Palette");
      },
      {
        placeholder: "Search commands, files, actions (⌘K)...",
        shortcut: "⌘K",
      },
    )
    .width(390);
  win.endRow();

  win.addDivider();

  // ==========================================
  // 2. MAIN 2-COLUMN GRID (INPUTS & SELECTORS)
  // ==========================================
  win.beginGrid(2, 16);

  // --- COLUMN 1: TEXT & INPUT CONTROLS ---
  win.beginCard(
    "Text & Data Input Controls",
    "Crisp single & multi-line inputs, token chips, masking & inline editing",
  );

  win.beginRow();
  win.addLabel("Text Input:").width(120);
  win
    .addTextInput("Type user handle or email...")
    .id("txtInput")
    .value("alex.mercer@studio-demo.example")
    .width(390);
  win.endRow();

  win.beginRow();
  win.addLabel("Password:").width(120);
  win
    .addPasswordInput("••••••••••••")
    .id("txtPass")
    .value("DemoVault#2026!")
    .width(390);
  win.endRow();

  win.beginRow();
  win.addLabel("Search Field:").width(120);
  win
    .addSearchInput("Filter symbols, modules, records...")
    .id("txtSearch")
    .width(390);
  win.endRow();

  win.beginRow();
  win.addLabel("Masked Phone:").width(120);
  win.addMaskedInput("inpPhone", "(999) 999-9999", "(555) 019-2834").width(390);
  win.endRow();

  win.beginRow();
  win.addLabel("Tag / Tokens:").width(120);
  win
    .addTagInput("inpTags", ["TypeScript", "Bun", "Desktop-RAD", "SimpleGUI"])
    .width(390);
  win.endRow();

  win.beginRow();
  win.addLabel("Editable Label:").width(120);
  win
    .addInlineEditableLabel(
      "lblProject",
      "⚡ Project Horizon: Synthetic Demo Cluster v2.4",
    )
    .width(390);
  win.endRow();

  win.beginRow();
  win.addLabel("Multi-line Text:").width(120);
  win
    .addTextArea(
      "txtNotes",
      "// Synthetic studio configuration directives\ncluster.mode = 'distributed'\ntelemetry.enabled = true\nworkers.count = 8\nstorage.engine = 'sqlite-wal'",
    )
    .width(390)
    .height(65);
  win.endRow();

  win.endCard();

  // --- COLUMN 2: SELECTORS, TOGGLES & METERS ---
  win.beginCard(
    "Selectors, Toggles & Gauges",
    "State switches, segmented tabs, dropdowns, steppers & listboxes",
  );

  win.beginRow();
  win.addCheckbox("Hardware Acceleration (GPU)", true).id("chkGpu").width(240);
  win.addCheckbox("Verbose IPC Diagnostics", false).id("chkLog").width(230);
  win.endRow();

  win.beginRow();
  win.addSwitch("Live Telemetry Daemon", true).id("swtDaemon").width(240);
  win.addSwitch("Auto-Save Preferences", true).id("swtAutoSave").width(230);
  win.endRow();

  win.beginRow();
  win.addLabel("Segmented:").width(100);
  win
    .addSegmentedControl(["Metrics", "Diagnostics", "Security", "Logs"], 0)
    .id("segMode")
    .width(370);
  win.endRow();

  win.beginRow();
  win.addLabel("Dropdown:").width(100);
  win
    .addDropdown(
      [
        "Production Gateway (Region-Alpha)",
        "Failover Node (Region-Beta)",
        "Development Sandbox",
        "Edge Cluster (Region-Gamma)",
      ],
      "Production Gateway (Region-Alpha)",
    )
    .id("ddServer")
    .width(370);
  win.endRow();

  win.beginRow();
  win.addLabel("Multi-List Box:").width(100);
  win
    .addMultiListBox(
      [
        "Worker Pool: 16 Synthetic Cores",
        "Memory Allocator: Arena Pool",
        "Network Engine: Async Event Loop",
        "Compiler: Native TypeScript AST",
      ],
      ["Worker Pool: 16 Synthetic Cores", "Memory Allocator: Arena Pool"],
    )
    .id("lstWorkers")
    .width(370)
    .height(62);
  win.endRow();

  win.beginRow();
  win.addLabel("Threads Stepper:").width(120);
  win.addStepper(1, 64, 16).id("stpThreads").width(120);
  win
    .addLabel("Max Limit: 64")
    .font(11, themeObj.is_dark ? "#94a3b8" : "#334155");
  win.endRow();

  win.endCard();

  win.endGrid();

  // ==========================================
  // 3. SECOND ROW (PICKERS, SLIDERS & METRICS)
  // ==========================================
  win.beginGrid(3, 16);

  // Pickers Card
  win.beginCard("Pickers & Swatches", "Color well, calendar dates & 24h clock");
  win.beginRow();
  win.addLabel("Color Well:").width(90);
  win.addColorWell(themeObj.accent_color).id("cpAccent").width(180);
  win.endRow();

  win.beginRow();
  win.addLabel("Date Picker:").width(90);
  win.addDatePicker("2026-09-10").id("dpSchedule").width(180);
  win.endRow();

  win.beginRow();
  win.addLabel("Time Picker:").width(90);
  win.addTimePicker("14:30").id("tpSchedule").width(180);
  win.endRow();
  win.endCard();

  // Sliders & Meters Card
  win.beginCard("Sliders & Meters", "Smooth range tracking & progress gauges");
  win.beginRow();
  win.addLabel("Volume Slider:").width(110);
  win.addSlider(0, 100, 78).id("sldVol").width(180);
  win.endRow();

  win.beginRow();
  win.addLabel("System Load:").width(110);
  win.addProgressBar(82, 100).id("prgLoad").width(180);
  win.endRow();

  win.beginRow();
  win.addLabel("Buffer Cache:").width(110);
  win.addProgressBar(45, 100).id("prgBuffer").width(180);
  win.endRow();
  win.endCard();

  // Badges & Keyboard Shortcuts Card
  win.beginCard("Status & Hotkey Badges", "Semantic pills & keycap chords");
  win.beginRow();
  win.addBadge("CONNECTED", "success").width(110);
  win.addBadge("TLS 1.3", "info").width(90);
  win.addBadge("HIGH LOAD", "warning").width(100);
  win.endRow();

  win.beginRow();
  win.addLabel("Command Bar:").width(110);
  win.addHotkeyBadge(["⌘", "K"]).width(100);
  win.endRow();

  win.beginRow();
  win.addLabel("Action Palette:").width(110);
  win.addHotkeyBadge(["Ctrl", "Shift", "P"]).width(120);
  win.endRow();
  win.endCard();

  win.endGrid();

  // ==========================================
  // 4. DATA TABLES, DUAL TRANSFER & WORKSPACE
  // ==========================================
  win.beginGrid(2, 16);

  win.beginCard(
    "Multi-Select Data Table",
    "Sticky headers, subtle zebra & hover rows, Ctrl/Shift selection",
  );
  win
    .addTable(
      ["ID", "Service Node", "Protocol", "Port", "Latency", "Health"],
      [
        [101, "API Gateway Core", "HTTP/2", "8080", "0.4 ms", "Healthy"],
        [102, "Auth & Session Vault", "gRPC", "8443", "1.1 ms", "Healthy"],
        [103, "Distributed Cache", "RESP3", "6379", "0.2 ms", "Optimal"],
        [104, "Analytics Replica", "TCP", "5432", "2.8 ms", "Syncing"],
      ],
      { multiSelect: true, checkboxSelection: true },
    )
    .id("tblServices")
    .height(135);
  win.endCard();

  win.beginCard(
    "Dual Transfer List",
    "Double-click item transfer, 4-button bar & live item counts",
  );
  win.addTransferList(
    "transServices",
    ["Stream Broker", "Search Indexer", "Metrics Collector", "Object Storage"],
    ["API Gateway", "Distributed Cache"],
    { height: 135 },
  );
  win.endCard();

  win.beginCard(
    "Hierarchical TreeGrid",
    "Multi-column tree table, expand/collapse toggles & selection",
  );
  win
    .addTreeGrid(
      ["Name", "Type", "Size", "Modified", "Status"],
      [
        {
          id: "proj_root",
          cells: ["studio-demo-app", "Workspace Root", "--", "Today", "Active"],
          icon: "📦",
          expanded: true,
          children: [
            {
              id: "dir_src",
              cells: ["src", "Directory", "--", "Today", "Active"],
              icon: "📂",
              expanded: true,
              children: [
                {
                  id: "file_simplegui",
                  cells: [
                    "simplegui.ts",
                    "TypeScript",
                    "148 KB",
                    "Today",
                    "Modified",
                  ],
                  icon: "📄",
                },
                {
                  id: "file_components",
                  cells: [
                    "simplegui_components.ts",
                    "TypeScript",
                    "42 KB",
                    "Today",
                    "Modified",
                  ],
                  icon: "📄",
                },
              ],
            },
            {
              id: "dir_demos",
              cells: ["demos", "Directory", "--", "Today", "Active"],
              icon: "📂",
              expanded: true,
              children: [
                {
                  id: "demo_showcase",
                  cells: [
                    "23_all_themes_all_controls_showcase.ts",
                    "TypeScript",
                    "18 KB",
                    "Today",
                    "Active",
                  ],
                  icon: "📄",
                },
              ],
            },
            {
              id: "pkg_json",
              cells: [
                "package.json",
                "JSON Config",
                "1.8 KB",
                "Yesterday",
                "Locked",
              ],
              icon: "📄",
            },
            {
              id: "readme_md",
              cells: [
                "README.md",
                "Documentation",
                "16 KB",
                "Today",
                "Published",
              ],
              icon: "📄",
            },
          ],
        },
      ],
      { multiSelect: true },
    )
    .id("treegridWorkspace")
    .height(135);
  win.endCard();

  win.beginCard(
    "Project Workspace Tree",
    "Hierarchical file explorer tree navigation",
  );
  win
    .addTreeView([
      "📦 studio-demo-app",
      " 📂 src",
      "   📄 simplegui.ts",
      "   📄 simplegui_components.ts",
      "   📄 simplegui_dialogs.ts",
      " 📂 demos",
      "   📄 23_all_themes_all_controls_showcase.ts",
      " 📂 assets",
      "   📂 themes",
    ])
    .id("treeWorkspace")
    .height(135);
  win.endCard();

  win.endGrid();

  // ==========================================
  // 5. DEVELOPER PRO CONTROLS (DIFF, SPLITTER, TABS, KANBAN)
  // ==========================================
  win.beginGrid(2, 16);

  win.beginCard(
    "Side-by-Side Diff Viewer",
    "Before/after code changes with syntax-highlighted additions and deletions",
  );
  win
    .addDiffView(
      "diffShowcase",
      "function buildApp(options) {\n    const bundle = compile(options);\n    return bundle;\n}",
      "function buildApp(options: AppConfig): BundleResult {\n    const bundle = compileFast(options);\n    logBundleStats(bundle);\n    return bundle;\n}",
      {
        language: "typescript",
        originalTitle: "v1.0.0 (Released)",
        modifiedTitle: "v2.0.0 (Current)",
      },
    )
    .height(135);
  win.endCard();

  win.beginCard(
    "Interactive Resizable Splitter",
    "Draggable split divider with mouse-drag resizing between panes",
  );
  win.addSplitPane("splitShowcase", {
    left_title: "Component Tree",
    left_content:
      "• AppContainer\n• NavigationToolbar\n• DataGrid\n• StatusBar",
    right_title: "Active Inspector",
    right_content:
      "Control: DataGrid\nRows: 1,420\nSorting: Enabled ▲\nResizing: Enabled ↔",
    initialSplit: 0.35,
    height: 135,
  });
  win.endCard();

  win.beginCard(
    "Closable Workspace Tabs",
    "Document tab management with close buttons and auto-switching",
  );
  win
    .addTabs(["main.ts", "simplegui.ts", "theme_engine.ts", "README.md"], 0, {
      closable: true,
      onTabClose: (w: any, tab: string) => {
        w.toast(`Tab Closed - Closed ${tab}`);
      },
    })
    .id("tabsWorkspace")
    .height(38);
  win.endCard();

  win.beginCard(
    "Kanban Sprint Board",
    "Native HTML5 drag-and-drop cards across workflow columns",
  );
  win.addKanbanBoard(
    "kanbanShowcase",
    [
      {
        id: "todo",
        title: "To Do (2)",
        cards: [
          { id: "c1", title: "Theme Token Polish", tag: "Design" },
          { id: "c2", title: "Side-by-Side Diff", tag: "Feature" },
        ],
      },
      {
        id: "progress",
        title: "In Progress (2)",
        cards: [
          { id: "c3", title: "Command Palette (⌘K)", tag: "UI" },
          { id: "c4", title: "Focus-Visible Audit", tag: "A11y" },
        ],
      },
      {
        id: "done",
        title: "Done (3)",
        cards: [
          {
            id: "c5",
            title: `${catalog.total} Built-in Themes`,
            tag: "Themes",
          },
          { id: "c6", title: "TreeGrid & Transfer", tag: "Components" },
          { id: "c7", title: "Reduced Motion", tag: "QA" },
        ],
      },
    ],
    (w: SimpleWindow, cardId: any, colId: any) => {
      w.toast(`Card Moved - ${cardId} → ${colId}`);
    },
    { height: 140 },
  );
  win.endCard();

  win.endGrid();

  // ==========================================
  // 6. ACTION FOOTER BUTTONS
  // ==========================================
  win.beginRow();

  win
    .addButton("⚡ Primary Theme Action", (w) => {
      w.showAlert(
        `Executed action with active theme: ${w.theme}!`,
        "Theme Action",
      );
    })
    .id("btnPrimaryAction")
    .width(205)
    .height(38);

  win
    .addButton("💬 Prompt Modal Dialog", (w) => {
      w.showPrompt(
        "Enter updated workspace namespace:",
        "DemoStudioNamespace",
        (ans) => {
          if (ans)
            w.showAlert(`Namespace set to: ${ans}`, "Configuration Updated");
        },
      );
    })
    .id("btnPromptDialog")
    .bg("#334155")
    .color("#f8fafc")
    .width(195)
    .height(38);

  win
    .addButton("📋 Copy Form Values JSON", (w) => {
      const json = JSON.stringify(w.getFormValues(), null, 2);
      w.copyToClipboard(json);
      w.showAlert(
        "Form values serialized and copied to clipboard!",
        "Clipboard Export",
      );
    })
    .id("btnCopyJson")
    .bg("#1e293b")
    .color("#38bdf8")
    .width(210)
    .height(38);

  win
    .addButton("✨ Switch Random Theme", (w) => {
      const allEntries = getShowcaseThemeCatalog().entries;
      const pool = allEntries.filter((e) => e.key !== w.theme);
      const pick =
        (pool.length > 0
          ? pool[Math.floor(Math.random() * pool.length)]
          : allEntries[0]) || { key: "midnight" };
      w.setTheme(pick.key, true);
      w.setValue("dd_theme_selector", pick.key);
    })
    .id("btnRandomTheme")
    .bg("#475569")
    .color("#ffffff")
    .width(195)
    .height(38);

  win
    .addButton("❌ Close Window", (w) => {
      w.exit();
    })
    .id("btnCloseWindow")
    .bg("#ef4444")
    .color("#ffffff")
    .bold()
    .width(145)
    .height(38);

  win.endRow();

  return win;
}

// Interactive Standalone Execution
if (import.meta.main) {
  console.log(
    "⚡ Launching Bun RAD Studio Demo 23: Complete All Controls & Theme Studio...",
  );
  const defaultTheme =
    process.argv[2] ||
    DEFAULT_FAVORITE_SIMPLEGUI_THEMES[0] ||
    "oled_obsidian_pro";
  const app = createThemeShowcase(defaultTheme);
  app.run();
}
