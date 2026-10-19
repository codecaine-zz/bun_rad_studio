// Catalog of 160 Atmospheric Special Effects ("none" + 159 live procedural effects) across Low, Medium, and
// High-End / Modern ARM Ultra hardware tiers. Each effect specifies its procedural engine archetype and tuning
// parameters so every effect renders a distinct, theme-harmonized animation.

export const ATMOSPHERE_CATEGORIES = [
  { id: "all", label: "All effects (194)" },
  { id: "weather", label: "⛈️ Weather, Supercells & Storms" },
  { id: "future2126", label: "🛸 Year 2126 / Hyper-Dimensional" },
  { id: "physics", label: "Tesla, Plasma & Sci-Fi Physics" },
  { id: "mist", label: "Volumetric & Mist" },
  { id: "cyber", label: "Cyber, Code & Circuits" },
  { id: "cosmic", label: "Cosmic, Space & Orbits" },
  { id: "nature", label: "Nature, Flora & Ocean" },
  { id: "thermal", label: "Fire, Embers & Plasma" },
  { id: "geometry", label: "Geometry, Grids & Neural" },
];

const GLYPH_SETS = {
  matrix: "0123456789ABCDEFZ<>:+*=-ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ",
  binary: "01",
  hex: "0123456789ABCDEF",
  runes: "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ",
  dna: "ATCGU≡=-:",
  math: "∑∏∫∂∇∆√∞≈≠≤≥±×÷πθλμσφψωαβγ",
  qubits: "01|⟩⟨⊕⊗ΨΦℏ±",
  music: "♩♪♫♬♭♮♯𝄞𝄢",
  alchemy: "☉☽☿♀♂♃♄♅♆♇△▽🜂🜄🜁🜃",
  opcodes: "MOVJMPADDXORCMPPUSHPOPLeaCALLRETNOP",
  braille: "⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟",
};

/**
 * Helper to define an atmospheric effect entry.
 * `section`: "low" | "medium" | "ultra"
 * `cat`: "physics" | "weather" | "mist" | "cyber" | "cosmic" | "nature" | "thermal" | "geometry"
 * `engine`: "tesla" | "physics" | "precip" | "snow" | "mist" | "glyph" | "ember" | "stars" | "orbs" | "nebula" | "aurora" | "grid" | "network" | "waves" | "geometry" | "beams" | "dna" | "circuit" | "radar" | "portal"
 */
const fx = (id, section, cat, icon, label, badge, desc, engine, params = {}) => ({
  id,
  section,
  cat,
  icon,
  label,
  badge,
  desc,
  engine,
  params,
});

export const ATMOSPHERE_OPTIONS = [
  // =================================================================================================================
  // LOW GRAPHICS TIER — Lightweight & Battery Friendly (37 effects)
  // =================================================================================================================
  fx("none", "low", "weather", "⊘", "Off", "0% GPU", "No weather or particle overlay.", "none"),
  fx("stars", "low", "cosmic", "✨", "Starfield", "Low GPU", "Diffraction starlight clusters and shooting meteors tinted to your theme.", "stars", { flareRatio: 0.15, meteorRate: 0.018 }),
  fx("snow", "low", "weather", "❄️", "Snowfall", "Low GPU", "Depth-of-field crystalline snowflakes and soft foreground bokeh flurries.", "snow", { shape: "crystal", sway: 0.7, speed: 1.0 }),
  fx("rain", "low", "weather", "🌧️", "Rain", "Scalable", "Parallax glass rain streaks with motion-blurred tips and perspective ripples.", "precip", { drift: 1.9, speed: 13, len: 22, ripples: true }),
  fx("drizzle", "low", "weather", "🌦️", "Spring Drizzle", "Low GPU", "Gentle vertical silver mist drops with subtle surface rings.", "precip", { drift: 0.4, speed: 7.5, len: 12, ripples: true, densityMul: 0.65 }),
  fx("summer_rain", "low", "weather", "☔", "Warm Sunshower", "Low GPU", "Sunlit golden-tinted raindrops drifting through a warm afternoon haze.", "precip", { drift: 1.1, speed: 10, len: 18, ripples: true, warm: true }),
  fx("powder_snow", "low", "weather", "🌨️", "Alpine Powder", "Low GPU", "Fine, weightless high-altitude snow dust floating on a calm breeze.", "snow", { shape: "flake", sway: 1.2, speed: 0.55, sizeMul: 0.65 }),
  fx("diamond_dust", "low", "weather", "💎", "Arctic Diamond Dust", "Low GPU", "Tiny ice prisms glinting in sub-zero air with sharp specular twinkles.", "snow", { shape: "diamond", sway: 0.35, speed: 0.4, sparkle: true }),
  fx("sakura", "low", "nature", "🌸", "Sakura Blossom", "Botanical", "Graceful cherry blossom petals tumbling and swirling across the workspace.", "snow", { shape: "petal", sway: 1.5, speed: 0.85, spin: 0.04 }),
  fx("autumn_leaves", "low", "nature", "🍂", "Autumn Drift", "Botanical", "Crisp maple and amber leaves gliding on a gentle October wind.", "snow", { shape: "leaf", sway: 1.7, speed: 0.95, spin: 0.035 }),
  fx("dandelion", "low", "nature", "🌼", "Dandelion Seeds", "Botanical", "Weightless silver-white wishes floating upward and sideways on warm thermals.", "snow", { shape: "crystal", sway: 1.4, speed: -0.45, sizeMul: 0.85 }),
  fx("pollen_glow", "low", "nature", "🌾", "Golden Meadow Pollen", "Botanical", "Sun-warmed golden motes drifting lazily through a summer field.", "orbs", { sizeScale: 0.55, pulseSpeed: 0.02, trailCount: 0 }),
  fx("dust_motes", "low", "mist", "🪩", "Library Sunbeams", "Ambient", "Quiet floating dust specks illuminated by soft diagonal indoor light.", "orbs", { sizeScale: 0.45, pulseSpeed: 0.015, trailCount: 0, densityMul: 0.8 }),
  fx("deep_space", "low", "cosmic", "🔭", "Deep Field Stars", "Low GPU", "Thousands of distant pinpoint galaxies and calm, unblinking starlight.", "stars", { flareRatio: 0.05, meteorRate: 0.004, densityMul: 1.3 }),
  fx("meteor_shower", "low", "cosmic", "☄️", "Perseid Meteors", "Celestial", "Frequent high-velocity shooting stars streaking across a clear night sky.", "stars", { flareRatio: 0.1, meteorRate: 0.065 }),
  fx("retro_stars", "low", "cosmic", "🕹️", "8-Bit Star Scroller", "Arcade", "Classic horizontal arcade parallax starfield scrolling from right to left.", "precip", { horizontal: true, drift: -8, speed: 0, len: 6, ripples: false }),
  fx("zen_ripples", "low", "nature", "💧", "Zen Water Garden", "Calm", "Concentric raindrop rings expanding peacefully across a still pond.", "precip", { drift: 0, speed: 18, len: 4, ripples: true, densityMul: 0.35 }),
  fx("champagne", "low", "thermal", "🥂", "Effervescent Bubbles", "Fizzy", "Delicate translucent micro-bubbles rising in steady, sparkling columns.", "ember", { bubbleMode: true, speed: 1.4, trailLen: 0 }),
  fx("sea_foam", "low", "nature", "🫧", "Abyssal Bubbles", "Aquatic", "Slow-rising deep ocean air pearls swaying with underwater currents.", "ember", { bubbleMode: true, speed: 0.75, trailLen: 0 }),
  fx("minimal_dots", "low", "geometry", "⠿", "Minimalist Dot Matrix", "Clean", "Breathing architectural grid of subtle theme-tinted micro-dots.", "geometry", { shape: "dots", speed: 0.4 }),
  fx("lo_fi_waves", "low", "geometry", "〰️", "Lo-Fi Sine Waves", "Chill", "Three calm, minimalist carrier waves undulating slowly in the background.", "waves", { waveCount: 3, amp: 18, speed: 0.012 }),
  fx("horizon_pulse", "low", "mist", "🌅", "Horizon Breathing", "Calm", "Ultra-clean ambient horizon glow that gently inhales and exhales.", "mist", { waveCount: 1, cloudScale: 0.5, densityMul: 0.35 }),
  fx("binary_whisper", "low", "cyber", "0️⃣", "Binary Whisper", "Low GPU", "Sparse, quiet columns of 0 and 1 bits drifting down like digital snow.", "glyph", { charset: GLYPH_SETS.binary, densityMul: 0.5, beamGlow: false }),
  fx("hex_whisper", "low", "cyber", "🔢", "Hexadecimal Telemetry", "Low GPU", "Lightweight stream of base-16 memory nibbles in your theme's accent.", "glyph", { charset: GLYPH_SETS.hex, densityMul: 0.55, beamGlow: false }),
  fx("starlight_mint", "low", "cosmic", "🌟", "Polaris Twinkle", "Low GPU", "Crisp 4-point navigational stars with zero motion-blur overhead.", "stars", { flareRatio: 0.35, meteorRate: 0 }),
  fx("bamboo_leaves", "low", "nature", "🎋", "Bamboo Grove", "Botanical", "Slender emerald-tinted leaves drifting diagonally in a quiet zen breeze.", "snow", { shape: "leaf", sway: 1.1, speed: 0.8, spin: 0.02 }),
  fx("confetti_lite", "low", "geometry", "🎉", "Celebration Flurry", "Festive", "Playful multi-tone geometric confetti shards fluttering gently downward.", "snow", { shape: "diamond", sway: 1.6, speed: 1.2, spin: 0.06 }),
  fx("sonar_ping", "low", "cyber", "📡", "Submarine Sonar", "Tactical", "Periodic concentric acoustic range rings expanding from the center.", "portal", { rings: 4, speed: 0.6, pulseOnly: true }),
  fx("compass_rings", "low", "geometry", "🧭", "Navigator Rings", "Clean", "Thin, high-precision technical dials rotating at instrument-grade speeds.", "radar", { rings: 3, sweep: false, speed: 0.004 }),
  fx("night_snow", "low", "weather", "🏔️", "Midnight Flurry", "Low GPU", "Calm, vertical winter snowfall designed for dark-mode coding sessions.", "snow", { shape: "flake", sway: 0.45, speed: 0.7 }),
  fx("snowglobe", "low", "weather", "🔮", "Winter Snowglobe", "Cozy", "Swirling glittery snowglobe flakes with warm indoor reflections.", "snow", { shape: "crystal", sway: 1.65, speed: 0.65, sparkle: true }),
  fx("firefly_meadow", "low", "nature", "🌿", "Twilight Meadow", "Calm", "Sparse warm fireflies drifting above quiet evening grass.", "orbs", { sizeScale: 0.65, pulseSpeed: 0.022, trailCount: 1, densityMul: 0.65 }),
  fx("pixel_rain", "low", "cyber", "👾", "16-Bit Pixel Rain", "Retro", "Crisp pixel-art rain ticks for retro and arcade themes.", "precip", { drift: 0, speed: 11, len: 8, ripples: false, densityMul: 0.7 }),
  fx("autumn_ginkgo", "low", "nature", "💛", "Golden Ginkgo Fan", "Botanical", "Bright golden ginkgo leaves fluttering in a temple courtyard.", "snow", { shape: "petal", sway: 1.8, speed: 0.75, spin: 0.045 }),
  fx("cottonwood", "low", "nature", "☁️", "Cottonwood Drift", "Botanical", "Soft white cottonwood seeds floating across a sunlit summer sky.", "snow", { shape: "flake", sway: 1.35, speed: 0.35, sizeMul: 0.75 }),
  fx("radar_sweep_lite", "low", "cyber", "🎚️", "Minimalist Radar Sweep", "Tactical", "Clean polar sweep dial for HUD and terminal themes.", "radar", { rings: 2, sweep: true, planets: false, speed: 0.01 }),
  fx("starlight_velvet", "low", "cosmic", "🌌", "Velvet OLED Starlight", "Low GPU", "Ultra-calm high-contrast stars designed for pitch-black OLED themes.", "stars", { flareRatio: 0.22, meteorRate: 0.008, densityMul: 0.85 }),
  fx("oscilloscope_lite", "low", "physics", "〰️", "Tektronix Lissajous Scope", "Vector CRT", "Classic phase-locked X-Y harmonic oscilloscope curve with phosphor trace.", "physics", { mode: "lissajous", curves: 1 }),
  fx("static_sparks", "low", "physics", "⚡", "Electrostatic Micro-Sparks", "Low GPU", "Subtle high-voltage Van de Graaff static discharge ticks and floating ions.", "tesla", { mode: "ball", orbs: 3, arcs: 2 }),
  fx("geiger_scintillation", "low", "physics", "☢️", "Scintillation Phosphor Flashes", "Physics Lab", "Quiet quantum zinc-sulfide detector flashes and Cerenkov pinpoints.", "stars", { flareRatio: 0.45, meteorRate: 0.02, densityMul: 0.7 }),

  // =================================================================================================================
  // MEDIUM GRAPHICS TIER — Volumetric Weather, Streams & Bokeh (55 effects)
  // =================================================================================================================
  fx("smoke", "medium", "mist", "🌫️", "Smoke screen", "Volumetric", "Silky volumetric mist waves, soft Gaussian vapour clouds and ambient light shafts.", "mist", { waveCount: 2, cloudScale: 1.0 }),
  fx("matrix", "medium", "cyber", "🟩", "Digital code rain", "Glyph stream", "Dual-depth cyber glyph streams with luminous phosphor heads and theme-graded trails.", "glyph", { charset: GLYPH_SETS.matrix, beamGlow: true }),
  fx("embers", "medium", "thermal", "🔥", "Embers & ash", "Thermal glow", "Curved glowing spark trajectories, rising thermal shimmer and drifting ash motes.", "ember", { trailLen: 3.4, horizonGlow: true }),
  fx("fireflies", "medium", "nature", "🪲", "Fireflies", "Bioluminescent", "Bioluminescent bokeh light spheres with comet trails and harmonic pulse waves.", "orbs", { sizeScale: 1.0, pulseSpeed: 0.03, trailCount: 3 }),
  fx("monsoon", "medium", "weather", "🌊", "Tropical Monsoon", "Heavy Rain", "Dense, wind-whipped sheets of driving rain and rapid surface splashes.", "precip", { drift: 4.2, speed: 19, len: 32, ripples: true, densityMul: 1.4 }),
  fx("acid_rain", "medium", "cyber", "🧪", "Acid Reactor Rain", "Bio-Hazard", "Luminous toxic-tinted rain streaks with sizzling neon surface rings.", "precip", { drift: 1.4, speed: 14, len: 26, ripples: true, bokehDrops: true }),
  fx("blizzard", "medium", "weather", "🌬️", "Whiteout Blizzard", "Gale", "High-velocity horizontal snow squalls and swirling crystalline vortices.", "snow", { shape: "crystal", sway: 3.2, speed: 2.4, spin: 0.05, densityMul: 1.35 }),
  fx("london_fog", "medium", "mist", "🌁", "Victorian Pea-Soup Fog", "Volumetric", "Thick, slow-rolling bank of layered atmospheric fog and muted bokeh lamps.", "mist", { waveCount: 3, cloudScale: 1.35, speedMul: 0.6 }),
  fx("incense_silk", "medium", "mist", "🪔", "Temple Incense Silk", "Zen Mist", "Graceful rising ribbons of aromatic smoke curling in harmonic waves.", "mist", { waveCount: 3, cloudScale: 0.85, rising: true }),
  fx("dream_clouds", "medium", "mist", "☁️", "Stratosphere Dream", "Soft Cloud", "Billowing high-altitude cumulus puffs tinted with sunset & dawn hues.", "mist", { waveCount: 1, cloudScale: 1.5, densityMul: 1.1 }),
  fx("geothermal_steam", "medium", "mist", "♨️", "Onsen Hot Spring Steam", "Thermal Mist", "Warm, rising vapour plumes and dewy micro-droplets condensing in cool air.", "mist", { waveCount: 2, cloudScale: 1.1, rising: true }),
  fx("ancient_runes", "medium", "cyber", "ᚠ", "Elder Futhark Runes", "Mystic Stream", "Cascading Nordic rune inscriptions glowing with arcane theme light.", "glyph", { charset: GLYPH_SETS.runes, beamGlow: true }),
  fx("dna_code_rain", "medium", "cyber", "🧬", "Genomic Sequence Stream", "Bio-Data", "Streaming nucleotide base pairs (A, T, C, G) with highlighted codons.", "glyph", { charset: GLYPH_SETS.dna, beamGlow: true }),
  fx("math_cascade", "medium", "cyber", "∑", "Euler & Maxwell Stream", "Symbolic", "Falling calculus, tensor and quantum physics notation in luminous columns.", "glyph", { charset: GLYPH_SETS.math, beamGlow: true }),
  fx("qubit_stream", "medium", "cyber", "⚛️", "Quantum Qubit Cascade", "Superposition", "Bra-ket state vectors and tensor symbols streaming through a quantum register.", "glyph", { charset: GLYPH_SETS.qubits, beamGlow: true }),
  fx("alchemy_rain", "medium", "cyber", "🜁", "Hermetic Alchemy Stream", "Esoteric", "Planetary and elemental alchemical glyphs descending in golden proportions.", "glyph", { charset: GLYPH_SETS.alchemy, beamGlow: true }),
  fx("symphony_rain", "medium", "nature", "🎼", "Harmonic Score Cascade", "Musical", "Floating musical notes, clefs and dynamics rising like a visual symphony.", "glyph", { charset: GLYPH_SETS.music, direction: "up", beamGlow: true }),
  fx("opcode_stream", "medium", "cyber", "💾", "Assembly Opcode Dump", "Low-Level", "High-speed CPU instruction mnemonics and register states streaming live.", "glyph", { charset: GLYPH_SETS.opcodes, beamGlow: true }),
  fx("braille_matrix", "medium", "cyber", " Braille", "Tactile Braille Matrix", "Pattern", "Rhythmic dot-matrix Braille glyphs forming shifting typographic textures.", "glyph", { charset: GLYPH_SETS.braille, beamGlow: true }),
  fx("forge_sparks", "medium", "thermal", "⚒️", "Blacksmith Forge Sparks", "High Velocity", "Fast, erratic white-hot iron sparks shooting upward from an anvil.", "ember", { trailLen: 5.5, speed: 2.2, horizonGlow: true }),
  fx("volcano_ash", "medium", "thermal", "🌋", "Pyroclastic Magma & Ash", "Volcanic", "Heavy glowing lava cinders and dark volcanic ash swirling in updrafts.", "ember", { trailLen: 2.5, speed: 1.1, horizonGlow: true, densityMul: 1.3 }),
  fx("campfire", "medium", "thermal", "🏕️", "Woodland Campfire", "Cozy", "Gentle, crackle-like amber sparks and warm hearth light at the bottom edge.", "ember", { trailLen: 3.0, speed: 0.85, horizonGlow: true }),
  fx("sky_lanterns", "medium", "thermal", "🏮", "Festival Sky Lanterns", "Warm Bokeh", "Hundreds of glowing paper lanterns ascending peacefully into the night sky.", "orbs", { sizeScale: 1.35, pulseSpeed: 0.018, rising: true, trailCount: 1 }),
  fx("will_o_wisp", "medium", "nature", "🕯️", "Will-o’-the-Wisps", "Ethereal", "Ghostly dual-tone marsh lights drifting and orbiting in mysterious pairs.", "orbs", { sizeScale: 1.4, pulseSpeed: 0.025, trailCount: 4 }),
  fx("cinema_bokeh", "medium", "mist", "🎬", "Anamorphic Cinema Bokeh", "70mm Lens", "Large, creamy out-of-focus lens bokeh discs gliding across a night city.", "orbs", { sizeScale: 2.4, pulseSpeed: 0.012, trailCount: 0, densityMul: 0.7 }),
  fx("jellyfish_glow", "medium", "nature", "🪼", "Bioluminescent Plankton", "Deep Sea", "Pulsing abyssal organisms that flare with electric light as they drift.", "orbs", { sizeScale: 0.9, pulseSpeed: 0.045, trailCount: 3, densityMul: 1.25 }),
  fx("fairy_glade", "medium", "nature", "🧚", "Enchanted Pixie Dust", "Sparkle", "Shimmering winged light motes leaving sparkling trails through a forest glade.", "orbs", { sizeScale: 0.75, pulseSpeed: 0.055, trailCount: 4 }),
  fx("constellations", "medium", "cosmic", "♈", "Starlight Constellations", "Geometric Sky", "Twinkling stars linked by delicate astronomical chart lines as they drift.", "stars", { flareRatio: 0.25, meteorRate: 0.01, constellationDist: 115 }),
  fx("milky_way", "medium", "cosmic", "🌌", "Galactic Core Band", "Astrophoto", "Dense diagonal river of starlight and soft interstellar dust clouds.", "stars", { flareRatio: 0.18, meteorRate: 0.015, milkyWay: true }),
  fx("caustics", "medium", "nature", "🏊", "Underwater Sun Caustics", "Refraction", "Dancing cathedral-like shafts of refracted sunlight beneath clear turquoise water.", "beams", { style: "caustics", beamCount: 9 }),
  fx("sunbeams", "medium", "nature", "🌤️", "Cathedral God-Rays", "Tyndall Light", "Majestic diagonal shafts of volumetric light piercing through dusty air.", "beams", { style: "godrays", beamCount: 6 }),
  fx("forest_canopy", "medium", "nature", "🌲", "Komorebi Forest Light", "Dappled", "Sunlight filtering through swaying tree leaves with floating woodland spores.", "beams", { style: "komorebi", beamCount: 7 }),
  fx("ocean_swells", "medium", "nature", "🌊", "Bioluminescent Tide", "Fluid Waves", "Rolling multi-layered ocean swells with glowing plankton along the wave crests.", "waves", { waveCount: 5, amp: 28, speed: 0.018, sparkles: true }),
  fx("soundwaves", "medium", "cyber", "🎚️", "Harmonic Studio Visualizer", "Acoustic", "Smooth multi-band audio carrier waves interference-modulating in real time.", "waves", { waveCount: 6, amp: 34, speed: 0.028 }),
  fx("sand_dunes", "medium", "nature", "🏜️", "Desert Sirocco Wind", "Aeolian", "Sweeping golden sand ripples and fine windblown dust shimmering in heat.", "waves", { waveCount: 4, amp: 16, speed: 0.014, sparkles: true }),
  fx("hex_hive", "medium", "geometry", "🐝", "Hexagonal Cyber Hive", "Tessellation", "Breathing honeycomb cells that illuminate in harmonic waves across the screen.", "geometry", { shape: "hex", speed: 0.8 }),
  fx("prism_shards", "medium", "geometry", "💠", "Floating Crystalline Shards", "Refractive", "Translucent geometric glass triangles and diamonds rotating in slow motion.", "geometry", { shape: "shards", speed: 1.0 }),
  fx("origami_drift", "medium", "geometry", "🦢", "Origami Paper Cranes", "Folded", "Crisp geometric paper diamonds gliding along invisible wind currents.", "geometry", { shape: "diamonds", speed: 1.2 }),
  fx("pcb_traces", "medium", "cyber", "🔌", "Motherboard PCB Bus", "Hardware", "Orthogonal 45°/90° gold and copper circuit traces with zipping data pulses.", "circuit", { density: 1.0, speed: 1.0 }),
  fx("subway_neon", "medium", "cyber", "🚇", "Metro Transit Telemetry", "Vector Map", "Glowing multi-line transit conduits with express light packets traveling between nodes.", "circuit", { density: 0.75, speed: 1.35 }),
  fx("cherry_storm", "medium", "nature", "🌺", "Hanami Petal Gale", "Botanical", "Swirling pink and ivory blossom storm with glowing bokeh petals.", "snow", { shape: "petal", sway: 2.6, speed: 1.45, spin: 0.055, densityMul: 1.3 }),
  fx("neon_drizzle", "medium", "cyber", "🌃", "Tokyo Neon Drizzle", "Cyberpunk", "Magenta and cyan reflections rippling under a gentle night rain.", "precip", { drift: 0.8, speed: 11, len: 20, ripples: true, bokehDrops: true }),
  fx("biolum_kelp", "medium", "nature", "🪸", "Coral Reef Spores", "Aquatic", "Glowing reef polyps and drifting iridescent sea spores.", "orbs", { sizeScale: 1.1, pulseSpeed: 0.038, rising: true, trailCount: 2 }),
  fx("solar_wind", "medium", "cosmic", "🌬️", "Heliosphere Solar Wind", "Cosmic", "High-speed ionized particle stream sweeping diagonally across space.", "precip", { horizontal: true, drift: -14, speed: 3, len: 18, ripples: false }),
  fx("vaporwave_sun", "medium", "geometry", "🌴", "Vaporwave Sunset Waves", "Retro 80s", "Segmented sunset glow with calm retro horizon waves.", "waves", { waveCount: 7, amp: 24, speed: 0.016, sparkles: true }),
  fx("katakana_gold", "medium", "cyber", "🈶", "Gilded Katakana Stream", "Cyber", "Golden-tinted katakana and kanji glyph rain with warm bloom.", "glyph", { charset: GLYPH_SETS.matrix, beamGlow: true, densityMul: 1.15 }),
  fx("fjord_mist", "medium", "mist", "🏔️", "Fjord Morning Mist", "Nordic", "Cool slate-blue coastal mist rolling over calm Nordic water.", "mist", { waveCount: 3, cloudScale: 1.2, speedMul: 0.75 }),
  fx("crystal_cavern", "medium", "geometry", "💎", "Amethyst Geode Cavern", "Refractive", "Floating crystalline prisms and subterranean mineral sparkles.", "geometry", { shape: "shards", speed: 0.65 }),
  fx("firework_sparks", "medium", "thermal", "🎆", "Festival Sparkler Trail", "Festive", "Crackle-like golden sparkler trails and drifting warm embers.", "ember", { trailLen: 4.5, speed: 1.8, horizonGlow: true }),
  fx("jacobs_ladder", "medium", "physics", "⚡", "Jacob’s Ladder Voltage Arc", "High Voltage", "Climbing high-voltage electric arcs rising between diverging V-shaped copper electrodes.", "tesla", { mode: "jacobs", arcs: 3 }),
  fx("plasma_globe", "medium", "physics", "🔮", "Nikola Plasma Sphere", "Dielectric Orb", "Glass plasma globe with undulating neon filaments that lock onto your cursor.", "tesla", { mode: "globe", tendrils: 12 }),
  fx("cherenkov_glow", "medium", "physics", "💙", "Cherenkov Reactor Core", "Nuclear Optics", "Hexagonal fuel-rod lattice emitting supersonic blue/accent Cherenkov radiation cones.", "physics", { mode: "cherenkov" }),
  fx("lissajous_harmonics", "medium", "physics", "🎛️", "Harmonic Laser Lissajous", "Phase Space", "Multi-frequency 3D phase-shifting Lissajous laser curves with phosphor persistence.", "physics", { mode: "lissajous", curves: 3 }),
  fx("st_elmos_corona", "medium", "physics", "🔱", "St. Elmo’s Brush Corona", "Ionized Air", "Luminous violet-blue corona discharge plumes dancing along conductive spires.", "tesla", { mode: "coil", coils: 3, arcs: 5 }),
  fx("faraday_cage", "medium", "physics", "🛡️", "Faraday Shield Mesh", "Electromagnetic", "Conductive hexagonal Faraday cage deflecting high-voltage skin-effect arcs.", "tesla", { mode: "cage", arcs: 4 }),

  // =================================================================================================================
  // HIGH-END & MODERN ARM / ULTRA TIER — Out of This World (65 effects)
  // =================================================================================================================
  fx("cyberstorm", "ultra", "cyber", "⛈️", "Cyber Storm", "ARM / Ultra", "High-velocity neon rain, branching plasma lightning arcs and chromatic shockwaves.", "precip", { cyber: true, drift: 2.8, speed: 17, len: 28, ripples: true, lightning: true }),
  fx("nebula", "ultra", "cosmic", "🌌", "Quantum Nebula", "ARM / Ultra", "Volumetric deep-space nebula clouds and relativistic warp-stars that bend to your cursor.", "nebula", { mode: "warp", cloudCount: 10 }),
  fx("aurora", "ultra", "weather", "🌠", "Prismatic Aurora", "ARM / Ultra", "Suspended multi-ribbon aurora borealis curtains with vertical light rays and crystal motes.", "aurora", { ribbons: 5, curtainHeight: 0.26 }),
  fx("black_hole", "ultra", "cosmic", "🕳️", "Gargantua Accretion Disk", "Relativistic", "Swirling relativistic accretion vortex with gravitational light-bending around your cursor.", "nebula", { mode: "orbit", cloudCount: 8, spinSpeed: 0.024 }),
  fx("hyperspace", "ultra", "cosmic", "🚀", "Relativistic Warp Jump", "FTL Drive", "Blazing blue-shifted star streaks stretching into infinity from a movable helm point.", "nebula", { mode: "warp", cloudCount: 4, starSpeedMul: 2.2 }),
  fx("supernova", "ultra", "cosmic", "💥", "Supernova Remnant", "Stellar Burst", "Expanding multi-shell shockwave nebula with high-energy pulsar filaments.", "nebula", { mode: "burst", cloudCount: 12 }),
  fx("spiral_galaxy", "ultra", "cosmic", "🌀", "Andromeda Spiral Arms", "Galactic", "Rotating logarithmic spiral galaxy arms teeming with young blue & magenta stars.", "nebula", { mode: "orbit", cloudCount: 12, spinSpeed: 0.012 }),
  fx("quasar_jet", "ultra", "cosmic", "⚡", "Relativistic Quasar Jet", "Astrophysics", "Twin opposing beams of magnetized plasma and swirling accretion clouds.", "nebula", { mode: "orbit", cloudCount: 9, spinSpeed: 0.03 }),
  fx("aurora_australis", "ultra", "weather", "🎇", "Southern Crown Aurora", "Polar Sky", "Towering crimson, violet and emerald polar curtains dancing with solar wind gusts.", "aurora", { ribbons: 6, curtainHeight: 0.32 }),
  fx("bifrost", "ultra", "cosmic", "🌈", "Bifrost Rainbow Bridge", "Mythic Shader", "Iridescent multi-spectrum crystalline light ribbons and rising star-flare motes.", "aurora", { ribbons: 7, curtainHeight: 0.22 }),
  fx("solar_flare", "ultra", "thermal", "☀️", "Coronal Mass Ejection", "Heliophysics", "Roiling solar prominence arches, magnetic plasma loops and coronal sparks.", "aurora", { ribbons: 5, curtainHeight: 0.28, warm: true }),
  fx("outrun_grid", "ultra", "geometry", "🌇", "Synthwave Outrun 1984", "3D Horizon", "Perspective neon wireframe horizon grid rolling beneath a segmented retro sun.", "grid", { sun: true, speed: 1.2, perspective: true }),
  fx("tron_legacy", "ultra", "cyber", "🏍️", "Lightcycle Arena Grid", "Cyber Grid", "Crisp cyan & cobalt 3D vector horizon grid with high-speed light trails.", "grid", { sun: false, speed: 1.8, perspective: true }),
  fx("holodeck", "ultra", "geometry", "🟨", "Starship Holodeck", "Simulation", "Full-room architectural wireframe grid with shimmering matter-reconstitution nodes.", "grid", { sun: false, ceiling: true, speed: 0.8 }),
  fx("cyber_terrain", "ultra", "geometry", "⛰️", "Wireframe Topographic Mesh", "3D Waves", "Undulating procedural elevation contours scrolling across a digital horizon.", "waves", { waveCount: 9, amp: 42, speed: 0.022, sparkles: true }),
  fx("neural_nexus", "ultra", "geometry", "🧠", "Deep Neural Network", "AI Plexus", "Interactive synaptic nodes that form glowing edges and fire action potentials near your cursor.", "network", { nodeCount: 46, linkDist: 145, pulses: true }),
  fx("quantum_mesh", "ultra", "cosmic", "🕸️", "Quantum Entanglement Web", "Subatomic", "Entangled particle pairs linked by phase-coherent laser filaments and bokeh halos.", "network", { nodeCount: 38, linkDist: 165, pulses: true }),
  fx("mycelium_net", "ultra", "nature", "🍄", "Bioluminescent Mycelium", "Organic Net", "Living forest-floor neural network pulsing with nutrient light packets.", "network", { nodeCount: 42, linkDist: 130, pulses: true }),
  fx("molecular_lattice", "ultra", "geometry", "🧪", "Crystalline Atomic Lattice", "3D Bonds", "Floating covalent molecular structures that flex and re-bond as you move the mouse.", "network", { nodeCount: 34, linkDist: 125, pulses: false }),
  fx("dna_helix", "ultra", "cyber", "🧬", "3D Double Helix Vortex", "Bio-Shader", "Rotating intertwined DNA strands with glowing base-pair rungs and bokeh enzymes.", "dna", { strands: 2, rungs: true, speed: 0.025 }),
  fx("triple_helix", "ultra", "cosmic", "🌀", "Braided Plasma Conduit", "Fusion", "Three phase-locked energy streams braiding across the workspace in harmonic resonance.", "dna", { strands: 3, rungs: false, speed: 0.032 }),
  fx("caduceus_flow", "ultra", "thermal", "⚕️", "Hermetic Twin Serpents", "Harmonic", "Dual counter-rotating ribbons of luminous plasma crowned with star flares.", "dna", { strands: 2, rungs: true, speed: 0.02 }),
  fx("quantum_cpu", "ultra", "cyber", "🖥️", "Cryogenic Quantum Die", "ARM Silicon", "Dense multi-layer silicon interconnect buses with ultra-fast coherent photon packets.", "circuit", { density: 1.5, speed: 1.65 }),
  fx("cyber_veins", "ultra", "cyber", "🦾", "Bionic Neural Circuitry", "Cyberware", "Pulsing synthetic bio-circuits carrying luminous nano-packets across the screen.", "circuit", { density: 1.25, speed: 1.2 }),
  fx("laser_show", "ultra", "cyber", "🔦", "Arena Laser Prism", "Volumetric", "Sweeping coherent laser fans cutting through volumetric stage haze.", "beams", { style: "lasers", beamCount: 10 }),
  fx("northern_pillars", "ultra", "weather", "🏛️", "Arctic Light Pillars", "Ice Optics", "Vertical columns of refracted zenith light suspended in freezing crystalline air.", "beams", { style: "pillars", beamCount: 12 }),
  fx("prism_spectrum", "ultra", "geometry", " треугольник", "Dark Side Prism Refraction", "Dispersion", "Crisp optical light shafts splitting your theme palette into harmonic spectral beams.", "beams", { style: "lasers", beamCount: 7 }),
  fx("astrolabe", "ultra", "cosmic", "☸️", "Celestial Armillary Sphere", "Horology", "Concentric rotating brass & neon astrolabe rings with orbital planet markers.", "radar", { rings: 6, sweep: true, planets: true, speed: 0.008 }),
  fx("tactical_hud", "ultra", "cyber", "🎯", "Fighter Jet Helmet HUD", "Avionics", "High-frequency radar sweep, range-finder reticles and lock-on telemetry rings.", "radar", { rings: 5, sweep: true, planets: false, speed: 0.018 }),
  fx("atomic_shells", "ultra", "cosmic", "⚛️", "Quantum Electron Orbitals", "Bohr / Dirac", "Concentric orbital shells with high-speed glowing electrons and nucleus flare.", "radar", { rings: 5, sweep: false, planets: true, speed: 0.028 }),
  fx("orrery", "ultra", "cosmic", "🪐", "Keplerian Solar Orrery", "Planetary", "Graceful multi-planet solar system orbits with glowing moons and comet trails.", "radar", { rings: 7, sweep: false, planets: true, speed: 0.006 }),
  fx("chrono_portal", "ultra", "cosmic", "⏳", "Dimensional Rift Portal", "Spacetime", "Pulsing concentric spacetime ripples and vortex motes that warp toward your cursor.", "portal", { rings: 9, speed: 1.2 }),
  fx("cymatics", "ultra", "geometry", "🔊", "Chladni Acoustic Resonance", "Cymatics", "Harmonic standing-wave rings and nodal star particles vibrating in geometric symmetry.", "portal", { rings: 11, speed: 0.85 }),
  fx("gravitational_lens", "ultra", "cosmic", "🔭", "Einstein Ring Lensing", "Relativity", "Concentric relativistic light arcs bending distant starlight around a focal mass.", "portal", { rings: 7, speed: 0.55 }),
  fx("sacred_mandala", "ultra", "geometry", "۞", "Sacred Geometry Lotus", "Harmonic", "Counter-rotating polygonal star rings and crystalline vertices in golden ratios.", "geometry", { shape: "mandala", speed: 0.9 }),
  fx("isometric_cubes", "ultra", "geometry", "🧊", "Quantum Tesseract Field", "Hypercube", "Floating 3D wireframe cubes and prisms tumbling through a volumetric light field.", "geometry", { shape: "cubes", speed: 1.1 }),
  fx("plasma_storm", "ultra", "physics", "⚡", "Tesla Coil Plasma Arc", "High Voltage", "Continuous branching high-voltage Tesla coil corona filaments that arc directly to your cursor.", "tesla", { mode: "coil", coils: 2, arcs: 7, interactive: true }),
  fx("dragon_forge", "ultra", "thermal", "🐉", "Dragonfire Maelstrom", "Inferno", "Swirling vortex of high-density embers, thermal shockwaves and rising ash clouds.", "ember", { trailLen: 6.0, speed: 2.6, horizonGlow: true, densityMul: 1.5 }),
  fx("abyssal_trench", "ultra", "nature", "🐋", "Mariana Bioluminescence", "Abyssal Ultra", "Deep-sea caustic shafts, pulsing siphonophore trails and drifting marine snow.", "orbs", { sizeScale: 1.5, pulseSpeed: 0.035, trailCount: 5, densityMul: 1.35 }),
  fx("omega_matrix", "ultra", "cyber", "💻", "Omega Singularity Stream", "ARM / Ultra", "Maximum-density multi-layer katakana, hex & rune code streams with plasma lightning.", "glyph", { charset: GLYPH_SETS.matrix + GLYPH_SETS.runes, beamGlow: true, densityMul: 1.4 }),
  fx("liquid_glass_caustics", "ultra", "geometry", "🫧", "Tahoe Liquid Glass Caustics", "macOS 26 Ultra", "Specular refractive glass caustics and iridescent prism flares.", "beams", { style: "caustics", beamCount: 12 }),
  fx("m4_raytrace_prism", "ultra", "geometry", "💎", "M4 Ray-Traced Prism Field", "Apple Silicon", "Multi-bounce geometric prism shards with wide-gamut Display-P3 dispersion.", "geometry", { shape: "cubes", speed: 1.35 }),
  fx("win11_mica_bloom", "ultra", "mist", "🪟", "DirectX 12 Mica Aurora", "Windows 11 Ultra", "High-saturation DirectComposition aurora ribbons and soft acrylic bokeh.", "aurora", { ribbons: 6, curtainHeight: 0.28 }),
  fx("wormhole_transit", "ultra", "cosmic", "🌀", "Einstein-Rosen Wormhole", "Relativistic", "Twisting spacetime tunnel with relativistic blue-shift starlight.", "portal", { rings: 12, speed: 1.55 }),
  fx("pulsar_magnetar", "ultra", "cosmic", "🌟", "Magnetar Gamma Sweep", "Astrophysics", "Rapidly spinning neutron star beams and magnetic field filaments.", "radar", { rings: 6, sweep: true, planets: true, speed: 0.032 }),
  fx("cyber_samurai", "ultra", "cyber", "⚔️", "Neo-Edo Katana Sparks", "Cyber Ultra", "High-velocity clash sparks, drifting embers and neon voltage arcs.", "ember", { trailLen: 6.5, speed: 2.8, horizonGlow: true, densityMul: 1.4 }),
  fx("quantum_foam", "ultra", "cosmic", "⚛️", "Planck Scale Quantum Foam", "Subatomic", "Fluctuating virtual particle pairs and vacuum energy ripples.", "network", { nodeCount: 52, linkDist: 155, pulses: true }),
  fx("valkyrie_aurora", "ultra", "weather", "🛡️", "Valhalla Celestial Veil", "Mythic Ultra", "Golden-violet polar curtains with ascending rune-like light pillars.", "aurora", { ribbons: 7, curtainHeight: 0.34, warm: true }),
  fx("singularity_core", "ultra", "cosmic", "🕳️", "Kerr Spinning Singularity", "ARM / Ultra", "Frame-dragging accretion vortex with Hawking radiation jets.", "nebula", { mode: "orbit", cloudCount: 14, spinSpeed: 0.035 }),
  fx("tesla_megacoil", "ultra", "physics", "⚡", "Wardenclyffe Magnifying Transmitter", "Mega-Tesla Ultra", "Dual resonance Tesla towers unleashing 12M-volt fractal plasma arcs that track your cursor.", "tesla", { mode: "coil", coils: 3, arcs: 10, mega: true }),
  fx("ball_lightning", "ultra", "physics", "🌐", "Drifting Ball-Lightning Plasmoids", "High Voltage", "Autonomous spherical plasma vortices crackling with internal filaments and inter-orb arcs.", "tesla", { mode: "ball", orbs: 6, arcs: 5 }),
  fx("arc_reactor_core", "ultra", "physics", "💠", "Toroidal Arc Reactor Core", "Palladium Fusion", "Concentric segmented palladium induction rings with high-current radial plasma arcs.", "tesla", { mode: "globe", tendrils: 16, reactor: true }),
  fx("tokamak_fusion", "ultra", "physics", "🔥", "ITER Tokamak Magnetic Torus", "Fusion Physics", "Helical magnetic confinement field lines trapping 150M-kelvin spiraling deuterium-tritium plasma.", "physics", { mode: "tokamak" }),
  fx("lorentz_attractor", "ultra", "physics", "🦋", "Lorenz Strange Attractor Chaos", "Chaos Theory", "Real-time differential integration of chaotic phase-space butterfly trajectories with glowing heads.", "physics", { mode: "lorentz", trails: 24 }),
  fx("hadron_collider", "ultra", "physics", "💥", "CERN LHC Synchrotron Detector", "Particle Physics", "Relativistic proton beam collisions bursting into curved Lorentz-force bubble-chamber spirals.", "physics", { mode: "collider" }),
  fx("ferrofluid_spikes", "ultra", "physics", "🦔", "Rosensweig Ferrofluid Spikes", "Magnetohydrodynamics", "Liquid-metal magnetic peaks that dynamically bristle and orient toward your cursor’s dipole.", "physics", { mode: "ferrofluid" }),
  fx("gravitational_waves", "ultra", "physics", "🌊", "LIGO Spacetime Interferometer", "General Relativity", "Binary black-hole merger quadrupolar spacetime metric ripples and orthogonal laser arms.", "physics", { mode: "gravwave" }),
  fx("hawking_horizon", "ultra", "physics", "🕳️", "Hawking Event Horizon & Jets", "Quantum Gravity", "Relativistic Doppler-beamed accretion torus, photon ring, polar jets and quantum pair creation.", "physics", { mode: "hawking" }),
  fx("meissner_levitation", "ultra", "physics", "🧊", "Meissner Superconductor Flux", "Cryo-Quantum", "Cryogenic Abrikosov magnetic flux vortices and levitating diamagnetic field lines.", "physics", { mode: "tokamak", cryo: true }),
  fx("antimatter_trap", "ultra", "physics", "☢️", "Penning Positron Containment", "Antimatter", "High-vacuum quadrupole magnetic bottle confining annihilating matter-antimatter spiral tracks.", "physics", { mode: "collider", antimatter: true }),
  fx("dyson_swarm", "ultra", "physics", "☀️", "Dyson Swarm Megastructure", "Kardashev II", "Orbital solar-collector mirrors and energy-transfer laser beams encircling a captive star.", "radar", { rings: 8, sweep: true, planets: true, speed: 0.015 }),
  fx("alcubierre_warp", "ultra", "physics", "🛸", "Alcubierre Metric Warp Bubble", "FTL Physics", "Contracting spacetime bow-wave and expanding rear wake bending an Einstein tensor grid.", "physics", { mode: "gravwave", warpBubble: true }),
  fx("casimir_vacuum", "ultra", "physics", "✨", "Casimir Zero-Point Fluctuations", "Quantum Field", "Parallel conducting plates with virtual photon pressure and spontaneous vacuum pair arcs.", "tesla", { mode: "cage", arcs: 6 }),
  fx("quark_gluon_plasma", "ultra", "physics", "🌈", "Quark-Gluon Color Confinement", "QCD Physics", "Relativistic color-charge flux tubes snapping into meson jets under strong-force tension.", "physics", { mode: "collider", qcd: true }),
  fx("tachyon_cherenkov", "ultra", "physics", "⏩", "Tachyon Superluminal Shockcone", "Causal Telemetry", "Faster-than-light causal wavefront cones and time-reversed phase trails.", "physics", { mode: "cherenkov", tachyon: true }),

  // ---- Year 2126 / 100 Years From Now — Hyper-Dimensional & Post-Singularity Xenotech (12 effects) ----
  fx("tesseract_4d", "ultra", "future2126", "💠", "4D Hypercube Stereographic Fold", "Year 2126 · 4D", "True 16-vertex, 32-edge 4-dimensional tesseract rotating across XW, YW & ZW planes with stereographic projection and cursor-coupled 4D tilt.", "future2126", { mode: "tesseract" }),
  fx("calabi_yau", "ultra", "future2126", "🧬", "11D Calabi-Yau String Manifold", "Year 2126 · 11D", "11-dimensional superstring compactification manifold with morphing complex-plane Riemann sheets and iridescent string-tension filaments.", "future2126", { mode: "calabi_yau" }),
  fx("penrose_quasicrystal", "ultra", "future2126", "✴️", "Aperiodic Penrose Quasicrystal", "Year 2126 · 5-Fold", "Non-repeating 5-fold and 10-fold Fourier quasicrystal interference wavefield with golden-ratio phason flips.", "future2126", { mode: "quasicrystal" }),
  fx("klein_mobius", "ultra", "future2126", "♾️", "Non-Orientable Klein Bottle Immersion", "Year 2126 · Topology", "4D figure-8 Klein bottle topological immersion where inside and outside continuously invert with normal-vector plasma flow.", "future2126", { mode: "klein" }),
  fx("chronos_retrocausal", "ultra", "future2126", "⏳", "Retrocausal Closed Timelike Curves", "Year 2126 · Time Loop", "Tipler-Gödel retrocausal telemetry: particles project future ghost echoes ahead of their path while twin entropy clocks phase-cancel.", "future2126", { mode: "retrocausal" }),
  fx("eigen_consciousness", "ultra", "future2126", "🧠", "Matrioshka Brain Eigen-Consciousness", "Year 2126 · Dyson AI", "Post-biological stellar Matrioshka shells exchanging braided soliton thought-wavepackets and holographic eigen-glyph bursts.", "future2126", { mode: "matrioshka" }),
  fx("strangelet_condensate", "ultra", "future2126", "🔮", "Supersolid Strange-Matter Condensate", "Year 2126 · Matter", "Zero-viscosity supersolid quantum matter state that simultaneously flows like a superfluid and locks into glowing hyper-facets.", "future2126", { mode: "supersolid" }),
  fx("metric_fold_origami", "ultra", "future2126", "📐", "Spacetime Origami Metric Folding", "Year 2126 · Metric", "Reality creasing and unfolding along non-Euclidean geodesic hinges that refract starlight across dimensional folds.", "future2126", { mode: "origami_metric" }),
  fx("tachyon_braid_2126", "ultra", "future2126", "🪢", "Anyon Braiding Quantum Loom", "Year 2126 · Anyons", "Fibonacci non-Abelian anyons braiding worldlines in 2+1D spacetime to execute topological quantum gates with Berry-phase rings.", "future2126", { mode: "anyon_braid" }),
  fx("void_metamaterial", "ultra", "future2126", "🕳️", "Negative-Index Cloaking Metamaterial", "Year 2126 · Optics", "Sub-wavelength metamaterial resonator lattice bending wavefronts backward (n < 0) around your cursor like a phase-reversal cloak.", "future2126", { mode: "metamaterial" }),
  fx("omega_point_2126", "ultra", "future2126", "👁️", "Omega Point Cosmological Convergence", "Year 2126 · Omega", "Final-state cosmological convergence where all geodesic trajectories spiral simultaneously inward and outward through a 4D horizon.", "future2126", { mode: "omega_point" }),
  fx("xenotech_biolith", "ultra", "future2126", "🦠", "Living Crystalline Xenotech Biolith", "Year 2126 · Utility Fog", "Self-assembling 2126 programmable utility-fog polyhedra that morph into living geometric organs and react to your cursor.", "future2126", { mode: "xenotech" }),

  // -- Extreme Meteorology, Supercells, Tornadoes & Planetary Storms (16 new Weather & Storm effects) ---------------
  fx("supercell_tornado", "ultra", "weather", "🌪️", "EF5 Supercell Tornado & Mesocyclone", "Severe Storm · EF5", "Rotating mesocyclone wall cloud with a twisting condensation funnel vortex, swirling debris cloud, and anvil crawler lightning.", "weather_storm", { mode: "tornado" }),
  fx("category5_hurricane", "ultra", "weather", "🌀", "Category 5 Hurricane Eyewall", "Cyclone · 185 MPH", "Logarithmic spiral rainbands whipping around a calm stadium-effect eye with eyewall lightning bursts and ocean spray.", "weather_storm", { mode: "hurricane" }),
  fx("red_sprite_storm", "ultra", "weather", "🦑", "Mesospheric Red Sprites & Blue Jets", "Upper Atmosphere", "Crimson jellyfish red sprites, stratospheric blue starter jets, and ionospheric ELVES rings firing above a severe thunderstorm anvil.", "weather_storm", { mode: "red_sprites" }),
  fx("derecho_squall", "ultra", "weather", "⛈️", "Derecho Bow-Echo Squall & Microburst", "100 MPH Wind Shear", "Horizontal wind-sheared rain curtains, downburst splash vortexes, and rapid staccato cloud-to-ground fork lightning.", "weather_storm", { mode: "derecho" }),
  fx("thundersnow_gale", "ultra", "weather", "❄️", "Arctic Thundersnow & Graupel Gale", "Electrified Blizzard", "Turbulent winter cyclone with swirling snow squalls, muffled violet-blue cloud flashes, and wind-driven ice crystals.", "weather_storm", { mode: "thundersnow" }),
  fx("haboob_dust_wall", "ultra", "weather", "🏜️", "Sahara Haboob & Dry Lightning Wall", "Triboelectric Storm", "Towering rolling copper-amber sandstorm front with triboelectric static dust-devil lightning and swirling silt eddies.", "weather_storm", { mode: "haboob" }),
  fx("hail_supercell", "ultra", "weather", "🧊", "Emerald Sky Hailstorm & Mammatus", "Severe Hail Core", "Eerie green-tinted severe storm sky with pouch-like mammatus cloud undulation, bouncing ice hailstones, and sheet lightning.", "weather_storm", { mode: "hail_mammatus" }),
  fx("waterspout_vortex", "ultra", "weather", "🌊", "Tornadic Marine Waterspout", "Oceanic Vortex", "Twin translucent oceanic waterspout columns drawing glowing sea-spray spirals from churning storm swells into a dark cumulus base.", "weather_storm", { mode: "waterspout" }),
  fx("volcanic_lightning", "ultra", "weather", "🌋", "Pyroclastic Dirty-Thunderstorm Plume", "Volcanic Tempest", "Boiling volcanic ash column with hyper-frequent magenta-orange electrostatic lightning arcs and glowing tephra rain.", "weather_storm", { mode: "volcanic_storm" }),
  fx("freezing_ice_storm", "ultra", "weather", "🥶", "Glaze Ice Storm & Sleet Needles", "Sub-Zero Squall", "High-velocity diagonal sleet needles with crystalline frost accretion halos and shivering silver wind gusts.", "weather_storm", { mode: "ice_storm" }),
  fx("jupiter_red_spot", "ultra", "weather", "🪐", "Jovian Great Red Spot Anticyclone", "Planetary Hyper-Storm", "Planetary-scale crimson-ammonia anticyclonic vortex with counter-flowing zonal jet streams and ammonia-ice mega-bolts.", "weather_storm", { mode: "jupiter_spot" }),
  fx("saturn_hex_storm", "ultra", "weather", "⬡", "Saturn North Polar Hexagon Jet", "Rossby Wave Storm", "6-sided standing Rossby wave polar jet stream rotating around a towering eye vortex with hydrocarbon lightning.", "weather_storm", { mode: "saturn_hex" }),
  fx("neptune_diamond_rain", "ultra", "weather", "💎", "Neptunian Supersonic Diamond Squall", "1,200 MPH Ice Giant", "Supersonic methane wind shear condensing pressurized carbon into glittering falling diamond hailstones.", "weather_storm", { mode: "diamond_squall" }),
  fx("venus_acid_lightning", "ultra", "weather", "🟡", "Venusian Sulfuric Vortex & Cloud Flash", "Super-Rotating Deck", "Dense golden-amber super-rotating cloud deck with horizontal sulfuric virga and warm baritone cloud-to-cloud discharges.", "weather_storm", { mode: "venus_storm" }),
  fx("aurora_thunder_squall", "ultra", "weather", "🌌", "Geomagnetic Aurora Super-Squall", "Sub-Auroral Gale", "High-latitude storm where a violently dancing sub-auroral green/violet curtain collides with a driving coastal rain squall.", "weather_storm", { mode: "aurora_squall" }),
  fx("monsoon_microburst", "ultra", "weather", "🌧️", "Tropical Monsoon Cloudburst & Downburst", "Torrential Sheet", "Torrential vertical cloudburst sheets with multi-ring surface hydro-splashes, rolling mist banks, and warm sheet lightning.", "weather_storm", { mode: "microburst" }),
  fx("debris_tornado_ef5", "ultra", "weather", "🏚️", "EF5 Wedge Tornado: Leaves, Shingles & Debris", "M4 Extreme · 300 MPH", "Multi-vortex EF5 wedge tornado tearing 3D-tumbling leaves, wooden splinters, corrugated tin roof shards, papers, and powerline sparks into a rotating debris cloud.", "weather_storm", { mode: "debris_tornado" }),
  fx("urban_cyclone_debris", "ultra", "weather", "📰", "Street-Canyon Cyclone: Flying Papers, Leaves & Trash", "M4 Extreme · Urban Gale", "Howling street-canyon gale whipping fluttering newspaper pages, autumn leaves, cardboard fragments, wrappers, and blown transformer arcs across wet asphalt.", "weather_storm", { mode: "urban_debris" }),
  fx("autumn_noreaster_gale", "ultra", "weather", "🍁", "October Nor'easter: 1,000-Leaf Gale & Squall", "M4 Extreme · Foliage", "Ferocious autumn tempest hurling hundreds of 3D-spinning maple/oak leaves, broken twigs, pine needles, and diagonal rain curtains through turbulent wind gusts.", "weather_storm", { mode: "leaf_gale" }),
  fx("junkyard_maelstrom", "ultra", "weather", "⚙️", "Scrapyard Magnetic Maelstrom & Shrapnel Vortex", "M4 Extreme · Shrapnel", "Industrial storm vortex lifting spinning sheet-metal shards, bolts, loose wires, rust flakes, and high-voltage transformer arcs into a blinding lightning funnel.", "weather_storm", { mode: "junkyard_vortex" }),
  fx("forest_canopy_tempest", "ultra", "weather", "🌲", "Timberline Derecho: Stripped Foliage, Bark & Hail", "M4 Extreme · Canopy", "Violent timberline squall stripping green canopy leaves, twigs, bark chips, and bouncing hailstones under continuous anvil-crawler lightning.", "weather_storm", { mode: "canopy_tempest" }),
  fx("cyber_alley_typhoon", "ultra", "weather", "🏮", "Neo-Tokyo Typhoon: Neon Flyers, Petals & Arcs", "M4 Extreme · Typhoon", "Cyberpunk super-typhoon whipping wet neon flyers, cherry petals, street litter, sparks from blown junction boxes, and torrential rain curtains across the screen.", "weather_storm", { mode: "cyber_typhoon" }),
];

export const ATMOSPHERE_BY_ID = new Map(ATMOSPHERE_OPTIONS.map((o) => [o.id, o]));
export const ATMOSPHERE_IDS = ATMOSPHERE_OPTIONS.map((o) => o.id);
export const MAX_ATMOSPHERE_LAYERS = 6;

/** Alias map for shorthand / wizard / studio-kit atmosphere IDs so every preset and custom recipe resolves cleanly. */
export const ATMOSPHERE_ALIASES = {
  steampunk_gears: "astrolabe",
  god_rays: "sunbeams",
  prism_spectrum: "m4_raytrace_prism",
  starburst: "firework_sparks",
  runes: "ancient_runes",
  warp_speed: "hyperspace",
  starfield: "stars",
  crimson_ash: "volcano_ash",
  abyssal_trench: "jellyfish_glow",
  vhs_tracking: "radar_sweep_lite",
  static_snow: "static_sparks",
  tahoe_caustics: "liquid_glass_caustics",
  hud_reticle: "tactical_hud",
  sakura_drift: "sakura",
  cryo_blizzard_2126: "blizzard",
  aurora_ribbons: "aurora",
  aurora_borealis: "aurora",
  retro_grid: "outrun_grid",
  omega_matrix: "matrix",
  red_sprites: "red_sprite_storm",
  toxic_slime: "acid_rain",
  bio_spores: "mycelium_net",
  fireworks: "firework_sparks",
  confetti: "confetti_lite",
  warp_tunnel: "wormhole_transit",
  plasma_arcs: "plasma_storm",
  matrix_code: "matrix",
  circuit_traces: "pcb_traces",
  thunderstorm: "cyberstorm",
};

export function resolveAtmosphereToken(tok) {
  const clean = typeof tok === "string" ? tok.trim() : "";
  if (!clean) return "";
  return ATMOSPHERE_ALIASES[clean] || clean;
}

/** Curated multi-layer atmospheric combinations users can activate with one click or customize in the Mixer. */
export const ATMOSPHERE_MIX_PRESETS = [
  { id: "debris_tornado_ef5+urban_cyclone_debris+hail_supercell+derecho_squall", icon: "🏚️🌪️", label: "M4 Max: EF5 Debris Apocalypse", desc: "EF5 Wedge Debris Tornado + Urban Flying Papers/Leaves + Hail + 100 MPH Derecho" },
  { id: "autumn_noreaster_gale+forest_canopy_tempest+monsoon_microburst", icon: "🍁⛈️", label: "M4 Max: 1,000-Leaf Nor'easter", desc: "October Leaf Gale + Stripped Canopy Timberline Squall + Monsoon Downburst" },
  { id: "junkyard_maelstrom+tesla_megacoil+supercell_tornado", icon: "⚙️⚡", label: "M4 Max: Shrapnel & Mega-Tesla", desc: "Scrapyard Shrapnel Vortex + Wardenclyffe Mega-Tesla + EF5 Mesocyclone" },
  { id: "cyber_alley_typhoon+derecho_squall+cyberstorm", icon: "🏮🌧️", label: "M4 Max: Neo-Tokyo Super-Typhoon", desc: "Flying Neon Flyers & Petals + Derecho Wind Shear + Cyber Lightning Storm" },
  { id: "supercell_tornado+hail_supercell+cyberstorm", icon: "🌪️⚡", label: "Storm: Tornado Alley EF5", desc: "EF5 Supercell Tornado + Emerald Hailstorm + Fork Lightning" },
  { id: "category5_hurricane+waterspout_vortex+monsoon_microburst", icon: "🌀🌊", label: "Storm: Category 5 Landfall", desc: "Cat-5 Hurricane Eyewall + Marine Waterspout + Monsoon Cloudburst" },
  { id: "red_sprite_storm+derecho_squall+plasma_storm", icon: "🦑⛈️", label: "Storm: Mesospheric Red Sprites", desc: "Red Sprites & Blue Jets + Derecho Bow-Echo + Tesla Plasma" },
  { id: "thundersnow_gale+blizzard+freezing_ice_storm", icon: "❄️🌩️", label: "Storm: Arctic Bomb Cyclone", desc: "Electrified Thundersnow + Whiteout Blizzard + Glaze Ice Storm" },
  { id: "haboob_dust_wall+volcanic_lightning+embers", icon: "🏜️🌋", label: "Storm: Triboelectric Haboob", desc: "Sahara Haboob Dust Wall + Volcanic Dirty Lightning + Glowing Embers" },
  { id: "jupiter_red_spot+saturn_hex_storm+neptune_diamond_rain", icon: "🪐💎", label: "Storm: Gas Giant Hyper-Vortex", desc: "Jovian Great Red Spot + Saturn Polar Hexagon + Neptunian Diamond Rain" },
  { id: "aurora_thunder_squall+derecho_squall+smoke", icon: "🌌⛈️", label: "Storm: North Sea Super-Squall", desc: "Geomagnetic Aurora Squall + 100 MPH Derecho + Rolling Sea Mist" },
  { id: "volcanic_lightning+dragon_forge+monsoon_microburst", icon: "🌋⚡", label: "Storm: Krakatoa Ash Tempest", desc: "Pyroclastic Lightning Plume + Volcanic Updraft + Monsoon Downburst" },
  { id: "tesseract_4d+calabi_yau+chronos_retrocausal", icon: "💠🧬", label: "2126: 11D Hyperspace Fold", desc: "4D Tesseract + 11D Calabi-Yau Manifold + Retrocausal Time Loops" },
  { id: "eigen_consciousness+tachyon_braid_2126+dyson_swarm", icon: "🧠🪢", label: "2126: Matrioshka God-Mind", desc: "Matrioshka Brain + Anyon Braiding Loom + Dyson Swarm" },
  { id: "klein_mobius+penrose_quasicrystal+void_metamaterial", icon: "♾️✴️", label: "2126: Non-Euclidean Glitch", desc: "Klein Bottle Immersion + Penrose Quasicrystal + Negative-Index Cloak" },
  { id: "xenotech_biolith+strangelet_condensate+ferrofluid_spikes", icon: "🦠🔮", label: "2126: Utility Fog Swarm", desc: "Living Xenotech Biolith + Supersolid Condensate + Ferrofluid Spikes" },
  { id: "omega_point_2126+hawking_horizon+tesla_megacoil", icon: "👁️⚡", label: "2126: Omega Transcendence", desc: "Omega Point Convergence + Hawking Horizon + Wardenclyffe Mega-Tesla" },
  { id: "metric_fold_origami+alcubierre_warp+gravitational_waves", icon: "📐🛸", label: "2126: Spacetime Origami Drive", desc: "Spacetime Origami Creases + Alcubierre Warp + LIGO Waves" },
  { id: "calabi_yau+quark_gluon_plasma+quantum_foam", icon: "🧬🌈", label: "2126: Planck String Loom", desc: "11D Calabi-Yau Manifold + Quark-Gluon Plasma + Quantum Foam" },
  { id: "chronos_retrocausal+tachyon_cherenkov+wormhole_transit", icon: "⏳⏩", label: "2126: Paradox Time-Engine", desc: "Retrocausal Time Curves + Tachyon Shockcone + Einstein-Rosen Wormhole" },
  { id: "plasma_storm+tesla_megacoil+ball_lightning", icon: "⚡🌐", label: "Wardenclyffe Overdrive", desc: "Tesla Coil Plasma Arc + Magnifying Transmitter + Ball Lightning" },
  { id: "tokamak_fusion+plasma_storm+arc_reactor_core", icon: "🔥💠", label: "ITER Tokamak Ignition", desc: "Tokamak Magnetic Torus + Tesla Plasma + Arc Reactor Core" },
  { id: "hadron_collider+antimatter_trap+cherenkov_glow", icon: "💥☢️", label: "CERN Antimatter Run", desc: "LHC Synchrotron + Penning Positron Trap + Cherenkov Core" },
  { id: "hawking_horizon+gravitational_waves+alcubierre_warp", icon: "🕳️🌊", label: "Einstein-Hawking Singularity", desc: "Hawking Event Horizon + LIGO Spacetime Waves + Alcubierre Warp" },
  { id: "lorentz_attractor+lissajous_harmonics+math_cascade", icon: "🦋🎛️", label: "Chaos & Phase-Space Lab", desc: "Lorenz Strange Attractor + Laser Lissajous + Euler Stream" },
  { id: "ferrofluid_spikes+meissner_levitation+plasma_globe", icon: "🦔🧊", label: "High-Field Magnetics Lab", desc: "Ferrofluid Spikes + Meissner Superconductor + Plasma Sphere" },
  { id: "jacobs_ladder+st_elmos_corona+faraday_cage", icon: "⚡🔱", label: "Nikola’s Colorado Springs Lab", desc: "Jacob’s Ladder + St. Elmo’s Corona + Faraday Shield" },
  { id: "dyson_swarm+solar_flare+tachyon_cherenkov", icon: "☀️⏩", label: "Kardashev Type-II Forge", desc: "Dyson Swarm + Coronal Mass Ejection + Tachyon Shockcone" },
  { id: "cyberstorm+outrun_grid+smoke", icon: "⛈️🌇", label: "Blade Runner 2084", desc: "Cyber Storm + Synthwave Grid + Volumetric Mist" },
  { id: "sakura+fireflies+aurora", icon: "🌸🪲", label: "Enchanted Sakura Night", desc: "Sakura Blossom + Fireflies + Prismatic Aurora" },
  { id: "black_hole+meteor_shower+quantum_mesh", icon: "🕳️☄️", label: "Singularity Horizon", desc: "Gargantua Black Hole + Meteors + Quantum Web" },
  { id: "matrix+neural_nexus+pcb_traces", icon: "🟩🧠", label: "Neural Matrix Core", desc: "Digital Code Rain + AI Neural Nexus + PCB Traces" },
  { id: "caustics+jellyfish_glow+sea_foam", icon: "🏊🪼", label: "Abyssal Sanctuary", desc: "Underwater Caustics + Plankton + Abyssal Bubbles" },
  { id: "dragon_forge+plasma_storm+embers", icon: "🐉⚡", label: "Volcanic Ragnarok", desc: "Dragonfire Maelstrom + Tesla Plasma + Embers" },
  { id: "astrolabe+constellations+incense_silk", icon: "☸️♈", label: "Celestial Observatory", desc: "Armillary Sphere + Constellations + Temple Incense" },
  { id: "blizzard+aurora_australis+northern_pillars", icon: "🌬️🎇", label: "Polar Crown Storm", desc: "Whiteout Blizzard + Southern Aurora + Light Pillars" },
  { id: "bamboo_leaves+zen_ripples+sky_lanterns", icon: "🎋🏮", label: "Kyoto Lantern Garden", desc: "Bamboo Grove + Zen Water Ripples + Sky Lanterns" },
  { id: "dna_helix+qubit_stream+chrono_portal", icon: "🧬⏳", label: "Helix Spacetime Core", desc: "3D DNA Helix + Qubit Cascade + Dimensional Portal" },
  { id: "outrun_grid+hyperspace+laser_show", icon: "🌇🚀", label: "Retro Synth Odyssey", desc: "Synthwave Grid + Warp Jump + Arena Laser Prism" },
  { id: "sacred_mandala+alchemy_rain+will_o_wisp", icon: "۞🜁", label: "Alchemist’s Vault", desc: "Sacred Lotus + Hermetic Alchemy + Will-o’-the-Wisps" },
  { id: "liquid_glass_caustics+m4_raytrace_prism+aurora", icon: "🫧💎", label: "Tahoe Liquid Glass Pro", desc: "Liquid Glass Caustics + M4 Prism Field + Aurora" },
  { id: "m4_raytrace_prism+singularity_core+quantum_cpu", icon: "🍎🖥️", label: "M4 Max Neural Core", desc: "M4 Prism Field + Kerr Singularity + Quantum Die" },
  { id: "win11_mica_bloom+cinema_bokeh+lo_fi_waves", icon: "🪟🎬", label: "Windows 11 Fluent Dream", desc: "DirectX 12 Mica Aurora + Cinema Bokeh + Sine Waves" },
  { id: "cyber_samurai+cherry_storm+neon_drizzle", icon: "⚔️🌺", label: "Ghost of Neo-Tokyo", desc: "Katana Sparks + Hanami Petal Gale + Neon Drizzle" },
  { id: "wormhole_transit+pulsar_magnetar+deep_space", icon: "🌀🌟", label: "Interstellar Odyssey", desc: "Einstein-Rosen Wormhole + Magnetar + Deep Space" },
  { id: "valkyrie_aurora+ancient_runes+snow", icon: "🛡️ᚠ", label: "Asgard Winter Bifrost", desc: "Valhalla Veil + Elder Futhark Runes + Snowfall" },
  { id: "quantum_foam+triple_helix+laser_show", icon: "⚛️🔦", label: "CERN Collider Chamber", desc: "Quantum Foam + Braided Plasma + Laser Prism" },
  { id: "crystal_cavern+biolum_kelp+fairy_glade", icon: "💎🪸", label: "Subterranean Crystal Sea", desc: "Amethyst Geode + Coral Spores + Pixie Dust" },
];

/**
 * Parses an atmosphere setting or theme value (e.g. `"rain"`, `"rain+aurora+stars"`, or `["rain", "aurora"]`)
 * into a deduplicated array of up to `MAX_ATMOSPHERE_LAYERS` valid non-"none" effect IDs.
 */
export function parseAtmosphereIds(raw) {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[+,]/).map((s) => s.trim()).filter(Boolean)
      : [];
  const out = [];
  for (const rawId of parts) {
    const id = resolveAtmosphereToken(rawId);
    if (!id || id === "none") continue;
    if (ATMOSPHERE_BY_ID.has(id) && !out.includes(id)) {
      out.push(id);
      if (out.length >= MAX_ATMOSPHERE_LAYERS) break;
    }
  }
  return out;
}

/**
 * Normalizes an atmosphere value into `"none"`, a single effect ID (`"rain"`), or a `+`-joined mix (`"rain+aurora"`).
 * When `strict` is true, returns `null` if any token is unknown or the input is not a non-empty string.
 */
export function normalizeAtmosphereSpec(raw, { strict = false } = {}) {
  if (strict) {
    if (typeof raw !== "string" || !raw.trim()) return null;
    const tokens = raw.split(/[+,]/).map((s) => resolveAtmosphereToken(s)).filter(Boolean);
    if (!tokens.length || tokens.length > MAX_ATMOSPHERE_LAYERS) return null;
    for (const tok of tokens) {
      if (!ATMOSPHERE_BY_ID.has(tok)) return null;
    }
  }
  const ids = parseAtmosphereIds(raw);
  return ids.length ? ids.join("+") : "none";
}

/** Formats a human-readable label for a single effect or a multi-effect mix (`"Rain + Prismatic Aurora"`). */
export function formatAtmosphereLabel(raw) {
  const ids = parseAtmosphereIds(raw);
  if (!ids.length) return "Off";
  return ids.map((id) => ATMOSPHERE_BY_ID.get(id)?.label || id).join(" + ");
}

