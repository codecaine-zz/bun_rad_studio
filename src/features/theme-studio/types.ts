/**
 * High-Abstraction, Deep-Customization Theme Engine & Visual Theme Studio
 * Layer 1 (Surface), Layer 2 (Smart Math Engine), and Layer 3 (Granular CSS Variables) Types
 */

export type BaseMode = "light" | "dark" | "midnight" | "high-contrast";

export type SurfaceVibe = "flat" | "frosted-glass" | "matte" | "neon-border";

export type InterfaceDensity = "compact" | "comfortable" | "spacious";

/**
 * The 10 canonical shade steps from 50 to 950 (plus 900 for compatibility with 11-step consumers).
 */
export const SHADE_STEPS_10 = [50, 100, 200, 300, 400, 500, 600, 700, 800, 950] as const;
export const SHADE_STEPS_ALL = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

export type ShadeStep10 = (typeof SHADE_STEPS_10)[number];
export type ShadeStep = (typeof SHADE_STEPS_ALL)[number];

export type ShadeScale = Record<ShadeStep, string>;

/**
 * Layer 1: Simple User Controls (The Surface)
 * The 6 high-level controls the user interacts with in Quick Studio.
 */
export interface ThemeSurfaceConfig {
  /** Base luminance and contrast polarity mode */
  baseMode: BaseMode;
  /** Primary brand color (HEX, e.g. "#3b82f6") */
  primaryColor: string;
  /** Accent / action color (HEX, e.g. "#8b5cf6") */
  accentColor: string;
  /** Material & elevation physics */
  surfaceVibe: SurfaceVibe;
  /** Corner sharpness in pixels from 0px (sharp) to 24px (pill-shaped) */
  cornerSharpness: number;
  /** Spacing, control height, and typographic density */
  density: InterfaceDensity;
}

/**
 * Interactive element state tokens automatically derived by the Smart Math Engine.
 */
export interface InteractiveStateTokens {
  base: string;
  hover: string;
  active: string;
  focusRing: string;
  focusBorder: string;
  disabledBg: string;
  disabledText: string;
  textOnBase: string;
  subtleBg: string;
  subtleBorder: string;
}

/**
 * Surface Vibe material tokens (Shadow depth, glass blur intensity, border glow).
 */
export interface SurfaceVibeTokens {
  shadowXs: string;
  shadowSm: string;
  shadowMd: string;
  shadowElevated: string;
  shadowModal: string;
  shadowGlow: string;
  shadowInset: string;
  glassBlur: string;
  glassSaturate: string;
  surfaceBackdrop: string;
  borderGlow: string;
  panelBgAlpha: number;
  elevatedBgAlpha: number;
}

/**
 * Density layout tokens derived from Interface Density.
 */
export interface DensityTokens {
  controlHeightSm: string;
  controlHeightMd: string;
  controlHeightLg: string;
  paddingXSm: string;
  paddingXMd: string;
  paddingXLg: string;
  paddingYSm: string;
  paddingYMd: string;
  gapXs: string;
  gapSm: string;
  gapMd: string;
  gapLg: string;
  gapXl: string;
  panelPadding: string;
  tableCellPadding: string;
  fontSizeXs: string;
  fontSizeSm: string;
  fontSizeBase: string;
  fontSizeLg: string;
  fontSizeXl: string;
  lineHeightBase: string;
}

/**
 * Corner radius tokens derived from Corner Sharpness (0px to 24px).
 */
export interface CornerRadiusTokens {
  radiusXs: string;
  radiusSm: string;
  radiusMd: string;
  radiusLg: string;
  radiusXl: string;
  radiusPill: string;
  radiusButton: string;
  radiusInput: string;
  radiusCard: string;
  radiusModal: string;
  radiusBadge: string;
}

/**
 * Text contrast audit and derived readable foreground colors.
 */
export interface TextContrastTokens {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  textOnAccent: string;
  textInverse: string;
  textLink: string;
  appBgContrastRatio: number;
  panelBgContrastRatio: number;
  primaryButtonContrastRatio: number;
  accentButtonContrastRatio: number;
}

/**
 * The 8 collapsible accordion groups in Tab 2: "Pro Inspector" (Deep Override).
 */
export type InspectorCategory =
  | "Backgrounds"
  | "Typography"
  | "Borders"
  | "Buttons"
  | "Inputs"
  | "Code/Terminal"
  | "Scrollbars"
  | "Shadows";

export const INSPECTOR_CATEGORIES: readonly InspectorCategory[] = [
  "Backgrounds",
  "Typography",
  "Borders",
  "Buttons",
  "Inputs",
  "Code/Terminal",
  "Scrollbars",
  "Shadows",
] as const;

export type VariableInputKind = "color" | "length" | "shadow" | "font" | "text";

export interface ThemeVariableDescriptor {
  /** CSS custom property name, e.g. "--bg-app" */
  name: `--${string}`;
  /** Human-readable label shown in Pro Inspector */
  label: string;
  /** Accordion group in Pro Inspector */
  category: InspectorCategory;
  /** Editor input type hint */
  kind: VariableInputKind;
  /** Short architectural description */
  description: string;
}

/**
 * Map of CSS custom properties (`--*`) to their resolved string values.
 */
export type ThemeCssVariables = Record<`--${string}`, string>;

/**
 * Layer 2 + Layer 3 Complete Output from the Smart Math Engine.
 */
export interface CalculatedThemeSystem {
  surface: ThemeSurfaceConfig;
  isDark: boolean;
  colorScheme: "light" | "dark";
  /** 10-step neutral/surface shade scale (50 to 950) tinted by Primary Brand Color & Base Mode */
  neutralScale: ShadeScale;
  /** 10-step primary brand shade scale (50 to 950) */
  primaryScale: ShadeScale;
  /** 10-step accent action shade scale (50 to 950) */
  accentScale: ShadeScale;
  /** Contrast-verified typography tokens */
  text: TextContrastTokens;
  /** Interactive states for primary, accent, and neutral controls */
  states: {
    primary: InteractiveStateTokens;
    accent: InteractiveStateTokens;
    neutral: InteractiveStateTokens;
  };
  /** Surface vibe physics (shadows, blur, glow) */
  vibe: SurfaceVibeTokens;
  /** Corner radius tokens */
  corners: CornerRadiusTokens;
  /** Interface density tokens */
  density: DensityTokens;
  /** Auto-calculated CSS variables before user overrides */
  computedVariables: ThemeCssVariables;
  /** User-supplied deep overrides from Pro Inspector */
  overrides: Record<string, string>;
  /** Final merged CSS variables applied to :root */
  variables: ThemeCssVariables;
  /** Complete `:root { ... }` CSS stylesheet text */
  cssText: string;
}

/**
 * Saved / Exported Theme Document format for localStorage and JSON file sharing.
 */
export interface SavedThemeDocument {
  schemaVersion: 1;
  format: "bun-rad-theme-studio";
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  surface: ThemeSurfaceConfig;
  overrides: Record<string, string>;
}

/**
 * Quick Studio Preset definition.
 */
export interface ThemePreset {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  surface: ThemeSurfaceConfig;
  overrides?: Record<string, string>;
}
