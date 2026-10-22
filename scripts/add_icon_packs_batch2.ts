// One-off generator: wires 18 new Icon Packs into the File Manager (options, glyphs, CSS, editor, settings, theme store).
// Idempotent: skips packs whose id is already present. Run: bun run scripts/add_icon_packs_batch2.ts
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

type Pack = {
  id: string; label: string; desc: string; preset: string;
  g: { folder: string; image: string; video: string; audio: string; pdf: string; doc: string; sheet: string; slide: string; archive: string; code: string; text: string; exec: string; disk: string; font: string; file: string };
  topics: string; // extra topic overrides source
  css: { bg: string; border: string; radius: string; shadow: string; padding?: string };
  editorLabel: string;
};

const P: Pack[] = [
  { id: "classic_os_win95", label: "🖥️ Classic OS: Win95, Mac OS 9 & Workbench", desc: "Beveled 16-color desktop icons, floppy disks and system-folder tiles from the 90s GUI era", preset: "studio",
    g: { folder: "📁", image: "🖼️", video: "📼", audio: "🔊", pdf: "📕", doc: "📄", sheet: "📊", slide: "📽️", archive: "🗜️", code: "📟", text: "📝", exec: "💾", disk: "💽", font: "🔤", file: "📃" },
    topics: `docs: "📁", pictures: "🖼️", music: "🔊", video: "📼", downloads: "💾", home: "🖥️"`,
    css: { bg: "linear-gradient(135deg, #dfdfdf, #c0c0c0)", border: "2px outset #ffffff", radius: "0", shadow: "1px 1px 0 #404040", padding: "0 4px" }, editorLabel: "🖥️ Classic OS Desktop" },
  { id: "handheld_gameboy", label: "🎮 Handheld Game Boy & NES Cartridge", desc: "Four-shade green LCD glyphs, cartridge tiles and chunky d-pad action buttons", preset: "cyber",
    g: { folder: "📂", image: "👾", video: "📺", audio: "🎵", pdf: "📕", doc: "📜", sheet: "🔢", slide: "🃏", archive: "📦", code: "🕹️", text: "💬", exec: "▶️", disk: "💾", font: "🔠", file: "🟩" },
    topics: `games: "🎮", roms: "👾", music: "🎵", downloads: "📥"`,
    css: { bg: "linear-gradient(180deg, #9bbc0f, #8bac0f 60%, #306230)", border: "2px solid #0f380f", radius: "3px", shadow: "2px 2px 0 #0f380f" }, editorLabel: "🎮 Game Boy LCD" },
  { id: "art_deco_gold", label: "🏛️ Art Deco Gilded Geometry", desc: "1920s black-and-gold fan motifs, stepped skyscraper folders and sunburst seals", preset: "royal",
    g: { folder: "🗂️", image: "🖼️", video: "🎞️", audio: "🎺", pdf: "📕", doc: "📜", sheet: "📈", slide: "🎭", archive: "📦", code: "💠", text: "🖋️", exec: "⚜️", disk: "💿", font: "🔱", file: "📄" },
    topics: `docs: "🗂️", pictures: "🖼️", music: "🎺", home: "🏙️"`,
    css: { bg: "linear-gradient(135deg, #111111, #2a2210)", border: "1px solid #d4af37", radius: "2px", shadow: "0 0 0 1px #111, 0 0 0 2px #d4af37" }, editorLabel: "🏛️ Art Deco Gold" },
  { id: "bauhaus_primary", label: "🔺 Bauhaus Primary Shapes", desc: "Red, yellow and blue geometric circles, squares and triangles with strict grid alignment", preset: "studio",
    g: { folder: "📁", image: "🔵", video: "🔺", audio: "🟡", pdf: "📕", doc: "⬜", sheet: "🟦", slide: "🔶", archive: "📦", code: "◼️", text: "▫️", exec: "▶️", disk: "⚫", font: "🅰️", file: "⬜" },
    topics: `docs: "📁", pictures: "🔵", music: "🟡", video: "🔺"`,
    css: { bg: "#f2e8cf", border: "2px solid #111111", radius: "0", shadow: "3px 3px 0 #d62828" }, editorLabel: "🔺 Bauhaus" },
  { id: "memphis_80s_pop", label: "🎉 Memphis 80s Squiggle Pop", desc: "Confetti triangles, squiggles and pastel terrazzo tiles in clashing neon", preset: "cyber",
    g: { folder: "🗂️", image: "🌈", video: "📹", audio: "🎧", pdf: "📕", doc: "📃", sheet: "📊", slide: "🎪", archive: "📦", code: "💻", text: "✏️", exec: "⚡", disk: "💿", font: "🔤", file: "📄" },
    topics: `docs: "🗂️", pictures: "🌈", music: "🎧", games: "🎪"`,
    css: { bg: "linear-gradient(135deg, #ff9ff3, #feca57 50%, #48dbfb)", border: "2px dashed #1e1e1e", radius: "8px", shadow: "3px 3px 0 #ff6b6b" }, editorLabel: "🎉 Memphis 80s" },
  { id: "neo_brutalist_flat", label: "◼️ Neo-Brutalist Thick Outline", desc: "Flat saturated blocks, 3px black outlines and hard offset shadows", preset: "studio",
    g: { folder: "📁", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📄", sheet: "📊", slide: "📽️", archive: "📦", code: "⌨️", text: "📝", exec: "⚙️", disk: "💽", font: "🔤", file: "📄" },
    topics: `docs: "📁", pictures: "🖼️", music: "🎵"`,
    css: { bg: "#ffe14d", border: "3px solid #000000", radius: "4px", shadow: "4px 4px 0 #000000" }, editorLabel: "◼️ Neo-Brutalist" },
  { id: "ukiyoe_woodblock", label: "🌊 Ukiyo-e Woodblock Print", desc: "Indigo great-wave folders, washi file sheets and vermilion hanko seals", preset: "macos",
    g: { folder: "📂", image: "🗻", video: "🎎", audio: "🎐", pdf: "📕", doc: "📜", sheet: "🈷️", slide: "🎴", archive: "📦", code: "⛩️", text: "🖌️", exec: "🗡️", disk: "💿", font: "🈁", file: "📃" },
    topics: `docs: "📂", pictures: "🗻", music: "🎐", home: "🏯"`,
    css: { bg: "linear-gradient(180deg, #f4ecd8, #dfd3b0)", border: "1px solid #1d3557", radius: "3px", shadow: "2px 2px 0 #c1121f" }, editorLabel: "🌊 Ukiyo-e" },
  { id: "pop_art_comic", label: "💥 Pop-Art Comic Halftone", desc: "Ben-Day halftone dots, speech-bubble badges and bold comic-panel borders", preset: "cyber",
    g: { folder: "📁", image: "📸", video: "🎬", audio: "🔊", pdf: "📕", doc: "💬", sheet: "📊", slide: "🗯️", archive: "📦", code: "⚡", text: "💭", exec: "💣", disk: "💿", font: "🔤", file: "📄" },
    topics: `docs: "📁", pictures: "📸", music: "🔊", games: "🦸"`,
    css: { bg: "radial-gradient(circle, #ff3b3b 20%, #ffe600 21%)", border: "3px solid #000000", radius: "6px", shadow: "3px 3px 0 #0057ff" }, editorLabel: "💥 Pop-Art Comic" },
  { id: "sketch_chalkboard", label: "✏️ Hand-Drawn Sketch & Chalkboard", desc: "Wobbly chalk-line folders and pencil-sketch file glyphs on slate", preset: "studio",
    g: { folder: "📂", image: "🖍️", video: "🎞️", audio: "🎶", pdf: "📕", doc: "📝", sheet: "🧮", slide: "🪧", archive: "📦", code: "✍️", text: "✏️", exec: "🪄", disk: "💿", font: "🔡", file: "📄" },
    topics: `docs: "📂", pictures: "🖍️", music: "🎶"`,
    css: { bg: "#2f3e36", border: "2px dashed #e8e8e0", radius: "10px 4px 12px 5px", shadow: "none" }, editorLabel: "✏️ Chalkboard Sketch" },
  { id: "clay_soft_3d", label: "🧸 Claymation & Soft Clay 3D", desc: "Inflated matte clay folders with thumbprint texture and pastel puffy buttons", preset: "macos",
    g: { folder: "🗂️", image: "🌼", video: "🍿", audio: "🎈", pdf: "📕", doc: "🧁", sheet: "🍬", slide: "🎠", archive: "📦", code: "🧩", text: "🍪", exec: "🚀", disk: "🍩", font: "🔤", file: "🍞" },
    topics: `docs: "🗂️", pictures: "🌼", music: "🎈", games: "🧩"`,
    css: { bg: "radial-gradient(circle at 30% 25%, #ffd6e0, #f9a8c0)", border: "none", radius: "999px", shadow: "inset -3px -4px 6px rgba(0,0,0,0.18), inset 3px 3px 6px rgba(255,255,255,0.7), 0 3px 6px rgba(0,0,0,0.2)", padding: "1px 7px" }, editorLabel: "🧸 Soft Clay 3D" },
  { id: "origami_papercraft", label: "🦢 Origami & Layered Papercraft", desc: "Folded-crease paper cranes, layered cut-paper folders and washi-tape tabs", preset: "macos",
    g: { folder: "🗂️", image: "🦋", video: "🎏", audio: "🎐", pdf: "📕", doc: "📃", sheet: "🗒️", slide: "🪁", archive: "📦", code: "🧩", text: "✂️", exec: "🦢", disk: "💿", font: "🔤", file: "📄" },
    topics: `docs: "🗂️", pictures: "🦋", music: "🎐"`,
    css: { bg: "linear-gradient(135deg, #ffffff 50%, #e6e6fa 50%)", border: "1px solid #b8b8d8", radius: "2px", shadow: "2px 3px 0 rgba(0,0,0,0.18)" }, editorLabel: "🦢 Origami Paper" },
  { id: "lowpoly_isometric", label: "🔷 Low-Poly Isometric Blocks", desc: "Faceted low-polygon crystals and isometric voxel folders with flat-shaded faces", preset: "fluent",
    g: { folder: "📂", image: "🏔️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄", sheet: "📊", slide: "🔶", archive: "📦", code: "🔷", text: "📝", exec: "🔺", disk: "💽", font: "🔤", file: "◽" },
    topics: `docs: "📂", pictures: "🏔️", music: "🎵"`,
    css: { bg: "linear-gradient(135deg, #7ad7f0 50%, #3a8fd9 50%)", border: "1px solid #1c4e80", radius: "2px", shadow: "2px 2px 0 #1c4e80" }, editorLabel: "🔷 Low-Poly Isometric" },
  { id: "thin_line_duotone", label: "〰️ Thin Line & Duotone Pro", desc: "Hairline 1px outline glyphs tinted with your theme's accent and secondary colors", preset: "fluent",
    g: { folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📄", doc: "📄", sheet: "📊", slide: "📽️", archive: "🗜️", code: "⌨️", text: "📝", exec: "⚙️", disk: "💽", font: "🔤", file: "📄" },
    topics: `docs: "📁", pictures: "🖼️"`,
    css: { bg: "transparent", border: "1px solid color-mix(in srgb, var(--accent, #7aa2f7) 70%, transparent)", radius: "6px", shadow: "none" }, editorLabel: "〰️ Thin Line Duotone" },
  { id: "mono_high_contrast", label: "◐ High-Contrast Monochrome & E-Ink", desc: "Accessibility-first pure black/white glyphs with heavy outlines and no gradients, ideal for e-ink", preset: "studio",
    g: { folder: "📁", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📄", sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️", disk: "💿", font: "🔤", file: "📄" },
    topics: `docs: "📁", pictures: "🖼️"`,
    css: { bg: "#ffffff", border: "2px solid #000000", radius: "0", shadow: "none" }, editorLabel: "◐ High-Contrast Mono" },
  { id: "terminal_ascii_tui", label: "⌨️ Terminal ASCII & TUI Box-Drawing", desc: "Monospace [DIR] and [FILE] tags with box-drawing frames in phosphor green on black", preset: "cyber",
    g: { folder: "📂", image: "🖼️", video: "📼", audio: "🔈", pdf: "📕", doc: "📄", sheet: "🧮", slide: "📽️", archive: "🗜️", code: "⌨️", text: "📝", exec: "▶️", disk: "💾", font: "🔤", file: "📃" },
    topics: `docs: "📂", downloads: "📥"`,
    css: { bg: "#000000", border: "1px solid #33ff66", radius: "0", shadow: "0 0 6px rgba(51,255,102,0.45)", padding: "0 5px" }, editorLabel: "⌨️ Terminal TUI" },
  { id: "deep_sea_biolum", label: "🐙 Deep-Sea Bioluminescence", desc: "Abyssal jellyfish folders, anglerfish lure badges and glowing plankton file plates", preset: "cryo",
    g: { folder: "🗂️", image: "🐠", video: "🐋", audio: "🐚", pdf: "📕", doc: "🐡", sheet: "🪸", slide: "🦈", archive: "📦", code: "🦐", text: "🦀", exec: "⚓", disk: "🫧", font: "🐟", file: "🐚" },
    topics: `docs: "🗂️", pictures: "🐠", music: "🐚", home: "🌊"`,
    css: { bg: "radial-gradient(circle at 40% 30%, #0a4d68, #021b2b)", border: "1px solid #00e5ff", radius: "999px", shadow: "0 0 10px rgba(0,229,255,0.55)", padding: "1px 6px" }, editorLabel: "🐙 Deep Sea Glow" },
  { id: "desert_sandstone", label: "🏜️ Desert Sandstone & Canyon", desc: "Wind-carved sandstone folders, terracotta tablets and cactus-bloom accents", preset: "inferno",
    g: { folder: "📂", image: "🌵", video: "🐪", audio: "🪘", pdf: "📕", doc: "📜", sheet: "🧱", slide: "🌄", archive: "📦", code: "🔥", text: "🪶", exec: "☀️", disk: "💿", font: "🔤", file: "📃" },
    topics: `docs: "📂", pictures: "🌵", music: "🪘", home: "🛖"`,
    css: { bg: "linear-gradient(180deg, #e9c46a, #e76f51)", border: "1px solid #7f4f24", radius: "6px", shadow: "2px 2px 0 #7f4f24" }, editorLabel: "🏜️ Desert Sandstone" },
  { id: "cottagecore_botanical", label: "🌿 Cottagecore Botanical Herbarium", desc: "Pressed-flower folders, linen file tags and watercolor botanical badges", preset: "macos",
    g: { folder: "🗂️", image: "🌸", video: "🎞️", audio: "🐦", pdf: "📕", doc: "🍃", sheet: "🌻", slide: "🌷", archive: "📦", code: "🍄", text: "🪶", exec: "🌱", disk: "🫙", font: "🔤", file: "🍂" },
    topics: `docs: "🗂️", pictures: "🌸", music: "🐦", home: "🏡"`,
    css: { bg: "linear-gradient(135deg, #f3ead8, #d9e4c8)", border: "1px solid #7a9a6a", radius: "12px", shadow: "0 2px 4px rgba(90,120,80,0.35)" }, editorLabel: "🌿 Cottagecore Botanical" },
];

const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const write = (p: string, s: string) => writeFileSync(join(root, p), s);
const eol = (s: string) => (s.includes("\r\n") ? "\r\n" : "\n");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const fresh = (src: string) => P.filter((p) => !src.includes(`"${p.id}"`) && !src.includes(`${p.id}:`) && !src.includes(`[data-icon-pack="${p.id}"]`));

// 1. themes.js options
{
  const f = "resources/file_manager/ui/themes.js"; let s = read(f); const E = eol(s);
  const list = P.filter((p) => !s.includes(`id: "${p.id}"`));
  if (list.length) {
    const anchor = s.indexOf('{ id: "quantum_superconductor"'); const end = s.indexOf(E, anchor);
    s = s.slice(0, end) + list.map((p) => `${E}  { id: "${p.id}", label: "${esc(p.label)}", desc: "${esc(p.desc)}" },`).join("") + s.slice(end);
    write(f, s);
  }
}
// 2. dom.js glyphs
{
  const f = "resources/file_manager/ui/dom.js"; let s = read(f); const E = eol(s);
  const list = P.filter((p) => !s.includes(`ICON_PACK_GLYPHS.${p.id} =`));
  if (list.length) {
    const a = "ICON_PACK_GLYPHS.arcane_glyphs = ICON_PACK_GLYPHS.xenotech_2126;"; const i = s.indexOf(a) + a.length;
    const block = list.map((p) => {
      const g = p.g;
      return `${E}ICON_PACK_GLYPHS.${p.id} = {${E}  folder: "${g.folder}", image: "${g.image}", video: "${g.video}", audio: "${g.audio}", pdf: "${g.pdf}", doc: "${g.doc}",${E}  sheet: "${g.sheet}", slide: "${g.slide}", archive: "${g.archive}", code: "${g.code}", text: "${g.text}", exec: "${g.exec}",${E}  disk: "${g.disk}", font: "${g.font}", file: "${g.file}", buttonPreset: "${p.preset}", useExact: true,${E}  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, ${p.topics} },${E}};`;
    }).join("");
    s = s.slice(0, i) + block + s.slice(i); write(f, s);
  }
}
// 3. CSS
{
  const f = "resources/file_manager/ui/themeEffects.css"; let s = read(f); const E = eol(s);
  const list = P.filter((p) => !s.includes(`"${p.id}"`));
  if (list.length) {
    s += E + "/* ============================================================================" + E + " * 🎭 ICON PACK BATCH 2: classic OS, art movements, render styles & accessibility" + E + " * ============================================================================ */" + E;
    for (const p of list) {
      s += `${E}/* ${p.label} (${p.id}) */${E}:root:is([data-icon-pack="${p.id}"], [data-fx-icon-pack="${p.id}"]) :is(.c-icon, .t-icon, .info-big-icon, [data-btn-icon]) {${E}  display: inline-flex;${E}  align-items: center;${E}  justify-content: center;${E}  border-radius: ${p.css.radius};${E}  padding: ${p.css.padding ?? "1px 6px"};${E}  background: ${p.css.bg};${E}  border: ${p.css.border};${E}  box-shadow: ${p.css.shadow};${E}}${E}`;
    }
    write(f, s);
  }
}
// 4. themeEditor.js
{
  const f = "resources/file_manager/ui/themeEditor.js"; let s = read(f); const E = eol(s);
  const list = P.filter((p) => !s.includes(`"${p.id}"`));
  if (list.length) {
    const a = '      "quantum_superconductor",'; const i = s.indexOf(a); if (i < 0) throw new Error("editor list anchor");
    s = s.slice(0, i + a.length) + list.map((p) => `${E}      "${p.id}",`).join("") + s.slice(i + a.length);
    const b = '    ["cyberdeck_matrix_hud", '; const j = s.indexOf(b); const je = s.indexOf(E, j);
    s = s.slice(0, je) + list.map((p) => `${E}    ["${p.id}", "${esc(p.editorLabel)}"],`).join("") + s.slice(je);
    write(f, s);
  }
}
// 5. server-side allow-lists
for (const f of ["src/features/filemanager/fmSettings.ts", "src/features/filemanager/fmThemeStore.ts"]) {
  let s = read(f); const list = P.filter((p) => !s.includes(`"${p.id}"`));
  if (list.length) {
    const add = list.map((p) => `"${p.id}"`).join(", ");
    const n = s.split('"quantum_superconductor"]').length - 1; if (n < 1) throw new Error("allow-list anchor " + f);
    s = s.split('"quantum_superconductor"]').join(`"quantum_superconductor", ${add}]`); write(f, s);
  }
}
console.log("ok", P.length);
