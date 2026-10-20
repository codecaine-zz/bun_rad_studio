# Futuristic themes, effects tokens and the motion layer

This page explains the `fx` layer: the futuristic themes (`FX_THEMES` — 35 core presets expanded to 168 total presets) plus the tokens, CSS classes and one small pointer script that give any SimpleGUI page and the Visual Designer glass surfaces, edge glow and purposeful motion. It is written for people who add or change themes and controls.

The short version: a theme with an `fx` descriptor gets the layer; a theme without one gets no effects CSS or attributes. Hash tests guard the plain-theme output, including the shared desktop keyboard shortcuts.

## Contents

- [Where things live](#where-things-live)
- [How a theme becomes effects](#how-a-theme-becomes-effects)
- [Tokens](#tokens)
- [The root switch](#the-root-switch)
- [Classes](#classes)
- [The pointer script](#the-pointer-script)
- [Rules the layer follows](#rules-the-layer-follows)
- [The Visual Designer](#the-visual-designer)
- [Adding a theme](#adding-a-theme)
- [Turning effects down or off](#turning-effects-down-or-off)
- [Known limits](#known-limits)

## Where things live

| File | What it holds |
|---|---|
| `src/shared/fxThemes.ts` | The 168 futuristic themes (including the original 35 core presets), the `ThemeFx` descriptor, `fxCssVars()` (descriptor to `--fx-*` variables), `findFxTheme()`, `glassReport()`, `syntaxPalette()` |
| `src/shared/fxCss.ts` | `fxCss()`: the one CSS string every fx page and the Designer share |
| `src/shared/fxSelectors.ts` | The selector groups (buttons, cards, panels, inputs, magnets, tab strips, modals, rows) used by both the CSS and the pointer script |
| `src/shared/fxPointer.ts` | The pointer script as a source string, plus `installFxPointer(window)` for tests |
| `design_tokens.css` | The portable token defaults and a generated copy of the layer (drop it into any HTML page) |
| `src/ide/15_fx_layer.js` | The Designer's generated part: theme table, CSS text, pointer script and canvas wiring |
| `scripts/build_fx_assets.ts` | Writes the last two files from the first four; `bun run fx:build` and `bun run fx:check` |
| `tests/fx_themes.test.ts` | Registration, tokens, contrast, CSS rules, pages, pointer script and Designer wiring |

After changing `fxThemes.ts`, `fxCss.ts`, `fxSelectors.ts` or `fxPointer.ts`, run `bun run fx:build`. It rewrites `design_tokens.css` and `src/ide/15_fx_layer.js`, then rebuilds `src/ide.html`. `bun run fx:check` fails when either file is stale, and so does the test suite.

## How a theme becomes effects

```ts
// src/shared/fxThemes.ts
export const FX_THEMES: Record<string, SimpleGUITheme> = {
    neon_hud: {
        name: "Neon HUD",
        short_name: "Neon HUD",
        background_color: "#03090c",
        font_color: "#dffff8",
        accent_color: "#19f5d6",
        secondary_accent: "#ff3d8b",
        card_background: "#07171b",
        card_border: "#1f7f80",
        description: "Tactical heads-up display ...",
        is_dark: true,
        semantic: { danger: "#ff4466", warning: "#ffd23d", success: "#3dff9a", info: "#3ddcff" },
        fx: { glow: "neon", glowColor: "#19f5d6", glowColor2: "#ff3d8b", blur: 10, glass: 0.45,
              grain: "none", scanlines: "subtle", sheen: false, radius: "sharp", border: "gradient", motion: "snappy", chromatic: true },
    },
};
```

`simplegui.ts` merges `FX_THEMES` into `SIMPLEGUI_THEMES` next to the OS themes and adds the keys to the canonical list (`VLANG_THEME_NAMES`), so theme selectors, `getThemeNames()` and `getTheme()` find them like any other theme. Aliases live in `FX_THEME_ALIASES`; an alias never replaces an existing alias or theme.

### The `fx` descriptor

| Field | Values | Effect |
|---|---|---|
| `glow` | `none`, `soft`, `neon` | Strength of the `--fx-glow-*` shadow lists |
| `glowColor`, `glowColor2` | hex | Primary and secondary light color (rings, bloom, backdrop) |
| `glowIntensity` | 0 to 1, optional (default 1) | Scales glow alpha without changing focus rings or text opacity |
| `borderOpacity` | 0 to 1, optional | Overrides the glass border alpha; omitted values keep the original theme style |
| `blur` | 0 to 32 (px) | Backdrop blur behind glass surfaces |
| `glass` | 0 to 1 | How translucent surfaces are; the fill is raised until body text passes 4.5:1 over black and over white |
| `grain` | `none`, `subtle` | Film grain over the page, at most 4% |
| `scanlines` | `none`, `subtle` | Scanlines over the page, at most 4%, never intercepting the pointer |
| `sheen` | boolean | Slow drifting highlight along card borders |
| `radius` | `sharp`, `soft`, `round`, `pill` | The `--fx-radius-*` scale |
| `border` | `flat`, `gradient`, `metal` | Ring around cards and panels |
| `motion` | `calm`, `spring`, `snappy` | Durations, easing and hover scale |
| `noise` | boolean | Fine noise texture on glass |
| `chromatic` | boolean | Chromatic-aberration text shadow on headings only |
| `ambient` | boolean | Aurora/nebula backdrop that drifts slowly |

Helpers exported from `simplegui.ts` (each with a snake_case alias): `getThemeFx(name)`, `isFxTheme(name)`, `fxCssVars(themeOrName)`, `getSyntaxPalette(name)`.

### Editable effects in File Manager

File Manager's theme editor exposes opacity, blur, glow colors/intensity, border strength/style, corners, animation feel and decorative effects. Its optional `fx` field uses the same `ThemeFx` descriptor and survives save, import and export; old color-only themes stay unchanged. Numeric ranges, enum values and hex colors are validated before producing CSS. Glass stays on small chrome surfaces, never file rows, code or terminal text; opacity is raised to protect readable body and muted text. Reduced-motion preferences disable movement, and browsers without backdrop blur use solid panels.

Twenty more presets cover the common styles: `synthwave_sunset`, `matrix_rain`, `amber_phosphor`, `midnight_glass`, `abyss_bloom`, `cosmic_nebula`, `obsidian_gold`, `crimson_eclipse`, `acid_reactor`, `polar_night`, `emerald_grove`, `brass_engine`, `focus_glow` (quiet effects, no motion or texture), `neon_max` (maximum contrast), `vaporwave_dream`, and the light `frosted_glass`, `sakura_glass`, `pearl_hologram`, `rose_gold` and `daylight_hud`. The new showcase presets are `prism_reactor` (cyan/magenta glass), `orbital_ice` (bright frosted instrumentation), and `ember_grid` (amber tactical controls). Try `bun run demo:themes prism_reactor`, or choose them in File Manager or the Visual Designer.

### Opt an existing theme in

Give it a descriptor and nothing else changes:

```ts
import { SIMPLEGUI_THEMES } from "bun_rad_studio/src/simplegui";

SIMPLEGUI_THEMES.nord!.fx = { glow: "soft", glowColor: "#88c0d0", blur: 10, glass: 0.3, grain: "none", scanlines: "none",
                               sheen: false, radius: "soft", border: "gradient", motion: "calm" };
```

Remove the field and the page is identical to the old one again (the test suite does exactly this).

## Tokens

`fxCssVars()` writes all of these for a theme; `design_tokens.css` has neutral defaults for each so the drop-in classes work on a plain page.

| Token | Meaning |
|---|---|
| `--fx-glow-color`, `--fx-glow-color-2` | Primary and secondary light colors |
| `--fx-glow-soft`, `--fx-glow-med`, `--fx-glow-strong` | Ready-made `box-shadow` lists; all three are a no-op for `glow: "none"` |
| `--fx-blur-sm`, `--fx-blur-md`, `--fx-blur-lg` | Backdrop blur for bars, cards and modals |
| `--fx-glass-bg`, `--fx-glass-bg-strong` | Glass fills, already opaque enough for AA text |
| `--fx-glass-solid` | The opaque fallback (no `backdrop-filter`, or `prefers-contrast: more`) |
| `--fx-glass-border`, `--fx-glass-alpha`, `--fx-saturate` | Glass edge, the final fill opacity and backdrop saturation |
| `--fx-radius-xs` to `--fx-radius-xl`, `--fx-radius-pill` | Corner scale |
| `--fx-shadow-1` to `--fx-shadow-5` | Multi-layer diffuse elevation, light to dramatic |
| `--fx-border-gradient`, `--fx-sheen` | Ring gradient and moving highlight gradient |
| `--fx-row-hover`, `--fx-accent-soft` | Table row highlight and a soft accent tint |
| `--fx-ease-spring`, `--fx-ease-out`, `--fx-ease-in-out`, `--fx-ease-bounce`, `--fx-ease` | Easings (`--fx-ease` is the theme's own) |
| `--fx-dur-instant`, `-fast`, `-base`, `-slow`, `-ambient` | Durations |
| `--fx-stagger` | Delay step for `--fx-i` children |
| `--fx-hover-scale`, `--fx-press-scale` | Button scale on hover (1.01 to 1.03) and press (0.97 to 0.99) |
| `--fx-focus-color`, `--fx-focus-ring`, `--fx-focus-offset`, `--fx-focus-halo` | Focus ring; the color is moved until it reaches 3:1 on the canvas and card |
| `--fx-on-accent` | Black or white, whichever reads on the accent color |
| `--fx-scanline-opacity`, `--fx-grain-opacity` | 0 or 0.035 |
| `--fx-ca-1`, `--fx-ca-2`, `--fx-ambient-1`, `--fx-ambient-2`, `--fx-noise` | Heading fringe colors, backdrop blobs, noise texture |
| `--fx-pointer-x`, `--fx-pointer-y`, `--fx-pointer-size` | Cursor glow position (written by the pointer script) and radius |
| `--fx-tilt-x`, `--fx-tilt-y`, `--fx-mag-x`, `--fx-mag-y`, `--fx-pill-x`, `--fx-pill-w` | Written by the pointer script: card tilt, toolbar drift, tab indicator |

## The root switch

Everything is scoped under an attribute on the page root:

| Attribute | Meaning |
|---|---|
| `data-fx="on"` | Full: looks and motion |
| `data-fx="reduced"` | The looks without motion; hover states fade |
| `data-fx="off"` or no attribute | Nothing |

Generated pages set it automatically for fx themes, with one extra flag per feature (`data-fx-scan`, `data-fx-grain`, `data-fx-sheen`, `data-fx-noise`, `data-fx-ca`, `data-fx-ambient`, `data-fx-border`, `data-fx-glow`, `data-fx-motion`). In your own HTML put `data-fx="on"` on `<html>` and include `design_tokens.css`.

## Classes

The layer styles the markup SimpleGUI already produces (`button.rad-button`, `.rad-card`, `fieldset`, `table`, `.rad-tabs-bar`, `.rad-toolbar`, `.rad-modal`, inputs) through selectors, so no HTML changes for fx themes. The `fx-` classes are the drop-in equivalents for your own markup. Put `data-no-fx` on any element to opt it out.

| Class | What it does |
|---|---|
| `.fx-button` | Hover scale (`--fx-hover-scale`), press scale with spring return, cursor-following radial glow (`::before`), bloom (`::after`, a pre-rendered shadow whose opacity changes) |
| `.fx-input` | Wrap an `<input placeholder=" ">` and a `<label>`: floating label with spring timing, glow ring on `:focus-within` (opacity and scale of a pseudo-element), underline that sweeps with `scaleX` |
| `.fx-card`, `.fx-panel` | Glass fill, gradient or metal ring, multi-layer shadow (`--fx-shadow-2` at rest, `--fx-shadow-4` swapped in by opacity on hover). Cards also tilt up to 4 degrees toward the pointer. Add a child `<div class="fx-sheen">` for a highlight that sweeps across on hover |
| `.fx-table` | Row highlight and an accent bar that slides in with `translateX` and `scaleY` |
| `.fx-nav`, `.fx-toolbar` | Glass bar. In `.fx-nav` one indicator slides under the active tab (`translateX` plus `scaleX` from `--fx-pill-x` and `--fx-pill-w`); toolbar items drift toward the pointer by at most 6px |
| `.fx-icon-click` | Wiggle on press (`.is-clicked` replays it from code) |
| `.fx-modal`, `.fx-sheet` | Glass surface; entry with fade plus scale (modal) or slide (sheet) when `data-open` is set, exit when `data-closing` is set; children reveal in sequence through `style="--fx-i: n"` times `--fx-stagger` |
| `.fx-pill-live` | Breathing glow around a status pill |
| `.fx-pulse` | Running-watcher dot with an expanding ring |
| `.fx-skeleton` | Loading shimmer (`contain: paint`) |

```html
<html data-fx="on">
<link rel="stylesheet" href="design_tokens.css">
<script>/* paste FX_POINTER_SOURCE from src/shared/fxPointer.ts, or skip it: only glow, tilt, magnet and the tab indicator need it */</script>

<div class="fx-input"><input id="mail" placeholder=" "><label for="mail">Email address</label></div>
<button class="fx-button">Save</button>
<div class="fx-modal" data-open style="width: 420px">
  <header style="--fx-i: 0">Title</header><p style="--fx-i: 1">Body</p><footer style="--fx-i: 2">Actions</footer>
</div>
```

## The pointer script

`FX_POINTER_SOURCE` is about 60 lines of plain JavaScript that is included only in fx pages. One delegated `pointermove` listener (passive) plus `pointerleave` and `click`; moves are collected and handled once per animation frame; touch is ignored; it does nothing unless `data-fx="on"` (on `<html>` or an ancestor of the target). It only writes custom properties; every visual change is a CSS transform or opacity transition. `installFxPointer(window)` returns `{ dispose, refresh }` and is what the tests use under jsdom.

The sliding tab indicator reads the active tab from `[aria-selected="true"]`, `[data-active="true"]`, `.is-active` or `.active` (or `data-value` on SimpleGUI tab strips) and is repositioned when a tab is clicked. If you change tabs from code, call `window.document.__fxPointer.refresh()`.

## Rules the layer follows

- **Only compositor properties move.** Every `@keyframes` and every `transition-property` is `transform`, `opacity` or `filter` (tests parse them). The bloom, elevation and glow are pre-rendered pseudo-elements whose opacity changes; `box-shadow` is never animated.
- **No timers, no layout reads on hot paths.** One rAF-throttled handler; at most one `getBoundingClientRect` per frame for the hovered element.
- **`will-change` only on states that animate** (hover, press, open, ambient), never on resting elements.
- **Reduced motion.** Motion rules live inside `@media (prefers-reduced-motion: no-preference)`. With `reduce`, animations are off and hover states fade; `data-fx="reduced"` gives the same result on request.
- **Contrast preference.** `prefers-contrast: more` turns off glow, glass, blur, scanlines, grain and the heading fringe, uses solid surfaces with a 1px text-colored border and a thicker focus ring.
- **Forced colors.** System colors (`Canvas`, `CanvasText`, `Highlight`), no shadows or blur, effect layers hidden.
- **Focus is never removed.** `:focus-visible` always draws `--fx-focus-ring`; no rule sets `outline: none`.
- **Glass stays readable.** `--fx-glass-bg` is raised until the theme's text reaches 4.5:1 over a pure black and a pure white backdrop (`glassReport()`); without `backdrop-filter` support the fill becomes the opaque `--fx-glass-solid`. `backdrop-filter` is used on small surfaces, never on table bodies.
- **Nothing flashes.** The fastest looping animation is 1.6 seconds per cycle.
- **Overlays are inert.** Scanlines, grain and every decorative pseudo-element have `pointer-events: none`, and scanlines and grain stay at 3.5% opacity.

## The Visual Designer

- **Theme select.** `propFormTheme` has a new **Futuristic** group; every old option is unchanged. `getRawThemeColors()` returns each fx theme's colors (the table in `15_fx_layer.js`), and `getThemeColors()` keeps button text at 4.5:1.
- **Effects control.** **Effects** (Full, Reduced, Off, default Full) sits under **Form Theme**. The choice and the theme name are stored in the form (`theme` and `fx_mode`), so they survive autosave, restore, import, undo and the Run preview. Full follows the system reduced-motion setting through the CSS.
- **Preview.** The canvas (`#formCanvas`) gets `class="fx-root"` plus the `data-fx` flags, so glass, glow and ambient backdrop show while you design. Hover transforms are deliberately off on the canvas so they never fight dragging, and a selected control keeps the Designer's own selection border.
- **Chrome.** The toolbar, the tab strip and the header buttons use the layer when an fx theme is selected. The code areas and the properties panel never do: no blur behind code, no scanlines over text you edit.
- **Run and export.** `generatePreviewHtml()` finds the fx theme from `spec.theme` and reads `spec.fx_mode`, so the Run window and exported projects match the canvas.

## Adding a theme

1. Add an entry to `FX_THEMES` with colors, a description, `is_dark`, optional `semantic` overrides and an `fx` descriptor.
2. Run `bun test tests/fx_themes.test.ts`. It checks text, accent, border and focus contrast, the four status colors, glass over black and white, code colors and the token set. Adjust colors until it passes.
3. Add the display name to the **Futuristic** group in `src/ide/05_body_markup.html` (the test compares the list with `FX_THEMES`).
4. Run `bun run fx:build`, then `bun run capture:themes <key>` for the screenshot, then `bun run scripts/build_os_theme_docs.ts` to refresh `docs/THEMES.md`.
5. Update the count in `tests/vlang_webview_parity.test.ts` (the list of themes there is the contract for `getThemeNames()`).

## Turning effects down or off

```ts
const win = simplegui.createWindow("App", 900, 600, { theme: "neon_hud", effects: "reduced" });
win.setEffects("off"); // "full", "reduced" or "off"; takes effect in the open window
```

In the Designer use the **Effects** control. Users who set reduced motion in their system see no motion without any code. To remove the layer for one control, add `data-no-fx`.

## Known limits

- `backdrop-filter` needs WebKit (macOS), WebView2 (Windows) or a recent WebKitGTK (Linux). Elsewhere surfaces fall back to the solid fill; nothing breaks.
- Color Studio's **Export CSS** writes `design_tokens.css` in the folder it was started from and replaces the file. Run it somewhere else, or run `bun run fx:build` afterwards to restore the fx tokens.
- The HTML, React and Vue code tabs of the Designer export their own markup and do not include the layer; Run and Export do.
- Real hover cannot be driven in a hidden browser tab; the documentation screenshots park the pointer and finish transitions, so they show end states.

See also: [Theme gallery](../THEMES.md), [Accessibility](../accessibility.md), [Performance](../performance.md).
