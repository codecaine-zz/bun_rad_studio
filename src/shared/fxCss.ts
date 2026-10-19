// The futuristic motion/interaction layer as one CSS string, emitted once into generated pages and into the Designer.
// Everything is scoped under [data-fx="on"] (full) or [data-fx="reduced"] (looks without motion); [data-fx="off"] or no
// attribute means none of it applies. Themes without `fx` never get this block, so their pages are unchanged.
//
// Rules for everything in here:
//  - motion animates transform, opacity and filter only (a test parses every @keyframes and transition-property);
//  - hover glow, bloom and elevation are pre-rendered pseudo-elements whose OPACITY changes, never an animated box-shadow;
//  - motion lives inside @media (prefers-reduced-motion: no-preference); reduced users get fades only;
//  - backdrop-filter is used on small glass surfaces only (never table bodies) and has a solid fallback;
//  - focus rings are never removed.
import { FX_SEL, joinSel } from "./fxSelectors";

const V = ':is([data-fx="on"],[data-fx="reduced"])'; // looks (and fades)
const ON = '[data-fx="on"]'; // motion
const RM = '[data-fx="reduced"]';
const NF = ":not([data-no-fx]):not(.selected)"; // .selected: the Designer's own selection border and glow must stay visible

const where = (list: readonly string[]) => `:where(${list.join(",")})`;
const BTN = where(FX_SEL.button);
const CARD = where(FX_SEL.card);
const PANEL = where(FX_SEL.panel);
const SURF = where([...FX_SEL.card, ...FX_SEL.panel]);
const INPUT = where(FX_SEL.input);
const MAG = where(FX_SEL.magnet);
const PILL = where(FX_SEL.pill);
const MODAL = where(FX_SEL.modal);
const ROW = where(FX_SEL.row);
const BAR = where([".fx-toolbar", ".rad-toolbar", ".fx-nav", ".rad-tabs-bar", ".rad-menu-bar"]);
const CLASSES = where([".fx-button", ".fx-input", ".fx-card", ".fx-panel", ".fx-table", ".fx-nav", ".fx-toolbar", ".fx-modal", ".fx-sheet", ".fx-pill-live", ".fx-pulse", ".fx-skeleton", ".fx-icon-click", ".fx-sheen"]);
const HOOKS = where([...FX_SEL.button, ...FX_SEL.card, ...FX_SEL.panel, ...FX_SEL.magnet, ...FX_SEL.pill, ...FX_SEL.modal, ".fx-input", ".fx-pill-live", ".fx-pulse", ".fx-skeleton", ".fx-icon-click", ".fx-sheen"]);
const MV = ":not(.designer-control)"; // hover transforms would fight dragging on the Designer canvas
const NO_ABS = ':not([style*="position"]):not(.designer-control)';
// A strip (tabs, toolbar) carries data-fx itself in the Designer chrome, so its rules match the strip as well as anything inside a data-fx root.
const both = (hook: string, tail = "") => `${V} ${hook}${tail}, ${hook}${V}${tail}`;
const bothOn = (hook: string, tail = "") => `${ON} ${hook}${tail}, ${hook}${ON}${tail}`;
const PRG = where([".rad-progress > div:last-child > div", ".fx-progress-fill"]);

const RING_MASK = "-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude;";

function looks(): string {
    return `
/* ---- looks: glass, rings, glow, radius (full and reduced) ---- */
[data-fx] { --in-oklab: ; --in-oklch: ; }
@supports (background: linear-gradient(in oklab, #000, #fff)) {
  [data-fx] { --in-oklab: in oklab, ; --in-oklch: in oklch, ; }
}
${V}[data-fx-ambient="on"] body::before, ${V}[data-fx-ambient="on"].fx-root::before {
  content: ""; position: fixed; inset: -10%; z-index: -1; pointer-events: none;
  background: radial-gradient(var(--in-oklab) 60vmax 45vmax at 12% 8%, var(--fx-ambient-1), transparent 62%), radial-gradient(var(--in-oklab) 55vmax 40vmax at 90% 92%, var(--fx-ambient-2), transparent 60%);
}
${V}[data-fx-atmosphere="nebula"]:not([data-fx-tier="low"]) body::before, ${V}[data-fx-atmosphere="nebula"]:not([data-fx-tier="low"]).fx-root::before {
  content: ""; position: fixed; inset: -12%; z-index: -1; pointer-events: none;
  background: radial-gradient(var(--in-oklab) 65vmax 50vmax at 16% 14%, var(--fx-ambient-1), transparent 64%), radial-gradient(var(--in-oklab) 60vmax 45vmax at 84% 86%, var(--fx-ambient-2), transparent 62%), conic-gradient(from 140deg at 50% 50%, transparent 0deg, var(--fx-accent-soft) 120deg, transparent 260deg);
}
${V}[data-fx-atmosphere="grid"]:not([data-fx-tier="low"]) body::before, ${V}[data-fx-atmosphere="grid"]:not([data-fx-tier="low"]).fx-root::before {
  content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background-image: linear-gradient(to right, var(--fx-accent-soft) 1px, transparent 1px), linear-gradient(to bottom, var(--fx-accent-soft) 1px, transparent 1px), radial-gradient(var(--in-oklab) 60vmax 45vmax at 50% 0%, var(--fx-ambient-1), transparent 70%);
  background-size: 36px 36px, 36px 36px, 100% 100%;
}
${V}[data-fx-atmosphere="aurora"]:not([data-fx-tier="low"]) body::before, ${V}[data-fx-atmosphere="aurora"]:not([data-fx-tier="low"]).fx-root::before {
  content: ""; position: fixed; inset: -10%; z-index: -1; pointer-events: none;
  background: radial-gradient(var(--in-oklch) 80vmax 35vmax at 25% 5%, var(--fx-ambient-1), transparent 65%), radial-gradient(var(--in-oklch) 75vmax 38vmax at 78% 12%, var(--fx-ambient-2), transparent 68%);
}
${V}[data-fx-atmosphere="horizon"]:not([data-fx-tier="low"]) body::before, ${V}[data-fx-atmosphere="horizon"]:not([data-fx-tier="low"]).fx-root::before {
  content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: radial-gradient(var(--in-oklch) 90vmax 36vmax at 50% 100%, var(--fx-ambient-1), transparent 68%), linear-gradient(var(--in-oklab) 180deg, transparent 55%, var(--fx-ambient-2) 100%);
}
${V}.fx-root { isolation: isolate; }
${V}.fx-root[data-fx-ambient="on"]::before { position: absolute; inset: 0; }
${V}[data-fx-scan="on"] body::after, ${V}[data-fx-scan="on"].fx-root::after {
  content: ""; position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: var(--fx-scanline-opacity, 0.035);
  background: repeating-linear-gradient(0deg, var(--fx-glow-color) 0 1px, transparent 1px 3px);
}
${V}[data-fx-scan="crt"] body::after, ${V}[data-fx-scan="crt"].fx-root::after {
  content: ""; position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: var(--fx-scanline-opacity, 0.04);
  background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.55) 0 1px, var(--fx-glow-color) 1px 2px, transparent 2px 4px);
}
${V}[data-fx-scan="interlace"] body::after, ${V}[data-fx-scan="interlace"].fx-root::after {
  content: ""; position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: var(--fx-scanline-opacity, 0.03);
  background: repeating-linear-gradient(0deg, var(--fx-glow-color) 0 1px, transparent 1px 2px), repeating-linear-gradient(90deg, rgba(255, 0, 80, 0.16) 0 1px, rgba(0, 255, 160, 0.16) 1px 2px, rgba(60, 140, 255, 0.16) 2px 3px);
}
${V}.fx-root:is([data-fx-scan="on"],[data-fx-scan="crt"],[data-fx-scan="interlace"])::after { position: absolute; }
${V}[data-fx-grain="on"]::after { content: ""; position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: calc(var(--fx-grain-opacity, 0.035) * 12); background-image: var(--fx-noise); }
${V}[data-fx-grain="film"]::after { content: ""; position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: calc(var(--fx-grain-opacity, 0.04) * 14); background-image: var(--fx-noise); }
${V}[data-fx-grain="halftone"]::after { content: ""; position: fixed; inset: 0; z-index: 2; pointer-events: none; opacity: calc(var(--fx-grain-opacity, 0.038) * 3.5); background-image: radial-gradient(circle, var(--fx-glow-color) 1px, transparent 1.4px); background-size: 5px 5px; }
${V}.fx-root:is([data-fx-grain="on"],[data-fx-grain="film"],[data-fx-grain="halftone"])::after { position: absolute; }
${V}[data-fx-ca="on"] :where(h1, h2, .rad-heading, .rad-subheading, .fx-heading) { text-shadow: -0.6px 0 var(--fx-ca-1), 0.6px 0 var(--fx-ca-2); }
${V}[data-fx-prism="on"] :where(h1, h2, h3, .rad-heading, .rad-subheading, .fx-heading) { text-shadow: -1px 0 var(--fx-ca-1), 1px 0 var(--fx-ca-2); }
${V}[data-fx-vignette="subtle"] body, ${V}[data-fx-vignette="subtle"].fx-root { box-shadow: inset 0 0 80px rgba(0, 0, 0, 0.28); }
${V}[data-fx-vignette="cinema"] body, ${V}[data-fx-vignette="cinema"].fx-root { box-shadow: inset 0 0 130px rgba(0, 0, 0, 0.55); }
${V}[data-fx-vignette="ambient"] body, ${V}[data-fx-vignette="ambient"].fx-root { box-shadow: inset 0 0 110px var(--fx-ambient-1); }

/* Focus is never hidden by glow. */
${V} select[multiple] option:checked, ${V} select[size] option:checked { color: var(--fx-on-accent) !important; }
${V} :where(button, input, textarea, select, a[href], summary, [tabindex], .fx-button):focus-visible { outline: var(--fx-focus-ring) !important; outline-offset: var(--fx-focus-offset) !important; }

/* Buttons */
${V} :where(button.rad-button.btn-theme-accent, button.rad-dropdown-btn.btn-theme-accent):not([data-custom-bg]) { color: var(--fx-on-accent) !important; }
${V} ${BTN}${NF} { isolation: isolate; transition-property: opacity; transition-duration: var(--fx-dur-fast); }
${V} ${BTN}${NF}${NO_ABS} { position: relative; }
${V} :where(.fx-button, button.rad-button[style*="border-radius:6px"], .designer-control[data-ctype="button"]:not([style*="border-radius"]))${NF} { border-radius: var(--fx-radius-md) !important; }
${V} ${BTN}${NF}::before {
  content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none; opacity: 0;
  background: radial-gradient(var(--fx-pointer-size, 180px) circle at var(--fx-pointer-x, 50%) var(--fx-pointer-y, 50%), rgba(255, 255, 255, 0.3), transparent 70%);
  transition-property: opacity; transition-duration: var(--fx-dur-fast);
}
${V}[data-fx-cursor="prism"] ${BTN}${NF}::before { background: radial-gradient(var(--fx-pointer-size, 180px) circle at var(--fx-pointer-x, 50%) var(--fx-pointer-y, 50%), var(--fx-ca-1), var(--fx-ca-2) 42%, transparent 72%); }
${V}[data-fx-cursor="ripple"] ${BTN}${NF}::before { background: radial-gradient(var(--fx-pointer-size, 180px) circle at var(--fx-pointer-x, 50%) var(--fx-pointer-y, 50%), rgba(255, 255, 255, 0.36) 0%, transparent 32%, var(--fx-accent-soft) 48%, transparent 70%); }
${V}[data-fx-cursor="none"] ${BTN}${NF}::before { display: none; }
${V} ${BTN}${NF}::after {
  content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none; opacity: 0;
  box-shadow: var(--fx-glow-strong); transition-property: opacity; transition-duration: var(--fx-dur-base);
}
${V}:is([data-fx-glow="neon"],[data-fx-glow="laser"],[data-fx-glow="plasma"]) ${BTN}${NF}::after { opacity: 0.5; }
${V}:is([data-fx-glow="bloom"],[data-fx-glow="aurora"],[data-fx-glow="ember"]) ${BTN}${NF}::after { opacity: 0.36; }
${V} ${BTN}${NF}:hover::before, ${V} ${BTN}${NF}:focus-visible::before { opacity: 1; }
${V} ${BTN}${NF}:hover::after, ${V} ${BTN}${NF}:focus-visible::after { opacity: 1; }

/* Inputs: a bare field cannot hold pseudo-elements, so its glow is a filter; .fx-input wraps a field for the full treatment */
${V} ${INPUT}${NF}:focus { border-color: var(--fx-focus-color) !important; filter: drop-shadow(0 0 5px var(--fx-glow-color)); }
${V} .fx-input { position: relative; display: block; isolation: isolate; }
${V} .fx-input > :where(input, textarea) {
  width: 100%; padding: 22px 12px 8px; color: inherit; background: var(--input-bg, var(--fx-glass-bg)); border: 1px solid var(--input-border, var(--fx-glass-border));
  border-radius: var(--fx-radius-md); font: inherit;
}
${V} .fx-input > label { position: absolute; left: 12px; top: 15px; pointer-events: none; transform-origin: left top; color: var(--theme-muted, currentColor); }
${V} .fx-input > :where(input, textarea):not(:placeholder-shown) ~ label, ${V} .fx-input:focus-within > label { color: var(--fx-focus-color); }
${V} .fx-input::before { content: ""; position: absolute; inset: -2px; z-index: -1; border-radius: calc(var(--fx-radius-md) + 2px); pointer-events: none; box-shadow: var(--fx-glow-med); opacity: 0; transition-property: opacity; transition-duration: var(--fx-dur-base); }
${V} .fx-input:focus-within::before { opacity: 1; }
${V} .fx-input::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: 0; height: 2px; pointer-events: none; background: linear-gradient(var(--in-oklch) 90deg, var(--fx-glow-color), var(--fx-glow-color-2)); opacity: 0; transition-property: opacity; transition-duration: var(--fx-dur-fast); }
${V} .fx-input:focus-within::after { opacity: 1; }
${V} .fx-input > :where(input, textarea):not(:placeholder-shown) ~ label, ${V} .fx-input:focus-within > label { font-size: 11px; top: 6px; }
${V} .fx-input > label { font-size: 13px; top: 15px; }

/* Cards and panels: glass, ring, multi-layer shadow */
${V} ${SURF}${NF} {
  background-color: var(--fx-glass-bg) !important; border-color: var(--fx-glass-border) !important; box-shadow: var(--fx-shadow-2) !important;
  -webkit-backdrop-filter: blur(var(--fx-blur-md)) saturate(var(--fx-saturate)); backdrop-filter: blur(var(--fx-blur-md)) saturate(var(--fx-saturate)); isolation: isolate;
}
${V}[data-fx-backdrop="liquid"] ${SURF}${NF} { -webkit-backdrop-filter: blur(var(--fx-blur-ultra, var(--fx-blur-lg))) saturate(var(--fx-saturate-ultra, 1.75)) brightness(1.06); backdrop-filter: blur(var(--fx-blur-ultra, var(--fx-blur-lg))) saturate(var(--fx-saturate-ultra, 1.75)) brightness(1.06); box-shadow: var(--fx-specular-rim), var(--fx-shadow-3) !important; }
${V}[data-fx-backdrop="mica"] ${SURF}${NF} { -webkit-backdrop-filter: blur(var(--fx-blur-lg)) saturate(var(--fx-saturate-ultra, 1.65)); backdrop-filter: blur(var(--fx-blur-lg)) saturate(var(--fx-saturate-ultra, 1.65)); background-image: radial-gradient(120% 90% at 15% 10%, var(--fx-ambient-1), transparent 70%); }
${V}[data-fx-backdrop="acrylic"] ${SURF}${NF} { -webkit-backdrop-filter: blur(var(--fx-blur-md)) saturate(var(--fx-saturate, 1.35)) contrast(1.03); backdrop-filter: blur(var(--fx-blur-md)) saturate(var(--fx-saturate, 1.35)) contrast(1.03); background-image: var(--fx-noise) !important; }
${V}[data-fx-backdrop="frosted"] ${SURF}${NF} { -webkit-backdrop-filter: blur(var(--fx-blur-ultra, 32px)) saturate(1.18) brightness(1.04); backdrop-filter: blur(var(--fx-blur-ultra, 32px)) saturate(1.18) brightness(1.04); }
${V}[data-fx-backdrop="oled"] ${SURF}${NF} { background-color: var(--fx-glass-solid) !important; box-shadow: var(--fx-specular-rim), var(--fx-shadow-4) !important; }
${V}[data-fx-backdrop="matte"] ${SURF}${NF} { background-color: var(--fx-glass-solid) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; box-shadow: var(--fx-shadow-1) !important; }
${V}[data-fx-border="double"] ${SURF}${NF} { outline: 1px solid var(--fx-glass-border); outline-offset: -4px; }
${V}[data-fx-border="neon"] ${SURF}${NF} { box-shadow: var(--fx-glow-soft), var(--fx-shadow-2) !important; }
${V}[data-fx-inner-glow="on"] ${SURF}${NF} { box-shadow: inset 0 0 22px -6px var(--fx-glow-color), var(--fx-shadow-2) !important; }
${V}[data-fx-rim="on"] ${SURF}${NF} { box-shadow: var(--fx-specular-rim), var(--fx-shadow-2) !important; }
${V}[data-fx-crt="on"] ${SURF}${NF} { box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.42), var(--fx-shadow-3) !important; }
${V}[data-fx-noise="on"] ${SURF}${NF} { background-image: var(--fx-noise) !important; }
${V} ${SURF}${NF}${NO_ABS} { position: relative; }
${V} :where(.fx-card, .fx-panel, .rad-card[style*="border-radius:10px"], .rad-kpi-card, .sg-kpi-card)${NF} { border-radius: var(--fx-radius-lg) !important; }
${V} :where(fieldset[style*="border-radius:8px"])${NF} { border-radius: var(--fx-radius-lg) !important; }
${V}:not([data-fx-border="flat"]) ${SURF}:not(fieldset)${NF}::after {
  content: ""; position: absolute; inset: 0; z-index: 1; border-radius: inherit; padding: 1px; pointer-events: none;
  background: radial-gradient(220px circle at var(--fx-pointer-x, 50%) var(--fx-pointer-y, 50%), var(--fx-glow-color), transparent 72%), var(--fx-border-gradient); ${RING_MASK}
}
${V} :where(.fx-card, .fx-panel)${NF}::before { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: inherit; pointer-events: none; box-shadow: var(--fx-shadow-4); opacity: 0; transition-property: opacity; transition-duration: var(--fx-dur-base); }
${V} :where(.fx-card, .fx-panel)${NF}:hover::before { opacity: 1; }
${V} ${where([".rad-card", ".rad-kpi-card", ".sg-kpi-card", ".designer-control[data-ctype=\"card\"]"])}${NF}:hover { filter: drop-shadow(0 14px 18px rgba(0, 0, 0, 0.28)); }
${V} .fx-sheen { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
${V} .fx-sheen::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: var(--fx-sheen); transform: translateX(-100%); }

/* Tables: row highlight and an accent bar (the slide is in the motion block) */
${V} ${ROW} > td:first-child, ${V} ${ROW} > th:first-child { position: relative; }
${V} ${ROW} > :first-child::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; pointer-events: none; background: linear-gradient(var(--in-oklch) 180deg, var(--fx-glow-color), var(--fx-glow-color-2)); opacity: 0; transition-property: opacity; transition-duration: var(--fx-dur-fast); }
${V} ${ROW}:hover > :first-child::before { opacity: 1; }
${V} ${ROW}:hover > td { background-image: linear-gradient(var(--fx-row-hover), var(--fx-row-hover)); }

/* Toolbars, menus and tab strips: glass bar, one sliding indicator */
${both(BAR, NF)} { background-color: var(--fx-glass-bg) !important; border-color: var(--fx-glass-border) !important; -webkit-backdrop-filter: blur(var(--fx-blur-sm)) saturate(var(--fx-saturate)); backdrop-filter: blur(var(--fx-blur-sm)) saturate(var(--fx-saturate)); }
${both(PILL, `${NF}${NO_ABS}`)} { position: relative; }
${both(PILL, `${NF}::after`)} {
  content: ""; position: absolute; left: 0; bottom: 0; width: 1px; height: 3px; pointer-events: none; opacity: 0; transform-origin: left center;
  background: linear-gradient(var(--in-oklch) 90deg, var(--fx-glow-color), var(--fx-glow-color-2)); transform: translateX(var(--fx-pill-x, 0px)) scaleX(var(--fx-pill-w, 0));
  transition-property: opacity; transition-duration: var(--fx-dur-fast);
}
${both(PILL, `${NF}[data-fx-pill]::after`)} { opacity: 1; }
${V} .rad-tabs-bar[data-fx-pill] > .rad-tab-btn { border-bottom-color: transparent !important; transition-property: none !important; }

/* Modals and sheets: glass surface, children staggered through --fx-i */
${V} ${MODAL}${NF} { background-color: var(--fx-glass-bg-strong) !important; border: 1px solid var(--fx-glass-border) !important; box-shadow: var(--fx-shadow-5) !important; -webkit-backdrop-filter: blur(var(--fx-blur-lg)) saturate(var(--fx-saturate)); backdrop-filter: blur(var(--fx-blur-lg)) saturate(var(--fx-saturate)); }
${V} :where(.fx-modal, .fx-sheet)${NF} { border-radius: var(--fx-radius-xl); overflow: hidden; }
${V} ${MODAL} > :where(:nth-child(1)) { --fx-i: 0; }
${V} ${MODAL} > :where(:nth-child(2)) { --fx-i: 1; }
${V} ${MODAL} > :where(:nth-child(3)) { --fx-i: 2; }
${V} ${MODAL} > :where(:nth-child(4)) { --fx-i: 3; }

/* Status: breathing pill, pulsing watcher dot, skeleton, progress glow */
${V} .fx-pill-live { position: relative; isolation: isolate; }
${V} .fx-pill-live::before { content: ""; position: absolute; inset: -3px; z-index: -1; border-radius: inherit; pointer-events: none; box-shadow: var(--fx-glow-med); opacity: 0.35; }
${V} .fx-pulse { position: relative; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--fx-pulse-color, var(--success, var(--fx-glow-color))); }
${V} .fx-pulse::after { content: ""; position: absolute; inset: 0; border-radius: 50%; pointer-events: none; box-shadow: 0 0 0 2px var(--fx-pulse-color, var(--success, var(--fx-glow-color))); opacity: 0; }
${V} .fx-skeleton { position: relative; overflow: hidden; contain: paint; border-radius: var(--fx-radius-sm); background: var(--fx-glass-border); }
${V} .fx-skeleton::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.14), transparent); transform: translateX(-100%); }
${V} ${PRG} { position: relative; overflow: hidden; box-shadow: var(--fx-glow-soft); }
${V} ${PRG}::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent); opacity: 0; }

/* Wide-gamut Display-P3 and Liquid Retina XDR / HDR enhancements (e.g. M4 MacBook Pro) */
@media (color-gamut: p3) {
  ${V}:not([data-fx-tier="low"]) { --fx-glow-color: var(--fx-glow-p3); --fx-glow-color-2: var(--fx-glow-2-p3); --fx-saturate: var(--fx-saturate-ultra, 1.55); }
}
@media (dynamic-range: high) {
  ${V}:not([data-fx-tier="low"]) ${SURF}${NF} { box-shadow: var(--fx-specular-rim), var(--fx-shadow-2) !important; -webkit-backdrop-filter: blur(var(--fx-blur-ultra, var(--fx-blur-md))) saturate(var(--fx-saturate-ultra, var(--fx-saturate))); backdrop-filter: blur(var(--fx-blur-ultra, var(--fx-blur-md))) saturate(var(--fx-saturate-ultra, var(--fx-saturate))); }
  ${V}:not([data-fx-tier="low"]) ${MODAL}${NF} { box-shadow: var(--fx-specular-rim), var(--fx-shadow-5) !important; -webkit-backdrop-filter: blur(var(--fx-blur-ultra, var(--fx-blur-lg))) saturate(var(--fx-saturate-ultra, var(--fx-saturate))); backdrop-filter: blur(var(--fx-blur-ultra, var(--fx-blur-lg))) saturate(var(--fx-saturate-ultra, var(--fx-saturate))); }
}
`;
}

function motion(): string {
    return `
/* ---- motion: full effects only, never for users who asked for less ---- */
@media (prefers-reduced-motion: no-preference) {
  ${ON}[data-fx-ambient="on"] body::before, ${ON}[data-fx-ambient="on"].fx-root::before { will-change: transform; animation: fx-ambient-drift var(--fx-dur-ambient, 9000ms) var(--fx-ease-in-out) infinite alternate; }

  ${ON} ${BTN}${NF} { transition-property: transform, filter !important; transition-duration: var(--fx-dur-fast) !important; transition-timing-function: var(--fx-ease-spring) !important; }
  ${ON} ${BTN}${NF}${MV}:hover { transform: scale(var(--fx-hover-scale)) !important; will-change: transform; }
  ${ON} ${BTN}${NF}${MV}:active { transform: scale(var(--fx-press-scale)) !important; transition-duration: var(--fx-dur-instant) !important; }
  ${ON} ${BTN}${NF}::before, ${ON} ${BTN}${NF}::after { transition-property: opacity, transform; }
  ${ON} ${BTN}${NF}::after { transform: scale(0.96); }
  ${ON} ${BTN}${NF}:hover::after, ${ON} ${BTN}${NF}:focus-visible::after { transform: scale(1); }

  ${ON} ${INPUT}${NF} { transition-property: filter; transition-duration: var(--fx-dur-base); transition-timing-function: var(--fx-ease-spring); }
  ${ON} .fx-input > label { transition-property: transform; transition-duration: var(--fx-dur-base); transition-timing-function: var(--fx-ease-spring); }
  ${ON} .fx-input > :where(input, textarea):not(:placeholder-shown) ~ label, ${ON} .fx-input:focus-within > label { font-size: 13px; top: 15px; transform: translateY(-9px) scale(0.85); }
  ${ON} .fx-input::before { transform: scale(0.985); transition-property: opacity, transform; }
  ${ON} .fx-input:focus-within::before { transform: scale(1); }
  ${ON} .fx-input::after { transform: scaleX(0); transform-origin: left center; transition-property: opacity, transform; transition-duration: var(--fx-dur-base); transition-timing-function: var(--fx-ease-spring); }
  ${ON} .fx-input:focus-within::after { transform: scaleX(1); }

  ${ON} ${CARD}${NF} { transition-property: transform, filter; transition-duration: var(--fx-dur-base); transition-timing-function: var(--fx-ease-spring); }
  ${ON} ${CARD}${NF}${MV}:hover { transform: perspective(900px) rotateX(var(--fx-tilt-x, 0deg)) rotateY(var(--fx-tilt-y, 0deg)) translateY(-2px); will-change: transform; }
  ${ON} :where(.fx-card, .fx-panel)${NF}::before { transition-property: opacity, transform; transform: translateY(4px); }
  ${ON} :where(.fx-card, .fx-panel)${NF}:hover::before { transform: none; }
  ${ON}[data-fx-sheen="on"] ${SURF}:not(fieldset)${NF}::after { animation: fx-ring-sheen calc(var(--fx-dur-ambient, 9000ms) * 0.9) var(--fx-ease-in-out) infinite alternate; }
  ${ON}[data-fx-pulse="on"] ${SURF}:not(fieldset)${NF}::after { animation: fx-ring-sheen calc(var(--fx-dur-ambient, 9000ms) * 0.45) var(--fx-ease-in-out) infinite alternate; }
  ${ON} :where(.fx-card, .fx-panel):hover > .fx-sheen::before { transition-property: transform; transition-duration: var(--fx-dur-slow); transition-timing-function: var(--fx-ease-out); transform: translateX(100%); }

  ${ON} ${ROW} > :first-child::before { transform: translateX(-3px) scaleY(0.4); transition-property: opacity, transform; transition-duration: var(--fx-dur-base); transition-timing-function: var(--fx-ease-spring); }
  ${ON} ${ROW}:hover > :first-child::before { transform: none; }

  ${ON} ${MAG}${NF} { transition-property: transform; transition-duration: var(--fx-dur-fast); transition-timing-function: var(--fx-ease-out); }
  ${ON} ${MAG}${NF}${MV}:hover { transform: translate(var(--fx-mag-x, 0px), var(--fx-mag-y, 0px)) scale(1.06); will-change: transform; }
  ${bothOn(PILL, `${NF}::after`)} { transition-property: opacity, transform; transition-duration: var(--fx-dur-base); transition-timing-function: var(--fx-ease-spring); }

  ${ON} :where(.fx-modal, .fx-sheet)[data-open] { animation: fx-modal-in var(--fx-dur-base) var(--fx-ease-spring) both; will-change: transform, opacity; }
  ${ON} .fx-sheet[data-open] { animation-name: fx-sheet-in; }
  ${ON} :where(.fx-modal, .fx-sheet)[data-closing] { animation: fx-modal-out var(--fx-dur-fast) var(--fx-ease-in-out) both; will-change: transform, opacity; }
  ${ON} ${MODAL} > * { animation: fx-rise var(--fx-dur-base) var(--fx-ease-spring) both; animation-delay: calc(var(--fx-i, 0) * var(--fx-stagger) + 40ms); }

  ${ON} .fx-icon-click:active, ${ON} .fx-icon-click.is-clicked { animation: fx-wiggle var(--fx-dur-slow) var(--fx-ease-bounce) 1; }
  ${ON} .fx-pill-live::before { animation: fx-breathe 3200ms var(--fx-ease-in-out) infinite alternate; }
  ${ON} .fx-pulse::after { animation: fx-pulse-ring 1800ms var(--fx-ease-out) infinite; }
  ${ON} .fx-skeleton::after { animation: fx-shimmer 1600ms linear infinite; }
  ${ON} ${PRG}::after { animation: fx-progress-sheen 2200ms var(--fx-ease-in-out) infinite; }
}

@keyframes fx-ambient-drift { from { transform: translate3d(-2%, 1%, 0) scale(1); } to { transform: translate3d(2%, -1%, 0) scale(1.06); } }
@keyframes fx-ring-sheen { from { opacity: 0.55; } to { opacity: 1; } }
@keyframes fx-modal-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes fx-sheet-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes fx-modal-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: scale(0.97); } }
@keyframes fx-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes fx-wiggle { 0% { transform: none; } 20% { transform: rotate(-12deg) scale(1.12); } 45% { transform: rotate(9deg) scale(1.08); } 70% { transform: rotate(-5deg); } 100% { transform: none; } }
@keyframes fx-breathe { from { opacity: 0.25; transform: scale(1); } to { opacity: 0.95; transform: scale(1.04); } }
@keyframes fx-pulse-ring { from { opacity: 0.7; transform: scale(1); } to { opacity: 0; transform: scale(2.8); } }
@keyframes fx-shimmer { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
@keyframes fx-progress-sheen { 0% { opacity: 0; transform: translateX(-100%); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateX(100%); } }
@keyframes fx-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes fx-fade-out { from { opacity: 1; } to { opacity: 0; } }
`;
}

function reduced(prefix: string): string {
    return `
  ${prefix} :where(${CLASSES.slice(7, -1)}, ${HOOKS.slice(7, -1)}, body)::before,
  ${prefix} :where(${CLASSES.slice(7, -1)}, ${HOOKS.slice(7, -1)}, body)::after,
  ${prefix} :where(${CLASSES.slice(7, -1)}, ${HOOKS.slice(7, -1)}) { animation: none !important; will-change: auto !important; }
  ${prefix} :where(${HOOKS.slice(7, -1)}):not(${PILL}) { transition-property: opacity !important; }
  ${prefix} ${PILL}::after, ${PILL}${prefix}::after { transition-property: opacity !important; }
  ${prefix} :where(.fx-modal, .fx-sheet)[data-open] { animation: fx-fade-in var(--fx-dur-fast) linear both !important; }
  ${prefix} :where(.fx-modal, .fx-sheet)[data-closing] { animation: fx-fade-out var(--fx-dur-fast) linear both !important; }`;
}

function accessibility(): string {
    return `
/* ---- accessibility and fallbacks ---- */
@media (prefers-reduced-motion: reduce) {${reduced(ON)}
}
${reduced(RM).replace(/^/, "")}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  [data-fx] { --fx-glass-bg: var(--fx-glass-solid); --fx-glass-bg-strong: var(--fx-glass-solid); }
}

@media (prefers-reduced-transparency: reduce) {
  [data-fx] { --fx-glass-bg: var(--fx-glass-solid); --fx-glass-bg-strong: var(--fx-glass-solid); --fx-blur-sm: 0px; --fx-blur-md: 0px; --fx-blur-lg: 0px; --fx-blur-ultra: 0px; --fx-saturate: 1; --fx-saturate-ultra: 1; }
  ${both(SURF, NF)}, ${both(BAR, NF)}, ${V} ${MODAL}${NF} { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; background-image: none !important; }
  ${V} body::before, ${V} body::after, ${V}::after, ${V}.fx-root::before, ${V}.fx-root::after { display: none !important; }
}

[data-fx][data-fx-tier="low"] {
  --fx-glass-bg: var(--fx-glass-solid); --fx-glass-bg-strong: var(--fx-glass-solid);
  --fx-blur-sm: 0px; --fx-blur-md: 0px; --fx-blur-lg: 0px; --fx-blur-ultra: 0px; --fx-saturate: 1; --fx-saturate-ultra: 1;
  --fx-scanline-opacity: 0; --fx-grain-opacity: 0;
}
[data-fx][data-fx-tier="low"] ${SURF}${NF}, [data-fx][data-fx-tier="low"] ${BAR}${NF}, [data-fx][data-fx-tier="low"] ${MODAL}${NF} {
  -webkit-backdrop-filter: none !important; backdrop-filter: none !important; background-image: none !important;
}
[data-fx][data-fx-tier="low"] body::before, [data-fx][data-fx-tier="low"] body::after, [data-fx][data-fx-tier="low"]::after, [data-fx][data-fx-tier="low"].fx-root::before, [data-fx][data-fx-tier="low"].fx-root::after {
  display: none !important;
}

[data-fx][data-platform="linux"], [data-platform="linux"] [data-fx], [data-fx].rad-linux, .rad-linux [data-fx] {
  --fx-blur-sm: 0px; --fx-blur-md: 0px; --fx-blur-lg: 0px; --fx-blur-ultra: 0px;
}
[data-fx][data-platform="linux"] ${SURF}${NF}, [data-fx][data-platform="linux"] ${BAR}${NF}, [data-fx][data-platform="linux"] ${MODAL}${NF}, [data-platform="linux"] ${both(SURF, NF)}, [data-platform="linux"] ${both(BAR, NF)}, [data-platform="linux"] ${V} ${MODAL}${NF}, [data-fx].rad-linux ${SURF}${NF}, [data-fx].rad-linux ${BAR}${NF}, [data-fx].rad-linux ${MODAL}${NF} {
  -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
}
[data-fx][data-platform="linux"] body, [data-fx].rad-linux body {
  box-shadow: none !important;
}
[data-fx][data-platform="linux"] body::after, [data-fx][data-platform="linux"]::after, [data-fx].rad-linux body::after, [data-fx].rad-linux::after {
  z-index: -1 !important; contain: strict;
}
[data-fx][data-platform="linux"] body::before, [data-fx].rad-linux body::before {
  contain: strict;
}
[data-fx][data-platform="linux"] ${SURF}:not(:hover)::after, [data-fx].rad-linux ${SURF}:not(:hover)::after {
  display: none !important;
}

@media (prefers-contrast: more) {
  [data-fx] { --fx-glass-bg: var(--fx-glass-solid); --fx-glass-bg-strong: var(--fx-glass-solid); --fx-glass-border: var(--theme-fg, currentColor);
    --fx-blur-sm: 0px; --fx-blur-md: 0px; --fx-blur-lg: 0px; --fx-saturate: 1;
    --fx-glow-soft: 0 0 0 0 transparent; --fx-glow-med: 0 0 0 0 transparent; --fx-glow-strong: 0 0 0 0 transparent;
    --fx-scanline-opacity: 0; --fx-grain-opacity: 0; --fx-ca-1: transparent; --fx-ca-2: transparent; --fx-ambient-1: transparent; --fx-ambient-2: transparent; }
  ${V} body::before, ${V} body::after, ${V}::after, ${V}.fx-root::before, ${V}.fx-root::after { display: none !important; }
  ${both(SURF, NF)}, ${both(BAR, NF)}, ${V} ${MODAL}${NF} { background-image: none !important; -webkit-backdrop-filter: none; backdrop-filter: none; border: 1px solid var(--theme-fg, currentColor) !important; }
  ${V} ${SURF}${NF}::after { display: none !important; }
  ${V} :where(h1, h2, .rad-heading, .rad-subheading, .fx-heading) { text-shadow: none !important; }
  ${V} :where(button, input, textarea, select, a[href], summary, [tabindex], .fx-button):focus-visible { outline-width: 3px !important; }
}

@media (forced-colors: active) {
  [data-fx] { forced-color-adjust: auto; --fx-blur-sm: 0px; --fx-blur-md: 0px; --fx-blur-lg: 0px; --fx-blur-ultra: 0px; }
  ${both(HOOKS, NF)}, ${both(BAR, NF)} { background: Canvas !important; background-image: none !important; color: CanvasText !important; border-color: CanvasText !important; box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; filter: none !important; }
  ${both(BTN, NF)} { background: ButtonFace !important; color: ButtonText !important; border-color: ButtonText !important; }
  ${both(INPUT, NF)} { background: Field !important; color: FieldText !important; border-color: ButtonText !important; }
  ${both(HOOKS, "::before")}, ${both(HOOKS, "::after")}, ${V} body::before, ${V} body::after, ${V}::after { display: none !important; }
  ${both(PILL, "[data-fx-pill]::after")} { display: block !important; background: Highlight; opacity: 1; }
  ${V} :where(h1, h2, .rad-heading, .rad-subheading, .fx-heading) { text-shadow: none !important; }
  ${V} :where(button, input, textarea, select, a[href], summary, [tabindex], .fx-button):focus-visible { outline: 2px solid Highlight !important; }
}
`;
}

let cached: string | undefined;

/** The whole layer. It is the same for every theme: the look comes from the `--fx-*` variables of the active theme. */
export function fxCss(): string {
    if (cached) return cached;
    cached = ["/* fx layer: futuristic themes, motion and interaction (src/shared/fxCss.ts) */", looks(), motion(), accessibility()]
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return cached;
}

export { joinSel };
