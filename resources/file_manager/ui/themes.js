// Color themes for the page: applying one, and the gallery to choose from. The server turns each theme of the
// SimpleGUI table into this page's color variables (and checks that every text and background pair is readable).
import { ApiError, call } from "./api.js";
import { formatAtmosphereLabel, normalizeAtmosphereSpec, parseAtmosphereIds } from "./atmosphereCatalog.js";
import { applyAtmosphere, cycleAtmosphere, effectiveAtmosphere, isAtmosphereZeroWattPaused, savedAtmospherePresets, setAtmosphereZeroWattPaused, triggerReactiveImpulse } from "./atmosphereFx.js";
import { copyToClipboard, flashCopied, readFromClipboard } from "./copyclip.js";
import { openDialog } from "./dialogs.js";
import { HOLIDAY_THEME_CRESTS, buttonIconFor, debounce, h, iconForEntry, resolveHolidayCrestForPalette, syncVisibleIcons } from "./dom.js";
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
  { id: "flash_3000_vector_hud", label: "⚡ Futuristic Flash 3000 Vector HUD (2Advanced)", desc: "Golden-era 2000s FWA / 2Advanced Flash UI reborn for Year 3000: chamfered vector HUD folder doors, laser scan-brackets & kinetic telemetry sweeps" },
  { id: "spinning_3d_holo_folders", label: "🌪️ High-End 3D Spinning & Holo-Tilt Folders", desc: "Built for M4 Max / Ultra & RTX workstations: 3D perspective folder cards with continuous 3D turntable emblems, deep parallax shadows & specular rims" },
  { id: "c4d_mograph_extrude_folders", label: "🎛️ Cinema 4D MoGraph Bevel & Step-Effector", desc: "Master motion-design studio: multi-extruded filleted 3D folder caps, step-effector wave cascade & softbox area-light reflections" },
  { id: "houdini_procedural_vex_hud", label: "💥 Houdini VEX Procedural Wireframe & Spline HUD", desc: "Master VFX technical director look: procedural VEX bezier splines, normal-vector tangents & volumetric pyro rim glow" },
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
  { id: "classic_os_win95", label: "🖥️ Classic OS: Win95, Mac OS 9 & Workbench", desc: "Beveled 16-color desktop icons, floppy disks and system-folder tiles from the 90s GUI era" },
  { id: "handheld_gameboy", label: "🎮 Handheld Game Boy & NES Cartridge", desc: "Four-shade green LCD glyphs, cartridge tiles and chunky d-pad action buttons" },
  { id: "art_deco_gold", label: "🏛️ Art Deco Gilded Geometry", desc: "1920s black-and-gold fan motifs, stepped skyscraper folders and sunburst seals" },
  { id: "bauhaus_primary", label: "🔺 Bauhaus Primary Shapes", desc: "Red, yellow and blue geometric circles, squares and triangles with strict grid alignment" },
  { id: "memphis_80s_pop", label: "🎉 Memphis 80s Squiggle Pop", desc: "Confetti triangles, squiggles and pastel terrazzo tiles in clashing neon" },
  { id: "neo_brutalist_flat", label: "◼️ Neo-Brutalist Thick Outline", desc: "Flat saturated blocks, 3px black outlines and hard offset shadows" },
  { id: "ukiyoe_woodblock", label: "🌊 Ukiyo-e Woodblock Print", desc: "Indigo great-wave folders, washi file sheets and vermilion hanko seals" },
  { id: "pop_art_comic", label: "💥 Pop-Art Comic Halftone", desc: "Ben-Day halftone dots, speech-bubble badges and bold comic-panel borders" },
  { id: "sketch_chalkboard", label: "✏️ Hand-Drawn Sketch & Chalkboard", desc: "Wobbly chalk-line folders and pencil-sketch file glyphs on slate" },
  { id: "clay_soft_3d", label: "🧸 Claymation & Soft Clay 3D", desc: "Inflated matte clay folders with thumbprint texture and pastel puffy buttons" },
  { id: "origami_papercraft", label: "🦢 Origami & Layered Papercraft", desc: "Folded-crease paper cranes, layered cut-paper folders and washi-tape tabs" },
  { id: "lowpoly_isometric", label: "🔷 Low-Poly Isometric Blocks", desc: "Faceted low-polygon crystals and isometric voxel folders with flat-shaded faces" },
  { id: "thin_line_duotone", label: "〰️ Thin Line & Duotone Pro", desc: "Hairline 1px outline glyphs tinted with your theme's accent and secondary colors" },
  { id: "mono_high_contrast", label: "◐ High-Contrast Monochrome & E-Ink", desc: "Accessibility-first pure black/white glyphs with heavy outlines and no gradients, ideal for e-ink" },
  { id: "terminal_ascii_tui", label: "⌨️ Terminal ASCII & TUI Box-Drawing", desc: "Monospace [DIR] and [FILE] tags with box-drawing frames in phosphor green on black" },
  { id: "deep_sea_biolum", label: "🐙 Deep-Sea Bioluminescence", desc: "Abyssal jellyfish folders, anglerfish lure badges and glowing plankton file plates" },
  { id: "desert_sandstone", label: "🏜️ Desert Sandstone & Canyon", desc: "Wind-carved sandstone folders, terracotta tablets and cactus-bloom accents" },
  { id: "cottagecore_botanical", label: "🌿 Cottagecore Botanical Herbarium", desc: "Pressed-flower folders, linen file tags and watercolor botanical badges" },
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

/** 26 Master Animation, 3D GPU & Futuristic Flash-Reloaded Icon Animation Choreographies for folders, files, sidebar places, and toolbar action buttons. */
export const ICON_ANIMATION_PROFILES = [
  { id: "off", label: "⏹️ Static (Off)", desc: "Crisp static 3D icons with zero continuous animation" },
  { id: "folder_3d_spin_turntable", label: "🌪️ 3D Spinning Folder Turntable (Pro GPU)", highEnd3d: true, desc: "High-end 120Hz 3D Y-axis turntable rotation on folders & icons with perspective depth and specular rim flash" },
  { id: "flash_2advanced_vector_hud", label: "⚡ Futuristic Flash 2Advanced HUD", highEnd3d: true, desc: "2000s FWA / 2Advanced Flash UI evolved to Year 3000: mechanical 3D snap-open, vector targeting reticle & laser scan sweep" },
  { id: "folder_3d_flip_origami", label: "📂 3D Pop-Up Folder Vault Flip", highEnd3d: true, desc: "3D hinged perspective folder door that swings open along a 3D axis while fanning out holographic documents" },
  { id: "gyro_3d_cube_matrix", label: "🧊 3D Gyroscopic Gimbal & Cube Spin", highEnd3d: true, desc: "Multi-axis 3D gimbal rotation (rotateX + rotateY + rotateZ) with floating volumetric shadow projection" },
  { id: "flash_fwa_kinetic_eq", label: "📊 Futuristic Flash Audio-Pulse EQ", highEnd3d: true, desc: "Rhythmic Flash-era graphic equalizer & bass-impulse 3D icon bounce with neon spectrum afterglow" },
  { id: "hologram_3d_projector_beam", label: "📽️ 3D Hologram Emitter & Laser Scan", highEnd3d: true, desc: "Folders and icons levitate in a 3D hologram projection cone with vertical cyan/gold laser sweeps" },
  { id: "quantum_3d_phase_split", label: "⚛️ 3D Quantum Stereo Parallax Split", highEnd3d: true, desc: "High-end GPU twin-ghost 3D stereo depth separation where folders phase across parallel planes" },
  { id: "m4_liquid_metal_morph", label: "💧 M4 Ultra 3D Liquid Mercury Morph", highEnd3d: true, desc: "120Hz liquid-chrome 3D undulation with Display-P3 XDR specular light-bar reflections" },
  { id: "c4d_mograph_cloner_wave", label: "🎛️ Cinema 4D MoGraph Step-Effector Wave", highEnd3d: true, desc: "Master motion-designer effector cascade: sinusoidal 3D rotation, scale & spring delay across folders and icons" },
  { id: "houdini_vex_particle_burst", label: "💥 Houdini VEX Curl-Noise Vector Burst", highEnd3d: true, desc: "Procedural VEX curl-noise vector field & micro-fragmentation energy pulse on folders and action buttons" },
  { id: "after_effects_graph_overshoot", label: "📈 After Effects Speed-Graph Overshoot", highEnd3d: true, desc: "Master animator cubic-bezier velocity-curve snap with Disney-style squash-and-stretch & secondary follow-through" },
  { id: "unreal_nanite_mesh_lod", label: "🎮 Unreal 5 Nanite Mesh & PBR Clear-Coat", highEnd3d: true, desc: "Real-time micro-polygon wireframe scan transitioning into anisotropic clear-coat 3D specular reflections" },
  { id: "blender_geometry_nodes_bloom", label: "💠 Blender Geometry Nodes Instance Bloom", highEnd3d: true, desc: "Procedural geometry-nodes radial petal unfolding, normal-mapped rim light & harmonic 3D oscillation" },
  { id: "raytraced_caustic_refraction", label: "💎 Path-Traced Diamond Caustic Dispersion", highEnd3d: true, desc: "IOR 2.42 diamond prism dispersion with chromatic RGB specular glints and caustic light projection" },
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
  { id: "godmode_pantheon_ascend", label: "👑 God-Mode Pantheon Ascension", highEnd3d: true, desc: "Ultimate multi-layered 3D levitation, prismatic foil sweep, orbital crown halo & responsive spring physics" },
];

/**
 * 34 Beloved Built-In Display, CRT, Master Colorist, VFX Compositor, Retro Handheld, Analog Film & Camera Lens Screen Filters (`data-screen-filter`).
 * Can be toggled or cycled anytime (`Alt+F` / `⌥F` or `Alt+Shift+F` / `⌥⇧F`) on top of ANY theme without altering colors or icons!
 */
export const SCREEN_FILTER_PRESETS = [
  { id: "off", label: "⏹️ Off (Native Display)", category: "Standard", desc: "Unfiltered native Display-P3 / sRGB precision output" },
  { id: "crt_trinitron_95", label: "📺 Sony Trinitron CRT '95", category: "Retro CRT", desc: "Aperture-grille RGB phosphor triads, fine scanlines, warm 6500K halation & curved glass bezel vignette" },
  { id: "crt_amber_monochrome", label: "🟠 IBM 5151 Amber Phosphor CRT", category: "Retro CRT", desc: "Classic 1983 warm amber P3 monochrome terminal phosphor glow & horizontal raster scanlines" },
  { id: "crt_green_p1_apple2", label: "🟢 Apple II / VT100 Green P1 CRT", category: "Retro CRT", desc: "Iconic emerald-green P1 phosphor persistence, scanline grille & vintage terminal bloom" },
  { id: "vhs_arcade_crt_curvature", label: "🕹️ 1984 Coin-Op Arcade Bubble CRT", category: "Retro CRT", desc: "Deep arcade cabinet shadow-mask RGB dots, neon phosphor bloom & high-punch contrast" },
  { id: "vhs_camcorder_1994", label: "📼 1994 Hi8 VHS Camcorder", category: "Analog & Tape", desc: "Analog magnetic tape color bleed, chroma shift, soft luma & nostalgic 90s home-video warmth" },
  { id: "gameboy_dmg_olive", label: "🎮 1989 Game Boy DMG-01 LCD", category: "Retro Handheld", desc: "Nostalgic 4-shade olive-green reflective dot-matrix pixel grid & crisp handheld contrast" },
  { id: "virtual_boy_red_led", label: "🕶️ 1995 Virtual Boy Red LED Array", category: "Retro Handheld", desc: "Deep ruby-red oscillating LED scanline matrix & high-contrast pitch-black depth" },
  { id: "kodachrome_64_film", label: "🎞️ 1974 Kodachrome 64 Film", category: "Cinema & Film", desc: "Legendary analog slide film: rich golden highlights, warm skin/wood tones & organic celluloid grain" },
  { id: "technicolor_3strip", label: "🎬 1952 3-Strip Technicolor", category: "Cinema & Film", desc: "Glorious Hollywood dye-transfer Technicolor saturation with jewel-toned reds, greens & blues" },
  { id: "imax_70mm_anamorphic", label: "📽️ IMAX 70mm & Anamorphic Flare", category: "Cinema & Film", desc: "Blockbuster 70mm theatrical contrast, cool cyan shadows, warm highlights & anamorphic lens streak" },
  { id: "noir_sin_city_ink", label: "🕵️ 1940s Silver-Halide Film Noir", category: "Cinema & Film", desc: "High-contrast chiaroscuro silver-gelatin monochrome with dramatic shadow roll-off" },
  { id: "sepia_daguerreotype_1888", label: "🕰️ 1888 Silver Daguerreotype Sepia", category: "Cinema & Film", desc: "Warm antique archival sepia plate tone with soft vignette & Victorian heirloom patina" },
  { id: "davinci_aces_cct_grade", label: "🎨 DaVinci Resolve ACEScct Master Grade", category: "Master Colorist & VFX", desc: "Hollywood DI color-grading suite: wide-gamut ACEScct highlight roll-off, rich shadow toe & film halation" },
  { id: "nuke_anamorphic_flare_streak", label: "💠 Foundry Nuke 2.39:1 Anamorphic Streak", category: "Master Colorist & VFX", desc: "Horizontal cyan/cobalt anamorphic lens flare streaks, oval bokeh edge vignette & optical bloom" },
  { id: "octane_spectral_iridescence", label: "🌈 Octane Spectral Thin-Film Iridescence", category: "Master Colorist & VFX", desc: "Path-traced spectral thin-film interference with pearlescent soap-bubble & titanium-oxide sheen" },
  { id: "red_v_raptor_8k_log", label: "🎥 RED V-Raptor 8K VV IPP2 Cinema", category: "Master Colorist & VFX", desc: "Large-format 8K VistaVision cinema sensor dynamic range with subtle 35mm Kodak 2383 print LUT" },
  { id: "arcane_painterly_brushwork", label: "🖌️ Fortiche Arcane Hand-Painted Oil & Rim", category: "Master Colorist & VFX", desc: "Stylized hand-painted gouache & oil concept-art contrast with electric neon rim-light accents" },
  { id: "substance_pbr_albedo_normal", label: "🧱 Substance 3D PBR Specular & Normal Map", category: "Master Colorist & VFX", desc: "Physically based rendering (PBR) micro-surface normal relief, metallic roughness & Fresnel rim light" },
  { id: "halftone_comic_spiderverse", label: "💥 Spider-Verse Ben-Day Halftone", category: "Pop Art & Anime", desc: "Pop-art CMYK Ben-Day halftone dot screen, punchy ink contrast & comic-book energy" },
  { id: "cyberpunk_chromatic_rgb", label: "⚡ Cyberpunk Chromatic RGB Lens", category: "Sci-Fi & Tactical", desc: "High-energy neon boost, holographic micro-scanlines & cybernetic optical clarity" },
  { id: "matrix_code_phosphor", label: "💻 1999 Nebuchadnezzar Matrix Grade", category: "Sci-Fi & Tactical", desc: "Signature emerald-jade cinema color grade with deep digital phosphor blacks" },
  { id: "hologram_pepper_ghost", label: "🛸 Star Wars Holo-Projector Scan", category: "Sci-Fi & Tactical", desc: "Translucent cyan-blue holographic transmission lines, subtle flicker & volumetric rim glow" },
  { id: "night_vision_gen3", label: "🔭 Gen-3 Tactical Night Vision (NVG)", category: "Sci-Fi & Tactical", desc: "Mil-spec green-phosphor image intensifier tube, circular NVG scope vignette & tactical grain" },
  { id: "flir_thermal_infrared", label: "🌡️ FLIR Thermal Infrared Camera", category: "Sci-Fi & Tactical", desc: "False-color thermal infrared imaging camera grade with high-contrast heat-signature pop" },
  { id: "blueprint_xray_neg", label: "🩻 X-Ray & Cyanotype Radiograph", category: "Sci-Fi & Tactical", desc: "Inverted radiographic blueprint & medical X-ray light-table inspection lens" },
  { id: "e_ink_carta_paper", label: "📖 Kindle E-Ink Carta Matte Paper", category: "Eye Care & Studio", desc: "Zero-glare paper-white & carbon-ink matte e-reader look for effortless all-day reading" },
  { id: "night_shift_warm_2700k", label: "🕯️ 2700K Candlelight Eye Shield", category: "Eye Care & Studio", desc: "Soothing late-night warm amber blue-light shield that eliminates harsh blue wavelengths" },
  { id: "pro_display_xdr_vivid", label: "💎 Pro Display XDR 1600-Nit Vivid", category: "Eye Care & Studio", desc: "Reference micro-contrast boost, Display-P3 vibrancy punch & studio mastering clarity" },
  { id: "nano_texture_matte_glass", label: "☀️ Apple Studio Nano-Texture Matte", category: "Eye Care & Studio", desc: "Soft anti-reflective micro-etched silica glass diffusion with zero harsh specular glare" },
  { id: "dreamcore_bloom_soft", label: "☁️ Tiffen Black Pro-Mist 1/4 Bloom", category: "Optical & Art", desc: "Dreamy halation glow around highlights, pastel shadow lift & cinematic silk diffusion" },
  { id: "underwater_aquatic_refraction", label: "🌊 Deep-Sea Submersible Caustic Lens", category: "Optical & Art", desc: "Bioluminescent abyssal aqua-teal optical refraction & gentle underwater caustic shimmer" },
  { id: "synthwave_sunset_grade", label: "🌴 1984 Outrun Magenta-Cyan Grade", category: "Optical & Art", desc: "Retro-futuristic neon magenta & electric cyan split-toning with sunset warmth" },
  { id: "kaleidoscope_prism_lens", label: "🌈 Dichroic Prism Chromatic Lens", category: "Optical & Art", desc: "Iridescent spectral edge dispersion, crystal saturation & diamond optical clarity" },
];

/**
 * 6 Professional OS Computer Icon Material Finishes (`data-icon-finish`).
 * Ensures every folder (`📁`/`🗂️`/`📂`) and file (`📄`/`💻`/`🖼️`/`📦`) mirrors an authentic, studio-crafted computer icon silhouette.
 */
export const COMPUTER_ICON_FINISH_MODES = [
  { id: "macos_aqua_glass", label: "🍎 macOS Aqua & Tahoe 3D Glass", desc: "Sculpted macOS sky-blue 3D folder lip, inner Display-P3 glass highlight, and crisp document corner fold" },
  { id: "win11_fluent_acrylic", label: "🪟 Windows 11 Fluent Acrylic & Mica", desc: "Warm amber/cobalt Windows 11 Fluent layered folder tab with frosted acrylic document plate" },
  { id: "pro_titanium_anodized", label: "💻 Pro Studio CNC Anodized Titanium", desc: "Space-Black bead-blasted titanium computer icon bevel with 1600-nit XDR specular rim light" },
  { id: "neumorphic_tactile_studio", label: "🎛️ Tactile Neumorphic Studio Keycap", desc: "Precision dual-shadow hardware keycap relief with recessed studio icon well" },
  { id: "holographic_collector_grade", label: "💎 Collector-Grade Prismatic Foil", desc: "PSA-10 1st-Edition dichroic rainbow foil sheen with diamond edge refraction on computer folders & files" },
  { id: "holiday_grand_celebration", label: "🎄 Holiday Grand Celebration Ornament", desc: "Hand-blown mercury-glass ornament finish, 24K gold ribbon trim & animated holiday crest badge" },
];

/**
 * 18 Super-Special US Holiday Celebration Themes (`holiday_*`) with calendar dates, animated crests, and particle bursts.
 */
export const HOLIDAY_CELEBRATION_CATALOG = Object.entries(HOLIDAY_THEME_CRESTS).map(([key, spec]) => ({
  key,
  label: spec.label,
  crest: spec.crest,
  badge: spec.badge,
  month: spec.month,
  day: spec.day,
  anim: spec.anim,
  particles: spec.particles,
}));

/**
 * 8 Procedural Zero-Asset WebAudio UI Soundscape & Tactile Foley Profiles (`data-sound-profile`).
 */
export const UI_SOUND_PROFILES = [
  { id: "off", label: "🔇 Silent (Off)", desc: "Zero audio output" },
  { id: "apple_hig_tactile", label: "🍎 Apple HIG Tactile Glass & Taptic", baseFreq: 520, wave: "sine", desc: "Subtle macOS / visionOS damped glass tap and warm harmonic chime" },
  { id: "mechanical_thock_pro", label: "⌨️ Custom Gasket Mechanical Thock (PBT)", baseFreq: 185, wave: "triangle", desc: "Deep lubed Holy Panda / Topre PBT keycap thock on folder and theme actions" },
  { id: "teenage_synth_op1", label: "🎛️ Teenage Engineering OP-1 Tape Synth", baseFreq: 660, wave: "triangle", desc: "Playful Swedish portable synthesizer micro-arpeggio and tape click" },
  { id: "scifi_lcars_bridge", label: "🖖 Starfleet LCARS Bridge Telemetry", baseFreq: 880, wave: "sine", desc: "24th-century starship console chirp and tactical confirmation tone" },
  { id: "retro_crt_arcade", label: "🕹️ 1984 Coin-Op 8-Bit Arcade Chiptune", baseFreq: 440, wave: "square", desc: "Nostalgic square-wave coin-op arcade blip and level-up arpeggio" },
  { id: "cinema_sub_boom", label: "🎬 IMAX Braaam & Sub-Bass Foley", baseFreq: 110, wave: "sawtooth", desc: "Warm theatrical sub-bass swell and anamorphic shutter click" },
  { id: "holiday_chimes_festive", label: "🎄 Holiday Sleigh Bells & Celesta Chimes", baseFreq: 784, wave: "sine", desc: "Sparkling Tchaikovsky celesta bell harmonic and festive sleigh chime" },
];

/**
 * 8 Interactive 3D Desktop Stage & Ambilux Backlight Modes (`data-stage-mode`, shortcut `Alt+S` / `⌥S`).
 */
export const WORKSPACE_STAGE_MODES = [
  { id: "off", label: "⏹️ Standard Flat Workspace", desc: "Classic zero-tilt 2D desktop workspace" },
  { id: "ambilux_xdr_halo", label: "🌈 Ambilux XDR Bias Backlight Halo", desc: "Projects a dynamic Display-P3 ambient bias-light halo around the File Manager stage" },
  { id: "stage_manager_3d_tilt", label: "🖥️ macOS Stage Manager 3D Perspective", desc: "Subtle 3D architectural perspective stage with floating depth shadow and specular bezel" },
  { id: "coverflow_3d_reflection", label: "💿 3D CoverFlow Mirror Floor Reflection", desc: "Polished obsidian studio floor reflection with theatrical spotlighting" },
  { id: "anamorphic_cinema_letterbox", label: "🎬 2.39:1 Anamorphic Cinema Director Stage", desc: "Panavision widescreen director framing with horizontal anamorphic lens flare rim" },
  { id: "isometric_architect_table", label: "📐 Isometric CAD Light-Table Tilt", desc: "Precision drafting light-table perspective with vernier scale edge markers" },
  { id: "holodeck_grid_horizon", label: "🛸 Year 3000 Holodeck Laser Grid Horizon", desc: "Futuristic 3D holodeck horizon grid with volumetric cyan/gold emitter rails" },
  { id: "holiday_snowglobe_dome", label: "🎄 Festive Glass Snowglobe & Garland Stage", desc: "Enchanted holiday snowglobe crystal dome with warm C9 fairy-light garland border" },
];

/**
 * 8 Interactive Holographic Pointer Reveal & 120Hz Cursor Trail Modes (`data-cursor-trail`, shortcut `Alt+T` / `⌥T`).
 * Uses `@property --fm-spot-inner` & `--fm-spot-outer` radial-gradient masks (`interactive-content-reveal`) + GPU trail particles.
 */
export const CURSOR_TRAIL_MODES = [
  { id: "off", label: "⏹️ Standard OS Pointer (Off)", glyphs: [], desc: "Standard native OS pointer with zero trail or spotlight overlay" },
  { id: "holo_prism_spotlight", label: "💎 Prismatic Foil Reveal Spotlight", glyphs: ["✦", "✧", "💠"], desc: "Reveals a holographic rainbow foil circuit lattice under your pointer via @property radial mask interpolation" },
  { id: "stardust_comet_tail", label: "✨ 120Hz Stardust Comet Trail", glyphs: ["✨", "⋆", "✦", "·"], desc: "Leaves a shimmering wake of golden-cyan stardust particles as your pointer glides across folders" },
  { id: "flash_2advanced_crosshair", label: "🎯 Flash 3000 Vector Telemetry Reticle", glyphs: ["⌖", "⊹", "⏣"], desc: "2Advanced Studios vector locking crosshair with live pointer spotlight and tactical telemetry ticks" },
  { id: "matrix_digital_wake", label: "🟩 Matrix Katakana Digital Wake", glyphs: ["ｱ", "ｶ", "ｻ", "0", "1", "⚡"], desc: "Spawns cascading emerald katakana and hex code glyphs in the wake of your cursor" },
  { id: "cyber_plasma_arc", label: "⚡ Tesla Plasma Arc Wake", glyphs: ["⚡", "✦", "◈"], desc: "Crackling high-voltage violet and cyan plasma nodes trailing your pointer" },
  { id: "sakura_petal_breeze", label: "🌸 Kyoto Sakura Petal Breeze", glyphs: ["🌸", "💮", "🍃"], desc: "Gentle drifting cherry-blossom petals stirred by pointer velocity" },
  { id: "holiday_magic_wand", label: "🎄 Holiday Magic Sparkler Wand", glyphs: ["🎄", "❄️", "✨", "🎁", "🌟"], desc: "Festive seasonal sparklers, snowflakes, and holiday crests trailing your pointer" },
];

/**
 * 6 Spring-Loaded 3D Folder Hover & Peek Behaviors (`data-folder-spring`).
 */
export const FOLDER_SPRING_MODES = [
  { id: "off", label: "⏹️ Standard Folder Rows", desc: "Classic flat folder hover state" },
  { id: "macos_spring_loaded", label: "🍎 macOS Spring-Loaded Folder Pop", desc: "Folders pop forward in 3D space with a double-pulse spring animation and glowing tab lip when hovered" },
  { id: "spatial_glass_extrude", label: "🥽 visionOS Spatial Glass Extrusion", desc: "Multi-layer parallax glass depth shadow with floating specular folder badge elevation" },
  { id: "magnetic_dock_magnify", label: "🧲 macOS Dock Neighbor Magnification", desc: "Hovered folder row and adjacent sibling rows smoothly scale along a bell-curve like the macOS Dock" },
  { id: "xray_content_wireframe", label: "🔬 X-Ray Blueprint Folder Peek", desc: "Reveals a glowing technical blueprint grid and micro-telemetry rim inside hovered folder rows" },
  { id: "holiday_gift_unwrap", label: "🎁 Holiday Ribbon Shimmer & Unwrap", desc: "Festive gold silk ribbon bow shimmer and warm ornament glow on hovered folders" },
];

/**
 * 8 Procedural 8K Desktop Wallpaper Backplate Scenes (`data-wallpaper-scene`, shortcut `Alt+W` / `⌥W`).
 * Provides rich multi-stop architectural & horizon depth behind translucent glass/liquid/mica themes.
 */
export const DESKTOP_WALLPAPER_SCENES = [
  { id: "off", label: "⏹️ Solid Theme Canvas (Off)", desc: "Pure theme background color without a procedural scenic backplate" },
  { id: "sequoia_redwood_dawn", label: "🌲 macOS Sequoia Redwood Dawn Horizon", desc: "Layered mountain silhouettes with warm golden-hour rim light and misty valleys" },
  { id: "tahoe_alpine_lake", label: "🏔️ macOS Tahoe Emerald Alpine Lake", desc: "Crystal cobalt-emerald lake reflections with sunlit Sierra granite peaks" },
  { id: "win11_bloom_sculpture", label: "🪟 Windows 11 Silk Bloom Sculpture", desc: "Flowing cobalt-azure 3D satin folds with soft volumetric studio lighting" },
  { id: "tokyo_neon_rain_alley", label: "🏮 Neo-Tokyo Cyber Rain Horizon", desc: "Outrun magenta/cyan neon skyline reflections on wet obsidian pavement" },
  { id: "cern_quantum_chamber", label: "⚛️ CERN LHC Detector Cavern", desc: "Concentric golden particle-detector rings with Cherenkov blue core glow" },
  { id: "deep_space_jwst_pillars", label: "🔭 JWST Pillars of Creation Nebula", desc: "Deep-field infrared gold & crimson cosmic dust pillars with diffraction spikes" },
  { id: "holiday_winter_village", label: "🎄 Enchanted Holiday Winter Village", desc: "Warm candlelit alpine cottages, snow-covered pines, and northern lights" },
];

/**
 * 8 Master AAA Director's Cut Presets (`AAA_DIRECTOR_CUT_PRESETS`, shortcut `Alt+M` / `⌥M`).
 * Orchestrates all 10 visual, spatial, icon, filter, and audio engines simultaneously in a single click.
 */
export const AAA_DIRECTOR_CUT_PRESETS = [
  {
    id: "cupertino_keynote_xdr",
    label: "🍎 Cupertino Keynote M4 Max XDR Master",
    desc: "Mac Studio M4 Ultra palette + Tahoe 3D Glass icons + Aqua Glass finish + Stage Manager 3D tilt + Tahoe Lake wallpaper + Apple HIG Taptic sound",
    palette: "mac_studio_m4_ultra",
    uiElementFx: "tahoe_glass_folders",
    iconPackStyle: "macos_tahoe_3d",
    iconFinishMode: "macos_aqua_glass",
    themeIconAnimation: "folder_3d_spin_turntable",
    themeIconGlow: "xdr_specular",
    screenFilter: "pro_display_xdr_vivid",
    workspaceStageMode: "stage_manager_3d_tilt",
    cursorTrailMode: "holo_prism_spotlight",
    folderSpringMode: "macos_spring_loaded",
    desktopWallpaperScene: "tahoe_alpine_lake",
    uiSoundProfile: "apple_hig_tactile",
  },
  {
    id: "win11_fluent_workstation",
    label: "🪟 Windows 11 Fluent Studio Master",
    desc: "Windows 11 Acrylic + Fluent 3D folders + Fluent Acrylic finish + Ambilux XDR halo + Silk Bloom wallpaper + Mechanical Thock sound",
    palette: "tahoe_studio_3d",
    uiElementFx: "fluent_mica_folders",
    iconPackStyle: "win11_fluent_pro",
    iconFinishMode: "win11_fluent_acrylic",
    themeIconAnimation: "spring_pop_3d",
    themeIconGlow: "ambient_p3",
    screenFilter: "off",
    workspaceStageMode: "ambilux_xdr_halo",
    cursorTrailMode: "stardust_comet_tail",
    folderSpringMode: "spatial_glass_extrude",
    desktopWallpaperScene: "win11_bloom_sculpture",
    uiSoundProfile: "mechanical_thock_pro",
  },
  {
    id: "flash_2advanced_3000",
    label: "⚡ 2Advanced Studios Year-3000 Master",
    desc: "Prism Reactor + Flash 3000 Vector HUD + 2Advanced Vector motion + Holodeck Grid stage + Vector Telemetry Reticle + OP-1 Synth sound",
    palette: "prism_reactor",
    uiElementFx: "flash_3000_vector_hud",
    iconPackStyle: "cyberdeck_matrix_hud",
    iconFinishMode: "holographic_collector_grade",
    themeIconAnimation: "flash_2advanced_vector_hud",
    themeIconGlow: "neon",
    screenFilter: "hologram_pepper_ghost",
    workspaceStageMode: "holodeck_grid_horizon",
    cursorTrailMode: "flash_2advanced_crosshair",
    folderSpringMode: "xray_content_wireframe",
    desktopWallpaperScene: "cern_quantum_chamber",
    uiSoundProfile: "teenage_synth_op1",
  },
  {
    id: "c4d_mograph_director",
    label: "🎬 Cinema 4D & Octane Render Studio Master",
    desc: "Pro Display XDR + C4D MoGraph Extrude folders + Cloner Wave 3D + DaVinci ACEScct grade + CoverFlow 3D floor + IMAX Foley sound",
    palette: "m4_pro_display_xdr",
    uiElementFx: "c4d_mograph_extrude_folders",
    iconPackStyle: "creative_cinema_8k",
    iconFinishMode: "pro_titanium_anodized",
    themeIconAnimation: "c4d_mograph_cloner_wave",
    themeIconGlow: "xdr_specular",
    screenFilter: "davinci_aces_cct_grade",
    workspaceStageMode: "coverflow_3d_reflection",
    cursorTrailMode: "stardust_comet_tail",
    folderSpringMode: "magnetic_dock_magnify",
    desktopWallpaperScene: "sequoia_redwood_dawn",
    uiSoundProfile: "cinema_sub_boom",
  },
  {
    id: "blade_runner_crt_noir",
    label: "📺 Blade Runner 2049 Analog CRT Master",
    desc: "Tokyo Night + Holo Glitch UI + Sony Trinitron CRT filter + Anamorphic 2.39:1 stage + Matrix Digital Wake + 1984 Coin-Op Arcade sound",
    palette: "tokyo_night",
    uiElementFx: "holo_glitch",
    iconPackStyle: "synthwave_outrun_1984",
    iconFinishMode: "neumorphic_tactile_studio",
    themeIconAnimation: "cyber_glitch_pulse",
    themeIconGlow: "neon",
    screenFilter: "crt_trinitron_95",
    workspaceStageMode: "anamorphic_cinema_letterbox",
    cursorTrailMode: "matrix_digital_wake",
    folderSpringMode: "xray_content_wireframe",
    desktopWallpaperScene: "tokyo_neon_rain_alley",
    uiSoundProfile: "retro_crt_arcade",
  },
  {
    id: "godmode_omega_pantheon",
    label: "🌌 God-Mode Year 3000 Omega Pantheon Master",
    desc: "Omega Point Singularity + Omega Halo UI + Omni-Pantheon 3D icons + Raytraced Caustic motion + JWST Nebula wallpaper + LCARS Bridge sound",
    palette: "omega_point_singularity",
    uiElementFx: "godmode_omega_halo",
    iconPackStyle: "godmode_omni_pantheon",
    iconFinishMode: "holographic_collector_grade",
    themeIconAnimation: "raytraced_caustic_refraction",
    themeIconGlow: "hyper",
    screenFilter: "octane_spectral_iridescence",
    workspaceStageMode: "holodeck_grid_horizon",
    cursorTrailMode: "cyber_plasma_arc",
    folderSpringMode: "spatial_glass_extrude",
    desktopWallpaperScene: "deep_space_jwst_pillars",
    uiSoundProfile: "scifi_lcars_bridge",
  },
  {
    id: "holiday_winter_wonderland",
    label: "🎄 Grand Holiday Winter Wonderland Master",
    desc: "Christmas Nutcracker Hearth + Festive C9 Garland + Holiday Ornament finish + Snowglobe Dome stage + Magic Sparkler Wand + Sleigh Bell Chimes",
    palette: "holiday_christmas_nutcracker_hearth",
    uiElementFx: "holiday_festive_glow",
    iconPackStyle: "us_holidays_festive",
    iconFinishMode: "holiday_grand_celebration",
    themeIconAnimation: "godmode_pantheon_ascend",
    themeIconGlow: "hyper",
    screenFilter: "dreamcore_bloom_soft",
    workspaceStageMode: "holiday_snowglobe_dome",
    cursorTrailMode: "holiday_magic_wand",
    folderSpringMode: "holiday_gift_unwrap",
    desktopWallpaperScene: "holiday_winter_village",
    uiSoundProfile: "holiday_chimes_festive",
  },
  {
    id: "holiday_july4_spectacular",
    label: "🎆 Grand 4th of July Fireworks Master",
    desc: "4th of July Sky Fireworks + Houdini VEX Particle Burst + Holiday Ornament finish + Ambilux XDR Halo + Stardust Comet Trail + Celesta Chimes",
    palette: "holiday_fourth_of_july_fireworks",
    uiElementFx: "holiday_festive_glow",
    iconPackStyle: "us_holidays_festive",
    iconFinishMode: "holiday_grand_celebration",
    themeIconAnimation: "houdini_vex_particle_burst",
    themeIconGlow: "hyper",
    screenFilter: "pro_display_xdr_vivid",
    workspaceStageMode: "ambilux_xdr_halo",
    cursorTrailMode: "holiday_magic_wand",
    folderSpringMode: "holiday_gift_unwrap",
    desktopWallpaperScene: "deep_space_jwst_pillars",
    uiSoundProfile: "holiday_chimes_festive",
  },
  {
    id: "bauhaus_atelier_master",
    label: "🔺 Bauhaus Dessau 1923 Atelier Master",
    desc: "Studio Architect Minimal + Bauhaus Primary Icons + Cupertino Ceramic Bevel + Isometric Architect Table + Teenage Synth OP-1 sound",
    palette: "studio_architect_minimal",
    uiElementFx: "cupertino_ceramic_bevel",
    iconPackStyle: "bauhaus_primary",
    iconFinishMode: "neumorphic_tactile_studio",
    themeIconAnimation: "folder_3d_flip_origami",
    themeIconGlow: "subtle",
    screenFilter: "kodachrome_64_film",
    workspaceStageMode: "isometric_architect_table",
    cursorTrailMode: "flash_2advanced_crosshair",
    folderSpringMode: "macos_spring_loaded",
    desktopWallpaperScene: "win11_bloom_sculpture",
    uiSoundProfile: "teenage_synth_op1",
  },
  {
    id: "kyoto_ukiyoe_master",
    label: "🌊 Kyoto Ukiyo-e Woodblock & Sumi Master",
    desc: "Kyoto Zen Karesansui + Ukiyo-e Woodblock Icons + Kyoto Washi Sumi Folders + Sakura Petal Breeze + Apple HIG Tactile sound",
    palette: "kyoto_zen_karesansui_day",
    uiElementFx: "kyoto_washi_sumi",
    iconPackStyle: "ukiyoe_woodblock",
    iconFinishMode: "neumorphic_tactile_studio",
    themeIconAnimation: "levitate_float",
    themeIconGlow: "subtle",
    screenFilter: "nano_texture_matte_glass",
    workspaceStageMode: "stage_manager_3d_tilt",
    cursorTrailMode: "sakura_petal_breeze",
    folderSpringMode: "macos_spring_loaded",
    desktopWallpaperScene: "tahoe_alpine_lake",
    uiSoundProfile: "apple_hig_tactile",
  },
  {
    id: "art_deco_metropolis_master",
    label: "🏛️ 1929 Art Deco Metropolis Gold Master",
    desc: "Art Deco Metropolis 1929 + Art Deco Gold Icons + Swiss Sapphire Chronograph + Ambilux XDR Halo + Stardust Comet Tail + Cinema Sub Boom",
    palette: "art_deco_metropolis_1929",
    uiElementFx: "swiss_sapphire_chronograph",
    iconPackStyle: "art_deco_gold",
    iconFinishMode: "pro_titanium_anodized",
    themeIconAnimation: "clockwork_gear_tick",
    themeIconGlow: "xdr_specular",
    screenFilter: "imax_70mm_anamorphic",
    workspaceStageMode: "ambilux_xdr_halo",
    cursorTrailMode: "stardust_comet_tail",
    folderSpringMode: "magnetic_dock_magnify",
    desktopWallpaperScene: "cern_quantum_chamber",
    uiSoundProfile: "cinema_sub_boom",
  },
  {
    id: "mariana_biolum_master",
    label: "🪼 Mariana Abyssal Bioluminescence Master",
    desc: "Mariana Bioluminescent Trench + Deep-Sea Biolum Icons + Void Tentacles + Underwater Aquatic Refraction + Holo Prism Spotlight",
    palette: "mariana_bioluminescent_trench",
    uiElementFx: "void_tentacles",
    iconPackStyle: "deep_sea_biolum",
    iconFinishMode: "holographic_collector_grade",
    themeIconAnimation: "heartbeat_biolum",
    themeIconGlow: "hyper",
    screenFilter: "underwater_aquatic_refraction",
    workspaceStageMode: "coverflow_3d_reflection",
    cursorTrailMode: "holo_prism_spotlight",
    folderSpringMode: "spatial_glass_extrude",
    desktopWallpaperScene: "tahoe_alpine_lake",
    uiSoundProfile: "scifi_lcars_bridge",
  },
];

/** Studio Colorist Kelvin White-Point & OLED Mastering Modes (`data-color-temp`). */
export const COLOR_TEMP_MODES = [
  { id: "neutral_6500k", label: "⚖️ D65 Neutral (6500K)", kelvin: 6500, tint: "transparent", mixPct: 0, desc: "Calibrated D65 reference white point — zero color temperature shift" },
  { id: "candle_2700k", label: "🕯️ Candlelight Warm (2700K)", kelvin: 2700, tint: "#ff8c24", mixPct: 14, desc: "Deep amber 2700K candlelight warmth for late-night eye comfort" },
  { id: "golden_hour_3500k", label: "🌅 Golden Hour (3500K)", kelvin: 3500, tint: "#f59e0b", mixPct: 10, desc: "Warm tungsten-gold 3500K sunset grade in perceptual OKLab space" },
  { id: "halogen_4300k", label: "💡 Studio Halogen (4300K)", kelvin: 4300, tint: "#fbbf24", mixPct: 7, desc: "Balanced 4300K analog gallery halogen illumination" },
  { id: "daylight_d50_5000k", label: "☀️ Print Daylight D50 (5000K)", kelvin: 5000, tint: "#fef08a", mixPct: 5, desc: "ISO 3664 D50 prepress & editorial warm-daylight standard" },
  { id: "cyber_cool_7500k", label: "❄️ Cyber Cool (7500K)", kelvin: 7500, tint: "#38bdf8", mixPct: 9, desc: "Crisp 7500K overcast cyan-blue engineering grade" },
  { id: "arctic_blue_9300k", label: "🧊 CRT 9300K Japanese Broadcast", kelvin: 9300, tint: "#60a5fa", mixPct: 14, desc: "Classic 9300K Sony Trinitron broadcast blue-white point" },
  { id: "oled_true_black", label: "⚫ OLED True-Black Pitch Mastering", kelvin: 6500, tint: "#000000", mixPct: 45, desc: "Deepens dark theme backgrounds toward #000000 zero-nit OLED pitch black while preserving AAA text contrast" },
];

/** Color-Vision Deficiency (Daltonism) & Forced-Contrast Accessibility Modes (`data-vision-mode`). */
export const COLOR_VISION_MODES = [
  { id: "off", label: "👁️ Standard Vision (Off)", svgFilter: "", desc: "Standard full-spectrum color rendering" },
  { id: "protanopia_safe", label: "🔴 Protanopia Safe (Red-Weak)", svgFilter: "url(#fm-vision-protanopia)", desc: "Simulates & reinforces semantic contrast + non-color badges for Protanopia (red-cone deficiency)" },
  { id: "deuteranopia_safe", label: "🟢 Deuteranopia Safe (Green-Weak)", svgFilter: "url(#fm-vision-deuteranopia)", desc: "Simulates & reinforces semantic contrast + non-color badges for Deuteranopia (green-cone deficiency)" },
  { id: "tritanopia_safe", label: "🔵 Tritanopia Safe (Blue-Weak)", svgFilter: "url(#fm-vision-tritanopia)", desc: "Simulates & reinforces semantic contrast + non-color badges for Tritanopia (blue-yellow deficiency)" },
  { id: "achromatopsia_mono", label: "⚪ Achromatopsia Monochrome Proof", svgFilter: "url(#fm-vision-achromatopsia)", desc: "Pure luminance-only grayscale proof to verify value hierarchy without relying on hue" },
  { id: "high_contrast_aaa", label: "🛡️ WCAG AAA High-Contrast Guard", svgFilter: "", desc: "Reinforces all component borders (≥ 3:1), focus rings, and text legibility (≥ 7:1) with non-color state indicators" },
];

/** Classical Color Theory Harmony Chords (`computeColorHarmonyChord`). */
export const COLOR_HARMONY_CHORDS = [
  { id: "complementary", label: "🎯 Complementary (180°)", angles: [0, 180], desc: "Classical 180° opponent hue pair for maximum focal punch" },
  { id: "split_complementary", label: "🔱 Split-Complementary (150°/210°)", angles: [0, 150, 210], desc: "Nuanced 150° & 210° dual-counterpoint without harsh tension" },
  { id: "triadic", label: "🔺 Triadic (120°/240°)", angles: [0, 120, 240], desc: "Equilateral 120° color wheel triad for balanced studio vibrancy" },
  { id: "analogous", label: "🌊 Analogous (±32°)", angles: [0, 32, 328], desc: "Adjacent-hue atmospheric gradient harmony" },
  { id: "tetradic_studio", label: "💠 Tetradic Cinema (90°/180°/270°)", angles: [0, 90, 180, 270], desc: "Four-point Hollywood colorist chord (teal/amber/violet/emerald)" },
  { id: "monochromatic_xdr", label: "💎 Monochromatic XDR", angles: [0, 0], desc: "Single-hue architectural tonal scale mixed in perceptual OKLab space" },
  { id: "golden_ratio_phi", label: "🌀 Golden Ratio φ (137.5°)", angles: [0, 137.5, 275], desc: "Phyllotaxis golden-angle (137.508°) hue dispersion for zero visual fatigue" },
];

/** Modular Theme Aspects that can be grafted independently (`graftThemeAspect`). */
export const THEME_GRAFT_ASPECTS = [
  { id: "colors", label: "🎨 Graft Colors Only", desc: "Steal ONLY the color palette from this theme while keeping your current 3D folders, icons & atmosphere" },
  { id: "folders", label: "🔥 Graft 3D Folders & Surface", desc: "Steal ONLY the 3D folder shader & glass surface from this theme onto your current colors" },
  { id: "icons", label: "🎭 Graft Icon Pack & Motion", desc: "Steal ONLY the custom icon pack, icon glow & 3D icon choreography from this theme" },
  { id: "atmosphere", label: "🌌 Graft Atmosphere Weather", desc: "Steal ONLY the live 120Hz canvas weather/particle layers from this theme" },
  { id: "typography", label: "🔤 Graft Typography & Corners", desc: "Steal ONLY the font pairing & corner geometry from this theme" },
];

/** Dual-Pane "Source vs. Target" Active Focus Spotlight Modes (`data-dual-focus`). */
export const DUAL_PANE_FOCUS_MODES = [
  { id: "off", label: "⏹️ Off", desc: "Equal visual weight on both panes in dual-pane mode" },
  { id: "spotlight", label: "🔦 Active Pane Spotlight", desc: "Illuminates the active pane with a crisp accent border while subtly dimming the inactive target pane" },
  { id: "neon_rim", label: "⚡ Neon Source Rim", desc: "High-contrast Display-P3 neon rim around the active source pane with glowing header telemetry" },
  { id: "dim_inactive", label: "🌑 Dim Inactive Pane", desc: "Desaturates and lowers opacity on the inactive pane so you never mix up left vs. right" },
  { id: "source_target_badges", label: "🏷️ Source / Target HUD Badges", desc: "Displays explicit SOURCE (ACTIVE) and TARGET HUD badges in dual-pane headers with accent rims" },
];

/** Chameleon Folder Mood — Auto-Accent by Folder Contents (`data-chameleon-mood`). */
export const CHAMELEON_FOLDER_MOODS = [
  { id: "off", label: "⏹️ Off", accent: "", glow: "", badge: "", desc: "Keep theme's standard accent color in every folder" },
  { id: "auto", label: "🦎 Auto-Detect by Folder Contents", accent: "auto", glow: "auto", badge: "🦎 Auto Mood", desc: "Automatically shifts accent glow based on dominant files in the active folder (Code, Media, Data, Docs, Archives, Security)" },
  { id: "code", label: "💻 Code & Engineering", accent: "#38bdf8", glow: "rgba(56, 189, 248, 0.34)", badge: "💻 Code Mood", desc: "Electric cyan-indigo engineering accent for source code & repositories" },
  { id: "media", label: "🎬 Media, Photos & Audio", accent: "#f472b6", glow: "rgba(244, 114, 182, 0.34)", badge: "🎬 Media Mood", desc: "Vibrant magenta-coral studio accent for photography, video, and audio folders" },
  { id: "data", label: "📊 Data, AI & Databases", accent: "#34d399", glow: "rgba(52, 211, 153, 0.34)", badge: "📊 Data & AI Mood", desc: "Emerald-mint telemetry accent for datasets, SQLite/DuckDB, and AI model weights" },
  { id: "docs", label: "📑 Documents & Publishing", accent: "#fbbf24", glow: "rgba(251, 191, 36, 0.32)", badge: "📑 Docs Mood", desc: "Warm amber editorial accent for Markdown, PDFs, notes, and office documents" },
  { id: "archives", label: "📦 Archives & Packages", accent: "#a78bfa", glow: "rgba(167, 139, 250, 0.34)", badge: "📦 Archive Mood", desc: "Royal violet accent for compressed bundles, disk images, and installers" },
  { id: "security", label: "🔐 Keys, Vaults & Config", accent: "#fb7185", glow: "rgba(251, 113, 133, 0.34)", badge: "🔐 Vault Mood", desc: "Crimson-rose tactical accent for SSH keys, certificates, and encrypted vaults" },
];

/** Smart Unfocused Window & Battery Zero-Watt Governor Modes (`data-zero-watt-mode`). */
export const ZERO_WATT_GOVERNOR_MODES = [
  { id: "auto", label: "🔋 Smart Zero-Watt (Auto Pause on Blur)", desc: "Runs at full 120Hz while focused and automatically pauses GPU shaders & infinite CSS animations when the window is unfocused or minimized (0.0% idle GPU)" },
  { id: "always_120hz", label: "🚀 Always Uncapped 120Hz", desc: "Keeps all background shaders and animations running continuously even when the window is in the background" },
  { id: "eco_saver", label: "🍃 Battery Eco Saver (Always Paused)", desc: "Pauses continuous background particle loops and infinite CSS animations immediately to maximize laptop battery life" },
];

export const THEME_HISTORY_LIMIT = 25;
let themeHistoryUndoStack = [];
let themeHistoryRedoStack = [];
let isRestoringThemeHistory = false;
let isWindowCurrentlyFocused = true;
let zeroWattListenersBound = false;

const CHAMELEON_EXT_BUCKETS = {
  code: new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "c", "cpp", "h", "hpp", "java", "zig", "swift", "kt", "sh", "bash", "zsh", "css", "scss", "html", "vue", "svelte", "lua", "rb", "php"]),
  media: new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "heic", "svg", "ico", "bmp", "tiff", "raw", "cr2", "nef", "mp4", "mov", "mkv", "webm", "avi", "mp3", "wav", "flac", "ogg", "m4a", "aac", "aiff"]),
  data: new Set(["json", "jsonl", "csv", "tsv", "parquet", "arrow", "db", "sqlite", "sqlite3", "duckdb", "sql", "gguf", "safetensors", "onnx", "pt", "pth", "ipynb", "xml", "yaml", "yml", "toml"]),
  docs: new Set(["md", "markdown", "txt", "pdf", "doc", "docx", "rtf", "epub", "pages", "odt", "tex", "org", "rst", "pptx", "xlsx"]),
  archives: new Set(["zip", "tar", "gz", "tgz", "bz2", "xz", "zst", "7z", "rar", "dmg", "iso", "pkg", "deb", "rpm", "appimage", "msi", "exe"]),
  security: new Set(["pem", "key", "crt", "cer", "pub", "gpg", "asc", "sig", "env", "kdbx", "vault", "p12", "pfx"]),
};

/** Ensures the interactive pointer reveal spotlight & cursor trail overlay (`#fm-cursor-spotlight-layer`) is mounted and bound. */
let cursorTrailBound = false;
let lastTrailParticleTs = 0;
let lastCursorStyleTs = 0;

export function ensureCursorSpotlightLayer(activeMode = "off") {
  if (typeof document === "undefined" || !document.body) return null;
  let layer = document.getElementById("fm-cursor-spotlight-layer");
  if (!activeMode || activeMode === "off") {
    if (layer) layer.remove();
    return null;
  }
  if (!layer) {
    layer = h("div", {
      id: "fm-cursor-spotlight-layer",
      class: "fm-cursor-spotlight-layer is-active",
      "aria-hidden": "true",
      "data-trail-mode": activeMode,
    });
    document.body.append(layer);
  } else {
    layer.classList.add("is-active");
    layer.setAttribute("data-trail-mode", activeMode);
  }
  if (!cursorTrailBound && typeof window !== "undefined") {
    cursorTrailBound = true;
    window.addEventListener("pointermove", (e) => {
      const mode = document.documentElement?.dataset?.cursorTrail || "off";
      if (mode === "off") return;
      const now = Date.now();
      const w = Math.max(1, window.innerWidth || 1280);
      const hPx = Math.max(1, window.innerHeight || 800);
      const xPct = ((e.clientX / w) * 100).toFixed(2);
      const yPct = ((e.clientY / hPx) * 100).toFixed(2);
      const activeLayer = document.getElementById("fm-cursor-spotlight-layer");
      if (activeLayer) {
        activeLayer.style.setProperty("--fm-mouse-x", `${xPct}%`);
        activeLayer.style.setProperty("--fm-mouse-y", `${yPct}%`);
      }
      if (now - lastCursorStyleTs >= 16) {
        lastCursorStyleTs = now;
        document.documentElement?.style?.setProperty("--fm-mouse-x", `${xPct}%`);
        document.documentElement?.style?.setProperty("--fm-mouse-y", `${yPct}%`);
      }
      if (now - lastTrailParticleTs >= 36) {
        lastTrailParticleTs = now;
        spawnCursorTrailParticle(e.clientX, e.clientY, mode);
      }
    }, { passive: true });
  }
  return layer;
}

/** Spawns a single GPU-composited cursor trail particle at `(clientX, clientY)` for the active `CURSOR_TRAIL_MODES` mode. */
export function spawnCursorTrailParticle(clientX = 240, clientY = 180, modeOverride) {
  if (typeof document === "undefined" || !document.body) return null;
  const modeId = modeOverride || document.documentElement?.dataset?.cursorTrail || state.settings?.cursorTrailMode || "off";
  const spec = CURSOR_TRAIL_MODES.find((m) => m.id === modeId);
  if (!spec || spec.id === "off" || !spec.glyphs?.length) return null;
  const layer = ensureCursorSpotlightLayer(spec.id);
  if (!layer) return null;
  const glyph = spec.glyphs[Math.floor(Math.random() * spec.glyphs.length)] || "✨";
  const dx = ((Math.random() - 0.5) * 34).toFixed(1);
  const dy = (-14 - Math.random() * 28).toFixed(1);
  const particle = h("span", {
    class: "fm-cursor-trail-particle",
    "data-trail-glyph": glyph,
    style: `left:${Math.round(clientX)}px;top:${Math.round(clientY)}px;--trail-dx:${dx}px;--trail-dy:${dy}px;--fm-trail-dx:${dx}px;--fm-trail-dy:${dy}px;`,
  }, glyph);
  layer.append(particle);
  while (layer.childNodes.length > 28) {
    layer.firstChild?.remove();
  }
  if (typeof setTimeout === "function") {
    setTimeout(() => {
      if (particle.parentNode) particle.remove();
    }, 650);
  }
  return particle;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Ensures the hidden SVG displacement filter bank (`#fm-svg-distortion-filters`) is present in the DOM for screen-melting & optical warp effects. */
export function ensureDistortionSvgFilters() {
  if (typeof document === "undefined" || !document.body) return null;
  let svg = document.getElementById("fm-svg-distortion-filters");
  if (svg) return svg;
  svg = h("div", {
    id: "fm-svg-distortion-filters",
    "aria-hidden": "true",
    style: "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;z-index:-1;",
  },
    svgEl("svg", { xmlns: SVG_NS, width: "0", height: "0" },
      svgEl("defs", {},
        svgEl("filter", { id: "fm-filter-screen-melt", x: "-8%", y: "-8%", width: "116%", height: "124%" },
          svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: "0.012 0.045", numOctaves: "1", seed: "7", result: "meltNoise" }),
          svgEl("feDisplacementMap", { in: "SourceGraphic", in2: "meltNoise", scale: "5", xChannelSelector: "R", yChannelSelector: "G" }),
        ),
        svgEl("filter", { id: "fm-filter-molten-glass", x: "-6%", y: "-6%", width: "112%", height: "118%" },
          svgEl("feTurbulence", { type: "turbulence", baseFrequency: "0.02 0.06", numOctaves: "1", seed: "19", result: "lavaNoise" }),
          svgEl("feDisplacementMap", { in: "SourceGraphic", in2: "lavaNoise", scale: "4.5", xChannelSelector: "R", yChannelSelector: "B" }),
        ),
        svgEl("filter", { id: "fm-filter-liquid-ripple", x: "-5%", y: "-5%", width: "110%", height: "110%" },
          svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: "0.025 0.025", numOctaves: "1", seed: "3", result: "rippleNoise" }),
          svgEl("feDisplacementMap", { in: "SourceGraphic", in2: "rippleNoise", scale: "3.5", xChannelSelector: "G", yChannelSelector: "R" }),
        ),
        svgEl("filter", { id: "fm-vision-protanopia" },
          svgEl("feColorMatrix", { type: "matrix", values: "0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0" }),
        ),
        svgEl("filter", { id: "fm-vision-deuteranopia" },
          svgEl("feColorMatrix", { type: "matrix", values: "0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0" }),
        ),
        svgEl("filter", { id: "fm-vision-tritanopia" },
          svgEl("feColorMatrix", { type: "matrix", values: "0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0" }),
        ),
        svgEl("filter", { id: "fm-vision-achromatopsia" },
          svgEl("feColorMatrix", { type: "matrix", values: "0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0" }),
        ),
      ),
    ),
  );
  document.body.append(svg);
  return svg;
}

/** Applies File Manager UI Element FX (burning folders, dripping slime, screen-melting distortion, etc.), Custom Icon Pack, Typography, Corner Geometry, Icon Glow, Icon Animation Choreography, Screen Filter, Computer Icon Finish, 3D Stage Mode, Cursor Trail, Folder Spring, and Desktop Wallpaper Scene to the root element. */
export function applyUiImmersionProfiles(overrides = {}) {
  if (typeof document === "undefined" || !document.documentElement) return;
  const root = document.documentElement;
  const isPreview = root.dataset.palette === "preview";
  const s = { ...(state.settings ?? {}), ...overrides };
  const fxLockedOff = !isPreview && Boolean(s.themeFxOff);
  if (fxLockedOff) {
    clearEffects();
  }
  const themeElFx = fxLockedOff ? "" : (root.getAttribute("data-fx-element") || "");
  const themeIconPack = fxLockedOff ? "" : (root.getAttribute("data-fx-icon-pack") || "");
  const themeFontProf = fxLockedOff ? "" : (root.getAttribute("data-fx-font-profile") || "");
  const themeCornerProf = fxLockedOff ? "" : (root.getAttribute("data-fx-corner-profile") || "");
  const themeIconGlow = fxLockedOff ? "" : (root.getAttribute("data-fx-icon-glow") || "");
  const themeIconAnim = fxLockedOff ? "" : (root.getAttribute("data-fx-icon-anim") || "");
  const themeScreenFilter = fxLockedOff ? "" : (root.getAttribute("data-fx-screen-filter") || "");

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

  const explicitFilterOff = overrides && Object.prototype.hasOwnProperty.call(overrides, "screenFilter") && overrides.screenFilter === "off";
  const rawFilter = (overrides && Object.prototype.hasOwnProperty.call(overrides, "screenFilter")) ? overrides.screenFilter : (isPreview ? "off" : (s.screenFilter || "off"));
  const effectiveFilter = explicitFilterOff ? "off" : (rawFilter !== "off" ? rawFilter : (themeScreenFilter || "off"));
  if (effectiveFilter && effectiveFilter !== "off") {
    root.dataset.screenFilter = effectiveFilter;
    root.setAttribute("data-fx-screen-filter", effectiveFilter);
  } else {
    delete root.dataset.screenFilter;
    root.removeAttribute("data-fx-screen-filter");
  }

  // Sync Holiday Celebration Crest & Garland state when a `holiday_*` theme is active
  const activePaletteKey = root.dataset.palette || "";
  const holidaySpec = fxLockedOff ? null : resolveHolidayCrestForPalette(activePaletteKey);
  if (holidaySpec) {
    root.dataset.holidayTheme = "active";
    root.dataset.holidayCrest = holidaySpec.crest;
    root.dataset.holidayBadge = holidaySpec.badge;
    root.dataset.osHolidayOptimized = (root.dataset.platform === "windows" || root.dataset.platform === "linux")
      ? "zero_readback"
      : "metal_xdr";
  } else {
    delete root.dataset.holidayTheme;
    delete root.dataset.holidayCrest;
    delete root.dataset.holidayBadge;
    delete root.dataset.osHolidayOptimized;
  }

  // Sync Computer Icon Material Finish (`data-icon-finish`)
  const rawFinish = (overrides && Object.prototype.hasOwnProperty.call(overrides, "iconFinishMode"))
    ? overrides.iconFinishMode
    : (s.iconFinishMode || (holidaySpec ? "holiday_grand_celebration" : ""));
  if (rawFinish && rawFinish !== "off") {
    root.dataset.iconFinish = rawFinish;
  } else {
    delete root.dataset.iconFinish;
  }

  // Sync 3D Workspace Stage Mode (`data-stage-mode`)
  const rawStage = (overrides && Object.prototype.hasOwnProperty.call(overrides, "workspaceStageMode"))
    ? overrides.workspaceStageMode
    : (s.workspaceStageMode || "off");
  if (rawStage && rawStage !== "off") {
    root.dataset.stageMode = rawStage;
  } else {
    delete root.dataset.stageMode;
  }

  // Sync Tactile UI Soundscape (`data-sound-profile`)
  const rawSound = (overrides && Object.prototype.hasOwnProperty.call(overrides, "uiSoundProfile"))
    ? overrides.uiSoundProfile
    : (s.uiSoundProfile || "off");
  if (rawSound && rawSound !== "off") {
    root.dataset.soundProfile = rawSound;
  } else {
    delete root.dataset.soundProfile;
  }

  // Sync Interactive Pointer Reveal & Cursor Trail (`data-cursor-trail`)
  const rawTrail = (overrides && Object.prototype.hasOwnProperty.call(overrides, "cursorTrailMode"))
    ? overrides.cursorTrailMode
    : (s.cursorTrailMode || "off");
  if (rawTrail && rawTrail !== "off") {
    root.dataset.cursorTrail = rawTrail;
    ensureCursorSpotlightLayer(rawTrail);
  } else {
    delete root.dataset.cursorTrail;
    ensureCursorSpotlightLayer("off");
  }

  // Sync Spring-Loaded 3D Folder Peek (`data-folder-spring`)
  const rawSpring = (overrides && Object.prototype.hasOwnProperty.call(overrides, "folderSpringMode"))
    ? overrides.folderSpringMode
    : (s.folderSpringMode || "off");
  if (rawSpring && rawSpring !== "off") {
    root.dataset.folderSpring = rawSpring;
  } else {
    delete root.dataset.folderSpring;
  }

  // Sync Procedural 8K Desktop Wallpaper Backplate (`data-wallpaper-scene`)
  const rawWallpaper = (overrides && Object.prototype.hasOwnProperty.call(overrides, "desktopWallpaperScene"))
    ? overrides.desktopWallpaperScene
    : (s.desktopWallpaperScene || "off");
  if (rawWallpaper && rawWallpaper !== "off") {
    root.dataset.wallpaperScene = rawWallpaper;
  } else {
    delete root.dataset.wallpaperScene;
  }

  // Sync Dual-Pane Active vs. Target Focus Spotlight (`data-dual-focus`)
  const rawDualFocus = (overrides && Object.prototype.hasOwnProperty.call(overrides, "dualPaneFocusMode"))
    ? overrides.dualPaneFocusMode
    : (s.dualPaneFocusMode || "spotlight");
  if (rawDualFocus && rawDualFocus !== "off") {
    root.dataset.dualFocus = rawDualFocus;
  } else {
    delete root.dataset.dualFocus;
  }

  // Sync Chameleon Folder Mood (`data-chameleon-mood`)
  const rawChameleon = (overrides && Object.prototype.hasOwnProperty.call(overrides, "chameleonFolderMode"))
    ? overrides.chameleonFolderMode
    : (s.chameleonFolderMode || "off");
  syncChameleonFolderMood(overrides?.entries, overrides?.folderPath, rawChameleon);

  // Sync Smart Unfocused Window & Battery Zero-Watt Governor (`data-zero-watt-mode`)
  const rawZeroWatt = (overrides && Object.prototype.hasOwnProperty.call(overrides, "zeroWattGovernorMode"))
    ? overrides.zeroWattGovernorMode
    : (s.zeroWattGovernorMode || "auto");
  root.dataset.zeroWattMode = rawZeroWatt;
  applyZeroWattGovernorToDom(rawZeroWatt);

  // Sync Studio Colorist Kelvin White-Point & OLED Mastering (`data-color-temp`)
  const rawColorTemp = (overrides && Object.prototype.hasOwnProperty.call(overrides, "colorTempMode"))
    ? overrides.colorTempMode
    : (s.colorTempMode || "neutral_6500k");
  const tempSpec = COLOR_TEMP_MODES.find((m) => m.id === rawColorTemp) || COLOR_TEMP_MODES[0];
  if (tempSpec && tempSpec.id !== "neutral_6500k") {
    root.dataset.colorTemp = tempSpec.id;
    root.style.setProperty("--fm-temp-tint", tempSpec.tint);
    root.style.setProperty("--fm-temp-mix", `${tempSpec.mixPct}%`);
    root.style.setProperty("--fm-temp-kelvin", `${tempSpec.kelvin}K`);
  } else {
    delete root.dataset.colorTemp;
    root.style.removeProperty("--fm-temp-tint");
    root.style.removeProperty("--fm-temp-mix");
    root.style.removeProperty("--fm-temp-kelvin");
  }

  // Sync Color-Vision Deficiency (Daltonism) & AAA High-Contrast Accessibility Guard (`data-vision-mode`)
  const rawVisionMode = (overrides && Object.prototype.hasOwnProperty.call(overrides, "colorVisionMode"))
    ? overrides.colorVisionMode
    : (s.colorVisionMode || "off");
  const visionSpec = COLOR_VISION_MODES.find((m) => m.id === rawVisionMode) || COLOR_VISION_MODES[0];
  if (visionSpec && visionSpec.id !== "off") {
    root.dataset.visionMode = visionSpec.id;
    if (visionSpec.svgFilter) {
      ensureDistortionSvgFilters();
    }
  } else {
    delete root.dataset.visionMode;
  }

  // Sync Deep Sub-Studio Theme Tokens (Code Editor, Markdown Preview, Database Studio)
  syncSubStudioThemeTokens();

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
  const hw = probeClientHardware();
  root.dataset.platform = platform;
  root.dataset.arch = hw.arch || "x64";
  root.dataset.compositor = platform === "macos"
    ? "metal_promotion_120hz"
    : platform === "windows"
      ? (hw.arch === "arm64" ? "directcomposition_arm64" : "directcomposition_dx12")
      : (hw.arch === "arm64" ? "webkitgtk_arm64" : "webkitgtk_gl");
  if (root.classList) {
    root.classList.toggle("rad-linux", platform === "linux");
    root.classList.toggle("rad-windows", platform === "windows");
    root.classList.toggle("rad-macos", platform === "macos");
    root.classList.toggle("rad-win-arm64", platform === "windows" && hw.arch === "arm64");
    root.classList.toggle("rad-linux-arm64", platform === "linux" && hw.arch === "arm64");
  }
  if (root.dataset.holidayTheme === "active" || (root.dataset.palette || "").startsWith("holiday_")) {
    root.dataset.osHolidayOptimized = (platform === "windows" || platform === "linux") ? "zero_readback" : "metal_xdr";
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

/** Probes client OS platform (macOS / Windows / Linux), CPU architecture (ARM64 Apple Silicon M4 Pro vs x64), VM renderer (Parallels / VirtIO / Hyper-V / VMware), GPU, display gamut/HDR, and accessibility constraints. */
export function probeClientHardware(navOverride, winOverride) {
  const hasOverride = Boolean(navOverride || winOverride);
  if (!hasOverride && cachedHw) return cachedHw;
  const nav = navOverride || (typeof navigator !== "undefined" ? navigator : {});
  const win = winOverride || (typeof window !== "undefined" ? window : {});
  const mm = (q) => {
    try { return typeof win.matchMedia === "function" && win.matchMedia(q).matches; }
    catch { return false; }
  };
  let gpu = "";
  try {
    if (!hasOverride && typeof document !== "undefined" && !/jsdom/i.test(nav.userAgent || "")) {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "") : String(gl.getParameter(gl.RENDERER) || "");
      }
    }
  } catch {}
  const rawUa = `${nav.userAgent || ""} ${nav.platform || ""} ${nav.userAgentData?.architecture || ""} ${nav.userAgentData?.platform || ""}`.toLowerCase();
  const cleanUa = rawUa.replace(/like\s+android/g, "");
  const metaPlatform = !hasOverride && typeof document !== "undefined" ? (document.querySelector('meta[name="fm-platform"]')?.content || "").toLowerCase() : "";
  const platform = metaPlatform === "linux" || (/\blinux\b|\bx11\b|\bwayland\b|\bubuntu\b/.test(cleanUa) && !/\bandroid\b/.test(cleanUa))
    ? "linux"
    : metaPlatform === "win32" || metaPlatform === "windows" || /\bwin(dows|32|64|nt)\b/.test(cleanUa)
      ? "windows"
      : "macos";
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 8;
  const mem = typeof nav.deviceMemory === "number" ? nav.deviceMemory : 8;
  const dpr = typeof win.devicePixelRatio === "number" ? win.devicePixelRatio : 1;
  const arch = /\b(arm64|aarch64|apple\s*m[1-9]|apple\s*silicon)\b/.test(`${cleanUa} ${gpu.toLowerCase()}`) || (platform === "macos" && dpr >= 2 && cores >= 6)
    ? "arm64"
    : "x64";
  const isVm = /parallels|virtio|virgl|vmware|virtualbox|vbox|hyper-v|qemu|qxl|llvmpipe|softpipe/i.test(`${gpu} ${cleanUa}`);
  const isWindowsArm = platform === "windows" && arch === "arm64";
  const isLinuxArm = platform === "linux" && arch === "arm64";
  const isAppleSiliconHost = (platform === "macos" && arch === "arm64") || ((isWindowsArm || isLinuxArm) && (isVm || cores >= 8 || mem >= 16));
  const p3 = mm("(color-gamut: p3)");
  const hdr = mm("(dynamic-range: high)");
  const reducedMotion = mm("(prefers-reduced-motion: reduce)");
  const reducedTransparency = mm("(prefers-reduced-transparency: reduce)");
  const forcedColors = mm("(forced-colors: active)");
  const saveData = Boolean(nav.connection?.saveData);
  const swGpu = /basic render driver|microsoft basic|\bwarp\b|d3d11 warp|gdi generic|rdpudd|citrix/i.test(gpu);
  const shouldFallback = forcedColors || reducedTransparency || saveData || swGpu || (cores > 0 && cores <= 2) || (mem > 0 && mem <= 2);
  const ultra = !shouldFallback && (/apple\s+m[1-9]|apple\s+silicon|apple\s+gpu|parallels\s+display|virgl|virtio[\s-]*gpu|venus|mesa.*(radv|nvk|iris|anv|radeonsi)|rtx\s*[2345]\d{2,3}|radeon\s+rx\s+[6789]\d{2,3}|intel.*arc\s+[ab]\d{3}|adreno\s+x1|snapdragon\s+x/i.test(gpu) || (p3 && hdr && cores >= 8) || (platform === "macos" && cores >= 6) || (platform === "linux" && cores >= 6) || (platform === "windows" && cores >= 6));
  const compositor = platform === "macos"
    ? "metal_promotion_120hz"
    : platform === "windows"
      ? (isWindowsArm ? "directcomposition_arm64" : "directcomposition_dx12")
      : (isLinuxArm ? "webkitgtk_arm64" : "webkitgtk_gl");
  const recommendedAtmoTier = shouldFallback
    ? "low"
    : platform === "macos"
      ? (ultra ? "ultra" : "high")
      : platform === "windows"
        ? (cores <= 4 ? "medium" : "high")
        : (cores <= 4 ? "low" : "medium");
  const result = {
    platform,
    arch,
    isVm,
    isWindowsArm,
    isLinuxArm,
    isAppleSiliconHost,
    compositor,
    recommendedAtmoTier,
    tier: shouldFallback ? "low" : ultra ? "ultra" : (cores >= 6 || p3 || dpr >= 1.5) ? "high" : "balanced",
    fxMode: (forcedColors || swGpu) ? "off" : (shouldFallback || reducedMotion) ? "reduced" : "on",
    shouldFallback,
    gpu,
    p3,
    hdr,
  };
  if (!hasOverride) cachedHw = result;
  return result;
}

/**
 * 1-Click Cross-Platform Hardware Optimization Presets for macOS (Apple Silicon Metal / ProMotion XDR),
 * Windows 11/10 & Windows ARM64 on M4 Pro (DirectX 12 / DirectComposition WebView2), and Linux / Ubuntu (WebKitGTK & Parallels Desktop VM).
 */
export const OPTIMIZE_PLATFORM_PRESETS = [
  {
    id: "macos",
    label: "🍎 Optimize for Mac",
    title: "Optimize for macOS Apple Silicon M1–M4 Pro/Max/Ultra (Metal 3 Zero-Readback Compositor · 120Hz ProMotion & Display-P3 XDR)",
    atmosphereTier: "ultra",
    compositor: "metal_promotion_120hz",
    holidayFastPath: "metal_xdr",
    canvasBlendMode: "screen",
  },
  {
    id: "windows",
    label: "🪟 Optimize for Windows",
    title: "Optimize for Windows 11/10 & Windows ARM64 on Apple Silicon M4 Pro / Parallels (DirectX 12 · DirectComposition WebView2 Zero-Readback Compositor · 60–120 FPS Locked)",
    atmosphereTier: "high",
    compositor: "directcomposition_dx12",
    holidayFastPath: "zero_readback",
    canvasBlendMode: "source-over",
  },
  {
    id: "linux",
    label: "🐧 Optimize for Linux / VM",
    title: "Optimize for Ubuntu Linux, Wayland/X11 & Parallels/VirtIO VM (WebKitGTK Zero-Readback Compositor · 60 FPS Locked)",
    atmosphereTier: "medium",
    compositor: "webkitgtk_gl",
    holidayFastPath: "zero_readback",
    canvasBlendMode: "source-over",
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
let lastPaintedKey = null;
let keptEffectsForKey = null;
let keptEffectsSnapshot = null;
let keepCurrentIconsLock = false;
let lockedIconsSnapshot = null;

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
  if (suppressedFxKinds.has("screenFilter")) {
    root.removeAttribute("data-fx-screen-filter");
    root.removeAttribute("data-screen-filter");
    if (root.dataset) delete root.dataset.screenFilter;
    if (state.settings) state.settings.screenFilter = "off";
  }
  if (suppressedFxKinds.has("iconFinishMode")) {
    if (root.dataset) delete root.dataset.iconFinish;
    if (state.settings) state.settings.iconFinishMode = "off";
  }
  if (suppressedFxKinds.has("workspaceStageMode")) {
    if (root.dataset) delete root.dataset.stageMode;
    if (state.settings) state.settings.workspaceStageMode = "off";
  }
  if (suppressedFxKinds.has("cursorTrailMode")) {
    if (root.dataset) delete root.dataset.cursorTrail;
    if (state.settings) state.settings.cursorTrailMode = "off";
    ensureCursorSpotlightLayer("off");
  }
  if (suppressedFxKinds.has("folderSpringMode")) {
    if (root.dataset) delete root.dataset.folderSpring;
    if (state.settings) state.settings.folderSpringMode = "off";
  }
  if (suppressedFxKinds.has("desktopWallpaperScene")) {
    if (root.dataset) delete root.dataset.wallpaperScene;
    if (state.settings) state.settings.desktopWallpaperScene = "off";
  }
  if (suppressedFxKinds.has("uiSoundProfile")) {
    if (root.dataset) delete root.dataset.soundProfile;
    if (state.settings) state.settings.uiSoundProfile = "off";
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

function isThemeFxLockedOff(key) {
  if (key === "preview") return false;
  return Boolean(state.settings?.themeFxOff) || Boolean(plainStaticLockKey && key && plainStaticLockKey === key);
}

/** Puts a theme's color variables on the page. `key` marks which saved theme it is ("preview" while editing). */
export function paint(theme, key) {
  if (key && key !== "preview" && suppressedFxForKey && suppressedFxForKey !== key) {
    resetSuppressedFx();
  }
  const switchingKey = Boolean(key && key !== "preview" && key !== lastPaintedKey);
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

  const fxLockedOff = isThemeFxLockedOff(key);
  if (fxLockedOff && key && key !== "preview") {
    plainStaticLockKey = key;
  }

  const activeKeptSnap = (keepCurrentEffectsLock && lockedEffectsSnapshot)
    ? lockedEffectsSnapshot
    : (keptEffectsForKey !== null && keptEffectsForKey === key && keptEffectsSnapshot ? keptEffectsSnapshot : null);

  if (activeKeptSnap && !fxLockedOff) {
    const accentHex = theme.vars?.accent || "#38bdf8";
    const secondaryHex = theme.vars?.selected || theme.vars?.accent || "#a855f7";
    if (activeKeptSnap.fxCss) {
      const style = document.createElement("style");
      style.id = "fm-theme-effects";
      const nonce = document.querySelector('meta[name="fm-nonce"]')?.content;
      if (nonce) style.setAttribute("nonce", nonce);
      style.textContent = activeKeptSnap.fxCss
        .replace(/--fx-glow-color\s*:\s*[^;]+/g, `--fx-glow-color:${accentHex}`)
        .replace(/--fx-glow-color-2\s*:\s*[^;]+/g, `--fx-glow-color-2:${secondaryHex}`);
      document.head.append(style);
    }
    for (const [attrName, attrVal] of Object.entries(activeKeptSnap.fxAttrs || {})) {
      root.setAttribute(attrName, attrVal);
    }
    if (keepCurrentEffectsLock) root.dataset.keepFxLock = "true";
    if (keepCurrentIconsLock) root.dataset.keepIconsLock = "true";
    if (state.settings) {
      state.settings.atmosphere = activeKeptSnap.atmosphere || "none";
      state.settings.uiElementFx = activeKeptSnap.uiElementFx || "off";
      state.settings.iconPackStyle = activeKeptSnap.iconPackStyle || "default";
      state.settings.themeIconGlow = activeKeptSnap.themeIconGlow || "off";
      state.settings.themeIconAnimation = activeKeptSnap.themeIconAnimation || "off";
      state.settings.themeFontProfile = activeKeptSnap.themeFontProfile || "default";
      state.settings.themeCornerProfile = activeKeptSnap.themeCornerProfile || "default";
      if (activeKeptSnap.screenFilter) state.settings.screenFilter = activeKeptSnap.screenFilter;
      if (activeKeptSnap.iconFinishMode) state.settings.iconFinishMode = activeKeptSnap.iconFinishMode;
      if (activeKeptSnap.workspaceStageMode) state.settings.workspaceStageMode = activeKeptSnap.workspaceStageMode;
      if (activeKeptSnap.cursorTrailMode) state.settings.cursorTrailMode = activeKeptSnap.cursorTrailMode;
      if (activeKeptSnap.folderSpringMode) state.settings.folderSpringMode = activeKeptSnap.folderSpringMode;
      if (activeKeptSnap.desktopWallpaperScene) state.settings.desktopWallpaperScene = activeKeptSnap.desktopWallpaperScene;
      if (activeKeptSnap.uiSoundProfile) state.settings.uiSoundProfile = activeKeptSnap.uiSoundProfile;
    }
  } else if (theme.effects && !fxLockedOff) {
    const style = document.createElement("style");
    style.id = "fm-theme-effects";
    const nonce = document.querySelector('meta[name="fm-nonce"]')?.content;
    if (nonce) style.setAttribute("nonce", nonce);
    style.textContent = `:root { ${theme.effects.css} }${theme.effects.customCss ? `\n${theme.effects.customCss}` : ""}`;
    document.head.append(style);
    for (const [name, value] of Object.entries(theme.effects.attrs)) root.setAttribute(name, value);
    root.setAttribute("data-fx-tier", hw.tier);
    if (hw.fxMode !== "on") root.setAttribute("data-fx", hw.fxMode);
    if (switchingKey && state.settings) {
      if (theme.effects.attrs["data-fx-element"]) state.settings.uiElementFx = "auto";
      if (!keepCurrentIconsLock) {
        if (theme.effects.attrs["data-fx-icon-pack"]) state.settings.iconPackStyle = "default";
        if (theme.effects.attrs["data-fx-icon-glow"]) state.settings.themeIconGlow = "off";
        if (theme.effects.attrs["data-fx-icon-anim"]) state.settings.themeIconAnimation = "off";
      }
      if (theme.effects.attrs["data-fx-font-profile"]) state.settings.themeFontProfile = "default";
      if (theme.effects.attrs["data-fx-corner-profile"]) state.settings.themeCornerProfile = "default";
      if (theme.effects.attrs["data-fx-atmosphere"]) state.settings.atmosphere = "none";
    }
  }
  if (keepCurrentIconsLock && lockedIconsSnapshot && state.settings) {
    state.settings.iconPackStyle = lockedIconsSnapshot.iconPackStyle || state.settings.iconPackStyle || "default";
    state.settings.themeIconGlow = lockedIconsSnapshot.themeIconGlow || state.settings.themeIconGlow || "off";
    state.settings.themeIconAnimation = lockedIconsSnapshot.themeIconAnimation || state.settings.themeIconAnimation || "off";
    root.dataset.keepIconsLock = "true";
  }
  if (key && key === suppressedFxForKey) {
    applySuppressedFxToDom(root);
  }
  if (key && key !== "preview") {
    lastPaintedKey = key;
  }
  applyUiImmersionProfiles(
    fxLockedOff || (key && key === suppressedFxForKey && suppressedFxKinds.has("uiElementFx"))
      ? { uiElementFx: "off" }
      : undefined,
  );
  if (key && key === suppressedFxForKey) {
    applySuppressedFxToDom(root);
  }
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

export async function themeList() {
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
  {
    id: "flash_3000_2advanced_kit",
    label: "⚡ Futuristic Flash 3000 (2Advanced HUD)",
    desc: "2000s FWA / 2Advanced Flash UI hyper-evolved for Year 3000: chamfered vector HUD folder doors, laser targeting reticles & kinetic 120Hz icon sweeps",
    palette: "cyberpunk_hologram",
    uiElementFx: "flash_3000_vector_hud",
    iconPackStyle: "cyberdeck_matrix_hud",
    themeIconAnimation: "flash_2advanced_vector_hud",
    themeFontProfile: "scifi",
    themeCornerProfile: "chamfered",
    themeIconGlow: "hyper",
    atmosphere: "hud_reticle+laser_show+circuit_traces",
  },
  {
    id: "spinning_3d_holo_vault_kit",
    label: "🌪️ High-End 3D Spinning Folder Turntable",
    desc: "Built for M4 Max / Ultra & RTX high-end machines: 120Hz 3D spinning folder turntables, holographic foil icons & raytraced 4D tesseract depth",
    palette: "photonic_metamaterial_3099",
    uiElementFx: "spinning_3d_holo_folders",
    iconPackStyle: "holo_prismatic_foil",
    themeIconAnimation: "folder_3d_spin_turntable",
    themeFontProfile: "scifi",
    themeCornerProfile: "squircle_hig",
    themeIconGlow: "hyper",
    atmosphere: "m4_raytrace_prism+prism_spectrum+tesseract_4d",
  },
];

/** Applies a 1-Click Jumpstart Workstation Kit (theme palette + 3D folder FX + picture/icon pack + typography + corners + atmosphere). */
export async function applyJumpstartKit(kitId) {
  const kit = JUMPSTART_WORKSTATION_KITS.find((k) => k.id === kitId);
  if (!kit) return null;
  pushThemeHistorySnapshot();
  plainStaticLockKey = null;
  if (state.settings) state.settings.themeFxOff = false;
  const patch = {
    palette: kit.palette,
    themeFxOff: false,
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
  pushThemeHistorySnapshot(patch, kit.label);
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

/**
 * Applies one of the 6 Professional Computer Icon Material Finishes (`COMPUTER_ICON_FINISH_MODES`)
 * to `document.documentElement.dataset.iconFinish` and persists `state.settings.iconFinishMode`.
 */
export async function applyComputerIconFinish(modeId, opts = {}) {
  const clean = String(modeId || "").trim();
  const found = COMPUTER_ICON_FINISH_MODES.find((m) => m.id === clean) || null;
  const resolvedId = found ? found.id : "off";
  if (state.settings) state.settings.iconFinishMode = resolvedId;
  applyUiImmersionProfiles({ iconFinishMode: resolvedId });
  await saveSettings({ iconFinishMode: resolvedId });
  if (!opts.quiet) {
    toast(found ? `Computer Icon Finish: ${found.label}` : "Computer Icon Finish reset to theme default.", { kind: "info" });
  }
  return found || { id: "off", label: "Default Finish" };
}

/** Cycles through the 6 Professional Computer Icon Material Finishes (`COMPUTER_ICON_FINISH_MODES`). */
export async function cycleComputerIconFinish(delta = 1, opts = {}) {
  const cur = (typeof document !== "undefined" && document.documentElement?.dataset?.iconFinish) || state.settings?.iconFinishMode || "";
  const idx = COMPUTER_ICON_FINISH_MODES.findIndex((m) => m.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = idx < 0 ? 0 : (idx + step + COMPUTER_ICON_FINISH_MODES.length) % COMPUTER_ICON_FINISH_MODES.length;
  const chosen = COMPUTER_ICON_FINISH_MODES[nextIdx] || COMPUTER_ICON_FINISH_MODES[0];
  return applyComputerIconFinish(chosen.id, opts);
}

/**
 * Resolves the closest or matching US Holiday theme from `HOLIDAY_CELEBRATION_CATALOG` for any calendar `Date`
 * (or `{ month, day }` object), enabling 1-click "📅 Match Today's Holiday" celebration mode.
 */
export function detectCalendarHolidayTheme(dateOrSpec = new Date()) {
  let month = 12;
  let day = 25;
  if (dateOrSpec instanceof Date && !Number.isNaN(dateOrSpec.getTime())) {
    month = dateOrSpec.getMonth() + 1;
    day = dateOrSpec.getDate();
  } else if (dateOrSpec && typeof dateOrSpec === "object") {
    month = Number(dateOrSpec.month) || 12;
    day = Number(dateOrSpec.day) || 25;
  }
  const targetDayOfYear = month * 31 + day;
  let best = HOLIDAY_CELEBRATION_CATALOG[0];
  let bestDist = Infinity;
  for (const item of HOLIDAY_CELEBRATION_CATALOG) {
    const itemDayOfYear = item.month * 31 + item.day;
    const directDist = Math.abs(itemDayOfYear - targetDayOfYear);
    const wrapDist = Math.min(directDist, 372 - directDist);
    if (wrapDist < bestDist) {
      bestDist = wrapDist;
      best = item;
    }
  }
  return best;
}

/**
 * Triggers a GPU-composited Holiday Celebration Particle Burst (`#fm-holiday-celebration-burst`)
 * with bespoke holiday emblems (`🥂`, `💝`, `☘️`, `🎆`, `🎃`, `🦃`, `🕎`, `🎄`, etc.).
 */
export function triggerHolidayCelebrationBurst(holidayKeyOrOpts = {}) {
  const rawKey = typeof holidayKeyOrOpts === "string"
    ? holidayKeyOrOpts
    : (holidayKeyOrOpts?.key || (typeof document !== "undefined" ? document.documentElement?.dataset?.palette : "") || "holiday_christmas_nutcracker_hearth");
  const spec = HOLIDAY_THEME_CRESTS[rawKey] || HOLIDAY_THEME_CRESTS.holiday_christmas_nutcracker_hearth;
  const isWinOrLinux = typeof document !== "undefined" && (document.documentElement?.dataset?.platform === "windows" || document.documentElement?.dataset?.platform === "linux");
  const defaultCount = isWinOrLinux ? 12 : 18;
  const count = Math.max(8, Math.min(36, Number(holidayKeyOrOpts?.count) || defaultCount));
  if (typeof document !== "undefined" && document.body) {
    document.getElementById("fm-holiday-celebration-burst")?.remove();
    const container = h("div", {
      id: "fm-holiday-celebration-burst",
      class: "fm-holiday-celebration-burst",
      "data-holiday-burst-key": rawKey,
      "data-holiday-crest": spec.crest,
      "aria-hidden": "true",
    });
    for (let i = 0; i < count; i++) {
      const glyph = spec.particles[i % spec.particles.length] || spec.crest;
      const leftPct = Math.round(((i + 0.5) / count) * 96 + ((i * 17) % 5) - 2);
      const delayMs = (i * 55) % 650;
      const durMs = 1550 + ((i * 130) % 900);
      const driftPx = ((i % 2 === 0 ? 1 : -1) * (18 + ((i * 11) % 44)));
      const p = h("span", {
        class: "fm-holiday-burst-particle",
        "data-particle-glyph": glyph,
        style: `left:${leftPct}%;animation-delay:${delayMs}ms;animation-duration:${durMs}ms;--holiday-drift-x:${driftPx}px;`,
      }, glyph);
      container.append(p);
    }
    document.body.append(container);
    setTimeout(() => {
      if (container.parentNode) container.remove();
    }, 2800);
  }
  try {
    triggerReactiveImpulse(1.25);
  } catch {}
  return {
    key: rawKey,
    crest: spec.crest,
    badge: spec.badge,
    label: spec.label,
    anim: spec.anim,
    particleCount: count,
  };
}

/**
 * Applies one of the 18 Super-Special US Holiday Themes (`holiday_*`) with its bespoke 3D icon choreography,
 * festive C9 fairy-light toolbar garland, animated folder crest badges, and celebration burst!
 */
export async function applyHolidayCelebrationTheme(holidayKey, opts = {}) {
  const target = HOLIDAY_CELEBRATION_CATALOG.find((hItem) => hItem.key === holidayKey)
    || detectCalendarHolidayTheme(opts.date || new Date());
  if (!target) return null;
  pushThemeHistorySnapshot();
  await chooseTheme(target.key, { skipHistory: true });
  await applyPalette(target.key);
  const patch = {
    palette: target.key,
    themeFxOff: false,
    uiElementFx: "holiday_festive_glow",
    iconPackStyle: "us_holidays_festive",
    themeIconAnimation: target.anim,
    iconFinishMode: "holiday_grand_celebration",
  };
  if (state.settings) Object.assign(state.settings, patch);
  applyUiImmersionProfiles(patch);
  await saveSettings(patch);
  pushThemeHistorySnapshot(patch, target.label);
  if (opts.burst !== false) {
    triggerHolidayCelebrationBurst(target.key);
  }
  if (state.settings?.uiSoundProfile && state.settings.uiSoundProfile !== "off") {
    playUiSound("celebrate");
  }
  if (!opts.quiet) {
    toast(`${target.crest} Holiday Special Activated: ${target.label} (${target.anim})`, { kind: "success" });
  }
  return target;
}

/** Cycles through all 18 Super-Special US Holiday Themes (`holiday_*`) in calendar order (`Alt+H` / `⌥H`). */
export async function cycleHolidayTheme(delta = 1, opts = {}) {
  const curKey = (typeof document !== "undefined" && document.documentElement?.dataset?.palette) || state.settings?.palette || "";
  const curIdx = HOLIDAY_CELEBRATION_CATALOG.findIndex((item) => item.key === curKey);
  const step = Number(delta) || 1;
  const nextIdx = curIdx < 0
    ? 0
    : (curIdx + step + HOLIDAY_CELEBRATION_CATALOG.length) % HOLIDAY_CELEBRATION_CATALOG.length;
  const chosen = HOLIDAY_CELEBRATION_CATALOG[nextIdx] || HOLIDAY_CELEBRATION_CATALOG[0];
  return applyHolidayCelebrationTheme(chosen.key, opts);
}

let sharedAudioCtx = null;

/** Synthesizes a zero-asset procedural WebAudio UI sound effect for the active `UI_SOUND_PROFILES` profile. */
export function playUiSound(eventType = "click", opts = {}) {
  const profileId = opts.profile || state.settings?.uiSoundProfile || (typeof document !== "undefined" ? document.documentElement?.dataset?.soundProfile : "") || "off";
  const spec = UI_SOUND_PROFILES.find((p) => p.id === profileId) || UI_SOUND_PROFILES[0];
  if (!spec || spec.id === "off") {
    return { played: false, profile: "off", eventType, freqHz: 0 };
  }
  const base = Number(spec.baseFreq) || 440;
  const mult = eventType === "celebrate" ? 1.5
    : eventType === "theme" ? 1.25
    : eventType === "folder" ? 1.12
    : eventType === "hover" ? 0.88
    : 1;
  const freqHz = Math.round(base * mult);
  try {
    const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    if (AudioCtx) {
      if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
      const ctx = sharedAudioCtx;
      const now = ctx.currentTime || 0;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = spec.wave || "sine";
      osc.frequency.setValueAtTime(freqHz, now);
      if (eventType === "celebrate" || spec.id === "holiday_chimes_festive") {
        osc.frequency.exponentialRampToValueAtTime(freqHz * 1.33, now + 0.11);
      }
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.125);
    }
  } catch {}
  return { played: true, profile: spec.id, eventType, freqHz };
}

/** Sets the active Procedural WebAudio Tactile Soundscape profile (`UI_SOUND_PROFILES`). */
export async function setUiSoundProfile(profileId, opts = {}) {
  const spec = UI_SOUND_PROFILES.find((p) => p.id === profileId) || UI_SOUND_PROFILES[0];
  if (state.settings) state.settings.uiSoundProfile = spec.id;
  applyUiImmersionProfiles({ uiSoundProfile: spec.id });
  await saveSettings({ uiSoundProfile: spec.id });
  if (spec.id !== "off" && !opts.quiet) {
    playUiSound("theme", { profile: spec.id });
    toast(`Tactile UI Soundscape: ${spec.label}`, { kind: "info" });
  }
  return spec;
}

/** Cycles through the 8 Procedural WebAudio Tactile Soundscape profiles (`UI_SOUND_PROFILES`). */
export async function cycleUiSoundProfile(delta = 1, opts = {}) {
  const cur = state.settings?.uiSoundProfile || (typeof document !== "undefined" ? document.documentElement?.dataset?.soundProfile : "") || "off";
  const idx = UI_SOUND_PROFILES.findIndex((p) => p.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + UI_SOUND_PROFILES.length) % UI_SOUND_PROFILES.length;
  return setUiSoundProfile(UI_SOUND_PROFILES[nextIdx].id, opts);
}

/** Applies one of the 8 Interactive 3D Desktop Stage & Ambilux Backlight modes (`WORKSPACE_STAGE_MODES`). */
export async function applyWorkspaceStageMode(modeId, opts = {}) {
  const spec = WORKSPACE_STAGE_MODES.find((m) => m.id === modeId) || WORKSPACE_STAGE_MODES[0];
  if (state.settings) state.settings.workspaceStageMode = spec.id;
  applyUiImmersionProfiles({ workspaceStageMode: spec.id });
  await saveSettings({ workspaceStageMode: spec.id });
  if (!opts.quiet) {
    toast(`3D Workspace Stage: ${spec.label}`, { kind: "info" });
  }
  return spec;
}

/** Cycles through the 8 Interactive 3D Desktop Stage & Ambilux Backlight modes (`Alt+S` / `⌥S`). */
export async function cycleWorkspaceStageMode(delta = 1, opts = {}) {
  const cur = (typeof document !== "undefined" && document.documentElement?.dataset?.stageMode) || state.settings?.workspaceStageMode || "off";
  const idx = WORKSPACE_STAGE_MODES.findIndex((m) => m.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + WORKSPACE_STAGE_MODES.length) % WORKSPACE_STAGE_MODES.length;
  return applyWorkspaceStageMode(WORKSPACE_STAGE_MODES[nextIdx].id, opts);
}

/** Applies one of the 8 Interactive Holographic Pointer Reveal & 120Hz Cursor Trail modes (`CURSOR_TRAIL_MODES`). */
export async function applyCursorTrailMode(modeId, opts = {}) {
  const spec = CURSOR_TRAIL_MODES.find((m) => m.id === modeId) || CURSOR_TRAIL_MODES[0];
  if (state.settings) state.settings.cursorTrailMode = spec.id;
  applyUiImmersionProfiles({ cursorTrailMode: spec.id });
  await saveSettings({ cursorTrailMode: spec.id });
  if (spec.id !== "off" && opts.spawnSample !== false) {
    spawnCursorTrailParticle(320, 200, spec.id);
  }
  if (!opts.quiet) {
    toast(`Pointer Spotlight & Trail: ${spec.label}`, { kind: "info" });
  }
  return spec;
}

/** Cycles through the 8 Interactive Holographic Pointer Reveal & 120Hz Cursor Trail modes (`Alt+T` / `⌥T`). */
export async function cycleCursorTrailMode(delta = 1, opts = {}) {
  const cur = (typeof document !== "undefined" && document.documentElement?.dataset?.cursorTrail) || state.settings?.cursorTrailMode || "off";
  const idx = CURSOR_TRAIL_MODES.findIndex((m) => m.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + CURSOR_TRAIL_MODES.length) % CURSOR_TRAIL_MODES.length;
  return applyCursorTrailMode(CURSOR_TRAIL_MODES[nextIdx].id, opts);
}

/** Applies one of the 6 Spring-Loaded 3D Folder Hover & Peek modes (`FOLDER_SPRING_MODES`). */
export async function applyFolderSpringMode(modeId, opts = {}) {
  const spec = FOLDER_SPRING_MODES.find((m) => m.id === modeId) || FOLDER_SPRING_MODES[0];
  if (state.settings) state.settings.folderSpringMode = spec.id;
  applyUiImmersionProfiles({ folderSpringMode: spec.id });
  await saveSettings({ folderSpringMode: spec.id });
  if (!opts.quiet) {
    toast(`3D Folder Spring Mode: ${spec.label}`, { kind: "info" });
  }
  return spec;
}

/** Cycles through the 6 Spring-Loaded 3D Folder Hover & Peek modes (`FOLDER_SPRING_MODES`). */
export async function cycleFolderSpringMode(delta = 1, opts = {}) {
  const cur = (typeof document !== "undefined" && document.documentElement?.dataset?.folderSpring) || state.settings?.folderSpringMode || "off";
  const idx = FOLDER_SPRING_MODES.findIndex((m) => m.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + FOLDER_SPRING_MODES.length) % FOLDER_SPRING_MODES.length;
  return applyFolderSpringMode(FOLDER_SPRING_MODES[nextIdx].id, opts);
}

/** Applies one of the 8 Procedural 8K Desktop Wallpaper Backplate Scenes (`DESKTOP_WALLPAPER_SCENES`). */
export async function applyDesktopWallpaperScene(sceneId, opts = {}) {
  const spec = DESKTOP_WALLPAPER_SCENES.find((s) => s.id === sceneId) || DESKTOP_WALLPAPER_SCENES[0];
  if (state.settings) state.settings.desktopWallpaperScene = spec.id;
  applyUiImmersionProfiles({ desktopWallpaperScene: spec.id });
  await saveSettings({ desktopWallpaperScene: spec.id });
  if (!opts.quiet) {
    toast(`8K Desktop Wallpaper Scene: ${spec.label}`, { kind: "info" });
  }
  return spec;
}

/** Cycles through the 8 Procedural 8K Desktop Wallpaper Backplate Scenes (`Alt+W` / `⌥W`). */
export async function cycleDesktopWallpaperScene(delta = 1, opts = {}) {
  const cur = (typeof document !== "undefined" && document.documentElement?.dataset?.wallpaperScene) || state.settings?.desktopWallpaperScene || "off";
  const idx = DESKTOP_WALLPAPER_SCENES.findIndex((s) => s.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + DESKTOP_WALLPAPER_SCENES.length) % DESKTOP_WALLPAPER_SCENES.length;
  return applyDesktopWallpaperScene(DESKTOP_WALLPAPER_SCENES[nextIdx].id, opts);
}

// =====================================================================================================================
// UPGRADE 1: ⏪ 25-Step Theme & Random-Roll Undo / Redo History Stack
// =====================================================================================================================

function buildLookHistorySignature(snap) {
  if (!snap || typeof snap !== "object") return "";
  return [
    snap.palette || "",
    snap.themeFxOff ? "1" : "0",
    snap.uiElementFx || "off",
    snap.iconPackStyle || "default",
    snap.iconFinishMode || "off",
    snap.themeFontProfile || "default",
    snap.themeCornerProfile || "default",
    snap.themeIconGlow || "off",
    snap.themeIconAnimation || "off",
    snap.screenFilter || "off",
    snap.workspaceStageMode || "off",
    snap.cursorTrailMode || "off",
    snap.folderSpringMode || "off",
    snap.desktopWallpaperScene || "off",
    snap.uiSoundProfile || "off",
    snap.dualPaneFocusMode || "spotlight",
    snap.chameleonFolderMode || "off",
    snap.zeroWattGovernorMode || "auto",
    snap.colorTempMode || "neutral_6500k",
    snap.colorVisionMode || "off",
    snap.atmosphere || "none",
  ].join("|");
}

/** Captures the complete current look state (theme palette + all 10+ engines) as a normalized history entry. */
export function captureCurrentLookHistoryEntry(labelOverride = "") {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const s = state.settings ?? {};
  const palette = (root?.dataset?.palette && root.dataset.palette !== "preview")
    ? root.dataset.palette
    : (s.palette || "");
  const entry = {
    palette,
    themeFxOff: Boolean(s.themeFxOff),
    uiElementFx: s.uiElementFx || root?.dataset?.uiFx || "off",
    iconPackStyle: s.iconPackStyle || root?.dataset?.iconPack || "default",
    iconFinishMode: s.iconFinishMode || root?.dataset?.iconFinish || "off",
    themeFontProfile: s.themeFontProfile || root?.dataset?.fontProfile || "default",
    themeCornerProfile: s.themeCornerProfile || root?.dataset?.cornerProfile || "default",
    themeIconGlow: s.themeIconGlow || root?.dataset?.iconGlow || "off",
    themeIconAnimation: s.themeIconAnimation || root?.dataset?.iconAnim || "off",
    screenFilter: s.screenFilter || root?.dataset?.screenFilter || "off",
    workspaceStageMode: s.workspaceStageMode || root?.dataset?.stageMode || "off",
    cursorTrailMode: s.cursorTrailMode || root?.dataset?.cursorTrail || "off",
    folderSpringMode: s.folderSpringMode || root?.dataset?.folderSpring || "off",
    desktopWallpaperScene: s.desktopWallpaperScene || root?.dataset?.wallpaperScene || "off",
    uiSoundProfile: s.uiSoundProfile || root?.dataset?.soundProfile || "off",
    dualPaneFocusMode: s.dualPaneFocusMode || root?.dataset?.dualFocus || "spotlight",
    chameleonFolderMode: s.chameleonFolderMode || root?.dataset?.chameleonMood || "off",
    zeroWattGovernorMode: s.zeroWattGovernorMode || root?.dataset?.zeroWattMode || "auto",
    colorTempMode: s.colorTempMode || root?.dataset?.colorTemp || "neutral_6500k",
    colorVisionMode: s.colorVisionMode || root?.dataset?.visionMode || "off",
    atmosphere: s.atmosphere || root?.dataset?.atmosphere || "none",
    atmosphereIntensity: Number(s.atmosphereIntensity) || 60,
    atmosphereTier: s.atmosphereTier || "auto",
    label: String(labelOverride || palette || "Standard Look"),
    timestamp: Date.now(),
  };
  entry.signature = buildLookHistorySignature(entry);
  return entry;
}

/** Updates any mounted `⏪ Undo Look` / `⏩ Redo Look` buttons in the DOM. */
export function syncThemeHistoryButtons(rootEl = typeof document !== "undefined" ? document : null) {
  if (!rootEl || typeof rootEl.querySelectorAll !== "function") return;
  const st = getThemeHistoryState();
  for (const btn of rootEl.querySelectorAll('[data-theme-history-undo="true"]')) {
    btn.disabled = !st.canUndo;
    btn.setAttribute("aria-disabled", String(!st.canUndo));
    const prevItem = st.undoStack.length >= 2 ? st.undoStack[st.undoStack.length - 2] : st.undoStack[0];
    btn.textContent = st.undoCount > 0 ? `⏪ Undo (${st.undoCount})` : "⏪ Undo Look";
    btn.title = prevItem
      ? `Undo to previous look: ${prevItem.label || prevItem.palette || "Standard"} (Alt+Z / ⌥Z)`
      : "Undo to previous theme / FX roll (Alt+Z / ⌥Z)";
  }
  for (const btn of rootEl.querySelectorAll('[data-theme-history-redo="true"]')) {
    btn.disabled = !st.canRedo;
    btn.setAttribute("aria-disabled", String(!st.canRedo));
    const nextItem = st.redoStack[st.redoStack.length - 1];
    btn.textContent = st.redoCount > 0 ? `⏩ Redo (${st.redoCount})` : "⏩ Redo Look";
    btn.title = nextItem
      ? `Redo look: ${nextItem.label || nextItem.palette || "Standard"} (Alt+Shift+Z / ⌥⇧Z)`
      : "Redo theme / FX roll (Alt+Shift+Z / ⌥⇧Z)";
  }
}

/** Pushes a look snapshot onto the 25-step Undo History Stack (deduplicated) and clears the Redo stack. */
export function pushThemeHistorySnapshot(snapshotOverride = null, labelOverride = "") {
  if (isRestoringThemeHistory) return getThemeHistoryState();
  const base = captureCurrentLookHistoryEntry(labelOverride);
  const merged = snapshotOverride && typeof snapshotOverride === "object"
    ? { ...base, ...snapshotOverride, label: String(labelOverride || snapshotOverride.label || snapshotOverride.palette || base.label) }
    : base;
  merged.signature = buildLookHistorySignature(merged);
  const top = themeHistoryUndoStack[themeHistoryUndoStack.length - 1];
  if (top && top.signature === merged.signature) {
    if (labelOverride) top.label = String(labelOverride);
    syncThemeHistoryButtons();
    return getThemeHistoryState();
  }
  themeHistoryUndoStack.push(merged);
  if (themeHistoryUndoStack.length > THEME_HISTORY_LIMIT) {
    themeHistoryUndoStack = themeHistoryUndoStack.slice(themeHistoryUndoStack.length - THEME_HISTORY_LIMIT);
  }
  themeHistoryRedoStack = [];
  syncThemeHistoryButtons();
  return getThemeHistoryState();
}

/** Applies a saved history snapshot without clobbering the Undo/Redo stacks. */
export async function applyThemeHistorySnapshot(snap, opts = {}) {
  if (!snap || typeof snap !== "object") return null;
  isRestoringThemeHistory = true;
  try {
    const fxOff = Boolean(snap.themeFxOff);
    plainStaticLockKey = fxOff ? (snap.palette || null) : null;
    const patch = {
      palette: snap.palette || "",
      themeFxOff: fxOff,
      uiElementFx: snap.uiElementFx || "off",
      iconPackStyle: snap.iconPackStyle || "default",
      iconFinishMode: snap.iconFinishMode || "off",
      themeFontProfile: snap.themeFontProfile || "default",
      themeCornerProfile: snap.themeCornerProfile || "default",
      themeIconGlow: snap.themeIconGlow || "off",
      themeIconAnimation: snap.themeIconAnimation || "off",
      screenFilter: snap.screenFilter || "off",
      workspaceStageMode: snap.workspaceStageMode || "off",
      cursorTrailMode: snap.cursorTrailMode || "off",
      folderSpringMode: snap.folderSpringMode || "off",
      desktopWallpaperScene: snap.desktopWallpaperScene || "off",
      uiSoundProfile: snap.uiSoundProfile || "off",
      dualPaneFocusMode: snap.dualPaneFocusMode || "spotlight",
      chameleonFolderMode: snap.chameleonFolderMode || "off",
      zeroWattGovernorMode: snap.zeroWattGovernorMode || "auto",
      colorTempMode: snap.colorTempMode || "neutral_6500k",
      colorVisionMode: snap.colorVisionMode || "off",
      atmosphere: snap.atmosphere || "none",
      atmosphereIntensity: Number(snap.atmosphereIntensity) || 60,
      atmosphereTier: snap.atmosphereTier || "auto",
    };
    if (state.settings) Object.assign(state.settings, patch);
    await applyPalette(patch.palette);
    applyUiImmersionProfiles(patch);
    try {
      applyAtmosphere(patch.atmosphere, patch.atmosphereIntensity, patch.atmosphereTier);
    } catch {}
    await saveSettings(patch);
    emit("theme-changed", currentThemePayload());
    return snap;
  } finally {
    isRestoringThemeHistory = false;
    syncThemeHistoryButtons();
  }
}

/** Undoes the last theme / random roll / FX change (`Alt+Z` / `⌥Z`). */
export async function undoThemeHistory(opts = {}) {
  if (!themeHistoryUndoStack.length) return null;
  const currentLook = captureCurrentLookHistoryEntry();
  const top = themeHistoryUndoStack[themeHistoryUndoStack.length - 1];
  let targetSnap = null;
  if (themeHistoryUndoStack.length >= 2) {
    const popped = themeHistoryUndoStack.pop();
    themeHistoryRedoStack.push(popped);
    if (themeHistoryRedoStack.length > THEME_HISTORY_LIMIT) {
      themeHistoryRedoStack = themeHistoryRedoStack.slice(themeHistoryRedoStack.length - THEME_HISTORY_LIMIT);
    }
    targetSnap = themeHistoryUndoStack[themeHistoryUndoStack.length - 1];
  } else if (top && top.signature !== currentLook.signature) {
    themeHistoryRedoStack.push(currentLook);
    targetSnap = top;
  } else {
    if (!opts.quiet) toast("Already at the oldest look in Undo history.", { kind: "info" });
    syncThemeHistoryButtons();
    return null;
  }
  await applyThemeHistorySnapshot(targetSnap, opts);
  if (!opts.quiet) {
    toast(`⏪ Undid Look → ${targetSnap.label || targetSnap.palette || "Standard"}`, { kind: "info" });
  }
  return targetSnap;
}

/** Redoes a previously undone theme / random roll / FX change (`Alt+Shift+Z` / `⌥⇧Z`). */
export async function redoThemeHistory(opts = {}) {
  if (!themeHistoryRedoStack.length) {
    if (!opts.quiet) toast("Nothing to redo in Theme history.", { kind: "info" });
    syncThemeHistoryButtons();
    return null;
  }
  const nextSnap = themeHistoryRedoStack.pop();
  themeHistoryUndoStack.push(nextSnap);
  if (themeHistoryUndoStack.length > THEME_HISTORY_LIMIT) {
    themeHistoryUndoStack = themeHistoryUndoStack.slice(themeHistoryUndoStack.length - THEME_HISTORY_LIMIT);
  }
  await applyThemeHistorySnapshot(nextSnap, opts);
  if (!opts.quiet) {
    toast(`⏩ Redid Look → ${nextSnap.label || nextSnap.palette || "Standard"}`, { kind: "info" });
  }
  return nextSnap;
}

/** Returns the current state of the 25-step Theme Undo/Redo History Stack. */
export function getThemeHistoryState() {
  const currentLook = captureCurrentLookHistoryEntry();
  const top = themeHistoryUndoStack[themeHistoryUndoStack.length - 1];
  const undoCount = themeHistoryUndoStack.length >= 2
    ? themeHistoryUndoStack.length - 1
    : (top && top.signature !== currentLook.signature ? 1 : 0);
  const redoCount = themeHistoryRedoStack.length;
  return {
    undoCount,
    redoCount,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
    limit: THEME_HISTORY_LIMIT,
    undoStack: [...themeHistoryUndoStack],
    redoStack: [...themeHistoryRedoStack],
  };
}

/** Clears the Theme Undo/Redo History Stack. */
export function clearThemeHistory() {
  themeHistoryUndoStack = [];
  themeHistoryRedoStack = [];
  syncThemeHistoryButtons();
  return getThemeHistoryState();
}

// =====================================================================================================================
// UPGRADE 2: 🧭 Dual-Pane "Source vs. Target" Active Focus Spotlight
// =====================================================================================================================

/** Applies one of the 5 Dual-Pane Active vs. Target Focus Spotlight modes (`DUAL_PANE_FOCUS_MODES`). */
export async function applyDualPaneFocusMode(modeId = "spotlight", opts = {}) {
  const spec = DUAL_PANE_FOCUS_MODES.find((m) => m.id === modeId) || DUAL_PANE_FOCUS_MODES[0];
  if (state.settings) state.settings.dualPaneFocusMode = spec.id;
  applyUiImmersionProfiles({ dualPaneFocusMode: spec.id });
  await saveSettings({ dualPaneFocusMode: spec.id });
  if (!opts.quiet) {
    toast(`Dual-Pane Focus Mode: ${spec.label}`, { kind: "info" });
  }
  return spec;
}

/** Cycles through the 5 Dual-Pane Focus Spotlight modes (`DUAL_PANE_FOCUS_MODES`). */
export async function cycleDualPaneFocusMode(delta = 1, opts = {}) {
  const cur = (typeof document !== "undefined" && document.documentElement?.dataset?.dualFocus) || state.settings?.dualPaneFocusMode || "off";
  const idx = DUAL_PANE_FOCUS_MODES.findIndex((m) => m.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + DUAL_PANE_FOCUS_MODES.length) % DUAL_PANE_FOCUS_MODES.length;
  return applyDualPaneFocusMode(DUAL_PANE_FOCUS_MODES[nextIdx].id, opts);
}

// =====================================================================================================================
// UPGRADE 3: 🦎 Chameleon Folder Mood (Auto-Accent by Folder Contents)
// =====================================================================================================================

/** Detects the dominant Chameleon Folder Mood (`code`, `media`, `data`, `docs`, `archives`, `security`) from a list of directory entries. */
export function detectFolderMoodFromEntries(entries = [], folderPath = "") {
  const counts = { code: 0, media: 0, data: 0, docs: 0, archives: 0, security: 0 };
  const list = Array.isArray(entries) ? entries : [];
  for (const item of list) {
    const rawName = typeof item === "string" ? item : String(item?.name || "");
    if (!rawName || item?.isDir) continue;
    const lower = rawName.toLowerCase();
    if (lower === ".env" || lower.startsWith(".env.") || lower === "id_rsa" || lower === "id_ed25519") {
      counts.security += 2;
      continue;
    }
    if (lower === "dockerfile" || lower === "makefile" || lower === "cargo.toml" || lower === "package.json") {
      counts.code += 1.5;
    }
    const dotIdx = lower.lastIndexOf(".");
    if (dotIdx <= 0) continue;
    const ext = lower.slice(dotIdx + 1);
    for (const [moodId, extSet] of Object.entries(CHAMELEON_EXT_BUCKETS)) {
      if (extSet.has(ext)) {
        counts[moodId] += 1;
      }
    }
  }
  const pathLower = String(folderPath || "").toLowerCase();
  if (/\/(src|lib|components|pkg|crates|scripts|tests)\b/.test(pathLower)) counts.code += 0.5;
  if (/\/(pictures|photos|images|media|videos|music|audio|youtube_production)\b/.test(pathLower)) counts.media += 0.5;
  if (/\/(data|datasets|models|db|sql)\b/.test(pathLower)) counts.data += 0.5;
  if (/\/(docs|documents|notes|papers)\b/.test(pathLower)) counts.docs += 0.5;
  if (/\/(downloads|releases|dist|archives)\b/.test(pathLower)) counts.archives += 0.5;
  if (/\/(\.ssh|keys|certs|vault|secrets)\b/.test(pathLower)) counts.security += 0.5;

  let bestId = "code";
  let bestScore = 0;
  for (const [moodId, score] of Object.entries(counts)) {
    if (score > bestScore) {
      bestScore = score;
      bestId = moodId;
    }
  }
  const spec = CHAMELEON_FOLDER_MOODS.find((m) => m.id === bestId) || CHAMELEON_FOLDER_MOODS[2];
  return {
    ...spec,
    detectedMood: spec.id,
    totalMatched: bestScore,
    counts,
  };
}

/** Syncs the active Chameleon Folder Mood (`data-chameleon-mood`, `--fm-chameleon-accent`, `--fm-chameleon-glow`) onto `document.documentElement`. */
export function syncChameleonFolderMood(entriesOverride = null, folderPathOverride = "", modeOverride = undefined) {
  if (typeof document === "undefined" || !document.documentElement) return null;
  const root = document.documentElement;
  const mode = modeOverride !== undefined
    ? modeOverride
    : (state.settings?.chameleonFolderMode || "off");
  if (!mode || mode === "off") {
    delete root.dataset.chameleonMood;
    delete root.dataset.chameleonBadge;
    root.style.removeProperty("--fm-chameleon-accent");
    root.style.removeProperty("--fm-chameleon-glow");
    return { id: "off", active: false };
  }
  let resolvedSpec = null;
  if (mode === "auto") {
    const activeSide = state.active === "right" ? state.right : state.left;
    const entries = entriesOverride || activeSide?.entries || state.left?.entries || [];
    const folderPath = folderPathOverride || activeSide?.path || currentPath() || state.cwd || "";
    resolvedSpec = detectFolderMoodFromEntries(entries, folderPath);
  } else {
    resolvedSpec = CHAMELEON_FOLDER_MOODS.find((m) => m.id === mode && m.id !== "off" && m.id !== "auto") || CHAMELEON_FOLDER_MOODS[2];
  }
  root.dataset.chameleonMood = resolvedSpec.id;
  root.dataset.chameleonBadge = resolvedSpec.badge || resolvedSpec.label;
  root.style.setProperty("--fm-chameleon-accent", resolvedSpec.accent || "#38bdf8");
  root.style.setProperty("--fm-chameleon-glow", resolvedSpec.glow || "rgba(56, 189, 248, 0.34)");
  return { ...resolvedSpec, mode, active: true };
}

/** Applies a Chameleon Folder Mood mode (`"off" | "auto" | "code" | "media" | "data" | "docs" | "archives" | "security"`). */
export async function applyChameleonFolderMood(modeId = "off", opts = {}) {
  const spec = CHAMELEON_FOLDER_MOODS.find((m) => m.id === modeId) || CHAMELEON_FOLDER_MOODS[0];
  if (state.settings) state.settings.chameleonFolderMode = spec.id;
  syncChameleonFolderMood(opts.entries, opts.folderPath, spec.id);
  await saveSettings({ chameleonFolderMode: spec.id });
  const appliedMood = syncChameleonFolderMood(opts.entries, opts.folderPath, spec.id);
  if (!opts.quiet) {
    toast(spec.id === "off" ? "Chameleon Folder Mood: Off" : `🦎 Chameleon Folder Mood: ${spec.label}`, { kind: "info" });
  }
  return appliedMood || spec;
}

/** Cycles through the Chameleon Folder Mood modes (`CHAMELEON_FOLDER_MOODS`). */
export async function cycleChameleonFolderMood(delta = 1, opts = {}) {
  const cur = state.settings?.chameleonFolderMode || "off";
  const idx = CHAMELEON_FOLDER_MOODS.findIndex((m) => m.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + CHAMELEON_FOLDER_MOODS.length) % CHAMELEON_FOLDER_MOODS.length;
  return applyChameleonFolderMood(CHAMELEON_FOLDER_MOODS[nextIdx].id, opts);
}

// =====================================================================================================================
// UPGRADE 4: 📸 1-Click "Export Theme Poster Card" (1920×1080 Vector SVG Social Card)
// =====================================================================================================================

function escapeXmlText(raw) {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Generates a 1920×1080 high-resolution SVG Theme Poster Card showcasing the theme's colors, 3D folders, AAA Fidelity Score, and 1-line Share Code. */
export function generateThemePosterSvg(opts = {}) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const s = state.settings ?? {};
  const themeName = opts.name || opts.theme?.name || s.palette || root?.dataset?.palette || "Codecaine Studio Master";
  const themeKey = opts.key || opts.theme?.key || s.palette || root?.dataset?.palette || "standard";
  const themeGroup = opts.group || opts.theme?.group || "Workstation Master";
  const isDark = opts.dark !== undefined ? Boolean(opts.dark) : (opts.theme?.dark !== undefined ? Boolean(opts.theme.dark) : (root?.dataset?.theme !== "light"));
  const cols = opts.colors || opts.theme?.source?.colors || {
    background: currentVars.bg || (isDark ? "#0b101b" : "#f4f6fb"),
    card: currentVars.panel || (isDark ? "#131c2e" : "#ffffff"),
    text: currentVars.text || (isDark ? "#ecf2ff" : "#0f172a"),
    accent: currentVars.accent || "#38bdf8",
    secondary: currentVars.selected || "#a855f7",
    border: currentVars.border || "#28364f",
    danger: currentVars.danger || "#ff6b81",
    warning: currentVars.warning || "#fbbf24",
    success: currentVars.ok || "#34d399",
    info: currentVars.info || "#38bdf8",
  };
  const bg = cols.background || "#0b101b";
  const card = cols.card || "#131c2e";
  const text = cols.text || "#ecf2ff";
  const accent = cols.accent || "#38bdf8";
  const secondary = cols.secondary || "#a855f7";
  const border = cols.border || "#28364f";
  const danger = cols.danger || "#ff6b81";
  const warning = cols.warning || "#fbbf24";
  const success = cols.success || "#34d399";
  const info = cols.info || "#38bdf8";

  const aaa = computeAaaProductionScore(opts);
  const holidaySpec = resolveHolidayCrestForPalette(themeKey);
  const crestGlyph = holidaySpec?.crest || "✨";
  const shareCode = opts.shareCode || `CCFM-THEME-v1:${themeKey}`;
  const swatches = [
    ["BG", bg],
    ["CARD", card],
    ["TEXT", text],
    ["ACCENT", accent],
    ["SECOND", secondary],
    ["DANGER", danger],
    ["WARN", warning],
    ["OK", success],
    ["INFO", info],
  ];

  const swatchRects = swatches.map(([label, hex], idx) => {
    const x = 110 + idx * 190;
    return `<g transform="translate(${x}, 790)">
      <rect width="174" height="96" rx="18" fill="${escapeXmlText(hex)}" stroke="${escapeXmlText(text)}" stroke-opacity="0.24" stroke-width="2"/>
      <rect y="54" width="174" height="42" rx="12" fill="#050811" fill-opacity="0.76"/>
      <text x="16" y="79" fill="#ffffff" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="16" font-weight="700">${escapeXmlText(label)} · ${escapeXmlText(hex)}</text>
    </g>`;
  }).join("\n");

  const folderCards = [
    { name: "src/", meta: "TypeScript · 120Hz Engine", x: 140 },
    { name: "shaders/", meta: "Display-P3 Liquid Glass", x: 560 },
    { name: "models/", meta: "Neural & 3D Assets", x: 980 },
    { name: "themes/", meta: "310+ Built-in Palettes", x: 1400 },
  ].map((f) => `<g transform="translate(${f.x}, 430)">
    <rect width="380" height="210" rx="24" fill="${escapeXmlText(card)}" stroke="${escapeXmlText(accent)}" stroke-opacity="0.55" stroke-width="2.5"/>
    <path d="M 28 48 L 116 48 L 136 68 L 352 68 L 352 178 L 28 178 Z" fill="${escapeXmlText(accent)}" fill-opacity="0.18" stroke="${escapeXmlText(accent)}" stroke-width="2"/>
    <text x="48" y="122" fill="${escapeXmlText(text)}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="800">📁 ${escapeXmlText(f.name)}</text>
    <text x="48" y="156" fill="${escapeXmlText(accent)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="17" font-weight="600">${escapeXmlText(f.meta)}</text>
  </g>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" role="img" aria-label="${escapeXmlText(themeName)} Theme Poster Card">
  <defs>
    <linearGradient id="poster-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${escapeXmlText(bg)}"/>
      <stop offset="55%" stop-color="${escapeXmlText(card)}"/>
      <stop offset="100%" stop-color="${escapeXmlText(bg)}"/>
    </linearGradient>
    <linearGradient id="poster-accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${escapeXmlText(accent)}"/>
      <stop offset="100%" stop-color="${escapeXmlText(secondary)}"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#poster-bg)"/>
  <circle cx="1620" cy="210" r="360" fill="${escapeXmlText(accent)}" fill-opacity="0.12"/>
  <circle cx="310" cy="880" r="420" fill="${escapeXmlText(secondary)}" fill-opacity="0.12"/>
  <rect x="70" y="64" width="1780" height="952" rx="36" fill="${escapeXmlText(bg)}" fill-opacity="0.78" stroke="url(#poster-accent)" stroke-width="3"/>
  <text x="116" y="152" fill="${escapeXmlText(accent)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="21" font-weight="700" letter-spacing="2">CODECAINE FILE MANAGER · AAA THEME STUDIO SHOWCASE</text>
  <text x="116" y="232" fill="${escapeXmlText(text)}" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="900">${escapeXmlText(crestGlyph)} ${escapeXmlText(themeName)}</text>
  <text x="116" y="284" fill="${escapeXmlText(text)}" fill-opacity="0.78" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600">Category: ${escapeXmlText(themeGroup)} · Mode: ${isDark ? "Dark Studio" : "Daylight Studio"} · Key: ${escapeXmlText(themeKey)}</text>
  <g transform="translate(1410, 118)">
    <rect width="390" height="118" rx="22" fill="${escapeXmlText(card)}" stroke="${escapeXmlText(accent)}" stroke-width="2.5"/>
    <text x="28" y="48" fill="${escapeXmlText(accent)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" font-weight="700">STUDIO FIDELITY GRADE</text>
    <text x="28" y="92" fill="${escapeXmlText(text)}" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="900">${escapeXmlText(aaa.grade)} (${aaa.score}/100)</text>
  </g>
  <rect x="110" y="340" width="1700" height="340" rx="28" fill="${escapeXmlText(card)}" fill-opacity="0.58" stroke="${escapeXmlText(border)}" stroke-width="2"/>
  <text x="142" y="392" fill="${escapeXmlText(text)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20" font-weight="700">3D WORKSPACE &amp; FOLDER SHADER SPECIMENS (${aaa.activeCount} ACTIVE ENGINES)</text>
  ${folderCards}
  <text x="116" y="762" fill="${escapeXmlText(text)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20" font-weight="700">SEMANTIC COLOR PALETTE SWATCHES</text>
  ${swatchRects}
  <rect x="110" y="916" width="1700" height="68" rx="16" fill="${escapeXmlText(card)}" stroke="${escapeXmlText(accent)}" stroke-opacity="0.45" stroke-width="1.5"/>
  <text x="136" y="958" fill="${escapeXmlText(accent)}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="19" font-weight="700">${escapeXmlText(shareCode.slice(0, 112))}</text>
</svg>`;
}

/** Downloads (or saves to the current folder) a 1920×1080 `.poster.svg` Theme Poster Card for the specified or active theme. */
export async function downloadThemePosterCard(opts = {}) {
  const targetKey = opts.key || state.settings?.palette || (typeof document !== "undefined" ? document.documentElement?.dataset?.palette : "") || "";
  let themeObj = opts.theme || null;
  let shareCode = opts.shareCode || "";
  if (targetKey && !themeObj) {
    try {
      const got = await call("themes/get", { key: targetKey });
      themeObj = got?.theme || null;
    } catch {}
  }
  if (targetKey && !shareCode) {
    try {
      const exp = await call("themes/custom/export", { key: targetKey });
      shareCode = exp?.shareCode || "";
    } catch {}
  }
  const svg = generateThemePosterSvg({
    ...opts,
    key: targetKey || "standard",
    theme: themeObj,
    shareCode,
  });
  const slug = String(opts.name || themeObj?.name || targetKey || "codecaine-theme")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "codecaine-theme";
  const filename = `${slug}.poster.svg`;
  if (opts.saveToFolder) {
    await saveThemeFileToFolder({ filename, content: svg, folder: opts.folder || "" });
  } else if (opts.download !== false) {
    downloadThemeFileInBrowser(filename, svg);
  }
  return { filename, svg, key: targetKey || "standard" };
}

// =====================================================================================================================
// UPGRADE 5: 👁️ Instant "Hold to Peek Original / Plain" Readability Check
// =====================================================================================================================

/** Activates the instant "Hold to Peek Plain / Original" readability comparison mode (`data-theme-peek="plain"`). */
export function startThemePeekCompare(mode = "plain") {
  if (typeof document === "undefined" || !document.documentElement) return false;
  document.documentElement.dataset.themePeek = String(mode || "plain");
  return true;
}

/** Stops the "Hold to Peek Plain / Original" readability comparison mode and restores all active theme effects. */
export function stopThemePeekCompare() {
  if (typeof document === "undefined" || !document.documentElement) return false;
  delete document.documentElement.dataset.themePeek;
  return false;
}

/** Toggles "Peek Plain / Original" readability comparison mode on or off. */
export function toggleThemePeekCompare(mode = "plain") {
  if (isThemePeekCompareActive()) {
    stopThemePeekCompare();
    return false;
  }
  return startThemePeekCompare(mode);
}

/** Returns true when "Peek Plain / Original" readability mode is currently active. */
export function isThemePeekCompareActive() {
  return Boolean(typeof document !== "undefined" && document.documentElement?.dataset?.themePeek);
}

// =====================================================================================================================
// UPGRADE 6: 🎨 Deep Sub-Studio Theme Sync (Code Editor, Markdown Preview, Database Studio Grids)
// =====================================================================================================================

/** Computes harmonized syntax highlighting, code gutter, Markdown preview, and Database Studio CSS variables from the active theme palette. */
export function computeSubStudioThemeTokens(vars = currentVars, isDark = isSystemDark()) {
  const v = vars && typeof vars === "object" ? vars : {};
  const bg = v.bg || (isDark ? "#0f141c" : "#f8fafc");
  const panel = v.panel || v["surface-sunken"] || (isDark ? "#161d2a" : "#ffffff");
  const text = v.text || (isDark ? "#e6edf3" : "#0f172a");
  const accent = v.accent || "#38bdf8";
  const selected = v.selected || accent;
  const danger = v.danger || (isDark ? "#ff6b81" : "#dc2626");
  const warning = v.warning || (isDark ? "#fbbf24" : "#d97706");
  const success = v.ok || (isDark ? "#34d399" : "#16a34a");
  const info = v.info || accent;

  const codeBg = mixHexOklab(bg, isDark ? "#05070c" : "#ffffff", 0.28);
  const gutterBg = mixHexOklab(panel, bg, 0.55);
  const lineActive = mixHexOklab(codeBg, accent, isDark ? 0.14 : 0.1);
  const selection = mixHexOklab(codeBg, selected, isDark ? 0.32 : 0.24);
  const comment = mixHexOklab(text, bg, 0.48);
  const dbHeaderBg = mixHexOklab(panel, accent, isDark ? 0.16 : 0.12);
  const dbRowAlt = mixHexOklab(bg, panel, 0.45);

  return {
    "--fm-code-bg": codeBg,
    "--fm-code-gutter-bg": gutterBg,
    "--fm-code-line-active": lineActive,
    "--fm-code-selection": selection,
    "--fm-syntax-keyword": accent,
    "--fm-syntax-string": success,
    "--fm-syntax-function": info,
    "--fm-syntax-number": warning,
    "--fm-syntax-comment": comment,
    "--fm-syntax-type": danger,
    "--fm-md-heading": accent,
    "--fm-md-code-bg": gutterBg,
    "--fm-md-quote-border": accent,
    "--fm-db-header-bg": dbHeaderBg,
    "--fm-db-row-alt": dbRowAlt,
    "--fm-db-cell-focus": accent,
    "--fm-db-null-fg": comment,
  };
}

/** Applies the Deep Sub-Studio Theme Tokens (`--fm-code-*`, `--fm-syntax-*`, `--fm-md-*`, `--fm-db-*`) onto `document.documentElement`. */
export function syncSubStudioThemeTokens(varsOverride = null, isDarkOverride = undefined) {
  if (typeof document === "undefined" || !document.documentElement) return null;
  const root = document.documentElement;
  const isDark = isDarkOverride !== undefined
    ? Boolean(isDarkOverride)
    : (root.dataset.theme ? root.dataset.theme === "dark" : isSystemDark());
  const tokens = computeSubStudioThemeTokens(varsOverride || currentVars, isDark);
  for (const [k, val] of Object.entries(tokens)) {
    root.style.setProperty(k, val);
  }
  root.dataset.subStudioSync = "active";
  return tokens;
}

// =====================================================================================================================
// UPGRADE 7: 🔋 Smart Unfocused Window & Battery Zero-Watt Governor
// =====================================================================================================================

/** Evaluates and applies the Smart Zero-Watt Governor pause state to the DOM (`data-zero-watt-paused`) and `atmosphereFx` loop. */
export function applyZeroWattGovernorToDom(modeOverride) {
  const mode = modeOverride || state.settings?.zeroWattGovernorMode || (typeof document !== "undefined" ? document.documentElement?.dataset?.zeroWattMode : "") || "auto";
  const shouldPause = mode === "eco_saver" || (mode === "auto" && !isWindowCurrentlyFocused);
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.zeroWattMode = mode;
    if (shouldPause) {
      document.documentElement.dataset.zeroWattPaused = "true";
    } else {
      delete document.documentElement.dataset.zeroWattPaused;
    }
  }
  setAtmosphereZeroWattPaused(shouldPause);
  return {
    mode,
    paused: shouldPause,
    windowFocused: isWindowCurrentlyFocused,
  };
}

/** Returns the current state of the Smart Zero-Watt Governor (`{ mode, paused, windowFocused }`). */
export function getZeroWattGovernorState() {
  const mode = state.settings?.zeroWattGovernorMode || (typeof document !== "undefined" ? document.documentElement?.dataset?.zeroWattMode : "") || "auto";
  return {
    mode,
    paused: isAtmosphereZeroWattPaused(),
    windowFocused: isWindowCurrentlyFocused,
  };
}

/** Sets the Smart Unfocused Window & Battery Zero-Watt Governor mode (`"auto" | "always_120hz" | "eco_saver"`). */
export async function setZeroWattGovernorMode(modeId = "auto", opts = {}) {
  const spec = ZERO_WATT_GOVERNOR_MODES.find((m) => m.id === modeId) || ZERO_WATT_GOVERNOR_MODES[0];
  if (state.settings) state.settings.zeroWattGovernorMode = spec.id;
  const st = applyZeroWattGovernorToDom(spec.id);
  await saveSettings({ zeroWattGovernorMode: spec.id });
  if (!opts.quiet) {
    toast(`🔋 Power Governor: ${spec.label}`, { kind: "info" });
  }
  return { ...spec, ...st };
}

/** Cycles through the 3 Smart Zero-Watt Governor modes (`ZERO_WATT_GOVERNOR_MODES`). */
export async function cycleZeroWattGovernorMode(delta = 1, opts = {}) {
  const cur = state.settings?.zeroWattGovernorMode || "auto";
  const idx = ZERO_WATT_GOVERNOR_MODES.findIndex((m) => m.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + ZERO_WATT_GOVERNOR_MODES.length) % ZERO_WATT_GOVERNOR_MODES.length;
  return setZeroWattGovernorMode(ZERO_WATT_GOVERNOR_MODES[nextIdx].id, opts);
}

/** Updates (or simulates in tests) the window focus / visibility state and triggers the Smart Zero-Watt Governor. */
export function simulateWindowFocusState(focused = true) {
  isWindowCurrentlyFocused = Boolean(focused);
  return applyZeroWattGovernorToDom();
}

export function ensureZeroWattWindowListenersBound() {
  if (zeroWattListenersBound || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  zeroWattListenersBound = true;
  window.addEventListener("blur", () => {
    simulateWindowFocusState(false);
  }, { passive: true });
  window.addEventListener("focus", () => {
    simulateWindowFocusState(true);
  }, { passive: true });
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      simulateWindowFocusState(!document.hidden);
    }, { passive: true });
  }
}

// =====================================================================================================================
// UPGRADE 8: 🎨 Master Colorist Harmonies, Kelvin White-Point, Daltonism Vision Guard & Modular Theme Aspect Grafter
// =====================================================================================================================

function hslToHexMaster(hDeg, sPct, lPct) {
  const hNorm = (((Number(hDeg) || 0) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, Number(sPct) || 0)) / 100;
  const l = Math.max(0, Math.min(100, Number(lPct) || 0)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hNorm < 60) [r, g, b] = [c, x, 0];
  else if (hNorm < 120) [r, g, b] = [x, c, 0];
  else if (hNorm < 180) [r, g, b] = [0, c, x];
  else if (hNorm < 240) [r, g, b] = [0, x, c];
  else if (hNorm < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

function relativeLuminanceHex(hex) {
  const [r, g, b] = parseHexRgb(hex);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatioHex(hexA, hexB) {
  const l1 = relativeLuminanceHex(hexA);
  const l2 = relativeLuminanceHex(hexB);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

/**
 * Generates a complete, WCAG-AAA verified 10-token color palette & dual shader glow pair
 * from a seed `accentHex` using one of the 7 `COLOR_HARMONY_CHORDS` (`complementary`, `split_complementary`,
 * `triadic`, `analogous`, `tetradic_studio`, `monochromatic_xdr`, `golden_ratio_phi`).
 * Follows Modern Web Guidance (`color`): mixes surfaces in perceptual OKLab space rather than naive lightness channel clamping.
 */
export function computeColorHarmonyChord(accentHex = "#38bdf8", chordId = "complementary", dark = true) {
  const chordSpec = COLOR_HARMONY_CHORDS.find((c) => c.id === chordId) || COLOR_HARMONY_CHORDS[0];
  const rgb = parseHexRgb(accentHex);
  const { h: baseH, s: rawS } = rgbHueSatLum(rgb);
  const baseSatPct = Math.max(58, Math.min(94, Math.round(rawS * 100) || 78));
  const angles = chordSpec.angles || [0, 180];
  const secAngle = (baseH + (angles[1] ?? 180)) % 360;
  const tertAngle = (baseH + (angles[2] ?? angles[1] ?? 120)) % 360;

  const isMono = chordSpec.id === "monochromatic_xdr";
  const primaryPure = hslToHexMaster(baseH, baseSatPct, dark ? 64 : 42);
  const secondaryPure = isMono
    ? mixHexOklab(primaryPure, dark ? "#e2e8f0" : "#1e293b", 0.34)
    : hslToHexMaster(secAngle, Math.max(54, baseSatPct - 6), dark ? 66 : 44);
  const tertiaryPure = isMono
    ? mixHexOklab(primaryPure, dark ? "#94a3b8" : "#334155", 0.48)
    : hslToHexMaster(tertAngle, Math.max(52, baseSatPct - 10), dark ? 62 : 42);

  // Mix backgrounds & cards in perceptual OKLab space (Modern Web Guidance `color` rule)
  const bgBase = dark ? "#080b12" : "#f8fafc";
  const cardBase = dark ? "#121826" : "#ffffff";
  const textBase = dark ? "#f1f5f9" : "#0f172a";

  const background = mixHexOklab(bgBase, primaryPure, dark ? 0.08 : 0.05);
  const card = mixHexOklab(cardBase, secondaryPure, dark ? 0.11 : 0.06);
  let text = mixHexOklab(textBase, primaryPure, 0.06);
  if (contrastRatioHex(text, background) < 7.5) {
    text = dark ? "#f8fafc" : "#090d16";
  }

  // Ensure border has strong non-text contrast while remaining harmonious
  const border = mixHexOklab(card, primaryPure, dark ? 0.36 : 0.38);

  const colors = {
    background,
    card,
    text,
    accent: primaryPure,
    secondary: secondaryPure,
    border,
    danger: dark ? "#ff6b81" : "#b42318",
    warning: dark ? "#fbbf24" : "#b45309",
    success: dark ? "#34d399" : "#166534",
    info: tertiaryPure,
  };

  const textContrast = contrastRatioHex(colors.text, colors.background);
  const accentContrast = Math.max(3.0, contrastRatioHex(colors.accent, colors.background));

  return {
    chordId: chordSpec.id,
    label: chordSpec.label,
    dark: Boolean(dark),
    baseHue: Math.round(baseH),
    secondaryHue: Math.round(secAngle),
    tertiaryHue: Math.round(tertAngle),
    textContrast,
    accentContrast,
    contrastRatio: textContrast,
    uiContrastRatio: accentContrast,
    colors,
    glowColor: colors.accent,
    glowColor2: colors.secondary,
  };
}

/** Applies one of the 8 Studio Colorist Kelvin White-Point & OLED Mastering modes (`COLOR_TEMP_MODES`). */
export async function applyColorTempMode(modeId = "neutral_6500k", opts = {}) {
  const spec = COLOR_TEMP_MODES.find((m) => m.id === modeId) || COLOR_TEMP_MODES[0];
  if (state.settings) state.settings.colorTempMode = spec.id;
  applyUiImmersionProfiles({ colorTempMode: spec.id });
  await saveSettings({ colorTempMode: spec.id });
  if (!opts.quiet) {
    toast(`🌡️ Color Temperature: ${spec.label}`, { kind: "info" });
  }
  return spec;
}

/** Cycles through the 8 Studio Colorist Kelvin White-Point & OLED Mastering modes (`COLOR_TEMP_MODES`). */
export async function cycleColorTempMode(delta = 1, opts = {}) {
  const cur = (typeof document !== "undefined" && document.documentElement?.dataset?.colorTemp) || state.settings?.colorTempMode || "neutral_6500k";
  const idx = COLOR_TEMP_MODES.findIndex((m) => m.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + COLOR_TEMP_MODES.length) % COLOR_TEMP_MODES.length;
  return applyColorTempMode(COLOR_TEMP_MODES[nextIdx].id, opts);
}

/** Applies one of the 6 Color-Vision Deficiency (Daltonism) & AAA High-Contrast Accessibility modes (`COLOR_VISION_MODES`). */
export async function applyColorVisionMode(modeId = "off", opts = {}) {
  const spec = COLOR_VISION_MODES.find((m) => m.id === modeId) || COLOR_VISION_MODES[0];
  if (state.settings) state.settings.colorVisionMode = spec.id;
  applyUiImmersionProfiles({ colorVisionMode: spec.id });
  await saveSettings({ colorVisionMode: spec.id });
  if (!opts.quiet) {
    toast(spec.id === "off" ? "👁️ Color-Vision Guard: Off (Standard Spectrum)" : `👁️‍🗨️ Color-Vision & Contrast Guard: ${spec.label}`, { kind: "info" });
  }
  return spec;
}

/** Cycles through the 6 Color-Vision Deficiency & High-Contrast Accessibility modes (`COLOR_VISION_MODES`). */
export async function cycleColorVisionMode(delta = 1, opts = {}) {
  const cur = (typeof document !== "undefined" && document.documentElement?.dataset?.visionMode) || state.settings?.colorVisionMode || "off";
  const idx = COLOR_VISION_MODES.findIndex((m) => m.id === cur);
  const step = Number(delta) || 1;
  const nextIdx = (Math.max(0, idx) + step + COLOR_VISION_MODES.length) % COLOR_VISION_MODES.length;
  return applyColorVisionMode(COLOR_VISION_MODES[nextIdx].id, opts);
}

/**
 * Inspects a theme object (or resolves a theme key from `themeList()`) and computes its
 * structural "Theme DNA" profile: color harmony classification, estimated Kelvin warmth,
 * WCAG text/accent contrast ratios, and modular aspect breakdown (`colors`, `folders`, `icons`, `atmosphere`, `typography`).
 */
export function inspectThemeDna(themeObj) {
  const t = themeObj && typeof themeObj === "object" ? themeObj : {};
  const sw = t.swatch ?? ["#16191d", "#1e2329", "#38bdf8", "#e8eaed"];
  const cols = t.source?.colors || t.colors || {
    background: t.preview?.bg || sw[0] || "#16191d",
    card: t.preview?.panel || sw[1] || "#1e2329",
    accent: t.preview?.accent || sw[2] || "#38bdf8",
    text: t.preview?.text || sw[3] || "#e8eaed",
    secondary: t.preview?.selected || sw[2] || "#a855f7",
    border: t.preview?.border || sw[1] || "#2a313c",
  };
  const { h: hAcc, s: sAcc } = rgbHueSatLum(parseHexRgb(cols.accent || "#38bdf8"));
  const { h: hSec, s: sSec } = rgbHueSatLum(parseHexRgb(cols.secondary || cols.accent || "#a855f7"));
  const hueDiff = Math.abs(hAcc - hSec);
  const shortestArc = Math.min(hueDiff, 360 - hueDiff);

  let harmonyType = "Complementary";
  if (sAcc < 0.14 && sSec < 0.14) harmonyType = "Achromatic / Neutral";
  else if (shortestArc <= 16) harmonyType = "Monochromatic XDR";
  else if (shortestArc <= 48) harmonyType = "Analogous";
  else if (shortestArc >= 110 && shortestArc <= 132) harmonyType = "Triadic (120°)";
  else if (shortestArc >= 133 && shortestArc <= 144) harmonyType = "Golden Ratio φ (137.5°)";
  else if (shortestArc >= 145 && shortestArc <= 164) harmonyType = "Split-Complementary";
  else if (shortestArc >= 80 && shortestArc < 110) harmonyType = "Tetradic Cinema (90°)";

  const kelvinEstimate = (hAcc >= 165 && hAcc <= 255)
    ? 7500
    : (hAcc < 65 || hAcc > 330)
      ? 3500
      : 5600;

  const textContrast = contrastRatioHex(cols.text || "#e8eaed", cols.background || "#16191d");
  const accentContrast = contrastRatioHex(cols.accent || "#38bdf8", cols.background || "#16191d");
  const contrastGrade = textContrast >= 7.0 ? "WCAG AAA" : textContrast >= 4.5 ? "WCAG AA" : "Decorative";

  const fx = t.source?.fx || t.fx || {};
  return {
    key: t.key || "custom",
    name: t.name || "Custom Theme",
    dark: Boolean(t.dark ?? true),
    harmonyType,
    hueDeltaDeg: Math.round(shortestArc),
    kelvinEstimate,
    textContrast,
    accentContrast,
    uiContrast: accentContrast,
    contrastGrade,
    wcagGrade: contrastGrade,
    aspects: {
      colors: {
        background: cols.background,
        card: cols.card,
        text: cols.text,
        accent: cols.accent,
        secondary: cols.secondary || cols.accent,
        border: cols.border || cols.card,
      },
      folders: {
        uiElementFx: fx.uiElementFx || t.uiElementFx || "auto",
        backdropStyle: fx.backdropStyle || t.backdropStyle || (t.hasEffects ? "glass" : "solid"),
        glow: fx.glow || t.preview?.glow || "none",
      },
      icons: {
        iconPackStyle: fx.iconPackStyle || t.iconPackStyle || "default",
        iconGlow: fx.iconGlow || "off",
        iconAnimation: fx.iconAnimation || "off",
      },
      atmosphere: {
        atmosphere: fx.atmosphere || t.atmosphere || "none",
      },
      typography: {
        fontProfile: fx.fontProfile || "default",
        cornerProfile: fx.cornerProfile || fx.radius || t.preview?.radius || "default",
      },
    },
  };
}

/**
 * Modular Theme Aspect Grafter ("Steal Colors / Steal 3D Folders / Steal Icons / Steal Atmosphere / Steal Typography"):
 * Grafts ONLY a single aspect (`"colors" | "folders" | "icons" | "atmosphere" | "typography"`) from `sourceKeyOrTheme`
 * onto the user's currently active workspace look, recording a 25-step Undo History snapshot (`⌥Z`).
 */
export async function graftThemeAspect(sourceKeyOrTheme, aspect = "colors", opts = {}) {
  ensureGlobalThemeShortcutsBound();
  const cleanAspect = THEME_GRAFT_ASPECTS.some((a) => a.id === aspect) ? aspect : "colors";
  let themeObj = typeof sourceKeyOrTheme === "object" && sourceKeyOrTheme ? sourceKeyOrTheme : null;
  const targetKey = typeof sourceKeyOrTheme === "string" ? sourceKeyOrTheme : (themeObj?.key || "");

  if (!themeObj && targetKey) {
    try {
      const got = await call("themes/get", { key: targetKey });
      themeObj = got?.theme || null;
    } catch {}
    if (!themeObj) {
      const list = await themeList().catch(() => []);
      themeObj = list.find((t) => t.key === targetKey) || null;
    }
  }
  if (!themeObj && !targetKey) return null;

  pushThemeHistorySnapshot();
  const dna = inspectThemeDna(themeObj || { key: targetKey, name: targetKey });
  const sourceName = themeObj?.name || targetKey || "Source Theme";

  if (cleanAspect === "colors") {
    const res = await applyThemeColorsKeepingCurrentEffects(targetKey, { ...opts, quiet: true });
    pushThemeHistorySnapshot({ palette: targetKey }, `Grafted Colors ← ${sourceName}`);
    if (!opts.quiet) {
      toast(`🎨 Grafted Colors from "${sourceName}" (kept your current 3D folders, icons & atmosphere)!`, { kind: "success" });
    }
    return { aspect: "colors", sourceKey: targetKey, sourceName, dna, applied: res };
  }

  plainStaticLockKey = null;
  if (state.settings) state.settings.themeFxOff = false;
  const patch = { themeFxOff: false };
  if (cleanAspect === "folders") {
    const folderFx = dna.aspects.folders.uiElementFx && dna.aspects.folders.uiElementFx !== "auto"
      ? dna.aspects.folders.uiElementFx
      : "tahoe_glass_folders";
    patch.uiElementFx = folderFx;
  } else if (cleanAspect === "icons") {
    patch.iconPackStyle = dna.aspects.icons.iconPackStyle !== "default" ? dna.aspects.icons.iconPackStyle : "macos_tahoe_3d";
    if (dna.aspects.icons.iconGlow && dna.aspects.icons.iconGlow !== "off") {
      patch.themeIconGlow = dna.aspects.icons.iconGlow;
    }
    if (dna.aspects.icons.iconAnimation && dna.aspects.icons.iconAnimation !== "off") {
      patch.themeIconAnimation = dna.aspects.icons.iconAnimation;
    }
  } else if (cleanAspect === "atmosphere") {
    const atmo = dna.aspects.atmosphere.atmosphere && dna.aspects.atmosphere.atmosphere !== "none"
      ? dna.aspects.atmosphere.atmosphere
      : "liquid_glass_caustics";
    patch.atmosphere = atmo;
    try {
      applyAtmosphere(atmo, state.settings?.atmosphereIntensity ?? 72, state.settings?.atmosphereTier || "auto");
    } catch {}
  } else if (cleanAspect === "typography") {
    const fp = dna.aspects.typography.fontProfile && dna.aspects.typography.fontProfile !== "default"
      ? dna.aspects.typography.fontProfile
      : "humanist_hig";
    const cp = ["sharp", "chamfer", "chamfered", "rounded", "squircle_hig", "pill", "organic"].includes(dna.aspects.typography.cornerProfile)
      ? dna.aspects.typography.cornerProfile
      : "squircle_hig";
    patch.themeFontProfile = fp;
    patch.themeCornerProfile = cp;
  }

  if (state.settings) Object.assign(state.settings, patch);
  applyUiImmersionProfiles(patch);
  await saveSettings(patch);
  pushThemeHistorySnapshot(patch, `Grafted ${cleanAspect} ← ${sourceName}`);
  emit("theme-changed", currentThemePayload());

  if (!opts.quiet) {
    const aspectMeta = THEME_GRAFT_ASPECTS.find((a) => a.id === cleanAspect);
    toast(`🧬 ${aspectMeta?.label || `Grafted ${cleanAspect}`} from "${sourceName}"!`, { kind: "success" });
  }
  return { aspect: cleanAspect, sourceKey: targetKey, sourceName, dna, patch };
}

/**
 * Computes a live AAA Production Studio Fidelity Score (`0..100`) and studio grade (`"S+ AAA Master"`, `"A+ Studio Pro"`, `"B Standard"`, etc.)
 * across all active visual, spatial, icon, filter, and audio engines.
 */
export function computeAaaProductionScore(overrides = {}) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const s = { ...(state.settings ?? {}), ...overrides };
  const palette = s.palette || root?.dataset?.palette || "";
  const uiFx = s.uiElementFx || root?.dataset?.uiFx || "off";
  const iconPack = s.iconPackStyle || root?.dataset?.iconPack || "default";
  const iconFinish = s.iconFinishMode || root?.dataset?.iconFinish || "off";
  const iconAnim = s.themeIconAnimation || root?.dataset?.iconAnim || "off";
  const screenFilter = s.screenFilter || root?.dataset?.screenFilter || "off";
  const stageMode = s.workspaceStageMode || root?.dataset?.stageMode || "off";
  const cursorTrail = s.cursorTrailMode || root?.dataset?.cursorTrail || "off";
  const folderSpring = s.folderSpringMode || root?.dataset?.folderSpring || "off";
  const wallpaper = s.desktopWallpaperScene || root?.dataset?.wallpaperScene || "off";
  const sound = s.uiSoundProfile || root?.dataset?.soundProfile || "off";
  const dualFocus = s.dualPaneFocusMode || root?.dataset?.dualFocus || "off";
  const chameleon = s.chameleonFolderMode || root?.dataset?.chameleonMood || "off";
  const colorTemp = s.colorTempMode || root?.dataset?.colorTemp || "neutral_6500k";
  const visionMode = s.colorVisionMode || root?.dataset?.visionMode || "off";

  const activeEngines = [];
  let score = 20; // Baseline professional computer icon & semantic palette foundation
  if (palette) { score += 10; activeEngines.push("palette"); }
  if (uiFx && uiFx !== "off" && uiFx !== "auto") { score += 10; activeEngines.push("uiElementFx"); }
  if (iconPack && iconPack !== "default" && iconPack !== "auto") { score += 10; activeEngines.push("iconPackStyle"); }
  if (iconFinish && iconFinish !== "off") { score += 10; activeEngines.push("iconFinishMode"); }
  if (iconAnim && iconAnim !== "off") { score += 10; activeEngines.push("themeIconAnimation"); }
  if (screenFilter && screenFilter !== "off") { score += 6; activeEngines.push("screenFilter"); }
  if (stageMode && stageMode !== "off") { score += 8; activeEngines.push("workspaceStageMode"); }
  if (cursorTrail && cursorTrail !== "off") { score += 6; activeEngines.push("cursorTrailMode"); }
  if (folderSpring && folderSpring !== "off") { score += 5; activeEngines.push("folderSpringMode"); }
  if (wallpaper && wallpaper !== "off") { score += 5; activeEngines.push("desktopWallpaperScene"); }
  if (sound && sound !== "off") { score += 5; activeEngines.push("uiSoundProfile"); }
  if (dualFocus && dualFocus !== "off") { score += 3; activeEngines.push("dualPaneFocusMode"); }
  if (chameleon && chameleon !== "off") { score += 4; activeEngines.push("chameleonFolderMode"); }
  if (colorTemp && colorTemp !== "neutral_6500k") { score += 4; activeEngines.push("colorTempMode"); }
  if (visionMode && visionMode !== "off") { score += 4; activeEngines.push("colorVisionMode"); }
  score = Math.min(100, score);

  const grade = score >= 90 ? "S+ AAA Master"
    : score >= 75 ? "A+ Studio Pro"
    : score >= 55 ? "A Workstation"
    : "B Standard";
  return {
    score,
    grade,
    activeEngines,
    activeCount: activeEngines.length,
  };
}

/**
 * Applies one of the 8 Master AAA Director's Cut Presets (`AAA_DIRECTOR_CUT_PRESETS`),
 * orchestrating all 10 visual, spatial, icon, filter, wallpaper, and audio engines in a single click.
 */
export async function applyAaaDirectorCutPreset(presetId, opts = {}) {
  const preset = AAA_DIRECTOR_CUT_PRESETS.find((p) => p.id === presetId) || AAA_DIRECTOR_CUT_PRESETS[0];
  if (!preset) return null;
  pushThemeHistorySnapshot();
  await chooseTheme(preset.palette, { skipHistory: true });
  await applyPalette(preset.palette);
  const patch = {
    palette: preset.palette,
    themeFxOff: false,
    uiElementFx: preset.uiElementFx,
    iconPackStyle: preset.iconPackStyle,
    iconFinishMode: preset.iconFinishMode,
    themeIconAnimation: preset.themeIconAnimation,
    themeIconGlow: preset.themeIconGlow,
    screenFilter: preset.screenFilter,
    workspaceStageMode: preset.workspaceStageMode,
    cursorTrailMode: preset.cursorTrailMode,
    folderSpringMode: preset.folderSpringMode,
    desktopWallpaperScene: preset.desktopWallpaperScene,
    uiSoundProfile: preset.uiSoundProfile,
  };
  if (state.settings) Object.assign(state.settings, patch);
  applyUiImmersionProfiles(patch);
  await saveSettings(patch);
  pushThemeHistorySnapshot(patch, preset.label);
  if (preset.palette.startsWith("holiday_") && opts.burst !== false) {
    triggerHolidayCelebrationBurst(preset.palette);
  }
  if (!opts.quiet) {
    const report = computeAaaProductionScore(patch);
    toast(`🎬 AAA Director's Cut: ${preset.label} (${report.grade} · ${report.score}/100)`, { kind: "success" });
  }
  return preset;
}

/** Cycles through the 8 Master AAA Director's Cut Presets (`Alt+M` / `⌥M`). */
export async function cycleAaaDirectorCutPreset(delta = 1, opts = {}) {
  const curPalette = (typeof document !== "undefined" && document.documentElement?.dataset?.palette) || state.settings?.palette || "";
  const curStage = (typeof document !== "undefined" && document.documentElement?.dataset?.stageMode) || state.settings?.workspaceStageMode || "";
  const curIdx = AAA_DIRECTOR_CUT_PRESETS.findIndex((p) => p.palette === curPalette && p.workspaceStageMode === curStage);
  const step = Number(delta) || 1;
  const nextIdx = curIdx < 0
    ? 0
    : (curIdx + step + AAA_DIRECTOR_CUT_PRESETS.length) % AAA_DIRECTOR_CUT_PRESETS.length;
  return applyAaaDirectorCutPreset(AAA_DIRECTOR_CUT_PRESETS[nextIdx].id, opts);
}

/** Builds the interactive "🔥 Folder, Toolbar & Icon Immersion Studio" bar for the Theme Gallery and Atmosphere Studio. */
export function buildImmersionStudioBar() {
  const curUiFx = () => state.settings?.uiElementFx || "off";
  const curIconPack = () => state.settings?.iconPackStyle || "default";
  const curFont = () => state.settings?.themeFontProfile || "default";
  const curCorner = () => state.settings?.themeCornerProfile || "default";
  const curGlow = () => state.settings?.themeIconGlow || "off";
  const curAnim = () => state.settings?.themeIconAnimation || "off";
  const curScreenFilter = () => state.settings?.screenFilter || "off";
  const curIconFinish = () => (typeof document !== "undefined" && document.documentElement?.dataset?.iconFinish) || state.settings?.iconFinishMode || "";
  const curStageMode = () => (typeof document !== "undefined" && document.documentElement?.dataset?.stageMode) || state.settings?.workspaceStageMode || "off";
  const curSoundProfile = () => (typeof document !== "undefined" && document.documentElement?.dataset?.soundProfile) || state.settings?.uiSoundProfile || "off";
  const curCursorTrail = () => (typeof document !== "undefined" && document.documentElement?.dataset?.cursorTrail) || state.settings?.cursorTrailMode || "off";
  const curFolderSpring = () => (typeof document !== "undefined" && document.documentElement?.dataset?.folderSpring) || state.settings?.folderSpringMode || "off";
  const curWallpaper = () => (typeof document !== "undefined" && document.documentElement?.dataset?.wallpaperScene) || state.settings?.desktopWallpaperScene || "off";
  const curPalette = () => (typeof document !== "undefined" && document.documentElement?.dataset?.palette) || state.settings?.palette || "";
  const curKit = () => {
    const p = state.settings?.palette || "";
    const u = curUiFx();
    const ic = curIconPack();
    return JUMPSTART_WORKSTATION_KITS.find((k) => k.palette === p && k.uiElementFx === u && k.iconPackStyle === ic)?.id || "";
  };

  const directorCutButtons = AAA_DIRECTOR_CUT_PRESETS.map((preset) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill theme-jumpstart-pill${curPalette() === preset.palette && curStageMode() === preset.workspaceStageMode ? " is-active" : ""}`,
      "data-aaa-director-preset": preset.id,
      "aria-pressed": String(curPalette() === preset.palette && curStageMode() === preset.workspaceStageMode),
      title: `${preset.desc} (1-click 10-engine AAA Master Preset · Alt+M / ⌥M)`,
      onclick: async () => {
        await applyAaaDirectorCutPreset(preset.id);
        syncBarState();
      },
    }, preset.label),
  );

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
        if (keepCurrentIconsLock && lockedIconsSnapshot) lockedIconsSnapshot.iconPackStyle = opt.id;
        applyUiImmersionProfiles({ iconPackStyle: opt.id });
        syncBarState();
        await saveSettings({ iconPackStyle: opt.id });
      },
    }, opt.label),
  );

  const animButtons = ICON_ANIMATION_PROFILES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${opt.highEnd3d ? " is-high-end-3d-pill" : ""}${curAnim() === opt.id ? " is-active" : ""}`,
      "data-icon-anim": opt.id,
      "aria-pressed": String(curAnim() === opt.id),
      title: opt.desc,
      onclick: async () => {
        if (state.settings) state.settings.themeIconAnimation = opt.id;
        if (keepCurrentIconsLock && lockedIconsSnapshot) lockedIconsSnapshot.themeIconAnimation = opt.id;
        applyUiImmersionProfiles({ themeIconAnimation: opt.id });
        syncBarState();
        await saveSettings({ themeIconAnimation: opt.id });
      },
    }, opt.label),
  );

  const screenFilterButtons = SCREEN_FILTER_PRESETS.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curScreenFilter() === opt.id ? " is-active" : ""}`,
      "data-screen-filter": opt.id,
      "aria-pressed": String(curScreenFilter() === opt.id),
      title: `${opt.label} (${opt.category}): ${opt.desc}`,
      onclick: async () => {
        await applyScreenFilter(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const iconFinishButtons = COMPUTER_ICON_FINISH_MODES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curIconFinish() === opt.id ? " is-active" : ""}`,
      "data-icon-finish-pill": opt.id,
      "aria-pressed": String(curIconFinish() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await applyComputerIconFinish(curIconFinish() === opt.id ? "off" : opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const holidayButtons = HOLIDAY_CELEBRATION_CATALOG.map((item) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill theme-holiday-pill${curPalette() === item.key ? " is-active" : ""}`,
      "data-holiday-pill": item.key,
      "aria-pressed": String(curPalette() === item.key),
      title: `${item.crest} ${item.label} — Activates bespoke ${item.anim} 3D animation, C9 fairy-light toolbar garland, folder crest badge & festive celebration burst!`,
      onclick: async () => {
        await applyHolidayCelebrationTheme(item.key);
        syncBarState();
      },
    }, `${item.crest} ${item.label}`),
  );

  const stageModeButtons = WORKSPACE_STAGE_MODES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curStageMode() === opt.id ? " is-active" : ""}`,
      "data-stage-mode-pill": opt.id,
      "aria-pressed": String(curStageMode() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await applyWorkspaceStageMode(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const cursorTrailButtons = CURSOR_TRAIL_MODES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curCursorTrail() === opt.id ? " is-active" : ""}`,
      "data-cursor-trail-pill": opt.id,
      "aria-pressed": String(curCursorTrail() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await applyCursorTrailMode(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const folderSpringButtons = FOLDER_SPRING_MODES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curFolderSpring() === opt.id ? " is-active" : ""}`,
      "data-folder-spring-pill": opt.id,
      "aria-pressed": String(curFolderSpring() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await applyFolderSpringMode(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const wallpaperButtons = DESKTOP_WALLPAPER_SCENES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curWallpaper() === opt.id ? " is-active" : ""}`,
      "data-wallpaper-scene-pill": opt.id,
      "aria-pressed": String(curWallpaper() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await applyDesktopWallpaperScene(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const soundProfileButtons = UI_SOUND_PROFILES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curSoundProfile() === opt.id ? " is-active" : ""}`,
      "data-sound-profile-pill": opt.id,
      "aria-pressed": String(curSoundProfile() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await setUiSoundProfile(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const curDualFocus = () => (typeof document !== "undefined" && document.documentElement?.dataset?.dualFocus) || state.settings?.dualPaneFocusMode || "spotlight";
  const curChameleon = () => state.settings?.chameleonFolderMode || (typeof document !== "undefined" && document.documentElement?.dataset?.chameleonMood) || "off";
  const curZeroWatt = () => state.settings?.zeroWattGovernorMode || (typeof document !== "undefined" && document.documentElement?.dataset?.zeroWattMode) || "auto";
  const curColorTemp = () => (typeof document !== "undefined" && document.documentElement?.dataset?.colorTemp) || state.settings?.colorTempMode || "neutral_6500k";
  const curColorVision = () => (typeof document !== "undefined" && document.documentElement?.dataset?.visionMode) || state.settings?.colorVisionMode || "off";

  const colorTempButtons = COLOR_TEMP_MODES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curColorTemp() === opt.id ? " is-active" : ""}`,
      "data-color-temp-pill": opt.id,
      "aria-pressed": String(curColorTemp() === opt.id),
      title: `${opt.desc} (${opt.kelvin}K)`,
      onclick: async () => {
        await applyColorTempMode(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const colorVisionButtons = COLOR_VISION_MODES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curColorVision() === opt.id ? " is-active" : ""}`,
      "data-vision-mode-pill": opt.id,
      "aria-pressed": String(curColorVision() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await applyColorVisionMode(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const dualFocusButtons = DUAL_PANE_FOCUS_MODES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curDualFocus() === opt.id ? " is-active" : ""}`,
      "data-dual-focus-pill": opt.id,
      "aria-pressed": String(curDualFocus() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await applyDualPaneFocusMode(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const chameleonButtons = CHAMELEON_FOLDER_MOODS.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curChameleon() === opt.id ? " is-active" : ""}`,
      "data-chameleon-mode-pill": opt.id,
      "aria-pressed": String(curChameleon() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await applyChameleonFolderMood(opt.id);
        syncBarState();
      },
    }, opt.label),
  );

  const zeroWattButtons = ZERO_WATT_GOVERNOR_MODES.map((opt) =>
    h("button", {
      type: "button",
      class: `theme-filter-pill${curZeroWatt() === opt.id ? " is-active" : ""}`,
      "data-zero-watt-pill": opt.id,
      "aria-pressed": String(curZeroWatt() === opt.id),
      title: opt.desc,
      onclick: async () => {
        await setZeroWattGovernorMode(opt.id);
        syncBarState();
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
        if (keepCurrentIconsLock && lockedIconsSnapshot) lockedIconsSnapshot.themeIconGlow = opt.id;
        applyUiImmersionProfiles({ themeIconGlow: opt.id });
        syncBarState();
        await saveSettings({ themeIconGlow: opt.id });
      },
    }, opt.label),
  );

  const shuffleIconsBtn = h("button", {
    type: "button",
    class: "theme-filter-pill theme-random-fx-pill",
    "data-shuffle-icons-keep-theme": "true",
    title: "Shuffle system icons, custom icon pack & 3D icon choreography while keeping 100% of your current theme colors & effects (Alt+I / ⌥I)!",
    onclick: async () => {
      await shuffleSystemIconsKeepTheme();
      syncBarState();
    },
  }, "🎲 Shuffle System Icons (Keep Theme · ⌥I)");

  const spin3dFoldersBtn = h("button", {
    type: "button",
    class: "theme-filter-pill theme-random-fx-pill",
    "data-toggle-3d-spinning-folders": "true",
    title: "High-End GPU Mode: Cycle 3D Spinning Folder Turntable, Futuristic Flash 2Advanced Vector HUD, 3D Pop-Up Origami Flip & Gyro Cube Spin (Alt+9 / ⌥9)!",
    onclick: async () => {
      await cycleHighEnd3dFolderAnimation(1);
      syncBarState();
    },
  }, "🌪️ 3D Spinning Folders & Flash HUD (⌥9)");

  const lockIconsBtn = h("button", {
    type: "button",
    class: `theme-filter-pill${keepCurrentIconsLock ? " is-active" : ""}`,
    "data-keep-icons-lock": "true",
    "aria-pressed": String(keepCurrentIconsLock),
    title: "Lock your current Custom Icon Pack, Icon Glow & 3D Icon Animation so switching themes never overwrites your icons (Alt+Shift+I / ⌥⇧I)!",
    onclick: () => {
      toggleKeepIconsOnThemeSwitchMode();
      syncBarState();
    },
  }, keepCurrentIconsLock ? "🔒 Icons Locked" : "🔓 Lock My Icons (⌥⇧I)");

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
      title: `Live 3D Icon Specimen: ${item.label} (hover to test 3D folder pocket & click to cycle 20 icon choreographies)`,
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
      h("strong", {}, `🔬 Live 3D Icon, Spinning Folder & Futuristic Flash Stage (260+ Icons · ${ICON_PACK_OPTIONS.length} Packs · ${ICON_ANIMATION_PROFILES.length} Animations)`),
      h("div", { class: "theme-icon-stage-quick-actions" },
        shuffleIconsBtn,
        spin3dFoldersBtn,
        lockIconsBtn,
        previewStageStatus,
      ),
    ),
    h("div", { class: "theme-icon-stage-grid" },
      ...previewStageRowItems,
      ...previewStageBtnItems,
    ),
  );

  function syncBarState() {
    const activeKit = curKit();
    for (const b of directorCutButtons) {
      const preset = AAA_DIRECTOR_CUT_PRESETS.find((p) => p.id === b.dataset.aaaDirectorPreset);
      const on = Boolean(preset && curPalette() === preset.palette && curStageMode() === preset.workspaceStageMode);
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
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
    for (const b of screenFilterButtons) {
      const on = b.dataset.screenFilter === curScreenFilter();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of iconFinishButtons) {
      const on = b.dataset.iconFinishPill === curIconFinish();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of holidayButtons) {
      const on = b.dataset.holidayPill === curPalette();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of stageModeButtons) {
      const on = b.dataset.stageModePill === curStageMode();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of cursorTrailButtons) {
      const on = b.dataset.cursorTrailPill === curCursorTrail();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of folderSpringButtons) {
      const on = b.dataset.folderSpringPill === curFolderSpring();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of wallpaperButtons) {
      const on = b.dataset.wallpaperScenePill === curWallpaper();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of soundProfileButtons) {
      const on = b.dataset.soundProfilePill === curSoundProfile();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of dualFocusButtons) {
      const on = b.dataset.dualFocusPill === curDualFocus();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of chameleonButtons) {
      const on = b.dataset.chameleonModePill === curChameleon();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of zeroWattButtons) {
      const on = b.dataset.zeroWattPill === curZeroWatt();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of colorTempButtons) {
      const on = b.dataset.colorTempPill === curColorTemp();
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of colorVisionButtons) {
      const on = b.dataset.visionModePill === curColorVision();
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
    lockIconsBtn.classList.toggle("is-active", keepCurrentIconsLock);
    lockIconsBtn.setAttribute("aria-pressed", String(keepCurrentIconsLock));
    lockIconsBtn.textContent = keepCurrentIconsLock ? "🔒 Icons Locked" : "🔓 Lock My Icons (⌥⇧I)";
    const packObj = ICON_PACK_OPTIONS.find((o) => o.id === curIconPack()) || ICON_PACK_OPTIONS[0];
    const animObj = ICON_ANIMATION_PROFILES.find((o) => o.id === curAnim()) || ICON_ANIMATION_PROFILES[0];
    const filterObj = SCREEN_FILTER_PRESETS.find((o) => o.id === curScreenFilter()) || SCREEN_FILTER_PRESETS[0];
    const aaaReport = computeAaaProductionScore();
    previewStageStatus.textContent = `Pack: ${packObj.label} · Motion: ${animObj.label} · Filter: ${filterObj.label} · Studio: ${aaaReport.grade} (${aaaReport.score}/100)`;
    syncVisibleIcons(previewStage);
  }
  syncBarState();

  return h("div", { class: "theme-immersion-bar", role: "region", "aria-label": "File Manager folder, toolbar and icon immersion effects" },
    previewStage,
    h("div", { class: "theme-pill-row theme-jumpstart-row", "data-aaa-director-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🎬 AAA Director's Cut Master Presets (${AAA_DIRECTOR_CUT_PRESETS.length} · ⌥M)`),
      h("button", {
        type: "button",
        class: "theme-filter-pill theme-random-fx-pill",
        "data-aaa-director-cycle": "1",
        title: "Cycle through all 8 Master AAA Director's Cut Presets that orchestrate all 10 engines simultaneously (Alt+M / ⌥M)!",
        onclick: async () => {
          await cycleAaaDirectorCutPreset(1);
          syncBarState();
        },
      }, "⏭️ Next AAA Master (⌥M)"),
      ...directorCutButtons,
    ),
    h("div", { class: "theme-pill-row theme-jumpstart-row" },
      h("span", { class: "theme-pill-label" }, "⚡ 1-Click Jumpstart Kits"),
      ...jumpstartButtons,
    ),
    h("div", { class: "theme-pill-row", "data-holiday-studio-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🎄 Super-Special Holiday Celebrations (${HOLIDAY_CELEBRATION_CATALOG.length} · ⌥H)`),
      h("button", {
        type: "button",
        class: "theme-filter-pill theme-random-fx-pill",
        "data-holiday-match-today": "true",
        title: "Automatically detect and activate the closest US Holiday theme for today's calendar date with bespoke 3D animations & celebration burst!",
        onclick: async () => {
          const matched = detectCalendarHolidayTheme(new Date());
          if (matched) await applyHolidayCelebrationTheme(matched.key);
          syncBarState();
        },
      }, "📅 Today's Holiday"),
      h("button", {
        type: "button",
        class: "theme-filter-pill theme-random-fx-pill",
        "data-holiday-cycle-next": "true",
        title: "Cycle through all 18 Super-Special US Holiday themes in calendar order (Alt+H / ⌥H)!",
        onclick: async () => {
          await cycleHolidayTheme(1);
          syncBarState();
        },
      }, "⏭️ Next Holiday (⌥H)"),
      h("button", {
        type: "button",
        class: "theme-filter-pill theme-random-fx-pill",
        "data-holiday-celebrate-burst": "true",
        title: "Launch a festive Holiday Celebration Burst across your screen!",
        onclick: () => {
          triggerHolidayCelebrationBurst();
        },
      }, "🎉 Celebrate Burst!"),
      ...holidayButtons,
    ),
    h("div", { class: "theme-pill-row", "data-icon-finish-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🖥️ Computer Icon Finish (${COMPUTER_ICON_FINISH_MODES.length})`),
      ...iconFinishButtons,
    ),
    h("div", { class: "theme-pill-row", "data-folder-spring-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🗂️ 3D Folder Spring & Peek (${FOLDER_SPRING_MODES.length})`),
      ...folderSpringButtons,
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
      h("span", { class: "theme-pill-label" }, `🎬 3D Icon & Flash Animation (${ICON_ANIMATION_PROFILES.length})`),
      ...animButtons,
    ),
    h("div", { class: "theme-pill-row", "data-screen-filter-bar": "true" },
      h("span", { class: "theme-pill-label" }, `📺 CRT, Cinema & Optical Screen Filters (${SCREEN_FILTER_PRESETS.length} · ⌥F)`),
      h("button", {
        type: "button",
        class: "theme-filter-pill theme-random-fx-pill",
        "data-cycle-screen-filter": "1",
        title: "Cycle through all 34 built-in CRT, VHS, Game Boy, Kodachrome, IMAX, Night Vision, X-Ray, E-Ink & XDR screen filters (Alt+F / ⌥F)!",
        onclick: async () => {
          await cycleScreenFilter(1);
          syncBarState();
        },
      }, "⏭️ Next Screen Filter (⌥F)"),
      h("button", {
        type: "button",
        class: "theme-filter-pill theme-random-fx-pill",
        "data-random-screen-filter": "true",
        title: "Pick a random built-in CRT, Cinema, Retro Handheld, or Optical Lens screen filter (Alt+Shift+F / ⌥⇧F)!",
        onclick: async () => {
          await randomScreenFilter();
          syncBarState();
        },
      }, "🎲 Random Filter (⌥⇧F)"),
      ...screenFilterButtons,
    ),
    h("div", { class: "theme-pill-row", "data-stage-mode-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🎭 3D Desktop Stage & Ambilux (${WORKSPACE_STAGE_MODES.length} · ⌥S)`),
      ...stageModeButtons,
    ),
    h("div", { class: "theme-pill-row", "data-cursor-trail-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🔦 Pointer Spotlight & 120Hz Trail (${CURSOR_TRAIL_MODES.length} · ⌥T)`),
      ...cursorTrailButtons,
    ),
    h("div", { class: "theme-pill-row", "data-wallpaper-scene-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🌅 8K Desktop Wallpaper Backplate (${DESKTOP_WALLPAPER_SCENES.length} · ⌥W)`),
      ...wallpaperButtons,
    ),
    h("div", { class: "theme-pill-row", "data-sound-profile-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🔊 Tactile UI Soundscape (${UI_SOUND_PROFILES.length})`),
      ...soundProfileButtons,
    ),
    h("div", { class: "theme-pill-row", "data-dual-focus-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🧭 Dual-Pane Source/Target Focus (${DUAL_PANE_FOCUS_MODES.length})`),
      ...dualFocusButtons,
    ),
    h("div", { class: "theme-pill-row", "data-chameleon-mood-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🦎 Chameleon Folder Mood (${CHAMELEON_FOLDER_MOODS.length})`),
      ...chameleonButtons,
    ),
    h("div", { class: "theme-pill-row", "data-zero-watt-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🔋 Smart Zero-Watt Power Governor (${ZERO_WATT_GOVERNOR_MODES.length})`),
      ...zeroWattButtons,
    ),
    h("div", { class: "theme-pill-row", "data-color-temp-bar": "true" },
      h("span", { class: "theme-pill-label" }, `🌡️ Kelvin White-Point & OLED Mastering (${COLOR_TEMP_MODES.length})`),
      ...colorTempButtons,
    ),
    h("div", { class: "theme-pill-row", "data-vision-mode-bar": "true" },
      h("span", { class: "theme-pill-label" }, `👁️‍🗨️ Color-Vision & AAA Contrast Guard (${COLOR_VISION_MODES.length})`),
      ...colorVisionButtons,
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
        gapRects.push(svgEl("rect", { x: x - 3, y: 4, width: 6, height: hPx - 8, fill: "rgba(255,90,90,0.28)" }));
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

    const wrap = h("div", { class: "telemetry-scope-box", "data-telemetry-scope-svg": "true" },
      svgEl("svg", { viewBox: `0 0 ${w} ${hPx}`, width: "100%", height: hPx, class: "telemetry-scope-svg", "aria-label": "Oscilloscope CPU and GPU History Waveform" },
        svgEl("defs", {},
          svgEl("pattern", { id: "telemetry-grid-pat", width: "18", height: "18", patternUnits: "userSpaceOnUse" },
            svgEl("path", { d: "M 18 0 L 0 0 0 18", fill: "none", stroke: "currentColor", "stroke-opacity": "0.14", "stroke-width": "0.7" }),
          ),
        ),
        svgEl("rect", { x: "0", y: "0", width: w, height: hPx, fill: "url(#telemetry-grid-pat)" }),
        svgEl("line", { x1: "0", y1: Math.round(hPx * 0.35), x2: w, y2: Math.round(hPx * 0.35), stroke: "currentColor", "stroke-opacity": "0.22", "stroke-dasharray": "3 3", "stroke-width": "0.8" }),
        ...gapRects,
        gpuArea ? svgEl("path", { d: gpuArea, class: "telemetry-scope-gpu-area" }) : null,
        gpuLine ? svgEl("path", { d: gpuLine, class: "telemetry-scope-gpu-line", fill: "none", "stroke-width": "2" }) : null,
        cpuLine ? svgEl("path", { d: cpuLine, class: "telemetry-scope-cpu-line", fill: "none", "stroke-width": "1.8" }) : null,
      ),
    );
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
        const svgWrap = h("div", { class: "telemetry-radial-svg-wrap" },
          svgEl("svg", { viewBox: "0 0 72 72", width: "68", height: "68", "aria-hidden": "true" },
            svgEl("circle", { cx: "36", cy: "36", r: radius, fill: "none", stroke: "currentColor", "stroke-opacity": "0.16", "stroke-width": "6" }),
            svgEl("circle", { cx: "36", cy: "36", r: radius, fill: "none", stroke: "currentColor", "stroke-width": "6", "stroke-linecap": "round", "stroke-dasharray": `${dash} ${circum.toFixed(1)}`, transform: "rotate(-90 36 36)", class: "telemetry-radial-arc" }),
          ),
        );
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
  if (!opts?.skipHistory && !isRestoringThemeHistory) {
    pushThemeHistorySnapshot();
  }
  const keepFxOff = Boolean(opts?.keepFxOff);
  plainStaticLockKey = keepFxOff ? (key || null) : null;
  if (state.settings) state.settings.themeFxOff = keepFxOff;
  if (!keepCurrentEffectsLock && !opts?.keepEffectsOnly) {
    keptEffectsForKey = null;
    keptEffectsSnapshot = null;
  }
  if (!opts?.preserveSuppressedFx) {
    resetSuppressedFx();
  }
  rememberTheme(key);
  await saveSettings({ palette: key, themeFxOff: keepFxOff });
  if (!opts?.skipHistory && !isRestoringThemeHistory) {
    pushThemeHistorySnapshot({ palette: key, themeFxOff: keepFxOff }, key || "Standard");
  }
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
  keptEffectsForKey = null;
  keptEffectsSnapshot = null;
  if (!opts.keepTelemetryHud) {
    closeTelemetryPopoutHud();
    if (typeof document !== "undefined") {
      for (const d of document.querySelectorAll('details[data-telemetry-studio-drawer="true"]')) {
        d.open = false;
      }
    }
  }
  if (typeof document !== "undefined") {
    document.getElementById("fm-holiday-celebration-burst")?.remove();
    document.getElementById("fm-cursor-spotlight-layer")?.remove();
  }
  if (opts.stripThemeEffects !== false) {
    plainStaticLockKey = opts.lockKey ?? state.settings?.palette ?? wanted ?? null;
    if (typeof document !== "undefined" && document.documentElement) {
      clearEffects();
    }
  }
  const preserveIcons = Boolean(opts.preserveLockedIcons && keepCurrentIconsLock && lockedIconsSnapshot);
  const patch = {
    ...(opts.stripThemeEffects !== false ? { themeFxOff: true } : {}),
    atmosphere: "none",
    uiElementFx: "off",
    iconPackStyle: preserveIcons ? (lockedIconsSnapshot.iconPackStyle || "default") : "default",
    themeIconGlow: preserveIcons ? (lockedIconsSnapshot.themeIconGlow || "off") : "off",
    themeIconAnimation: preserveIcons ? (lockedIconsSnapshot.themeIconAnimation || "off") : "off",
    screenFilter: "off",
    cursorTrailMode: "off",
    folderSpringMode: "off",
    ...(opts.stripThemeEffects !== false
      ? {
          themeFontProfile: "default",
          themeCornerProfile: "default",
          iconFinishMode: "off",
          workspaceStageMode: "off",
          desktopWallpaperScene: "off",
          uiSoundProfile: "off",
        }
      : {}),
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
          "data-theme-history-undo": "true",
          title: "Undo to previous theme / FX roll (Alt+Z / ⌥Z)",
          onclick: (e) => {
            e.stopPropagation();
            void undoThemeHistory();
          },
        }, "⏪ Undo Look"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-theme-history-redo": "true",
          title: "Redo theme / FX roll (Alt+Shift+Z / ⌥⇧Z)",
          onclick: (e) => {
            e.stopPropagation();
            void redoThemeHistory();
          },
        }, "⏩ Redo Look"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-theme-peek-btn": "true",
          title: "Hold (or click) to temporarily strip glass, filters & shaders and inspect raw text readability",
          onpointerdown: (e) => {
            e.stopPropagation();
            startThemePeekCompare("plain");
          },
          onpointerup: (e) => {
            e.stopPropagation();
            stopThemePeekCompare();
          },
          onpointerleave: () => {
            stopThemePeekCompare();
          },
          onclick: (e) => {
            e.stopPropagation();
            toggleThemePeekCompare("plain");
          },
        }, "👁️ Peek Plain"),
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
          "data-quick-hud-shuffle-icons": "true",
          title: "Shuffle System Icon Packs, 3D Icon Glow & Animations while keeping your current theme & FX (Alt+I / ⌥I)",
          onclick: (e) => {
            e.stopPropagation();
            void shuffleSystemIconsKeepTheme();
          },
        }, "🎭 Shuffle Icons (⌥I)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-3d-folders": "true",
          title: "Cycle High-End 3D Spinning Folders & Futuristic Flash-Reloaded 3000 120Hz Animations (Alt+9 / ⌥9)",
          onclick: (e) => {
            e.stopPropagation();
            void cycleHighEnd3dFolderAnimation(1);
          },
        }, "💿 3D Spin & Flash (⌥9)"),
        h("button", {
          type: "button",
          class: "btn fm-quick-cycle-mini-btn",
          "data-quick-hud-screen-filter": "true",
          title: "Cycle built-in CRT, Cinema, Retro Handheld, Analog & Optical Screen Filters (Alt+F / ⌥F · Shift+Click for Random ⌥⇧F)",
          onclick: (e) => {
            e.stopPropagation();
            if (e.shiftKey) void randomScreenFilter();
            else void cycleScreenFilter(1);
          },
        }, "📺 Screen Filter (⌥F)"),
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
  syncThemeHistoryButtons(hud);
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
 * and Full Animated FX on the currently active theme (`Cmd+0` / `Alt+0` / `⌥0`).
 */
export async function toggleCurrentThemeEffects(opts = {}) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const fxActive = !state.settings?.themeFxOff && Boolean(
    root?.dataset?.fx
    || (root?.dataset?.fxAtmosphere && root.dataset.fxAtmosphere !== "none")
    || (state.settings?.atmosphere && state.settings.atmosphere !== "none")
    || (state.settings?.uiElementFx && state.settings.uiElementFx !== "off")
    || getActiveWorkspaceEffects().some((x) => x.kind !== "colorTempMode" && x.kind !== "colorVisionMode"),
  );
  if (fxActive) {
    await disableAllThemeAnimations({ quiet: Boolean(opts.quiet), stripThemeEffects: true });
    return { fxEnabled: false, key: state.settings?.palette || "" };
  }
  plainStaticLockKey = null;
  if (state.settings) state.settings.themeFxOff = false;
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
  const screenFilter = root.dataset?.screenFilter || root.getAttribute("data-screen-filter") || "";
  if (screenFilter && screenFilter !== "off") {
    const presetMeta = SCREEN_FILTER_PRESETS.find((f) => f.id === screenFilter);
    items.push({
      kind: "screenFilter",
      id: screenFilter,
      label: `${presetMeta?.label || `📺 Filter: ${screenFilter}`}`,
      title: `Click to turn off screen filter (${presetMeta?.label || screenFilter})`,
    });
  }
  const iconFinish = root.dataset?.iconFinish || "";
  if (iconFinish && iconFinish !== "off") {
    const finishMeta = COMPUTER_ICON_FINISH_MODES.find((m) => m.id === iconFinish);
    items.push({
      kind: "iconFinishMode",
      id: iconFinish,
      label: `${finishMeta?.label || `🖥️ Icon Finish: ${iconFinish}`}`,
      title: `Click to reset computer icon finish (${finishMeta?.label || iconFinish})`,
    });
  }
  const stageMode = root.dataset?.stageMode || "";
  if (stageMode && stageMode !== "off") {
    const stageMeta = WORKSPACE_STAGE_MODES.find((m) => m.id === stageMode);
    items.push({
      kind: "workspaceStageMode",
      id: stageMode,
      label: `${stageMeta?.label || `🎭 Stage: ${stageMode}`}`,
      title: `Click to turn off 3D desktop stage mode (${stageMeta?.label || stageMode})`,
    });
  }
  const cursorTrail = root.dataset?.cursorTrail || "";
  if (cursorTrail && cursorTrail !== "off") {
    const trailMeta = CURSOR_TRAIL_MODES.find((m) => m.id === cursorTrail);
    items.push({
      kind: "cursorTrailMode",
      id: cursorTrail,
      label: `${trailMeta?.label || `🔦 Trail: ${cursorTrail}`}`,
      title: `Click to turn off pointer spotlight & cursor trail (${trailMeta?.label || cursorTrail})`,
    });
  }
  const folderSpring = root.dataset?.folderSpring || "";
  if (folderSpring && folderSpring !== "off") {
    const springMeta = FOLDER_SPRING_MODES.find((m) => m.id === folderSpring);
    items.push({
      kind: "folderSpringMode",
      id: folderSpring,
      label: `${springMeta?.label || `🗂️ Folder Spring: ${folderSpring}`}`,
      title: `Click to turn off 3D folder spring hover (${springMeta?.label || folderSpring})`,
    });
  }
  const wallpaperScene = root.dataset?.wallpaperScene || "";
  if (wallpaperScene && wallpaperScene !== "off") {
    const wallMeta = DESKTOP_WALLPAPER_SCENES.find((s) => s.id === wallpaperScene);
    items.push({
      kind: "desktopWallpaperScene",
      id: wallpaperScene,
      label: `${wallMeta?.label || `🌅 Wallpaper: ${wallpaperScene}`}`,
      title: `Click to turn off 8K desktop wallpaper backplate (${wallMeta?.label || wallpaperScene})`,
    });
  }
  const soundProfile = root.dataset?.soundProfile || "";
  if (soundProfile && soundProfile !== "off") {
    const soundMeta = UI_SOUND_PROFILES.find((p) => p.id === soundProfile);
    items.push({
      kind: "uiSoundProfile",
      id: soundProfile,
      label: `${soundMeta?.label || `🔊 Sound: ${soundProfile}`}`,
      title: `Click to mute UI tactile soundscape (${soundMeta?.label || soundProfile})`,
    });
  }
  const colorTemp = root.dataset?.colorTemp || "";
  if (colorTemp && colorTemp !== "neutral_6500k") {
    const tempMeta = COLOR_TEMP_MODES.find((m) => m.id === colorTemp);
    items.push({
      kind: "colorTempMode",
      id: colorTemp,
      label: `${tempMeta?.label || `🌡️ White-Point: ${colorTemp}`}`,
      title: `Click to reset Kelvin White-Point mastering (${tempMeta?.label || colorTemp}) back to Neutral 6500K`,
    });
  }
  const visionMode = root.dataset?.visionMode || "";
  if (visionMode && visionMode !== "off") {
    const visionMeta = COLOR_VISION_MODES.find((m) => m.id === visionMode);
    items.push({
      kind: "colorVisionMode",
      id: visionMode,
      label: `${visionMeta?.label || `👁️‍🗨️ Vision: ${visionMode}`}`,
      title: `Click to turn off Color-Vision & AAA Contrast Guard (${visionMeta?.label || visionMode})`,
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
 * `"fontProfile"`, `"cornerProfile"`, `"screenFilter"`, `"iconFinishMode"`, `"workspaceStageMode"`, `"cursorTrailMode"`,
 * `"folderSpringMode"`, `"desktopWallpaperScene"`, `"uiSoundProfile"`, `"retroGlitch"`, `"glassGlow"`, or `"all"`) from the live workspace in 1 click.
 */
export async function removeActiveWorkspaceEffect(rawKind, value = "", opts = {}) {
  const KIND_ALIASES = {
    iconPack: "iconPackStyle",
    iconFinish: "iconFinishMode",
    stageMode: "workspaceStageMode",
    cursorTrail: "cursorTrailMode",
    folderSpring: "folderSpringMode",
    wallpaperScene: "desktopWallpaperScene",
    soundProfile: "uiSoundProfile",
    colorTemp: "colorTempMode",
    visionMode: "colorVisionMode",
  };
  const kind = KIND_ALIASES[rawKind] || rawKind;
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
  } else if (kind === "screenFilter") {
    root?.removeAttribute("data-screen-filter");
    root?.removeAttribute("data-fx-screen-filter");
    if (root?.dataset) delete root.dataset.screenFilter;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, screenFilter: "off" });
    applyUiImmersionProfiles({ screenFilter: "off" });
    await saveSettings({ ...palettePatch, screenFilter: "off" });
    root?.removeAttribute("data-screen-filter");
    root?.removeAttribute("data-fx-screen-filter");
    if (root?.dataset) delete root.dataset.screenFilter;
  } else if (kind === "iconFinishMode") {
    if (root?.dataset) delete root.dataset.iconFinish;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, iconFinishMode: "off" });
    applyUiImmersionProfiles({ iconFinishMode: "off" });
    await saveSettings({ ...palettePatch, iconFinishMode: "off" });
    if (root?.dataset) delete root.dataset.iconFinish;
  } else if (kind === "workspaceStageMode") {
    if (root?.dataset) delete root.dataset.stageMode;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, workspaceStageMode: "off" });
    applyUiImmersionProfiles({ workspaceStageMode: "off" });
    await saveSettings({ ...palettePatch, workspaceStageMode: "off" });
    if (root?.dataset) delete root.dataset.stageMode;
  } else if (kind === "cursorTrailMode") {
    if (root?.dataset) delete root.dataset.cursorTrail;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, cursorTrailMode: "off" });
    applyUiImmersionProfiles({ cursorTrailMode: "off" });
    await saveSettings({ ...palettePatch, cursorTrailMode: "off" });
    if (root?.dataset) delete root.dataset.cursorTrail;
    ensureCursorSpotlightLayer("off");
  } else if (kind === "folderSpringMode") {
    if (root?.dataset) delete root.dataset.folderSpring;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, folderSpringMode: "off" });
    applyUiImmersionProfiles({ folderSpringMode: "off" });
    await saveSettings({ ...palettePatch, folderSpringMode: "off" });
    if (root?.dataset) delete root.dataset.folderSpring;
  } else if (kind === "desktopWallpaperScene") {
    if (root?.dataset) delete root.dataset.wallpaperScene;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, desktopWallpaperScene: "off" });
    applyUiImmersionProfiles({ desktopWallpaperScene: "off" });
    await saveSettings({ ...palettePatch, desktopWallpaperScene: "off" });
    if (root?.dataset) delete root.dataset.wallpaperScene;
  } else if (kind === "uiSoundProfile") {
    if (root?.dataset) delete root.dataset.soundProfile;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, uiSoundProfile: "off" });
    applyUiImmersionProfiles({ uiSoundProfile: "off" });
    await saveSettings({ ...palettePatch, uiSoundProfile: "off" });
    if (root?.dataset) delete root.dataset.soundProfile;
  } else if (kind === "colorTempMode") {
    if (root?.dataset) delete root.dataset.colorTemp;
    root?.style?.removeProperty("--fm-temp-tint");
    root?.style?.removeProperty("--fm-temp-mix");
    root?.style?.removeProperty("--fm-temp-kelvin");
    if (state.settings) Object.assign(state.settings, { ...palettePatch, colorTempMode: "neutral_6500k" });
    applyUiImmersionProfiles({ colorTempMode: "neutral_6500k" });
    await saveSettings({ ...palettePatch, colorTempMode: "neutral_6500k" });
    if (root?.dataset) delete root.dataset.colorTemp;
  } else if (kind === "colorVisionMode") {
    if (root?.dataset) delete root.dataset.visionMode;
    if (state.settings) Object.assign(state.settings, { ...palettePatch, colorVisionMode: "off" });
    applyUiImmersionProfiles({ colorVisionMode: "off" });
    await saveSettings({ ...palettePatch, colorVisionMode: "off" });
    if (root?.dataset) delete root.dataset.visionMode;
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
 * 3D folder/toolbar shader, custom icon pack, icon glow, 3D icon animation, font/corner profiles, screen filter, and glass/glow DOM attributes).
 */
export function captureCurrentWorkspaceEffectsSnapshot() {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const fxAttrs = {};
  if (root) {
    for (const attr of [...root.attributes]) {
      if (attr.name.startsWith("data-fx") || attr.name === "data-screen-filter") {
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
  const screenFilter = root?.dataset?.screenFilter || root?.getAttribute?.("data-screen-filter") || state.settings?.screenFilter || "off";
  const iconFinishMode = root?.dataset?.iconFinish || state.settings?.iconFinishMode || "off";
  const workspaceStageMode = root?.dataset?.stageMode || state.settings?.workspaceStageMode || "off";
  const cursorTrailMode = root?.dataset?.cursorTrail || state.settings?.cursorTrailMode || "off";
  const folderSpringMode = root?.dataset?.folderSpring || state.settings?.folderSpringMode || "off";
  const desktopWallpaperScene = root?.dataset?.wallpaperScene || state.settings?.desktopWallpaperScene || "off";
  const uiSoundProfile = root?.dataset?.soundProfile || state.settings?.uiSoundProfile || "off";
  return {
    atmosphere: atmoSpec || "none",
    uiElementFx: uiElementFx || "off",
    iconPackStyle: iconPackStyle || "default",
    themeIconGlow: themeIconGlow || "off",
    themeIconAnimation: themeIconAnimation || "off",
    themeFontProfile: themeFontProfile || "default",
    themeCornerProfile: themeCornerProfile || "default",
    screenFilter: screenFilter || "off",
    iconFinishMode: iconFinishMode || "off",
    workspaceStageMode: workspaceStageMode || "off",
    cursorTrailMode: cursorTrailMode || "off",
    folderSpringMode: folderSpringMode || "off",
    desktopWallpaperScene: desktopWallpaperScene || "off",
    uiSoundProfile: uiSoundProfile || "off",
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
 * 3D folder/toolbar shader, custom icon pack, icon glow, 3D icon animation, font/corner profiles, screen filter, and glass/glow).
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
  keptEffectsForKey = key;
  keptEffectsSnapshot = snap;

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
    themeFxOff: false,
    atmosphere: snap.atmosphere || "none",
    uiElementFx: snap.uiElementFx || "off",
    iconPackStyle: snap.iconPackStyle || "default",
    themeIconGlow: snap.themeIconGlow || "off",
    themeIconAnimation: snap.themeIconAnimation || "off",
    themeFontProfile: snap.themeFontProfile || "default",
    themeCornerProfile: snap.themeCornerProfile || "default",
    screenFilter: snap.screenFilter || "off",
    iconFinishMode: snap.iconFinishMode || "off",
    workspaceStageMode: snap.workspaceStageMode || "off",
    cursorTrailMode: snap.cursorTrailMode || "off",
    folderSpringMode: snap.folderSpringMode || "off",
    desktopWallpaperScene: snap.desktopWallpaperScene || "off",
    uiSoundProfile: snap.uiSoundProfile || "off",
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
  return { ...snap, key, name: themeName, snapshot: snap };
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

/** Returns true when "Lock System Icons on Theme Switch" mode is active. */
export function isKeepIconsOnThemeSwitchMode() {
  return Boolean(keepCurrentIconsLock);
}

/**
 * Enables or disables "Lock System Icons on Theme Switch" mode (`Alt+Shift+I` / `⌥⇧I`).
 * When enabled, switching themes preserves the user's chosen `iconPackStyle`, `themeIconGlow`, and `themeIconAnimation`.
 */
export function setKeepIconsOnThemeSwitchMode(enabled, opts = {}) {
  keepCurrentIconsLock = Boolean(enabled);
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (keepCurrentIconsLock) {
    lockedIconsSnapshot = {
      iconPackStyle: root?.dataset?.iconPack || root?.getAttribute?.("data-fx-icon-pack") || state.settings?.iconPackStyle || "default",
      themeIconGlow: root?.dataset?.iconGlow || root?.getAttribute?.("data-fx-icon-glow") || state.settings?.themeIconGlow || "off",
      themeIconAnimation: root?.dataset?.iconAnim || root?.getAttribute?.("data-fx-icon-anim") || state.settings?.themeIconAnimation || "off",
    };
    if (root?.dataset) root.dataset.keepIconsLock = "true";
    if (!opts.quiet) {
      toast("🔒 Icons Locked — switching themes now keeps your custom system icon pack, icon glow & 3D icon animation!", { kind: "success" });
    }
  } else {
    lockedIconsSnapshot = null;
    if (root?.dataset) delete root.dataset.keepIconsLock;
    if (!opts.quiet) {
      toast("🔓 Icons Unlocked — switching themes applies each theme's default icon pack.", { kind: "info" });
    }
  }
  return keepCurrentIconsLock;
}

/** Toggles "Lock System Icons on Theme Switch" mode on or off (`Alt+Shift+I` / `⌥⇧I`). */
export function toggleKeepIconsOnThemeSwitchMode(opts = {}) {
  return setKeepIconsOnThemeSwitchMode(!keepCurrentIconsLock, opts);
}

/**
 * Instant 1-click / `Alt+I` (`⌥I`) System Icon Pack Shuffler:
 * Shuffles the 49 custom system icon packs (plus matching 3D icon glow & optional 3D icon animation)
 * while keeping 100% of the user's current theme colors, atmosphere weather shaders, and glass effects intact!
 */
export async function shuffleSystemIconsKeepTheme(opts = {}) {
  ensureGlobalThemeShortcutsBound();
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const activeKey = (root?.dataset?.palette && root.dataset.palette !== "preview")
    ? root.dataset.palette
    : (wanted || state.settings?.palette || "");
  const curPack = root?.dataset?.iconPack || root?.getAttribute?.("data-fx-icon-pack") || state.settings?.iconPackStyle || "default";
  const packs = ICON_PACK_OPTIONS.filter((p) => p.id !== "default");
  const pool = packs.length > 1 ? packs.filter((p) => p.id !== curPack) : packs;
  const chosenPack = pool[Math.floor(Math.random() * pool.length)] || packs[0];
  if (!chosenPack) return null;

  const glows = ICON_GLOW_PROFILES.filter((g) => g.id !== "off");
  const curGlow = root?.dataset?.iconGlow || root?.getAttribute?.("data-fx-icon-glow") || state.settings?.themeIconGlow || "off";
  const chosenGlow = opts.keepGlow && curGlow !== "off"
    ? ICON_GLOW_PROFILES.find((g) => g.id === curGlow) || glows[0]
    : glows[Math.floor(Math.random() * glows.length)] || glows[0];

  const anims = ICON_ANIMATION_PROFILES.filter((a) => a.id !== "off");
  const curAnim = root?.dataset?.iconAnim || root?.getAttribute?.("data-fx-icon-anim") || state.settings?.themeIconAnimation || "off";
  const chosenAnim = opts.keepAnimation && curAnim !== "off"
    ? ICON_ANIMATION_PROFILES.find((a) => a.id === curAnim) || anims[0]
    : (opts.shuffleAnimation !== false
        ? anims[Math.floor(Math.random() * anims.length)] || anims[0]
        : (ICON_ANIMATION_PROFILES.find((a) => a.id === curAnim) || anims[0]));

  const patch = {
    ...(activeKey && state.settings && state.settings.palette !== activeKey ? { palette: activeKey } : {}),
    themeFxOff: false,
    iconPackStyle: chosenPack.id,
    themeIconGlow: chosenGlow?.id || "neon",
    themeIconAnimation: chosenAnim?.id || "spring_pop_3d",
  };
  if (keepCurrentIconsLock) {
    lockedIconsSnapshot = {
      iconPackStyle: patch.iconPackStyle,
      themeIconGlow: patch.themeIconGlow,
      themeIconAnimation: patch.themeIconAnimation,
    };
  }
  if (state.settings) Object.assign(state.settings, patch);
  applyUiImmersionProfiles(patch);
  await saveSettings(patch);
  applyUiImmersionProfiles(patch);
  try {
    refreshFileManagerIconsForPack(chosenPack.id);
  } catch {}
  emit("theme-changed", currentThemePayload());
  if (!opts.quiet) {
    toast(`🎭 Shuffled System Icons → ${chosenPack.label} · ${chosenAnim?.label || patch.themeIconAnimation} (Theme & FX kept!)`, { kind: "success" });
  }
  return {
    id: chosenPack.id,
    iconPackStyle: patch.iconPackStyle,
    themeIconGlow: patch.themeIconGlow,
    themeIconAnimation: patch.themeIconAnimation,
    packLabel: chosenPack.label,
    animLabel: chosenAnim?.label || patch.themeIconAnimation,
  };
}

/** 14 High-End 3D, Master Motion-Designer & Futuristic Flash-Reloaded 3000 120Hz Folder/Icon Choreographies (`Alt+3` / `⌥3`). */
export const HIGH_END_3D_FOLDER_ANIMATION_IDS = [
  "folder_3d_spin_turntable",
  "flash_2advanced_vector_hud",
  "folder_3d_flip_origami",
  "gyro_3d_cube_matrix",
  "flash_fwa_kinetic_eq",
  "hologram_3d_projector_beam",
  "quantum_3d_phase_split",
  "m4_liquid_metal_morph",
  "c4d_mograph_cloner_wave",
  "houdini_vex_particle_burst",
  "after_effects_graph_overshoot",
  "unreal_nanite_mesh_lod",
  "blender_geometry_nodes_bloom",
  "raytraced_caustic_refraction",
];

/**
 * Cycles through the 14 High-End 3D Spinning Folder, Master Motion-Designer & Futuristic Flash-Reloaded 3000 120Hz animations (`Alt+3` / `⌥3`)
 * and pairs them with the matching 3D Holo Turntable, Cinema 4D MoGraph, Houdini VEX, or Futuristic Flash 3000 Vector HUD UI shader while keeping the user's current theme!
 */
export async function cycleHighEnd3dFolderAnimation(direction = 1, opts = {}) {
  ensureGlobalThemeShortcutsBound();
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const activeKey = (root?.dataset?.palette && root.dataset.palette !== "preview")
    ? root.dataset.palette
    : (wanted || state.settings?.palette || "");
  const curAnim = root?.dataset?.iconAnim || root?.getAttribute?.("data-fx-icon-anim") || state.settings?.themeIconAnimation || "off";
  const idx = HIGH_END_3D_FOLDER_ANIMATION_IDS.indexOf(curAnim);
  const nextIdx = idx < 0
    ? 0
    : (idx + (direction >= 0 ? 1 : -1) + HIGH_END_3D_FOLDER_ANIMATION_IDS.length) % HIGH_END_3D_FOLDER_ANIMATION_IDS.length;
  const nextAnimId = opts.animationId && HIGH_END_3D_FOLDER_ANIMATION_IDS.includes(opts.animationId)
    ? opts.animationId
    : HIGH_END_3D_FOLDER_ANIMATION_IDS[nextIdx];
  const profile = ICON_ANIMATION_PROFILES.find((a) => a.id === nextAnimId) || ICON_ANIMATION_PROFILES[1];
  const isFlash = nextAnimId.startsWith("flash_");
  const isC4d = nextAnimId === "c4d_mograph_cloner_wave" || nextAnimId === "after_effects_graph_overshoot";
  const isHoudini = nextAnimId === "houdini_vex_particle_burst" || nextAnimId === "unreal_nanite_mesh_lod";
  const curUiFx = root?.dataset?.uiFx || root?.getAttribute?.("data-fx-element") || state.settings?.uiElementFx || "auto";
  const nextUiFx = opts.keepUiFx && curUiFx !== "auto" && curUiFx !== "off"
    ? curUiFx
    : isFlash
      ? "flash_3000_vector_hud"
      : isC4d
        ? "c4d_mograph_extrude_folders"
        : isHoudini
          ? "houdini_procedural_vex_hud"
          : "spinning_3d_holo_folders";
  const curGlow = root?.dataset?.iconGlow || root?.getAttribute?.("data-fx-icon-glow") || state.settings?.themeIconGlow || "off";
  const nextGlow = curGlow !== "off" ? curGlow : (isFlash || isHoudini ? "neon" : "xdr_specular");

  const patch = {
    ...(activeKey && state.settings && state.settings.palette !== activeKey ? { palette: activeKey } : {}),
    themeFxOff: false,
    themeIconAnimation: nextAnimId,
    themeIconGlow: nextGlow,
    uiElementFx: nextUiFx,
  };
  if (keepCurrentIconsLock && lockedIconsSnapshot) {
    lockedIconsSnapshot.themeIconAnimation = nextAnimId;
    lockedIconsSnapshot.themeIconGlow = nextGlow;
  }
  if (state.settings) Object.assign(state.settings, patch);
  applyUiImmersionProfiles(patch);
  await saveSettings(patch);
  applyUiImmersionProfiles(patch);
  emit("theme-changed", currentThemePayload());
  if (!opts.quiet) {
    toast(`💿 High-End 3D & Flash 3000 FX → ${profile.label} (120Hz GPU)`, { kind: "success" });
  }
  return {
    id: nextAnimId,
    themeIconAnimation: nextAnimId,
    uiElementFx: nextUiFx,
    themeIconGlow: nextGlow,
    label: profile.label,
  };
}

/**
 * Applies a built-in Screen Filter (`"crt_trinitron_95"`, `"crt_amber_monochrome"`, `"vhs_camcorder_1994"`, `"gameboy_dmg_olive"`, `"davinci_aces_cct_grade"`, `"off"`, etc.)
 * to `document.documentElement` (`data-screen-filter`) and persists it in `state.settings.screenFilter`.
 */
export async function applyScreenFilter(filterId = "off", opts = {}) {
  ensureGlobalThemeShortcutsBound();
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const validPreset = SCREEN_FILTER_PRESETS.find((f) => f.id === filterId) || SCREEN_FILTER_PRESETS[0];
  const nextFilter = validPreset.id;
  const activeKey = (root?.dataset?.palette && root.dataset.palette !== "preview")
    ? root.dataset.palette
    : (wanted || state.settings?.palette || "");
  const patch = {
    ...(activeKey && state.settings && state.settings.palette !== activeKey ? { palette: activeKey } : {}),
    ...(nextFilter !== "off" ? { themeFxOff: false } : {}),
    screenFilter: nextFilter,
  };
  if (keepCurrentEffectsLock && lockedEffectsSnapshot) {
    lockedEffectsSnapshot.screenFilter = nextFilter;
    if (nextFilter && nextFilter !== "off") {
      lockedEffectsSnapshot.fxAttrs = { ...(lockedEffectsSnapshot.fxAttrs || {}), "data-screen-filter": nextFilter };
    } else if (lockedEffectsSnapshot.fxAttrs) {
      delete lockedEffectsSnapshot.fxAttrs["data-screen-filter"];
    }
  }
  if (state.settings) Object.assign(state.settings, patch);
  applyUiImmersionProfiles(patch);
  await saveSettings(patch);
  applyUiImmersionProfiles(patch);
  emit("theme-changed", currentThemePayload());
  if (!opts.quiet) {
    if (nextFilter === "off") {
      toast("📺 Screen Filter OFF — restored pure display output.", { kind: "info" });
    } else {
      toast(`📺 Screen Filter → ${validPreset.label} (${validPreset.desc})`, { kind: "success" });
    }
  }
  return validPreset;
}

/**
 * Cycles to the next or previous built-in Screen Filter (`Alt+F` / `⌥F`).
 */
export async function cycleScreenFilter(direction = 1, opts = {}) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const cur = root?.dataset?.screenFilter || root?.getAttribute?.("data-screen-filter") || state.settings?.screenFilter || "off";
  const ids = SCREEN_FILTER_PRESETS.map((f) => f.id);
  const idx = ids.indexOf(cur);
  const nextIdx = idx < 0
    ? 1
    : (idx + (direction >= 0 ? 1 : -1) + ids.length) % ids.length;
  return await applyScreenFilter(ids[nextIdx], opts);
}

/**
 * Picks a random non-off Screen Filter (`Alt+Shift+F` / `⌥⇧F`) from the 33 CRT, Master Colorist, Cinema, Retro Handheld, Analog & Optical filters.
 */
export async function randomScreenFilter(opts = {}) {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const cur = root?.dataset?.screenFilter || root?.getAttribute?.("data-screen-filter") || state.settings?.screenFilter || "off";
  const activePresets = SCREEN_FILTER_PRESETS.filter((f) => f.id !== "off");
  const pool = activePresets.length > 1 ? activePresets.filter((f) => f.id !== cur) : activePresets;
  const chosen = pool[Math.floor(Math.random() * pool.length)] || activePresets[0];
  return await applyScreenFilter(chosen?.id || "crt_trinitron_95", opts);
}

if (typeof window !== "undefined") {
  window.cycleAppTheme = cycleTheme;
  window.randomAppTheme = (mode, opts) => randomTheme({ ...(opts || {}), mode: mode || "any" });
  window.randomAppColorsKeepFx = (opts) => randomColorsKeepCurrentEffects(opts || {});
  window.applyAppColorsKeepFx = (key, opts) => applyThemeColorsKeepingCurrentEffects(key, opts || {});
  window.toggleAppKeepFxLock = (opts) => toggleKeepEffectsColorSwapMode(opts || {});
  window.shuffleAppSystemIcons = (opts) => shuffleSystemIconsKeepTheme(opts || {});
  window.toggleAppKeepIconsLock = (opts) => toggleKeepIconsOnThemeSwitchMode(opts || {});
  window.cycleApp3dFolderAnimation = (dir, opts) => cycleHighEnd3dFolderAnimation(dir ?? 1, opts || {});
  window.applyAppScreenFilter = (id, opts) => applyScreenFilter(id, opts || {});
  window.cycleAppScreenFilter = (dir, opts) => cycleScreenFilter(dir ?? 1, opts || {});
  window.randomAppScreenFilter = (opts) => randomScreenFilter(opts || {});
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
  let latestPickSeq = 0;
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
      const targetKey = previewKey ?? state.settings?.palette ?? undefined;
      previewKey = null;
      await disableAllThemeAnimations(targetKey !== undefined ? { palette: targetKey, lockKey: targetKey } : {});
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
        h("button", {
          type: "button",
          class: "theme-filter-pill theme-random-fx-pill",
          "data-picker-shuffle-icons": "true",
          title: "Shuffle System Icon Packs, 3D Icon Glow & Animations while keeping your current theme & FX (Alt+I / ⌥I)!",
          onclick: async () => {
            await shuffleSystemIconsKeepTheme();
            renderActiveFxStrip();
          },
        }, "🎭 Shuffle System Icons (Keep Theme · ⌥I)"),
        h("button", {
          type: "button",
          class: `theme-filter-pill theme-keep-fx-lock-btn${keepCurrentIconsLock ? " is-active" : ""}`,
          "data-picker-keep-icons-lock": "true",
          "aria-pressed": String(keepCurrentIconsLock),
          title: "Lock your chosen System Icon Pack & 3D Icon Animation so switching themes never overwrites your icons (Alt+Shift+I / ⌥⇧I)!",
          onclick: () => {
            toggleKeepIconsOnThemeSwitchMode();
            renderActiveFxStrip();
          },
        }, keepCurrentIconsLock ? "🔒 Icons Locked" : "🔓 Lock Icons (⌥⇧I)"),
        h("button", {
          type: "button",
          class: "theme-filter-pill theme-random-fx-pill",
          "data-picker-cycle-3d-folders": "true",
          title: "Cycle High-End 3D Spinning Folders & Futuristic Flash-Reloaded 3000 120Hz Animations (Alt+9 / ⌥9)!",
          onclick: async () => {
            await cycleHighEnd3dFolderAnimation(1);
            renderActiveFxStrip();
          },
        }, "💿 3D Spinning Folders & Flash 3000 (⌥9)"),
        h("button", {
          type: "button",
          class: "theme-filter-pill theme-random-fx-pill",
          "data-picker-cycle-screen-filter": "true",
          title: "Cycle CRT Trinitron, Amber/Green Phosphor, 1999 VHS, Game Boy DMG, Cyber NVG, Matrix & Thermal Screen Filters (Alt+F / ⌥F · Shift+Click for Random ⌥⇧F)!",
          onclick: async (e) => {
            if (e?.shiftKey) await randomScreenFilter();
            else await cycleScreenFilter(1);
            renderActiveFxStrip();
          },
        }, "📺 CRT / Screen Filter (⌥F)"),
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
      : t.uiElementFx === "flash_3000_vector_hud" ? "⚡ Flash 3000 Vector UI"
      : t.uiElementFx === "spinning_3d_holo_folders" ? "💿 3D Spinning Holo UI"
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
        previewKey = null;
        dialogRef?.close(true);
        await pick(t.key, { keepEffectsOnly: Boolean(e?.shiftKey || keepCurrentEffectsLock) });
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
        await pick(t.key, { keepEffectsOnly: true });
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
            latestPickSeq++;
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
    const mySeq = ++latestPickSeq;
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
    if (mySeq !== latestPickSeq) return;
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
          class: "btn theme-history-undo-btn",
          "data-theme-history-undo": "true",
          title: "Undo to previous theme / FX roll (Alt+Z / ⌥Z)",
          onclick: async () => {
            const snap = await undoThemeHistory();
            if (snap) {
              previewKey = snap.palette || "";
              draw();
              updatePinFolderLabel(pinFolderBtn);
            }
          },
        }, "⏪ Undo Look"),
        h("button", {
          type: "button",
          class: "btn theme-history-redo-btn",
          "data-theme-history-redo": "true",
          title: "Redo theme / FX roll (Alt+Shift+Z / ⌥⇧Z)",
          onclick: async () => {
            const snap = await redoThemeHistory();
            if (snap) {
              previewKey = snap.palette || "";
              draw();
              updatePinFolderLabel(pinFolderBtn);
            }
          },
        }, "⏩ Redo Look"),
        h("button", {
          type: "button",
          class: "btn theme-peek-plain-btn",
          "data-theme-peek-btn": "true",
          title: "Hold (or click) to temporarily strip glass, filters & shaders and inspect raw text readability",
          onpointerdown: () => startThemePeekCompare("plain"),
          onpointerup: () => stopThemePeekCompare(),
          onpointerleave: () => stopThemePeekCompare(),
          onclick: () => toggleThemePeekCompare("plain"),
        }, "👁️ Hold to Peek Plain"),
        h("button", {
          type: "button",
          class: "btn theme-poster-export-btn",
          "data-export-theme-poster": "svg",
          title: "Export a 1920×1080 vector SVG Theme Poster Card with 3D folder specimens, AAA Studio Score, and 1-line Share Code",
          onclick: async () => {
            const activeKey = previewKey || state.settings.palette || lastShown[0]?.key || themes[0]?.key || "";
            const activeTheme = themes.find((t) => t.key === activeKey) || null;
            const out = await downloadThemePosterCard({ key: activeKey, theme: activeTheme });
            toast(`📸 Exported 1920×1080 Theme Poster Card: ${out.filename}`, { kind: "success" });
          },
        }, "📸 Poster Card"),
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
  syncThemeHistoryButtons(dialogWrap || document);
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
    const dnaA = inspectThemeDna(themeA);
    const dnaB = inspectThemeDna(themeB);
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
      ["♿ WCAG Text & UI Contrast", `${dnaA.textContrast}:1 (${dnaA.wcagGrade}) · UI ${dnaA.uiContrast}:1 · ${dnaA.harmonyType}`, `${dnaB.textContrast}:1 (${dnaB.wcagGrade}) · UI ${dnaB.uiContrast}:1 · ${dnaB.harmonyType}`],
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

  const grafterSection = h("div", {
    class: "theme-blender-bar",
    "data-theme-dna-grafter": "true",
    role: "region",
    "aria-label": "Theme DNA & 1-Click Aspect Grafter",
  },
    h("div", { class: "theme-blender-head" },
      h("strong", {}, "🧪 Theme DNA Aspect Grafter (Mix & Match Individual Layers from A or B)"),
      h("span", { class: "hint" }, "Graft only Colors, 3D Folders, Icons, Atmosphere, or Typography without overwriting the rest of your look!"),
    ),
    h("div", { class: "theme-pill-row" },
      h("span", { class: "theme-pill-label" }, "◀ Graft from Left (A):"),
      ...THEME_GRAFT_ASPECTS.map((asp) =>
        h("button", {
          type: "button",
          class: "theme-filter-pill",
          "data-graft-a": asp.id,
          title: `${asp.desc} from Theme A`,
          onclick: async () => {
            await graftThemeAspect(selectA.value, asp.id);
          },
        }, `${asp.label} (A)`),
      ),
    ),
    h("div", { class: "theme-pill-row" },
      h("span", { class: "theme-pill-label" }, "▶ Graft from Right (B):"),
      ...THEME_GRAFT_ASPECTS.map((asp) =>
        h("button", {
          type: "button",
          class: "theme-filter-pill",
          "data-graft-b": asp.id,
          title: `${asp.desc} from Theme B`,
          onclick: async () => {
            await graftThemeAspect(selectB.value, asp.id);
          },
        }, `${asp.label} (B)`),
      ),
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
      grafterSection,
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

  const geminiPromptInput = h("input", {
    type: "text",
    class: "prop-input",
    "data-gemini-theme-prompt": "true",
    "aria-label": "Describe the theme you want Google Gemini to create or customize",
    value: "Halloween Jack-O'-Lantern & Polar Aurora Borealis 6K XDR mashup with 120Hz 3D spinning folders",
    placeholder: "e.g., Halloween Jack-O'-Lantern & Polar Aurora mashup with 120Hz 3D spinning folders…",
  });
  const geminiTierSelect = h("select", {
    class: "prop-input",
    "data-gemini-theme-tier": "true",
    "aria-label": "Target system hardware tier for Google Gemini theme generation",
    style: "max-width:250px",
  },
    h("option", { value: "ultra" }, "🔴 Ultra Flagship (120Hz 6K XDR · M4 Ultra)"),
    h("option", { value: "high" }, "🟠 High-Spec (60–120Hz · Dual Shaders)"),
    h("option", { value: "medium" }, "🟡 Medium Balanced (60fps · 1-Layer FX)"),
    h("option", { value: "low" }, "🟢 Low-End Featherweight (0% GPU · Zero Blur)"),
  );

  function synthesizeGeminiThemeFromPrompt(promptText, tierValue) {
    const p = String(promptText || "").toLowerCase();
    const isLight = /\b(light|daylight|paper|e-ink|glacier day|white)\b/.test(p);
    const isHalloween = /\b(halloween|pumpkin|jack-o|october|spooky|witch|ember)\b/.test(p);
    const isPolar = /\b(polar|aurora|ice|glacier|cryo|arctic|frost|snow)\b/.test(p);
    const isFire = /\b(fire|hellfire|inferno|compiz|lava|flame)\b/.test(p);
    const isGold = /\b(gold|sapphire|luxury|rolex|swiss|24k)\b/.test(p);

    const colors = isLight
      ? {
          background: "#f2f8ff",
          text: "#071b2f",
          accent: isHalloween ? "#d95f02" : "#0066cc",
          secondary: "#0097a7",
          card: "#ffffff",
          border: "#b8d8f8",
          danger: "#c62828",
          warning: "#ef6c00",
          success: "#00796b",
          info: "#0277bd",
        }
      : isHalloween && isPolar
      ? {
          background: "#080b18",
          text: "#fff6ec",
          accent: "#ff7700",
          secondary: "#64ffda",
          card: "#11172b",
          border: "#2d3b66",
          danger: "#ff3d00",
          warning: "#ffab00",
          success: "#64ffda",
          info: "#80d8ff",
        }
      : isHalloween
      ? {
          background: "#0d0614",
          text: "#fff4e6",
          accent: "#ff6d00",
          secondary: "#b388ff",
          card: "#170b24",
          border: "#3b1d54",
          danger: "#ff3d00",
          warning: "#ffab00",
          success: "#00e676",
          info: "#b388ff",
        }
      : isPolar
      ? {
          background: "#050d17",
          text: "#eef9ff",
          accent: "#64ffda",
          secondary: "#80d8ff",
          card: "#0a1829",
          border: "#1c3b5e",
          danger: "#ff6e7f",
          warning: "#ffd740",
          success: "#64ffda",
          info: "#80d8ff",
        }
      : isFire
      ? {
          background: "#120603",
          text: "#fff5eb",
          accent: "#ff5722",
          secondary: "#ffd54f",
          card: "#1f0b05",
          border: "#5c220e",
          danger: "#ff1744",
          warning: "#ffd54f",
          success: "#69f0ae",
          info: "#ff9100",
        }
      : isGold
      ? {
          background: "#070912",
          text: "#fffbf0",
          accent: "#ffd54f",
          secondary: "#64b5f6",
          card: "#0f1324",
          border: "#3d351e",
          danger: "#ff5252",
          warning: "#ffd54f",
          success: "#69f0ae",
          info: "#64b5f6",
        }
      : {
          background: "#080c16",
          text: "#f0f7ff",
          accent: "#38bdf8",
          secondary: "#a855f7",
          card: "#11192c",
          border: "#28395c",
          danger: "#f43f5e",
          warning: "#fbbf24",
          success: "#10b981",
          info: "#38bdf8",
        };

    const tierCfg =
      tierValue === "low"
        ? { blur: 0, glass: 0, glowIntensity: 0.25, motion: "zero", atmo: "none", anim: "off" }
        : tierValue === "medium"
        ? {
            blur: 12,
            glass: 0.52,
            glowIntensity: 0.65,
            motion: "spring",
            atmo: isHalloween ? "autumn_leaves" : isPolar ? "snow" : "cinema_bokeh",
            anim: "spring_pop_3d",
          }
        : tierValue === "high"
        ? {
            blur: 22,
            glass: 0.66,
            glowIntensity: 0.85,
            motion: "spring",
            atmo: isHalloween ? "autumn_leaves+embers" : isPolar ? "snow+aurora" : "aurora+cinema_bokeh",
            anim: "orbital_halo_spin",
          }
        : {
            blur: 28,
            glass: 0.74,
            glowIntensity: 1,
            motion: "spring",
            atmo:
              isHalloween && isPolar
                ? "autumn_leaves+embers+aurora_australis"
                : isHalloween
                ? "autumn_leaves+embers+fireflies"
                : isPolar
                ? "blizzard+aurora_australis"
                : isFire
                ? "dragon_forge+embers+solar_flare"
                : "m4_raytrace_prism+cinema_bokeh",
            anim: "folder_3d_spin_turntable",
          };

    const cleanTitle =
      String(promptText || "Gemini Custom Studio")
        .replace(/[^a-zA-Z0-9 '-]+/g, " ")
        .trim()
        .slice(0, 26)
        .trim() || "Gemini Custom";
    const tierSuffix = tierValue === "ultra" ? "6K Ultra" : tierValue === "high" ? "High" : tierValue === "medium" ? "60fps" : "Lite";
    const themeName = `${cleanTitle} ${tierSuffix}`.slice(0, 40);

    return {
      format: "bun-rad-studio-file-manager-theme",
      version: 1,
      name: themeName,
      dark: !isLight,
      base: "Google Gemini AI Studio",
      colors,
      fx: {
        glow: isHalloween || isFire ? "ember" : isPolar ? "aurora" : "bloom",
        glowColor: colors.accent,
        glowColor2: colors.secondary,
        blur: tierCfg.blur,
        glass: tierCfg.glass,
        glowIntensity: tierCfg.glowIntensity,
        borderOpacity: 0.34,
        grain: tierValue === "low" ? "none" : "subtle",
        scanlines: "none",
        radius: "squircle",
        border: tierValue === "low" ? "flat" : "iridescent",
        motion: tierCfg.motion,
        sheen: tierValue !== "low",
        noise: tierValue === "ultra",
        chromatic: false,
        ambient: tierValue !== "low",
        atmosphere: tierCfg.atmo,
        backdropStyle: tierValue === "low" ? "matte" : "liquid",
        cursorEffect: tierValue === "low" ? "none" : "spotlight",
        vignette: tierValue === "low" ? "none" : "cinema",
        saturation: tierValue === "low" ? 1.15 : 1.5,
        uiElementFx: isHalloween ? "holiday_festive_glow" : isPolar ? "cryo_frost" : isFire ? "fire_folders" : isGold ? "swiss_sapphire_chronograph" : "xdr_titanium_folders",
        iconPackStyle: isHalloween ? "us_holidays_festive" : isPolar ? "aurora_nordic_ice" : isFire ? "inferno_burn" : isGold ? "royal_24k_gold_obsidian" : "pro_studio_xdr",
        fontProfile: "humanist_hig",
        cornerProfile: "squircle_hig",
        iconGlow: tierValue === "low" ? "off" : "xdr_specular",
        iconAnimation: tierCfg.anim,
        prismEdge: tierValue !== "low",
        innerGlow: tierValue !== "low",
        frostedRim: tierValue !== "low",
      },
    };
  }

  function buildGeminiMasterPromptText() {
    const tierValue = geminiTierSelect.value || "ultra";
    const userGoal = geminiPromptInput.value.trim() || "Create a high-contrast 6K XDR Ultra theme with 3D spinning folders";
    return [
      "You are a Master UI/UX Theme Architect for the Codecaine File Manager.",
      `Target Hardware Tier: ${tierValue.toUpperCase()} (${tierValue === "low" ? "blur: 0, glass: 0, atmosphere: 'none', iconAnimation: 'off'" : tierValue === "medium" ? "blur: 12, glass: 0.5, 1 atmosphere layer" : tierValue === "high" ? "blur: 22, glass: 0.66, 2 atmosphere layers" : "blur: 28-32, glass: 0.74, 3 atmosphere layers, 120Hz 3D iconAnimation"}).`,
      `User Request: "${userGoal}"`,
      "",
      "Return ONLY valid JSON matching this schema (name <= 40 chars, WCAG AA/AAA contrast >= 7:1 between background/card and text):",
      JSON.stringify(synthesizeGeminiThemeFromPrompt(userGoal, tierValue), null, 2),
    ].join("\n");
  }

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
          "data-share-export-poster": "true",
          title: "Download a 1920×1080 vector SVG Theme Poster Card with 3D folder specimens, AAA Studio Score, and 1-line Share Code",
          onclick: async (e) => {
            const btn = e.currentTarget;
            const selectedKey = themeSelect.value || themes[0]?.key || "";
            const selectedTheme = themes.find((t) => t.key === selectedKey) || null;
            const out = await downloadThemePosterCard({
              key: selectedKey,
              theme: selectedTheme,
              shareCode: activeFormat === "code" ? exportBox.value : "",
            });
            flashCopied(btn, "✓ Poster Exported!");
            toast(`📸 Exported 1920×1080 Theme Poster Card: ${out.filename}`, { kind: "success" });
          },
        }, "📸 Download Theme Poster Card (.svg)"),
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
      h("div", { class: "theme-compare-controls", style: "flex-wrap:wrap;gap:0.45rem;align-items:flex-end;margin-bottom:0.55rem" },
        h("label", { class: "field", style: "flex:1;min-width:260px" },
          h("span", { class: "field-label" }, "🤖 Google Gemini AI Theme Customizer & Prompt Studio (Low · Medium · High · Ultra)"),
          geminiPromptInput
        ),
        h("label", { class: "field" },
          h("span", { class: "field-label" }, "System Hardware Tier"),
          geminiTierSelect
        ),
        h("button", {
          type: "button",
          class: "btn primary",
          "data-gemini-generate-btn": "true",
          title: "Synthesize a custom theme from your prompt for the selected hardware tier (Low, Medium, High, Ultra) and load it into the import box",
          onclick: async (e) => {
            const btn = e.currentTarget;
            const generated = synthesizeGeminiThemeFromPrompt(geminiPromptInput.value, geminiTierSelect.value);
            importBox.value = JSON.stringify(generated, null, 2);
            flashCopied(btn, "✨ Synthesized!");
            toast(`✨ Google Gemini synthesized "${generated.name}" (${geminiTierSelect.value.toUpperCase()} tier) — click Import or Inspect below!`, { kind: "success" });
          },
        }, "✨ Generate with Gemini AI"),
        h("button", {
          type: "button",
          class: "btn",
          "data-gemini-copy-prompt-btn": "true",
          title: "Copy a complete schema-aware Google Gemini LLM prompt so you can customize this theme in gemini.google.com and paste the JSON reply back with ⌘V",
          onclick: async (e) => {
            const btn = e.currentTarget;
            const promptStr = buildGeminiMasterPromptText();
            await copyToClipboard(promptStr);
            importBox.value = JSON.stringify(synthesizeGeminiThemeFromPrompt(geminiPromptInput.value, geminiTierSelect.value), null, 2);
            flashCopied(btn, "✓ Gemini Prompt Copied!");
            toast("📋 Copied Master Prompt for Google Gemini Chat (gemini.google.com) — paste Gemini's JSON response here!", { kind: "success" });
          },
        }, "📋 Copy Prompt for Gemini Chat"),
      ),
      h("div", { class: "theme-compare-controls", style: "justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.45rem" },
        h("h3", { style: "margin:0;font-size:13px" }, "📥 Import Theme Code, JSON, CSS, or Folder (Single & Bulk Import)"),
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
          h("button", {
            type: "button",
            class: "btn",
            "data-share-import-current-folder-btn": "true",
            title: "Bulk-import all .json, .ccfm.txt, and .theme.css files from the currently open File Manager folder (e.g. custom_themes/).",
            onclick: async () => {
              let dir = currentPath();
              try {
                let listed = await call("list", { path: dir, showHidden: false });
                const isThemeEntry = (e) =>
                  !e.isDir &&
                  /\.(?:theme\.json|ccfm\.txt|theme\.css|json|ccfm)$/i.test(e.name) &&
                  !/^(?:readme|package|tsconfig|manifest)/i.test(e.name);
                const entryRank = (e) => {
                  const n = String(e.name || "").toLowerCase();
                  if (/^(?:master|pack|us_holidays)/i.test(n)) return 2;
                  if (/\.json$/i.test(n)) return 0;
                  return 1;
                };
                const sortThemeEntries = (arr) =>
                  arr.filter(isThemeEntry).sort((a, b) => entryRank(a) - entryRank(b) || String(a.name || "").localeCompare(String(b.name || "")));
                let themeEntries = sortThemeEntries(listed?.entries || []);
                if (!themeEntries.length) {
                  const subFolder = (listed?.entries || []).find((e) => e.isDir && /^custom[_-]?themes$/i.test(e.name));
                  if (subFolder?.path) {
                    dir = subFolder.path;
                    listed = await call("list", { path: dir, showHidden: false });
                    themeEntries = sortThemeEntries(listed?.entries || []);
                  }
                }
                if (!themeEntries.length) {
                  toast("No .json or .ccfm theme files found in the current folder.", { kind: "info" });
                  return;
                }
                const collectedThemes = [];
                const seenNames = new Set();
                const rawTokens = [];
                for (const entry of themeEntries.slice(0, 40)) {
                  if (collectedThemes.length >= 20 && /^(?:master|pack|us_holidays)/i.test(String(entry.name || ""))) continue;
                  try {
                    const r = await call("themes/custom/read-file", { path: entry.path });
                    const raw = typeof r?.text === "string" ? r.text.trim() : typeof r?.content === "string" ? r.content.trim() : "";
                    if (!raw) continue;
                    if (raw.startsWith("{") || raw.startsWith("[")) {
                      try {
                        const parsed = JSON.parse(raw);
                        const list = Array.isArray(parsed)
                          ? parsed
                          : parsed && typeof parsed === "object" && Array.isArray(parsed.themes)
                          ? parsed.themes
                          : [parsed];
                        for (const item of list) {
                          if (item && typeof item === "object" && typeof item.name === "string" && item.colors) {
                            const key = item.name.trim().toLowerCase();
                            if (!seenNames.has(key)) {
                              seenNames.add(key);
                              const { shareCode: _sc, ...cleanItem } = item;
                              collectedThemes.push(cleanItem);
                            }
                          }
                        }
                        continue;
                      } catch { /* fall through to rawTokens */ }
                    }
                    rawTokens.push(raw);
                  } catch { /* skip unreadable file */ }
                }
                if (!collectedThemes.length && !rawTokens.length) {
                  toast("Could not read theme files from the current folder.", { kind: "error" });
                  return;
                }
                const folderName = dir.split("/").pop() || dir;
                if (collectedThemes.length > 0) {
                  importBox.value = JSON.stringify(
                    {
                      format: "bun-rad-studio-file-manager-theme-pack",
                      version: 1,
                      themes: collectedThemes,
                    },
                    null,
                    2,
                  );
                  toast(`Loaded ${collectedThemes.length} theme(s) from folder "${folderName}" into bulk import queue.`, { kind: "success" });
                } else {
                  importBox.value = rawTokens.join("\n");
                  toast(`Loaded ${rawTokens.length} theme file(s) from folder "${folderName}" into bulk import queue.`, { kind: "success" });
                }
              } catch (err) {
                toast(err?.message || "Could not scan current folder for themes.", { kind: "error" });
              }
            },
          }, "📁 Load Current Folder Themes"),
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
  ensureZeroWattWindowListenersBound();
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
    // Cmd+0 / Ctrl+0 (Mod+0 outside Code editor and text inputs) -> Instant Toggle / Turn Off Animations & FX on current theme
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.code === "Digit0" || e.code === "Numpad0" || e.key === "0")) {
      const target = e.target;
      const tag = target?.tagName;
      const inEditable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      const inCodeEditor = Boolean(target?.closest?.(".code-ed"));
      if (!inEditable && !inCodeEditor) {
        e.preventDefault();
        void toggleCurrentThemeEffects();
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

    // Alt + Z / Alt + Shift + Z -> 25-Step Theme & Random-Roll Undo / Redo History Stack
    if (code === "KeyZ" || lowKey === "z" || e.key === "Ω" || e.key === "¸") {
      e.preventDefault();
      if (e.shiftKey) void redoThemeHistory();
      else void undoThemeHistory();
      return;
    }

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
    // Alt + I -> Shuffle System Icon Packs & 3D Icon Glow/Animations while keeping current theme & FX (no dialog)
    if (!e.shiftKey && (code === "KeyI" || lowKey === "i")) {
      e.preventDefault();
      void shuffleSystemIconsKeepTheme();
      return;
    }
    // Alt + Shift + I -> Toggle Lock System Icons on Theme Switch (no dialog)
    if (e.shiftKey && (code === "KeyI" || lowKey === "i")) {
      e.preventDefault();
      toggleKeepIconsOnThemeSwitchMode();
      return;
    }
    // Reserve unshifted Option+1..8 (Alt+1..8) exclusively for the top toolbar / viewbar switcher (Files, Home, Tools, Split, Dual, Focus, Places, Ultra Focus)
    if (!e.shiftKey && (/^Digit[1-8]$/.test(code) || /^[1-8]$/.test(lowKey))) {
      if (hudEl && !hasModal) hideQuickCycleHud();
      return;
    }

    // Alt + 9 (or Alt + Shift + 3) -> Cycle High-End 3D Spinning Folders & Futuristic Flash-Reloaded 3000 120Hz Animations (no dialog)
    if (
      code === "Digit9" ||
      lowKey === "9" ||
      e.key === "ª" ||
      (e.shiftKey && (code === "Digit3" || lowKey === "3" || e.key === "£" || e.key === "#" || e.key === "‹"))
    ) {
      e.preventDefault();
      void cycleHighEnd3dFolderAnimation(e.shiftKey ? -1 : 1);
      return;
    }
    // Alt + F -> Cycle CRT / Cinema / Retro Handheld / Analog / Optical Screen Filter (no dialog)
    if (!e.shiftKey && (code === "KeyF" || lowKey === "f")) {
      e.preventDefault();
      void cycleScreenFilter(1);
      return;
    }
    // Alt + Shift + F -> Random CRT / Cinema / Retro Handheld / Analog / Optical Screen Filter (no dialog)
    if (e.shiftKey && (code === "KeyF" || lowKey === "f")) {
      e.preventDefault();
      void randomScreenFilter();
      return;
    }
    // Alt + H -> Cycle Super-Special US Holiday Themes with festive animations & celebration burst (no dialog)
    if (code === "KeyH" || lowKey === "h") {
      e.preventDefault();
      void cycleHolidayTheme(e.shiftKey ? -1 : 1);
      return;
    }
    // Alt + S -> Cycle 3D Desktop Stage & Ambilux Backlight Mode (no dialog)
    if (code === "KeyS" || lowKey === "s") {
      e.preventDefault();
      void cycleWorkspaceStageMode(e.shiftKey ? -1 : 1);
      return;
    }
    // Alt + T -> Cycle Holographic Pointer Reveal & 120Hz Cursor Trail Mode (no dialog)
    if (code === "KeyT" || lowKey === "t") {
      e.preventDefault();
      void cycleCursorTrailMode(e.shiftKey ? -1 : 1);
      return;
    }
    // Alt + W -> Cycle Procedural 8K Desktop Wallpaper Backplate Scene (no dialog)
    if (code === "KeyW" || lowKey === "w") {
      e.preventDefault();
      void cycleDesktopWallpaperScene(e.shiftKey ? -1 : 1);
      return;
    }
    // Alt + M -> Cycle Master AAA Director's Cut 10-Engine Switchboard Preset (no dialog)
    if (code === "KeyM" || lowKey === "m") {
      e.preventDefault();
      void cycleAaaDirectorCutPreset(e.shiftKey ? -1 : 1);
      return;
    }
    // Alt + 0 -> Instant Toggle / Turn Off Animations & FX on current theme (no dialog)
    if (!e.shiftKey && (code === "Digit0" || code === "Numpad0" || lowKey === "0" || e.key === "º")) {
      e.preventDefault();
      void toggleCurrentThemeEffects();
    }
  });
}

ensureGlobalThemeShortcutsBound();

on("view", () => {
  ensureGlobalThemeShortcutsBound();
  syncChameleonFolderMood();
  const map = state.settings?.folderThemes;
  if (!map || typeof map !== "object" || !Object.keys(map).length) return;
  const folderKey = resolveFolderPalette();
  const target = folderKey || state.settings?.palette || "";
  if ((document.documentElement.dataset.palette || "") !== (target || effectiveAutoPalette())) {
    void applyPalette(target);
  }
});
on("theme-picker", (detail) => { ensureGlobalThemeShortcutsBound(); void showThemePicker(detail || {}); });
on("theme-undo", (detail) => { ensureGlobalThemeShortcutsBound(); void undoThemeHistory(detail || {}); });
on("theme-redo", (detail) => { ensureGlobalThemeShortcutsBound(); void redoThemeHistory(detail || {}); });
on("theme-export-poster", (detail) => { ensureGlobalThemeShortcutsBound(); void downloadThemePosterCard(detail || {}); });
on("theme-random", (detail) => { ensureGlobalThemeShortcutsBound(); void randomTheme(detail || {}); });
on("theme-random-colors-keep-fx", (detail) => { ensureGlobalThemeShortcutsBound(); void randomColorsKeepCurrentEffects(detail || {}); });
on("theme-toggle-keep-fx-lock", () => { ensureGlobalThemeShortcutsBound(); toggleKeepEffectsColorSwapMode(); });
on("theme-shuffle-icons", (detail) => { ensureGlobalThemeShortcutsBound(); void shuffleSystemIconsKeepTheme(detail || {}); });
on("theme-toggle-keep-icons-lock", () => { ensureGlobalThemeShortcutsBound(); toggleKeepIconsOnThemeSwitchMode(); });
on("theme-cycle-3d-folders", (detail) => { ensureGlobalThemeShortcutsBound(); void cycleHighEnd3dFolderAnimation(detail?.direction ?? 1, detail || {}); });
on("theme-cycle-screen-filter", (detail) => { ensureGlobalThemeShortcutsBound(); void cycleScreenFilter(detail?.direction ?? 1, detail || {}); });
on("theme-random-screen-filter", (detail) => { ensureGlobalThemeShortcutsBound(); void randomScreenFilter(detail || {}); });
on("theme-cycle-holiday", (detail) => { ensureGlobalThemeShortcutsBound(); void cycleHolidayTheme(detail?.direction ?? 1, detail || {}); });
on("theme-cycle-stage-mode", (detail) => { ensureGlobalThemeShortcutsBound(); void cycleWorkspaceStageMode(detail?.direction ?? 1, detail || {}); });
on("theme-cycle-cursor-trail", (detail) => { ensureGlobalThemeShortcutsBound(); void cycleCursorTrailMode(detail?.direction ?? 1, detail || {}); });
on("theme-cycle-wallpaper", (detail) => { ensureGlobalThemeShortcutsBound(); void cycleDesktopWallpaperScene(detail?.direction ?? 1, detail || {}); });
on("theme-cycle-director-cut", (detail) => { ensureGlobalThemeShortcutsBound(); void cycleAaaDirectorCutPreset(detail?.direction ?? 1, detail || {}); });
on("theme-toggle-fx", (detail) => { ensureGlobalThemeShortcutsBound(); void toggleCurrentThemeEffects(detail || {}); });
on("theme-day-night", () => showDayNightPairDialog());
on("theme-compare", (detail) => showThemeCompareDialog(undefined, detail?.a || "", detail?.b || ""));
on("theme-share", (detail) => showThemeShareDialog(detail?.key || ""));
on("theme-show", () => showThemeShowDialog());
on("theme-paste-import", (detail) => { void pasteImportThemesFromClipboard(detail || {}); });




