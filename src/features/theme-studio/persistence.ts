/**
 * Step 3: Persistence & Shareability Engine
 * - Save, list, load, and delete custom themes in localStorage (with safe in-memory fallback for headless/SSR tests)
 * - Export themes as clean, deterministic JSON files
 * - Import and validate theme JSON payloads with schema normalization
 */

import { DEFAULT_SURFACE_CONFIG, normalizeHex } from "./mathEngine";
import type {
  BaseMode,
  InterfaceDensity,
  SavedThemeDocument,
  SurfaceVibe,
  ThemeSurfaceConfig,
} from "./types";

export const STORAGE_KEY_SAVED_THEMES = "bun_rad_theme_studio_saved_v1";
export const STORAGE_KEY_ACTIVE_STATE = "bun_rad_theme_studio_active_v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryFallbackStore = new Map<string, string>();

const fallbackStorage: StorageLike = {
  getItem: (k) => memoryFallbackStore.get(k) ?? null,
  setItem: (k, v) => {
    memoryFallbackStore.set(k, String(v));
  },
  removeItem: (k) => {
    memoryFallbackStore.delete(k);
  },
};

export function resolveStorage(customStorage?: StorageLike): StorageLike {
  if (customStorage) return customStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage;
    }
  } catch {
    // Fall through to in-memory storage if localStorage is blocked
  }
  return fallbackStorage;
}

const VALID_BASE_MODES: readonly BaseMode[] = ["light", "dark", "midnight", "high-contrast"];
const VALID_SURFACE_VIBES: readonly SurfaceVibe[] = ["flat", "frosted-glass", "matte", "neon-border"];
const VALID_DENSITIES: readonly InterfaceDensity[] = ["compact", "comfortable", "spacious"];

/**
 * Validates and normalizes an untrusted surface config object.
 */
export function sanitizeSurfaceConfig(raw: unknown): ThemeSurfaceConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const baseMode = VALID_BASE_MODES.includes(obj.baseMode as BaseMode)
    ? (obj.baseMode as BaseMode)
    : DEFAULT_SURFACE_CONFIG.baseMode;

  const surfaceVibe = VALID_SURFACE_VIBES.includes(obj.surfaceVibe as SurfaceVibe)
    ? (obj.surfaceVibe as SurfaceVibe)
    : DEFAULT_SURFACE_CONFIG.surfaceVibe;

  const density = VALID_DENSITIES.includes(obj.density as InterfaceDensity)
    ? (obj.density as InterfaceDensity)
    : DEFAULT_SURFACE_CONFIG.density;

  const primaryColor = normalizeHex(
    typeof obj.primaryColor === "string" ? obj.primaryColor : undefined,
    DEFAULT_SURFACE_CONFIG.primaryColor
  );

  const accentColor = normalizeHex(
    typeof obj.accentColor === "string" ? obj.accentColor : undefined,
    DEFAULT_SURFACE_CONFIG.accentColor
  );

  const rawSharpness = Number(obj.cornerSharpness);
  const cornerSharpness = Number.isFinite(rawSharpness)
    ? Math.max(0, Math.min(24, Math.round(rawSharpness)))
    : DEFAULT_SURFACE_CONFIG.cornerSharpness;

  return {
    baseMode,
    primaryColor,
    accentColor,
    surfaceVibe,
    cornerSharpness,
    density,
  };
}

/**
 * Validates and sanitizes CSS variable overrides (`--*` keys only, safe CSS values).
 */
export function sanitizeOverrides(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const k = key.trim();
    const v = String(val ?? "").trim();
    if (k.startsWith("--") && k.length > 2 && v.length > 0 && !/[{};<>]/.test(v)) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Creates a clean `SavedThemeDocument` ready for storage or JSON export.
 */
export function createThemeDocument(params: {
  id?: string;
  name: string;
  description?: string;
  surface: ThemeSurfaceConfig;
  overrides?: Record<string, string>;
  createdAt?: string;
}): SavedThemeDocument {
  const now = new Date().toISOString();
  const cleanName = params.name.trim() || "Untitled Custom Theme";
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    schemaVersion: 1,
    format: "bun-rad-theme-studio",
    id: params.id?.trim() || `theme-${slug || "custom"}-${Date.now().toString(36)}`,
    name: cleanName,
    description: params.description?.trim() || undefined,
    createdAt: params.createdAt || now,
    updatedAt: now,
    surface: sanitizeSurfaceConfig(params.surface),
    overrides: sanitizeOverrides(params.overrides),
  };
}

/**
 * Serializes a theme into a clean, human-readable JSON string for file export.
 */
export function exportThemeToJson(params: {
  id?: string;
  name: string;
  description?: string;
  surface: ThemeSurfaceConfig;
  overrides?: Record<string, string>;
}): string {
  const doc = createThemeDocument(params);
  return JSON.stringify(doc, null, 2);
}

/**
 * Parses and validates an imported JSON string into a `SavedThemeDocument`.
 * Throws a descriptive error if the JSON is malformed or missing required structure.
 */
export function importThemeFromJson(jsonString: string): SavedThemeDocument {
  if (!jsonString || typeof jsonString !== "string" || !jsonString.trim()) {
    throw new Error("Theme JSON payload is empty.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err: any) {
    throw new Error(`Invalid JSON syntax: ${err?.message || "unable to parse"}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Theme JSON must be a root JSON object.");
  }

  const record = parsed as Record<string, unknown>;

  // Support both wrapped `{ surface: {...}, overrides: {...} }` and flat surface objects
  const surfaceSource =
    record.surface && typeof record.surface === "object" ? record.surface : record;

  const hasAnyRecognizedField =
    "baseMode" in (surfaceSource as object) ||
    "primaryColor" in (surfaceSource as object) ||
    "accentColor" in (surfaceSource as object) ||
    "surfaceVibe" in (surfaceSource as object) ||
    "cornerSharpness" in (surfaceSource as object) ||
    "density" in (surfaceSource as object) ||
    record.format === "bun-rad-theme-studio";

  if (!hasAnyRecognizedField) {
    throw new Error(
      "Unrecognized theme JSON structure: expected surface controls (baseMode, primaryColor, accentColor, surfaceVibe, cornerSharpness, density)."
    );
  }

  const surface = sanitizeSurfaceConfig(surfaceSource);
  const overrides = sanitizeOverrides(record.overrides);
  const name =
    typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : "Imported Theme";

  return createThemeDocument({
    id: typeof record.id === "string" ? record.id : undefined,
    name,
    description: typeof record.description === "string" ? record.description : undefined,
    surface,
    overrides,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
  });
}

/**
 * Loads all saved custom themes from `localStorage`.
 */
export function loadSavedThemes(storage?: StorageLike): SavedThemeDocument[] {
  const store = resolveStorage(storage);
  const raw = store.getItem(STORAGE_KEY_SAVED_THEMES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: SavedThemeDocument[] = [];
    for (const item of parsed) {
      try {
        valid.push(importThemeFromJson(JSON.stringify(item)));
      } catch {
        // Ignore corrupted entries
      }
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * Saves or updates a custom theme in `localStorage` and returns the updated list.
 */
export function saveCustomTheme(
  params: {
    id?: string;
    name: string;
    description?: string;
    surface: ThemeSurfaceConfig;
    overrides?: Record<string, string>;
  },
  storage?: StorageLike
): { saved: SavedThemeDocument; themes: SavedThemeDocument[] } {
  const store = resolveStorage(storage);
  const existing = loadSavedThemes(store);
  const doc = createThemeDocument(params);

  const index = existing.findIndex((t) => t.id === doc.id || t.name.toLowerCase() === doc.name.toLowerCase());
  if (index >= 0) {
    doc.id = existing[index]!.id;
    doc.createdAt = existing[index]!.createdAt;
    existing[index] = doc;
  } else {
    existing.unshift(doc);
  }

  store.setItem(STORAGE_KEY_SAVED_THEMES, JSON.stringify(existing));
  return { saved: doc, themes: existing };
}

/**
 * Deletes a saved custom theme by `id` from `localStorage`.
 */
export function deleteSavedTheme(id: string, storage?: StorageLike): SavedThemeDocument[] {
  const store = resolveStorage(storage);
  const existing = loadSavedThemes(store).filter((t) => t.id !== id);
  store.setItem(STORAGE_KEY_SAVED_THEMES, JSON.stringify(existing));
  return existing;
}

export interface ActiveStudioState {
  name: string;
  activePresetId: string | null;
  surface: ThemeSurfaceConfig;
  overrides: Record<string, string>;
}

/**
 * Persists the current live working state of the Theme Studio to `localStorage`.
 */
export function saveActiveStudioState(
  state: ActiveStudioState,
  storage?: StorageLike
): void {
  const store = resolveStorage(storage);
  const payload: ActiveStudioState = {
    name: state.name || "Untitled Theme",
    activePresetId: state.activePresetId ?? null,
    surface: sanitizeSurfaceConfig(state.surface),
    overrides: sanitizeOverrides(state.overrides),
  };
  store.setItem(STORAGE_KEY_ACTIVE_STATE, JSON.stringify(payload));
}

/**
 * Restores the last working state of the Theme Studio from `localStorage`.
 */
export function loadActiveStudioState(storage?: StorageLike): ActiveStudioState | null {
  const store = resolveStorage(storage);
  const raw = store.getItem(STORAGE_KEY_ACTIVE_STATE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "Custom Theme",
      activePresetId: typeof parsed.activePresetId === "string" ? parsed.activePresetId : null,
      surface: sanitizeSurfaceConfig(parsed.surface),
      overrides: sanitizeOverrides(parsed.overrides),
    };
  } catch {
    return null;
  }
}
