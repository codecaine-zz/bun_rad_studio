/**
 * Curated One-Click Theme Presets for Quick Studio (Tab 1)
 * Covers all Base Modes, Surface Vibes, Corner Sharpness levels, and Interface Densities.
 */

import type { ThemePreset } from "./types";

export const THEME_STUDIO_PRESETS: readonly ThemePreset[] = [
  {
    id: "obsidian-glass",
    name: "Obsidian Glass",
    tagline: "Translucent dark frosted panels with electric sapphire and violet accents",
    badge: "Dark • Glass",
    surface: {
      baseMode: "dark",
      primaryColor: "#3b82f6",
      accentColor: "#8b5cf6",
      surfaceVibe: "frosted-glass",
      cornerSharpness: 10,
      density: "comfortable",
    },
  },
  {
    id: "cyber-midnight",
    name: "Cyberpunk Neon",
    tagline: "OLED midnight cosmos with glowing cyan/magenta neon borders and compact HUD density",
    badge: "Midnight • Neon",
    surface: {
      baseMode: "midnight",
      primaryColor: "#06b6d4",
      accentColor: "#ec4899",
      surfaceVibe: "neon-border",
      cornerSharpness: 4,
      density: "compact",
    },
  },
  {
    id: "arctic-daylight",
    name: "Arctic Daylight",
    tagline: "Crisp daylight frosted glass with cobalt brand identity and airy spacing",
    badge: "Light • Glass",
    surface: {
      baseMode: "light",
      primaryColor: "#2563eb",
      accentColor: "#0d9488",
      surfaceVibe: "frosted-glass",
      cornerSharpness: 12,
      density: "comfortable",
    },
  },
  {
    id: "monolith-matte",
    name: "Monolith Matte",
    tagline: "Low-glare tactile dark slate with emerald primary and warm amber action tokens",
    badge: "Dark • Matte",
    surface: {
      baseMode: "dark",
      primaryColor: "#10b981",
      accentColor: "#f59e0b",
      surfaceVibe: "matte",
      cornerSharpness: 6,
      density: "comfortable",
    },
  },
  {
    id: "swiss-editorial",
    name: "Swiss Editorial",
    tagline: "Razor-sharp 0px brutalist geometry on warm alabaster paper with vermilion accents",
    badge: "Light • Flat • 0px",
    surface: {
      baseMode: "light",
      primaryColor: "#111827",
      accentColor: "#ef4444",
      surfaceVibe: "flat",
      cornerSharpness: 0,
      density: "spacious",
    },
  },
  {
    id: "aaa-sentinel",
    name: "AAA Sentinel",
    tagline: "WCAG AAA high-contrast pitch black with hyper-legible sky & gold indicators",
    badge: "High-Contrast • AAA",
    surface: {
      baseMode: "high-contrast",
      primaryColor: "#38bdf8",
      accentColor: "#facc15",
      surfaceVibe: "flat",
      cornerSharpness: 2,
      density: "compact",
    },
  },
  {
    id: "velvet-capsule",
    name: "Velvet Capsule",
    tagline: "24px pill-shaped controls with lush rose & indigo tones in spacious layout",
    badge: "Midnight • Pill 24px",
    surface: {
      baseMode: "midnight",
      primaryColor: "#f43f5e",
      accentColor: "#6366f1",
      surfaceVibe: "frosted-glass",
      cornerSharpness: 24,
      density: "spacious",
    },
  },
  {
    id: "nordic-studio",
    name: "Nordic Studio",
    tagline: "Calm polar matte daylight with fjord teal brand accents and balanced rhythm",
    badge: "Light • Matte",
    surface: {
      baseMode: "light",
      primaryColor: "#0284c7",
      accentColor: "#6366f1",
      surfaceVibe: "matte",
      cornerSharpness: 8,
      density: "comfortable",
    },
  },
  {
    id: "omega-singularity",
    name: "Omega Singularity",
    tagline: "Post-singularity cosmological midnight with 24K celestial gold and violet event-horizon glass",
    badge: "God-Mode • Midnight",
    surface: {
      baseMode: "midnight",
      primaryColor: "#eab308",
      accentColor: "#a855f7",
      surfaceVibe: "frosted-glass",
      cornerSharpness: 14,
      density: "comfortable",
    },
  },
  {
    id: "photonic-3099",
    name: "3099 Photonic Crystal",
    tagline: "Year 3099 negative-index photonic metamaterial glass with laser cyan and rose caustics",
    badge: "God-Mode • Glass",
    surface: {
      baseMode: "midnight",
      primaryColor: "#06b6d4",
      accentColor: "#ec4899",
      surfaceVibe: "frosted-glass",
      cornerSharpness: 16,
      density: "comfortable",
    },
  },
  {
    id: "matrioshka-dyson",
    name: "Matrioshka Dyson Brain",
    tagline: "Kardashev Type-II stellar megastructure OLED with incandescent solar amber and plasma teal borders",
    badge: "God-Mode • Neon",
    surface: {
      baseMode: "midnight",
      primaryColor: "#f59e0b",
      accentColor: "#14b8a6",
      surfaceVibe: "neon-border",
      cornerSharpness: 6,
      density: "compact",
    },
  },
  {
    id: "akashic-noosphere",
    name: "Akashic Noosphere",
    tagline: "Planetary neural consciousness architecture with bioluminescent emerald and indigo synaptic glass",
    badge: "God-Mode • Neural",
    surface: {
      baseMode: "dark",
      primaryColor: "#10b981",
      accentColor: "#6366f1",
      surfaceVibe: "frosted-glass",
      cornerSharpness: 20,
      density: "spacious",
    },
  },
  {
    id: "hyperborean-sanctum",
    name: "Hyperborean Sanctum",
    tagline: "High-altitude crystalline daylight sanctum with celestial gold and cobalt sapphire glass",
    badge: "God-Mode • Light",
    surface: {
      baseMode: "light",
      primaryColor: "#0284c7",
      accentColor: "#d97706",
      surfaceVibe: "frosted-glass",
      cornerSharpness: 14,
      density: "spacious",
    },
  },
  {
    id: "solarpunk-3000",
    name: "Year 3000 Solarpunk",
    tagline: "Utopian sky-archology daylight bio-glass with living chlorophyll emerald and sunlit amber tokens",
    badge: "God-Mode • Bio-Light",
    surface: {
      baseMode: "light",
      primaryColor: "#059669",
      accentColor: "#d97706",
      surfaceVibe: "frosted-glass",
      cornerSharpness: 16,
      density: "comfortable",
    },
  },
] as const;

export function getThemePresetById(id: string): ThemePreset | undefined {
  return THEME_STUDIO_PRESETS.find((p) => p.id === id);
}
