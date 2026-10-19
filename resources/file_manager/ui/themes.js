// Color themes for the page: applying one, and the gallery to choose from. The server turns each theme of the
// SimpleGUI table into this page's color variables (and checks that every text and background pair is readable).
import { ApiError, call } from "./api.js";
import { formatAtmosphereLabel, normalizeAtmosphereSpec, parseAtmosphereIds } from "./atmosphereCatalog.js";
import { applyAtmosphere, cycleAtmosphere, effectiveAtmosphere, savedAtmospherePresets, triggerReactiveImpulse } from "./atmosphereFx.js";
import { copyToClipboard, flashCopied, readFromClipboard } from "./copyclip.js";
import { openDialog } from "./dialogs.js";
import { buttonIconFor, debounce, h, iconForEntry, syncVisibleIcons } from "./dom.js";
import { toast } from "./menus.js";
import { refresh, saveSettings } from "./nav.js";
import { currentPath, emit, on, state } from "./state.js";

/** Interactive File Manager UI element shaders for folders, toolbars, breadcrumbs, and rows. */
export const UI_ELEMENT_FX_OPTIONS = [
  { id: "off", label: "⏹️ Off", desc: "Standard clean File Manager folders and toolbars" },
  { id: "auto", label: "✨ Follow Theme", desc: "Automatically activate the theme's signature folder & toolbar shader" },
  { id: "tahoe_glass_folders", label: "🍎 macOS Tahoe 3D Glass Folders", desc: "Sculpted 3D translucent Liquid Glass regular folders with Display-P3 specular rims & gallery picture frames" },
  { id: "fluent_mica_folders", label: "🪟 Win 11 Fluent 3D Folders", desc: "Layered Windows 11 Fluent 3D amber/cobalt regular folders, DirectX 12 Mica cards & framed photo tiles" },
  { id: "xdr_titanium_folders", label: "💻 M4 Max / RTX XDR Titanium Folders", desc: "Space-Black machined titanium regular folders with 1600-nit XDR rim lighting & 8K RAW studio picture plates" },
  { id: "google_material_folders", label: "✨ Google Material 3 & Gemini 3D Folders", desc: "Sculpted Material 3 Expressive squircle folders with 4-color Gemini AI sparkle refraction & tonal surface elevation" },
  { id: "cupertino_ceramic_bevel", label: "🍎 Cupertino Ceramic & Titanium Bevel", desc: "Apple HIG continuous-squircle ceramic folders & sheets with 0.5px specular hairline rims and multi-stop ambient shadows" },
  { id: "swiss_sapphire_chronograph", label: "⌚ Swiss Horology Sapphire & Rose Gold", desc: "Haute-horlogerie anti-reflective sapphire crystal folders with rose-gold guilloché bevels and chronograph indices" },
  { id: "teenage_field_anodized", label: "🎛️ Swedish Field Synth Anodized Aluminum", desc: "Bead-blasted CNC anodized aluminum folders & tactile industrial keycap rows with international-orange accents" },
  { id: "blueprint_cad_cyanotype", label: "📐 Architectural Cyanotype & CAD Grid", desc: "Precision Prussian-blue cyanotype drafting folders with 0.5px micrometer vernier hairlines and technical callouts" },
  { id: "kyoto_washi_sumi", label: "🎋 Kyoto Washi Paper & Sumi Ink Seal", desc: "Handmade mulberry washi paper folders with warm cedar woodgrain borders and vermilion hanko seal accents" },
  { id: "carbon_kevlar_weave", label: "🏎️ Autoclave Forged Carbon & Alcantara", desc: "Dry-autoclave 3K twill carbon fiber folders with titanium countersunk fasteners and racing telemetry accents" },
  { id: "fire_folders", label: "🔥 Folders & Toolbars on Fire", desc: "Blazing molten flames, rising embers, and heat-shimmer borders on folders & toolbars" },
  { id: "slime_drip", label: "🧪 Dripping Slime", desc: "Glowing radioactive neon-green slime dripping from folders, toolbars & breadcrumbs" },
  { id: "storm_wind", label: "🌪️ Storm Wind, Leaves & Rain", desc: "Hurricane wind gusts buffeting folders & toolbars with clinging autumn leaves & rain streaks" },
  { id: "cryo_frost", label: "🧊 Cryo-Icicles & Frost", desc: "Frozen glacier icicles hanging off toolbars and folders with crystalline diamond rime" },
  { id: "tesla_arcs", label: "⚡ Toolbar & Folder Tesla Arcs", desc: "High-voltage violet-cyan plasma filaments crackling across folder rows and toolbars" },
  { id: "mercury_chrome", label: "💧 Liquid Mercury Chrome", desc: "Mirror-polished liquid metal chrome bevels and sliding mercury droplets" },
  { id: "holo_glitch", label: "📺 Cyber Holo-Glitch", desc: "Chromatic RGB hologram split, laser scanbars, and tactical HUD reticles on folders" },
  { id: "void_tentacles", label: "🦑 2126 Eldritch Void Spores", desc: "Bioluminescent abyssal tendrils and floating quantum spores around folders & icons" },
  { id: "kaleidoscope_prism", label: "🌈 Kaleidoscope Prism & Mandala", desc: "Animated prismatic rainbow borders, sacred fractal geometry & refracted folder cards" },
  { id: "lava_wax", label: "🫧 1969 Lava-Lamp Wax Blobs", desc: "Groovy morphing molten orange & magenta wax blobs undulating across folders & toolbars" },
  { id: "acid_warp", label: "🌀 Op-Art Moiré & Acid Warp", desc: "Hypnotic Op-Art wave interference, chromatic RGB split & UV blacklight pulse" },
  { id: "oil_slick_chrome", label: "🛢️ Iridescent Oil-Slick Dichroic", desc: "Thin-film rainbow petrol iridescence and dichroic glass shimmer on folders & toolbars" },
  { id: "shroom_spores", label: "🍄 Bioluminescent Mycelium Spores", desc: "Ultraviolet fungal spore halos and pulsing neon-cyan/violet bioluminescent folder rows" },
  { id: "holiday_festive_glow", label: "🎄 US Holiday Festive Fairy-Light Glow", desc: "Warm C9 fairy-light bokeh, festive ribbon rims, and holiday sparkle on folders & toolbars" },
  { id: "nerd_arcane_runes", label: "🎲 D&D Arcane Grimoire & d20 Runes", desc: "Gold-tooled dragonhide double-borders, eldritch spell runes & polyhedral d20 glow on folders" },
  { id: "nerd_lcars_hud", label: "🖖 Starfleet LCARS & Tactical HUD", desc: "24th-century swept-elbow LCARS pill bars, tactical telemetry brackets & holocron scanlines" },
  { id: "horror_blood_moon", label: "🧛 Gothic Blood Moon & Crimson Crypt", desc: "Eclipsed blood-moon crimson vignette, gargoyle stone bevels & candlelit crypt shadows" },
  { id: "horror_vhs_static", label: "📼 1999 Found-Footage VHS Glitch", desc: "Hi8 magnetic tracking-head static, RGB chromatic bleed & rusted chainlink borders" },
  { id: "realworld_mahogany_brass", label: "🕰️ Hand-Carved Mahogany, Brass & Lacquer", desc: "Tactile woodgrain inlay, polished brass bevels, saddle leather & maki-e urushi lacquer folders" },
  { id: "realworld_stained_glass", label: "🪟 Cathedral Stained Glass & Murano Crystal", desc: "Soldered lead-came jewel glass panels and hand-blown Venetian Murano crystal refraction" },
  { id: "screen_melt_ooze", label: "🫠 Screen-Melting Dalí & Wax Drip", desc: "Surrealist screen-melting distortion: sagging folders, files & toolbars with viscous dripping droplets and SVG displacement" },
  { id: "molten_lava_melt", label: "🌋 Molten Glass & Magma Melt", desc: "Superheated furnace glass melt: glowing orange-crimson thermal sag and heat-mirage wave distortion across folders & files" },
  { id: "crt_magnetic_warp", label: "🧲 CRT Magnet De-Gauss Distortion", desc: "Magnetic field screen warp with RGB chromatic separation, de-gaussing wave bend, and scanline tear" },
  { id: "fever_dream_ripple", label: "🌊 Hallucinogenic Liquid Ripple", desc: "Refractive underwater & desert mirage displacement ripples gently bending folders, files, and toolbars" },
  { id: "godmode_omega_halo", label: "🌌 God-Mode Omega Singularity Halo", desc: "Post-singularity 24K celestial gold & violet event-horizon refraction with rotating crown halos on folders & toolbars" },
  { id: "godmode_photonic_crystal", label: "💎 God-Mode 3099 Photonic Metamaterial", desc: "Negative-index photonic crystal folders with Display-P3 dichroic dispersion, laser caustics & zero-latency refraction" },
  { id: "godmode_dyson_lattice", label: "☀️ God-Mode Matrioshka Dyson Lattice", desc: "Kardashev Type-II stellar megastructure hex-collector bevels, solar-corona plasma filaments & computronium waveguides" },
  { id: "godmode_chrono_crystal", label: "⏳ God-Mode Chrono-Crystalline Vault", desc: "Time-dilated horological sapphire crystal folders with golden astrolabe indices & retrocausal phase shimmer" },
  { id: "godmode_neural_synapse", label: "🧠 God-Mode Akashic Neural Noosphere", desc: "Living bioluminescent synaptic dendrite borders, planetary consciousness pulses & emerald-cyan axon waveguides" },
  { id: "godmode_zero_point_arc", label: "⚛️ God-Mode Zero-Point Vacuum Genesis", desc: "Casimir-cavity quantum vacuum energy arcs, ultraviolet Cherenkov rim glow & sub-atomic femtotech containment" },
];

/** Custom Icon Pack styles that transform folder and file icons across the File Manager. */
export const ICON_PACK_OPTIONS = [
  { id: "default", label: "📁 Standard", desc: "Classic system file & folder icons (260+ semantic system icons & 68 UI button icons)" },
  { id: "macos_tahoe_3d", label: "🍎 macOS Tahoe 3D & Pictures", desc: "High-end macOS Tahoe 3D regular folders with semantic topic badges & studio-framed picture icons" },
  { id: "win11_fluent_pro", label: "🪟 Win 11 Fluent 3D Pro", desc: "Layered Windows 11 Fluent 3D folders, framed gallery pictures & DirectX 12 workstation glyphs" },
  { id: "pro_studio_xdr", label: "💻 M4 Max / RTX Studio XDR", desc: "Pro Display XDR titanium regular folders, 8K RAW camera picture plates & cinema production icons" },
  { id: "hdr_photo_studio", label: "📸 8K HDR Photo & Cinema", desc: "Color-calibrated darkroom & cinema suite with gallery-framed pictures, 35mm contact sheets & lens icons" },
  { id: "linux_papirus_pro", label: "🐧 Linux Papirus HiDPI", desc: "Crisp KDE Breeze & Papirus HiDPI regular folders, developer topic badges & workstation picture tiles" },
  { id: "nordic_minimal", label: "🏛️ Studio Architect Minimal", desc: "Tactile 3D paper-and-glass regular folders, architectural picture frames & clean daylight glyphs" },
  { id: "google_material_3d", label: "✨ Google Material 3 & Gemini 3D", desc: "Google Material 3 Expressive & Gemini 3D semantic folders, AI/Cloud developer badges & 260+ system glyphs" },
  { id: "cupertino_hig_studio", label: "🍎 Cupertino HIG Ceramic Studio", desc: "Apple Human Interface Guidelines squircle 3D folders & crisp document sheets with Display-P3 specular rims" },
  { id: "swiss_horology_gold", label: "⌚ Swiss Horology & Sapphire", desc: "Chronograph sapphire-crystal folders & precision ledger documents with brushed rose-gold indices" },
  { id: "teenage_field_synth", label: "🎛️ Swedish Field Synthesizer", desc: "Tactile anodized aluminum folders & studio stem files inspired by precision portable hardware synths" },
  { id: "blueprint_cad_pro", label: "📐 Architectural CAD & Cyanotype", desc: "Precision engineering blueprint folders & specification sheets with micrometer scale markings" },
  { id: "kyoto_zen_ink", label: "🎋 Kyoto Washi & Sumi Ink", desc: "Artisan mulberry paper folders & calligraphy scroll documents with vermilion hanko seal badges" },
  { id: "carbon_aerospace", label: "🏎️ Forged Carbon & Telemetry", desc: "Aerospace carbon-weave folders & flight-deck telemetry files with titanium hardware accents" },
  { id: "inferno", label: "🔥 Blazing Inferno", desc: "Molten fire chests, lightning code glyphs, and ember-shielded icons" },
  { id: "slime", label: "🧪 Toxic Slime-Drip", desc: "Bio-vat flasks, DNA helices, and dripping radioactive gel capsules" },
  { id: "storm_tempest", label: "🌪️ Storm & Cyclone", desc: "Tornado vortex folders, lightning scripts, and wind-swept barometric badges" },
  { id: "neon_cyber", label: "🔮 Neon Cyber HUD", desc: "Holographic diamond nodes and glowing cyan/magenta wireframe reticles" },
  { id: "liquid_gems", label: "💎 3D Liquid Gems", desc: "Faceted 3D crystal jewels with specular macOS Tahoe refraction" },
  { id: "cryo_crystal", label: "❄️ Cryo-Crystal", desc: "Sub-zero ice cubes, snowflake code glyphs, and frosted glacier prisms" },
  { id: "retro_pixel", label: "👾 Retro Arcade", desc: "16-bit arcade invaders, joystick scripts, and bevelled cartridge tiles" },
  { id: "xenotech_2126", label: "🛸 2126 Xenotech", desc: "Hyper-dimensional UFO vaults, atomic code cores, and rotating hex-glyphs" },
  { id: "psychedelic_trip", label: "🍄 Psychedelic Kaleidoscope", desc: "Sacred lotus mandalas, bioluminescent mushrooms, third-eye crystals & rainbow prisms" },
  { id: "lava_groovy", label: "🫧 1969 Lava Lamp & Vinyl", desc: "Groovy lava-wax orbs, disco mirrors, peace badges, sunflowers & analog vinyl glyphs" },
  { id: "op_art_illusion", label: "🌀 Op-Art Hypnotic Portal", desc: "Kinetic vortex spirals, Moiré infinity loops, optical eyes & non-Euclidean prisms" },
  { id: "us_holidays_festive", label: "🎄 US Holidays Festive", desc: "Festive 3D folders & files with holiday ribbon trim, fireworks pictures & Christmas glow" },
  { id: "nerd_rpg_arcane", label: "🎲 Nerd RPG & Grimoire", desc: "Arcane gilded 3D folders & scroll files with D&D d20 filigree & spellbook illumination" },
  { id: "nerd_scifi_fleet", label: "🖖 Nerd Starfleet & Sci-Fi", desc: "Starfleet LCARS 3D folders & tactical data-pad files with bridge telemetry accents" },
  { id: "nerd_hacker_retro", label: "🕹️ Nerd 16-Bit & DEFCON", desc: "Retro cartridge 3D folders & mainframe files with pixel bevels & cipher glow" },
  { id: "horror_crypt", label: "🧛 Horror Crypt & Nightmare", desc: "Gothic obsidian 3D folders & blood-ink vellum files with candlelit crimson bevels" },
  { id: "realworld_objects", label: "🕰️ Real-World Tactile Objects", desc: "Hand-rubbed mahogany & brass 3D folders and linen parchment files with physical bevels" },
  { id: "godmode_celestial", label: "🌌 God-Mode Celestial Crown", desc: "Post-singularity 3D folders & files crowned with 24K celestial gold halos & event-horizon optics" },
  { id: "godmode_photonic", label: "💎 God-Mode 3099 Photonic", desc: "Year 3099 negative-index photonic crystal 3D folders & holographic light-field document plates" },
  { id: "godmode_quantum", label: "⚛️ God-Mode Quantum Forge", desc: "Kardashev Dyson & femtotech quantum-lattice 3D folders with zero-point Casimir containment badges" },
  { id: "godmode_chrono", label: "⏳ God-Mode Chrono & Noosphere", desc: "Time-crystal horological 3D folders & Akashic neural noosphere files with retrocausal phase seals" },
  { id: "godmode_omni_pantheon", label: "⚡ God-Mode Omni-Pantheon Supreme", desc: "The ultimate all-in-one 3D icon & button pack with 260+ semantic folder/file badges & prismatic toolbar plates" },
  { id: "macos_sequoia_hig", label: "🍎 macOS Sequoia & Tahoe Super-Folders", desc: "Apple HIG sky-blue 3D embossed folders, Finder QuickAction toolbar buttons & SF-inspired file plates" },
  { id: "apple_vision_glass_3d", label: "🥽 Apple visionOS Spatial Glass 3D", desc: "Spatial computing specular glass pills, volumetric depth orbs & optical spatial toolbar buttons" },
  { id: "dev_polyglot_pro", label: "🧑‍💻 Polyglot Dev, AI & DevOps Master", desc: "Precision Rust, Bun, Python, Kubernetes, Docker, AI/LLM & terminal action icons for engineering workstations" },
  { id: "creative_cinema_8k", label: "🎬 8K Cinema, DAW Audio & 3D Studio", desc: "Master colorist, DaVinci/Premiere NLE, Ableton/Logic synth & Blender/CAD 3D production icons & buttons" },
  { id: "cyberdeck_matrix_hud", label: "📟 Cyberdeck Matrix & Netrunner HUD", desc: "Phosphor green/cyan netrunner deck glyphs, ICE-breaker toolbar buttons & encrypted data shards" },
  { id: "royal_24k_gold_obsidian", label: "👑 24K Royal Gold & Obsidian Vault", desc: "Sovereign 24K gold bullion folders, diamond-cut file seals & crown-gilded toolbar action buttons" },
  { id: "anime_mecha_neon", label: "🤖 Mecha Evangelion & Anime Studio", desc: "NERV tactical hex badges, mecha/anime studio folders & Tokyo-3 neon toolbar action buttons" },
  { id: "steampunk_brass_clockwork", label: "⚙️ Steampunk Brass & Clockwork", desc: "Victorian brass gears, pressure-gauge 3D folders, telegraph scrolls & clockwork action buttons" },
  { id: "bioluminescent_eden", label: "🌿 Solarpunk Bioluminescent Eden", desc: "Living mycelial crystal folders, botanical seed-vault files & solar-bloom toolbar action buttons" },
  { id: "holo_prismatic_foil", label: "🃏 Holographic Prismatic Foil", desc: "1st-Edition holographic foil collector cards, rainbow diffraction folders, prism documents & foil toolbar buttons" },
  { id: "stained_glass_cathedral_pro", label: "🪟 Chartres Stained-Glass Rose", desc: "Cathedral leaded stained-glass folders, illuminated manuscript vellum files & jewel-toned rosette buttons" },
  { id: "synthwave_outrun_1984", label: "🌴 1984 Synthwave Outrun Chrome", desc: "Sunset laser-grid folders, cassette-tape audio glyphs, airbrushed chrome files & neon arcade toolbar buttons" },
  { id: "nasa_apollo_telemetry", label: "🚀 NASA Apollo & Deep-Space Telemetry", desc: "Kapton gold-foil flight folders, mission-control DSKY telemetry plates & aerospace toggle buttons" },
  { id: "obsidian_blood_ruby", label: "🩸 Obsidian & Blood-Ruby Sovereign", desc: "Volcanic obsidian glass folders with faceted crimson ruby inlays, dark signet seals & ruby toolbar plates" },
  { id: "aurora_nordic_ice", label: "🌌 Aurora Borealis & Glacial Ice", desc: "Sub-arctic glacier crystal folders with emerald-violet aurora ribbons & polar ice toolbar buttons" },
  { id: "vaporwave_marble_plaza", label: "🗿 Vaporwave Helios Marble Plaza", desc: "Classical Greco-Roman marble bust folders, pastel teal-pink plaza tiles & aesthetic 95 toolbar buttons" },
  { id: "quantum_superconductor", label: "🧲 Meissner Levitation & Superconductor", desc: "Cryogenic YBCO superconductor folders with pinned magnetic flux lines & zero-resistance quantum buttons" },
];

export const FONT_PROFILES = [
  { id: "default", label: "System UI" },
  { id: "humanist_hig", label: "🍎 Apple HIG Humanist" },
  { id: "swiss_grotesk", label: "🇨🇭 Swiss Neo-Grotesk" },
  { id: "drafting_cad", label: "📐 CAD Precision Mono" },
  { id: "scifi", label: "Sci-Fi Geometric" },
  { id: "terminal", label: "Monospace HUD" },
  { id: "editorial", label: "Editorial Serif" },
  { id: "rounded", label: "Soft Rounded" },
];

export const CORNER_PROFILES = [
  { id: "default", label: "Theme Default" },
  { id: "squircle_hig", label: "🍎 Apple HIG Squircle" },
  { id: "chamfered", label: "💎 Machined Chamfer" },
  { id: "sharp", label: "Tactical Sharp" },
  { id: "rounded", label: "Smooth Rounded" },
  { id: "pill", label: "Liquid Pill" },
];

export const ICON_GLOW_PROFILES = [
  { id: "off", label: "Off" },
  { id: "subtle", label: "Subtle Halo" },
  { id: "ambient_p3", label: "🌈 Display-P3 Ambient" },
  { id: "xdr_specular", label: "💎 XDR Specular Rim" },
  { id: "neon", label: "Neon Bloom" },
  { id: "hyper", label: "Hyper Plasma" },
];

/** 12 3D & Shader Icon Animation Choreographies for folders, files, sidebar places, and toolbar action buttons. */
export const ICON_ANIMATION_PROFILES = [
  { id: "off", label: "⏹️ Static (Off)", desc: "Crisp static 3D icons with zero continuous animation" },
  { id: "spring_pop_3d", label: "🏀 3D Spring Pop & Tilt", desc: "Tactile 3D perspective spring-pop, folder lid opening & specular tilt on hover/focus" },
  { id: "levitate_float", label: "🛸 Zero-G Levitation Float", desc: "Gentle phase-staggered antigravity bobbing & floating drop-shadow depth across folders and files" },
  { id: "holo_foil_shimmer", label: "🌈 Holographic Foil Sweep", desc: "Iridescent 1st-edition collector foil & Display-P3 dichroic light sweep across icon plates" },
  { id: "orbital_halo_spin", label: "🪐 Orbital Ring & Crown Halo", desc: "Rotating celestial gold/cyan orbital rings and specular crown halos around folder and toolbar icons" },
  { id: "cyber_glitch_pulse", label: "⚡ Cyberdeck Chromatic Glitch", desc: "High-tech netrunner RGB chromatic split, micro-jitter & tactical HUD lock-on pulse" },
  { id: "heartbeat_biolum", label: "🌿 Bioluminescent Heartbeat", desc: "Living organic spore & neural-synapse breathing glow with rhythmic harmonic expansion" },
  { id: "clockwork_gear_tick", label: "⚙️ Horological Escapement Tick", desc: "Precision Swiss mechanical escapement micro-tick & gear-tooth rotation on folder and action icons" },
  { id: "liquid_jelly_morph", label: "🫧 Liquid Glass Jelly Morph", desc: "Elastic surface-tension squash-and-stretch with refractive caustic wobble" },
  { id: "plasma_arc_surge", label: "🌩️ High-Voltage Plasma Surge", desc: "Tesla coil electric corona discharge & high-voltage arc flicker around active icons" },
  { id: "fire_ember_flicker", label: "🔥 Forged Ember & Thermal Flicker", desc: "Rising forge heat-haze, dancing ember glow & molten rim pulsation on folders and buttons" },
  { id: "godmode_pantheon_ascend", label: "👑 God-Mode Pantheon Ascension", desc: "Ultimate multi-layered 3D levitation, prismatic foil sweep, orbital crown halo & responsive spring physics" },
];

/** Ensures the hidden SVG displacement filter bank (`#fm-svg-distortion-filters`) is present in the DOM for screen-melting & optical warp effects. */
export function ensureDistortionSvgFilters() {
  if (typeof document === "undefined" || !document.body) return null;
  let svg = document.getElementById("fm-svg-distortion-filters");
  if (svg) return svg;
  svg = h("div", {
    id: "fm-svg-distortion-filters",
    "aria-hidden": "true",
    style: "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;z-index:-1;",
  });
  svg.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0">
    <defs>
      <filter id="fm-filter-screen-melt" x="-8%" y="-8%" width="116%" height="124%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.045" numOctaves="1" seed="7" result="meltNoise" />
        <feDisplacementMap in="SourceGraphic" in2="meltNoise" scale="5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="fm-filter-molten-glass" x="-6%" y="-6%" width="112%" height="118%">
        <feTurbulence type="turbulence" baseFrequency="0.02 0.06" numOctaves="1" seed="19" result="lavaNoise" />
        <feDisplacementMap in="SourceGraphic" in2="lavaNoise" scale="4.5" xChannelSelector="R" yChannelSelector="B" />
      </filter>
      <filter id="fm-filter-liquid-ripple" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.025 0.025" numOctaves="1" seed="3" result="rippleNoise" />
        <feDisplacementMap in="SourceGraphic" in2="rippleNoise" scale="3.5" xChannelSelector="G" yChannelSelector="R" />
      </filter>
    </defs>
  </svg>`;
  document.body.append(svg);
  return svg;
}

/** Applies File Manager UI Element FX (burning folders, dripping slime, screen-melting distortion, etc.), Custom Icon Pack, Typography, Corner Geometry, Icon Glow, and Icon Animation Choreography to the root element. */
export function applyUiImmersionProfiles(overrides = {}) {
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;
  const isPreview = root.dataset.palette === "preview";
  const s = { ...(state.settings ?? {}), ...overrides };
  const themeElFx = root.getAttribute("data-fx-element") || "";
  const themeIconPack = root.getAttribute("data-fx-icon-pack") || "";
  const themeFontProf = root.getAttribute("data-fx-font-profile") || "";
  const themeCornerProf = root.getAttribute("data-fx-corner-profile") || "";
  const themeIconGlow = root.getAttribute("data-fx-icon-glow") || "";
  const themeIconAnim = root.getAttribute("data-fx-icon-anim") || "";

  const explicitUiFx = overrides && Object.prototype.hasOwnProperty.call(overrides, "uiElementFx");
  const rawUiFx = explicitUiFx ? overrides.uiElementFx : (isPreview ? "auto" : (s.uiElementFx || "auto"));
  const effectiveUiFx = (explicitUiFx && overrides.uiElementFx === "off") ? "off" : (rawUiFx === "auto" || rawUiFx === "off" ? (themeElFx || "off") : rawUiFx);
  if (effectiveUiFx && effectiveUiFx !== "off") {
    root.dataset.uiFx = effectiveUiFx;
    if (effectiveUiFx === "screen_melt_ooze" || effectiveUiFx === "molten_lava_melt" || effectiveUiFx === "crt_magnetic_warp" || effectiveUiFx === "fever_dream_ripple") {
      ensureDistortionSvgFilters();
    }
  } else {
    delete root.dataset.uiFx;
  }

  const explicitIconDefault = overrides && Object.prototype.hasOwnProperty.call(overrides, "iconPackStyle") && overrides.iconPackStyle === "default";
  const rawIconPack = (overrides && Object.prototype.hasOwnProperty.call(overrides, "iconPackStyle")) ? overrides.iconPackStyle : (isPreview ? "default" : (s.iconPackStyle || "default"));
  const effectiveIconPack = explicitIconDefault ? "default" : (rawIconPack !== "default" ? rawIconPack : (themeIconPack || "default"));
  if (effectiveIconPack && effectiveIconPack !== "default") root.dataset.iconPack = effectiveIconPack;
  else delete root.dataset.iconPack;

  const explicitFontDefault = overrides && Object.prototype.hasOwnProperty.call(overrides, "themeFontProfile") && overrides.themeFontProfile === "default";
  const rawFont = (overrides && Object.prototype.hasOwnProperty.call(overrides, "themeFontProfile")) ? overrides.themeFontProfile : (isPreview ? "default" : (s.themeFontProfile || "default"));
  const effectiveFont = explicitFontDefault ? "default" : (rawFont !== "default" ? rawFont : (themeFontProf || "default"));
  if (effectiveFont && effectiveFont !== "default") root.dataset.fontProfile = effectiveFont;
  else delete root.dataset.fontProfile;

  const explicitCornerDefault = overrides && Object.prototype.hasOwnProperty.call(overrides, "themeCornerProfile") && overrides.themeCornerProfile === "default";
  const rawCorner = (overrides && Object.prototype.hasOwnProperty.call(overrides, "themeCornerProfile")) ? overrides.themeCornerProfile : (isPreview ? "default" : (s.themeCornerProfile || "default"));
  const effectiveCorner = explicitCornerDefault ? "default" : (rawCorner !== "default" ? rawCorner : (themeCornerProf || "default"));
  if (effectiveCorner && effectiveCorner !== "default") root.dataset.cornerProfile = effectiveCorner;
  else delete root.dataset.cornerProfile;

  const explicitGlowOff = overrides && Object.prototype.hasOwnProperty.call(overrides, "themeIconGlow") && overrides.themeIconGlow === "off";
  const rawGlow = (overrides && Object.prototype.hasOwnProperty.call(overrides, "themeIconGlow")) ? overrides.themeIconGlow : (isPreview ? "off" : (s.themeIconGlow || "off"));
  const effectiveGlow = explicitGlowOff ? "off" : (rawGlow !== "off" ? rawGlow : (themeIconGlow || "off"));
  if (effectiveGlow && effectiveGlow !== "off") root.dataset.iconGlow = effectiveGlow;
  else delete root.dataset.iconGlow;

  const explicitAnimOff = overrides && Object.prototype.hasOwnProperty.call(overrides, "themeIconAnimation") && overrides.themeIconAnimation === "off";
  const rawAnim = (overrides && Object.prototype.hasOwnProperty.call(overrides, "themeIconAnimation")) ? overrides.themeIconAnimation : (isPreview ? "off" : (s.themeIconAnimation || "off"));
  const effectiveAnim = explicitAnimOff ? "off" : (rawAnim !== "off" ? rawAnim : (themeIconAnim || "off"));
  if (effectiveAnim && effectiveAnim !== "off") {
    root.dataset.iconAnim = effectiveAnim;
    root.setAttribute("data-fx-icon-anim", effectiveAnim);
  } else {
    delete root.dataset.iconAnim;
    if (explicitAnimOff) root.removeAttribute("data-fx-icon-anim");
  }

  syncVisibleIcons(document);
}

/** The variables a theme sets, so they can be taken off again. */
let applied = [];
let wanted = "";
let listCache = null;
let currentVars = {};

export function isSystemDark() {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Resolves the active 4-Stage Solar Cycle palette (Dawn 5-8, Day 9-16, Dusk 17-20, Midnight 21-4). */
export function resolveSolarPalette(hour = new Date().getHours(), s = state.settings) {
  if (!s?.solarScheduleEnabled) return "";
  const hNum = ((Number(hour) % 24) + 24) % 24;
  if (hNum >= 5 && hNum < 9) return s.solarDawnPalette || s.preferredLightPalette || "";
  if (hNum >= 9 && hNum < 17) return s.solarDayPalette || s.preferredLightPalette || "";
  if (hNum >= 17 && hNum < 21) return s.solarDuskPalette || s.preferredDarkPalette || "";
  return s.solarNightPalette || s.preferredDarkPalette || "";
}

function normalizeFolderKey(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.length > 1 ? trimmed.replace(/[\\/]+$/, "") : trimmed;
}

/** Resolves a per-folder or workspace ancestor theme profile for `folderPath`. */
export function resolveFolderPalette(folderPath = currentPath() || state.cwd || "", s = state.settings) {
  const map = s?.folderThemes;
  if (!map || typeof map !== "object") return "";
  const target = normalizeFolderKey(folderPath);
  if (!target) return "";
  if (typeof map[target] === "string" && map[target]) return map[target];
  let bestPrefix = "";
  let bestKey = "";
  for (const [rawDir, key] of Object.entries(map)) {
    const dir = normalizeFolderKey(rawDir);
    if (!dir || typeof key !== "string" || !key) continue;
    if (target === dir || target.startsWith(`${dir}/`) || target.startsWith(`${dir}\\`)) {
      if (dir.length > bestPrefix.length) {
        bestPrefix = dir;
        bestKey = key;
      }
    }
  }
  return bestKey;
}

/** Assigns or clears (`paletteKey === ""`) a pinned theme for a specific folder path. */
export async function setFolderTheme(folderPath, paletteKey) {
  const dir = normalizeFolderKey(folderPath);
  if (!dir) return;
  const current = { ...(state.settings?.folderThemes ?? {}) };
  if (paletteKey) current[dir] = paletteKey;
  else delete current[dir];
  await saveSettings({ folderThemes: current });
  const activeDir = normalizeFolderKey(currentPath() || state.cwd || "");
  if (activeDir && (activeDir === dir || activeDir.startsWith(`${dir}/`) || activeDir.startsWith(`${dir}\\`))) {
    await applyPalette(paletteKey || state.settings?.palette || "");
  }
}

/** Resolves the paired or solar-scheduled theme key when `theme === "auto"` and no fixed `palette` is forced. */
export function effectiveAutoPalette(dark = isSystemDark(), hour = new Date().getHours()) {
  const s = state.settings;
  if (!s || s.palette) return "";
  if (s.solarScheduleEnabled) {
    const solar = resolveSolarPalette(hour, s);
    if (solar) return solar;
  }
  if (s.theme !== "auto") return "";
  return (dark ? s.preferredDarkPalette : s.preferredLightPalette) || "";
}

const DEFAULT_TERM_THEME = { background: "#1e1e1e", foreground: "#e6e6e6", cursor: "#e6e6e6", cursorAccent: "#1e1e1e", selectionBackground: "#3d5a80" };

/** Snapshot of the currently active theme for embedded tools and the terminal. */
export function currentThemePayload() {
  const root = document.documentElement;
  const scheme = root.dataset.theme || (isSystemDark() ? "dark" : "light");
  return {
    scheme,
    palette: root.dataset.palette || "",
    vars: { ...currentVars },
  };
}

/** Computes harmonized xterm.js terminal colors from the active theme payload. */
export function terminalTheme(payload = currentThemePayload()) {
  const v = payload?.vars ?? {};
  if (!payload?.palette || !v.bg || !v.text) return { ...DEFAULT_TERM_THEME };
  const bg = v["surface-sunken"] || v.bg;
  return {
    background: bg,
    foreground: v.text,
    cursor: v.accent || v.text,
    cursorAccent: bg,
    selectionBackground: v.selected || "#3d5a80",
  };
}

function clearEffects() {
  const root = document.documentElement;
  for (const attr of [...root.attributes]) if (attr.name.startsWith("data-fx")) root.removeAttribute(attr.name);
  document.getElementById("fm-theme-effects")?.remove();
}

function syncRootPlatform(root, platform) {
  if (!root || !platform) return;
  root.dataset.platform = platform;
  if (root.classList) {
    root.classList.toggle("rad-linux", platform === "linux");
    root.classList.toggle("rad-windows", platform === "windows");
    root.classList.toggle("rad-macos", platform === "macos");
  }
}

function clearPalette() {
  clearEffects();
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(`--${name}`);
  applied = [];
  currentVars = {};
  root.style.removeProperty("color-scheme");
  delete root.dataset.palette;
  wanted = "";
  const hw = probeClientHardware();
  if (!root.dataset.platform) syncRootPlatform(root, state.settings?.platformProfile || hw.platform);
  applyUiImmersionProfiles();
  emit("theme-changed", currentThemePayload());
}

let cachedHw = null;

/** Probes client OS platform (macOS / Windows / Linux), VM renderer (Parallels / VirtIO / Hyper-V / VMware), GPU, display gamut/HDR, and accessibility constraints once per session. */
export function probeClientHardware() {
  if (cachedHw) return cachedHw;
  const nav = typeof navigator !== "undefined" ? navigator : {};
  const mm = (q) => {
    try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(q).matches; }
    catch { return false; }
  };
  let gpu = "";
  try {
    if (typeof document !== "undefined" && !/jsdom/i.test(nav.userAgent || "")) {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "") : String(gl.getParameter(gl.RENDERER) || "");
      }
    }
  } catch {}
  const rawUa = `${nav.userAgent || ""} ${nav.platform || ""} ${nav.userAgentData?.platform || ""}`.toLowerCase();
  const cleanUa = rawUa.replace(/like\s+android/g, "");
  const metaPlatform = typeof document !== "undefined" ? (document.querySelector('meta[name="fm-platform"]')?.content || "").toLowerCase() : "";
  const platform = metaPlatform === "linux" || (/\blinux\b|\bx11\b|\bwayland\b|\bubuntu\b/.test(cleanUa) && !/\bandroid\b/.test(cleanUa))
    ? "linux"
    : metaPlatform === "win32" || metaPlatform === "windows" || /\bwin(dows|32|64)\b/.test(cleanUa)
      ? "windows"
      : "macos";
  const isVm = /parallels|virtio|virgl|vmware|virtualbox|vbox|hyper-v|qemu|qxl|llvmpipe|softpipe/i.test(`${gpu} ${cleanUa}`);
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 8;
  const mem = typeof nav.deviceMemory === "number" ? nav.deviceMemory : 8;
  const dpr = typeof window !== "undefined" && typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1;
  const p3 = mm("(color-gamut: p3)");
  const hdr = mm("(dynamic-range: high)");
  const reducedMotion = mm("(prefers-reduced-motion: reduce)");
  const reducedTransparency = mm("(prefers-reduced-transparency: reduce)");
  const forcedColors = mm("(forced-colors: active)");
  const saveData = Boolean(nav.connection?.saveData);
  const swGpu = /basic render driver|microsoft basic|\bwarp\b|d3d11 warp|gdi generic|rdpudd|citrix/i.test(gpu);
  const shouldFallback = forcedColors || reducedTransparency || saveData || swGpu || (cores > 0 && cores <= 2) || (mem > 0 && mem <= 2);
  const ultra = !shouldFallback && (/apple\s+m[1-9]|apple\s+silicon|apple\s+gpu|parallels\s+display|rtx\s*[345]\d{2,3}|radeon\s+rx\s+[6789]\d{2,3}|intel.*arc\s+[ab]\d{3}|adreno\s+x1|snapdragon\s+x/i.test(gpu) || (p3 && hdr && cores >= 8) || (platform === "macos" && cores >= 6) || (platform === "linux" && cores >= 8) || (platform === "windows" && cores >= 6));
  cachedHw = {
    platform,
    isVm,
    tier: shouldFallback ? "low" : ultra ? "ultra" : (cores >= 6 || p3 || dpr >= 1.5) ? "high" : "balanced",
    fxMode: (forcedColors || swGpu) ? "off" : (shouldFallback || reducedMotion) ? "reduced" : "on",
    shouldFallback,
    gpu,
    p3,
    hdr,
  };
  return cachedHw;
}

/**
 * 1-Click Cross-Platform Hardware Optimization Presets for macOS (Apple Silicon Metal / ProMotion XDR),
 * Windows 11/10 (DirectX 12 / DirectComposition WebView2), and Linux / Ubuntu (WebKitGTK & Parallels Desktop VM).
 */
export const OPTIMIZE_PLATFORM_PRESETS = [
  {
    id: "macos",
    label: "🍎 Optimize for Mac",
    title: "Optimize for macOS Apple Silicon M1–M4 Pro/Max/Ultra (Metal 3 Zero-Readback Compositor · 120Hz ProMotion & Display-P3 XDR)",
    atmosphereTier: "ultra",
  },
  {
    id: "windows",
    label: "🪟 Optimize for Windows",
    title: "Optimize for Windows 11/10 & Parallels Desktop (DirectX 12 · DirectComposition WebView2 Zero-Readback Compositor · 60–120 FPS Locked)",
    atmosphereTier: "high",
  },
  {
    id: "linux",
    label: "🐧 Optimize for Linux / VM",
    title: "Optimize for Ubuntu Linux & Parallels Desktop VM (WebKitGTK Zero-Readback Compositor · 60 FPS Locked)",
    atmosphereTier: "medium",
  },
];

/** Applies cross-platform compositor, blur, and canvas particle optimizations for `"macos"`, `"windows"`, or `"linux"`. */
export async function applyPlatformOptimizationPreset(platformId, opts = {}) {
  const cleanId = platformId === "windows" || platformId === "linux" || platformId === "macos"
    ? platformId
    : probeClientHardware().platform;
  const preset = OPTIMIZE_PLATFORM_PRESETS.find((p) => p.id === cleanId) || OPTIMIZE_PLATFORM_PRESETS[0];
  if (typeof document !== "undefined" && document.documentElement) {
    syncRootPlatform(document.documentElement, preset.id);
  }
  const patch = {
    platformProfile: preset.id,
    atmosphereTier: preset.atmosphereTier,
  };
  if (state.settings) Object.assign(state.settings, patch);
  applyUiImmersionProfiles(patch);
  try {
    applyAtmosphere(undefined, undefined, preset.atmosphereTier);
  } catch {}
  await saveSettings(patch);
  if (!opts.quiet) {
    toast(`Applied ${preset.label} hardware compositor profile (${preset.atmosphereTier.toUpperCase()} tier).`, { kind: "success" });
  }
  return preset;
}

let plainStaticLockKey = null;
let suppressedFxForKey = "";
const suppressedFxKinds = new Set();
const suppressedAtmoLayers = new Set();

function resetSuppressedFx() {
  suppressedFxForKey = "";
  suppressedFxKinds.clear();
  suppressedAtmoLayers.clear();
}

function applySuppressedFxToDom(root) {
  if (!root) return;
  if (suppressedFxKinds.has("uiElementFx")) {
    root.removeAttribute("data-fx-element");
    if (root.dataset) delete root.dataset.uiFx;
    if (state.settings) state.settings.uiElementFx = "off";
  }
  if (suppressedFxKinds.has("iconPackStyle")) {
    root.removeAttribute("data-fx-icon-pack");
    if (root.dataset) delete root.dataset.iconPack;
    if (state.settings) state.settings.iconPackStyle = "default";
  }
  if (suppressedFxKinds.has("iconGlow")) {
    root.removeAttribute("data-fx-icon-glow");
    if (root.dataset) delete root.dataset.iconGlow;
    if (state.settings) state.settings.themeIconGlow = "off";
  }
  if (suppressedFxKinds.has("iconAnimation")) {
    root.removeAttribute("data-fx-icon-anim");
    if (root.dataset) delete root.dataset.iconAnim;
    if (state.settings) state.settings.themeIconAnimation = "off";
  }
  if (suppressedFxKinds.has("fontProfile")) {
    root.removeAttribute("data-fx-font-profile");
    if (root.dataset) delete root.dataset.fontProfile;
    if (state.settings) state.settings.themeFontProfile = "default";
  }
  if (suppressedFxKinds.has("cornerProfile")) {
    root.removeAttribute("data-fx-corner-profile");
    root.removeAttribute("data-fx-radius");
    if (root.dataset) delete root.dataset.cornerProfile;
    if (state.settings) state.settings.themeCornerProfile = "default";
  }
  if (suppressedFxKinds.has("retroGlitch")) {
    for (const attr of ["data-fx-scanlines", "data-fx-grain", "data-fx-chromatic", "data-fx-noise", "data-fx-crt"]) {
      root.removeAttribute(attr);
    }
  }
  if (suppressedFxKinds.has("glassGlow")) {
    for (const attr of ["data-fx-glow", "data-fx-border", "data-fx-sheen", "data-fx-ambient", "data-fx-prism", "data-fx-inner-glow", "data-fx-frosted-rim", "data-fx-neon-pulse", "data-fx-backdrop", "data-fx"]) {
      root.removeAttribute(attr);
    }
  }
  if (suppressedFxKinds.has("atmosphere")) {
    root.removeAttribute("data-fx-atmosphere");
    if (state.settings) state.settings.atmosphere = "none";
  } else if (suppressedAtmoLayers.size > 0) {
    const rawAtmo = root.getAttribute("data-fx-atmosphere") || "";
    if (rawAtmo) {
      const nextLayers = parseAtmosphereIds(rawAtmo).filter((id) => !suppressedAtmoLayers.has(id));
      const nextSpec = normalizeAtmosphereSpec(nextLayers);
      if (nextSpec && nextSpec !== "none") root.setAttribute("data-fx-atmosphere", nextSpec);
      else root.removeAttribute("data-fx-atmosphere");
    }
  }
}

/** Puts a theme's color variables on the page. `key` marks which saved theme it is ("preview" while editing). */
export function paint(theme, key) {
  if (key && key !== "preview" && suppressedFxForKey && suppressedFxForKey !== key) {
    resetSuppressedFx();
  }
  clearEffects();
  const root = document.documentElement;
  const hw = probeClientHardware();
  syncRootPlatform(root, state.settings?.platformProfile || hw.platform);
  for (const name of applied) root.style.removeProperty(`--${name}`);
  applied = Object.keys(theme.vars);
  currentVars = { ...theme.vars };
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(`--${name}`, value);
  root.style.setProperty("color-scheme", theme.scheme);
  root.dataset.theme = theme.scheme;
  root.dataset.palette = key;
  wanted = key;
  if (theme.effects && !(plainStaticLockKey && plainStaticLockKey === key)) {
    const style = document.createElement("style");
    style.id = "fm-theme-effects";
    const nonce = document.querySelector('meta[name="fm-nonce"]')?.content;
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = `:root { ${theme.effects.css} }${theme.effects.customCss ? `\n${theme.effects.customCss}` : ""}`;
    document.head.append(style);
    for (const [name, value] of Object.entries(theme.effects.attrs)) root.setAttribute(name, value);
    root.setAttribute("data-fx-tier", hw.tier);
    if (hw.fxMode !== "on") root.setAttribute("data-fx", hw.fxMode);
    if (key && key !== "preview" && state.settings) {
      if (theme.effects.attrs["data-fx-element"]) state.settings.uiElementFx = "auto";
      if (theme.effects.attrs["data-fx-icon-pack"]) state.settings.iconPackStyle = "default";
      if (theme.effects.attrs["data-fx-font-profile"]) state.settings.themeFontProfile = "default";
      if (theme.effects.attrs["data-fx-corner-profile"]) state.settings.themeCornerProfile = "default";
      if (theme.effects.attrs["data-fx-icon-glow"]) state.settings.themeIconGlow = "off";
      if (theme.effects.attrs["data-fx-icon-anim"]) state.settings.themeIconAnimation = "off";
      if (theme.effects.attrs["data-fx-atmosphere"]) state.settings.atmosphere = "none";
    }
    if (key && key === suppressedFxForKey) {
      applySuppressedFxToDom(root);
    }
  } else if (key && key !== "preview" && state.settings) {
    state.settings.uiElementFx = "off";
    state.settings.iconPackStyle = "default";
    state.settings.themeIconGlow = "off";
    state.settings.themeIconAnimation = "off";
  }
  applyUiImmersionProfiles(
    key && key === suppressedFxForKey && suppressedFxKinds.has("uiElementFx")
      ? { uiElementFx: "off" }
      : undefined,
  );
  emit("theme-changed", currentThemePayload());
}

/** Forgets the list of themes, so the next gallery shows themes that were just made or deleted. */
export function forgetThemeList() {
  listCache = null;
}

/** Applies the theme `key`, or goes back to the plain Light/Dark/automatic choice (or Day/Night pair) when `key` is empty or unknown. Resolves the theme's name or "". */
export async function applyPalette(key) {
  ensureGlobalThemeShortcutsBound();
  const root = document.documentElement;
  const resolvedKey = key || resolveFolderPalette() || effectiveAutoPalette();
  if (!resolvedKey) {
    clearPalette();
    const t = state.settings?.theme ?? "auto";
    if (t === "auto") delete root.dataset.theme;
    else root.dataset.theme = t;
    emit("theme-changed", currentThemePayload());
    return "";
  }
  wanted = resolvedKey;
  try {
    const { theme } = await call("themes/get", { key: resolvedKey });
    if (wanted !== resolvedKey) return theme.name; // another theme was chosen while this one loaded
    const hw = probeClientHardware();
    if (theme.hasEffects && hw.shouldFallback && theme.fallbackKey && !state.settings?.disableThemeFallback) {
      try {
        const fb = await call("themes/get", { key: theme.fallbackKey });
        if (wanted !== resolvedKey) return fb.theme.name;
        paint(fb.theme, theme.fallbackKey);
        toast(`Switched from ${theme.name} to ${fb.theme.name} for smooth performance on this system.`);
        return fb.theme.name;
      } catch {}
    }
    paint(theme, resolvedKey);
    return theme.name;
  } catch (err) {
    if (wanted === resolvedKey) {
      clearPalette();
      if (!(err instanceof ApiError) || err.code !== "NOT_FOUND") toast("The theme couldn't be loaded, so the usual colors are shown.", { kind: "error" });
    }
    return "";
  }
}

async function themeList() {
  if (!listCache) listCache = (await call("themes/list")).themes;
  return listCache;
}

/** The name of the chosen theme, for the Settings window. */
export async function currentThemeName() {
  const key = state.settings.palette;
  if (!key) return "";
  try {
    return (await themeList()).find((t) => t.key === key)?.name ?? "";
  } catch {
    return "";
  }
}

const GROUP_ORDER = ["My themes", "Futuristic", "Editors and classics", "Linux", "Windows", "macOS", "Rare and beloved systems"];
const RADIUS_PX = { sharp: ["2px", "1px"], soft: ["6px", "4px"], round: ["10px", "6px"], pill: ["14px", "999px"], squircle: ["11px", "7px"] };

function parseHexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v) {
  const clamped = Math.max(0, Math.min(1, v));
  const s = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * (clamped ** (1 / 2.4)) - 0.055;
  return Math.round(Math.max(0, Math.min(255, s * 255)));
}

function rgbToOklab([r, g, b]) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

/** Perceptually interpolates two hex colors in OKLab space (`t` in 0..1). */
export function mixHexOklab(hexA, hexB, t = 0.5) {
  const ratio = Math.max(0, Math.min(1, Number(t) || 0));
  const labA = rgbToOklab(parseHexRgb(hexA));
  const labB = rgbToOklab(parseHexRgb(hexB));
  return rgbToHex(oklabToRgb([
    labA[0] + (labB[0] - labA[0]) * ratio,
    labA[1] + (labB[1] - labA[1]) * ratio,
    labA[2] + (labB[2] - labA[2]) * ratio,
  ]));
}

/**
 * Perceptually blends two theme sources (`{ dark, colors, fx, name }`) at `ratio` (0 = 100% A, 1 = 100% B)
 * in OKLab color space and interpolates shader parameters (`blur`, `glass`, `glowIntensity`, `borderOpacity`, `saturation`).
 */
export function blendThemePair(sourceA, sourceB, ratio = 0.5, customName = "") {
  const t = Math.max(0, Math.min(1, Number(ratio) || 0));
  const aCols = sourceA?.colors ?? {};
  const bCols = sourceB?.colors ?? {};
  const colorKeys = ["background", "card", "text", "accent", "secondary", "border", "danger", "warning", "success", "info"];
  const colors = {};
  for (const k of colorKeys) {
    const ca = aCols[k] || aCols.accent || "#6ea8ff";
    const cb = bCols[k] || bCols.accent || "#6ea8ff";
    colors[k] = mixHexOklab(ca, cb, t);
  }
  const bgLum = rgbToOklab(parseHexRgb(colors.background))[0];
  const dark = t < 0.5 ? Boolean(sourceA?.dark ?? bgLum < 0.55) : Boolean(sourceB?.dark ?? bgLum < 0.55);
  const fxA = sourceA?.fx;
  const fxB = sourceB?.fx;
  let fx;
  if (fxA || fxB) {
    const dom = t < 0.5 ? (fxA || fxB) : (fxB || fxA);
    const sub = t < 0.5 ? (fxB || fxA) : (fxA || fxB);
    const num = (key, def) => {
      const va = typeof fxA?.[key] === "number" ? fxA[key] : def;
      const vb = typeof fxB?.[key] === "number" ? fxB[key] : def;
      return Math.round((va + (vb - va) * t) * 100) / 100;
    };
    const atmoA = fxA?.atmosphere && fxA.atmosphere !== "none" ? fxA.atmosphere : "";
    const atmoB = fxB?.atmosphere && fxB.atmosphere !== "none" ? fxB.atmosphere : "";
    const blendedAtmo = atmoA && atmoB && atmoA !== atmoB ? `${atmoA}+${atmoB}` : (dom?.atmosphere || sub?.atmosphere || "none");
    fx = {
      glow: dom?.glow || "soft",
      glowColor: mixHexOklab(fxA?.glowColor || colors.accent, fxB?.glowColor || colors.accent, t),
      glowColor2: mixHexOklab(fxA?.glowColor2 || colors.secondary, fxB?.glowColor2 || colors.secondary, t),
      blur: Math.round(num("blur", 16)),
      glass: Math.min(1, Math.max(0, num("glass", 0.45))),
      glowIntensity: Math.min(1, Math.max(0, num("glowIntensity", 0.8))),
      borderOpacity: Math.min(1, Math.max(0, num("borderOpacity", 0.2))),
      grain: dom?.grain || "none",
      scanlines: dom?.scanlines || "none",
      radius: dom?.radius || "soft",
      border: dom?.border || "gradient",
      motion: dom?.motion || "spring",
      sheen: Boolean(dom?.sheen ?? sub?.sheen),
      noise: Boolean(dom?.noise),
      chromatic: Boolean(dom?.chromatic),
      ambient: Boolean(dom?.ambient ?? true),
      ...(blendedAtmo && blendedAtmo !== "none" ? { atmosphere: blendedAtmo } : {}),
      ...(dom?.backdropStyle ? { backdropStyle: dom.backdropStyle } : {}),
      ...(dom?.cursorEffect ? { cursorEffect: dom.cursorEffect } : {}),
      ...(dom?.vignette ? { vignette: dom.vignette } : {}),
      ...(dom?.uiElementFx ? { uiElementFx: dom.uiElementFx } : {}),
      ...(dom?.iconPackStyle ? { iconPackStyle: dom.iconPackStyle } : {}),
    };
  }
  const name = (customName || "").trim() || `${sourceA?.name || "Theme A"} × ${sourceB?.name || "Theme B"} (${Math.round(t * 100)}%)`.slice(0, 40);
  return {
    name,
    dark,
    base: `${sourceA?.name || "Theme A"} + ${sourceB?.name || "Theme B"}`.slice(0, 40),
    colors,
    ...(fx ? { fx } : {}),
  };
}

/**
 * Extracts a harmonious File Manager theme palette from raw RGBA image pixels (`Uint8ClampedArray` or `number[]`).
 * Used by the "Chameleon Wallpaper Theme Generator" in the Theme Editor.
 */
export function extractPaletteFromPixels(rgbaData, opts = {}) {
  const data = ArrayBuffer.isView(rgbaData) || Array.isArray(rgbaData) ? rgbaData : [];
  const totalPixels = Math.floor(data.length / 4);
  if (totalPixels <= 0) {
    return {
      name: opts.name || "Wallpaper Chameleon",
      dark: true,
      base: "Image Palette",
      colors: { background: "#0d131a", card: "#16202b", text: "#eaf2f8", accent: "#38bdf8", secondary: "#a855f7", border: "#2c3e50", danger: "#ff6b81", warning: "#fbbf24", success: "#34d399", info: "#38bdf8" },
    };
  }
  const step = Math.max(1, Math.floor(totalPixels / 2048));
  const buckets = new Array(12).fill(null).map(() => ({ count: 0, r: 0, g: 0, b: 0, sSum: 0 }));
  let rTotal = 0, gTotal = 0, bTotal = 0, lSum = 0, samples = 0;

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    const a = data[idx + 3] ?? 255;
    if (a < 128) continue;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    const { h, s, l } = rgbHueSatLum([r, g, b]);
    rTotal += r; gTotal += g; bTotal += b; lSum += l; samples++;
    if (s >= 0.18 && l >= 0.15 && l <= 0.88) {
      const bi = Math.floor(((h % 360) / 30)) % 12;
      const weight = 1 + s * 2.5;
      buckets[bi].count += weight;
      buckets[bi].r += r * weight;
      buckets[bi].g += g * weight;
      buckets[bi].b += b * weight;
      buckets[bi].sSum += s * weight;
    }
  }
  const meanL = samples > 0 ? lSum / samples : 0.25;
  const dark = opts.dark !== undefined ? Boolean(opts.dark) : meanL < 0.55;
  const sortedBuckets = [...buckets].sort((a, b) => b.count - a.count);
  const top1 = sortedBuckets[0]?.count > 0
    ? [sortedBuckets[0].r / sortedBuckets[0].count, sortedBuckets[0].g / sortedBuckets[0].count, sortedBuckets[0].b / sortedBuckets[0].count]
    : [rTotal / Math.max(1, samples), gTotal / Math.max(1, samples), bTotal / Math.max(1, samples)];
  const top2 = sortedBuckets[1]?.count > 0
    ? [sortedBuckets[1].r / sortedBuckets[1].count, sortedBuckets[1].g / sortedBuckets[1].count, sortedBuckets[1].b / sortedBuckets[1].count]
    : [top1[2], top1[0], top1[1]];

  const rawAccentHex = rgbToHex(top1);
  const rawSecHex = rgbToHex(top2);
  const accentHex = dark ? mixHexOklab(rawAccentHex, "#ffffff", 0.16) : mixHexOklab(rawAccentHex, "#000000", 0.18);
  const secondaryHex = dark ? mixHexOklab(rawSecHex, "#ffffff", 0.18) : mixHexOklab(rawSecHex, "#000000", 0.16);
  const bgHex = dark ? mixHexOklab(rawAccentHex, "#07090e", 0.86) : mixHexOklab(rawAccentHex, "#f8fafc", 0.9);
  const cardHex = dark ? mixHexOklab(rawAccentHex, "#121824", 0.8) : mixHexOklab(rawAccentHex, "#ffffff", 0.86);
  const textHex = dark ? mixHexOklab(rawAccentHex, "#f8fafc", 0.92) : mixHexOklab(rawAccentHex, "#0f172a", 0.9);
  const borderHex = dark ? mixHexOklab(accentHex, cardHex, 0.68) : mixHexOklab(accentHex, cardHex, 0.72);

  return {
    name: String(opts.name || "Wallpaper Chameleon").slice(0, 40),
    dark,
    base: "Extracted from Image",
    colors: {
      background: bgHex,
      card: cardHex,
      text: textHex,
      accent: accentHex,
      secondary: secondaryHex,
      border: borderHex,
      danger: dark ? "#ff6b81" : "#b42318",
      warning: dark ? "#fbbf24" : "#b45309",
      success: dark ? "#34d399" : "#166534",
      info: dark ? "#38bdf8" : "#0369a1",
    },
    fx: {
      glow: "bloom",
      glowColor: accentHex,
      glowColor2: secondaryHex,
      blur: 24,
      glass: 0.58,
      glowIntensity: 0.8,
      borderOpacity: 0.24,
      grain: "none",
      scanlines: "none",
      radius: "round",
      border: "gradient",
      motion: "spring",
      sheen: true,
      ambient: true,
      backdropStyle: "liquid",
    },
  };
}

let playlistTimerId = 0;
let playlistIndex = 0;

/** Advances the Ambient Playlist by 1 step across the configured theme/atmosphere pool. */
export async function stepAmbientPlaylist() {
  const s = state.settings ?? {};
  const target = s.ambientPlaylistTarget || "both";
  const poolKind = s.ambientPlaylistPool || "favorites";
  let nextThemeKey = null;
  let nextAtmoSpec = null;

  if (target === "themes" || target === "both") {
    const all = await themeList().catch(() => []);
    let pool = all;
    if (poolKind === "favorites") {
      const favs = favoriteKeys();
      pool = all.filter((t) => favs.includes(t.key));
    } else if (poolKind === "ultra") {
      pool = all.filter((t) => resolveTemplateTier(t) === "ultra");
    }
    if (!pool.length) pool = all;
    if (pool.length) {
      const curIdx = pool.findIndex((t) => t.key === s.palette);
      const next = pool[(curIdx + 1 + playlistIndex) % pool.length];
      if (next) {
        nextThemeKey = next.key;
        await chooseTheme(next.key);
        await applyPalette(next.key);
      }
    }
  }

  if (target === "atmosphere" || target === "both") {
    try {
      const userPresets = savedAtmospherePresets?.() ?? [];
      if (poolKind === "presets" && userPresets.length) {
        const p = userPresets[playlistIndex % userPresets.length];
        if (p) {
          nextAtmoSpec = p.effect;
          applyAtmosphere(p.effect, p.intensity, p.tier, p.reactive, p.layerMods);
          await saveSettings({ atmosphere: p.effect, atmosphereIntensity: p.intensity, atmosphereTier: p.tier, atmosphereReactive: p.reactive });
        }
      } else {
        const cycled = await cycleAtmosphere(1, poolKind === "ultra" ? { tier: "ultra" } : {});
        if (cycled) nextAtmoSpec = cycled.id;
      }
    } catch {}
  }
  playlistIndex++;
  return { theme: nextThemeKey, atmosphere: nextAtmoSpec };
}

export function syncAmbientPlaylistTimer() {
  if (playlistTimerId) {
    clearInterval(playlistTimerId);
    playlistTimerId = 0;
  }
  const s = state.settings;
  if (!s?.ambientPlaylistEnabled) return;
  const mins = Math.max(1, Math.min(240, Number(s.ambientPlaylistIntervalMin) || 15));
  playlistTimerId = setInterval(() => {
    void stepAmbientPlaylist();
  }, mins * 60_000);
}

/**
 * 1-Click Jumpstart Workstation Kits:
 * Lets users transform their entire File Manager (Theme Palette + 3D Regular Folders + Picture Icon Pack + Typography + Corners + Atmosphere FX)
 * right from the jump with zero manual setup.
 */
export const JUMPSTART_WORKSTATION_KITS = [
  {
    id: "macos_tahoe_3d_kit",
    label: "🍎 macOS Tahoe 3D Glass & Pictures",
    desc: "macOS Tahoe 3D Liquid Glass regular folders, studio-framed picture icons, Display-P3 caustics & soft rounded typography",
    palette: "tahoe_studio_3d",
    uiElementFx: "tahoe_glass_folders",
    iconPackStyle: "macos_tahoe_3d",
    themeFontProfile: "rounded",
    themeCornerProfile: "rounded",
    themeIconGlow: "subtle",
    atmosphere: "liquid_glass_caustics+prism_spectrum",
  },
  {
    id: "m4_max_xdr_kit",
    label: "💻 M4 Max Pro Display XDR Studio",
    desc: "Space-Black machined titanium workstation with 1600-nit XDR rim folders, 8K RAW camera picture plates & 120Hz raytraced prisms",
    palette: "m4_pro_display_xdr",
    uiElementFx: "xdr_titanium_folders",
    iconPackStyle: "pro_studio_xdr",
    themeFontProfile: "default",
    themeCornerProfile: "rounded",
    themeIconGlow: "subtle",
    atmosphere: "m4_raytrace_prism",
  },
  {
    id: "mac_studio_m4_ultra_kit",
    label: "🧊 Mac Studio M4 Ultra Silver Vault",
    desc: "CNC-machined anodized silver-graphite Mac Studio M4 Ultra with 32-core Neural Engine bloom, Thunderbolt 5 cobalt-ice telemetry & 3D titanium XDR folders",
    palette: "mac_studio_m4_ultra",
    uiElementFx: "xdr_titanium_folders",
    iconPackStyle: "pro_studio_xdr",
    themeFontProfile: "default",
    themeCornerProfile: "rounded",
    themeIconGlow: "subtle",
    atmosphere: "m4_raytrace_prism+liquid_glass_caustics",
  },
  {
    id: "mac_pro_xdr_kit",
    label: "🖥️ Mac Pro Afterburner & 6K XDR",
    desc: "Stainless-steel lattice Mac Pro tower & rack workstation paired with Pro Display XDR 6K 1600-nit reference mastering & PCIe Gen5 gold bus accents",
    palette: "mac_pro_rack_xdr",
    uiElementFx: "xdr_titanium_folders",
    iconPackStyle: "pro_studio_xdr",
    themeFontProfile: "terminal",
    themeCornerProfile: "sharp",
    themeIconGlow: "subtle",
    atmosphere: "quantum_cpu+m4_raytrace_prism",
  },
  {
    id: "macbook_pro_space_black_kit",
    label: "🖤 MacBook Pro 16 M4 Max Space Black",
    desc: "Anodized Space Black MacBook Pro 16-inch M4 Max with 120Hz ProMotion Liquid Retina XDR mini-LED deep blacks & Display-P3 indigo-violet bloom",
    palette: "macbook_pro_space_black",
    uiElementFx: "xdr_titanium_folders",
    iconPackStyle: "pro_studio_xdr",
    themeFontProfile: "default",
    themeCornerProfile: "rounded",
    themeIconGlow: "subtle",
    atmosphere: "m4_raytrace_prism+starlight_velvet",
  },
  {
    id: "apple_studio_display_5k_kit",
    label: "☀️ Apple Studio Display 5K Daylight",
    desc: "600-nit 5K Retina Apple Studio Display daylight reference with nano-texture anti-reflective glass, True Tone balance & macOS Tahoe 3D folders",
    palette: "apple_studio_display_5k",
    uiElementFx: "tahoe_glass_folders",
    iconPackStyle: "macos_tahoe_3d",
    themeFontProfile: "rounded",
    themeCornerProfile: "rounded",
    themeIconGlow: "off",
    atmosphere: "liquid_glass_caustics",
  },
  {
    id: "win11_rtx_3d_kit",
    label: "🪟 Win 11 Fluent 3D & RTX Mica",
    desc: "Layered Windows 11 Fluent 3D amber/cobalt regular folders, DirectX 12 Mica & Acrylic cards, and framed gallery pictures",
    palette: "win11_rtx_fluent_3d",
    uiElementFx: "fluent_mica_folders",
    iconPackStyle: "win11_fluent_pro",
    themeFontProfile: "default",
    themeCornerProfile: "rounded",
    themeIconGlow: "subtle",
    atmosphere: "aurora",
  },
  {
    id: "hdr_photo_cinema_kit",
    label: "📸 8K HDR Photo & Cinema Darkroom",
    desc: "Color-calibrated darkroom & cinema suite with gallery-framed picture icons, 35mm contact-sheet folders & warm specular highlights",
    palette: "hdr_cinema_gallery",
    uiElementFx: "tahoe_glass_folders",
    iconPackStyle: "hdr_photo_studio",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "subtle",
    atmosphere: "liquid_glass_caustics",
  },
  {
    id: "linux_hidpi_kit",
    label: "🐧 Linux Papirus HiDPI Workstation",
    desc: "Crisp KDE Breeze & Papirus HiDPI regular folders with emerald/teal developer badges and low-latency glass",
    palette: "linux_workstation_hidpi",
    uiElementFx: "tahoe_glass_folders",
    iconPackStyle: "linux_papirus_pro",
    themeFontProfile: "default",
    themeCornerProfile: "rounded",
    themeIconGlow: "subtle",
    atmosphere: "northern_pillars",
  },
  {
    id: "studio_minimal_kit",
    label: "🏛️ Studio Architect Daylight",
    desc: "Bright architectural studio with tactile 3D paper-and-glass regular folders, gallery picture frames & calm daylight ergonomics",
    palette: "studio_architect_minimal",
    uiElementFx: "fluent_mica_folders",
    iconPackStyle: "nordic_minimal",
    themeFontProfile: "rounded",
    themeCornerProfile: "rounded",
    themeIconGlow: "off",
    atmosphere: "none",
  },
  {
    id: "storm_overdrive_kit",
    label: "🌪️ EF5 Tornado & Storm Debris",
    desc: "Full M4 storm showcase: tumbling autumn leaves, flying newspapers, shingles & twigs with wind-buffeted folders",
    palette: "ef5_debris_tornado",
    uiElementFx: "storm_wind",
    iconPackStyle: "storm_tempest",
    themeFontProfile: "scifi",
    themeCornerProfile: "rounded",
    themeIconGlow: "neon",
    atmosphere: "debris_tornado_ef5+urban_cyclone_debris",
  },
  {
    id: "compiz_inferno_kit",
    label: "🔥 Compiz Fire Folders & Inferno",
    desc: "Nostalgic Linux Compiz 'Burn' homage: blazing molten folders & toolbars, inferno icons, and volcanic lightning",
    palette: "inferno_fire_folders",
    uiElementFx: "fire_folders",
    iconPackStyle: "inferno",
    themeFontProfile: "scifi",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "volcanic_lightning+embers",
  },
  {
    id: "kaleidoscope_trip_kit",
    label: "🌈 Kaleidoscope Fractal Mandala",
    desc: "Sacred lotus geometry, 11D Calabi-Yau prism refraction, iridescent kaleidoscope folder borders & psychedelic icons",
    palette: "kaleidoscope_mandala",
    uiElementFx: "kaleidoscope_prism",
    iconPackStyle: "psychedelic_trip",
    themeFontProfile: "scifi",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "sacred_mandala+calabi_yau+prism_spectrum",
  },
  {
    id: "lava_lamp_groovy_kit",
    label: "🫧 1969 Psychedelic Lava Lamp",
    desc: "Groovy molten orange & hot-magenta wax blobs undulating through warm violet oil with morphing lava-lamp folders",
    palette: "lava_lamp_groovy_69",
    uiElementFx: "lava_wax",
    iconPackStyle: "lava_groovy",
    themeFontProfile: "rounded",
    themeCornerProfile: "pill",
    themeIconGlow: "neon",
    atmosphere: "will_o_wisp+cinema_bokeh+aurora",
  },
  {
    id: "mycelium_spore_kit",
    label: "🍄 Bioluminescent Mycelium Spores",
    desc: "Ultraviolet forest-floor fungal neural network pulsing with neon cyan & violet spores and glowing mushroom icons",
    palette: "electric_mycelium_forest",
    uiElementFx: "shroom_spores",
    iconPackStyle: "psychedelic_trip",
    themeFontProfile: "rounded",
    themeCornerProfile: "pill",
    themeIconGlow: "hyper",
    atmosphere: "mycelium_net+fairy_glade+jellyfish_glow",
  },
  {
    id: "op_art_hypnosis_kit",
    label: "🌀 Op-Art Moiré & Acid Warp",
    desc: "Kinetic Op-Art wave interference, Chladni cymatics, chromatic RGB split & hypnotic vortex portal icons",
    palette: "optical_moire_hypnosis",
    uiElementFx: "acid_warp",
    iconPackStyle: "op_art_illusion",
    themeFontProfile: "scifi",
    themeCornerProfile: "sharp",
    themeIconGlow: "hyper",
    atmosphere: "cymatics+lissajous_harmonics+chrono_portal",
  },
  {
    id: "google_gemini_ultra_kit",
    label: "✨ Google Gemini Ultra 3D",
    desc: "Google Gemini Ultra 2.5 deep-space studio with 4-color AI sparkle refraction, Material 3D folders & 120+ system icons",
    palette: "google_gemini_ultra",
    uiElementFx: "google_material_folders",
    iconPackStyle: "google_material_3d",
    themeFontProfile: "rounded",
    themeCornerProfile: "rounded",
    themeIconGlow: "neon",
    atmosphere: "neural_nexus+aurora+prism_spectrum",
  },
  {
    id: "google_deepmind_quantum_kit",
    label: "⚛️ Google DeepMind Willow Quantum",
    desc: "Google DeepMind Willow dilution-cryostat quantum lab with superconducting gold interconnects & Material 3D icons",
    palette: "google_deepmind_quantum",
    uiElementFx: "google_material_folders",
    iconPackStyle: "google_material_3d",
    themeFontProfile: "scifi",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "quantum_cpu+qubit_stream+tachyon_braid_2126",
  },
  {
    id: "google_workspace_daylight_kit",
    label: "☀️ Google Material 3 Daylight",
    desc: "Clean alabaster Google Workspace & Material 3 Daylight studio with porcelain cards, Royal Blue accents & 3D folders",
    palette: "google_workspace_daylight",
    uiElementFx: "google_material_folders",
    iconPackStyle: "google_material_3d",
    themeFontProfile: "rounded",
    themeCornerProfile: "rounded",
    themeIconGlow: "off",
    atmosphere: "liquid_glass_caustics+pollen_glow",
  },
  {
    id: "ayahuasca_shipibo_kit",
    label: "🐍 Ayahuasca Shipibo Vision",
    desc: "Amazonian Shipibo sacred geometric songlines, bioluminescent rainforest vines, emerald-magenta fractals & spore folders",
    palette: "ayahuasca_vine_vision",
    uiElementFx: "shroom_spores",
    iconPackStyle: "psychedelic_trip",
    themeFontProfile: "rounded",
    themeCornerProfile: "pill",
    themeIconGlow: "hyper",
    atmosphere: "mycelium_net+sacred_mandala+fireflies",
  },
  {
    id: "frutiger_aero_aqua_kit",
    label: "🐬 Frutiger Aero Reef '07",
    desc: "Utopian 2007 glossy aqua glass orbs, tropical coral reef water caustics, sunlit emerald horizons & 3D jewel icons",
    palette: "frutiger_aero_aqua_2007",
    uiElementFx: "tahoe_glass_folders",
    iconPackStyle: "liquid_gems",
    themeFontProfile: "rounded",
    themeCornerProfile: "pill",
    themeIconGlow: "subtle",
    atmosphere: "liquid_glass_caustics+caustics+sunbeams",
  },
  {
    id: "holiday_christmas_kit",
    label: "🎄 Christmas Nutcracker Hearth",
    desc: "Douglas fir boughs, C9 fairy lights, falling snow, peppermint candy canes & festive wrapped gift folders",
    palette: "holiday_christmas_nutcracker_hearth",
    uiElementFx: "holiday_festive_glow",
    iconPackStyle: "us_holidays_festive",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "snow+cinema_bokeh+embers",
  },
  {
    id: "holiday_fourth_july_kit",
    label: "🎆 4th of July Sky Fireworks",
    desc: "Grand finale Independence Day fireworks, crackling sparklers, Liberty Bell brass & festive US holiday icons",
    palette: "holiday_fourth_of_july_fireworks",
    uiElementFx: "holiday_festive_glow",
    iconPackStyle: "us_holidays_festive",
    themeFontProfile: "rounded",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "fireworks+embers+starfield",
  },
  {
    id: "holiday_halloween_kit",
    label: "🎃 Halloween Jack-O'-Lantern",
    desc: "Flickering carved Jack-O'-Lantern pumpkins, swirling autumn leaves, candlelit embers & spooky holiday icons",
    palette: "holiday_halloween_jack_o_lantern",
    uiElementFx: "holiday_festive_glow",
    iconPackStyle: "us_holidays_festive",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "autumn_leaves+embers+fireflies",
  },
  {
    id: "nerd_dnd_grimoire_kit",
    label: "🎲 D&D 5e Arcane Grimoire & d20",
    desc: "Gold-tooled dragonhide spellbook, critical Natural 20 polyhedral dice folders, eldritch runes & fantasy map icons",
    palette: "nerd_dnd_arcane_grimoire",
    uiElementFx: "nerd_arcane_runes",
    iconPackStyle: "nerd_rpg_arcane",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "sacred_mandala+embers+fireflies",
  },
  {
    id: "nerd_starfleet_lcars_kit",
    label: "🖖 Starfleet LCARS Galaxy Bridge",
    desc: "24th-century Enterprise-D swept-elbow LCARS tactical console, warp starlight streaks & Starfleet bridge icons",
    palette: "nerd_starfleet_lcars_bridge",
    uiElementFx: "nerd_lcars_hud",
    iconPackStyle: "nerd_scifi_fleet",
    themeFontProfile: "scifi",
    themeCornerProfile: "pill",
    themeIconGlow: "hyper",
    atmosphere: "warp_tunnel+starfield+hud_reticle",
  },
  {
    id: "horror_nosferatu_kit",
    label: "🧛 Nosferatu Gothic Blood Moon",
    desc: "Carpathian vampire cathedral under an eclipsed crimson blood moon with coffin folders & dripping candelabra wax",
    palette: "horror_nosferatu_blood_moon",
    uiElementFx: "horror_blood_moon",
    iconPackStyle: "horror_crypt",
    themeFontProfile: "editorial",
    themeCornerProfile: "sharp",
    themeIconGlow: "hyper",
    atmosphere: "embers+red_sprites+starlight_velvet",
  },
  {
    id: "horror_eldritch_kit",
    label: "🦑 Lovecraft Eldritch R'lyeh Abyss",
    desc: "Cyclopean sunken monoliths of R'lyeh, writhing cosmic void tentacles, deep-sea ichor & forbidden tome icons",
    palette: "horror_lovecraft_eldritch_rlyeh",
    uiElementFx: "void_tentacles",
    iconPackStyle: "horror_crypt",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "abyssal_trench+jellyfish_glow+bio_spores",
  },
  {
    id: "realworld_clockwork_kit",
    label: "🕰️ Grandfather Mahogany Clockwork",
    desc: "Hand-carved Honduras mahogany case, swinging brass pendulum, bevelled glass doors & real-world tactile object icons",
    palette: "realworld_grandfather_clockwork_mahogany",
    uiElementFx: "realworld_mahogany_brass",
    iconPackStyle: "realworld_objects",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "subtle",
    atmosphere: "dust_motes+sunbeams+embers",
  },
  {
    id: "realworld_stained_glass_kit",
    label: "🪟 Cathedral Stained-Glass Rose",
    desc: "Soldered lead-came Gothic rose window casting jewel-toned sunbeams across stained-glass folders & tactile objects",
    palette: "realworld_stained_glass_cathedral",
    uiElementFx: "realworld_stained_glass",
    iconPackStyle: "realworld_objects",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "sunbeams+prism_spectrum+sacred_mandala",
  },
  {
    id: "screen_melt_distortion_kit",
    label: "🫠 Screen-Melting Distortion & Drip",
    desc: "Surrealist Dalí screen-melting distortion: sagging folders, files & toolbars with viscous dripping ooze and SVG displacement",
    palette: "horror_biohazard_containment_lab",
    uiElementFx: "screen_melt_ooze",
    iconPackStyle: "horror_crypt",
    themeFontProfile: "terminal",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "toxic_slime+bio_spores+hud_reticle",
  },
  {
    id: "molten_furnace_melt_kit",
    label: "🌋 Molten Glass & Magma Melt",
    desc: "1,200°C furnace heat distortion where 3D folders & file sheets sag and glow like molten blown glass",
    palette: "horror_silent_fog_asylum",
    uiElementFx: "molten_lava_melt",
    iconPackStyle: "realworld_objects",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "embers+cinema_bokeh",
  },
  {
    id: "realworld_jukebox_kit",
    label: "📻 1959 Wurlitzer Vinyl Jukebox",
    desc: "Warm glowing vacuum tubes, sunburst cherry woodgrain 3D folders, chrome diner trim & tactile vinyl icons",
    palette: "realworld_vinyl_jukebox_wurlitzer",
    uiElementFx: "realworld_mahogany_brass",
    iconPackStyle: "realworld_objects",
    themeFontProfile: "rounded",
    themeCornerProfile: "pill",
    themeIconGlow: "neon",
    atmosphere: "embers+cinema_bokeh",
  },
  {
    id: "realworld_pinball_kit",
    label: "🕹️ 1978 Arcade Pinball Backglass",
    desc: "Silverball chrome bumpers, incandescent playfield inserts, stained-glass 3D folders & tactile arcade icons",
    palette: "realworld_pinball_wizard_arcade",
    uiElementFx: "realworld_stained_glass",
    iconPackStyle: "realworld_objects",
    themeFontProfile: "scifi",
    themeCornerProfile: "rounded",
    themeIconGlow: "hyper",
    atmosphere: "starburst+cinema_bokeh",
  },
  {
    id: "cupertino_ceramic_hig_kit",
    label: "🍎 Cupertino Ceramic & Titanium HIG",
    desc: "Apple Human Interface Guidelines ceramic squircle 3D folders, 0.5px specular hairlines, SF humanist typography & Display-P3 ambient halo",
    palette: "apple_studio_display_5k",
    uiElementFx: "cupertino_ceramic_bevel",
    iconPackStyle: "cupertino_hig_studio",
    themeFontProfile: "humanist_hig",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "ambient_p3",
    atmosphere: "tahoe_caustics+cinema_bokeh",
  },
  {
    id: "swiss_horology_sapphire_kit",
    label: "⌚ Swiss Horology Sapphire & Rose Gold",
    desc: "Geneva haute-horlogerie sapphire-crystal 3D folders, rose-gold guilloché bezels, Swiss Neo-Grotesk typography & precision ledger icons",
    palette: "realworld_grandfather_clockwork_mahogany",
    uiElementFx: "swiss_sapphire_chronograph",
    iconPackStyle: "swiss_horology_gold",
    themeFontProfile: "swiss_grotesk",
    themeCornerProfile: "chamfered",
    themeIconGlow: "xdr_specular",
    atmosphere: "cinema_bokeh+starburst",
  },
  {
    id: "teenage_field_synth_kit",
    label: "🎛️ Swedish Field Synth Anodized",
    desc: "Bead-blasted CNC anodized aluminum 3D folders, tactile hardware keycap rows, international-orange accents & studio stem icons",
    palette: "titanium_slate",
    uiElementFx: "teenage_field_anodized",
    iconPackStyle: "teenage_field_synth",
    themeFontProfile: "swiss_grotesk",
    themeCornerProfile: "chamfered",
    themeIconGlow: "subtle",
    atmosphere: "none",
  },
  {
    id: "blueprint_cad_cyanotype_kit",
    label: "📐 Architectural Cyanotype & CAD",
    desc: "Prussian-blue cyanotype drafting 3D folders, 0.5px micrometer vernier hairlines, CAD monospace typography & engineering spec icons",
    palette: "sapphire",
    uiElementFx: "blueprint_cad_cyanotype",
    iconPackStyle: "blueprint_cad_pro",
    themeFontProfile: "drafting_cad",
    themeCornerProfile: "sharp",
    themeIconGlow: "xdr_specular",
    atmosphere: "hud_reticle",
  },
  {
    id: "kyoto_washi_sumi_kit",
    label: "🎋 Kyoto Washi Paper & Sumi Ink",
    desc: "Handmade mulberry washi 3D folders, warm hinoki cedar borders, vermilion hanko seal badges & editorial serif typography",
    palette: "kyoto_zen_karesansui_day",
    uiElementFx: "kyoto_washi_sumi",
    iconPackStyle: "kyoto_zen_ink",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "subtle",
    atmosphere: "sakura_drift+sunbeams",
  },
  {
    id: "carbon_kevlar_telemetry_kit",
    label: "🏎️ Forged Carbon & Telemetry XDR",
    desc: "Autoclave 3K twill carbon-fiber 3D folders, Alcantara crimson stitch borders, titanium countersunk fasteners & aerospace telemetry icons",
    palette: "mac_mini_m4_pro_carbon",
    uiElementFx: "carbon_kevlar_weave",
    iconPackStyle: "carbon_aerospace",
    themeFontProfile: "drafting_cad",
    themeCornerProfile: "chamfered",
    themeIconGlow: "xdr_specular",
    atmosphere: "hud_reticle+embers",
  },
  {
    id: "crt_degauss_magnet_kit",
    label: "🧲 CRT Magnet De-Gauss & VHS Warp",
    desc: "Magnetic coil screen bend, RGB aperture-grille separation, de-gaussing wave distortion & retro phosphor folder icons",
    palette: "horror_vhs_found_footage_1999",
    uiElementFx: "crt_magnetic_warp",
    iconPackStyle: "nerd_hacker_retro",
    themeFontProfile: "terminal",
    themeCornerProfile: "sharp",
    themeIconGlow: "neon",
    atmosphere: "hud_reticle+dust_motes",
  },
  {
    id: "mirage_liquid_ripple_kit",
    label: "🌊 Hallucinogenic Liquid Mirage Ripple",
    desc: "Refractive underwater & desert mirage displacement ripples gently bending 3D folders, files, and toolbars",
    palette: "horror_cursed_carnival_calliope",
    uiElementFx: "fever_dream_ripple",
    iconPackStyle: "liquid_gems",
    themeFontProfile: "rounded",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "ambient_p3",
    atmosphere: "caustics+aurora_borealis",
  },
  {
    id: "plain_cupertino_daylight_kit",
    label: "⏹️ Plain Cupertino Daylight (No FX)",
    desc: "Zero-animation Apple HIG daylight paper setup: crisp SF humanist typography, squircle corners, standard folders & 0% GPU overhead",
    palette: "apple_light",
    uiElementFx: "off",
    iconPackStyle: "default",
    themeFontProfile: "humanist_hig",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "off",
    atmosphere: "none",
  },
  {
    id: "plain_xdr_darkroom_kit",
    label: "⏹️ Plain Cupertino Darkroom (No FX)",
    desc: "Zero-animation Apple Dark Mode reference setup: neutral titanium dark cards, SF humanist typography & pure static legibility",
    palette: "apple_dark",
    uiElementFx: "off",
    iconPackStyle: "default",
    themeFontProfile: "humanist_hig",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "off",
    atmosphere: "none",
  },
  {
    id: "plain_tokyo_night_pro_kit",
    label: "⏹️ Plain Tokyo Night IDE (No FX)",
    desc: "Zero-animation Tokyo Night developer setup: clean indigo slate surfaces, CAD monospace typography & zero moving particles",
    palette: "tokyo_night",
    uiElementFx: "off",
    iconPackStyle: "default",
    themeFontProfile: "drafting_cad",
    themeCornerProfile: "rounded",
    themeIconGlow: "off",
    atmosphere: "none",
  },
  {
    id: "plain_nordic_architect_kit",
    label: "⏹️ Plain Nordic Architect (No FX)",
    desc: "Zero-animation Scandinavian editorial paper setup: warm daylight contrast, Swiss Neo-Grotesk type & distraction-free folders",
    palette: "nordic_paper",
    uiElementFx: "off",
    iconPackStyle: "default",
    themeFontProfile: "swiss_grotesk",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "off",
    atmosphere: "none",
  },
  {
    id: "plain_dracula_studio_kit",
    label: "⏹️ Plain Dracula Studio (No FX)",
    desc: "Zero-animation Dracula classic setup: high-contrast purple & pink syntax palette with crisp static rows and zero motion",
    palette: "dracula",
    uiElementFx: "off",
    iconPackStyle: "default",
    themeFontProfile: "humanist_hig",
    themeCornerProfile: "rounded",
    themeIconGlow: "off",
    atmosphere: "none",
  },
  {
    id: "plain_solarized_editorial_kit",
    label: "⏹️ Plain Solarized Editorial (No FX)",
    desc: "Zero-animation Ethan Schoonover Solarized Light setup with literary editorial serif typography for all-day reading comfort",
    palette: "solarized_light",
    uiElementFx: "off",
    iconPackStyle: "default",
    themeFontProfile: "editorial",
    themeCornerProfile: "rounded",
    themeIconGlow: "off",
    atmosphere: "none",
  },
  {
    id: "godmode_omega_singularity_kit",
    label: "🌌 God-Mode Omega Singularity",
    desc: "Post-singularity cosmological workstation: 24K celestial gold event-horizon refraction, Omega halo folders & 11D Calabi-Yau manifold",
    palette: "omega_point_singularity",
    uiElementFx: "godmode_omega_halo",
    iconPackStyle: "godmode_celestial",
    themeFontProfile: "scifi",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "hyper",
    atmosphere: "omega_point_2126+calabi_yau+hawking_horizon",
  },
  {
    id: "godmode_photonic_3099_kit",
    label: "💎 God-Mode 3099 Photonic Crystal",
    desc: "Year 3099 negative-index photonic metamaterial workstation: dichroic laser caustics, light-field 3D folders & Penrose quasicrystals",
    palette: "photonic_metamaterial_3099",
    uiElementFx: "godmode_photonic_crystal",
    iconPackStyle: "godmode_photonic",
    themeFontProfile: "humanist_hig",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "ambient_p3",
    atmosphere: "prism_spectrum+liquid_glass_caustics+penrose_quasicrystal",
  },
  {
    id: "godmode_matrioshka_dyson_kit",
    label: "☀️ God-Mode Matrioshka Dyson Brain",
    desc: "Kardashev Type-II stellar supercomputer: solar-corona plasma filaments, hex-collector computronium folders & quantum forge icons",
    palette: "matrioshka_dyson_brain",
    uiElementFx: "godmode_dyson_lattice",
    iconPackStyle: "godmode_quantum",
    themeFontProfile: "drafting_cad",
    themeCornerProfile: "chamfered",
    themeIconGlow: "xdr_specular",
    atmosphere: "dyson_swarm+tokamak_fusion+eigen_consciousness",
  },
  {
    id: "godmode_chrono_vault_kit",
    label: "⏳ God-Mode Chrono-Crystalline Vault",
    desc: "Time-dilated horological sapphire crystal workstation: retrocausal phase shimmer, golden astrolabe folders & 4D tesseract time loops",
    palette: "chrono_crystalline_aethelgard",
    uiElementFx: "godmode_chrono_crystal",
    iconPackStyle: "godmode_chrono",
    themeFontProfile: "swiss_grotesk",
    themeCornerProfile: "chamfered",
    themeIconGlow: "xdr_specular",
    atmosphere: "chronos_retrocausal+tesseract_4d+starburst",
  },
  {
    id: "godmode_akashic_noosphere_kit",
    label: "🧠 God-Mode Akashic Noosphere",
    desc: "Planetary neural consciousness architecture: living bioluminescent synaptic dendrite folders, emerald-cyan axons & eigen-consciousness",
    palette: "akashic_neural_noosphere",
    uiElementFx: "godmode_neural_synapse",
    iconPackStyle: "godmode_chrono",
    themeFontProfile: "humanist_hig",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "ambient_p3",
    atmosphere: "eigen_consciousness+neural+mycelium_net",
  },
  {
    id: "godmode_solarpunk_3000_kit",
    label: "🌿 God-Mode Year 3000 Solarpunk",
    desc: "Utopian sky-archology daylight workstation: living chlorophyll bio-glass, sunlit golden-emerald caustics & aero-botanical folders",
    palette: "eden_solarpunk_archology_3000",
    uiElementFx: "godmode_neural_synapse",
    iconPackStyle: "godmode_chrono",
    themeFontProfile: "humanist_hig",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "ambient_p3",
    atmosphere: "sunbeams+prism_spectrum+fairy_glade",
  },
];

/** Applies a 1-Click Jumpstart Workstation Kit (theme palette + 3D folder FX + picture/icon pack + typography + corners + atmosphere). */
export async function applyJumpstartKit(kitId) {
  const kit = JUMPSTART_WORKSTATION_KITS.find((k) => k.id === kitId);
  if (!kit) return null;
  const patch = {
    palette: kit.palette,
    uiElementFx: kit.uiElementFx,
    iconPackStyle: kit.iconPackStyle,
    themeFontProfile: kit.themeFontProfile,
    themeCornerProfile: kit.themeCornerProfile,
    themeIconGlow: kit.themeIconGlow,
    ...(kit.themeIconAnimation ? { themeIconAnimation: kit.themeIconAnimation } : {}),
    ...(kit.atmosphere ? { atmosphere: kit.atmosphere } : {}),
  };
  rememberTheme(kit.palette);
  await applyPalette(kit.palette);
  if (state.settings) Object.assign(state.settings, patch);
  applyUiImmersionProfiles(patch);
  try {
    if (kit.atmosphere) {
      applyAtmosphere(kit.atmosphere, state.settings?.atmosphereIntensity ?? 78, state.settings?.atmosphereTier || "auto");
    }
  } catch {}
  await saveSettings(patch);
  toast(`Applied Jumpstart Kit: ${kit.label}`, { kind: "success" });
  return kit;
}

const PREVIEW_STAGE_ENTRIES = [
  { name: "src", isDir: true, label: "src/" },
  { name: "models", isDir: true, label: "models/" },
  { name: "shaders", isDir: true, label: "shaders/" },
  { name: "main.ts", isDir: false, label: "main.ts" },
  { name: "Cargo.toml", isDir: false, label: "Cargo.toml" },
  { name: "llama-3-70b.gguf", isDir: false, label: "llama.gguf" },
  { name: "studio-xdr.heic", isDir: false, label: "studio.heic" },
  { name: "keynote-8k.mov", isDir: false, label: "keynote.mov" },
  { name: "synth-stem.flac", isDir: false, label: "synth.flac" },
  { name: "Dockerfile", isDir: false, label: "Dockerfile" },
];

const PREVIEW_STAGE_BUTTONS = [
  { id: "newFolder", label: "New Folder" },
  { id: "newFile", label: "New File" },
  { id: "terminal", label: "Terminal" },
  { id: "theme", label: "Themes" },
  { id: "chip.picture", label: "Pictures" },
  { id: "sb.zip", label: "Zip" },
];

/** Builds the interactive "🔥 Folder, Toolbar & Icon Immersion Studio" bar for the Theme Gallery and Atmosphere Studio. */
export function buildImmersionStudioBar() {
  const curUiFx = () => state.settings?.uiElementFx || "off";
  const curIconPack = () => state.settings?.iconPackStyle || "default";
  const curFont = () => state.settings?.themeFontProfile || "default";
  const curCorner = () => state.settings?.themeCornerProfile || "default";
  const curGlow = () => state.settings?.themeIconGlow || "off";
  const curAnim = () => state.settings?.themeIconAnimation || "off";
  const curKit = () => {
    const p = state.settings?.palette || "";
    const u = curUiFx();
    const ic = curIconPack();
    return JUMPSTART_WORKSTATION_KITS.find((k) => k.palette === p && k.uiElementFx === u && k.iconPackStyle === ic)?.id || "";
  };

  const jumpstartButtons = JUMPSTART_WORKSTATION_KITS.map((kit) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill theme-jumpstart-pill${curKit() === kit.id ? " is-active" : ""}`,
      "data-jumpstart-kit": kit.id,
      "aria-pressed": String(curKit() === kit.id),
      title: `${kit.desc} (1-click zero-manual-work setup)`,
      onclick: async () => {
        await applyJumpstartKit(kit.id);
        syncBarState();
      },
    }, kit.label),
  );

  const uiFxButtons = UI_ELEMENT_FX_OPTIONS.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curUiFx() === opt.id ? " is-active" : ""}`,
      "data-ui-fx": opt.id,
      "aria-pressed": String(curUiFx() === opt.id),
      title: opt.desc,
      onclick: async () => {
        if (state.settings) state.settings.uiElementFx = opt.id;
        applyUiImmersionProfiles({ uiElementFx: opt.id });
        syncBarState();
        await saveSettings({ uiElementFx: opt.id });
      },
    }, opt.label),
  );

  const iconPackButtons = ICON_PACK_OPTIONS.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curIconPack() === opt.id ? " is-active" : ""}`,
      "data-icon-pack": opt.id,
      "aria-pressed": String(curIconPack() === opt.id),
      title: opt.desc,
      onclick: async () => {
        if (state.settings) state.settings.iconPackStyle = opt.id;
        applyUiImmersionProfiles({ iconPackStyle: opt.id });
        syncBarState();
        await saveSettings({ iconPackStyle: opt.id });
      },
    }, opt.label),
  );

  const animButtons = ICON_ANIMATION_PROFILES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curAnim() === opt.id ? " is-active" : ""}`,
      "data-icon-anim": opt.id,
      "aria-pressed": String(curAnim() === opt.id),
      title: opt.desc,
      onclick: async () => {
        if (state.settings) state.settings.themeIconAnimation = opt.id;
        applyUiImmersionProfiles({ themeIconAnimation: opt.id });
        syncBarState();
        await saveSettings({ themeIconAnimation: opt.id });
      },
    }, opt.label),
  );

  const fontButtons = FONT_PROFILES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curFont() === opt.id ? " is-active" : ""}`,
      "data-font-profile": opt.id,
      "aria-pressed": String(curFont() === opt.id),
      onclick: async () => {
        if (state.settings) state.settings.themeFontProfile = opt.id;
        applyUiImmersionProfiles({ themeFontProfile: opt.id });
        syncBarState();
        await saveSettings({ themeFontProfile: opt.id });
      },
    }, opt.label),
  );

  const cornerButtons = CORNER_PROFILES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curCorner() === opt.id ? " is-active" : ""}`,
      "data-corner-profile": opt.id,
      "aria-pressed": String(curCorner() === opt.id),
      onclick: async () => {
        if (state.settings) state.settings.themeCornerProfile = opt.id;
        applyUiImmersionProfiles({ themeCornerProfile: opt.id });
        syncBarState();
        await saveSettings({ themeCornerProfile: opt.id });
      },
    }, opt.label),
  );

  const glowButtons = ICON_GLOW_PROFILES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curGlow() === opt.id ? " is-active" : ""}`,
      "data-icon-glow": opt.id,
      "aria-pressed": String(curGlow() === opt.id),
      onclick: async () => {
        if (state.settings) state.settings.themeIconGlow = opt.id;
        applyUiImmersionProfiles({ themeIconGlow: opt.id });
        syncBarState();
        await saveSettings({ themeIconGlow: opt.id });
      },
    }, opt.label),
  );

  const previewStageStatus = h("span", { class: "theme-icon-stage-status", "data-icon-stage-status": "true" });
  const previewStageRowItems = PREVIEW_STAGE_ENTRIES.map((item) => {
    const ic = iconForEntry({ name: item.name, isDir: item.isDir, icon: item.isDir ? "📁" : "📄" });
    const glyph = typeof ic === "string" ? ic : (ic?.glyph || (item.isDir ? "📁" : "📄"));
    const kind = typeof ic === "object" && ic?.kind ? ic.kind : (item.isDir ? "folder" : "file");
    return h("div", {
      class: `row theme-icon-stage-specimen${item.isDir ? " is-folder" : ""}`,
      "data-stage-specimen": item.name,
      "data-is-dir": String(item.isDir),
      "data-icon-kind": kind,
      title: `Live 3D Icon Specimen: ${item.label} (hover to test 3D folder pocket & click to cycle icon choreography)`,
      onclick: async () => {
        const activeList = ICON_ANIMATION_PROFILES.filter((p) => p.id !== "off" && p.id !== "auto");
        const curIdx = activeList.findIndex((p) => p.id === curAnim());
        const nextOpt = activeList[(curIdx + 1) % activeList.length] || activeList[0];
        if (nextOpt) {
          if (state.settings) state.settings.themeIconAnimation = nextOpt.id;
          applyUiImmersionProfiles({ themeIconAnimation: nextOpt.id });
          syncBarState();
          await saveSettings({ themeIconAnimation: nextOpt.id });
        }
      },
    },
      h("span", {
        class: "c-icon",
        "data-entry-name": item.name,
        "data-is-dir": String(item.isDir),
        "data-is-folder": item.isDir ? "1" : "0",
        "data-icon-kind": kind,
      }, glyph),
      h("span", { class: "c-name theme-icon-stage-label" }, item.label),
    );
  });

  const previewStageBtnItems = PREVIEW_STAGE_BUTTONS.map((btn) =>
    h("button", {
      type: "button",
      class: "btn tb-btn theme-icon-stage-btn",
      title: `Live Toolbar Button Specimen: ${btn.label}`,
    },
      h("span", { class: "tb-icon", "data-btn-icon": btn.id }, buttonIconFor(btn.id)),
      h("span", { class: "tb-label" }, btn.label),
    ),
  );

  const previewStage = h("div", {
    class: "theme-icon-preview-stage",
    "data-icon-preview-stage": "true",
    role: "region",
    "aria-label": "Live 3D Folder, File and Toolbar Button Icon Preview Stage",
  },
    h("div", { class: "theme-icon-stage-head" },
      h("strong", {}, "🔬 Live 3D Icon, Folder-Pocket & Button Choreography Stage (260+ System Icons · 49 Packs · 12 Animations)"),
      previewStageStatus,
    ),
    h("div", { class: "theme-icon-stage-grid" },
      ...previewStageRowItems,
      ...previewStageBtnItems,
    ),
  );

  function syncBarState() {
    const activeKit = curKit();
    for (const b of jumpstartButtons) {
      const on = b.dataset.jumpstartKit === activeKit;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of uiFxButtons) {
      const on = b.dataset.uiFx === curUiFx();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of iconPackButtons) {
      const on = b.dataset.iconPack === curIconPack();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of animButtons) {
      const on = b.dataset.iconAnim === curAnim();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of fontButtons) {
      const on = b.dataset.fontProfile === curFont();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of cornerButtons) {
      const on = b.dataset.cornerProfile === curCorner();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of glowButtons) {
      const on = b.dataset.iconGlow === curGlow();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    const packObj = ICON_PACK_OPTIONS.find((o) => o.id === curIconPack()) || ICON_PACK_OPTIONS[0];
    const animObj = ICON_ANIMATION_PROFILES.find((o) => o.id === curAnim()) || ICON_ANIMATION_PROFILES[0];
    previewStageStatus.textContent = `Pack: ${packObj.label} · Motion: ${animObj.label} · Glow: ${curGlow().toUpperCase()}`;
    syncVisibleIcons(previewStage);
  }
  syncBarState();

  return h("div", { class: "theme-immersion-bar", role: "region", "aria-label": "File Manager folder, toolbar and icon immersion effects" },
    previewStage,
    h("div", { class: "theme-pill-row theme-jumpstart-row" },
      h("span", { class: "theme-pill-label" }, "⚡ 1-Click Jumpstart Kits"),
      ...jumpstartButtons,
    ),
    h("div", { class: "theme-pill-row" },
      h("span", { class: "theme-pill-label" }, "🔥 Folder & Toolbar FX"),
      ...uiFxButtons,
    ),
    h("div", { class: "theme-pill-row" },
      h("span", { class: "theme-pill-label" }, `🎭 Custom Icon Pack (${ICON_PACK_OPTIONS.length})`),
      ...iconPackButtons,
    ),
    h("div", { class: "theme-pill-row" },
      h("span", { class: "theme-pill-label" }, "🎬 Icon Animation"),
      ...animButtons,
    ),
    h("div", { class: "theme-pill-row" },
      h("span", { class: "theme-pill-label" }, "🔤 Typography"),
      ...fontButtons,
      h("span", { class: "theme-pill-label", style: "margin-left:0.6rem" }, "📐 Corners"),
      ...cornerButtons,
      h("span", { class: "theme-pill-label", style: "margin-left:0.6rem" }, "💡 Icon Glow"),
      ...glowButtons,
    ),
  );
}

function rgbHueSatLum([r, g, b]) {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60;
  else if (max === gf) h = ((bf - rf) / d + 2) * 60;
  else h = ((rf - gf) / d + 4) * 60;
  return { h, s, l };
}

/** Classifies a theme into a visual color vibe/mood for 1-click gallery filtering. */
export function themeMatchesVibe(t, vibe) {
  if (!vibe || vibe === "all") return true;
  if (vibe === "light") return !t.dark;
  const [bgHex, , accentHex] = t.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
  const bg = parseHexRgb(bgHex);
  if (vibe === "oled") return t.dark && bg[0] <= 14 && bg[1] <= 16 && bg[2] <= 24;
  const { h, s } = rgbHueSatLum(parseHexRgb(accentHex));
  if (s < 0.12) return false;
  if (vibe === "cyan") return h >= 165 && h <= 235;
  if (vibe === "violet") return (h > 235 && h <= 335);
  if (vibe === "emerald") return h >= 85 && h < 165;
  if (vibe === "warm") return h < 85 || h > 335;
  return true;
}

/** Resolves a template's performance & shader tier ("low", "medium", or "ultra"). */
export function resolveTemplateTier(t) {
  if (t?.tier === "ultra" || t?.tier === "medium" || t?.tier === "low") return t.tier;
  if (!t?.hasEffects) return "low";
  if (t?.atmosphere && t.atmosphere !== "none") return "ultra";
  if (t?.preview?.glow === "plasma" || t?.preview?.glow === "laser") return "ultra";
  return "medium";
}

/** Filters a template by its hardware/visual tier ("all", "ultra", "medium", "low"). */
export function themeMatchesTier(t, tier) {
  if (!tier || tier === "all") return true;
  return resolveTemplateTier(t) === tier;
}

const PHYSICS_ATMO_RE = /tesla|plasma|tokamak|cherenkov|collider|hadron|lorenz|lorentz|ferrofluid|hawking|black_hole|dyson|casimir|alcubierre|superconductor|antimatter|magnetar|soliton|sonolum|fusion|wormhole|quantum|relativ|synchrotron|pulsar|quasar|event_horizon|bose_einstein|tachyon|dirac|schwarzschild|zero_point|higgs|strange_matter|jacobs_ladder|ball_lightning|van_de_graaff|tornado|hurricane|supercell|sprite|derecho|thundersnow|haboob|waterspout|volcanic|jupiter|saturn|neptune|venus|microburst|cyclone|noreaster|maelstrom|tempest|typhoon/i;

/** Filters a template by its animation / motion profile ("all", "atmosphere", "physics", "spring", "snappy", "calm", "static"). */
export function themeMatchesAnimation(t, anim) {
  if (!anim || anim === "all") return true;
  const motion = t?.motion || (t?.hasEffects ? "calm" : "none");
  const atmo = t?.atmosphere && t.atmosphere !== "none" ? String(t.atmosphere) : "";
  if (anim === "atmosphere") return Boolean(atmo);
  if (anim === "physics") {
    return Boolean(
      (atmo && PHYSICS_ATMO_RE.test(atmo))
      || PHYSICS_ATMO_RE.test(`${t?.key || ""} ${t?.name || ""} ${t?.description || ""}`)
      || t?.preview?.glow === "plasma"
      || t?.preview?.glow === "laser",
    );
  }
  if (anim === "spring") return motion === "spring" || motion === "elastic";
  if (anim === "snappy") return motion === "snappy";
  if (anim === "calm") return motion === "calm" || motion === "cinematic";
  if (anim === "static") return !t?.hasEffects || motion === "none" || motion === "zero";
  return true;
}

/** Filters a template by its surface material / backdrop shader ("all", "liquid", "mica", "frosted", "solid"). */
export function themeMatchesMaterial(t, mat) {
  if (!mat || mat === "all") return true;
  const b = t?.backdropStyle || (t?.hasEffects ? "glass" : "solid");
  if (mat === "liquid") return b === "liquid";
  if (mat === "mica") return b === "mica" || b === "acrylic";
  if (mat === "frosted") return b === "frosted" || b === "glass";
  if (mat === "solid") return !t?.hasEffects || b === "oled" || b === "matte" || b === "solid";
  return true;
}

/**
 * Hardware VFD & Oscilloscope Phosphor Color Modes:
 * Supports Multi-Channel Studio Spectrum, Classic P31 Green Phosphor, Amber Gas-Plasma, Vacuum Cyan VFD, Apple HIG Studio XDR, and Monochrome Reference.
 */
export const TELEMETRY_PHOSPHOR_MODES = [
  { id: "full_color", label: "🌈 Studio Full-Spectrum", shortLabel: "Full Color", desc: "Multi-channel neon VFD & oscilloscope telemetry" },
  { id: "green_vfd", label: "🟢 Classic Green Phosphor", shortLabel: "Green VFD", desc: "Authentic P31 oscilloscope green CRT phosphor trace" },
  { id: "amber_vfd", label: "🟠 Amber Gas-Plasma", shortLabel: "Amber CRT", desc: "Warm 1986 gas-discharge plasma amber telemetry" },
  { id: "blue_vfd", label: "🔵 Vacuum Cyan VFD", shortLabel: "Cyan VFD", desc: "Fluorescent vacuum-tube hi-fi cyan bargraph display" },
  { id: "cupertino_hig", label: "🍎 Apple HIG Studio XDR", shortLabel: "Apple HIG", desc: "Clean Apple Activity Monitor & XDR specular glass telemetry" },
  { id: "mono", label: "⚪ Monochrome Scope", shortLabel: "Mono Ref", desc: "High-contrast monochrome studio reference waveform" },
];

/**
 * Hardware Telemetry Visual Instrument Skins:
 * Combines P/E logical core bars, oscilloscope history with sample gap markers, 4-quadrant radial gauges, 16-band shader spectrum, and a live Subsystem Load Shedder.
 */
export const TELEMETRY_INSTRUMENT_SKINS = [
  {
    id: "vfd_logical_cores",
    label: "📟 VFD + P/E Cores & Scope",
    desc: "Twin VFD digital readouts, 8 Performance (P-Core) + 8 Efficiency (E-Core) logical bars, 8 GPU Shader bars, and 60-sample Dual-Trace Oscilloscope",
  },
  {
    id: "quadrant_gauges",
    label: "🧭 4-Quadrant Radial Dials",
    desc: "Four precision circular instrument dials: Theme CPU %, GPU Compositor %, Frame Pacing (FPS / ms), and Thermal Wattage Envelope",
  },
  {
    id: "winamp_spectrum",
    label: "📊 16-Band Shader Spectrum",
    desc: "16-band segmented VFD LED spectrum analyzer with floating peak-hold needles driven by active theme shaders",
  },
  {
    id: "subsystem_profiler",
    label: "🔬 Subsystem Load Shedder",
    desc: "Real-time per-subsystem CPU % & GPU % cost breakdown with 1-click [Shed Load] switches to drop heavy effects on the fly",
  },
];

const HEAVY_DISTORTION_FX_SET = new Set([
  "screen_melt_ooze",
  "molten_lava_melt",
  "crt_magnetic_warp",
  "fever_dream_ripple",
  "fire_folders",
  "slime_drip",
  "storm_wind",
  "tesla_arcs",
  "void_tentacles",
  "kaleidoscope_prism",
  "acid_warp",
]);

const APPLE_INDUSTRIAL_FX_SET = new Set([
  "cupertino_ceramic_bevel",
  "swiss_sapphire_chronograph",
  "teenage_field_anodized",
  "blueprint_cad_cyanotype",
  "kyoto_washi_sumi",
  "carbon_kevlar_weave",
  "tahoe_glass_folders",
  "fluent_mica_folders",
  "xdr_titanium_folders",
  "google_material_folders",
  "godmode_omega_halo",
  "godmode_photonic_crystal",
  "godmode_dyson_lattice",
  "godmode_chrono_crystal",
  "godmode_neural_synapse",
  "godmode_zero_point_arc",
]);

function hashKeySeed(str) {
  const s = String(str || "standard");
  let hVal = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hVal ^= s.charCodeAt(i);
    hVal = Math.imul(hVal, 16777619);
  }
  return Math.abs(hVal >>> 0);
}

const staticTelemetryCache = new Map();

/**
 * Estimates & profiles the exact CPU %, GPU %, VRAM (MB), Power (Watts), Frame Time (ms),
 * P-Core / E-Core / GPU Shader Core bar arrays, 16-band spectrum, and per-subsystem resource breakdown
 * for any theme (or the currently active workspace configuration).
 */
export function estimateThemeResourceTelemetry(theme, overrides = {}) {
  const isPlainLocked = Boolean(
    overrides.stripEffects
    || (plainStaticLockKey && theme?.key && plainStaticLockKey === theme.key),
  );
  const jitterPhase = Number(overrides.jitterPhase) || 0;
  const canCache = Boolean(
    theme?.key
    && jitterPhase === 0
    && overrides.backdropStyle === undefined
    && overrides.uiElementFx === undefined
    && overrides.atmosphere === undefined
    && overrides.iconGlow === undefined
    && overrides.hasEffects === undefined,
  );
  const cacheKey = canCache ? `${theme.key}:${isPlainLocked ? 1 : 0}:${theme.hasEffects ? 1 : 0}:${theme.uiElementFx || ""}:${theme.atmosphere || ""}` : "";
  if (cacheKey && staticTelemetryCache.has(cacheKey)) {
    return staticTelemetryCache.get(cacheKey);
  }
  const hasEffects = isPlainLocked ? false : Boolean(theme?.hasEffects ?? overrides.hasEffects);
  const keySeed = hashKeySeed(theme?.key || theme?.name || "standard");
  const wave = jitterPhase ? Math.sin(jitterPhase * 0.65 + (keySeed % 17)) : 0;

  const rawBackdrop = hasEffects ? (overrides.backdropStyle || theme?.backdropStyle || theme?.preview?.backdrop || "glass") : "solid";
  const rawUiFx = isPlainLocked
    ? "off"
    : (overrides.uiElementFx !== undefined && overrides.uiElementFx !== "auto"
        ? overrides.uiElementFx
        : (theme?.uiElementFx || "off"));
  const rawAtmo = isPlainLocked
    ? "none"
    : (overrides.atmosphere !== undefined
        ? overrides.atmosphere
        : (theme?.atmosphere || "none"));
  const rawGlow = isPlainLocked
    ? "off"
    : (overrides.iconGlow !== undefined && overrides.iconGlow !== "off"
        ? overrides.iconGlow
        : (theme?.preview?.glow || "none"));

  // 1. CSS Palette Tokens (always active, near-zero CPU, 0% GPU)
  const cssSub = {
    id: "css_tokens",
    label: "CSS Palette & Contrast Tokens",
    active: true,
    cpuPct: 0.1,
    gpuPct: 0.0,
    vramMb: 1.2,
    desc: "Static CSS custom properties & WCAG contrast variables (0% GPU)",
  };

  // 2. Backdrop Glass & Blur Compositor
  const glassActive = hasEffects && !["solid", "oled", "matte", "none"].includes(rawBackdrop);
  const glassCpu = glassActive ? (rawBackdrop === "liquid" ? 0.5 : 0.3) : 0.0;
  const glassGpu = glassActive ? (rawBackdrop === "liquid" ? 2.4 : rawBackdrop === "acrylic" ? 2.0 : 1.5) : 0.0;
  const glassSub = {
    id: "backdrop_glass",
    label: `Surface Shader (${glassActive ? rawBackdrop : "solid"})`,
    active: glassActive,
    cpuPct: glassCpu,
    gpuPct: glassGpu,
    vramMb: glassActive ? 9.4 : 0.0,
    desc: glassActive ? "Real-time backdrop-filter blur, saturation & specular rim compositing" : "Opaque zero-blur surface rendering",
  };

  // 3. 3D Folder & File Surface Shader (uiElementFx)
  const folderActive = Boolean(rawUiFx && rawUiFx !== "off" && rawUiFx !== "none");
  const isHeavyFolder = folderActive && HEAVY_DISTORTION_FX_SET.has(rawUiFx);
  const isIndustrialFolder = folderActive && APPLE_INDUSTRIAL_FX_SET.has(rawUiFx);
  const folderCpu = !folderActive ? 0.0 : isHeavyFolder ? 0.9 : isIndustrialFolder ? 0.3 : 0.6;
  const folderGpu = !folderActive ? 0.0 : isHeavyFolder ? 3.4 : isIndustrialFolder ? 1.2 : 2.2;
  const folderSub = {
    id: "folder_shader",
    label: `3D Folder & File FX (${folderActive ? rawUiFx : "off"})`,
    active: folderActive,
    cpuPct: folderCpu,
    gpuPct: folderGpu,
    vramMb: folderActive ? (isHeavyFolder ? 14.0 : 6.5) : 0.0,
    desc: folderActive ? "Sculpted 3D folder bevels, document micro-textures & toolbar shader" : "Standard flat system folder & file rows",
  };

  // 4. Live 2D/3D Canvas Atmosphere Engine
  const atmoLayers = (rawAtmo && rawAtmo !== "none") ? String(rawAtmo).split("+").map((s) => s.trim()).filter(Boolean) : [];
  const atmoActive = atmoLayers.length > 0;
  const isPhysicsAtmo = atmoActive && PHYSICS_ATMO_RE.test(rawAtmo);
  const atmoCpu = !atmoActive ? 0.0 : Number((0.85 * atmoLayers.length + (isPhysicsAtmo ? 0.65 : 0.15)).toFixed(1));
  const atmoGpu = !atmoActive ? 0.0 : Number((2.4 * atmoLayers.length + (isPhysicsAtmo ? 1.6 : 0.4)).toFixed(1));
  const atmoSub = {
    id: "atmosphere_canvas",
    label: `Canvas Atmosphere (${atmoActive ? `${atmoLayers.length} layer${atmoLayers.length > 1 ? "s" : ""}` : "off"})`,
    active: atmoActive,
    cpuPct: atmoCpu,
    gpuPct: atmoGpu,
    vramMb: atmoActive ? Number((11.5 * atmoLayers.length).toFixed(1)) : 0.0,
    desc: atmoActive ? `Active particle/shader layers: ${atmoLayers.join(" + ")}` : "No background canvas animation loop running",
  };

  // 5. SVG Turbulence Displacement & Optical Warp Filter
  const svgWarpActive = Boolean(
    folderActive && ["screen_melt_ooze", "molten_lava_melt", "crt_magnetic_warp", "fever_dream_ripple", "acid_warp"].includes(rawUiFx),
  );
  const svgCpu = svgWarpActive ? 0.8 : 0.0;
  const svgGpu = svgWarpActive ? 2.9 : 0.0;
  const svgSub = {
    id: "svg_distortion",
    label: `SVG Melt / Warp Filter (${svgWarpActive ? "active" : "off"})`,
    active: svgWarpActive,
    cpuPct: svgCpu,
    gpuPct: svgGpu,
    vramMb: svgWarpActive ? 8.2 : 0.0,
    desc: svgWarpActive ? "Real-time feTurbulence + feDisplacementMap screen-melt distortion" : "No SVG displacement filter overhead",
  };

  // 6. Specular Rim & Icon Glow
  const glowActive = Boolean(hasEffects && rawGlow && rawGlow !== "none" && rawGlow !== "off");
  const isHyperGlow = glowActive && ["plasma", "laser", "hyper", "neon", "xdr_specular"].includes(rawGlow);
  const glowCpu = !glowActive ? 0.0 : isHyperGlow ? 0.2 : 0.1;
  const glowGpu = !glowActive ? 0.0 : isHyperGlow ? 0.9 : 0.4;
  const glowSub = {
    id: "specular_glow",
    label: `Icon & Specular Glow (${glowActive ? rawGlow : "off"})`,
    active: glowActive,
    cpuPct: glowCpu,
    gpuPct: glowGpu,
    vramMb: glowActive ? 3.2 : 0.0,
    desc: glowActive ? "Display-P3 drop-shadow bloom & interactive cursor spotlight" : "Zero icon drop-shadow filter pass",
  };

  const subsystems = [cssSub, glassSub, folderSub, atmoSub, svgSub, glowSub];
  const baseCpu = subsystems.reduce((acc, s) => acc + s.cpuPct, 0);
  const baseGpu = subsystems.reduce((acc, s) => acc + s.gpuPct, 0);
  const vramMb = Number(subsystems.reduce((acc, s) => acc + s.vramMb, 0).toFixed(1));

  // Add subtle live telemetry breathing when jitterPhase > 0 and effects are active
  const jitterCpu = (baseGpu > 0 && jitterPhase > 0) ? wave * Math.min(0.4, baseCpu * 0.08) : 0;
  const jitterGpu = (baseGpu > 0 && jitterPhase > 0) ? Math.cos(jitterPhase * 0.8 + (keySeed % 11)) * Math.min(0.7, baseGpu * 0.07) : 0;

  const cpuPct = Number(Math.max(0.1, baseCpu + jitterCpu).toFixed(1));
  const gpuPct = Number(Math.max(0.0, baseGpu + jitterGpu).toFixed(1));
  const watts = Number((0.1 + cpuPct * 0.22 + gpuPct * 0.26).toFixed(1));
  const frameTimeMs = Number(Math.max(0.2, 0.2 + cpuPct * 0.28 + gpuPct * 0.36).toFixed(1));
  const fps = frameTimeMs <= 8.3 ? 120 : 60;

  let grade = "ZERO-OVERHEAD";
  let gradeLabel = "🟢 Zero GPU (Plain)";
  if (gpuPct >= 7.5 || cpuPct >= 3.2) {
    grade = "ULTRA-SHADER";
    gradeLabel = "🟠 Ultra Multi-FX";
  } else if (gpuPct >= 3.2 || cpuPct >= 1.5) {
    grade = "PRO-BALANCED";
    gradeLabel = "🟣 Pro 3D Shader";
  } else if (gpuPct > 0) {
    grade = "ECO-LIGHT";
    gradeLabel = "🔵 Eco Glass";
  }

  // Compute 8 Performance (P-Core) loads, 8 Efficiency (E-Core) loads, and 8 GPU Shader Core loads (0..100 scale for VFD bars)
  const pCores = Array.from({ length: 8 }, (_, idx) => {
    if (gpuPct === 0) return idx === 0 ? 3 : 1;
    const harmonic = Math.abs(Math.sin((keySeed + idx * 13) * 0.37 + jitterPhase * 0.45));
    return Math.min(98, Math.max(4, Math.round(cpuPct * 8.5 + harmonic * (cpuPct * 4.2 + 4))));
  });
  const eCores = Array.from({ length: 8 }, (_, idx) => {
    if (gpuPct === 0) return idx < 2 ? 4 : 2;
    const harmonic = Math.abs(Math.cos((keySeed + idx * 7) * 0.51 + jitterPhase * 0.35));
    return Math.min(92, Math.max(3, Math.round(cpuPct * 6.2 + harmonic * (cpuPct * 3.1 + 3))));
  });
  const gpuCores = Array.from({ length: 8 }, (_, idx) => {
    if (gpuPct === 0) return 0;
    const harmonic = Math.abs(Math.sin((keySeed + idx * 19) * 0.41 + jitterPhase * 0.6));
    return Math.min(99, Math.max(6, Math.round(gpuPct * 5.8 + harmonic * (gpuPct * 2.5 + 5))));
  });

  // Compute 16 Winamp / VFD Spectrum Analyzer bands (0..100)
  const spectrumBands = Array.from({ length: 16 }, (_, idx) => {
    if (gpuPct === 0) return idx === 0 ? 6 : 2;
    const subIdx = idx % subsystems.length;
    const subWeight = (subsystems[subIdx].cpuPct * 12) + (subsystems[subIdx].gpuPct * 7.5);
    const osc = Math.abs(Math.sin((keySeed + idx * 11) * 0.29 + jitterPhase * 0.75));
    return Math.min(98, Math.max(5, Math.round(subWeight + (cpuPct + gpuPct) * 2.8 * osc)));
  });

  const out = {
    themeKey: theme?.key || "",
    themeName: theme?.name || "Standard (System Auto)",
    cpuPct,
    gpuPct,
    vramMb,
    watts,
    fps,
    frameTimeMs,
    grade,
    gradeLabel,
    pCores,
    eCores,
    gpuCores,
    spectrumBands,
    subsystems,
  };
  if (cacheKey) {
    staticTelemetryCache.set(cacheKey, out);
  }
  return out;
}

let telemetryActivePhosphor = "full_color";
let telemetryActiveSkin = "vfd_logical_cores";
let telemetryPopoutInterval = 0;
let telemetryPopoutEscHandler = null;

/** Returns true if the floating Desktop Telemetry HUD is currently open in the DOM. */
export function isTelemetryPopoutHudOpen() {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.getElementById("fm-telemetry-popout-hud")
    || document.getElementById("fm-tmog-popout-hud")
    || document.querySelector(".fm-telemetry-popout-hud, .theme-tmog-popout-hud"),
  );
}

/**
 * Builds the interactive **Live Theme CPU & GPU Telemetry Studio** deck
 * (`[data-telemetry-deck="true"]`). Equipped with P-Core/E-Core logical bars,
 * GPU shader bars, 60-sample Dual-Trace Oscilloscope with Sample Gap markers,
 * 4-Quadrant Radial Dials, 16-Band Shader Spectrum, and 1-Click Subsystem Load Shedder.
 */
export function buildThemeTelemetryDeck({
  themes = [],
  getTargetKey = () => state.settings?.palette || "",
  onStateMutated = () => {},
  isPopout = false,
  onCloseDrawer = null,
} = {}) {
  let inspectedKey = getTargetKey();
  let paused = false;
  let tickPhase = 1;
  let shedSubsystems = new Set();
  const historySamples = [];
  const peakCoreHold = { p: new Array(8).fill(0), e: new Array(8).fill(0), g: new Array(8).fill(0), spec: new Array(16).fill(0) };
  let peakCpu = 0;
  let peakGpu = 0;

  const resolveInspectedTheme = () => {
    const k = inspectedKey ?? getTargetKey() ?? "";
    return k ? themes.find((t) => t.key === k) || null : null;
  };

  const computeEffectiveOverrides = (tObj) => {
    const isWorkspaceTheme = (tObj?.key || "") === (state.settings?.palette || "");
    const ov = {};
    if (isWorkspaceTheme && state.settings) {
      if (state.settings.uiElementFx && state.settings.uiElementFx !== "auto") ov.uiElementFx = state.settings.uiElementFx;
      if (state.settings.atmosphere) ov.atmosphere = state.settings.atmosphere;
      if (state.settings.themeIconGlow) ov.iconGlow = state.settings.themeIconGlow;
    }
    if (shedSubsystems.has("backdrop_glass")) ov.backdropStyle = "solid";
    if (shedSubsystems.has("folder_shader")) ov.uiElementFx = "off";
    if (shedSubsystems.has("atmosphere_canvas")) ov.atmosphere = "none";
    if (shedSubsystems.has("svg_distortion") && HEAVY_DISTORTION_FX_SET.has(ov.uiElementFx || tObj?.uiElementFx)) {
      ov.uiElementFx = "cupertino_ceramic_bevel";
    }
    if (shedSubsystems.has("specular_glow")) ov.iconGlow = "off";
    ov.jitterPhase = paused ? 0 : tickPhase;
    return ov;
  };

  // Seed initial 36 oscilloscope samples so the waveform looks rich immediately
  const seedHistory = (tObj) => {
    historySamples.length = 0;
    peakCpu = 0;
    peakGpu = 0;
    for (let i = 0; i < 36; i++) {
      const snap = estimateThemeResourceTelemetry(tObj, { ...computeEffectiveOverrides(tObj), jitterPhase: i + 1 });
      historySamples.push({ cpu: snap.cpuPct, gpu: snap.gpuPct, gap: false });
      if (snap.cpuPct > peakCpu) peakCpu = snap.cpuPct;
      if (snap.gpuPct > peakGpu) peakGpu = snap.gpuPct;
    }
  };
  seedHistory(resolveInspectedTheme());

  const deckRoot = h("div", {
    class: `telemetry-studio-deck${isPopout ? " is-popout" : ""}`,
    "data-telemetry-deck": "true",
    "data-telemetry-phosphor": telemetryActivePhosphor,
    "data-telemetry-skin": telemetryActiveSkin,
    role: "region",
    "aria-label": "Live Theme CPU and GPU Telemetry Monitor",
  });

  const titleNameEl = h("strong", { class: "telemetry-deck-theme-name", "data-telemetry-theme-name": "true" });
  const gradePillEl = h("span", { class: "telemetry-deck-grade-pill", "data-telemetry-grade": "true" });
  const cpuValEl = h("span", { class: "telemetry-vfd-big-num", "data-telemetry-cpu-val": "true" });
  const cpuPeakEl = h("span", { class: "telemetry-vfd-sub-meta", "data-telemetry-cpu-peak": "true" });
  const gpuValEl = h("span", { class: "telemetry-vfd-big-num", "data-telemetry-gpu-val": "true" });
  const gpuPeakEl = h("span", { class: "telemetry-vfd-sub-meta", "data-telemetry-gpu-peak": "true" });
  const frameValEl = h("span", { class: "telemetry-vfd-big-num", "data-telemetry-frametime-val": "true" });
  const frameSubEl = h("span", { class: "telemetry-vfd-sub-meta", "data-telemetry-fps-val": "true" });
  const powerValEl = h("span", { class: "telemetry-vfd-big-num", "data-telemetry-power-val": "true" });
  const vramSubEl = h("span", { class: "telemetry-vfd-sub-meta", "data-telemetry-vram-val": "true" });
  const stageEl = h("div", { class: "telemetry-instrument-stage", "data-telemetry-stage": "true" });

  const skinButtons = TELEMETRY_INSTRUMENT_SKINS.map((sk) =>
    h("button", {
      type: "button",
      class: `telemetry-pill-btn${telemetryActiveSkin === sk.id ? " is-active" : ""}`,
      "data-telemetry-skin-btn": sk.id,
      "aria-pressed": String(telemetryActiveSkin === sk.id),
      title: sk.desc,
      onclick: (e) => {
        e.stopPropagation();
        telemetryActiveSkin = sk.id;
        deckRoot.setAttribute("data-telemetry-skin", sk.id);
        renderDeck();
      },
    }, sk.label),
  );

  const phosphorButtons = TELEMETRY_PHOSPHOR_MODES.map((pm) =>
    h("button", {
      type: "button",
      class: `telemetry-pill-btn telemetry-phosphor-pill${telemetryActivePhosphor === pm.id ? " is-active" : ""}`,
      "data-telemetry-phosphor-btn": pm.id,
      "aria-pressed": String(telemetryActivePhosphor === pm.id),
      title: pm.desc,
      onclick: (e) => {
        e.stopPropagation();
        telemetryActivePhosphor = pm.id;
        deckRoot.setAttribute("data-telemetry-phosphor", pm.id);
        renderDeck();
      },
    }, pm.shortLabel),
  );

  const pauseBtn = h("button", {
    type: "button",
    class: "telemetry-pill-btn",
    "data-telemetry-pause-btn": "true",
    "aria-pressed": "false",
    title: "Pause / resume oscilloscope sampling (records a sample gap marker while paused)",
    onclick: (e) => {
      e.stopPropagation();
      paused = !paused;
      if (paused) {
        historySamples.push({ cpu: 0, gpu: 0, gap: true });
        if (historySamples.length > 48) historySamples.shift();
      }
      pauseBtn.textContent = paused ? "▶ Resume Scope" : "⏸ Pause (Gap)";
      pauseBtn.setAttribute("aria-pressed", String(paused));
      renderDeck();
    },
  }, "⏸ Pause (Gap)");

  const shedAllBtn = h("button", {
    type: "button",
    class: "telemetry-pill-btn telemetry-eco-btn",
    "data-telemetry-shed-all-btn": "true",
    title: "Immediately shed all GPU shaders, canvas animations & blur to run at 0.0% GPU / 0.1% CPU",
    onclick: async (e) => {
      e.stopPropagation();
      shedSubsystems = new Set(["backdrop_glass", "folder_shader", "atmosphere_canvas", "svg_distortion", "specular_glow"]);
      await disableAllThemeAnimations({ quiet: false, keepTelemetryHud: true });
      const tObj = resolveInspectedTheme();
      seedHistory(tObj);
      renderDeck();
      onStateMutated();
    },
  }, "⚡ 0% GPU Eco Mode");

  const popoutToggleBtn = !isPopout
    ? h("button", {
        type: "button",
        class: `telemetry-pill-btn telemetry-popout-btn${isTelemetryPopoutHudOpen() ? " is-active" : ""}`,
        "data-telemetry-popout-btn": "true",
        "aria-pressed": String(isTelemetryPopoutHudOpen()),
        title: "Toggle the floating Live CPU & GPU Telemetry HUD over the File Manager workspace on or off",
        onclick: (e) => {
          e.stopPropagation();
          if (isTelemetryPopoutHudOpen()) {
            closeTelemetryPopoutHud();
            toast("Closed floating CPU & GPU Telemetry HUD.", { kind: "info" });
          } else {
            void showTelemetryPopoutHud(themes);
            toast("Pinned floating Live CPU & GPU Telemetry HUD to workspace.", { kind: "info" });
          }
        },
      }, isTelemetryPopoutHudOpen() ? "✕ Hide Floating HUD" : "📌 Pin Floating HUD")
    : h("button", {
        type: "button",
        class: "telemetry-pill-btn telemetry-close-popout-btn",
        "data-telemetry-close-popout": "true",
        title: "Close floating Live CPU & GPU Telemetry HUD (Esc)",
        onclick: (e) => {
          e.stopPropagation();
          closeTelemetryPopoutHud();
        },
      }, "✕ Close HUD");

  const drawerCloseBtn = !isPopout
    ? h("button", {
        type: "button",
        class: "telemetry-pill-btn telemetry-close-popout-btn",
        "data-telemetry-close-drawer": "true",
        title: "Hide the CPU & GPU Telemetry Monitor",
        onclick: (e) => {
          e.stopPropagation();
          closeTelemetryPopoutHud();
          if (typeof onCloseDrawer === "function") {
            onCloseDrawer();
          } else {
            const parentDetails = deckRoot.closest?.("details");
            if (parentDetails) parentDetails.open = false;
          }
        },
      }, "✕ Hide Monitor")
    : null;

  function buildScopeSvg(snap) {
    const w = 360;
    const hPx = 76;
    const pts = historySamples.slice(-36);
    const maxScale = Math.max(16, peakGpu + 4, peakCpu + 4);
    const cpuPoints = [];
    const gpuPoints = [];
    const gapRects = [];
    pts.forEach((pt, idx) => {
      const x = Math.round((idx / Math.max(1, pts.length - 1)) * (w - 12) + 6);
      if (pt.gap) {
        gapRects.push(`<rect x="${x - 3}" y="4" width="6" height="${hPx - 8}" fill="rgba(255,90,90,0.28)" />`);
      }
      const yCpu = Math.round(hPx - 8 - (Math.min(maxScale, pt.cpu) / maxScale) * (hPx - 18));
      const yGpu = Math.round(hPx - 8 - (Math.min(maxScale, pt.gpu) / maxScale) * (hPx - 18));
      cpuPoints.push(`${x},${yCpu}`);
      gpuPoints.push(`${x},${yGpu}`);
    });
    const gpuArea = gpuPoints.length > 1
      ? `M 6,${hPx - 6} L ${gpuPoints.join(" L ")} L ${w - 6},${hPx - 6} Z`
      : "";
    const cpuLine = cpuPoints.length > 1 ? `M ${cpuPoints.join(" L ")}` : "";
    const gpuLine = gpuPoints.length > 1 ? `M ${gpuPoints.join(" L ")}` : "";

    const wrap = h("div", { class: "telemetry-scope-box", "data-telemetry-scope-svg": "true" });
    wrap.innerHTML = `<svg viewBox="0 0 ${w} ${hPx}" width="100%" height="${hPx}" class="telemetry-scope-svg" aria-label="Oscilloscope CPU and GPU History Waveform">
      <defs>
        <pattern id="telemetry-grid-pat" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M 18 0 L 0 0 0 18" fill="none" stroke="currentColor" stroke-opacity="0.14" stroke-width="0.7" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="${w}" height="${hPx}" fill="url(#telemetry-grid-pat)" />
      <line x1="0" y1="${Math.round(hPx * 0.35)}" x2="${w}" y2="${Math.round(hPx * 0.35)}" stroke="currentColor" stroke-opacity="0.22" stroke-dasharray="3 3" stroke-width="0.8" />
      ${gapRects.join("")}
      ${gpuArea ? `<path d="${gpuArea}" class="telemetry-scope-gpu-area" />` : ""}
      ${gpuLine ? `<path d="${gpuLine}" class="telemetry-scope-gpu-line" fill="none" stroke-width="2" />` : ""}
      ${cpuLine ? `<path d="${cpuLine}" class="telemetry-scope-cpu-line" fill="none" stroke-width="1.8" />` : ""}
    </svg>`;
    const legend = h("div", { class: "telemetry-scope-legend" },
      h("span", {}, `📈 Dual-Trace Scope (60-Sample Ring · Scale 0–${Math.round(maxScale)}%)`),
      h("span", {}, `CPU ${snap.cpuPct.toFixed(1)}% · GPU ${snap.gpuPct.toFixed(1)}%${paused ? " · [SAMPLE GAP PAUSED]" : ""}`),
    );
    wrap.append(legend);
    return wrap;
  }

  function renderVfdLogicalCoresSkin(snap) {
    snap.pCores.forEach((v, i) => { if (v > peakCoreHold.p[i]) peakCoreHold.p[i] = v; });
    snap.eCores.forEach((v, i) => { if (v > peakCoreHold.e[i]) peakCoreHold.e[i] = v; });
    snap.gpuCores.forEach((v, i) => { if (v > peakCoreHold.g[i]) peakCoreHold.g[i] = v; });

    const makeCoreStrip = (title, values, peaks, corePrefix) =>
      h("div", { class: "telemetry-core-cluster", "data-telemetry-core-cluster": corePrefix },
        h("div", { class: "telemetry-core-cluster-title" }, title),
        h("div", { class: "telemetry-core-bars" },
          ...values.map((val, idx) =>
            h("div", {
              class: "telemetry-core-col",
              "data-telemetry-core-bar": `${corePrefix}${idx}`,
              title: `${corePrefix.toUpperCase()}${idx}: ${val}% (Peak ${peaks[idx]}%)`,
            },
              h("div", { class: "telemetry-core-track" },
                h("span", { class: "telemetry-core-peak-cap", style: `bottom:${Math.min(96, peaks[idx])}%` }),
                h("span", { class: "telemetry-core-fill", style: `height:${val}%` }),
              ),
              h("span", { class: "telemetry-core-idx" }, `${corePrefix}${idx}`),
            ),
          ),
        ),
      );

    return h("div", { class: "telemetry-skin-vfd-grid" },
      makeCoreStrip("⚡ P-CORES (PERFORMANCE 0–7)", snap.pCores, peakCoreHold.p, "P"),
      makeCoreStrip("🍃 E-CORES (EFFICIENCY 0–7)", snap.eCores, peakCoreHold.e, "E"),
      makeCoreStrip("💠 GPU SHADER CORES (0–7)", snap.gpuCores, peakCoreHold.g, "G"),
      buildScopeSvg(snap),
    );
  }

  function renderQuadrantGaugesSkin(snap) {
    const dials = [
      { id: "cpu", label: "THEME CPU LOAD", value: `${snap.cpuPct.toFixed(1)}%`, pct: Math.min(100, snap.cpuPct * 12), sub: `Peak ${peakCpu.toFixed(1)}% · 16 Threads` },
      { id: "gpu", label: "GPU COMPOSITOR", value: `${snap.gpuPct.toFixed(1)}%`, pct: Math.min(100, snap.gpuPct * 6.5), sub: `Peak ${peakGpu.toFixed(1)}% · ${snap.vramMb} MB VRAM` },
      { id: "fps", label: "FRAME PACING", value: `${snap.fps} FPS`, pct: Math.min(100, Math.round((snap.fps / 120) * 100)), sub: `${snap.frameTimeMs} ms / frame budget` },
      { id: "watts", label: "ENERGY & THERMAL", value: `${snap.watts.toFixed(1)} W`, pct: Math.min(100, Math.round(snap.watts * 18)), sub: snap.gradeLabel },
    ];
    return h("div", { class: "telemetry-quadrant-grid" },
      ...dials.map((d) => {
        const radius = 28;
        const circum = 2 * Math.PI * radius;
        const dash = ((d.pct / 100) * circum).toFixed(1);
        const dialBox = h("div", { class: "telemetry-radial-card", "data-telemetry-dial": d.id });
        const svgWrap = h("div", { class: "telemetry-radial-svg-wrap" });
        svgWrap.innerHTML = `<svg viewBox="0 0 72 72" width="68" height="68" aria-hidden="true">
          <circle cx="36" cy="36" r="${radius}" fill="none" stroke="currentColor" stroke-opacity="0.16" stroke-width="6" />
          <circle cx="36" cy="36" r="${radius}" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${dash} ${circum.toFixed(1)}" transform="rotate(-90 36 36)" class="telemetry-radial-arc" />
        </svg>`;
        svgWrap.append(h("span", { class: "telemetry-radial-center-val" }, d.value));
        dialBox.append(
          h("div", { class: "telemetry-radial-title" }, d.label),
          svgWrap,
          h("div", { class: "telemetry-radial-sub" }, d.sub),
        );
        return dialBox;
      }),
    );
  }

  function renderWinampSpectrumSkin(snap) {
    const bandLabels = [
      "PAL", "VARS", "BLUR", "GLAS", "3DFX", "BEVL", "ICON", "GLOW",
      "ATMO", "PTCL", "PHYS", "WARP", "TURB", "DISP", "COMP", "SYNC",
    ];
    snap.spectrumBands.forEach((v, i) => { if (v > peakCoreHold.spec[i]) peakCoreHold.spec[i] = v; });
    return h("div", { class: "telemetry-spectrum-wrap" },
      h("div", { class: "telemetry-spectrum-head" },
        h("span", {}, "📊 16-BAND SHADER & COMPOSITOR SPECTRUM ANALYZER (PEAK HOLD ACTIVE)"),
        h("span", {}, `${snap.fps} HZ · ${snap.frameTimeMs} MS`),
      ),
      h("div", { class: "telemetry-spectrum-bars" },
        ...snap.spectrumBands.map((val, idx) =>
          h("div", {
            class: "telemetry-spectrum-col",
            "data-telemetry-spectrum-band": String(idx),
            title: `Band ${bandLabels[idx]}: ${val}% (Peak ${peakCoreHold.spec[idx]}%)`,
          },
            h("div", { class: "telemetry-spectrum-track" },
              h("span", { class: "telemetry-core-peak-cap", style: `bottom:${Math.min(96, peakCoreHold.spec[idx])}%` }),
              h("span", { class: "telemetry-spectrum-fill", style: `height:${val}%` }),
            ),
            h("span", { class: "telemetry-spectrum-lbl" }, bandLabels[idx]),
          ),
        ),
      ),
    );
  }

  function renderSubsystemProfilerSkin(snap) {
    return h("div", { class: "telemetry-subsystems-wrap" },
      h("div", { class: "telemetry-subsystems-list" },
        ...snap.subsystems.map((sub) => {
          const canShed = sub.id !== "css_tokens";
          const isShed = shedSubsystems.has(sub.id);
          return h("div", {
            class: `telemetry-subsystem-row${sub.active ? " is-active" : " is-idle"}`,
            "data-telemetry-subsystem-row": sub.id,
          },
            h("div", { class: "telemetry-subsystem-main" },
              h("strong", { class: "telemetry-subsystem-title" }, `${sub.active ? "🟢" : "⚫"} ${sub.label}`),
              h("span", { class: "telemetry-subsystem-desc" }, sub.desc),
            ),
            h("div", { class: "telemetry-subsystem-metrics" },
              h("span", { class: "telemetry-subsystem-chip" }, `CPU ${sub.cpuPct.toFixed(1)}%`),
              h("span", { class: "telemetry-subsystem-chip" }, `GPU ${sub.gpuPct.toFixed(1)}%`),
              h("span", { class: "telemetry-subsystem-chip" }, `${sub.vramMb.toFixed(1)} MB`),
              canShed
                ? h("button", {
                    type: "button",
                    class: `telemetry-pill-btn telemetry-shed-sub-btn${isShed ? " is-active" : ""}`,
                    "data-telemetry-subsystem-toggle": sub.id,
                    title: isShed ? `Restore ${sub.label}` : `Shed ${sub.label} to reduce CPU & GPU usage`,
                    onclick: async (e) => {
                      e.stopPropagation();
                      if (shedSubsystems.has(sub.id)) shedSubsystems.delete(sub.id);
                      else shedSubsystems.add(sub.id);
                      if (sub.id === "atmosphere_canvas" && shedSubsystems.has(sub.id)) {
                        try { applyAtmosphere("none"); } catch {}
                        if (state.settings) state.settings.atmosphere = "none";
                      } else if (sub.id === "folder_shader" && shedSubsystems.has(sub.id)) {
                        if (state.settings) state.settings.uiElementFx = "off";
                        applyUiImmersionProfiles({ uiElementFx: "off" });
                      } else if (sub.id === "specular_glow" && shedSubsystems.has(sub.id)) {
                        if (state.settings) state.settings.themeIconGlow = "off";
                        applyUiImmersionProfiles({ themeIconGlow: "off" });
                      }
                      renderDeck();
                      onStateMutated();
                    },
                  }, isShed ? "↺ Restore" : "⚡ Shed Load")
                : h("span", { class: "telemetry-subsystem-base-tag" }, "Core Base"),
            ),
          );
        }),
      ),
    );
  }

  function renderDeck() {
    const tObj = resolveInspectedTheme();
    const snap = estimateThemeResourceTelemetry(tObj, computeEffectiveOverrides(tObj));
    if (snap.cpuPct > peakCpu) peakCpu = snap.cpuPct;
    if (snap.gpuPct > peakGpu) peakGpu = snap.gpuPct;

    titleNameEl.textContent = `📟 Live CPU & GPU Telemetry — ${snap.themeName}`;
    gradePillEl.textContent = snap.gradeLabel;
    gradePillEl.setAttribute("data-grade", snap.grade);

    cpuValEl.textContent = `${snap.cpuPct.toFixed(1)}%`;
    cpuPeakEl.textContent = `PEAK ${peakCpu.toFixed(1)}% · 8P+8E CORES`;
    gpuValEl.textContent = `${snap.gpuPct.toFixed(1)}%`;
    gpuPeakEl.textContent = `PEAK ${peakGpu.toFixed(1)}% · SHADER/COMP`;
    frameValEl.textContent = `${snap.frameTimeMs.toFixed(1)} ms`;
    frameSubEl.textContent = `${snap.fps} FPS TARGET`;
    powerValEl.textContent = `${snap.watts.toFixed(1)} W`;
    vramSubEl.textContent = `${snap.vramMb.toFixed(1)} MB VRAM`;

    for (const b of skinButtons) {
      const on = b.dataset.telemetrySkinBtn === telemetryActiveSkin;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of phosphorButtons) {
      const on = b.dataset.telemetryPhosphorBtn === telemetryActivePhosphor;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }

    if (telemetryActiveSkin === "quadrant_gauges") {
      stageEl.replaceChildren(renderQuadrantGaugesSkin(snap));
    } else if (telemetryActiveSkin === "winamp_spectrum") {
      stageEl.replaceChildren(renderWinampSpectrumSkin(snap));
    } else if (telemetryActiveSkin === "subsystem_profiler") {
      stageEl.replaceChildren(renderSubsystemProfilerSkin(snap));
    } else {
      stageEl.replaceChildren(renderVfdLogicalCoresSkin(snap));
    }
  }

  deckRoot.append(
    h("div", { class: "telemetry-deck-header" },
      h("div", { class: "telemetry-deck-title-wrap" }, titleNameEl, gradePillEl),
      h("div", { class: "telemetry-deck-controls" },
        h("div", { class: "telemetry-btn-group", role: "group", "aria-label": "Telemetry Instrument Skin" }, ...skinButtons),
        h("div", { class: "telemetry-btn-group", role: "group", "aria-label": "Telemetry Phosphor Color Mode" }, ...phosphorButtons),
        pauseBtn,
        shedAllBtn,
        popoutToggleBtn,
        drawerCloseBtn,
      ),
    ),
    h("div", { class: "telemetry-vfd-readout-strip", "data-telemetry-readouts": "true" },
      h("div", { class: "telemetry-vfd-cell" },
        h("span", { class: "telemetry-vfd-label" }, "THEME CPU USAGE"),
        cpuValEl,
        cpuPeakEl,
      ),
      h("div", { class: "telemetry-vfd-cell" },
        h("span", { class: "telemetry-vfd-label" }, "THEME GPU / SHADER"),
        gpuValEl,
        gpuPeakEl,
      ),
      h("div", { class: "telemetry-vfd-cell" },
        h("span", { class: "telemetry-vfd-label" }, "COMPOSITOR FRAME TIME"),
        frameValEl,
        frameSubEl,
      ),
      h("div", { class: "telemetry-vfd-cell" },
        h("span", { class: "telemetry-vfd-label" }, "EST. POWER & VRAM"),
        powerValEl,
        vramSubEl,
      ),
    ),
    stageEl,
  );

  renderDeck();

  deckRoot.inspectTheme = (newKey, force = false) => {
    const nextKey = newKey ?? "";
    if (!force && inspectedKey === nextKey) return;
    inspectedKey = nextKey;
    shedSubsystems.clear();
    const parentDetails = !isPopout ? deckRoot.closest?.("details") : null;
    if (parentDetails && !parentDetails.open) return;
    Object.values(peakCoreHold).forEach((arr) => arr.fill(0));
    seedHistory(resolveInspectedTheme());
    renderDeck();
  };

  deckRoot.stepSample = () => {
    if (paused) return;
    tickPhase += 1;
    const tObj = resolveInspectedTheme();
    const snap = estimateThemeResourceTelemetry(tObj, computeEffectiveOverrides(tObj));
    historySamples.push({ cpu: snap.cpuPct, gpu: snap.gpuPct, gap: false });
    if (historySamples.length > 48) historySamples.shift();
    renderDeck();
  };

  return deckRoot;
}

/** Closes the floating Desktop Telemetry HUD if open, and cleans up timers/listeners. */
export function closeTelemetryPopoutHud() {
  if (telemetryPopoutInterval) {
    clearInterval(telemetryPopoutInterval);
    telemetryPopoutInterval = 0;
  }
  if (telemetryPopoutEscHandler && typeof window !== "undefined") {
    window.removeEventListener("keydown", telemetryPopoutEscHandler, true);
    telemetryPopoutEscHandler = null;
  }
  if (typeof document !== "undefined") {
    for (const el of document.querySelectorAll("#fm-telemetry-popout-hud, #fm-tmog-popout-hud, .fm-telemetry-popout-hud, .theme-tmog-popout-hud")) {
      el.remove();
    }
    for (const btn of document.querySelectorAll("[data-telemetry-popout-btn]")) {
      btn.textContent = "📌 Pin Floating HUD";
      btn.classList.remove("is-active");
      btn.setAttribute("aria-pressed", "false");
    }
  }
}

/** Toggles the floating Desktop Telemetry HUD open or closed. */
export async function toggleTelemetryPopoutHud(existingThemes) {
  if (isTelemetryPopoutHudOpen()) {
    closeTelemetryPopoutHud();
    return null;
  }
  return showTelemetryPopoutHud(existingThemes);
}

/**
 * Launches or updates the floating desktop **Live Theme CPU & GPU Telemetry Popout HUD**
 * (`#fm-telemetry-popout-hud`) over the File Manager workspace so users can monitor theme CPU/GPU usage live.
 */
export async function showTelemetryPopoutHud(existingThemes) {
  if (typeof document === "undefined" || !document.body) return null;
  closeTelemetryPopoutHud();
  let themes = existingThemes;
  if (!Array.isArray(themes) || !themes.length) {
    try {
      themes = await themeList();
    } catch {
      themes = [];
    }
  }
  const deck = buildThemeTelemetryDeck({
    themes,
    getTargetKey: () => state.settings?.palette || "",
    isPopout: true,
  });

  let minimized = false;
  const minBtn = h("button", {
    type: "button",
    class: "telemetry-pill-btn telemetry-top-min-btn",
    "data-telemetry-minimize": "true",
    title: "Minimize or expand the floating CPU & GPU Telemetry HUD",
    onclick: (e) => {
      e.stopPropagation();
      minimized = !minimized;
      wrap.classList.toggle("is-minimized", minimized);
      minBtn.textContent = minimized ? "➕ Expand" : "➖ Minimize";
    },
  }, "➖ Minimize");

  const topBar = h("div", { class: "fm-telemetry-popout-topbar" },
    h("div", { class: "fm-telemetry-popout-title" },
      h("button", {
        type: "button",
        class: "traffic-dot is-red telemetry-traffic-close",
        "data-telemetry-traffic-close": "true",
        "aria-label": "Close CPU and GPU Telemetry HUD",
        title: "Close CPU & GPU Telemetry HUD (Esc)",
        onclick: (e) => {
          e.stopPropagation();
          closeTelemetryPopoutHud();
        },
      }),
      h("span", {}, "📟 CPU & GPU Hardware Monitor"),
    ),
    h("div", { class: "fm-telemetry-popout-actions" },
      minBtn,
      h("button", {
        type: "button",
        class: "telemetry-pill-btn telemetry-close-popout-btn telemetry-top-close-btn",
        "data-telemetry-top-close": "true",
        "aria-label": "Close CPU and GPU Telemetry HUD",
        title: "Close floating CPU & GPU Telemetry HUD (Esc)",
        onclick: (e) => {
          e.stopPropagation();
          closeTelemetryPopoutHud();
        },
      }, "✕ Close (Esc)"),
    ),
  );

  const wrap = h("aside", {
    id: "fm-telemetry-popout-hud",
    class: "fm-telemetry-popout-hud",
    role: "complementary",
    "aria-label": "Floating Live CPU and GPU Telemetry HUD",
  }, topBar, deck);
  document.body.appendChild(wrap);

  for (const btn of document.querySelectorAll("[data-telemetry-popout-btn]")) {
    btn.textContent = "✕ Hide Floating HUD";
    btn.classList.add("is-active");
    btn.setAttribute("aria-pressed", "true");
  }

  if (typeof window !== "undefined") {
    telemetryPopoutEscHandler = (e) => {
      if (e.key === "Escape") {
        closeTelemetryPopoutHud();
      }
    };
    window.addEventListener("keydown", telemetryPopoutEscHandler, true);
  }

  telemetryPopoutInterval = setInterval(() => {
    if (!document.getElementById("fm-telemetry-popout-hud")) {
      closeTelemetryPopoutHud();
      return;
    }
    deck.stepSample?.();
  }, 1200);
  return wrap;
}

function swatch(theme) {
  const [sBg, sPanel, sAccent, sText] = theme.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
  const p = theme.preview ?? {
    bg: sBg, panel: sPanel, accent: sAccent, text: sText, muted: sText,
    border: sPanel, selected: sAccent, selectedText: sBg,
    radius: "soft", glow: "none", glowColor: sAccent, borderStyle: "flat",
  };
  const [outerR, pillR] = RADIUS_PX[p.radius] ?? RADIUS_PX.soft;
  const box = h("span", {
    class: "theme-swatch",
    "aria-hidden": "true",
    "data-sw-glow": p.glow ?? "none",
    "data-sw-border": p.borderStyle ?? "flat",
  },
    h("span", { class: "theme-swatch-side" },
      h("span", { class: "theme-swatch-dot" }),
      h("span", { class: "theme-swatch-bar" }),
      h("span", { class: "theme-swatch-bar short" }),
    ),
    h("span", { class: "theme-swatch-main" },
      h("span", { class: "theme-swatch-pill" },
        h("span", { class: "theme-swatch-pill-dot" }),
        h("span", { class: "theme-swatch-pill-label" }, "Aa"),
      ),
      h("span", { class: "theme-swatch-row" },
        h("span", { class: "theme-swatch-text" }, "File"),
        h("span", { class: "theme-swatch-meta" }),
      ),
    ),
  );
  const vars = [
    ["--sw-bg", p.bg],
    ["--sw-panel", p.panel],
    ["--sw-accent", p.accent],
    ["--sw-text", p.text],
    ["--sw-muted", p.muted],
    ["--sw-border", p.border],
    ["--sw-selected", p.selected],
    ["--sw-selected-text", p.selectedText],
    ["--sw-glow", p.glowColor],
    ["--sw-radius", outerR],
    ["--sw-pill-radius", pillR],
  ];
  for (const [k, v] of vars) box.style.setProperty(k, v);
  return box;
}

function defaultSwatch() {
  return h("span", { class: "theme-swatch theme-swatch-default", "aria-hidden": "true" },
    h("span", { class: "theme-swatch-side" },
      h("span", { class: "theme-swatch-dot" }),
      h("span", { class: "theme-swatch-bar" }),
      h("span", { class: "theme-swatch-bar short" }),
    ),
    h("span", { class: "theme-swatch-main" },
      h("span", { class: "theme-swatch-pill" },
        h("span", { class: "theme-swatch-pill-dot" }),
        h("span", { class: "theme-swatch-pill-label" }, "Aa"),
      ),
      h("span", { class: "theme-swatch-row" },
        h("span", { class: "theme-swatch-text" }, "File"),
        h("span", { class: "theme-swatch-meta" }),
      ),
    ),
  );
}

const RECENT_KEY = "fm_recent_themes";
const FAVORITE_KEY = "fm_favorite_themes";
const MAX_RECENT = 6;
const MAX_FAVORITE = 50;
const VALID_KEY = /^[a-z0-9_]{1,60}$/;

function cleanKeys(list, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const k of list) {
    if (typeof k === "string" && VALID_KEY.test(k) && !out.includes(k) && out.length < max) out.push(k);
  }
  return out;
}

/** The keys of the themes pinned as favorites, newest first. */
export function favoriteKeys() {
  const fromSettings = cleanKeys(state.settings?.favoriteThemes, MAX_FAVORITE);
  if (fromSettings.length || Array.isArray(state.settings?.favoriteThemes)) return fromSettings;
  try {
    return cleanKeys(JSON.parse(localStorage.getItem(FAVORITE_KEY) ?? "[]"), MAX_FAVORITE);
  } catch {
    return [];
  }
}

export function isFavoriteTheme(key) {
  return typeof key === "string" && favoriteKeys().includes(key);
}

/** Pins or unpins a theme `key` as a favorite. Resolves true when pinned, false when unpinned. */
export async function toggleFavoriteTheme(key) {
  if (typeof key !== "string" || !VALID_KEY.test(key)) return false;
  const current = favoriteKeys();
  const pinned = !current.includes(key);
  const next = pinned ? [key, ...current].slice(0, MAX_FAVORITE) : current.filter((k) => k !== key);
  if (state.settings) state.settings.favoriteThemes = next;
  try {
    localStorage.setItem(FAVORITE_KEY, JSON.stringify(next));
  } catch { /* storage is off */ }
  await saveSettings({ favoriteThemes: next });
  return pinned;
}

/** The favorite themes that still exist: [{ key, name, dark, ... }], in pinned order. */
export async function favoriteThemes() {
  const keys = favoriteKeys();
  if (!keys.length) return [];
  try {
    const all = await themeList();
    return keys.map((k) => all.find((t) => t.key === k)).filter(Boolean);
  } catch {
    return [];
  }
}

/** The keys of the themes used lately, newest first (kept in this window's own storage, never sent anywhere). */
function recentKeys() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return cleanKeys(list, MAX_RECENT);
  } catch {
    return [];
  }
}

function rememberTheme(key) {
  if (!key) return;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...recentKeys().filter((k) => k !== key)].slice(0, MAX_RECENT)));
  } catch { /* storage is off: the menu just has no recent themes */ }
}

/** The themes used lately that still exist: [{ key, name, dark }], newest first. */
export async function recentThemes() {
  const keys = recentKeys();
  if (!keys.length) return [];
  try {
    const all = await themeList();
    return keys.map((k) => all.find((t) => t.key === k)).filter(Boolean);
  } catch {
    return [];
  }
}

/** Chooses a theme by its key (an empty key goes back to the standard colors) and remembers it as a recent one. */
export async function chooseTheme(key, opts = {}) {
  plainStaticLockKey = null;
  if (!opts?.preserveSuppressedFx) {
    resetSuppressedFx();
  }
  rememberTheme(key);
  await saveSettings({ palette: key });
}

/** Curated 1-click Plain & Static Themes (Zero Animations, Zero GPU Shaders) for instant access in the Theme Gallery & Menu. */
export const POPULAR_PLAIN_THEME_PICKS = [
  { key: "", label: "🖥️ Standard (System Auto)" },
  { key: "apple_light", label: "🍎 Apple HIG Light" },
  { key: "apple_dark", label: "🍎 Apple HIG Dark" },
  { key: "sonoma_dark", label: "🍎 macOS Sonoma Dark" },
  { key: "sonoma_light", label: "☀️ macOS Sonoma Light" },
  { key: "tahoe_glass", label: "🍎 macOS Tahoe Light" },
  { key: "sequoia_dark", label: "🌲 macOS Sequoia Dark" },
  { key: "midnight", label: "🌌 Midnight Space Gray" },
  { key: "titanium_slate", label: "🩶 Titanium Slate Pro" },
  { key: "oled_black", label: "⚫ Pure OLED Black" },
  { key: "dark", label: "🌙 Default Dark" },
  { key: "light", label: "☀️ Default Light" },
  { key: "dracula", label: "🧛 Dracula" },
  { key: "nord", label: "❄️ Nord Arctic" },
  { key: "tokyo_night", label: "🌃 Tokyo Night" },
  { key: "catppuccin_mocha", label: "☕ Catppuccin Mocha" },
  { key: "one_dark", label: "⚛️ One Dark Pro" },
  { key: "sublime_text", label: "🎨 Monokai Pro" },
  { key: "jetbrains_darcula", label: "🧠 JetBrains Darcula" },
  { key: "gruvbox", label: "🪵 Gruvbox Dark" },
  { key: "gruvbox_light", label: "☀️ Gruvbox Light" },
  { key: "solarized_dark", label: "🌑 Solarized Dark" },
  { key: "solarized_light", label: "☀️ Solarized Light" },
  { key: "rose_pine", label: "🌹 Rosé Pine" },
  { key: "everforest", label: "🌲 Everforest Dark" },
  { key: "kanagawa", label: "🌊 Kanagawa Wave" },
  { key: "cobalt2", label: "⚡ Cobalt2 Navy" },
  { key: "github_dark", label: "🐙 GitHub Dark" },
  { key: "github_light", label: "☀️ GitHub Light" },
  { key: "raycast_dark", label: "🚀 Raycast Dark" },
  { key: "linear_dark", label: "📐 Linear Studio" },
  { key: "vercel_dark", label: "▲ Vercel Geist" },
  { key: "nordic_paper", label: "📜 Nordic Paper Light" },
  { key: "fluent_dark", label: "🪟 Windows 11 Dark" },
  { key: "fluent_light", label: "🪟 Windows 11 Light" },
  { key: "win95", label: "🪟 Windows 95" },
  { key: "adwaita_dark", label: "🐧 GNOME Adwaita" },
  { key: "kde_breeze_dark", label: "🐧 KDE Breeze Dark" },
  { key: "nextstep", label: "🧊 NeXTSTEP 1989" },
  { key: "irix_indigo_magic", label: "🔮 SGI IRIX Indigo" },
  { key: "beos_r5", label: "💎 BeOS R5" },
];

/**
 * Turns off all live background canvas animations (`atmosphere`), 3D folder/toolbar shaders (`uiElementFx`),
 * custom icon packs, icon glow, and theme special effects while preserving the current theme's readable color palette.
 */
export async function disableAllThemeAnimations(opts = {}) {
  try {
    applyAtmosphere("none");
  } catch {}
  if (!opts.keepTelemetryHud) {
    closeTelemetryPopoutHud();
    if (typeof document !== "undefined") {
      for (const d of document.querySelectorAll('details[data-telemetry-studio-drawer="true"]')) {
        d.open = false;
      }
    }
  }
  if (opts.stripThemeEffects !== false) {
    plainStaticLockKey = opts.lockKey ?? state.settings?.palette ?? wanted ?? null;
    if (typeof document !== "undefined" && document.documentElement) {
      clearEffects();
    }
  }
  const patch = {
    atmosphere: "none",
    uiElementFx: "off",
    iconPackStyle: "default",
    themeIconGlow: "off",
    themeIconAnimation: "off",
    ...(opts.stripThemeEffects !== false ? { themeFontProfile: "default", themeCornerProfile: "default" } : {}),
    ...(opts.palette !== undefined ? { palette: opts.palette } : {}),
  };
  if (state.settings) Object.assign(state.settings, patch);
  applyUiImmersionProfiles(patch);
  await saveSettings(patch);
  if (opts.stripThemeEffects !== false && typeof document !== "undefined" && document.documentElement) {
    clearEffects();
    applyUiImmersionProfiles(patch);
  }
  if (!opts.quiet) {
    toast("Turned off all animations, atmosphere particles & 3D folder FX — plain static colors active.", { kind: "info" });
  }
  return patch;
}

/**
 * Applies any theme `key` (even a Futuristic/Holiday/Nerd/Horror FX theme) as a 100% Plain Static Color Theme
 * with all animations, canvas particles, glass blur, and 3D folder effects turned off.
 */
export async function applyThemePlainColorsOnly(key, opts = {}) {
  plainStaticLockKey = key;
  rememberTheme(key);
  await disableAllThemeAnimations({ quiet: true, stripThemeEffects: true, lockKey: key, palette: key });
  await applyPalette(key);
  clearEffects();
  applyUiImmersionProfiles({ uiElementFx: "off", iconPackStyle: "default", themeIconGlow: "off", themeIconAnimation: "off" });
  if (!opts.quiet) {
    toast("Applied plain colors only (all animations & special effects turned off).", { kind: "success" });
  }
}

/**
 * Curated Flagship Selection Templates for the `Right ⌥ + ] / [` (`Alt+] / Alt+[`) Quick-Switcher HUD:
 * Highlights modern 3D Regular Folder & Picture Studios, M4 Max / RTX Ultra shaders, Extreme Storms, and Beloved Classics.
 */
export const OPTION_BRACKET_SHOWCASE_TEMPLATES = [
  { key: "tahoe_studio_3d", badge: "🍎 Tahoe 3D Folders & Pictures" },
  { key: "m4_pro_display_xdr", badge: "💻 M4 Max XDR Titanium" },
  { key: "mac_studio_m4_ultra", badge: "🧊 Mac Studio M4 Ultra" },
  { key: "mac_pro_rack_xdr", badge: "🖥️ Mac Pro 6K XDR" },
  { key: "macbook_pro_space_black", badge: "🖤 MBP 16 Space Black" },
  { key: "apple_studio_display_5k", badge: "☀️ Studio Display 5K" },
  { key: "imac_m4_spectrum_p3", badge: "🌈 iMac 24 M4 4.5K P3" },
  { key: "macos_sequoia_redwood_xdr", badge: "🌲 Sequoia XDR Redwood" },
  { key: "macos_vision_spatial_mac", badge: "🥽 Mac Spatial Vision 8K" },
  { key: "mac_mini_m4_pro_carbon", badge: "⚡ Mac mini M4 Pro" },
  { key: "win11_rtx_fluent_3d", badge: "🪟 Win11 Fluent 3D & RTX" },
  { key: "hdr_cinema_gallery", badge: "📸 8K HDR Photo Studio" },
  { key: "linux_workstation_hidpi", badge: "🐧 Linux Papirus HiDPI" },
  { key: "studio_architect_minimal", badge: "🏛️ Studio Architect Light" },
  { key: "prism_reactor", badge: "💎 Prism Reactor XDR" },
  { key: "ef5_debris_tornado", badge: "🌪️ EF5 Tornado Debris" },
  { key: "inferno_fire_folders", badge: "🔥 Blazing Fire Folders" },
  { key: "toxic_slime_ooze", badge: "🧪 Dripping Slime Ooze" },
  { key: "tesla_coil_plasma", badge: "⚡ Tesla Coil Plasma" },
  { key: "tokamak_fusion", badge: "⚛️ Tokamak Fusion" },
  { key: "kaleidoscope_mandala", badge: "🌈 Kaleidoscope Mandala" },
  { key: "lava_lamp_groovy_69", badge: "🫧 1969 Lava Lamp" },
  { key: "dmt_hyperspace_lattice", badge: "🪷 Hyperspace Lattice" },
  { key: "holographic_oil_slick", badge: "🛢️ Oil-Slick Dichroic" },
  { key: "electric_mycelium_forest", badge: "🍄 Mycelium Spore Trip" },
  { key: "optical_moire_hypnosis", badge: "🌀 Op-Art Moiré Hypnosis" },
  { key: "acid_house_rave_92", badge: "🔊 Acid House UV '92" },
  { key: "pastel_dreamcore_cloud", badge: "☁️ Lucid Dreamcore Prism" },
  { key: "google_gemini_ultra", badge: "✨ Google Gemini Ultra" },
  { key: "google_material_you_3d", badge: "🎨 Google Material 3 3D" },
  { key: "google_pixel_amoled", badge: "📱 Pixel 10 Pro OLED" },
  { key: "google_deepmind_quantum", badge: "⚛️ DeepMind Willow Quantum" },
  { key: "google_cloud_vertex_pro", badge: "☁️ Google Cloud Vertex AI" },
  { key: "google_project_idx_studio", badge: "🔥 Project IDX & Firebase" },
  { key: "google_chromeos_aurora", badge: "🌐 ChromeOS Project Astra" },
  { key: "google_workspace_daylight", badge: "☀️ Google Daylight M3" },
  { key: "ayahuasca_vine_vision", badge: "🐍 Ayahuasca Shipibo Vision" },
  { key: "alex_grey_astral_cathedral", badge: "👁️ Astral Chakra Cathedral" },
  { key: "summer_of_love_tiedye_67", badge: "☮️ Tie-Dye Summer of '67" },
  { key: "vaporwave_mall_plaza_95", badge: "🌴 Vaporwave Mall '95" },
  { key: "frutiger_aero_aqua_2007", badge: "🐬 Frutiger Aero Reef '07" },
  { key: "steampunk_chronometer_foundry", badge: "⚙️ Steampunk Brass Foundry" },
  { key: "art_deco_metropolis_1929", badge: "🏛️ 1929 Art Deco Gold" },
  { key: "synth_arcade_crt_1984", badge: "🕹️ 1984 Vector Arcade CRT" },
  { key: "mariana_bioluminescent_trench", badge: "🪼 Mariana Abyssal Trench" },
  { key: "kyoto_zen_karesansui_day", badge: "🎋 Kyoto Zen Garden Day" },
  { key: "holiday_new_years_times_square", badge: "🎆 New Year's Ball Drop" },
  { key: "holiday_valentines_velvet_rose", badge: "🌹 Valentine Velvet Rose" },
  { key: "holiday_st_patricks_emerald_clover", badge: "🍀 St. Patrick's Clover" },
  { key: "holiday_easter_pastel_egg_hunt", badge: "🥚 Easter Fabergé Meadow" },
  { key: "holiday_fourth_of_july_fireworks", badge: "🎆 4th of July Fireworks" },
  { key: "holiday_halloween_jack_o_lantern", badge: "🎃 Halloween Jack-O'-Lantern" },
  { key: "holiday_thanksgiving_harvest_hearth", badge: "🦃 Thanksgiving Hearth" },
  { key: "holiday_christmas_nutcracker_hearth", badge: "🎄 Christmas Nutcracker" },
  { key: "nerd_dnd_arcane_grimoire", badge: "🎲 D&D d20 Grimoire" },
  { key: "nerd_starfleet_lcars_bridge", badge: "🖖 Starfleet LCARS Bridge" },
  { key: "nerd_kyber_holocron_forge", badge: "⚔️ Kyber Lightsaber Holocron" },
  { key: "nerd_mecha_eva_nerv_hud", badge: "🤖 Mecha Unit-01 NERV HUD" },
  { key: "horror_nosferatu_blood_moon", badge: "🧛 Nosferatu Blood Moon" },
  { key: "horror_lovecraft_eldritch_rlyeh", badge: "🦑 Lovecraft Eldritch R'lyeh" },
  { key: "horror_vhs_found_footage_1999", badge: "📼 1999 Found-Footage VHS" },
  { key: "horror_biohazard_containment_lab", badge: "🫠 Screen-Melting Biohazard" },
  { key: "horror_silent_fog_asylum", badge: "🌋 Molten-Melt Silent Fog" },
  { key: "horror_cursed_carnival_calliope", badge: "🌊 Mirage-Ripple Carnival" },
  { key: "realworld_grandfather_clockwork_mahogany", badge: "🕰️ Mahogany Clockwork" },
  { key: "realworld_vinyl_jukebox_wurlitzer", badge: "📻 1959 Vinyl Jukebox" },
  { key: "realworld_stained_glass_cathedral", badge: "🪟 Stained-Glass Rose" },
  { key: "realworld_katana_urushi_forge", badge: "⚔️ Tamahagane Katana Forge" },
  { key: "realworld_pinball_wizard_arcade", badge: "🕹️ 1978 Pinball Backglass" },
  { key: "apple_light", badge: "⏹️ Apple HIG Light (Plain)" },
  { key: "apple_dark", badge: "⏹️ Apple HIG Dark (Plain)" },
  { key: "tokyo_night", badge: "⏹️ Tokyo Night (Plain)" },
  { key: "dracula", badge: "🧛 Dracula Classic" },
  { key: "nord", badge: "❄️ Nord Arctic" },
  { key: "win95", badge: "🪟 Windows 95 Retro" },
  { key: "beos_r5", badge: "💎 BeOS R5 Classic" },
  { key: "omega_point_singularity", badge: "🌌 Omega Point Singularity" },
  { key: "matrioshka_dyson_brain", badge: "☀️ Matrioshka Dyson Brain" },
  { key: "photonic_metamaterial_3099", badge: "💎 3099 Photonic Crystal" },
  { key: "chrono_crystalline_aethelgard", badge: "⏳ Chrono-Crystalline Vault" },
  { key: "akashic_neural_noosphere", badge: "🧠 Akashic Neural Noosphere" },
  { key: "zero_point_vacuum_genesis", badge: "⚛️ Zero-Point Vacuum Genesis" },
  { key: "kardashev_type_iii_galactic", badge: "🌀 Kardashev Type-III Core" },
  { key: "transcendent_seraphim_halo", badge: "👼 Seraphim Halo Engine" },
  { key: "femtotech_picomatter_forge", badge: "🔬 Femtotech Quark Forge" },
  { key: "holographic_holodeck_continuum", badge: "🌐 Continuum 16K Holodeck" },
  { key: "hyperborean_aether_sanctum_day", badge: "🏛️ Hyperborean Aether Day" },
  { key: "eden_solarpunk_archology_3000", badge: "🌿 Year 3000 Solarpunk Day" },
];

let quickHudTimer = 0;
let quickHudOutsideListener = null;

/** Dismisses the floating `Right ⌥ + ] / [` Quick-Switcher HUD. */
export function hideQuickCycleHud() {
  if (quickHudTimer) {
    clearTimeout(quickHudTimer);
    quickHudTimer = 0;
  }
  if (quickHudOutsideListener && typeof document !== "undefined") {
    document.removeEventListener("mousedown", quickHudOutsideListener, true);
    quickHudOutsideListener = null;
  }
  if (typeof document !== "undefined") {
    document.getElementById("fm-quick-cycle-hud")?.remove();
  }
}

/**
 * Renders the interactive floating `Right ⌥ + ] / [` (`Alt+] / Alt+[`) Theme Selection Template HUD (`#fm-quick-cycle-hud`)
 * with live miniature window swatch previews, 3D Folder/Picture pack badges, prev/next cards, and 1-click Flagship Templates.
 */
export function showQuickCycleHud(activeKey, allThemes = [], { index = 0, total = 1 } = {}) {
  if (typeof document === "undefined" || !document.body) return null;
  if (quickHudTimer) clearTimeout(quickHudTimer);

  const curTheme = activeKey ? allThemes.find((t) => t.key === activeKey) : null;
  const keys = ["", ...allThemes.map((t) => t.key)];
  const curIdx = Math.max(0, keys.indexOf(activeKey || ""));
  const prevKey = keys[(curIdx - 1 + keys.length) % keys.length];
  const nextKey = keys[(curIdx + 1) % keys.length];
  const prevTheme = prevKey ? allThemes.find((t) => t.key === prevKey) : null;
  const nextTheme = nextKey ? allThemes.find((t) => t.key === nextKey) : null;

  const tier = curTheme ? resolveTemplateTier(curTheme) : "low";
  const tierLabel = tier === "ultra" ? "🚀 Ultra Tier" : tier === "medium" ? "✨ Medium Glass" : "⚡ Standard / Eco";
  const folderFxBadge = curTheme?.uiElementFx || state.settings?.uiElementFx || "auto";
  const iconPackBadge = curTheme?.iconPackStyle || state.settings?.iconPackStyle || "default";
  const curTele = estimateThemeResourceTelemetry(curTheme);

  const showcaseChips = OPTION_BRACKET_SHOWCASE_TEMPLATES.map((tpl) => {
    const tObj = allThemes.find((t) => t.key === tpl.key);
    if (!tObj) return null;
    const isCurrent = (activeKey || "") === tpl.key;
    const [bg, , accent] = tObj.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
    return h("button", {
      type: "button",
      class: `fm-quick-cycle-tpl-chip${isCurrent ? " is-active" : ""}`,
      "data-quick-template": tpl.key,
      "data-quick-cycle-tpl": tpl.key,
      "aria-pressed": String(isCurrent),
      title: `${tObj.name} — ${tObj.description || tpl.badge}`,
      onclick: async (e) => {
        e.stopPropagation();
        await chooseTheme(tpl.key);
        await applyPalette(tpl.key);
        showQuickCycleHud(tpl.key, allThemes, { index: keys.indexOf(tpl.key), total: keys.length });
      },
    },
      h("span", { class: "fm-quick-cycle-tpl-dot", style: `background:${accent};box-shadow:0 0 0 2px ${bg}, 0 0 8px ${accent}` }),
      h("span", {}, tpl.badge),
    );
  }).filter(Boolean);

  const hud = h("div", {
    id: "fm-quick-cycle-hud",
    class: "fm-quick-cycle-hud",
    role: "region",
    "aria-label": "Option + Bracket Theme Quick-Switcher HUD",
    "data-active-theme": activeKey || "standard",
    onmouseenter: () => {
      if (quickHudTimer) {
        clearTimeout(quickHudTimer);
        quickHudTimer = 0;
      }
    },
    onmouseleave: () => {
      quickHudTimer = setTimeout(hideQuickCycleHud, 3600);
    },
  },
    h("div", { class: "fm-quick-cycle-head" },
      h("span", { class: "fm-quick-cycle-kbd" }, "⌨️ Right ⌥ + [ / ] · Esc / Enter / Click Outside to Exit"),
      h("span", { class: "fm-quick-cycle-pos" }, `${index + 1} / ${total}`),
      h("div", { class: "fm-quick-cycle-head-actions" },
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-random": "any",
          title: "Pick a random theme from all 310 themes immediately (Alt+R / ⌥R — no dialog needed)",
          onclick: (e) => {
            e.stopPropagation();
            void randomTheme({ mode: "any" });
          },
        }, "🎲 Random (⌥R)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-random": "fx",
          title: "Pick a random animated / 3D FX theme immediately (Alt+E / ⌥E or ⌥⇧R — no dialog needed)",
          onclick: (e) => {
            e.stopPropagation();
            void randomTheme({ mode: "fx" });
          },
        }, "✨ Random FX (⌥E)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-random": "plain",
          title: "Pick a random Plain / No-Animation theme immediately (Alt+P / ⌥P — 0.0% GPU, no dialog needed)",
          onclick: (e) => {
            e.stopPropagation();
            void randomTheme({ mode: "plain" });
          },
        }, "⏹️ Random Plain (⌥P)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-random": "ultra",
          title: "Pick a random Ultra / Year 3000+ God-Mode theme immediately (Alt+U / ⌥U — no dialog needed)",
          onclick: (e) => {
            e.stopPropagation();
            void randomTheme({ mode: "ultra" });
          },
        }, "🚀 Random Ultra (⌥U)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-color-keep-fx": "true",
          title: "Pick a random color palette while keeping your current active effects, 3D folders, and icons unchanged (Alt+C / ⌥C)",
          onclick: (e) => {
            e.stopPropagation();
            void randomColorsKeepCurrentEffects();
          },
        }, "🌈 Swap Color Keep FX (⌥C)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-toggle-fx": "true",
          title: "Instantly toggle or strip animations & FX on the current theme (Alt+0 / ⌥0 — no dialog needed)",
          onclick: (e) => {
            e.stopPropagation();
            void toggleCurrentThemeEffects();
          },
        }, "🛑 Toggle FX (⌥0)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-telemetry": "true",
          title: "Toggle the floating Live CPU & GPU Telemetry Monitor HUD",
          onclick: (e) => {
            e.stopPropagation();
            void toggleTelemetryPopoutHud(allThemes);
          },
        }, isTelemetryPopoutHudOpen() ? "✕ Hide CPU/GPU HUD" : "📟 CPU/GPU HUD"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-plain": "true",
          title: "Open Theme Gallery filtered to Plain Themes (No Animations)",
          onclick: (e) => {
            e.stopPropagation();
            hideQuickCycleHud();
            void showThemePicker({ filter: "plain" });
          },
        }, "⏹️ Plain Themes"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-paste": "true",
          title: "Paste a shared CCFM-THEME-v1 / CCFM-PACK-v1 code or JSON from clipboard (⌘V / ⌘⇧V)",
          onclick: (e) => {
            e.stopPropagation();
            void pasteImportThemesFromClipboard();
          },
        }, "📋 Paste Theme (⌘V)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-gallery": "true",
          onclick: (e) => {
            e.stopPropagation();
            hideQuickCycleHud();
            void showThemePicker();
          },
        }, "🎨 Full Gallery"),
        h("button", {
          type: "button",
          class: "btn primary fm-quick-cycle-mini-btn fm-quick-cycle-done-btn",
          "data-quick-hud-done": "true",
          "aria-label": "Keep current theme and close Quick-Switcher HUD",
          title: "Keep current theme and close Quick-Switcher HUD (or press Esc / Enter / click outside)",
          onclick: (e) => {
            e.stopPropagation();
            hideQuickCycleHud();
          },
        }, "✓ Done (Esc)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-close": "true",
          "aria-label": "Close Quick-Switcher HUD",
          title: "Close Quick-Switcher HUD (Esc)",
          onclick: (e) => {
            e.stopPropagation();
            hideQuickCycleHud();
          },
        }, "✕"),
      ),
    ),
    h("div", { class: "fm-quick-cycle-stage" },
      h("button", {
        type: "button",
        class: "fm-quick-cycle-step-card is-neighbor",
        "data-quick-cycle-step": "-1",
        title: "Previous theme (Right ⌥ + [)",
        onclick: (e) => {
          e.stopPropagation();
          void cycleTheme(-1);
        },
      },
        h("span", { class: "fm-quick-cycle-dir" }, "◀ ⌥ + ["),
        h("strong", { class: "fm-quick-cycle-neighbor-name" }, prevTheme ? prevTheme.name : "Standard"),
      ),
      h("div", {
        class: "fm-quick-cycle-active-card",
        "data-quick-hud-confirm": "true",
        role: "button",
        tabindex: "0",
        title: "Click, press Enter, or press Esc to keep this theme and close HUD",
        onclick: (e) => {
          if (e.target?.closest?.("[data-quick-hud-telemetry]")) return;
          e.stopPropagation();
          hideQuickCycleHud();
        },
      },
        curTheme ? swatch(curTheme) : defaultSwatch(),
        h("div", { class: "fm-quick-cycle-active-info" },
          h("div", { class: "fm-quick-cycle-active-title-row" },
            h("strong", { class: "fm-quick-cycle-active-name", "data-quick-cycle-name": "true" }, curTheme ? curTheme.name : "Standard (System Default)"),
            h("span", { class: "fm-quick-cycle-badge" }, tierLabel),
            h("span", { class: "fm-quick-cycle-badge fm-quick-cycle-telemetry-badge", "data-quick-hud-telemetry": "true" }, `📟 CPU ${curTele.cpuPct.toFixed(1)}% · GPU ${curTele.gpuPct.toFixed(1)}% · ${curTele.watts.toFixed(1)}W`),
            folderFxBadge && folderFxBadge !== "off" ? h("span", { class: "fm-quick-cycle-badge" }, `📁 ${folderFxBadge}`) : null,
            iconPackBadge && iconPackBadge !== "default" ? h("span", { class: "fm-quick-cycle-badge" }, `🎭 ${iconPackBadge}`) : null,
          ),
          h("div", { class: "fm-quick-cycle-active-desc" }, curTheme?.description || "Clean native light or dark appearance following your computer settings."),
        ),
      ),
      h("button", {
        type: "button",
        class: "fm-quick-cycle-step-card is-neighbor",
        "data-quick-cycle-step": "1",
        title: "Next theme (Right ⌥ + ])",
        onclick: (e) => {
          e.stopPropagation();
          void cycleTheme(1);
        },
      },
        h("span", { class: "fm-quick-cycle-dir" }, "⌥ + ] ▶"),
        h("strong", { class: "fm-quick-cycle-neighbor-name" }, nextTheme ? nextTheme.name : "Standard"),
      ),
    ),
    h("div", { class: "fm-quick-cycle-templates", role: "group", "aria-label": "Built-in Option + ] Flagship Selection Templates" },
      h("span", { class: "fm-quick-cycle-tpl-label" }, "🌟 Built-In Flagship Templates:"),
      ...showcaseChips,
    ),
  );

  document.getElementById("fm-quick-cycle-hud")?.remove();
  if (quickHudOutsideListener) {
    document.removeEventListener("mousedown", quickHudOutsideListener, true);
    quickHudOutsideListener = null;
  }
  document.body.appendChild(hud);
  quickHudOutsideListener = (e) => {
    const el = document.getElementById("fm-quick-cycle-hud");
    if (!el) {
      if (quickHudOutsideListener) {
        document.removeEventListener("mousedown", quickHudOutsideListener, true);
        quickHudOutsideListener = null;
      }
      return;
    }
    const target = e.target;
    if (target instanceof Node && !el.contains(target)) {
      hideQuickCycleHud();
    }
  };
  document.addEventListener("mousedown", quickHudOutsideListener, true);
  quickHudTimer = setTimeout(hideQuickCycleHud, 4200);
  return hud;
}

let cycling = false;
export async function cycleTheme(direction, opts = {}) {
  if (cycling) return "";
  cycling = true;
  try {
    const themes = await themeList();
    let keys;
    if (opts.pool === "showcase" || opts.showcaseOnly) {
      keys = OPTION_BRACKET_SHOWCASE_TEMPLATES.map((t) => t.key).filter((k) => themes.some((th) => th.key === k));
    } else if (opts.pool === "plain") {
      keys = ["", ...themes.filter((th) => !th.hasEffects).map((th) => th.key)];
    } else if (opts.pool === "fx") {
      keys = themes.filter((th) => Boolean(th.hasEffects)).map((th) => th.key);
    } else if (opts.pool === "favorites") {
      const favs = favoriteKeys().filter((k) => themes.some((th) => th.key === k));
      keys = favs.length ? favs : ["", ...themes.map((theme) => theme.key)];
    } else {
      keys = ["", ...themes.map((theme) => theme.key)];
    }
    const current = keys.indexOf(state.settings.palette || "");
    const next = current < 0 ? (direction > 0 ? 0 : keys.length - 1)
      : (current + direction + keys.length) % keys.length;
    const nextKey = keys[next];
    await chooseTheme(nextKey);
    await applyPalette(nextKey);
    if (opts.showHud !== false) {
      showQuickCycleHud(nextKey, themes, { index: next, total: keys.length });
    }
    return themes.find((t) => t.key === nextKey)?.name || "Standard";
  } catch (err) {
    toast(err?.message || "The theme couldn't be changed.", { kind: "error" });
    return "";
  } finally {
    cycling = false;
  }
}

/**
 * Instant dialog-free Quick Random Theme switcher (`Alt+R`, `Alt+E`, `Alt+P`, `Alt+U`).
 * Picks and applies a random theme from the requested pool (`"any"` | `"fx"` | `"plain"` | `"ultra"`)
 * with zero modal dialogs required.
 */
export async function randomTheme(opts = {}) {
  if (cycling) return null;
  cycling = true;
  try {
    const themes = await themeList();
    if (!themes.length) return null;
    const mode = String(opts.mode || "any").toLowerCase();
    let pool;
    if (mode === "fx" || mode === "effects") {
      pool = themes.filter((t) => Boolean(t.hasEffects));
    } else if (mode === "plain" || mode === "no-fx" || mode === "static") {
      pool = themes.filter((t) => !t.hasEffects);
    } else if (mode === "ultra" || mode === "godmode") {
      pool = themes.filter((t) => resolveTemplateTier(t) === "ultra");
    } else {
      pool = themes;
    }
    if (!pool.length) pool = themes;
    const currentKey = state.settings?.palette || "";
    const candidates = pool.length > 1 ? pool.filter((t) => t.key !== currentKey) : pool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || pool[0];
    if (!chosen) return null;

    if (mode === "plain" || mode === "no-fx" || mode === "static" || !chosen.hasEffects) {
      await disableAllThemeAnimations({ quiet: true, stripThemeEffects: false });
    }
    await chooseTheme(chosen.key);
    await applyPalette(chosen.key);

    if (opts.showHud !== false) {
      const idx = Math.max(0, themes.findIndex((t) => t.key === chosen.key) + 1);
      showQuickCycleHud(chosen.key, themes, { index: idx, total: themes.length + 1 });
    }
    if (!opts.quiet) {
      const prefix = (mode === "fx" || mode === "effects")
        ? "✨ Random FX Theme"
        : (mode === "plain" || mode === "no-fx" || mode === "static")
          ? "⏹️ Random Plain Theme (No FX)"
          : (mode === "ultra" || mode === "godmode")
            ? "🚀 Random Ultra Theme"
            : `🎲 Random Theme (${chosen.hasEffects ? "✨ FX" : "⏹️ Plain"})`;
      toast(`${prefix}: ${chosen.name}`, { kind: "info" });
    }
    return chosen;
  } catch (err) {
    toast(err?.message || "Could not pick a random theme.", { kind: "error" });
    return null;
  } finally {
    cycling = false;
  }
}

/**
 * Instant dialog-free toggle between Plain Colors Only (0.0% GPU, no animations)
 * and Full Animated FX on the currently active theme (`Alt+0` / `⌥0`).
 */
export async function toggleCurrentThemeEffects(opts = {}) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const fxActive = Boolean(
    root?.dataset?.fx
    || (root?.dataset?.fxAtmosphere && root.dataset.fxAtmosphere !== "none")
    || (state.settings?.atmosphere && state.settings.atmosphere !== "none")
    || (state.settings?.uiElementFx && state.settings.uiElementFx !== "off"),
  );
  if (fxActive) {
    await disableAllThemeAnimations({ quiet: Boolean(opts.quiet), stripThemeEffects: true });
    return { fxEnabled: false, key: state.settings?.palette || "" };
  }
  const curKey = state.settings?.palette || "";
  const themes = await themeList();
  const curTheme = curKey ? themes.find((t) => t.key === curKey) : null;
  if (curTheme?.hasEffects) {
    await chooseTheme(curKey);
    await applyPalette(curKey);
    if (opts.showHud !== false) {
      showQuickCycleHud(curKey, themes, { index: themes.indexOf(curTheme) + 1, total: themes.length + 1 });
    }
    if (!opts.quiet) {
      toast(`✨ Restored full animations & 3D FX for "${curTheme.name}".`, { kind: "success" });
    }
    return { fxEnabled: true, key: curKey };
  }
  const picked = await randomTheme({ mode: "fx", showHud: opts.showHud, quiet: opts.quiet });
  return { fxEnabled: true, key: picked?.key || "" };
}

/**
 * Returns a structured list of all currently active visual effects on the workspace (`document.documentElement` & `state.settings`)
 * so the user can see and strip individual unwanted effects in 1 click.
 */
export function getActiveWorkspaceEffects() {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (!root) return [];
  const items = [];
  const atmoSpec = effectiveAtmosphere();
  const atmoLayers = parseAtmosphereIds(atmoSpec);
  for (const layerId of atmoLayers) {
    items.push({
      kind: "atmoLayer",
      id: layerId,
      label: `🌌 ${formatAtmosphereLabel(layerId)}`,
      title: `Click to remove weather/particle layer "${formatAtmosphereLabel(layerId)}"`,
    });
  }
  const uiFx = root.dataset?.uiFx || root.getAttribute("data-fx-element") || "";
  if (uiFx && uiFx !== "off") {
    items.push({
      kind: "uiElementFx",
      id: uiFx,
      label: `🔥 Folder/UI: ${uiFx}`,
      title: `Click to turn off 3D folder/screen effect (${uiFx})`,
    });
  }
  const iconPack = root.dataset?.iconPack || root.getAttribute("data-fx-icon-pack") || "";
  if (iconPack && iconPack !== "default") {
    items.push({
      kind: "iconPackStyle",
      id: iconPack,
      label: `🎭 Icons: ${iconPack}`,
      title: `Click to reset custom icon pack (${iconPack}) back to Default`,
    });
  }
  const iconGlow = root.dataset?.iconGlow || root.getAttribute("data-fx-icon-glow") || "";
  if (iconGlow && iconGlow !== "off") {
    items.push({
      kind: "iconGlow",
      id: iconGlow,
      label: `💫 Icon Glow: ${iconGlow}`,
      title: `Click to turn off icon glow (${iconGlow})`,
    });
  }
  const iconAnim = root.dataset?.iconAnim || root.getAttribute("data-fx-icon-anim") || "";
  if (iconAnim && iconAnim !== "off") {
    items.push({
      kind: "iconAnimation",
      id: iconAnim,
      label: `🎬 Icon Anim: ${iconAnim}`,
      title: `Click to turn off 3D icon animation (${iconAnim})`,
    });
  }
  const fontProfile = root.dataset?.fontProfile || root.getAttribute("data-fx-font-profile") || "";
  if (fontProfile && fontProfile !== "default") {
    items.push({
      kind: "fontProfile",
      id: fontProfile,
      label: `🔤 Font: ${fontProfile}`,
      title: `Click to reset font profile (${fontProfile}) back to Default`,
    });
  }
  const cornerProfile = root.dataset?.cornerProfile || root.getAttribute("data-fx-corner-profile") || "";
  if (cornerProfile && cornerProfile !== "default") {
    items.push({
      kind: "cornerProfile",
      id: cornerProfile,
      label: `📐 Corners: ${cornerProfile}`,
      title: `Click to reset corner geometry (${cornerProfile}) back to Default`,
    });
  }
  const hasRetroGlitch = Boolean(
    (root.getAttribute("data-fx-scanlines") && root.getAttribute("data-fx-scanlines") !== "none")
    || (root.getAttribute("data-fx-grain") && root.getAttribute("data-fx-grain") !== "none")
    || root.hasAttribute("data-fx-chromatic")
    || root.hasAttribute("data-fx-noise")
    || root.hasAttribute("data-fx-crt"),
  );
  if (hasRetroGlitch) {
    items.push({
      kind: "retroGlitch",
      id: "retro",
      label: "📺 Scanlines / CRT / Glitch",
      title: "Click to remove scanlines, film grain, noise, CRT curvature, and chromatic RGB split",
    });
  }
  const glowStyle = root.getAttribute("data-fx-glow") || "";
  const hasGlassGlow = Boolean(
    (glowStyle && glowStyle !== "none")
    || root.hasAttribute("data-fx-sheen")
    || root.hasAttribute("data-fx-ambient")
    || root.hasAttribute("data-fx-prism")
    || root.hasAttribute("data-fx-neon-pulse")
    || root.getAttribute("data-fx") === "on"
    || root.getAttribute("data-fx") === "reduced",
  );
  if (hasGlassGlow) {
    items.push({
      kind: "glassGlow",
      id: glowStyle || "glass",
      label: `🪟 Glass & Glow${glowStyle && glowStyle !== "none" ? ` (${glowStyle})` : ""}`,
      title: "Click to remove glass blur, neon glow, animated border, and sheen while keeping your colors and other active effects",
    });
  }
  return items;
}

/**
 * Removes a single active effect (`"atmoLayer"`, `"atmosphere"`, `"uiElementFx"`, `"iconPackStyle"`, `"iconGlow"`, `"iconAnimation"`,
 * `"fontProfile"`, `"cornerProfile"`, `"retroGlitch"`, `"glassGlow"`, or `"all"`) from the live workspace in 1 click.
 */
export async function removeActiveWorkspaceEffect(kind, value = "", opts = {}) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (kind === "all") {
    await disableAllThemeAnimations({ quiet: Boolean(opts.quiet), stripThemeEffects: true });
    return getActiveWorkspaceEffects();
  }
  const activeKey = (root?.dataset?.palette && root.dataset.palette !== "preview")
    ? root.dataset.palette
    : (wanted || state.settings?.palette || "");
  if (activeKey) {
    if (suppressedFxForKey !== activeKey) {
      suppressedFxForKey = activeKey;
      suppressedFxKinds.clear();
      suppressedAtmoLayers.clear();
    }
    if (kind === "atmoLayer" && value) suppressedAtmoLayers.add(value);
    else suppressedFxKinds.add(kind);
  }
  const palettePatch = (activeKey && state.settings && state.settings.palette !== activeKey)
    ? { palette: activeKey }
    : {};

  if (kind === "atmoLayer") {
    const currentLayers = parseAtmosphereIds(effectiveAtmosphere());
    const nextLayers = currentLayers.filter((id) => id !== value);
    const nextSpec = normalizeAtmosphereSpec(nextLayers);
    if (root) {
      if (nextSpec && nextSpec !== "none") root.setAttribute("data-fx-atmosphere", nextSpec);
      else root.removeAttribute("data-fx-atmosphere");
    }
    if (state.settings) Object.assign(state.settings, { ...palettePatch, atmosphere: nextSpec });
    try { applyAtmosphere(nextSpec); } catch {}
    await saveSettings({ ...palettePatch, atmosphere: nextSpec });
  } else if (kind === "atmosphere") {
    root?.removeAttribute("data-fx-atmosphere");
    if (state.settings) Object.assign(state.settings, { ...palettePatch, atmosphere: "none" });
    try { applyAtmosphere("none"); } catch {}
    await saveSettings({ ...palettePatch, atmosphere: "none" });
  } else if (kind === "uiElementFx") {
    root?.removeAttribute("data-fx-element");
    if (root?.dataset) delete root.dataset.uiFx;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, uiElementFx: "off" });
    applyUiImmersionProfiles({ uiElementFx: "off" });
    await saveSettings({ ...palettePatch, uiElementFx: "off" });
    root?.removeAttribute("data-fx-element");
    if (root?.dataset) delete root.dataset.uiFx;
  } else if (kind === "iconPackStyle") {
    root?.removeAttribute("data-fx-icon-pack");
    if (root?.dataset) delete root.dataset.iconPack;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, iconPackStyle: "default" });
    applyUiImmersionProfiles({ iconPackStyle: "default" });
    await saveSettings({ ...palettePatch, iconPackStyle: "default" });
    root?.removeAttribute("data-fx-icon-pack");
    if (root?.dataset) delete root.dataset.iconPack;
  } else if (kind === "iconGlow") {
    root?.removeAttribute("data-fx-icon-glow");
    if (root?.dataset) delete root.dataset.iconGlow;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, themeIconGlow: "off" });
    applyUiImmersionProfiles({ themeIconGlow: "off" });
    await saveSettings({ ...palettePatch, themeIconGlow: "off" });
    root?.removeAttribute("data-fx-icon-glow");
    if (root?.dataset) delete root.dataset.iconGlow;
  } else if (kind === "iconAnimation") {
    root?.removeAttribute("data-fx-icon-anim");
    if (root?.dataset) delete root.dataset.iconAnim;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, themeIconAnimation: "off" });
    applyUiImmersionProfiles({ themeIconAnimation: "off" });
    await saveSettings({ ...palettePatch, themeIconAnimation: "off" });
    root?.removeAttribute("data-fx-icon-anim");
    if (root?.dataset) delete root.dataset.iconAnim;
  } else if (kind === "fontProfile") {
    root?.removeAttribute("data-fx-font-profile");
    if (root?.dataset) delete root.dataset.fontProfile;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, themeFontProfile: "default" });
    applyUiImmersionProfiles({ themeFontProfile: "default" });
    await saveSettings({ ...palettePatch, themeFontProfile: "default" });
    root?.removeAttribute("data-fx-font-profile");
    if (root?.dataset) delete root.dataset.fontProfile;
  } else if (kind === "cornerProfile") {
    root?.removeAttribute("data-fx-corner-profile");
    root?.removeAttribute("data-fx-radius");
    if (root?.dataset) delete root.dataset.cornerProfile;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, themeCornerProfile: "default" });
    applyUiImmersionProfiles({ themeCornerProfile: "default" });
    await saveSettings({ ...palettePatch, themeCornerProfile: "default" });
    root?.removeAttribute("data-fx-corner-profile");
    root?.removeAttribute("data-fx-radius");
    if (root?.dataset) delete root.dataset.cornerProfile;
  } else if (kind === "retroGlitch") {
    for (const attr of ["data-fx-scanlines", "data-fx-grain", "data-fx-chromatic", "data-fx-noise", "data-fx-crt"]) {
      root?.removeAttribute(attr);
    }
  } else if (kind === "glassGlow") {
    for (const attr of ["data-fx-glow", "data-fx-border", "data-fx-sheen", "data-fx-ambient", "data-fx-prism", "data-fx-inner-glow", "data-fx-frosted-rim", "data-fx-neon-pulse", "data-fx-backdrop", "data-fx"]) {
      root?.removeAttribute(attr);
    }
  }
  return getActiveWorkspaceEffects();
}

/**
 * Curated 1-click Color Palette Swatches for swapping ONLY the workspace colors while keeping
 * 100% of the user's currently active effects (weather/shader layers, 3D folders, icon pack, icon animation, glass & glow).
 */
export const QUICK_COLOR_PALETTE_SWATCHES = [
  { key: "macbook_pro_space_black", label: "🖤 Space Black", bg: "#090b10", accent: "#818cf8" },
  { key: "mac_studio_m4_ultra", label: "🧊 M4 Silver", bg: "#131822", accent: "#38bdf8" },
  { key: "tahoe_studio_3d", label: "🌊 Tahoe Cyan", bg: "#0c1828", accent: "#00d2ff" },
  { key: "omega_point_singularity", label: "👑 24K Gold", bg: "#090612", accent: "#fbbf24" },
  { key: "dracula", label: "🧛 Dracula", bg: "#282a36", accent: "#bd93f9" },
  { key: "tokyo_night", label: "🌃 Tokyo Night", bg: "#1a1b26", accent: "#7aa2f7" },
  { key: "nord", label: "❄️ Nord Ice", bg: "#2e3440", accent: "#88c0d0" },
  { key: "catppuccin_mocha", label: "☕ Catppuccin", bg: "#1e1e2e", accent: "#cba6f7" },
  { key: "rose_pine", label: "🌹 Rosé Pine", bg: "#191724", accent: "#ebbcba" },
  { key: "everforest", label: "🌲 Everforest", bg: "#2d353b", accent: "#a7c080" },
  { key: "apple_light", label: "☀️ Apple Light", bg: "#f5f5f7", accent: "#0071e3" },
  { key: "solarized_light", label: "📜 Solarized Warm", bg: "#fdf6e3", accent: "#268bd2" },
];

let keepCurrentEffectsLock = false;
let lockedEffectsSnapshot = null;

/**
 * Captures a complete snapshot of the user's currently active workspace effects (atmosphere shaders,
 * 3D folder/toolbar shader, custom icon pack, icon glow, 3D icon animation, font/corner profiles, and glass/glow DOM attributes).
 */
export function captureCurrentWorkspaceEffectsSnapshot() {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const fxAttrs = {};
  if (root) {
    for (const attr of [...root.attributes]) {
      if (attr.name.startsWith("data-fx")) {
        fxAttrs[attr.name] = attr.value;
      }
    }
  }
  const fxStyleEl = typeof document !== "undefined" ? document.getElementById("fm-theme-effects") : null;
  const fxCss = fxStyleEl?.textContent || "";
  const atmoSpec = effectiveAtmosphere();
  const uiElementFx = root?.dataset?.uiFx || root?.getAttribute?.("data-fx-element") || (state.settings?.uiElementFx && state.settings.uiElementFx !== "auto" ? state.settings.uiElementFx : "off");
  const iconPackStyle = root?.dataset?.iconPack || root?.getAttribute?.("data-fx-icon-pack") || state.settings?.iconPackStyle || "default";
  const themeIconGlow = root?.dataset?.iconGlow || root?.getAttribute?.("data-fx-icon-glow") || state.settings?.themeIconGlow || "off";
  const themeIconAnimation = root?.dataset?.iconAnim || root?.getAttribute?.("data-fx-icon-anim") || state.settings?.themeIconAnimation || "off";
  const themeFontProfile = root?.dataset?.fontProfile || root?.getAttribute?.("data-fx-font-profile") || state.settings?.themeFontProfile || "default";
  const themeCornerProfile = root?.dataset?.cornerProfile || root?.getAttribute?.("data-fx-corner-profile") || state.settings?.themeCornerProfile || "default";
  return {
    atmosphere: atmoSpec || "none",
    uiElementFx: uiElementFx || "off",
    iconPackStyle: iconPackStyle || "default",
    themeIconGlow: themeIconGlow || "off",
    themeIconAnimation: themeIconAnimation || "off",
    themeFontProfile: themeFontProfile || "default",
    themeCornerProfile: themeCornerProfile || "default",
    fxAttrs,
    fxCss,
  };
}

/** Returns true when "Keep Current Effects (Swap Colors Only)" lock mode is active. */
export function isKeepEffectsColorSwapMode() {
  return Boolean(keepCurrentEffectsLock);
}

/** Enables or disables "Keep Current Effects (Swap Colors Only)" lock mode. */
export function setKeepEffectsColorSwapMode(enabled, opts = {}) {
  keepCurrentEffectsLock = Boolean(enabled);
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (keepCurrentEffectsLock) {
    lockedEffectsSnapshot = captureCurrentWorkspaceEffectsSnapshot();
    if (root?.dataset) root.dataset.keepFxLock = "true";
    if (!opts.quiet) {
      toast("🔒 Keep Current Effects ON — clicking any theme or color swatch now changes ONLY the colors while keeping your active effects!", { kind: "success" });
    }
  } else {
    lockedEffectsSnapshot = null;
    if (root?.dataset) delete root.dataset.keepFxLock;
    if (!opts.quiet) {
      toast("🔓 Keep Current Effects OFF — selecting a theme applies both its colors and its own effects.", { kind: "info" });
    }
  }
  return keepCurrentEffectsLock;
}

/** Toggles "Keep Current Effects (Swap Colors Only)" lock mode on or off. */
export function toggleKeepEffectsColorSwapMode(opts = {}) {
  return setKeepEffectsColorSwapMode(!keepCurrentEffectsLock, opts);
}

/**
 * Applies ONLY the color palette from theme `key` (`--bg`, `--panel`, `--text`, `--accent`, etc.)
 * while preserving 100% of the user's currently active effects (atmosphere weather/shader layers,
 * 3D folder/toolbar shader, custom icon pack, icon glow, 3D icon animation, font/corner profiles, and glass/glow).
 */
export async function applyThemeColorsKeepingCurrentEffects(key, opts = {}) {
  ensureGlobalThemeShortcutsBound();
  const snap = opts.snapshot || lockedEffectsSnapshot || captureCurrentWorkspaceEffectsSnapshot();
  if (keepCurrentEffectsLock && !lockedEffectsSnapshot) {
    lockedEffectsSnapshot = snap;
  }
  plainStaticLockKey = null;
  resetSuppressedFx();
  rememberTheme(key);

  const root = typeof document !== "undefined" ? document.documentElement : null;
  let themeName = "Standard";
  let accentHex = "#38bdf8";
  let secondaryHex = "#a855f7";

  if (!key) {
    if (root) {
      for (const name of applied) root.style.removeProperty(`--${name}`);
      applied = [];
      currentVars = {};
      root.style.removeProperty("color-scheme");
      delete root.dataset.palette;
      const t = state.settings?.theme ?? "auto";
      if (t === "auto") delete root.dataset.theme;
      else root.dataset.theme = t;
    }
    wanted = "";
  } else {
    wanted = key;
    const { theme } = await call("themes/get", { key });
    themeName = theme.name || key;
    if (root) {
      const hw = probeClientHardware();
      syncRootPlatform(root, state.settings?.platformProfile || hw.platform);
      for (const name of applied) root.style.removeProperty(`--${name}`);
      applied = Object.keys(theme.vars);
      currentVars = { ...theme.vars };
      for (const [name, value] of Object.entries(theme.vars)) {
        root.style.setProperty(`--${name}`, value);
      }
      root.style.setProperty("color-scheme", theme.scheme);
      root.dataset.theme = theme.scheme;
      root.dataset.palette = key;
      accentHex = theme.vars?.accent || accentHex;
      secondaryHex = theme.vars?.selected || theme.vars?.accent || secondaryHex;
    }
  }

  // Restore glass/glow stylesheet & harmonize glow colors with the newly chosen color palette
  if (root && typeof document !== "undefined") {
    clearEffects();
    if (snap.fxCss) {
      const style = document.createElement("style");
      style.id = "fm-theme-effects";
      const nonce = document.querySelector('meta[name="fm-nonce"]')?.content;
      if (nonce) style.setAttribute("nonce", nonce);
      const retintedCss = snap.fxCss
        .replace(/--fx-glow-color\s*:\s*[^;]+/g, `--fx-glow-color:${accentHex}`)
        .replace(/--fx-glow-color-2\s*:\s*[^;]+/g, `--fx-glow-color-2:${secondaryHex}`);
      style.textContent = retintedCss;
      document.head.append(style);
    }
    for (const [attrName, attrVal] of Object.entries(snap.fxAttrs || {})) {
      root.setAttribute(attrName, attrVal);
    }
    if (keepCurrentEffectsLock) {
      root.dataset.keepFxLock = "true";
    }
  }

  const immersionPatch = {
    palette: key,
    atmosphere: snap.atmosphere || "none",
    uiElementFx: snap.uiElementFx || "off",
    iconPackStyle: snap.iconPackStyle || "default",
    themeIconGlow: snap.themeIconGlow || "off",
    themeIconAnimation: snap.themeIconAnimation || "off",
    themeFontProfile: snap.themeFontProfile || "default",
    themeCornerProfile: snap.themeCornerProfile || "default",
  };
  if (state.settings) Object.assign(state.settings, immersionPatch);
  applyUiImmersionProfiles(immersionPatch);
  try {
    applyAtmosphere(snap.atmosphere || "none");
  } catch {}
  await saveSettings(immersionPatch);
  emit("theme-changed", currentThemePayload());

  if (!opts.quiet) {
    toast(`🎨 Swapped colors to "${themeName}" while keeping your active effects!`, { kind: "success" });
  }
  return { key, name: themeName, snapshot: snap };
}

/**
 * Picks a random theme's color palette (optionally filtered by `dark` polarity) and applies ONLY its colors
 * while keeping 100% of the user's currently active workspace effects.
 */
export async function randomColorsKeepCurrentEffects(opts = {}) {
  const snap = lockedEffectsSnapshot || captureCurrentWorkspaceEffectsSnapshot();
  const all = await themeList().catch(() => []);
  if (!all.length) return null;
  const curKey = state.settings?.palette || "";
  let pool = all;
  if (typeof opts.dark === "boolean") {
    pool = all.filter((t) => Boolean(t.dark) === opts.dark);
  }
  const candidates = pool.length > 1 ? pool.filter((t) => t.key !== curKey) : pool;
  const chosen = candidates[Math.floor(Math.random() * candidates.length)] || all[0];
  if (!chosen) return null;
  await applyThemeColorsKeepingCurrentEffects(chosen.key, { ...opts, snapshot: snap });
  await activePickerRefresh?.();
  return chosen;
}

if (typeof window !== "undefined") {
  window.cycleAppTheme = cycleTheme;
  window.randomAppTheme = (mode, opts) => randomTheme({ ...(opts || {}), mode: mode || "any" });
  window.randomAppColorsKeepFx = (opts) => randomColorsKeepCurrentEffects(opts || {});
  window.applyAppColorsKeepFx = (key, opts) => applyThemeColorsKeepingCurrentEffects(key, opts || {});
  window.toggleAppKeepFxLock = (opts) => toggleKeepEffectsColorSwapMode(opts || {});
  window.toggleAppThemeFx = toggleCurrentThemeEffects;
  window.removeAppThemeFx = removeActiveWorkspaceEffect;
  window.openAppThemes = (opts) => showThemePicker(opts);
}

const choose = chooseTheme;
let activePickerRefresh = null;
let activePickerDialog = null;

/** The theme gallery: search, filter by light or dark, category, template tier, animations, surface material, color vibe or effects, pin favorites, and click a theme to try it. */
export async function showThemePicker(opts = {}) {
  hideQuickCycleHud();
  if (activePickerDialog) {
    try {
      activePickerDialog.close(true);
    } catch {}
    activePickerDialog = null;
  }
  if (typeof document !== "undefined") {
    for (const staleBackdrop of document.querySelectorAll(".modal-backdrop")) {
      if (staleBackdrop.querySelector(".theme-list")) {
        staleBackdrop.remove();
      }
    }
    if (!document.querySelector(".modal-backdrop")) {
      document.body?.classList?.remove("modal-open");
    }
  }
  let themes;
  try {
    themes = await themeList();
  } catch (err) {
    toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
    return;
  }
  const search = h("input", { type: "search", class: "prop-input theme-search", placeholder: "Search themes (e.g. plain, dracula, nord, macos, win95 — or press ⌘V to paste)", "aria-label": "Search themes", title: "Type part of a theme's name, like plain, dark, nord, dracula, m4, tahoe, or windows — or press ⌘V / Ctrl+V to paste a shared theme code." });
  const mode = h("select", { class: "prop-input", "aria-label": "Show light or dark themes", title: "Show only light themes, only dark ones, or both." },
    [["all", "Light and dark"], ["light", "Light only"], ["dark", "Dark only"]].map(([v, l]) => h("option", { value: v }, l)));
  const categoryOptions = [
    ["all", "All categories"],
    ["favorites", "★ Favorites"],
    ["recent", "⏱ Recently used"],
    ...(themes.some((t) => t.group === "My themes") ? [["My themes", "My themes"]] : []),
    ["Futuristic", "Futuristic"],
    ["Editors and classics", "Editors and classics"],
    ["Linux", "Linux"],
    ["Windows", "Windows"],
    ["macOS", "macOS"],
    ["Rare and beloved systems", "Rare and beloved systems"],
  ];
  const groupFilter = h("select", { class: "prop-input", "aria-label": "Show themes from a category", title: "Show themes from all categories, only your pinned favorites, recently used, or one category like Futuristic, Linux or Windows." },
    categoryOptions.map(([v, l]) => h("option", { value: v }, l)));
  const fxFilter = h("select", { class: "prop-input", "aria-label": "Show themes with or without special effects", title: "Special effects are glass panels, glow, moving light, scanlines and grain. Plain themes change only the colors." },
    [["any", "With or without effects"], ["fx", "✨ Special effects only"], ["plain", "Plain colors only"]].map(([v, l]) => h("option", { value: v }, l)));
  const tierFilter = h("select", { class: "prop-input", "aria-label": "Filter templates by tier", title: "Filter templates by performance & shader tier: Ultra (M4/RTX & Live FX), Medium (Balanced Glass & Glow), or Low (Zero-GPU Eco Colors)." },
    [
      ["all", "All template tiers"],
      ["ultra", "🚀 Ultra tier (M4 / Live FX)"],
      ["medium", "✨ Medium tier (Balanced Glass)"],
      ["low", "⚡ Low / Eco tier (Colors only)"],
    ].map(([v, l]) => h("option", { value: v }, l)));
  const animFilter = h("select", { class: "prop-input", "aria-label": "Filter templates by animations", title: "Filter templates by live canvas animations, Tesla/Physics simulations, or UI motion curves." },
    [
      ["all", "All animations & motion"],
      ["atmosphere", "🌌 Live Canvas FX"],
      ["physics", "⚡ Tesla & Sci-Fi Physics"],
      ["spring", "🌊 Spring Physics Motion"],
      ["snappy", "⚡ Snappy HUD Motion"],
      ["calm", "🍃 Calm Ambient Drift"],
      ["static", "⏹️ Static (No Motion)"],
    ].map(([v, l]) => h("option", { value: v }, l)));
  const sortFilter = h("select", { class: "prop-input", "aria-label": "Sort templates", title: "Sort templates by default category groups, Lowest CPU & GPU load, Highest GPU Shader load, Ultra tier first, Lightweight Eco tier first, or alphabetically." },
    [
      ["group", "Sort: Default groups"],
      ["cpu-asc", "Sort: 📟 Lowest CPU & GPU Load"],
      ["gpu-desc", "Sort: 🔥 Highest GPU Shader Load"],
      ["ultra-first", "Sort: 🚀 Ultra tier first"],
      ["eco-first", "Sort: ⚡ Low / Eco first"],
      ["name-asc", "Sort: Name (A–Z)"],
    ].map(([v, l]) => h("option", { value: v }, l)));
  let activeVibe = "all";
  let activeMaterial = "all";
  let activeCollection = "all";
  let lastShown = themes;
  let dialogRef = null;
  const list = h("div", { class: "theme-list" });
  const sectionJumpBar = h("div", { class: "theme-section-jump-bar", role: "navigation", "aria-label": "Jump to theme section" });
  const count = h("p", { class: "hint theme-count-bar", role: "status" });
  const supportsHas = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("selector(:has(*))");

  const plainThemesList = themes.filter((t) => !t.hasEffects);
  const plainDarkCount = plainThemesList.filter((t) => t.dark).length;
  const plainLightCount = plainThemesList.filter((t) => !t.dark).length;
  const plainEditorsCount = plainThemesList.filter((t) => t.group === "Editors and classics").length;
  const plainOsCount = plainThemesList.filter((t) => ["macOS", "Windows", "Linux", "Rare and beloved systems"].includes(t.group)).length;
  const fxThemesCount = themes.filter((t) => t.hasEffects).length;

  const browseModesDef = [
    ["all", `🌐 All Themes (${themes.length})`, "Show all plain and animated themes"],
    ["plain", `⏹️ Plain Themes — No Animations (${plainThemesList.length})`, "Show only clean, static color themes with zero animations or GPU effects"],
    ["plain-dark", `🌙 Plain Dark (${plainDarkCount})`, "Show only dark plain themes without animations"],
    ["plain-light", `☀️ Plain Light (${plainLightCount})`, "Show only light plain themes without animations"],
    ["plain-editors", `⌨️ Plain IDEs & Classics (${plainEditorsCount})`, "Show classic code editor and terminal color schemes (Dracula, Nord, Tokyo Night, Gruvbox, Solarized…)"],
    ["plain-os", `🖥️ Plain OS Classics (${plainOsCount})`, "Show classic macOS, Windows, Linux, and retro operating system themes without animations"],
    ["fx", `✨ Animated & 3D FX (${fxThemesCount})`, "Show themes with 3D glass, glow, storms, and live canvas effects"],
  ];

  const resolveActiveBrowseMode = () => {
    if (fxFilter.value === "plain" && activeCollection === "plain_os") return "plain-os";
    if (fxFilter.value === "plain" && groupFilter.value === "Editors and classics") return "plain-editors";
    if (fxFilter.value === "plain" && mode.value === "dark") return "plain-dark";
    if (fxFilter.value === "plain" && mode.value === "light") return "plain-light";
    if (fxFilter.value === "plain" || activeCollection === "plain_static") return "plain";
    if (fxFilter.value === "fx") return "fx";
    return "all";
  };

  const applyBrowseMode = (bm) => {
    search.value = "";
    tierFilter.value = "all";
    animFilter.value = "all";
    activeVibe = "all";
    activeMaterial = "all";
    if (bm === "plain") {
      fxFilter.value = "plain";
      mode.value = "all";
      groupFilter.value = "all";
      activeCollection = "all";
    } else if (bm === "plain-dark") {
      fxFilter.value = "plain";
      mode.value = "dark";
      groupFilter.value = "all";
      activeCollection = "all";
    } else if (bm === "plain-light") {
      fxFilter.value = "plain";
      mode.value = "light";
      groupFilter.value = "all";
      activeCollection = "all";
    } else if (bm === "plain-editors") {
      fxFilter.value = "plain";
      mode.value = "all";
      groupFilter.value = "Editors and classics";
      activeCollection = "all";
    } else if (bm === "plain-os") {
      fxFilter.value = "plain";
      mode.value = "all";
      groupFilter.value = "all";
      activeCollection = "plain_os";
    } else if (bm === "fx") {
      fxFilter.value = "fx";
      mode.value = "all";
      groupFilter.value = "all";
      activeCollection = "all";
    } else {
      fxFilter.value = "any";
      mode.value = "all";
      groupFilter.value = "all";
      activeCollection = "all";
    }
    draw();
  };

  const browseModeButtons = browseModesDef.map(([bm, label, tip]) =>
    h("button", {
      type: "button",
      class: `theme-browse-mode-btn${bm === "all" ? " is-active" : ""}`,
      "data-browse-mode": bm,
      "aria-pressed": String(bm === "all"),
      title: tip,
      onclick: () => applyBrowseMode(bm),
    }, label),
  );

  const killAnimationsBtn = h("button", {
    type: "button",
    class: "theme-browse-mode-btn theme-kill-anim-btn",
    "data-kill-animations": "true",
    title: "Immediately turn off all background animations, floating particles, 3D folder distortions, and special effects while keeping your current colors.",
    onclick: async () => {
      await disableAllThemeAnimations();
      draw();
    },
  }, "🛑 Turn Off All Animations & FX");

  const activePlatformProfile = () => state.settings?.platformProfile || document.documentElement?.dataset?.platform || probeClientHardware().platform;
  const platformOptimizeButtons = OPTIMIZE_PLATFORM_PRESETS.map((preset) =>
    h("button", {
      type: "button",
      class: `theme-browse-mode-btn theme-platform-opt-btn${activePlatformProfile() === preset.id ? " is-active" : ""}`,
      "data-optimize-platform": preset.id,
      "aria-pressed": String(activePlatformProfile() === preset.id),
      title: preset.title,
      onclick: async () => {
        await applyPlatformOptimizationPreset(preset.id);
        for (const btn of platformOptimizeButtons) {
          const on = btn.dataset.optimizePlatform === preset.id;
          btn.classList.toggle("is-active", on);
          btn.setAttribute("aria-pressed", String(on));
        }
      },
    }, preset.label),
  );

  const plainQuickButtons = POPULAR_PLAIN_THEME_PICKS.map((item) => {
    const tObj = item.key ? themes.find((t) => t.key === item.key) : null;
    if (item.key && !tObj) return null;
    const [, , accent] = tObj?.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
    return h("button", {
      type: "button",
      class: "theme-filter-pill theme-plain-quick-chip",
      "data-plain-quick": item.key,
      "aria-pressed": String((state.settings?.palette || "") === item.key),
      title: tObj ? `${tObj.name} (${tObj.dark ? "Dark" : "Light"} · Plain colors only, no animations)` : "Standard system light/dark colors (no animations)",
      onclick: async () => {
        await disableAllThemeAnimations({ quiet: true, stripThemeEffects: false });
        await pick(item.key);
      },
    },
      tObj ? h("span", { class: "theme-plain-quick-dot", style: `background:${accent}` }) : null,
      h("span", {}, item.label),
    );
  }).filter(Boolean);

  // 🎲 Random FX Finder & ⚡ Active Effects 1-Click Remover Strip in Full Theme Mode
  const activeFxStrip = h("div", {
    class: "theme-active-fx-strip",
    "data-active-fx-strip": "true",
    role: "region",
    "aria-label": "Random FX Finder and 1-Click Active Effect Remover",
  });

  const rollRandomInPicker = async (poolMode = "fx") => {
    const basePool = lastShown.length ? lastShown : themes;
    let pool = basePool;
    if (poolMode === "fx") {
      pool = basePool.filter((t) => Boolean(t.hasEffects));
      if (!pool.length) pool = themes.filter((t) => Boolean(t.hasEffects));
    } else if (poolMode === "ultra") {
      pool = basePool.filter((t) => resolveTemplateTier(t) === "ultra");
      if (!pool.length) pool = themes.filter((t) => resolveTemplateTier(t) === "ultra");
    } else if (poolMode === "plain") {
      await disableAllThemeAnimations({ quiet: true, stripThemeEffects: false });
      pool = basePool.filter((t) => !t.hasEffects);
      if (!pool.length) pool = themes.filter((t) => !t.hasEffects);
    }
    if (!pool.length) pool = themes;
    const curKey = previewKey ?? state.settings?.palette ?? "";
    const candidates = pool.length > 1 ? pool.filter((t) => t.key !== curKey) : pool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || pool[0];
    if (chosen) {
      await pick(chosen.key);
      updatePinFolderLabel(pinFolderBtn);
    }
  };

  function renderActiveFxStrip() {
    const activeEffects = getActiveWorkspaceEffects();
    const curKey = previewKey ?? state.settings?.palette ?? "";
    const curTheme = curKey ? themes.find((t) => t.key === curKey) : null;
    const themeLabel = curTheme ? curTheme.name : "Standard";
    const fxPills = activeEffects.map((eff) =>
      h("button", {
        type: "button",
        class: "theme-filter-pill theme-fx-remove-pill",
        "data-remove-active-fx": eff.kind,
        "data-remove-active-fx-id": eff.id,
        title: eff.title,
        onclick: async () => {
          await removeActiveWorkspaceEffect(eff.kind, eff.id);
          renderActiveFxStrip();
        },
      }, `${eff.label} ✕`),
    );
    const colorSwatchChips = QUICK_COLOR_PALETTE_SWATCHES.map((sw) => {
      const isCur = curKey === sw.key;
      return h("button", {
        type: "button",
        class: `theme-filter-pill theme-color-swap-chip${isCur ? " is-active" : ""}`,
        "data-swap-color-only": sw.key,
        "aria-pressed": String(isCur),
        title: `Keep 100% of your current active effects (3D folders, weather shaders, icon pack & glass) and swap ONLY the colors to ${sw.label}!`,
        onclick: async () => {
          await pick(sw.key, { keepEffectsOnly: true });
          updatePinFolderLabel(pinFolderBtn);
        },
      },
        h("span", {
          class: "theme-color-swap-dot",
          style: `background:linear-gradient(135deg, ${sw.bg} 45%, ${sw.accent} 55%)`,
        }),
        h("span", {}, sw.label),
      );
    });

    activeFxStrip.replaceChildren(
      h("div", { class: "theme-active-fx-rollers" },
        h("span", { class: "theme-pill-label" }, "🎲 Random FX Finder:"),
        h("button", {
          type: "button",
          class: "theme-filter-pill theme-random-fx-pill",
          "data-picker-roll-random-fx": "true",
          title: "Roll a random theme with animated 3D / weather effects (⌥E) — then click any ✕ pill on the right to remove effects you don't want!",
          onclick: () => rollRandomInPicker("fx"),
        }, "🎲 Roll Random FX Theme"),
        h("button", {
          type: "button",
          class: "theme-filter-pill theme-random-fx-pill",
          "data-picker-roll-random-ultra": "true",
          title: "Roll a random Ultra / God-Mode theme (⌥U) — then click any ✕ pill on the right to strip effects you don't want!",
          onclick: () => rollRandomInPicker("ultra"),
        }, "🚀 Roll Random Ultra / God-Mode"),
        h("button", {
          type: "button",
          class: "theme-filter-pill",
          "data-picker-roll-random-plain": "true",
          title: "Roll a random clean static theme with zero effects (⌥P).",
          onclick: () => rollRandomInPicker("plain"),
        }, "⏹️ Roll Random Plain"),
      ),
      h("div", { class: "theme-active-fx-pills", "data-active-fx-pills-list": "true" },
        h("span", { class: "theme-pill-label" }, `⚡ Active FX on "${themeLabel}":`),
        ...(fxPills.length
          ? [
              ...fxPills,
              h("button", {
                type: "button",
                class: "theme-filter-pill theme-fx-remove-all-pill",
                "data-remove-all-active-fx": "true",
                title: "Strip all active effects at once and keep only the current color palette.",
                onclick: async () => {
                  await removeActiveWorkspaceEffect("all");
                  renderActiveFxStrip();
                },
              }, "🛑 Strip All FX (Keep Colors)"),
            ]
          : [h("span", { class: "hint" }, "None (0.0% GPU Plain Colors — click 🎲 Roll Random FX Theme to try effects)")]),
      ),
      h("div", {
        class: `theme-keep-fx-color-bar${keepCurrentEffectsLock ? " is-locked" : ""}`,
        "data-keep-fx-color-bar": "true",
        role: "group",
        "aria-label": "Keep Current Effects and Change Colors Only",
      },
        h("span", { class: "theme-pill-label" }, "🎨 Keep Effects, Swap Colors:"),
        h("button", {
          type: "button",
          class: `theme-filter-pill theme-keep-fx-lock-btn${keepCurrentEffectsLock ? " is-active" : ""}`,
          "data-keep-fx-lock": "true",
          "aria-pressed": String(keepCurrentEffectsLock),
          title: "When locked, clicking ANY of the 310 themes below swaps ONLY its colors while keeping your exact active weather shaders, 3D folders, icon pack, and glass!",
          onclick: () => {
            toggleKeepEffectsColorSwapMode();
            renderActiveFxStrip();
          },
        }, keepCurrentEffectsLock ? "🔒 FX Locked (Click Any Theme for Colors Only)" : "🔓 Lock My Current Effects (Swap Colors Only)"),
        h("button", {
          type: "button",
          class: "theme-filter-pill theme-random-fx-pill",
          "data-roll-color-keep-fx": "true",
          title: "Keep 100% of your current effects and roll a fresh random color palette (⌥C)!",
          onclick: async () => {
            const basePool = lastShown.length ? lastShown : themes;
            const candidates = basePool.length > 1 ? basePool.filter((t) => t.key !== curKey) : basePool;
            const chosen = candidates[Math.floor(Math.random() * candidates.length)] || themes[0];
            if (chosen) {
              await pick(chosen.key, { keepEffectsOnly: true });
              updatePinFolderLabel(pinFolderBtn);
            }
          },
        }, "🎲 Random Colors (Keep FX · ⌥C)"),
        ...colorSwatchChips,
      ),
    );
  }

  const topDoneBtn = h("button", {
    type: "button",
    class: "theme-browse-mode-btn theme-picker-top-done-btn",
    "data-theme-picker-done": "true",
    "aria-label": "Done — close Themes dialog and keep current theme",
    title: "Close the Themes dialog and keep your selected theme (or press Esc / Enter)",
    onclick: (e) => {
      e.stopPropagation();
      dialogRef?.close(true);
    },
  }, "✓ Done (Esc)");

  const browseModeBar = h("div", { class: "theme-browse-mode-bar", role: "region", "aria-label": "Browse Plain Themes or Animated Effects" },
    h("div", { class: "theme-browse-mode-tabs" },
      h("span", { class: "theme-browse-mode-title" }, "🧭 Browse Mode:"),
      ...browseModeButtons,
      ...platformOptimizeButtons,
      killAnimationsBtn,
      topDoneBtn,
    ),
    activeFxStrip,
    h("div", { class: "theme-plain-quick-strip" },
      h("span", { class: "theme-pill-label" }, "⭐ Instant Plain Themes (No Animations):"),
      ...plainQuickButtons,
    ),
  );

  const collectionPillsDef = [
    ["all", "All Collections"],
    ["god_mode_3000", "🌌 God-Mode 3000+ (12)"],
    ["flagship_mac_xdr", "🍎 Flagship Mac XDR (10)"],
    ["plain_static", `⏹️ Plain & Static (${plainThemesList.length})`],
    ["plain_os", `🖥️ Classic OS (${plainOsCount})`],
    ["us_holidays", "🎄 US Holidays (18)"],
    ["nerd_complete", "🎲 Nerd Complete (10)"],
    ["horror_nightmare", "🧛 Horror & Crypt (10)"],
    ["realworld_objects", "🕰️ Real-World Objects (6)"],
  ];
  const collectionPillButtons = collectionPillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-collection-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        activeCollection = val;
        if (val === "plain_static" || val === "plain_os") fxFilter.value = "plain";
        else if (fxFilter.value === "plain") fxFilter.value = "any";
        draw();
      },
    }, label),
  );

  const catPillsDef = [
    ["all", "All"],
    ["favorites", "★ Favorites"],
    ["recent", "⏱ Recent"],
    ...(themes.some((t) => t.group === "My themes") ? [["My themes", "🎨 My themes"]] : []),
    ["Editors and classics", "⌨️ Editors"],
    ["macOS", "🍎 macOS"],
    ["Windows", "🪟 Windows"],
    ["Linux", "🐧 Linux"],
    ["Rare and beloved systems", "💎 Rare"],
    ["Futuristic", "✨ Futuristic"],
  ];
  const catPillButtons = catPillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-cat-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        groupFilter.value = val;
        draw();
      },
    }, label),
  );

  const tierPillsDef = [
    ["all", "All Tiers"],
    ["ultra", "🚀 Ultra Tier"],
    ["medium", "✨ Medium / Glass"],
    ["low", "⚡ Low / Eco"],
  ];
  const tierPillButtons = tierPillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-tier-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        tierFilter.value = val;
        draw();
      },
    }, label),
  );

  const animPillsDef = [
    ["all", "All Animations"],
    ["atmosphere", "🌌 Live Canvas FX"],
    ["physics", "⚡ Tesla & Physics"],
    ["spring", "🌊 Spring Motion"],
    ["snappy", "⚡ Snappy HUD"],
    ["calm", "🍃 Calm Drift"],
    ["static", "⏹️ Static"],
  ];
  const animPillButtons = animPillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-anim-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        animFilter.value = val;
        draw();
      },
    }, label),
  );

  const materialPillsDef = [
    ["all", "All Surfaces"],
    ["liquid", "💧 Liquid Glass"],
    ["mica", "🪟 Mica & Acrylic"],
    ["frosted", "❄️ Frosted Glass"],
    ["solid", "🧱 Solid & OLED"],
  ];
  const materialPillButtons = materialPillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-material-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        activeMaterial = val;
        draw();
      },
    }, label),
  );

  const vibePillsDef = [
    ["all", "All Vibes"],
    ["oled", "⚫ OLED Black"],
    ["cyan", "🔵 Cyan & Ocean"],
    ["violet", "🟣 Violet & Neon"],
    ["emerald", "🟢 Emerald"],
    ["warm", "🟠 Amber & Warm"],
    ["light", "☀️ Crisp Light"],
  ];
  const vibePillButtons = vibePillsDef.map(([val, label]) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${val === "all" ? " is-active" : ""}`,
      "data-vibe-pill": val,
      "aria-pressed": String(val === "all"),
      onclick: () => {
        activeVibe = val;
        draw();
      },
    }, label),
  );

  const hw = probeClientHardware();
  const recommendedTier = hw.tier === "ultra" ? "ultra" : hw.tier === "low" ? "low" : "medium";
  const hwMatchBtn = h("button", {
    type: "button",
    class: "theme-filter-pill",
    "data-hw-recommend": recommendedTier,
    title: `Filter templates tailored for your detected hardware tier (${recommendedTier.toUpperCase()})`,
    onclick: () => {
      tierFilter.value = recommendedTier;
      draw();
    },
  }, `🎯 For My System (${recommendedTier.toUpperCase()})`);

  const resetFiltersBtn = h("button", {
    type: "button",
    class: "theme-filter-pill theme-reset-pill",
    "data-reset-filters": "true",
    title: "Reset all category, tier, animation, material, and color vibe filters",
    onclick: () => {
      search.value = "";
      mode.value = "all";
      groupFilter.value = "all";
      fxFilter.value = "any";
      tierFilter.value = "all";
      animFilter.value = "all";
      sortFilter.value = "group";
      activeVibe = "all";
      activeMaterial = "all";
      activeCollection = "all";
      draw();
    },
  }, "↺ Reset Filters");

  const navBar = h("div", { class: "theme-nav-bar", role: "region", "aria-label": "Quick theme filters" },
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Category"), ...catPillButtons, resetFiltersBtn),
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Collections"), ...collectionPillButtons),
  );

  const advancedFiltersNav = h("div", { class: "theme-advanced-filters-grid" },
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Template Tier"), ...tierPillButtons, hwMatchBtn),
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Animations"), ...animPillButtons),
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Surface Shader"), ...materialPillButtons),
    h("div", { class: "theme-pill-row" }, h("span", { class: "theme-pill-label" }, "Color Vibe"), ...vibePillButtons),
  );

  const card = (t) => {
    const on = state.settings.palette === t.key;
    const pinned = isFavoriteTheme(t.key);
    const tier = resolveTemplateTier(t);
    const tierLabel = tier === "ultra" ? "🚀 Ultra" : tier === "medium" ? "✨ Medium" : "⚡ Low";
    const tele = estimateThemeResourceTelemetry(t);
    const animBadge = t.atmosphere && t.atmosphere !== "none"
      ? h("span", { class: "theme-anim-badge", "data-anim-badge": t.atmosphere, title: `Built-in live canvas animation: ${t.atmosphere}` }, "🌌 Live FX")
      : t.hasEffects && t.motion && t.motion !== "none" && t.motion !== "zero"
        ? h("span", { class: "theme-anim-badge", "data-anim-badge": t.motion, title: `UI motion profile: ${t.motion}` }, t.motion === "spring" ? "🌊 Spring" : t.motion === "snappy" ? "⚡ Snappy" : "🍃 Calm")
        : null;
    const uiFxBadgeLabel = t.uiElementFx === "fire_folders" ? "🔥 Fire UI"
      : t.uiElementFx === "slime_drip" ? "🧪 Slime UI"
      : t.uiElementFx === "storm_wind" ? "🌪️ Storm UI"
      : t.uiElementFx === "cryo_frost" ? "🧊 Cryo UI"
      : t.uiElementFx === "tesla_arcs" ? "⚡ Tesla UI"
      : t.uiElementFx === "mercury_chrome" ? "💧 Chrome UI"
      : t.uiElementFx === "holo_glitch" ? "📺 Holo UI"
      : t.uiElementFx === "void_tentacles" ? "🦑 Void UI"
      : t.uiElementFx === "kaleidoscope_prism" ? "🌈 Kaleido UI"
      : t.uiElementFx === "lava_wax" ? "🫧 Lava UI"
      : t.uiElementFx === "acid_warp" ? "🌀 Acid UI"
      : t.uiElementFx === "oil_slick_chrome" ? "🛢️ Oil-Slick UI"
      : t.uiElementFx === "shroom_spores" ? "🍄 Spore UI"
      : t.uiElementFx === "holiday_festive_glow" ? "🎄 Holiday UI"
      : t.uiElementFx === "nerd_arcane_runes" ? "🎲 Arcane UI"
      : t.uiElementFx === "nerd_lcars_hud" ? "🖖 LCARS UI"
      : t.uiElementFx === "horror_blood_moon" ? "🧛 Crypt UI"
      : t.uiElementFx === "horror_vhs_static" ? "📼 VHS UI"
      : t.uiElementFx === "realworld_mahogany_brass" ? "🕰️ Mahogany UI"
      : t.uiElementFx === "realworld_stained_glass" ? "🪟 Stained-Glass UI"
      : t.uiElementFx === "screen_melt_ooze" ? "🫠 Screen-Melt UI"
      : t.uiElementFx === "molten_lava_melt" ? "🌋 Molten-Melt UI"
      : t.uiElementFx === "crt_magnetic_warp" ? "🧲 CRT-Warp UI"
      : t.uiElementFx === "fever_dream_ripple" ? "🌊 Mirage-Ripple UI"
      : t.uiElementFx === "cupertino_ceramic_bevel" ? "🍎 Ceramic HIG UI"
      : t.uiElementFx === "swiss_sapphire_chronograph" ? "⌚ Sapphire UI"
      : t.uiElementFx === "teenage_field_anodized" ? "🎛️ Field-Synth UI"
      : t.uiElementFx === "blueprint_cad_cyanotype" ? "📐 Cyanotype CAD UI"
      : t.uiElementFx === "kyoto_washi_sumi" ? "🎋 Kyoto Washi UI"
      : t.uiElementFx === "carbon_kevlar_weave" ? "🏎️ Forged Carbon UI"
      : t.uiElementFx === "godmode_omega_halo" ? "✨ Omega Halo UI"
      : t.uiElementFx === "godmode_photonic_crystal" ? "💎 Photonic 3099 UI"
      : t.uiElementFx === "godmode_dyson_lattice" ? "🌞 Dyson Lattice UI"
      : t.uiElementFx === "godmode_chrono_crystal" ? "⏳ Chrono-Crystal UI"
      : t.uiElementFx === "godmode_akashic_synapse" ? "🧬 Akashic UI"
      : t.uiElementFx === "godmode_tachyon_warp" ? "🚀 Tachyon Warp UI"
      : t.uiElementFx === "xdr_titanium_folders" ? "🖥️ XDR Titanium UI"
      : t.uiElementFx === "tahoe_glass_folders" ? "🌊 Tahoe 3D Glass UI"
      : t.uiElementFx === "fluent_mica_folders" ? "🪟 Fluent 3D UI"
      : t.uiElementFx === "google_material_folders" ? "🎨 Material 3D UI"
      : "";
    const uiFxBadge = uiFxBadgeLabel
      ? h("span", { class: "theme-uifx-badge", "data-uifx-badge": t.uiElementFx, title: `Includes interactive File Manager folder & toolbar shader (${t.uiElementFx})` }, uiFxBadgeLabel)
      : null;
    const telemetryBadge = h("span", {
      class: `theme-telemetry-badge is-grade-${tele.grade.toLowerCase()}`,
      "data-theme-telemetry": t.key,
      "data-theme-cpu": String(tele.cpuPct),
      "data-theme-gpu": String(tele.gpuPct),
      "data-telemetry-grade": tele.grade,
      title: `Live Hardware Resource Telemetry — CPU: ${tele.cpuPct.toFixed(1)}% · GPU: ${tele.gpuPct.toFixed(1)}% · VRAM: ${tele.vramMb} MB · Power: ${tele.watts} W · ${tele.fps} FPS (${tele.frameTimeMs} ms)`,
    }, `📟 CPU ${tele.cpuPct.toFixed(1)}% · GPU ${tele.gpuPct.toFixed(1)}%`);
    const b = h("button", {
      type: "button",
      class: "theme-card",
      "data-key": t.key,
      "data-tier": tier,
      "aria-pressed": String(on),
      title: `${t.name}: ${t.description} (Click to preview/apply · Shift+Click or 🌈 to swap colors while keeping your current active effects · Double-click to apply & close)`,
      onclick: (e) => pick(t.key, { keepEffectsOnly: Boolean(e?.shiftKey || keepCurrentEffectsLock) }),
      ondblclick: async (e) => {
        await pick(t.key, { keepEffectsOnly: Boolean(e?.shiftKey || keepCurrentEffectsLock) });
        dialogRef?.close(true);
      },
    },
      swatch(t), h("span", { class: "theme-name" }, t.name), h("span", { class: "theme-kind" }, t.dark ? "Dark" : "Light"),
      h("span", { class: "theme-card-badges" },
        t.hasEffects ? h("span", { class: "theme-fx-badge", title: "This theme has special effects: glass, glow, motion and texture." }, "✨ Effects") : h("span", { class: "theme-plain-badge" }, "Colors only"),
        h("span", { class: `theme-tier-badge theme-tier-${tier}`, "data-tier-badge": tier, title: `Template Tier: ${tierLabel}` }, tierLabel),
        telemetryBadge,
        animBadge,
        uiFxBadge,
      ));
    const keepFxColorBtn = h("button", {
      type: "button",
      class: "theme-keep-fx-color-quick",
      "data-keep-fx-color-key": t.key,
      "aria-label": `Apply ${t.name} colors while keeping current effects`,
      title: `🌈 Keep My Current Effects, Swap Colors to ${t.name} (changes only the color palette while preserving your active background weather, 3D folders, icon pack & icon animations!)`,
      onclick: async (e) => {
        e.stopPropagation();
        previewKey = null;
        await applyThemeColorsKeepingCurrentEffects(t.key);
        telemetryDeck?.inspectTheme?.(t.key);
        draw();
      },
    }, "🌈");
    const plainOnlyBtn = t.hasEffects
      ? h("button", {
          type: "button",
          class: "theme-plain-only-quick",
          "data-plain-only-key": t.key,
          "aria-label": `Apply ${t.name} colors only without animations`,
          title: `Apply ${t.name} as Plain Colors Only (turns off all animations, glass blur & 3D FX — drops GPU usage to 0.0%)`,
          onclick: async (e) => {
            e.stopPropagation();
            previewKey = null;
            await applyThemePlainColorsOnly(t.key);
            telemetryDeck?.inspectTheme?.(t.key);
            draw();
          },
        }, "⏹️")
      : null;
    const editBtn = h("button", {
      type: "button",
      class: "theme-edit-quick",
      "data-edit-key": t.key,
      "aria-label": `Customize ${t.name}`,
      title: `Clone & hack ${t.name} in the Theme Editor…`,
      onclick: (e) => {
        e.stopPropagation();
        dialogRef?.close();
        emit("theme-editor", { from: t.key });
      },
    }, "✎");
    const shareBtn = h("button", {
      type: "button",
      class: "theme-share-quick",
      "data-share-key": t.key,
      "aria-label": `Share ${t.name}`,
      title: `Copy 1-line Share Code for ${t.name} & open Export / Import Studio…`,
      onclick: async (e) => {
        e.stopPropagation();
        try {
          const exp = await call("themes/custom/export", { key: t.key });
          if (exp?.shareCode) {
            await copyToClipboard(exp.shareCode, { what: `${t.name} share code`, quiet: true });
            flashCopied(shareBtn, "✓");
          }
        } catch {}
        void showThemeShareDialog(t.key, themes);
      },
    }, "🔗");
    const pin = h("button", {
      type: "button",
      class: "theme-pin",
      "data-pin-key": t.key,
      "aria-pressed": String(pinned),
      "aria-label": pinned ? `Unpin ${t.name} from Favorites` : `Pin ${t.name} to Favorites`,
      title: pinned ? `Pinned to Favorites. Click to unpin ${t.name}.` : `Pin ${t.name} to Favorites so it appears at the top of the gallery and in the Themes menu.`,
      onclick: async (e) => {
        e.stopPropagation();
        const keepPreview = previewKey;
        const nowPinned = await toggleFavoriteTheme(t.key);
        if (!supportsHas) wrap.classList.toggle("is-pinned", nowPinned);
        if (keepPreview !== null) {
          previewKey = keepPreview;
          await applyPalette(keepPreview);
        }
        draw();
        list.querySelector(`.theme-pin[data-pin-key="${t.key}"]`)?.focus({ preventScroll: true });
      },
    }, pinned ? "★" : "☆");
    const wrap = h("div", { class: `theme-card-item${!supportsHas && pinned ? " is-pinned" : ""}` }, b, keepFxColorBtn, plainOnlyBtn, shareBtn, editBtn, pin);
    return wrap;
  };
  const defaultCard = () => {
    const on = !state.settings.palette;
    return h("div", { class: "theme-card-item" },
      h("button", {
        type: "button",
        class: "theme-card",
        "data-key": "",
        "aria-pressed": String(on),
        title: "The standard colors: they follow your computer's light or dark setting, or the Colors choice in Settings. (Double-click to apply & close)",
        onclick: () => pick(""),
        ondblclick: async () => {
          await pick("");
          dialogRef?.close(true);
        },
      },
        defaultSwatch(),
        h("span", { class: "theme-name" }, "Standard"),
        h("span", { class: "theme-kind" }, "Light or dark"),
        h("span", { class: "theme-card-badges" },
          h("span", { class: "theme-plain-badge" }, "Colors only"),
          h("span", { class: "theme-telemetry-badge is-grade-zero-overhead", "data-theme-telemetry": "", "data-theme-cpu": "0.1", "data-theme-gpu": "0" }, "📟 CPU 0.1% · GPU 0.0%"),
        ),
      ));
  };

  const GOD_MODE_COLLECTION_KEYS = new Set([
    "omega_point_singularity", "matrioshka_dyson_brain", "photonic_metamaterial_3099", "chrono_crystalline_aethelgard",
    "akashic_neural_noosphere", "zero_point_vacuum_genesis", "kardashev_type_iii_citadel", "hyperborean_aether_sanctum_day",
    "tachyon_slipstream_navigator", "seraphim_halo_relativity", "quantum_superposition_cathedral", "eden_solarpunk_archology_3000",
  ]);
  const FLAGSHIP_MAC_COLLECTION_KEYS = new Set([
    "mac_studio_m4_ultra", "mac_pro_rack_xdr", "macbook_pro_space_black", "apple_studio_display_5k",
    "imac_m4_spectrum_p3", "macos_sequoia_redwood_xdr", "macos_vision_spatial_mac", "mac_mini_m4_pro_carbon",
    "m4_pro_display_xdr", "tahoe_studio_3d",
  ]);
  const TIER_RANK = { ultra: 3, medium: 2, low: 1 };
  const matchesCollection = (t) => {
    if (activeCollection === "all") return true;
    if (activeCollection === " plain_static" || activeCollection === "plain_static") return !t.hasEffects;
    if (activeCollection === "plain_os") return !t.hasEffects && ["macOS", "Windows", "Linux", "Rare and beloved systems"].includes(t.group);
    const k = String(t.key || "");
    if (activeCollection === "god_mode_3000") return GOD_MODE_COLLECTION_KEYS.has(k);
    if (activeCollection === "flagship_mac_xdr") return FLAGSHIP_MAC_COLLECTION_KEYS.has(k);
    if (activeCollection === "us_holidays") return k.startsWith("holiday_");
    if (activeCollection === "nerd_complete") return k.startsWith("nerd_");
    if (activeCollection === "horror_nightmare") return k.startsWith("horror_");
    if (activeCollection === "realworld_objects") return k.startsWith("realworld_");
    return true;
  };

  function draw() {
    const q = search.value.trim().toLowerCase();
    const m = mode.value;
    const grp = groupFilter.value;
    const fx = fxFilter.value;
    const tier = tierFilter.value;
    const anim = animFilter.value;
    const sortBy = sortFilter.value;
    const activeBm = resolveActiveBrowseMode();
    for (const btn of browseModeButtons) {
      const active = btn.dataset.browseMode === activeBm;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const chip of plainQuickButtons) {
      const active = (state.settings?.palette || "") === (chip.dataset.plainQuick || "");
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
    }
    for (const btn of catPillButtons) {
      const active = btn.dataset.catPill === grp;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const btn of collectionPillButtons) {
      const active = btn.dataset.collectionPill === activeCollection;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const btn of tierPillButtons) {
      const active = btn.dataset.tierPill === tier;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const btn of animPillButtons) {
      const active = btn.dataset.animPill === anim;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const btn of materialPillButtons) {
      const active = btn.dataset.materialPill === activeMaterial;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    for (const btn of vibePillButtons) {
      const active = btn.dataset.vibePill === activeVibe;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    const favSet = new Set(favoriteKeys());
    const recKeys = recentKeys();
    const recSet = new Set(recKeys);
    const shown = themes.filter((t) => (m === "all" || (m === "dark") === t.dark)
      && (fx === "any" || (fx === "fx") === !!t.hasEffects)
      && (grp === "all" || (grp === "favorites" ? favSet.has(t.key) : grp === "recent" ? recSet.has(t.key) : t.group === grp))
      && matchesCollection(t)
      && themeMatchesTier(t, tier)
      && themeMatchesAnimation(t, anim)
      && themeMatchesMaterial(t, activeMaterial)
      && themeMatchesVibe(t, activeVibe)
      && (!q || `${t.name} ${t.group} ${t.key} ${t.description} ${resolveTemplateTier(t)} ${t.motion || ""} ${t.atmosphere || ""} ${t.backdropStyle || ""} ${t.uiElementFx || ""} ${t.iconPackStyle || ""} ${favSet.has(t.key) ? "favorite favorite pinned star" : ""} ${t.hasEffects ? "effects special effects fx glow glass motion" : "plain static no animation simple clean classic zero gpu"}`.toLowerCase().includes(q)));
    if (sortBy === "cpu-asc") {
      shown.sort((a, b) => {
        const ta = estimateThemeResourceTelemetry(a);
        const tb = estimateThemeResourceTelemetry(b);
        return ((ta.cpuPct + ta.gpuPct) - (tb.cpuPct + tb.gpuPct)) || a.name.localeCompare(b.name);
      });
    } else if (sortBy === "gpu-desc") {
      shown.sort((a, b) => {
        const ta = estimateThemeResourceTelemetry(a);
        const tb = estimateThemeResourceTelemetry(b);
        return ((tb.gpuPct + tb.cpuPct) - (ta.gpuPct + ta.cpuPct)) || a.name.localeCompare(b.name);
      });
    } else if (sortBy === "ultra-first") {
      shown.sort((a, b) => (TIER_RANK[resolveTemplateTier(b)] - TIER_RANK[resolveTemplateTier(a)]) || a.name.localeCompare(b.name));
    } else if (sortBy === "eco-first") {
      shown.sort((a, b) => (TIER_RANK[resolveTemplateTier(a)] - TIER_RANK[resolveTemplateTier(b)]) || a.name.localeCompare(b.name));
    } else if (sortBy === "name-asc") {
      shown.sort((a, b) => a.name.localeCompare(b.name));
    }
    lastShown = shown;
    const sections = [];
    const jumpTargets = [];
    const addSection = (secEl, label, secId) => {
      secEl.dataset.sectionId = secId;
      sections.push(secEl);
      jumpTargets.push({ label, secEl, secId });
    };
    const favShown = favoriteKeys().map((k) => shown.find((t) => t.key === k)).filter(Boolean);
    if ((grp === "all" || grp === "favorites") && favShown.length && sortBy === "group") {
      addSection(h("section", { class: "theme-section-favorites" }, h("h3", {}, `Favorites (${favShown.length})`), h("div", { class: "theme-grid" }, favShown.map(card))), `★ Favorites (${favShown.length})`, "favorites");
    }
    if (grp === "recent") {
      const recShown = recKeys.map((k) => shown.find((t) => t.key === k)).filter(Boolean);
      if (recShown.length) {
        addSection(h("section", { class: "theme-section-recent" }, h("h3", {}, `Recently used (${recShown.length})`), h("div", { class: "theme-grid" }, recShown.map(card))), `⏱ Recent (${recShown.length})`, "recent");
      }
    }
    if (!q && m === "all" && fx !== "fx" && grp === "all" && (activeCollection === "all" || activeCollection === "plain_static") && activeVibe === "all" && activeMaterial === "all" && tier === "all" && anim === "all" && sortBy === "group") {
      addSection(h("section", {}, h("h3", {}, "Default"), h("div", { class: "theme-grid" }, defaultCard())), "Default", "default");
    }
    if (grp !== "favorites" && grp !== "recent") {
      if (sortBy !== "group") {
        if (shown.length) {
          const sortHeading = sortBy === "cpu-asc"
            ? "Sorted by Lowest CPU & GPU Load (📟 Zero-GPU First)"
            : sortBy === "gpu-desc"
              ? "Sorted by Highest GPU Shader Load (🔥 Ultra FX First)"
              : sortBy === "ultra-first"
                ? "Sorted by Tier (🚀 Ultra First)"
                : sortBy === "eco-first"
                  ? "Sorted by Tier (⚡ Low / Eco First)"
                  : "All Matching Themes (A–Z)";
          addSection(h("section", {}, h("h3", {}, `${sortHeading} (${shown.length})`), h("div", { class: "theme-grid" }, shown.map(card))), `${sortHeading} (${shown.length})`, "sorted");
        }
      } else {
        for (const group of GROUP_ORDER) {
          const inGroup = shown.filter((t) => t.group === group);
          if (inGroup.length) {
            addSection(h("section", {}, h("h3", {}, `${group} (${inGroup.length})`), h("div", { class: "theme-grid" }, inGroup.map(card))), `${group} (${inGroup.length})`, group);
          }
        }
      }
    } else if (grp === "favorites" && sortBy !== "group" && favShown.length) {
      addSection(h("section", { class: "theme-section-favorites" }, h("h3", {}, `Favorites (${favShown.length})`), h("div", { class: "theme-grid" }, favShown.map(card))), `★ Favorites (${favShown.length})`, "favorites");
    }
    if (jumpTargets.length > 1) {
      sectionJumpBar.hidden = false;
      sectionJumpBar.replaceChildren(
        h("span", { class: "theme-pill-label" }, "Jump to section:"),
        ...jumpTargets.map((jt) =>
          h("button", {
            type: "button",
            class: "theme-filter-pill theme-jump-section-pill",
            "data-jump-section": jt.secId,
            title: `Scroll directly to ${jt.label}`,
            onclick: () => {
              jt.secEl.scrollIntoView?.({ behavior: "smooth", block: "start" });
            },
          }, jt.label),
        ),
      );
    } else {
      sectionJumpBar.hidden = true;
      sectionJumpBar.replaceChildren();
    }
    const emptyMsg = grp === "favorites" && !favSet.size
      ? "No favorite themes yet. Click ☆ on any theme card to pin it here."
      : grp === "recent" && !recSet.size
        ? "No recently used themes yet. Click any theme card to try it."
        : "No theme matches. Click ↺ Reset Filters or try another Template Tier, Animation, Surface Shader, or Color Vibe.";
    list.replaceChildren(...(sections.length ? sections : [h("p", { class: "hint" }, emptyMsg)]));
    const withFx = shown.filter((t) => t.hasEffects).length;
    count.textContent = `${shown.length} of ${themes.length} themes · ${withFx} with special effects ✨, ${shown.length - withFx} plain colors`;
    renderActiveFxStrip();
  }
  // Keyboard: the arrow keys, PageUp/PageDown, Home, End, and [ / ] move between cards and show each theme straight away (not saved yet).
  // Enter or Space keeps the focused theme, Done keeps the one on show, and Escape goes back to the saved theme.
  let previewKey = null;
  let telemetryDeck = null;
  const reloadGalleryThemes = async () => {
    try {
      themes = await themeList();
      previewKey = null;
      if (themes.some((t) => t.group === "My themes") && ![...groupFilter.options].some((o) => o.value === "My themes")) {
        const opt = h("option", { value: "My themes" }, "My themes");
        groupFilter.insertBefore(opt, groupFilter.options[3] || null);
      }
      draw();
    } catch {}
  };
  activePickerRefresh = reloadGalleryThemes;
  const cards = () => [...list.querySelectorAll(".theme-card")];
  const preview = debounce((key) => {
    if (previewKey === key) {
      if (keepCurrentEffectsLock) {
        void applyThemeColorsKeepingCurrentEffects(key, { quiet: true }).then(() => renderActiveFxStrip());
      } else {
        void applyPalette(key).then(() => renderActiveFxStrip());
      }
    }
  }, 20);
  async function pick(key, pickOpts = {}) {
    previewKey = null;
    if (Boolean(pickOpts.keepEffectsOnly || keepCurrentEffectsLock)) {
      await applyThemeColorsKeepingCurrentEffects(key, { quiet: Boolean(pickOpts.quiet) });
    } else {
      const pickedTheme = key ? themes.find((t) => t.key === key) : null;
      if (!key || !pickedTheme?.hasEffects) {
        // Choosing Standard or any Plain Theme automatically stops leftover background canvas atmospheres & folder FX
        try {
          applyAtmosphere("none");
        } catch {}
        if (state.settings) {
          state.settings.atmosphere = "none";
          state.settings.uiElementFx = "off";
          state.settings.iconPackStyle = "default";
          state.settings.themeIconGlow = "off";
          state.settings.themeIconAnimation = "off";
        }
        applyUiImmersionProfiles({ uiElementFx: "off", iconPackStyle: "default", themeIconGlow: "off", themeIconAnimation: "off" });
      }
      await choose(key);
      await applyPalette(key);
    }
    telemetryDeck?.inspectTheme?.(key);
    renderActiveFxStrip();
    if (groupFilter.value === "recent") {
      draw();
    } else {
      for (const c of list.querySelectorAll(".theme-card")) {
        c.setAttribute("aria-pressed", String((c.dataset.key ?? "") === key));
      }
      for (const chip of plainQuickButtons) {
        const active = (chip.dataset.plainQuick || "") === key;
        chip.classList.toggle("is-active", active);
        chip.setAttribute("aria-pressed", String(active));
      }
    }
    cards().find((c) => (c.dataset.key ?? "") === key)?.focus({ preventScroll: true });
  }
  list.addEventListener("focusin", (e) => {
    const c = e.target.closest?.(".theme-card");
    if (!c) return;
    const key = c.dataset.key ?? "";
    telemetryDeck?.inspectTheme?.(key);
    if (key === (state.settings.palette || "") && previewKey === null) return;
    previewKey = key;
    preview(key);
  });
  const step = (from, key) => {
    const all = cards();
    if (!all.length) return from;
    const i = Math.max(0, all.indexOf(from));
    if (key === "Home") return all[0];
    if (key === "End") return all.at(-1);
    if (key === "ArrowLeft") return all[(i - 1 + all.length) % all.length];
    if (key === "ArrowRight") return all[(i + 1) % all.length];
    if (key === "PageUp") return all[Math.max(0, i - 8)];
    if (key === "PageDown") return all[Math.min(all.length - 1, i + 8)];
    // Up and Down: the nearest card in the row above or below, across group headings too.
    const r = from.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
    const down = key === "ArrowDown";
    if (r.width > 0 && r.height > 0) {
      const x = r.left + r.width / 2;
      const rows = all.map((c) => [c, c.getBoundingClientRect()]).filter(([, b]) => (down ? b.top > r.top + 4 : b.top < r.top - 4));
      if (rows.length) {
        const rowTop = down ? Math.min(...rows.map(([, b]) => b.top)) : Math.max(...rows.map(([, b]) => b.top));
        const row = rows.filter(([, b]) => Math.abs(b.top - rowTop) < 4);
        return row.reduce((best, cur) => (Math.abs(cur[1].left + cur[1].width / 2 - x) < Math.abs(best[1].left + best[1].width / 2 - x) ? cur : best))[0];
      }
    }
    return all[Math.max(0, Math.min(all.length - 1, i + (down ? 4 : -4)))];
  };
  const focusAndPreviewCard = (targetCard) => {
    if (!targetCard) return;
    const key = targetCard.dataset.key ?? "";
    previewKey = key;
    telemetryDeck?.inspectTheme?.(key);
    void applyPalette(key).then(() => renderActiveFxStrip());
    targetCard.focus({ preventScroll: true });
    targetCard.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
  const stepThemeByDelta = (delta) => {
    const all = cards();
    if (!all.length) return;
    const currentKey = previewKey ?? state.settings.palette ?? "";
    const curIdx = all.findIndex((c) => (c.dataset.key ?? "") === currentKey);
    const nextIdx = curIdx < 0 ? (delta > 0 ? 0 : all.length - 1) : (curIdx + delta + all.length) % all.length;
    focusAndPreviewCard(all[nextIdx]);
  };
  list.addEventListener("keydown", (e) => {
    const from = e.target.closest?.(".theme-card");
    if (!from || e.altKey || e.ctrlKey || e.metaKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) return;
    e.preventDefault();
    focusAndPreviewCard(step(from, e.key));
  });
  const enterCards = (e) => {
    if (e.key !== "ArrowDown" || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    focusAndPreviewCard(list.querySelector('.theme-card[aria-pressed="true"]') ?? cards()[0]);
  };
  search.addEventListener("keydown", enterCards);

  search.addEventListener("input", debounce(async () => {
    const val = search.value.trim();
    if (looksLikeThemeImportPayload(val)) {
      search.value = "";
      await pasteImportThemesFromText(val, { applyFirst: true });
      await reloadGalleryThemes();
      return;
    }
    draw();
  }, 120));
  mode.addEventListener("change", draw);
  groupFilter.addEventListener("change", draw);
  fxFilter.addEventListener("change", draw);
  tierFilter.addEventListener("change", draw);
  animFilter.addEventListener("change", draw);
  sortFilter.addEventListener("change", draw);

  if (opts?.filter && ["plain", "plain-dark", "plain-light", "plain-editors", "plain-os", "fx", "all"].includes(opts.filter)) {
    applyBrowseMode(opts.filter);
  } else {
    draw();
  }

  const activeFolderPath = normalizeFolderKey(currentPath() || state.cwd || "");
  const updatePinFolderLabel = (btn) => {
    if (!btn) return;
    const curFolder = normalizeFolderKey(currentPath() || state.cwd || "");
    const pinnedKey = curFolder ? state.settings?.folderThemes?.[curFolder] : "";
    btn.textContent = pinnedKey ? `📁 Folder Pinned (${pinnedKey})` : "📁 Pin to Folder";
    btn.classList.toggle("is-active", Boolean(pinnedKey));
  };
  const pinFolderBtn = h("button", {
    type: "button",
    class: "btn theme-pin-folder-btn",
    "data-pin-folder": activeFolderPath || "/",
    title: "Pin the active theme to the current workspace folder (and its subfolders), or click again to unpin.",
    onclick: async () => {
      const targetDir = normalizeFolderKey(currentPath() || state.cwd || "/");
      const currentKey = previewKey ?? state.settings?.palette ?? "";
      const existing = state.settings?.folderThemes?.[targetDir] || "";
      if (existing && (!currentKey || existing === currentKey)) {
        await setFolderTheme(targetDir, "");
        toast(`Unpinned folder theme from ${targetDir}.`, { kind: "info" });
      } else if (currentKey) {
        await setFolderTheme(targetDir, currentKey);
        toast(`Pinned theme "${currentKey}" to folder ${targetDir}.`, { kind: "success" });
      } else {
        toast("Pick a theme first to pin it to this folder.", { kind: "info" });
      }
      updatePinFolderLabel(pinFolderBtn);
    },
  }, "📁 Pin to Folder");
  updatePinFolderLabel(pinFolderBtn);

  let telemetryCollapsibleTray = null;
  let telemetryStudioBtn = null;
  const syncTelemetryBtnLabel = () => {
    if (!telemetryStudioBtn) return;
    const isOpen = Boolean(telemetryCollapsibleTray?.open) || isTelemetryPopoutHudOpen();
    telemetryStudioBtn.classList.toggle("is-active", isOpen);
    telemetryStudioBtn.setAttribute("aria-pressed", String(isOpen));
    telemetryStudioBtn.textContent = isOpen ? "✕ Hide CPU/GPU Monitor" : "📟 CPU/GPU Monitor";
  };

  telemetryDeck = buildThemeTelemetryDeck({
    themes,
    getTargetKey: () => previewKey ?? state.settings?.palette ?? "",
    onStateMutated: () => draw(),
    onCloseDrawer: () => {
      if (telemetryCollapsibleTray) telemetryCollapsibleTray.open = false;
      closeTelemetryPopoutHud();
      syncTelemetryBtnLabel();
    },
  });
  telemetryCollapsibleTray = h("details", {
    class: "theme-collapsible-tray telemetry-collapsible-tray",
    "data-telemetry-studio-drawer": "true",
    open: Boolean(opts?.openTelemetry),
    ontoggle: () => {
      if (telemetryCollapsibleTray?.open) {
        telemetryDeck?.inspectTheme?.(previewKey ?? state.settings?.palette ?? "", true);
      }
      syncTelemetryBtnLabel();
    },
  },
    h("summary", { class: "theme-collapsible-summary telemetry-collapsible-summary" },
      "📟 Live Theme CPU & GPU Telemetry Studio — VFD P/E Core Bars, Oscilloscope Trace, 4-Quadrant Dials & Load Shedder",
    ),
    telemetryDeck,
  );

  const immersionBar = buildImmersionStudioBar();
  const studioCollapsibleTray = h("details", {
    class: "theme-collapsible-tray",
    "data-fx-studio-drawer": "true",
  },
    h("summary", { class: "theme-collapsible-summary" },
      "🎛️ Advanced Shader Filters, 1-Click 3D Jumpstart Kits & Folder/Icon FX Studio (Click to expand/collapse)",
    ),
    advancedFiltersNav,
    immersionBar,
  );

  telemetryStudioBtn = h("button", {
    type: "button",
    class: "btn theme-telemetry-btn",
    "data-open-telemetry-studio": "true",
    "aria-pressed": String(Boolean(opts?.openTelemetry) || isTelemetryPopoutHudOpen()),
    title: "Toggle the Live Theme CPU & GPU Telemetry Studio (or close any open CPU/GPU HUD).",
    onclick: () => {
      if (isTelemetryPopoutHudOpen() && !telemetryCollapsibleTray.open) {
        closeTelemetryPopoutHud();
        syncTelemetryBtnLabel();
        return;
      }
      telemetryCollapsibleTray.open = !telemetryCollapsibleTray.open;
      if (telemetryCollapsibleTray.open) {
        telemetryDeck.stepSample?.();
        telemetryCollapsibleTray.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      } else {
        closeTelemetryPopoutHud();
      }
      syncTelemetryBtnLabel();
    },
  }, "📟 CPU/GPU Monitor");
  syncTelemetryBtnLabel();

  const dialog = openDialog({
    title: "Themes",
    wide: true,
    body: [
      browseModeBar,
      h("div", { class: "theme-tools" },
        search, mode, groupFilter, fxFilter, tierFilter, animFilter, sortFilter,
        h("button", {
          type: "button",
          class: "btn theme-step-btn",
          "data-theme-step": "-1",
          title: "Preview previous theme ( [ or Left Arrow )",
          onclick: () => stepThemeByDelta(-1),
        }, "◀ Prev"),
        h("button", {
          type: "button",
          class: "btn theme-step-btn",
          "data-theme-step": "1",
          title: "Preview next theme ( ] or Right Arrow )",
          onclick: () => stepThemeByDelta(1),
        }, "Next ▶"),
        h("button", {
          type: "button",
          class: "btn theme-random-btn",
          "data-random-any-btn": "true",
          title: "Pick a random theme from the currently shown themes (or press Alt+R / ⌥R anywhere with no dialog needed).",
          onclick: async () => {
            const pool = lastShown.length ? lastShown : themes;
            if (!pool.length) return;
            const candidates = pool.filter((t) => t.key !== state.settings.palette);
            const chosen = (candidates.length ? candidates : pool)[Math.floor(Math.random() * (candidates.length || pool.length))];
            if (chosen) await pick(chosen.key);
            updatePinFolderLabel(pinFolderBtn);
          },
        }, "🎲 Surprise me (⌥R)"),
        h("button", {
          type: "button",
          class: "btn theme-random-fx-btn",
          "data-random-fx-btn": "true",
          title: "Pick a random animated / 3D FX theme (or press Alt+E / ⌥E or ⌥⇧R anywhere with no dialog needed).",
          onclick: async () => {
            const pool = (lastShown.length ? lastShown : themes).filter((t) => Boolean(t.hasEffects));
            const fallback = pool.length ? pool : themes.filter((t) => Boolean(t.hasEffects));
            if (!fallback.length) return;
            const candidates = fallback.filter((t) => t.key !== state.settings.palette);
            const chosen = (candidates.length ? candidates : fallback)[Math.floor(Math.random() * (candidates.length || fallback.length))];
            if (chosen) await pick(chosen.key);
            updatePinFolderLabel(pinFolderBtn);
          },
        }, "✨ Random FX (⌥E)"),
        h("button", {
          type: "button",
          class: "btn theme-random-plain-btn",
          "data-random-plain-btn": "true",
          title: "Pick a random Plain / No-Animation theme with 0.0% GPU load (or press Alt+P / ⌥P anywhere with no dialog needed).",
          onclick: async () => {
            await disableAllThemeAnimations({ quiet: true, stripThemeEffects: false });
            const pool = (lastShown.length ? lastShown : themes).filter((t) => !t.hasEffects);
            const fallback = pool.length ? pool : themes.filter((t) => !t.hasEffects);
            if (!fallback.length) return;
            const candidates = fallback.filter((t) => t.key !== state.settings.palette);
            const chosen = (candidates.length ? candidates : fallback)[Math.floor(Math.random() * (candidates.length || fallback.length))];
            if (chosen) await pick(chosen.key);
            updatePinFolderLabel(pinFolderBtn);
          },
        }, "⏹️ Random Plain (⌥P)"),
        telemetryStudioBtn,
        h("button", {
          type: "button",
          class: "btn theme-compare-btn",
          "data-compare-themes": "true",
          title: "Compare any two themes side-by-side with a live interactive split-screen slider, spec table, and OKLab Theme Blender.",
          onclick: () => {
            const firstKey = previewKey || state.settings.palette || lastShown[0]?.key || themes[0]?.key || "";
            const secondCandidate = (lastShown.length > 1 ? lastShown : themes).find((t) => t.key !== firstKey);
            void showThemeCompareDialog(themes, firstKey, secondCandidate?.key || firstKey);
          },
        }, "⚖️ Compare & Blend…"),
        h("button", {
          type: "button",
          class: "btn theme-share-hub-btn",
          "data-share-hub": "true",
          title: "Export or Import themes (1-line Share Code, JSON, CSS, Save to File, Load File, or Bulk Import).",
          onclick: async () => {
            const activeKey = previewKey || state.settings.palette || lastShown[0]?.key || themes[0]?.key || "";
            await showThemeShareDialog(activeKey, themes);
            await reloadGalleryThemes();
          },
        }, "📤 Share / Import…"),
        h("button", {
          type: "button",
          class: "btn theme-paste-btn",
          "data-paste-theme-btn": "true",
          title: "Instant Paste Theme Import (⌘V / Ctrl+V or ⌘⇧V) — paste any CCFM-THEME-v1 code, CCFM-PACK-v1 bundle, or Theme JSON directly from your clipboard with automatic conflict resolution.",
          onclick: async () => {
            const out = await pasteImportThemesFromClipboard({ applyFirst: true });
            if (out?.completed) {
              await reloadGalleryThemes();
            }
          },
        }, "📋 Paste Theme (⌘V)"),
        h("button", {
          type: "button",
          class: "btn theme-show-launch-btn",
          "data-theme-show-btn": "true",
          title: "Launch the interactive Theme Show & Screensaver Studio — cycle themes, storms, 4D tesseracts, fire folders, and retro XScreenSaver OSDs with idle timer and cinema HUD.",
          onclick: () => {
            dialog.close();
            void showThemeShowDialog(themes);
          },
        }, "🎬 Theme Show / Screensaver…"),
        pinFolderBtn,
        h("button", { type: "button", class: "btn", title: "Add weather, storm debris, or particle effects like EF5 Tornado, Hurricane, Slime, or Digital Rain — with Low, Medium, Modern ARM Ultra & M4 Max Extreme graphics profiles.", onclick: () => { emit("atmosphere-picker"); } }, "Atmosphere FX…"),
        h("button", { type: "button", class: "btn", title: "Choose a Light theme for daytime, a Dark theme for nighttime, a 4-stage Solar Cycle schedule, or an Ambient Auto-Rotation Playlist.", onclick: () => { void showDayNightPairDialog(themes); } }, "Day / Night & Playlist…"),
        h("button", { type: "button", class: "btn", title: "Make your own theme, extract colors from an image/wallpaper, or hack any premade theme to death.", onclick: () => { dialog.close(); emit("theme-editor", { from: state.settings.palette || "" }); } }, "Create or edit a theme…")),
      navBar, telemetryCollapsibleTray, studioCollapsibleTray, sectionJumpBar, count, list,
      h("p", { class: "hint" }, "A theme applies as soon as you click it, and is remembered. Click ⏹️ Plain Themes at the top for zero-animation themes, or click ⏹️ on any FX card to use its colors without animations. Press ⌘V / Ctrl+V to import a shared theme code."),
    ],
    buttons: [{ label: "Done", primary: true, value: true }],
    initialFocus: search,
  });
  dialogRef = dialog;
  activePickerDialog = dialog;
  const dialogWrap = list.closest(".modal-backdrop") || list.parentElement;
  dialogWrap?.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types?.includes?.("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });
  dialogWrap?.addEventListener("drop", async (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    try {
      const texts = await Promise.all(files.map((f) => f.text()));
      const combined = texts.map((t) => t.trim()).filter(Boolean).join("\n");
      if (combined) {
        await runBulkThemeImportFlow(combined, { applyFirst: true });
        await reloadGalleryThemes();
      }
    } catch {
      toast("Could not read dropped theme file.", { kind: "error" });
    }
  });
  dialogWrap?.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dialog.close(null);
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target === search) return;
    if (e.key === "[" || e.key === "]") {
      e.preventDefault();
      stepThemeByDelta(e.key === "]" ? 1 : -1);
    }
  });
  dialog.result.then(async (value) => {
    if (activePickerDialog === dialog) activePickerDialog = null;
    if (activePickerRefresh === reloadGalleryThemes) activePickerRefresh = null;
    const key = previewKey;
    previewKey = null;
    if (key === null) return;
    if (value === true) await choose(key, { preserveSuppressedFx: key === suppressedFxForKey });
    else await applyPalette(state.settings.palette || "");
  });
}

function buildComparePane(theme, sideLabel) {
  if (!theme) return h("div", { class: "theme-compare-card" }, "No theme selected");
  const [bg, panel, accent, text] = theme.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
  const tier = resolveTemplateTier(theme);
  const tierBadge = tier === "ultra" ? "🚀 Ultra Tier" : tier === "medium" ? "✨ Medium Tier" : "⚡ Low / Eco Tier";
  const animDesc = theme.atmosphere && theme.atmosphere !== "none"
    ? `🌌 Live FX (${theme.atmosphere})`
    : theme.hasEffects && theme.motion && theme.motion !== "none"
      ? `🌊 Motion (${theme.motion})`
      : "⏹️ Static";
  return h("div", {
    class: "theme-compare-mockup",
    style: `background:${bg};color:${text};border-color:${accent}`,
  },
    h("div", { class: "theme-compare-mockup-bar", style: `background:${panel};border-bottom:1px solid ${accent}44` },
      h("span", { class: "theme-compare-side-tag", style: `background:${accent};color:${bg}` }, sideLabel),
      h("strong", {}, theme.name),
      h("span", { class: "theme-compare-tier-tag" }, tierBadge),
    ),
    h("div", { class: "theme-compare-mockup-body" },
      h("div", { class: "theme-compare-mockup-sidebar", style: `background:${panel}` },
        h("div", { class: "theme-compare-chip", style: `background:${accent}28;color:${accent};border:1px solid ${accent}66` }, "📁 Workspace"),
        h("div", { class: "theme-compare-chip" }, "⚡ Shaders & FX"),
        h("div", { class: "theme-compare-chip" }, animDesc),
      ),
      h("div", { class: "theme-compare-mockup-content" },
        h("div", { class: "theme-compare-card-sample", style: `background:${panel};border:1px solid ${accent}55` },
          h("div", { style: `font-weight:600;color:${accent}` }, `${theme.group} · ${theme.dark ? "Dark" : "Light"}`),
          h("div", { style: "font-size:11px;opacity:0.86;margin-top:4px" }, theme.description || "Custom color and surface shader profile."),
        ),
        h("div", { class: "theme-compare-swatches" },
          ...[bg, panel, accent, text].map((hex) =>
            h("span", { class: "theme-compare-hex-pill", style: `background:${hex};color:${hex === bg || hex === panel ? text : bg};border:1px solid ${text}33` }, hex)),
        ),
      ),
    ),
  );
}

/** Side-by-Side Split-Screen Theme Comparator & Live OKLab Theme Blender dialog. */
export async function showThemeCompareDialog(existingThemes, initialA = "", initialB = "") {
  let themes = existingThemes;
  if (!themes) {
    try {
      themes = await themeList();
    } catch (err) {
      toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
      return;
    }
  }
  if (!themes?.length) return;
  const findOrFirst = (k, fallbackIdx = 0) => themes.find((t) => t.key === k) || themes[Math.min(fallbackIdx, themes.length - 1)];
  let themeA = findOrFirst(initialA || state.settings?.palette, 0);
  let themeB = findOrFirst(initialB, themes.length > 1 ? 1 : 0);
  if (themeB.key === themeA.key && themes.length > 1) {
    themeB = themes.find((t) => t.key !== themeA.key) || themeA;
  }

  const selectA = h("select", { class: "prop-input", "aria-label": "Left theme (Theme A)", "data-compare-select": "a" },
    themes.map((t) => h("option", { value: t.key }, `${t.name} (${resolveTemplateTier(t).toUpperCase()})`)));
  const selectB = h("select", { class: "prop-input", "aria-label": "Right theme (Theme B)", "data-compare-select": "b" },
    themes.map((t) => h("option", { value: t.key }, `${t.name} (${resolveTemplateTier(t).toUpperCase()})`)));
  selectA.value = themeA.key;
  selectB.value = themeB.key;

  const paneA = h("div", { class: "theme-compare-pane theme-compare-pane-a", "data-compare-pane": "a" });
  const paneB = h("div", { class: "theme-compare-pane theme-compare-pane-b", "data-compare-pane": "b" });
  const stage = h("div", { class: "theme-compare-stage", style: "--compare-split: 50%" }, paneA, paneB);
  const splitSlider = h("input", {
    type: "range",
    class: "theme-compare-slider",
    "aria-label": "Split comparison wipe position",
    min: "10",
    max: "90",
    value: "50",
    oninput: () => {
      stage.style.setProperty("--compare-split", `${splitSlider.value}%`);
    },
  });
  const specTable = h("table", { class: "theme-compare-table", "aria-label": "Side-by-side theme specification table" });

  // Live OKLab Theme Blender controls
  const blendRatioLabel = h("span", { class: "hint" }, "50% A / 50% B");
  const blendSwatchPreview = h("div", { class: "theme-blender-swatches", "data-blend-swatches": "true" });
  const blendSlider = h("input", {
    type: "range",
    class: "prop-input",
    "data-blend-ratio": "true",
    "aria-label": "OKLab Theme Blend Ratio (0% = A, 100% = B)",
    min: "0",
    max: "100",
    step: "5",
    value: "50",
  });
  const blendNameInput = h("input", {
    type: "text",
    class: "prop-input",
    "data-blend-name": "true",
    "aria-label": "Blended custom theme name",
    maxlength: "40",
    placeholder: "Blended theme name…",
  });

  const refreshBlendSwatches = () => {
    const r = Number(blendSlider.value) / 100;
    const pctB = Math.round(r * 100);
    blendRatioLabel.textContent = `${100 - pctB}% A / ${pctB}% B`;
    const swA = themeA.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
    const swB = themeB.swatch ?? ["#16191d", "#1e2329", "#6ea8ff", "#e8eaed"];
    const mixed = [0, 1, 2, 3].map((idx) => mixHexOklab(swA[idx], swB[idx], r));
    blendSwatchPreview.replaceChildren(...mixed.map((hex, idx) =>
      h("span", {
        class: "theme-compare-hex-pill",
        style: `background:${hex};color:${idx < 2 ? mixed[3] : mixed[0]};border:1px solid ${mixed[3]}44`,
      }, hex)));
  };

  blendSlider.addEventListener("input", refreshBlendSwatches);

  const computeBlendedPayload = async () => {
    const [{ theme: fullA }, { theme: fullB }] = await Promise.all([
      call("themes/get", { key: selectA.value }),
      call("themes/get", { key: selectB.value }),
    ]);
    const ratio = Number(blendSlider.value) / 100;
    return blendThemePair(fullA.source, fullB.source, ratio, blendNameInput.value.trim());
  };

  const renderComparison = () => {
    themeA = findOrFirst(selectA.value, 0);
    themeB = findOrFirst(selectB.value, 1);
    paneA.replaceChildren(buildComparePane(themeA, "A · Left"));
    paneB.replaceChildren(buildComparePane(themeB, "B · Right"));
    if (!blendNameInput.value.trim() || blendNameInput.dataset.autoName === "true") {
      blendNameInput.value = `${themeA.name} × ${themeB.name}`.slice(0, 40);
      blendNameInput.dataset.autoName = "true";
    }
    refreshBlendSwatches();
    const teleA = estimateThemeResourceTelemetry(themeA);
    const teleB = estimateThemeResourceTelemetry(themeB);
    const rows = [
      ["Template Tier", resolveTemplateTier(themeA).toUpperCase(), resolveTemplateTier(themeB).toUpperCase()],
      ["Category", themeA.group, themeB.group],
      ["Polarity", themeA.dark ? "🌙 Dark" : "☀️ Light", themeB.dark ? "🌙 Dark" : "☀️ Light"],
      ["Surface Shader", themeA.backdropStyle || themeA.preview?.backdrop || (themeA.hasEffects ? "glass" : "solid"), themeB.backdropStyle || themeB.preview?.backdrop || (themeB.hasEffects ? "glass" : "solid")],
      ["Glow & Border", `${themeA.preview?.glow || "none"} / ${themeA.preview?.border || "solid"}`, `${themeB.preview?.glow || "none"} / ${themeB.preview?.border || "solid"}`],
      ["Live Canvas FX", themeA.atmosphere && themeA.atmosphere !== "none" ? `🌌 ${themeA.atmosphere}` : "None", themeB.atmosphere && themeB.atmosphere !== "none" ? `🌌 ${themeB.atmosphere}` : "None"],
      ["Motion & UI FX", `${themeA.motion || (themeA.hasEffects ? "smooth" : "static")}${themeA.uiElementFx ? ` · ${themeA.uiElementFx}` : ""}`, `${themeB.motion || (themeB.hasEffects ? "smooth" : "static")}${themeB.uiElementFx ? ` · ${themeB.uiElementFx}` : ""}`],
    ];
    const telemetryFooterRows = [
      ["📟 CPU / GPU Load", `CPU ${teleA.cpuPct.toFixed(1)}% · GPU ${teleA.gpuPct.toFixed(1)}% (${teleA.gradeLabel})`, `CPU ${teleB.cpuPct.toFixed(1)}% · GPU ${teleB.gpuPct.toFixed(1)}% (${teleB.gradeLabel})`],
      ["⚡ Power, VRAM & Pacing", `${teleA.watts.toFixed(1)} W · ${teleA.vramMb.toFixed(1)} MB · ${teleA.fps} FPS (${teleA.frameTimeMs}ms)`, `${teleB.watts.toFixed(1)} W · ${teleB.vramMb.toFixed(1)} MB · ${teleB.fps} FPS (${teleB.frameTimeMs}ms)`],
    ];
    specTable.replaceChildren(
      h("thead", {}, h("tr", {}, h("th", {}, "Specification"), h("th", {}, `A: ${themeA.name}`), h("th", {}, `B: ${themeB.name}`))),
      h("tbody", {}, ...rows.map(([label, valA, valB]) =>
        h("tr", { class: valA !== valB ? "is-diff" : "" },
          h("td", { class: "spec-name" }, label),
          h("td", {}, valA),
          h("td", {}, valB),
        ))),
      h("tfoot", {}, ...telemetryFooterRows.map(([label, valA, valB]) =>
        h("tr", { class: valA !== valB ? "is-diff" : "" },
          h("td", { class: "spec-name" }, label),
          h("td", {}, valA),
          h("td", {}, valB),
        ))),
    );
  };

  blendNameInput.addEventListener("input", () => { blendNameInput.dataset.autoName = "false"; });
  selectA.addEventListener("change", renderComparison);
  selectB.addEventListener("change", renderComparison);
  renderComparison();

  const applySelected = async (key) => {
    await saveSettings({ palette: key, recentPalettes: [key, ...(state.settings.recentPalettes ?? []).filter((k) => k !== key)].slice(0, 12) });
    const name = await applyPalette(key);
    if (name) toast(`Theme: ${name}`);
  };

  const blenderSection = h("div", { class: "theme-blender-bar", role: "region", "aria-label": "Live OKLab Theme Blender" },
    h("div", { class: "theme-blender-head" },
      h("strong", {}, "🧬 Live OKLab Theme Blender (Crossfade A × B)"),
      blendRatioLabel,
    ),
    h("div", { class: "theme-blender-controls" },
      blendSlider,
      blendSwatchPreview,
      blendNameInput,
      h("button", {
        type: "button",
        class: "btn",
        "data-preview-blend": "true",
        title: "Live-preview the perceptually blended theme on the File Manager right now.",
        onclick: async () => {
          try {
            const payload = await computeBlendedPayload();
            const { theme } = await call("themes/preview", payload);
            paint(theme, "preview");
            toast(`Live previewing OKLab blend: ${payload.name}`, { kind: "info" });
          } catch (err) {
            toast(err?.message || "Could not preview blended theme.", { kind: "error" });
          }
        },
      }, "👁️ Preview Blend"),
      h("button", {
        type: "button",
        class: "btn primary",
        "data-save-blend": "true",
        title: "Save this OKLab blended hybrid as a new theme in My Themes and apply it.",
        onclick: async () => {
          try {
            const payload = await computeBlendedPayload();
            const { theme } = await call("themes/custom/save", payload);
            forgetThemeList();
            paint(theme, theme.key);
            await saveSettings({ palette: theme.key, recentPalettes: [theme.key, ...(state.settings.recentPalettes ?? []).filter((k) => k !== theme.key)].slice(0, 12) });
            toast(`Saved blended theme "${theme.name}"!`, { kind: "success" });
            dlg.close("blend");
          } catch (err) {
            toast(err?.message || "Could not save blended theme.", { kind: "error" });
          }
        },
      }, "💾 Save Blended Theme"),
    ),
  );

  const dlg = openDialog({
    title: "Compare themes side-by-side",
    wide: true,
    body: [
      h("div", { class: "theme-compare-controls" },
        h("label", { class: "field" }, h("span", { class: "field-label" }, "◀ Left Theme (A)"), selectA),
        h("button", {
          type: "button",
          class: "btn",
          "data-swap-compare": "true",
          title: "Swap Left (A) and Right (B) themes",
          onclick: () => {
            const tmp = selectA.value;
            selectA.value = selectB.value;
            selectB.value = tmp;
            renderComparison();
          },
        }, "⇄ Swap A / B"),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "Right Theme (B) ▶"), selectB),
      ),
      h("div", { class: "theme-compare-stage-wrap" },
        stage,
        h("label", { class: "theme-compare-slider-row" },
          h("span", { class: "hint" }, "Drag split-screen wipe slider:"),
          splitSlider,
        ),
      ),
      blenderSection,
      specTable,
      h("div", { class: "theme-compare-actions" },
        h("button", {
          type: "button",
          class: "btn",
          "data-apply-compare": "a",
          onclick: async () => {
            await applySelected(selectA.value);
            dlg.close("a");
          },
        }, "Apply Left Theme (A)"),
        h("button", {
          type: "button",
          class: "btn",
          "data-apply-compare": "b",
          onclick: async () => {
            await applySelected(selectB.value);
            dlg.close("b");
          },
        }, "Apply Right Theme (B)"),
      ),
    ],
    buttons: [{ label: "Close", primary: true, value: "close" }],
    initialFocus: selectA,
  });
  return dlg.result;
}

/** Dialog to configure automatic Day (Light) and Night (Dark) themes, 4-Stage Solar Cycle Schedule, and Ambient Auto-Rotation Playlist. */
export async function showDayNightPairDialog(existingThemes) {
  let themes = existingThemes;
  if (!themes) {
    try {
      themes = await themeList();
    } catch (err) {
      toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
      return;
    }
  }
  const lightThemes = themes.filter((t) => !t.dark);
  const darkThemes = themes.filter((t) => t.dark);
  const lightSelect = h("select", { class: "prop-input", "aria-label": "Daytime (Light) theme" },
    h("option", { value: "" }, "Standard light"),
    ...lightThemes.map((t) => h("option", { value: t.key }, t.name)),
  );
  const darkSelect = h("select", { class: "prop-input", "aria-label": "Nighttime (Dark) theme" },
    h("option", { value: "" }, "Standard dark"),
    ...darkThemes.map((t) => h("option", { value: t.key }, t.name)),
  );
  lightSelect.value = state.settings?.preferredLightPalette || "";
  darkSelect.value = state.settings?.preferredDarkPalette || "";

  const makeSolarSelect = (stage, label, defaultLabel) => {
    const sel = h("select", { class: "prop-input", "aria-label": label, "data-solar-stage": stage },
      h("option", { value: "" }, defaultLabel),
      ...themes.map((t) => h("option", { value: t.key }, `${t.name} (${t.dark ? "Dark" : "Light"})`)),
    );
    return sel;
  };
  const solarEnabled = h("input", {
    type: "checkbox",
    "data-solar-enabled": "true",
    "aria-label": "Enable 4-stage Solar Cycle clock schedule",
  });
  solarEnabled.checked = Boolean(state.settings?.solarScheduleEnabled);
  const dawnSelect = makeSolarSelect("dawn", "Dawn (05:00 – 08:59) theme", "Follow Daytime (Light) theme");
  const daySelect = makeSolarSelect("day", "Solar Day (09:00 – 16:59) theme", "Follow Daytime (Light) theme");
  const duskSelect = makeSolarSelect("dusk", "Golden Dusk (17:00 – 20:59) theme", "Follow Nighttime (Dark) theme");
  const nightSelect = makeSolarSelect("night", "Deep Midnight (21:00 – 04:59) theme", "Follow Nighttime (Dark) theme");
  dawnSelect.value = state.settings?.solarDawnPalette || "";
  daySelect.value = state.settings?.solarDayPalette || "";
  duskSelect.value = state.settings?.solarDuskPalette || "";
  nightSelect.value = state.settings?.solarNightPalette || "";

  const pickValidKey = (candidates, fallbackPool) => {
    for (const c of candidates) {
      if (themes.some((t) => t.key === c)) return c;
    }
    return fallbackPool[0]?.key || "";
  };

  const presetBtn = h("button", {
    type: "button",
    class: "btn",
    "data-solar-preset": "scifi",
    title: "Automatically populate Dawn, Solar Day, Golden Dusk, and Deep Midnight with curated themes.",
    onclick: () => {
      solarEnabled.checked = true;
      dawnSelect.value = pickValidKey(["van_de_graaff_day", "sakura_glass", "liquid_metal_light", "catppuccin_latte"], lightThemes);
      daySelect.value = pickValidKey(["cern_control_day", "liquid_metal_light", "daylight_hud", "github_light"], lightThemes);
      duskSelect.value = pickValidKey(["tokamak_fusion", "dyson_megastructure", "dracula", "nord"], darkThemes);
      nightSelect.value = pickValidKey(["tesla_coil_plasma", "hawking_horizon", "m4_space_black", "nord"], darkThemes);
    },
  }, "✨ Auto-Fill Sci-Fi Solar Cycle");

  // Ambient Playlist & Auto-Rotation controls
  const playlistEnabled = h("input", {
    type: "checkbox",
    "data-playlist-enabled": "true",
    "aria-label": "Enable Ambient Playlist auto-rotation",
  });
  playlistEnabled.checked = Boolean(state.settings?.ambientPlaylistEnabled);
  const playlistInterval = h("select", { class: "prop-input", "data-playlist-interval": "true", "aria-label": "Playlist rotation interval" },
    h("option", { value: "1" }, "Every 1 minute"),
    h("option", { value: "5" }, "Every 5 minutes"),
    h("option", { value: "15" }, "Every 15 minutes"),
    h("option", { value: "30" }, "Every 30 minutes"),
    h("option", { value: "60" }, "Every 60 minutes"),
  );
  playlistInterval.value = String(state.settings?.ambientPlaylistIntervalMin || 15);
  const playlistTarget = h("select", { class: "prop-input", "data-playlist-target": "true", "aria-label": "Playlist rotation target" },
    h("option", { value: "both" }, "Themes + Atmosphere FX"),
    h("option", { value: "themes" }, "Themes only"),
    h("option", { value: "atmosphere" }, "Atmosphere FX only"),
  );
  playlistTarget.value = state.settings?.ambientPlaylistTarget || "both";
  const playlistPool = h("select", { class: "prop-input", "data-playlist-pool": "true", "aria-label": "Playlist rotation pool" },
    h("option", { value: "favorites" }, "★ Favorites & Saved Presets"),
    h("option", { value: "ultra" }, "🚀 Ultra & Storm Tier Showcase"),
    h("option", { value: "presets" }, "💾 Saved Atmosphere Presets"),
    h("option", { value: "all" }, "All Themes & Effects"),
  );
  playlistPool.value = state.settings?.ambientPlaylistPool || "favorites";

  const stepNowBtn = h("button", {
    type: "button",
    class: "btn",
    "data-playlist-step-now": "true",
    title: "Advance the Ambient Playlist immediately to preview the next theme/effect in the rotation.",
    onclick: async () => {
      if (state.settings) {
        state.settings.ambientPlaylistTarget = playlistTarget.value;
        state.settings.ambientPlaylistPool = playlistPool.value;
      }
      await stepAmbientPlaylist();
      toast("Advanced Ambient Playlist to next item.", { kind: "info" });
    },
  }, "⏭️ Step Playlist Now");

  const body = [
    h("p", { class: "hint" }, "Pick a Light theme for daytime and a Dark theme for nighttime. When \"Follow my computer\" is active, the File Manager switches between your pair automatically."),
    h("div", { class: "theme-daynight-grid" },
      h("label", { class: "field" }, h("span", { class: "field-label" }, "☀️ Daytime (Light) theme"), lightSelect),
      h("label", { class: "field" }, h("span", { class: "field-label" }, "🌙 Nighttime (Dark) theme"), darkSelect),
    ),
    h("div", { class: "theme-solar-section" },
      h("div", { class: "theme-solar-header" },
        h("label", { class: "theme-solar-toggle" },
          solarEnabled,
          h("span", {}, "🕰️ Enable 4-Stage Solar Cycle Schedule (Dawn / Day / Dusk / Midnight)"),
        ),
        presetBtn,
      ),
      h("div", { class: "theme-solar-grid" },
        h("label", { class: "field" }, h("span", { class: "field-label" }, "🌅 Dawn (05:00 – 08:59)"), dawnSelect),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "☀️ Solar Day (09:00 – 16:59)"), daySelect),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "🌆 Golden Dusk (17:00 – 20:59)"), duskSelect),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "🌌 Deep Midnight (21:00 – 04:59)"), nightSelect),
      ),
    ),
    h("div", { class: "theme-solar-section" },
      h("div", { class: "theme-solar-header" },
        h("label", { class: "theme-solar-toggle" },
          playlistEnabled,
          h("span", {}, "📻 Enable Ambient Playlist Auto-Rotation"),
        ),
        stepNowBtn,
      ),
      h("div", { class: "theme-solar-grid" },
        h("label", { class: "field" }, h("span", { class: "field-label" }, "⏱️ Rotation Interval"), playlistInterval),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "🎯 Rotate Target"), playlistTarget),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "🎵 Playlist Pool"), playlistPool),
      ),
    ),
  ];
  const answer = await openDialog({
    title: "Day / Night, Solar Schedule & Ambient Playlist",
    body,
    buttons: [
      { label: "Cancel", value: "cancel" },
      { label: "Clear pair", value: "clear" },
      { label: "Save Schedule & Playlist", value: "save", primary: true },
    ],
    initialFocus: lightSelect,
  }).result;
  if (answer === "clear") {
    await saveSettings({
      preferredLightPalette: "",
      preferredDarkPalette: "",
      solarScheduleEnabled: false,
      solarDawnPalette: "",
      solarDayPalette: "",
      solarDuskPalette: "",
      solarNightPalette: "",
      ambientPlaylistEnabled: false,
    });
    syncAmbientPlaylistTimer();
    await applyPalette(state.settings?.palette || "");
    toast("Day / Night theme pair, Solar Cycle, and Ambient Playlist cleared.", { kind: "info" });
  } else if (answer === "save") {
    const light = lightSelect.value;
    const dark = darkSelect.value;
    await saveSettings({
      theme: "auto",
      palette: "",
      preferredLightPalette: light,
      preferredDarkPalette: dark,
      solarScheduleEnabled: Boolean(solarEnabled.checked),
      solarDawnPalette: dawnSelect.value,
      solarDayPalette: daySelect.value,
      solarDuskPalette: duskSelect.value,
      solarNightPalette: nightSelect.value,
      ambientPlaylistEnabled: Boolean(playlistEnabled.checked),
      ambientPlaylistIntervalMin: Number(playlistInterval.value) || 15,
      ambientPlaylistTarget: playlistTarget.value,
      ambientPlaylistPool: playlistPool.value,
    });
    syncAmbientPlaylistTimer();
    await applyPalette("");
    toast(playlistEnabled.checked ? "Ambient Playlist & Schedule active." : solarEnabled.checked ? "4-Stage Solar Cycle schedule active." : "Day / Night theme pair active — following your computer's light and dark schedule.", { kind: "success" });
  }
}

/**
 * Helper to save any exported theme text or code directly as a file in the currently open folder
 * (with automatic fallback to the user's home directory and pane refresh).
 */
export async function saveThemeFileToFolder({ filename, content, folder = "" } = {}) {
  const targetFolder = folder || state.left?.path || state.home || "";
  try {
    const res = await call("themes/custom/save-file", {
      folder: targetFolder,
      filename,
      content,
    });
    void refresh();
    toast(`Saved theme file "${res.name}" to ${res.path}`, { kind: "success" });
    return res;
  } catch (err) {
    toast(err?.message || "Could not save theme file to folder.", { kind: "error" });
    return null;
  }
}

/**
 * Helper to trigger a browser file download of a theme file (.theme.json, .ccfm.txt, .theme.css).
 */
export function downloadThemeFileInBrowser(filename, content) {
  try {
    const safeName = String(filename || "codecaine-theme.theme.json").replace(/[^A-Za-z0-9._ -]+/g, "-");
    const blob = new Blob([String(content ?? "")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast(`Downloaded "${safeName}"`, { kind: "success" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Universal Codecaine Theme Share & Import Hub:
 * Lets any Codecaine File Manager user share ANY premade built-in theme, custom hacked theme, or curated bundle pack
 * via a 1-line Share Code (`CCFM-THEME-v1:...` / `CCFM-PACK-v1:...`), portable JSON, standalone CSS, or direct `.theme.json` file —
 * and import codes/packs/files shared by other users in 1 click.
 */
export async function showThemeShareDialog(initialKey = "", existingThemes) {
  let themes = existingThemes;
  if (!themes) {
    try {
      themes = await themeList();
    } catch (err) {
      toast(err?.message || "The themes couldn't be loaded.", { kind: "error" });
      return;
    }
  }
  if (!themes?.length) return;
  const startKey = initialKey && themes.some((t) => t.key === initialKey)
    ? initialKey
    : (state.settings?.palette && themes.some((t) => t.key === state.settings.palette) ? state.settings.palette : themes[0].key);

  const themeSelect = h("select", { class: "prop-input", "aria-label": "Select premade or custom theme to share", "data-share-theme-select": "true" },
    ...GROUP_ORDER.map((grp) => {
      const inGrp = themes.filter((t) => t.group === grp);
      return inGrp.length ? h("optgroup", { label: grp }, ...inGrp.map((t) => h("option", { value: t.key }, `${t.name} (${t.key})`))) : null;
    }).filter(Boolean),
  );
  themeSelect.value = startKey;

  const exportBox = h("textarea", {
    class: "prop-input theme-export",
    readonly: true,
    rows: "7",
    "data-share-export-box": "true",
    "aria-label": "Shareable theme code or JSON",
    onclick: () => exportBox.select?.(),
  });

  let activeFormat = "code"; // "code" | "json" | "css" | "pack-weather" | "pack-nostalgia" | "pack-favs"
  const formatButtons = [];
  const makeFmtBtn = (id, label, title) => {
    const b = h("button", {
      type: "button",
      class: "btn theme-export-tab",
      "data-share-format": id,
      "aria-pressed": String(id === activeFormat),
      title,
      onclick: () => {
        activeFormat = id;
        for (const btn of formatButtons) btn.setAttribute("aria-pressed", String(btn === b));
        void refreshExport();
      },
    }, label);
    formatButtons.push(b);
    return b;
  };

  const tabs = h("div", { class: "theme-export-tabs" },
    makeFmtBtn("code", "🔑 1-Line Share Code (CCFM-THEME-v1)", "Compact 1-line share code for Discord, Slack, GitHub, or messages"),
    makeFmtBtn("json", "📄 Portable Theme JSON", "Full human-readable JSON that can be edited or hacked before importing"),
    makeFmtBtn("css", "🎨 Standalone CSS (:root)", "Ready-to-use CSS variables & custom shader rules (round-trip importable!)"),
    makeFmtBtn("pack-weather", "🌪️ Weather & Storm Pack", "Shareable bundle of extreme Weather, Tornado, Hurricane, Fire & Slime themes"),
    makeFmtBtn("pack-nostalgia", "🐧 Linux & Retro OS Pack", "Shareable bundle of nostalgic Linux, BeOS, Solaris CDE, Amiga, OS/2 & Win95 themes"),
    makeFmtBtn("pack-favs", "★ Favorites & Custom Pack", "Shareable bundle of all your pinned Favorite themes and My Themes"),
  );

  function suggestedExportFilename() {
    const selectedKey = themeSelect.value || themes[0].key;
    const found = themes.find((t) => t.key === selectedKey);
    const slug = String(found?.name || selectedKey || "codecaine-theme")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "codecaine-theme";
    if (activeFormat === "css") return `${slug}.theme.css`;
    if (activeFormat === "code") return `${slug}.ccfm.txt`;
    if (activeFormat.startsWith("pack-")) return `${activeFormat}.theme-pack.json`;
    return `${slug}.theme.json`;
  }

  async function refreshExport() {
    const selectedKey = themeSelect.value || themes[0].key;
    try {
      if (activeFormat === "code" || activeFormat === "json") {
        const res = await call("themes/custom/export", { key: selectedKey });
        exportBox.value = activeFormat === "code" ? res.shareCode : res.text;
      } else if (activeFormat === "css") {
        const res = await call("themes/custom/export-css", { key: selectedKey });
        exportBox.value = res.css;
      } else if (activeFormat === "pack-weather") {
        const keys = ["ef5_debris_tornado", "inferno_fire_folders", "toxic_slime_ooze", "urban_street_cyclone", "autumn_noreaster_gale", "supercell_emerald_vortex", "category_5_eyewall", "cryo_icicle_blizzard"].filter((k) => themes.some((t) => t.key === k));
        const res = await call("themes/custom/export-pack", { keys });
        exportBox.value = res.shareCode;
      } else if (activeFormat === "pack-nostalgia") {
        const keys = themes.filter((t) => t.group === "Linux" || t.group === "Rare and beloved systems" || t.key === "win95" || t.key === "dracula").slice(0, 12).map((t) => t.key);
        const res = await call("themes/custom/export-pack", { keys });
        exportBox.value = res.shareCode;
      } else if (activeFormat === "pack-favs") {
        const customKeys = themes.filter((t) => t.group === "My themes").map((t) => t.key);
        const favs = favoriteKeys();
        const combined = [...new Set([...customKeys, ...favs, selectedKey])].slice(0, 25);
        const res = await call("themes/custom/export-pack", { keys: combined });
        exportBox.value = res.shareCode;
      }
    } catch (err) {
      exportBox.value = err?.message || "Could not generate share code.";
    }
  }

  themeSelect.addEventListener("change", () => { void refreshExport(); });
  await refreshExport();

  const importBox = h("textarea", {
    class: "prop-input theme-export",
    rows: "5",
    "data-share-import-box": "true",
    "aria-label": "Paste shared CCFM-THEME-v1 codes, CCFM-PACK-v1 codes, CSS, or theme JSON",
    placeholder: "Paste any CCFM-THEME-v1:... code, CCFM-PACK-v1:... pack, Theme JSON, or :root CSS here — or drop a .json/.ccfm/.css file anywhere on this window!",
  });

  const fileInput = h("input", {
    type: "file",
    multiple: true,
    accept: ".json,.txt,.ccfm,.css,application/json,text/plain,text/css",
    "data-share-import-file-input": "true",
    style: "display:none",
  });
  fileInput.addEventListener("change", async () => {
    const files = [...(fileInput.files ?? [])];
    if (!files.length) return;
    try {
      const contents = await Promise.all(files.map((f) => f.text()));
      const merged = [importBox.value.trim(), ...contents.map((c) => c.trim())].filter(Boolean).join("\n");
      importBox.value = merged;
      const out = await runBulkThemeImportFlow(merged, { applyFirst: true, forcePrompt: false });
      if (out?.completed) dlg.close("imported");
    } catch {
      toast("Could not read one of the selected theme files.", { kind: "error" });
    }
  });

  const copyBtn = h("button", {
    type: "button",
    class: "btn primary",
    "data-share-copy-btn": "true",
    onclick: async () => {
      const ok = await copyToClipboard(exportBox.value);
      if (ok) {
        flashCopied(copyBtn, "✓ Copied!");
        toast("Copied share code / theme text to clipboard!", { kind: "success" });
      } else {
        exportBox.focus();
        exportBox.select?.();
        toast("Select the text and copy it manually.", { kind: "info" });
      }
    },
  }, "📋 Copy Share Code / Text");

  const saveFolderBtn = h("button", {
    type: "button",
    class: "btn",
    "data-share-save-folder-btn": "true",
    title: "Save this theme directly as a file in your currently open File Manager folder",
    onclick: async () => {
      let content = exportBox.value;
      let filename = suggestedExportFilename();
      if (activeFormat === "code") {
        try {
          const selectedKey = themeSelect.value || themes[0].key;
          const res = await call("themes/custom/export", { key: selectedKey });
          content = res.text;
          filename = filename.replace(/\.ccfm\.txt$/, ".theme.json");
        } catch { /* keep share code */ }
      }
      const saved = await saveThemeFileToFolder({ filename, content });
      if (saved) flashCopied(saveFolderBtn, "✓ Saved to Folder!");
    },
  }, "💾 Save File to Folder");

  const downloadBtn = h("button", {
    type: "button",
    class: "btn",
    "data-share-download-btn": "true",
    title: "Download this theme as a standalone file",
    onclick: () => {
      downloadThemeFileInBrowser(suggestedExportFilename(), exportBox.value);
      flashCopied(downloadBtn, "✓ Downloaded!");
    },
  }, "⬇️ Download File");

  const dlg = openDialog({
    title: "Share, Export & Import Themes (1-Click Copy, Save File, or Paste)",
    wide: true,
    body: [
      h("p", { class: "hint" }, "Share any premade theme, custom theme, or bundle pack in 1 click: copy the Share Code, save a `.theme.json` file straight to your current folder, or paste / drag-and-drop any theme code, JSON, or CSS below!"),
      h("div", { class: "theme-compare-controls", style: "flex-wrap:wrap;gap:0.45rem" },
        h("label", { class: "field", style: "flex:1;min-width:220px" }, h("span", { class: "field-label" }, "📤 Choose any Premade or Custom Theme to Share / Export"), themeSelect),
        copyBtn,
        saveFolderBtn,
        downloadBtn,
        h("button", {
          type: "button",
          class: "btn",
          "data-share-hack-selected": "true",
          title: "Clone this premade or custom theme into the Theme Editor & Hacker Studio so you can personalize every color, shader, token, and CSS rule.",
          onclick: () => {
            const k = themeSelect.value;
            dlg.close("hack");
            dialogRef?.close();
            emit("theme-editor", { from: k });
          },
        }, "🛠️ Clone & Hack This Theme…"),
      ),
      tabs,
      exportBox,
      h("hr", { style: "border:0;border-top:1px solid var(--border);margin:0.75rem 0" }),
      h("div", { class: "theme-compare-controls", style: "justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.45rem" },
        h("h3", { style: "margin:0;font-size:13px" }, "📥 Import Theme Code, JSON, CSS, or File (Paste, Drop File, or Choose File)"),
        h("div", { style: "display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap" },
          fileInput,
          h("button", {
            type: "button",
            class: "btn primary",
            "data-share-paste-clipboard-btn": "true",
            title: "Read theme share codes, JSON, or CSS directly from your system clipboard and import immediately.",
            onclick: async () => {
              const clip = (await readFromClipboard())?.trim();
              if (clip) {
                importBox.value = clip;
                const out = await runBulkThemeImportFlow(clip, { applyFirst: true, forcePrompt: false });
                if (out?.completed) dlg.close("imported");
                return;
              }
              importBox.focus();
              toast("Press ⌘V / Ctrl+V in the box below to paste your theme code.", { kind: "info" });
            },
          }, "📋 Paste & Import from Clipboard"),
          h("button", {
            type: "button",
            class: "btn",
            "data-share-import-files-btn": "true",
            title: "Select one or more .json / .txt / .ccfm / .css theme files from your computer to import immediately.",
            onclick: () => fileInput.click(),
          }, "📂 Load Theme File(s)…"),
        ),
      ),
      importBox,
      h("div", { class: "theme-compare-actions" },
        h("button", {
          type: "button",
          class: "btn",
          "data-share-inspect-btn": "true",
          title: "Inspect all themes in the bulk import queue and choose per-theme actions before importing.",
          onclick: async () => {
            const raw = importBox.value.trim();
            if (!raw) {
              toast("Paste one or more CCFM-THEME-v1 / CCFM-PACK-v1 codes, CSS, or JSON first.", { kind: "info" });
              return;
            }
            const out = await runBulkThemeImportFlow(raw, { applyFirst: true, forcePrompt: true });
            if (out?.completed) dlg.close("imported");
          },
        }, "🔍 Inspect Batch & Resolve Conflicts…"),
        h("button", {
          type: "button",
          class: "btn primary",
          "data-share-import-apply": "true",
          onclick: async () => {
            const raw = importBox.value.trim();
            if (!raw) {
              toast("Paste a CCFM-THEME-v1 code, CCFM-PACK-v1 code, CSS, or JSON first.", { kind: "info" });
              return;
            }
            const out = await runBulkThemeImportFlow(raw, { applyFirst: true, forcePrompt: false });
            if (out?.completed) dlg.close("imported");
          },
        }, "📥 Import into My Themes & Apply"),
      ),
    ],
    buttons: [{ label: "Close", primary: true, value: "close" }],
    initialFocus: themeSelect,
  });

  dlg.el?.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types?.includes?.("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });
  dlg.el?.addEventListener("drop", async (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    try {
      const contents = await Promise.all(files.map((f) => f.text()));
      const merged = contents.map((c) => c.trim()).filter(Boolean).join("\n");
      if (merged) {
        importBox.value = merged;
        const out = await runBulkThemeImportFlow(merged, { applyFirst: true, forcePrompt: false });
        if (out?.completed) dlg.close("imported");
      }
    } catch {
      toast("Could not read the dropped theme file.", { kind: "error" });
    }
  });

  return dlg.result;
}

function renderMiniThemeBadge(themeObj, roleLabel) {
  const c = themeObj?.colors ?? {};
  const dots = [c.background, c.card, c.text, c.accent].filter(Boolean).map((hexColor) => {
    const s = h("span", { class: "theme-conflict-dot", title: hexColor });
    s.style.background = hexColor;
    return s;
  });
  const fxParts = [];
  if (themeObj?.fx?.atmosphere && themeObj.fx.atmosphere !== "none") fxParts.push(`🌌 ${themeObj.fx.atmosphere}`);
  if (themeObj?.fx?.uiElementFx && themeObj.fx.uiElementFx !== "off") fxParts.push(`🔥 ${themeObj.fx.uiElementFx}`);
  if (themeObj?.fx?.iconPackStyle && themeObj.fx.iconPackStyle !== "default") fxParts.push(`🎨 ${themeObj.fx.iconPackStyle}`);
  return h("div", { class: "theme-conflict-side" },
    h("span", { class: "theme-conflict-role" }, roleLabel),
    h("span", { class: "theme-conflict-dots" }, ...dots),
    h("span", { class: "theme-conflict-meta" }, themeObj?.dark ? "Dark" : "Light"),
    fxParts.length ? h("span", { class: "theme-conflict-fx-tag" }, fxParts.join(" · ")) : null,
  );
}

/**
 * Opens an interactive Bulk Import & Conflict Resolution modal when incoming themes collide with existing custom
 * themes (or duplicate names within the same batch), allowing per-theme or 1-click bulk resolution:
 * - `replace`: Overwrite existing custom theme in place (preserving its ID)
 * - `keep_both`: Keep existing and save incoming under a new or auto-incremented name
 * - `merge_fx`: Keep existing colors and merge incoming FX/shaders/icons
 * - `skip`: Skip importing the conflicting theme
 */
export async function openThemeConflictDialog(inspection, rawText, { applyFirst = true, onImported = null } = {}) {
  const conflictItems = (inspection?.items ?? []).filter((i) => i.hasConflict);
  const cleanItems = (inspection?.items ?? []).filter((i) => !i.hasConflict);

  const actionSelects = new Map();
  const renameInputs = new Map();
  const cleanCheckboxes = new Map();

  const applyBulkPolicy = (policy) => {
    for (const item of conflictItems) {
      const sel = actionSelects.get(item.index);
      const ren = renameInputs.get(item.index);
      if (sel) {
        if (policy === "replace" && item.conflictKind === "batch_duplicate") {
          sel.value = "keep_both";
        } else {
          sel.value = policy;
        }
      }
      if (ren) {
        ren.disabled = sel?.value !== "keep_both";
      }
    }
  };

  const conflictRows = conflictItems.map((item) => {
    const initialAction = item.recommendedAction || "replace";
    const select = h("select", {
      class: "prop-input theme-conflict-select",
      "data-conflict-action": String(item.index),
      "aria-label": `Conflict resolution for ${item.draft.name}`,
    },
      ...(item.conflictKind === "existing_custom"
        ? [
            h("option", { value: "replace" }, "🔄 Replace / Overwrite Existing Theme"),
            h("option", { value: "keep_both" }, "➕ Keep Both (Save Under New Name)"),
            h("option", { value: "merge_fx" }, "✨ Merge Incoming FX & Shaders into Existing Colors"),
            h("option", { value: "skip" }, "⏭️ Skip Incoming Theme (Keep Existing)"),
          ]
        : [
            h("option", { value: "keep_both" }, "➕ Keep Both (Auto-Rename Duplicate in Batch)"),
            h("option", { value: "skip" }, "⏭️ Skip Duplicate in Batch"),
          ]),
    );
    select.value = initialAction;

    const renameInput = h("input", {
      type: "text",
      class: "prop-input theme-conflict-rename",
      "data-conflict-rename": String(item.index),
      "aria-label": `New name for ${item.draft.name}`,
      maxlength: "40",
      value: item.suggestedRename || `${item.draft.name} (2)`,
      disabled: select.value !== "keep_both",
      placeholder: "New theme name…",
    });

    select.addEventListener("change", () => {
      renameInput.disabled = select.value !== "keep_both";
    });

    actionSelects.set(item.index, select);
    renameInputs.set(item.index, renameInput);

    const diffLabel = item.identical
      ? "Identical to existing theme"
      : [
          item.changedColors?.length ? `Colors (${item.changedColors.join(", ")})` : "",
          item.changedFx ? "FX / Shaders" : "",
        ].filter(Boolean).join(" + ") || "Modified";

    return h("div", {
      class: "theme-conflict-card",
      "data-conflict-row": String(item.index),
      "data-conflict-name": item.draft.name,
    },
      h("div", { class: "theme-conflict-card-head" },
        h("div", { class: "theme-conflict-title-wrap" },
          h("strong", { class: "theme-conflict-name" }, item.draft.name),
          h("span", {
            class: `theme-conflict-badge ${item.identical ? "is-identical" : "is-diff"}`,
            "data-conflict-diff": String(item.index),
          }, item.conflictKind === "batch_duplicate" ? `Duplicate in batch · ${diffLabel}` : `Conflicts with "${item.existingCustom?.name || item.draft.name}" · ${diffLabel}`),
        ),
      ),
      h("div", { class: "theme-conflict-compare" },
        item.existingCustom ? renderMiniThemeBadge(item.existingCustom, "Existing in My Themes") : null,
        renderMiniThemeBadge(item.draft, "Incoming Theme"),
      ),
      h("div", { class: "theme-conflict-controls" },
        h("label", { class: "field", style: "flex:1.3" },
          h("span", { class: "field-label" }, "Resolution Action"),
          select,
        ),
        h("label", { class: "field", style: "flex:1" },
          h("span", { class: "field-label" }, "Name When Keeping Both"),
          renameInput,
        ),
      ),
    );
  });

  const cleanRows = cleanItems.map((item) => {
    const cb = h("input", {
      type: "checkbox",
      checked: true,
      "data-clean-include": String(item.index),
    });
    cleanCheckboxes.set(item.index, cb);
    return h("label", { class: "theme-conflict-clean-item", "data-clean-row": String(item.index) },
      cb,
      h("strong", {}, item.draft.name),
      renderMiniThemeBadge(item.draft, "New"),
    );
  });

  let outcome = { completed: false, result: null };

  const dlg = openDialog({
    title: conflictItems.length > 0
      ? `Resolve Theme Import Conflicts (${conflictItems.length} Conflict${conflictItems.length === 1 ? "" : "s"} Found)`
      : `Bulk Theme Import Inspector (${inspection?.totalCount || 0} Themes)`,
    wide: true,
    body: [
      h("div", { class: "theme-conflict-summary", "data-conflict-summary": "true" },
        h("span", { class: "theme-conflict-stat" }, `📦 Total in Batch: ${inspection?.totalCount || 0}`),
        h("span", { class: "theme-conflict-stat is-clean" }, `✅ New (No Conflict): ${cleanItems.length}`),
        h("span", { class: `theme-conflict-stat ${conflictItems.length ? "is-warn" : ""}` }, `⚠️ Conflicts Found: ${conflictItems.length}`),
      ),
      conflictItems.length > 0
        ? h("div", { class: "theme-conflict-bulk-bar", role: "group", "aria-label": "Apply resolution to all conflicts" },
            h("span", { class: "theme-pill-label" }, "Apply to all conflicts:"),
            h("button", {
              type: "button",
              class: "btn",
              "data-conflict-bulk": "replace",
              onclick: () => applyBulkPolicy("replace"),
            }, "🔄 Replace All Existing"),
            h("button", {
              type: "button",
              class: "btn",
              "data-conflict-bulk": "keep_both",
              onclick: () => applyBulkPolicy("keep_both"),
            }, "➕ Keep Both for All (Auto-Rename)"),
            h("button", {
              type: "button",
              class: "btn",
              "data-conflict-bulk": "merge_fx",
              onclick: () => applyBulkPolicy("merge_fx"),
            }, "✨ Merge Incoming FX into All"),
            h("button", {
              type: "button",
              class: "btn",
              "data-conflict-bulk": "skip",
              onclick: () => applyBulkPolicy("skip"),
            }, "⏭️ Skip All Conflicts"),
          )
        : null,
      conflictItems.length > 0
        ? h("div", { class: "theme-conflict-list", "data-conflict-list": "true" }, ...conflictRows)
        : null,
      cleanItems.length > 0
        ? h("details", { class: "theme-conflict-clean-section", open: conflictItems.length === 0 },
            h("summary", {}, `✅ Ready to Import Without Conflicts (${cleanItems.length} theme${cleanItems.length === 1 ? "" : "s"})`),
            h("div", { class: "theme-conflict-clean-list" }, ...cleanRows),
          )
        : null,
    ].filter(Boolean),
    buttons: [
      { label: "Cancel", value: "cancel" },
      { label: "✅ Apply Resolutions & Import", value: "confirm", primary: true },
    ],
  });

  const answer = await dlg.result;
  if (answer !== "confirm") return outcome;

  const resolutions = conflictItems.map((item) => {
    const action = actionSelects.get(item.index)?.value || "keep_both";
    const renameTo = (renameInputs.get(item.index)?.value || "").trim() || item.suggestedRename;
    return {
      index: item.index,
      name: item.draft.name,
      action,
      ...(action === "keep_both" ? { renameTo } : {}),
      ...(item.existingCustom?.id ? { targetId: item.existingCustom.id } : {}),
    };
  });

  const includeIndices = [];
  for (const item of conflictItems) includeIndices.push(item.index);
  for (const item of cleanItems) {
    if (cleanCheckboxes.get(item.index)?.checked !== false) includeIndices.push(item.index);
  }

  try {
    const res = await call("themes/custom/import-pack", {
      text: rawText,
      resolutions,
      includeIndices,
    });
    forgetThemeList();
    if (applyFirst && res.first?.id) {
      await saveSettings({
        palette: res.first.id,
        recentPalettes: [res.first.id, ...(state.settings.recentPalettes ?? []).filter((k) => k !== res.first.id)].slice(0, 12),
      });
      await applyPalette(res.first.id);
    }
    await activePickerRefresh?.();
    if (typeof onImported === "function") onImported(res);
    const parts = [];
    if (res.addedCount) parts.push(`${res.addedCount} added`);
    if (res.replacedCount) parts.push(`${res.replacedCount} replaced`);
    if (res.renamedCount) parts.push(`${res.renamedCount} renamed`);
    if (res.mergedCount) parts.push(`${res.mergedCount} FX-merged`);
    if (res.skippedCount) parts.push(`${res.skippedCount} skipped`);
    toast(`Bulk Import complete (${parts.join(", ") || `${res.count} processed`})!`, { kind: "success" });
    outcome = { completed: true, result: res };
  } catch (err) {
    toast(err?.message || "Could not complete bulk theme import.", { kind: "error" });
  }
  return outcome;
}

/**
 * Inspects a bulk theme import payload first and automatically opens the Conflict Resolution Dialog
 * whenever conflicts are detected (or when `forcePrompt` is true); otherwise imports immediately.
 */
export async function runBulkThemeImportFlow(rawText, { applyFirst = true, forcePrompt = false, onImported = null } = {}) {
  try {
    const inspection = await call("themes/custom/inspect-pack", { text: rawText });
    if (inspection.conflictCount > 0 || forcePrompt) {
      return await openThemeConflictDialog(inspection, rawText, { applyFirst, onImported });
    }
    const res = await call("themes/custom/import-pack", { text: rawText });
    forgetThemeList();
    if (applyFirst && res.first?.id) {
      await saveSettings({
        palette: res.first.id,
        recentPalettes: [res.first.id, ...(state.settings.recentPalettes ?? []).filter((k) => k !== res.first.id)].slice(0, 12),
      });
      await applyPalette(res.first.id);
    }
    await activePickerRefresh?.();
    if (typeof onImported === "function") onImported(res);
    toast(`Imported ${res.count} shared theme${res.count === 1 ? "" : "s"} into My Themes${res.first?.name ? ` and applied "${res.first.name}"` : ""}!`, { kind: "success" });
    return { completed: true, result: res };
  } catch (err) {
    toast(err?.message || "Could not import shared theme code.", { kind: "error" });
    return { completed: false, result: null };
  }
}

/**
 * Fast heuristic to detect whether clipboard text or a pasted string is a Codecaine Theme share payload:
 * - `CCFM-THEME-v1:...` single theme share code(s) (including line-wrapped or embedded in comments)
 * - `CCFM-PACK-v1:...` multi-theme bundle code(s)
 * - Portable theme JSON object (`bun-rad-studio-file-manager-theme`, `bun-rad-studio-file-manager-theme-pack`, or `{ name, colors: { background, accent } }`)
 * - JSON array of theme objects or Markdown code-fenced JSON
 * - Standalone CSS stylesheet containing `:root` with `--bg:` and `--accent:`
 */
export function looksLikeThemeImportPayload(rawText) {
  if (typeof rawText !== "string") return false;
  let trimmed = rawText.trim();
  if (!trimmed || trimmed.length < 12 || trimmed.length > 600_000) return false;
  const fenceMatch = trimmed.match(/^```(?:json|css|txt|ccfm)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) trimmed = fenceMatch[1].trim();
  if (/CCFM-(?:THEME|PACK)-v1:\s*[A-Za-z0-9+/=_-]{8,}/.test(trimmed)) return true;
  if (trimmed.includes(":root") && /--bg\s*:\s*#[0-9a-fA-F]{3,8}/.test(trimmed) && /--accent\s*:\s*#[0-9a-fA-F]{3,8}/.test(trimmed)) {
    return true;
  }
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      const parsed = JSON.parse(trimmed);
      const isThemeObj = (o) =>
        Boolean(
          o &&
          typeof o === "object" &&
          (o.format === "bun-rad-studio-file-manager-theme" ||
            (o.colors &&
              typeof o.colors === "object" &&
              typeof o.colors.background === "string" &&
              typeof o.colors.accent === "string")),
        );
      if (isThemeObj(parsed)) return true;
      if (parsed && typeof parsed === "object" && parsed.format === "bun-rad-studio-file-manager-theme-pack" && Array.isArray(parsed.themes)) {
        return true;
      }
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isThemeObj)) return true;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.themes) && parsed.themes.length > 0 && parsed.themes.every(isThemeObj)) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Validates and imports one or more themes from raw text (`CCFM-THEME-v1:...`, `CCFM-PACK-v1:...`, CSS, or JSON),
 * automatically prompting the Conflict Resolution Modal if any names collide.
 */
export async function pasteImportThemesFromText(rawText, { applyFirst = true, forcePrompt = false, onImported = null, quietIfInvalid = false } = {}) {
  const text = String(rawText ?? "").trim();
  if (!text) {
    if (!quietIfInvalid) toast("Clipboard is empty — copy a CCFM-THEME-v1 code, CCFM-PACK-v1 bundle, or Theme JSON first.", { kind: "info" });
    return { completed: false, result: null };
  }
  if (!looksLikeThemeImportPayload(text)) {
    if (!quietIfInvalid) {
      toast("Clipboard does not contain a valid CCFM-THEME-v1 / CCFM-PACK-v1 share code, CSS, or Theme JSON.", { kind: "info" });
    }
    return { completed: false, result: null };
  }
  return await runBulkThemeImportFlow(text, { applyFirst, forcePrompt, onImported });
}

/**
 * Reads the native OS / browser clipboard via `readFromClipboard()` (or opens the Share & Import Hub if empty)
 * and imports any single theme or bulk theme pack with automatic conflict resolution.
 */
export async function pasteImportThemesFromClipboard(opts = {}) {
  try {
    const clipText = await readFromClipboard();
    if (clipText && clipText.trim()) {
      if (looksLikeThemeImportPayload(clipText)) {
        return await pasteImportThemesFromText(clipText, opts);
      }
      toast("Clipboard text doesn't look like a theme code or JSON — opening Share & Import Hub.", { kind: "info" });
    }
  } catch {
    /* Fall through to Share & Import Hub */
  }
  await showThemeShareDialog(state.settings?.palette || "");
  return { completed: false, result: null };
}

/* ============================================================================
 * 🎬 Theme Show & Screensaver Studio
 * ============================================================================ */

export const THEME_SHOW_MODES_META = [
  {
    id: "cinema_hud",
    icon: "🎬",
    label: "Cinema HUD & Clock",
    desc: "Full-bleed multi-layer atmospheric FX + live theme showcase with a floating translucent glass clock, now-playing badge, and transport controls.",
  },
  {
    id: "pure_canvas",
    icon: "🌌",
    label: "Pure Zen Canvas (Zero UI)",
    desc: "Hides all File Manager chrome so 120Hz storms, 4D tesseracts, and Tesla coils fill 100% of the screen like a native OS screensaver.",
  },
  {
    id: "living_desktop",
    icon: "🔥",
    label: "Living File Manager Showcase",
    desc: "Showcases folders on fire, dripping slime, wind-buffeted toolbars, and custom icon packs with spotlight row highlights across your workspace.",
  },
  {
    id: "retro_afterdark",
    icon: "📺",
    label: "Retro After Dark / XScreenSaver OSD",
    desc: "Nostalgic 90s Linux xscreensaver-demo & CRT green/amber phosphor corner OSD with live telemetry and a bouncing retro badge.",
  },
];

export const THEME_SHOW_CHANNELS_META = [
  {
    id: "all_ultra",
    icon: "🚀",
    label: "M4 Max & Ultra Showcase",
    desc: "All Ultra-tier themes paired with multi-layer signature atmospheric mixes.",
    themes: ["omega_point_singularity", "photonic_metamaterial_3099", "matrioshka_dyson_brain", "chrono_crystalline_aethelgard", "akashic_neural_noosphere", "zero_point_vacuum_genesis", "mac_studio_m4_ultra", "mac_pro_rack_xdr", "macbook_pro_space_black", "imac_m4_spectrum_p3", "macos_sequoia_redwood_xdr", "macos_vision_spatial_mac", "ef5_debris_tornado", "inferno_fire_folders", "toxic_slime_ooze", "urban_street_cyclone", "tesla_coil_plasma", "tokamak_fusion", "hawking_horizon", "m4_space_black", "tahoe_liquid_glass"],
    mixes: [
      "m4_raytrace_prism+liquid_glass_caustics",
      "debris_tornado_ef5+urban_cyclone_debris+hail_supercell+derecho_squall",
      "tesseract_4d+calabi_yau+chronos_retrocausal",
      "plasma_storm+tesla_megacoil+ball_lightning",
      "liquid_glass_caustics+m4_raytrace_prism+aurora",
      "autumn_noreaster_gale+forest_canopy_tempest+monsoon_microburst",
    ],
  },
  {
    id: "storms_debris",
    icon: "🌪️",
    label: "Extreme Storms, Leaves & 3D Debris",
    desc: "EF5 wedge tornadoes, 1,000-leaf October nor'easters, street-canyon newspaper cyclones, Cat-5 hurricanes, and mesospheric red sprites.",
    themes: ["ef5_debris_tornado", "urban_street_cyclone", "autumn_noreaster_gale", "supercell_emerald_vortex", "category_5_eyewall", "mesosphere_red_sprite", "cryo_icicle_blizzard", "scrapyard_shrapnel_vortex", "jovian_red_spot_storm", "neptune_diamond_squall"],
    mixes: [
      "debris_tornado_ef5+urban_cyclone_debris+hail_supercell+derecho_squall",
      "autumn_noreaster_gale+forest_canopy_tempest+monsoon_microburst",
      "junkyard_maelstrom+tesla_megacoil+supercell_tornado",
      "cyber_alley_typhoon+derecho_squall+cyberstorm",
      "category5_hurricane+waterspout_vortex+monsoon_microburst",
      "thundersnow_gale+blizzard+freezing_ice_storm",
    ],
  },
  {
    id: "year_2126",
    icon: "🛸",
    label: "Year 2126 & 3099 God-Mode",
    desc: "Post-Singularity Omega Point, 3099 Photonic Metamaterials, Matrioshka Dyson Brains, 4D Tesseracts, 11D Calabi-Yau manifolds, and retrocausal time loops.",
    themes: ["omega_point_singularity", "photonic_metamaterial_3099", "matrioshka_dyson_brain", "chrono_crystalline_aethelgard", "akashic_neural_noosphere", "zero_point_vacuum_genesis", "kardashev_type_iii_galactic", "transcendent_seraphim_halo", "femtotech_picomatter_forge", "holographic_holodeck_continuum", "hawking_horizon", "alcubierre_warp_drive", "kardashev_dyson_swarm", "quark_gluon_plasma", "m4_space_black", "cyberpunk_neon"],
    mixes: [
      "tesseract_4d+calabi_yau+chronos_retrocausal",
      "eigen_consciousness+tachyon_braid_2126+dyson_swarm",
      "klein_mobius+penrose_quasicrystal+void_metamaterial",
      "xenotech_biolith+strangelet_condensate+ferrofluid_spikes",
      "omega_point_2126+hawking_horizon+tesla_megacoil",
      "metric_fold_origami+alcubierre_warp+gravitational_waves",
    ],
  },
  {
    id: "tesla_physics",
    icon: "⚡",
    label: "High-Voltage Tesla & CERN Physics",
    desc: "Wardenclyffe magnifying transmitters, ITER tokamak fusion toruses, CERN hadron colliders, and ferrofluid spikes.",
    themes: ["tesla_coil_plasma", "tokamak_fusion", "cern_lhc_detector", "ferrofluid_magnetics", "meissner_superconductor", "cherenkov_reactor"],
    mixes: [
      "plasma_storm+tesla_megacoil+ball_lightning",
      "tokamak_fusion+plasma_storm+arc_reactor_core",
      "hadron_collider+antimatter_trap+cherenkov_glow",
      "ferrofluid_spikes+meissner_levitation+plasma_globe",
      "jacobs_ladder+st_elmos_corona+faraday_cage",
    ],
  },
  {
    id: "visceral_fx",
    icon: "🔥",
    label: "Visceral Folders: Fire, Slime & Frost",
    desc: "Showcases interactive File Manager UI element shaders: folders on fire, dripping radioactive slime, wind-buffeted rows, cryo rime, and Tesla arcs.",
    themes: ["inferno_fire_folders", "toxic_slime_ooze", "ef5_debris_tornado", "cryo_icicle_blizzard", "tesla_coil_plasma", "scrapyard_shrapnel_vortex"],
    mixes: [
      "dragon_forge+plasma_storm+embers",
      "abyssal_trench+caustics+jellyfish_glow",
      "debris_tornado_ef5+autumn_noreaster_gale",
      "thundersnow_gale+freezing_ice_storm",
    ],
    uiFxCycle: ["fire_folders", "slime_drip", "storm_wind", "cryo_frost", "tesla_arcs", "mercury_chrome", "holo_glitch", "void_tentacles"],
    iconPackCycle: ["inferno_burn", "bio_slime", "storm_weather", "cryo_crystal", "neon_cyber", "liquid_chrome", "retro_pixel", "arcane_glyphs"],
  },
  {
    id: "linux_retro",
    icon: "🐧",
    label: "Nostalgic Linux, Compiz & Retro OS",
    desc: "A love letter to Compiz Fusion desktop cube burn, Solaris CDE, SGI IRIX, BeOS, Amiga Workbench, OS/2 Warp, and CRT terminals.",
    themes: ["inferno_fire_folders", "ubuntu_yaru_dark", "arch_btw", "solaris_cde", "sgi_irix_indigo", "beos_yellowtab", "amiga_workbench", "win95", "dracula", "gruvbox_dark"],
    mixes: [
      "matrix+neural_nexus+pcb_traces",
      "dragon_forge+embers",
      "outrun_grid+hyperspace+laser_show",
      "radar_sweep+constellations",
    ],
  },
  {
    id: "us_holidays",
    icon: "🎄",
    label: "Complete US Holidays Showcase",
    desc: "All 18 US Federal & major cultural holidays: New Year's Ball Drop, MLK Dawn, Valentine's Rose, Presidents' Brass, St. Patrick's Clover, Easter Meadow, Mother's & Father's Day, Memorial & Veterans Day, Juneteenth, 4th of July Fireworks, Labor Day Forge, Halloween, Día de los Muertos, Thanksgiving, Hanukkah & Christmas.",
    themes: [
      "holiday_new_years_times_square", "holiday_mlk_dream_memorial", "holiday_valentines_velvet_rose", "holiday_presidents_mount_rushmore",
      "holiday_st_patricks_emerald_clover", "holiday_easter_pastel_egg_hunt", "holiday_mothers_day_botanical_tea", "holiday_memorial_day_poppy_honor",
      "holiday_juneteenth_jubilee_star", "holiday_fathers_day_leather_den", "holiday_fourth_of_july_fireworks", "holiday_labor_day_rivet_forge",
      "holiday_halloween_jack_o_lantern", "holiday_dia_de_los_muertos_marigold", "holiday_veterans_day_valor_medallion", "holiday_thanksgiving_harvest_hearth",
      "holiday_hanukkah_menorah_sapphire", "holiday_christmas_nutcracker_hearth",
    ],
    mixes: [
      "fireworks+confetti+starlight_velvet",
      "snow+cinema_bokeh+embers",
      "autumn_leaves+embers+fireflies",
      "sakura+confetti+sunbeams",
    ],
  },
  {
    id: "nerd_complete",
    icon: "🎲",
    label: "Nerd Complete Theme Sets",
    desc: "D&D 5e Arcane Grimoire & d20, Starfleet LCARS Galaxy Bridge, Jedi/Sith Kyber Holocron, Rivendell Mithril, Mecha Unit-01 NERV HUD, DEFCON Mainframe, 16-Bit SNES JRPG, Comic Book Halftone, NASA Apollo 11 DSKY & Bletchley Enigma.",
    themes: [
      "nerd_dnd_arcane_grimoire", "nerd_starfleet_lcars_bridge", "nerd_kyber_holocron_forge", "nerd_lotr_mithril_elven",
      "nerd_mecha_eva_nerv_hud", "nerd_defcon_blackhat_mainframe", "nerd_16bit_snes_jrpg_cartridge", "nerd_golden_age_comic_halftone",
      "nerd_apollo_11_dsky_guidance", "nerd_enigma_bletchley_cipher",
    ],
    mixes: [
      "sacred_mandala+embers+fireflies",
      "warp_tunnel+starfield+hud_reticle",
      "laser_show+starfield+plasma_arcs",
      "matrix_code+circuit_traces+hud_reticle",
    ],
  },
  {
    id: "horror_nightmare",
    icon: "🧛",
    label: "Horror, Crypt & Nightmare Cinema",
    desc: "Nosferatu Gothic Blood Moon, Lovecraft Non-Euclidean R'lyeh, 1999 Found-Footage Hi8 VHS, Silent Fog Asylum, Level-4 Biohazard Breach, 1980 Camp Slasher, Victorian Ouija Séance, Necronomicon Folio, Thalassophobia Leviathan & Cursed Carnival.",
    themes: [
      "horror_nosferatu_blood_moon", "horror_lovecraft_eldritch_rlyeh", "horror_vhs_found_footage_1999", "horror_silent_fog_asylum",
      "horror_biohazard_containment_lab", "horror_camp_crystal_slasher_80s", "horror_haunted_victorian_seance", "horror_necronomicon_parchment_day",
      "horror_thalassophobia_abyssal_jaw", "horror_cursed_carnival_calliope",
    ],
    mixes: [
      "embers+red_sprites+starlight_velvet",
      "abyssal_trench+jellyfish_glow+bio_spores",
      "thunderstorm+rain+red_sprites",
      "toxic_slime+bio_spores+hud_reticle",
    ],
  },
  {
    id: "realworld_objects",
    icon: "🕰️",
    label: "Real-World Tactile Objects & Masterpiece Materials",
    desc: "Grandfather Mahogany Clockwork & Pendulum, 1959 Wurlitzer Vinyl Jukebox, Chartres Stained-Glass Rose Window, Venetian Murano Blown Glass, Tamahagane Katana & Urushi Lacquer, and 1978 Pinball Backglass.",
    themes: [
      "realworld_grandfather_clockwork_mahogany", "realworld_vinyl_jukebox_wurlitzer", "realworld_stained_glass_cathedral",
      "realworld_murano_blown_glass_day", "realworld_katana_urushi_forge", "realworld_pinball_wizard_arcade",
      "steampunk_chronometer_foundry", "art_deco_metropolis_1929", "kyoto_zen_karesansui_day",
    ],
    mixes: [
      "dust_motes+sunbeams+embers",
      "sunbeams+prism_spectrum+sacred_mandala",
      "liquid_glass_caustics+sunbeams+prism_spectrum",
      "cinema_bokeh+prism_spectrum+embers",
    ],
  },
  {
    id: "favorites",
    icon: "★",
    label: "My Favorites & Custom Hacked Themes",
    desc: "Cycles through your pinned Favorite themes, custom hacked themes in My Themes, and saved atmospheric presets.",
    themes: [],
    mixes: [],
  },
];

let activeShowState = null;
let idleWatcherTimer = 0;
let idleListenersBound = false;
let lastUserActivityAt = Date.now();

/** Returns true if the Theme Show / Screensaver is currently active. */
export function isThemeShowActive() {
  return Boolean(activeShowState?.active);
}

function formatShowClock(now = new Date()) {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const dateStr = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return { time: `${hh}:${mm}:${ss}`, date: dateStr };
}

/** Advances or steps backward in the active Theme Show / Screensaver by `delta` scenes (`1` or `-1`). */
export async function stepThemeShow(delta = 1) {
  if (!activeShowState?.active) return null;
  const st = activeShowState;
  st.sceneIndex = (st.sceneIndex + (delta >= 0 ? 1 : -1) + Math.max(1, st.scenes.length)) % Math.max(1, st.scenes.length);
  const scene = st.scenes[st.sceneIndex] || { themeKey: "ef5_debris_tornado", themeName: "EF5 Debris Tornado", atmo: "debris_tornado_ef5+urban_cyclone_debris", uiFx: "storm_wind", iconPack: "storm_tempest" };
  st.currentScene = scene;

  const root = document.documentElement;
  if (st.options.transition === "glitch_cut") {
    root.dataset.themeShowGlitch = "true";
    setTimeout(() => { delete root.dataset.themeShowGlitch; }, 360);
  }

  await applyPalette(scene.themeKey);
  if (scene.uiFx) {
    root.setAttribute("data-ui-fx", scene.uiFx);
  }
  if (scene.iconPack) {
    root.setAttribute("data-icon-pack", scene.iconPack);
    syncVisibleIcons(document);
  }

  try {
    const effectiveTier = st.options.boostTier === "keep"
      ? (state.settings?.atmosphereTier || "ultra")
      : (st.options.boostTier || "extreme");
    if (scene.atmo && scene.atmo !== "none") {
      applyAtmosphere(scene.atmo, 92, effectiveTier, "telemetry");
      if (st.options.transition === "arc_surge") {
        triggerReactiveImpulse?.(1.65);
      }
    }
  } catch {}

  st.updateHud?.();
  return scene;
}

/** Pauses or resumes automatic scene cycling in the active Theme Show. */
export function togglePauseThemeShow() {
  if (!activeShowState?.active) return false;
  activeShowState.paused = !activeShowState.paused;
  activeShowState.updateHud?.();
  return activeShowState.paused;
}

/** Stops the active Theme Show / Screensaver and restores the user's previous theme & FX unless `keepCurrent` is true. */
export async function stopThemeShow({ keepCurrent = false } = {}) {
  if (!activeShowState) return;
  const st = activeShowState;
  activeShowState = null;
  if (st.intervalId) clearInterval(st.intervalId);
  if (st.clockId) clearInterval(st.clockId);
  if (st.cleanupListeners) st.cleanupListeners();

  const root = document.documentElement;
  delete root.dataset.themeShow;
  delete root.dataset.themeShowTransition;
  delete root.dataset.themeShowGlitch;
  document.getElementById("fm-theme-show-overlay")?.remove();

  if (keepCurrent && st.currentScene) {
    const sc = st.currentScene;
    await saveSettings({
      palette: sc.themeKey,
      ...(sc.atmo ? { atmosphere: sc.atmo, atmosphereIntensity: 90 } : {}),
      ...(sc.uiFx ? { uiElementFx: sc.uiFx } : {}),
      ...(sc.iconPack ? { iconPackStyle: sc.iconPack } : {}),
    });
    toast(`Kept Theme Show scene: ${sc.themeName}!`, { kind: "success" });
    return;
  }

  // Restore pre-show user state
  if (state.settings && st.savedSnapshot) {
    Object.assign(state.settings, st.savedSnapshot);
  }
  await applyPalette(st.savedSnapshot?.palette || "");
  try {
    applyAtmosphere(
      st.savedSnapshot?.atmosphere || "none",
      st.savedSnapshot?.atmosphereIntensity ?? 60,
      st.savedSnapshot?.atmosphereTier || "auto",
      st.savedSnapshot?.atmosphereReactive || "off",
      st.savedSnapshot?.atmosphereLayerMods || {},
    );
  } catch {}
}

/** Starts the full-window Theme Show & Screensaver with the chosen presentation mode, channel, interval, and options. */
export async function startThemeShow(customOptions = {}) {
  if (activeShowState?.active) {
    await stopThemeShow();
  }
  const s = state.settings ?? {};
  const options = {
    mode: customOptions.mode || s.themeShowMode || "cinema_hud",
    channel: customOptions.channel || s.themeShowChannel || "all_ultra",
    intervalSec: Math.max(5, Math.min(600, Number(customOptions.intervalSec ?? s.themeShowIntervalSec) || 15)),
    transition: customOptions.transition || s.themeShowTransition || "oklab_morph",
    exitOnMove: customOptions.exitOnMove !== undefined ? Boolean(customOptions.exitOnMove) : Boolean(s.themeShowExitOnMove),
    showClock: customOptions.showClock !== undefined ? Boolean(customOptions.showClock) : (s.themeShowClock !== false),
    boostTier: customOptions.boostTier || s.themeShowBoostTier || "extreme",
  };

  const allThemes = await themeList().catch(() => []);
  const chanMeta = THEME_SHOW_CHANNELS_META.find((c) => c.id === options.channel) || THEME_SHOW_CHANNELS_META[0];

  let candidateKeys = [];
  if (options.channel === "favorites") {
    const favs = favoriteKeys();
    const customKeys = allThemes.filter((t) => t.group === "My themes").map((t) => t.key);
    candidateKeys = [...new Set([...customKeys, ...favs])];
  } else {
    candidateKeys = (chanMeta.themes || []).filter((k) => allThemes.some((t) => t.key === k));
  }
  if (!candidateKeys.length) {
    candidateKeys = allThemes.filter((t) => resolveTemplateTier(t) === "ultra").map((t) => t.key);
  }
  if (!candidateKeys.length) {
    candidateKeys = allThemes.slice(0, 12).map((t) => t.key);
  }

  const mixes = chanMeta.mixes?.length
    ? chanMeta.mixes
    : ["debris_tornado_ef5+urban_cyclone_debris", "tesseract_4d+calabi_yau+chronos_retrocausal", "plasma_storm+tesla_megacoil"];

  const scenes = candidateKeys.map((themeKey, idx) => {
    const tObj = allThemes.find((t) => t.key === themeKey);
    const atmo = (tObj?.atmosphere && tObj.atmosphere !== "none")
      ? tObj.atmosphere
      : mixes[idx % mixes.length];
    const uiFx = chanMeta.uiFxCycle
      ? chanMeta.uiFxCycle[idx % chanMeta.uiFxCycle.length]
      : (tObj?.uiElementFx || "");
    const iconPack = chanMeta.iconPackCycle
      ? chanMeta.iconPackCycle[idx % chanMeta.iconPackCycle.length]
      : (tObj?.iconPackStyle || "");
    return {
      themeKey,
      themeName: tObj?.name || themeKey,
      atmo,
      uiFx,
      iconPack,
    };
  });

  const savedSnapshot = {
    palette: s.palette || "",
    atmosphere: s.atmosphere || "none",
    atmosphereIntensity: s.atmosphereIntensity ?? 60,
    atmosphereTier: s.atmosphereTier || "auto",
    atmosphereReactive: s.atmosphereReactive || "off",
    atmosphereLayerMods: JSON.parse(JSON.stringify(s.atmosphereLayerMods || {})),
    uiElementFx: s.uiElementFx || "off",
    iconPackStyle: s.iconPackStyle || "default",
  };

  const root = document.documentElement;
  root.dataset.themeShow = options.mode;
  root.dataset.themeShowTransition = options.transition;

  const clockTimeEl = h("div", { class: "fm-theme-show-clock-time", "data-theme-show-clock": "true" });
  const clockDateEl = h("div", { class: "fm-theme-show-clock-date" });
  const nowPlayingTitle = h("div", { class: "fm-theme-show-scene-title", "data-theme-show-now-playing": "true" });
  const nowPlayingMeta = h("div", { class: "fm-theme-show-scene-meta", "data-theme-show-meta": "true" });
  const pauseBtn = h("button", {
    type: "button",
    class: "btn fm-theme-show-btn",
    "data-theme-show-pause": "true",
    onclick: (e) => {
      e.stopPropagation();
      togglePauseThemeShow();
    },
  }, "⏸ Pause");

  const retroBadge = options.mode === "retro_afterdark"
    ? h("div", { class: "fm-theme-show-retro-floater", "data-theme-show-retro-badge": "true" },
        h("div", { class: "fm-theme-show-retro-title" }, "🐧 XSCREENSAVER // CODECAINE RAD STUDIO"),
        h("div", { class: "fm-theme-show-retro-sub", "data-theme-show-retro-sub": "true" }, "CHANNEL: READY · 120HZ GPU SHADER PIPELINE"),
      )
    : null;

  const overlay = h("div", {
    id: "fm-theme-show-overlay",
    class: `fm-theme-show-overlay is-mode-${options.mode}`,
    "data-theme-show-mode": options.mode,
    role: "region",
    "aria-label": "Theme Show and Screensaver overlay",
  },
    retroBadge,
    h("div", { class: "fm-theme-show-hud" },
      options.showClock
        ? h("div", { class: "fm-theme-show-clock-box" }, clockTimeEl, clockDateEl)
        : null,
      h("div", { class: "fm-theme-show-info-box" },
        h("div", { class: "fm-theme-show-channel-pill" }, `${chanMeta.icon} ${chanMeta.label}`),
        nowPlayingTitle,
        nowPlayingMeta,
      ),
      h("div", { class: "fm-theme-show-controls" },
        h("button", {
          type: "button",
          class: "btn fm-theme-show-btn",
          "data-theme-show-prev": "true",
          title: "Previous Scene (Left Arrow or [)",
          onclick: (e) => { e.stopPropagation(); void stepThemeShow(-1); },
        }, "◀ Prev"),
        pauseBtn,
        h("button", {
          type: "button",
          class: "btn fm-theme-show-btn",
          "data-theme-show-next": "true",
          title: "Next Scene (Right Arrow or ])",
          onclick: (e) => { e.stopPropagation(); void stepThemeShow(1); },
        }, "Next ▶"),
        h("button", {
          type: "button",
          class: "btn fm-theme-show-btn",
          "data-theme-show-surge": "true",
          title: "Discharge an immediate High-Voltage / Debris Surge (S)",
          onclick: (e) => {
            e.stopPropagation();
            try {
              triggerReactiveImpulse?.(1.85);
            } catch {}
          },
        }, "⚡ Surge"),
        h("button", {
          type: "button",
          class: "btn fm-theme-show-btn",
          "data-theme-show-keep": "true",
          title: "Exit the Theme Show and keep the currently playing theme & atmospheric FX on your workspace",
          onclick: (e) => { e.stopPropagation(); void stopThemeShow({ keepCurrent: true }); },
        }, "📌 Keep This Scene"),
        h("button", {
          type: "button",
          class: "btn primary fm-theme-show-btn",
          "data-theme-show-exit": "true",
          title: "Exit Theme Show and restore your previous workspace theme (Esc)",
          onclick: (e) => { e.stopPropagation(); void stopThemeShow({ keepCurrent: false }); },
        }, "✕ Exit Show"),
      ),
    ),
  );

  document.getElementById("fm-theme-show-overlay")?.remove();
  document.body.appendChild(overlay);

  const startedAt = Date.now();
  const onKeyDown = (e) => {
    if (!activeShowState?.active) return;
    if (e.key === "Escape") {
      e.preventDefault();
      void stopThemeShow({ keepCurrent: false });
      return;
    }
    if (e.key === "ArrowRight" || e.key === "]") {
      e.preventDefault();
      void stepThemeShow(1);
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "[") {
      e.preventDefault();
      void stepThemeShow(-1);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      togglePauseThemeShow();
      return;
    }
    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      try {
        triggerReactiveImpulse?.(1.85);
      } catch {}
      return;
    }
    if (options.exitOnMove && Date.now() - startedAt > 1200) {
      void stopThemeShow({ keepCurrent: false });
    }
  };

  const onPointerMove = (e) => {
    if (!activeShowState?.active || !options.exitOnMove) return;
    if (Date.now() - startedAt < 1400) return;
    if (e.target?.closest?.(".fm-theme-show-hud")) return;
    void stopThemeShow({ keepCurrent: false });
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("mousemove", onPointerMove, { passive: true });

  const updateClock = () => {
    const { time, date } = formatShowClock();
    clockTimeEl.textContent = time;
    clockDateEl.textContent = date;
  };
  updateClock();

  activeShowState = {
    active: true,
    paused: false,
    options,
    scenes,
    sceneIndex: -1,
    currentScene: null,
    savedSnapshot,
    cleanupListeners: () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mousemove", onPointerMove);
    },
    updateHud: () => {
      if (!activeShowState) return;
      const sc = activeShowState.currentScene;
      pauseBtn.textContent = activeShowState.paused ? "▶ Resume" : "⏸ Pause";
      pauseBtn.setAttribute("aria-pressed", String(activeShowState.paused));
      if (sc) {
        nowPlayingTitle.textContent = `${sc.themeName} (${activeShowState.sceneIndex + 1}/${scenes.length})`;
        const tierTxt = (options.boostTier === "keep" ? (state.settings?.atmosphereTier || "ultra") : options.boostTier).toUpperCase();
        nowPlayingMeta.textContent = `🌌 FX: ${sc.atmo || "none"}${sc.uiFx ? ` · 🔥 UI: ${sc.uiFx}` : ""}${sc.iconPack ? ` · 🎭 Icons: ${sc.iconPack}` : ""} · ⚡ Tier: ${tierTxt}`;
        const retroSub = overlay.querySelector("[data-theme-show-retro-sub]");
        if (retroSub) {
          retroSub.textContent = `THEME: ${sc.themeKey.toUpperCase()} // FX: ${(sc.atmo || "NONE").toUpperCase()} // TIER: ${tierTxt}`;
        }
      }
    },
  };

  await stepThemeShow(1);

  activeShowState.clockId = setInterval(updateClock, 1000);
  activeShowState.intervalId = setInterval(() => {
    if (activeShowState?.active && !activeShowState.paused) {
      void stepThemeShow(1);
    }
  }, options.intervalSec * 1000);

  return activeShowState;
}

/** Syncs the automatic idle screensaver timer (`themeShowIdleMinutes`). */
export function syncThemeShowIdleWatcher() {
  if (idleWatcherTimer) {
    clearInterval(idleWatcherTimer);
    idleWatcherTimer = 0;
  }
  const idleMin = Number(state.settings?.themeShowIdleMinutes) || 0;
  if (idleMin <= 0 || typeof window === "undefined") return;

  if (!idleListenersBound) {
    idleListenersBound = true;
    const markActive = () => { lastUserActivityAt = Date.now(); };
    window.addEventListener("mousemove", markActive, { passive: true });
    window.addEventListener("keydown", markActive, { passive: true });
    window.addEventListener("mousedown", markActive, { passive: true });
  }

  lastUserActivityAt = Date.now();
  idleWatcherTimer = setInterval(() => {
    const mins = Number(state.settings?.themeShowIdleMinutes) || 0;
    if (mins <= 0 || isThemeShowActive()) return;
    if (Date.now() - lastUserActivityAt >= mins * 60 * 1000) {
      void startThemeShow();
    }
  }, 5000);
}

/** Opens the interactive 🎬 Theme Show & Screensaver Studio configuration and launcher dialog. */
export async function showThemeShowDialog(existingThemes) {
  let themes = existingThemes;
  if (!themes) {
    themes = await themeList().catch(() => []);
  }
  const s = state.settings ?? {};
  let pickedMode = s.themeShowMode || "cinema_hud";
  let pickedChannel = s.themeShowChannel || "all_ultra";

  const modeCardsWrap = h("div", { class: "theme-show-mode-grid", role: "radiogroup", "aria-label": "Theme Show visual mode" });
  const renderModeCards = () => {
    modeCardsWrap.replaceChildren(...THEME_SHOW_MODES_META.map((m) => {
      const active = pickedMode === m.id;
      return h("button", {
        type: "button",
        class: `theme-show-card${active ? " is-active" : ""}`,
        "data-show-mode-card": m.id,
        "aria-pressed": String(active),
        onclick: () => {
          pickedMode = m.id;
          renderModeCards();
        },
      },
        h("div", { class: "theme-show-card-head" }, h("span", { class: "theme-show-card-icon" }, m.icon), h("strong", {}, m.label)),
        h("div", { class: "theme-show-card-desc" }, m.desc),
      );
    }));
  };
  renderModeCards();

  const channelCardsWrap = h("div", { class: "theme-show-channel-grid", role: "radiogroup", "aria-label": "Theme Show channel" });
  const renderChannelCards = () => {
    channelCardsWrap.replaceChildren(...THEME_SHOW_CHANNELS_META.map((ch) => {
      const active = pickedChannel === ch.id;
      return h("button", {
        type: "button",
        class: `theme-show-card${active ? " is-active" : ""}`,
        "data-show-channel-card": ch.id,
        "aria-pressed": String(active),
        onclick: () => {
          pickedChannel = ch.id;
          renderChannelCards();
        },
      },
        h("div", { class: "theme-show-card-head" }, h("span", { class: "theme-show-card-icon" }, ch.icon), h("strong", {}, ch.label)),
        h("div", { class: "theme-show-card-desc" }, ch.desc),
      );
    }));
  };
  renderChannelCards();

  const intervalSelect = h("select", { class: "prop-input", "data-show-interval": "true", "aria-label": "Scene switch interval" },
    h("option", { value: "8" }, "Every 8 seconds (Fast Demo Showcase)"),
    h("option", { value: "15" }, "Every 15 seconds (Recommended)"),
    h("option", { value: "30" }, "Every 30 seconds"),
    h("option", { value: "60" }, "Every 60 seconds (1 minute)"),
    h("option", { value: "180" }, "Every 3 minutes"),
    h("option", { value: "300" }, "Every 5 minutes"),
  );
  intervalSelect.value = String(s.themeShowIntervalSec || 15);

  const transitionSelect = h("select", { class: "prop-input", "data-show-transition": "true", "aria-label": "Scene transition style" },
    h("option", { value: "oklab_morph" }, "🌈 Smooth OKLab Color Morph"),
    h("option", { value: "arc_surge" }, "⚡ High-Voltage Arc & Debris Surge Cut"),
    h("option", { value: "glitch_cut" }, "👾 Holographic Scanline Glitch Cut"),
  );
  transitionSelect.value = s.themeShowTransition || "oklab_morph";

  const boostTierSelect = h("select", { class: "prop-input", "data-show-boost-tier": "true", "aria-label": "Screensaver GPU hardware tier boost" },
    h("option", { value: "extreme" }, "🔥 M4 Max / Extreme Uncapped (120Hz · 3.2x Density · 6 Layers)"),
    h("option", { value: "ultra" }, "🚀 Modern ARM / Ultra Tier"),
    h("option", { value: "keep" }, "Keep Current Workspace Tier"),
  );
  boostTierSelect.value = s.themeShowBoostTier || "extreme";

  const idleSelect = h("select", { class: "prop-input", "data-show-idle-minutes": "true", "aria-label": "Auto-launch screensaver after idle minutes" },
    h("option", { value: "0" }, "Off (Launch manually only)"),
    h("option", { value: "1" }, "After 1 minute of inactivity"),
    h("option", { value: "3" }, "After 3 minutes of inactivity"),
    h("option", { value: "5" }, "After 5 minutes of inactivity"),
    h("option", { value: "10" }, "After 10 minutes of inactivity"),
    h("option", { value: "15" }, "After 15 minutes of inactivity"),
    h("option", { value: "30" }, "After 30 minutes of inactivity"),
  );
  idleSelect.value = String(s.themeShowIdleMinutes || 0);

  const exitOnMoveCheck = h("input", {
    type: "checkbox",
    "data-show-exit-on-move": "true",
    "aria-label": "Wake / exit screensaver immediately on mouse move or keypress",
  });
  exitOnMoveCheck.checked = Boolean(s.themeShowExitOnMove);

  const showClockCheck = h("input", {
    type: "checkbox",
    "data-show-clock-toggle": "true",
    "aria-label": "Display ambient digital clock and now-playing telemetry HUD",
  });
  showClockCheck.checked = s.themeShowClock !== false;

  const persistOptions = async () => {
    const patch = {
      themeShowMode: pickedMode,
      themeShowChannel: pickedChannel,
      themeShowIntervalSec: Number(intervalSelect.value) || 15,
      themeShowTransition: transitionSelect.value,
      themeShowBoostTier: boostTierSelect.value,
      themeShowIdleMinutes: Number(idleSelect.value) || 0,
      themeShowExitOnMove: Boolean(exitOnMoveCheck.checked),
      themeShowClock: Boolean(showClockCheck.checked),
    };
    await saveSettings(patch);
    syncThemeShowIdleWatcher();
    return patch;
  };

  const dlg = openDialog({
    title: "Theme Show & Screensaver Studio",
    wide: true,
    body: [
      h("p", { class: "hint" }, "Turn your File Manager into a living DemoScene / XScreenSaver / M4 Max storm showcase. Choose a presentation mode, a curated theme + multi-layer FX channel, and modern screensaver options below."),
      h("h3", { style: "margin:0.4rem 0 0.3rem;font-size:13px" }, "1. Presentation Mode"),
      modeCardsWrap,
      h("h3", { style: "margin:0.65rem 0 0.3rem;font-size:13px" }, "2. Curated Show Channel (Themes + Multi-Layer Atmosphere + Folder FX)"),
      channelCardsWrap,
      h("h3", { style: "margin:0.65rem 0 0.3rem;font-size:13px" }, "3. Modern Screensaver & Hardware Options"),
      h("div", { class: "theme-solar-grid" },
        h("label", { class: "field" }, h("span", { class: "field-label" }, "⏱️ Scene Duration"), intervalSelect),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "✨ Transition FX"), transitionSelect),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "🚀 GPU Tier During Show"), boostTierSelect),
        h("label", { class: "field" }, h("span", { class: "field-label" }, "💤 Auto-Start Screensaver When Idle"), idleSelect),
      ),
      h("div", { style: "display:flex;gap:1.2rem;flex-wrap:wrap;margin-top:0.55rem" },
        h("label", { class: "theme-solar-toggle" }, showClockCheck, h("span", {}, "🕰️ Show Ambient Digital Clock & Now-Playing Telemetry HUD")),
        h("label", { class: "theme-solar-toggle" }, exitOnMoveCheck, h("span", {}, "🖱️ Classic Screensaver Wake (Exit immediately on mouse move)")),
      ),
    ],
    buttons: [
      { label: "Cancel", value: "cancel" },
      { label: "Save Settings", value: "save" },
      { label: "🎬 Launch Theme Show Now", value: "launch", primary: true },
    ],
    initialFocus: intervalSelect,
  });

  const answer = await dlg.result;
  if (answer === "save") {
    await persistOptions();
    toast("Saved Theme Show & Screensaver preferences.", { kind: "success" });
  } else if (answer === "launch") {
    const saved = await persistOptions();
    await startThemeShow({
      mode: saved.themeShowMode,
      channel: saved.themeShowChannel,
      intervalSec: saved.themeShowIntervalSec,
      transition: saved.themeShowTransition,
      boostTier: saved.themeShowBoostTier,
      exitOnMove: saved.themeShowExitOnMove,
      showClock: saved.themeShowClock,
    });
  }
  return answer;
}

try {
  const mq = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  mq?.addEventListener?.("change", () => {
    if (state.settings?.theme === "auto" && !state.settings?.palette) void applyPalette("");
  });
} catch { /* matchMedia unavailable */ }

const boundShortcutWindows = typeof WeakSet !== "undefined" ? new WeakSet() : null;

/**
 * Ensures the current `window` has global listeners for:
 * 1. Instant Paste Theme Import (`⌘V` / `Ctrl+V` anywhere when clipboard holds a `CCFM-THEME-v1:` / `CCFM-PACK-v1:` / Theme JSON payload,
 *    even when the Theme Gallery search input is focused, without interfering with normal text editing or dedicated import textareas).
 * 2. Explicit Keyboard Shortcut Paste Theme Import (`⌘⇧V` / `Ctrl+Shift+V`).
 * 3. `Right ⌥ + ]` / `Right ⌥ + [` (`Alt + ]` / `Alt + [`) instant theme quick-switcher with live HUD.
 * 4. Dialog-free Quick Random Theme & FX Toggle shortcuts:
 *    - `Alt+R` (`⌥R`): Quick Random Theme (any theme, no dialog)
 *    - `Alt+E` / `Alt+Shift+R` (`⌥E` / `⌥⇧R`): Quick Random FX Theme (with effects, no dialog)
 *    - `Alt+P` / `Alt+Shift+P` (`⌥P` / `⌥⇧P`): Quick Random Plain Theme (no effects / 0.0% GPU, no dialog)
 *    - `Alt+U` (`⌥U`): Quick Random Ultra / God-Mode Theme (no dialog)
 *    - `Alt+0` (`⌥0`): Toggle or turn off animations & FX on current theme (no dialog)
 */
export function ensureGlobalThemeShortcutsBound() {
  if (typeof document !== "undefined" && document.documentElement && !document.documentElement.dataset.platform) {
    syncRootPlatform(document.documentElement, state.settings?.platformProfile || probeClientHardware().platform);
  }
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  if (boundShortcutWindows?.has(window)) return;
  boundShortcutWindows?.add(window);

  window.addEventListener("paste", (e) => {
    if (e.defaultPrevented) return;
    const target = e.target;
    const isDedicatedImportBox = Boolean(
      target?.closest?.("[data-share-import-box], [data-custom-css-input], .theme-export"),
    );
    if (isDedicatedImportBox) return;

    const clipText = e.clipboardData?.getData?.("text/plain") || e.clipboardData?.getData?.("text") || "";
    if (!looksLikeThemeImportPayload(clipText)) return;

    // Allow pasting a theme code even when the Theme Picker search box is focused, or anywhere outside regular text inputs
    const isSearchBox = Boolean(target?.classList?.contains?.("theme-search"));
    const tag = target?.tagName;
    const isEditableField = !isSearchBox && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable);
    if (isEditableField) return;

    e.preventDefault();
    void pasteImportThemesFromText(clipText, { applyFirst: true });
  });

  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const hudEl = typeof document !== "undefined" ? document.getElementById("fm-quick-cycle-hud") : null;
    const hasModal = typeof document !== "undefined" ? Boolean(document.querySelector(".modal-backdrop")) : false;
    if (hudEl && !hasModal) {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        hideQuickCycleHud();
        return;
      }
      const t = e.target;
      const tTag = t?.tagName;
      const inInput = tTag === "INPUT" || tTag === "TEXTAREA" || tTag === "SELECT" || t?.isContentEditable;
      if (!inInput && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "]" || e.key === "[") {
          e.preventDefault();
          void cycleTheme(e.key === "]" ? 1 : -1);
          return;
        }
        if (e.key === " " && tTag !== "BUTTON") {
          e.preventDefault();
          hideQuickCycleHud();
          return;
        }
      }
    }
    // Cmd+Shift+V / Ctrl+Shift+V -> Instant Paste Theme from Clipboard anywhere
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && (e.key === "v" || e.key === "V" || e.code === "KeyV")) {
      const target = e.target;
      const isDedicatedImportBox = Boolean(target?.closest?.("[data-share-import-box], [data-custom-css-input], .theme-export"));
      if (!isDedicatedImportBox) {
        e.preventDefault();
        void pasteImportThemesFromClipboard({ applyFirst: true });
        return;
      }
    }
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target;
    const tag = target?.tagName;
    const isThemeSearch = Boolean(target?.classList?.contains?.("theme-search"));

    // Option + ] / Option + [ (Alt + BracketRight / BracketLeft) -> Cycle Themes with Quick-Switcher HUD
    if (e.code === "BracketRight" || e.code === "BracketLeft" || e.key === "]" || e.key === "[") {
      if (!isThemeSearch && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable)) return;
      e.preventDefault();
      const dir = (e.code === "BracketRight" || e.key === "]") ? 1 : -1;
      void cycleTheme(dir, { showcaseOnly: Boolean(e.shiftKey) });
      return;
    }

    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;

    const code = e.code || "";
    const lowKey = typeof e.key === "string" ? e.key.toLowerCase() : "";

    // Alt + E or Alt + Shift + R -> Quick Random FX Theme (with effects, no dialog)
    if ((!e.shiftKey && (code === "KeyE" || lowKey === "e")) || (e.shiftKey && (code === "KeyR" || lowKey === "r"))) {
      e.preventDefault();
      void randomTheme({ mode: "fx" });
      return;
    }
    // Alt + R -> Quick Random Theme (any theme, no dialog)
    if (!e.shiftKey && (code === "KeyR" || lowKey === "r")) {
      e.preventDefault();
      void randomTheme({ mode: "any" });
      return;
    }
    // Alt + P or Alt + Shift + P -> Quick Random Plain Theme (no effects / 0.0% GPU, no dialog)
    if (code === "KeyP" || lowKey === "p") {
      e.preventDefault();
      void randomTheme({ mode: "plain" });
      return;
    }
    // Alt + U -> Quick Random Ultra / God-Mode Theme (no dialog)
    if (!e.shiftKey && (code === "KeyU" || lowKey === "u")) {
      e.preventDefault();
      void randomTheme({ mode: "ultra" });
      return;
    }
    // Alt + C -> Quick Random Color Palette while keeping current active effects, 3D folders & icons (no dialog)
    if (!e.shiftKey && (code === "KeyC" || lowKey === "c")) {
      e.preventDefault();
      void randomColorsKeepCurrentEffects();
      return;
    }
    // Alt + 0 -> Instant Toggle / Turn Off Animations & FX on current theme (no dialog)
    if (!e.shiftKey && (code === "Digit0" || lowKey === "0")) {
      e.preventDefault();
      void toggleCurrentThemeEffects();
    }
  });
}

ensureGlobalThemeShortcutsBound();

on("view", () => {
  ensureGlobalThemeShortcutsBound();
  const map = state.settings?.folderThemes;
  if (!map || typeof map !== "object" || !Object.keys(map).length) return;
  const folderKey = resolveFolderPalette();
  const target = folderKey || state.settings?.palette || "";
  if ((document.documentElement.dataset.palette || "") !== (target || effectiveAutoPalette())) {
    void applyPalette(target);
  }
});
on("theme-picker", (detail) => { ensureGlobalThemeShortcutsBound(); void showThemePicker(detail || {}); });
on("theme-random", (detail) => { ensureGlobalThemeShortcutsBound(); void randomTheme(detail || {}); });
on("theme-random-colors-keep-fx", (detail) => { ensureGlobalThemeShortcutsBound(); void randomColorsKeepCurrentEffects(detail || {}); });
on("theme-toggle-keep-fx-lock", () => { ensureGlobalThemeShortcutsBound(); toggleKeepEffectsColorSwapMode(); });
on("theme-toggle-fx", (detail) => { ensureGlobalThemeShortcutsBound(); void toggleCurrentThemeEffects(detail || {}); });
on("theme-day-night", () => showDayNightPairDialog());
on("theme-compare", (detail) => showThemeCompareDialog(undefined, detail?.a || "", detail?.b || ""));
on("theme-share", (detail) => showThemeShareDialog(detail?.key || ""));
on("theme-show", () => showThemeShowDialog());
on("theme-paste-import", (detail) => { void pasteImportThemesFromClipboard(detail || {}); });


