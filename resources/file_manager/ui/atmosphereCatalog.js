// Catalog of 135 Atmospheric Special Effects ("none" + 134 live procedural effects) across Low, Medium, and
// High-End / Modern ARM Ultra hardware tiers. Each effect specifies its procedural engine archetype and tuning
// parameters so every effect renders a distinct, theme-harmonized animation.

export const ATMOSPHERE_CATEGORIES = [
  { id: "all", label: "All effects (135)" },
  { id: "weather", label: "Weather & Sky" },
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
 * `cat`: "weather" | "mist" | "cyber" | "cosmic" | "nature" | "thermal" | "geometry"
 * `engine`: "precip" | "snow" | "mist" | "glyph" | "ember" | "stars" | "orbs" | "nebula" | "aurora" | "grid" | "network" | "waves" | "geometry" | "beams" | "dna" | "circuit" | "radar" | "portal"
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

  // =================================================================================================================
  // MEDIUM GRAPHICS TIER — Volumetric Weather, Streams & Bokeh (49 effects)
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

  // =================================================================================================================
  // HIGH-END & MODERN ARM / ULTRA TIER — Out of This World (49 effects)
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
  fx("plasma_storm", "ultra", "thermal", "⚡", "Tesla Coil Plasma Arc", "High Voltage", "Continuous branching electrical discharges and ionized violet/accent corona orbs.", "precip", { cyber: true, drift: 0.5, speed: 6, len: 10, ripples: true, lightning: true, lightningRate: 0.075 }),
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
];

export const ATMOSPHERE_BY_ID = new Map(ATMOSPHERE_OPTIONS.map((o) => [o.id, o]));
export const ATMOSPHERE_IDS = ATMOSPHERE_OPTIONS.map((o) => o.id);
export const MAX_ATMOSPHERE_LAYERS = 4;

/** Curated multi-layer atmospheric combinations users can activate with one click or customize in the Mixer. */
export const ATMOSPHERE_MIX_PRESETS = [
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
  for (const id of parts) {
    if (id === "none") continue;
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
    const tokens = raw.split(/[+,]/).map((s) => s.trim()).filter(Boolean);
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

