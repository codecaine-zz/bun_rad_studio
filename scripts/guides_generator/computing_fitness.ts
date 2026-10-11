import { writeFileSync } from "fs";
import { join } from "path";

export function generateComputingFitness(outDir: string) {
  // 27_calculator_studio.md
  writeFileSync(join(outDir, "27_calculator_studio.md"), `# 🧮 Universal Calculator & STEM IntuitionLab -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Multi-Domain Computing Engine & 6 STEM Physics Simulators  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:calculator]  •  [Terminal CLI: bun run cli:calculator]
\`\`\`

---

## 🌟 Executive Overview
**Universal Calculator & Computing Studio** is an Apple-grade multi-domain scientific calculation, unit conversion, visual data analytics, low-level bitwise manipulation, financial planning, calculus graphing, and interactive STEM physics laboratory built natively for Bun RAD Studio.

Combining 10+ specialized computing workspaces into a single zero-dependency, 100% offline desktop application with Web Audio sound synthesis, keyboard shortcuts, and interactive canvas graphics, it now includes the full **6-engine STEM IntuitionLab**—allowing engineers and students to simulate projectile aerodynamics, orbital gravity, wave superpositions, thermodynamic gas laws, DC/AC circuits, and optical refraction in real time.

---

## 🚀 Quick Start & Launch

### 1. Launch Desktop GUI Window
\`\`\`bash
# Standard desktop launch
bun run app:calculator

# Shorthand alias
bun run app:calc
\`\`\`

### 2. Launch Terminal CLI Expression Evaluator
\`\`\`bash
# Direct mathematical evaluation
bun run cli:calculator "sin(pi / 2) + sqrt(144)"

# Complex expression
bun run cli:calculator "12 * (45 - 18) / 3"
\`\`\`

### 3. Launch Headless Web Server
\`\`\`bash
bun run applications/calculator_studio.ts --server
\`\`\`

---

## 🖼️ Visual Interface Tour

| Scientific & Computing Studio (1400×920) | STEM IntuitionLab Physics Simulator |
| :---: | :---: |
| ![Universal Calculator Desktop](../../screenshots/apps/calculator_studio_desktop.png) | ![IntuitionLab Simulator](../../screenshots/apps/calculator_intuitionlab_desktop.png) |

---

## 🧭 The 11 Core Computing Workspaces

### 1. 🔬 STEM IntuitionLab (6 Physics Engines)
Accessible via the **IntuitionLab** workspace tab, this interactive sandbox provides real-time mathematical visualizations:
- **1. Projectile Motion Engine**: Simulates launching angles ($0^\circ$ to $90^\circ$), muzzle velocities, planetary gravity ($g = 9.81$ Earth, $1.62$ Moon, $3.71$ Mars), and atmospheric drag coefficients with live trajectory traces.
- **2. Orbital Gravity Simulator**: Visualizes Keplerian two-body and multi-body orbits, gravitational pull, escape velocities, and orbital decay.
- **3. Wave Mechanics & Interference**: Demonstrates harmonic wave propagation, frequency beats, constructive/destructive superposition, and standing waves.
- **4. Ideal Gas Law & Thermodynamics ($PV = nRT$)**: Simulates pressure-volume-temperature relationships inside an interactive piston with colliding molecular particles.
- **5. Circuit Laboratory (Ohm's & Kirchhoff's Laws)**: Interactive breadboard with resistors, capacitors, inductors, DC voltages, and AC sinusoidal frequencies.
- **6. Optics & Snell's Law**: Renders light ray refraction across refractive index boundaries ($n_1 \sin \theta_1 = n_2 \sin \theta_2$) with total internal reflection.

### 2. ƒx Scientific Calculator Studio
- Supports complex parentheses nesting, trigonometric functions (\`sin\`, \`cos\`, \`tan\`), inverse trig (\`asin\`, \`acos\`, \`atan\`), hyperbolic functions, logarithms (\`ln\`, \`log10\`), roots (\`sqrt\`, \`cbrt\`), and exponents (\`x^y\`).
- One-click angle toggles: **DEG** (Degrees) and **RAD** (Radians).
- Memory Registers: Dedicated \`mc\` (Clear), \`m+\` (Add), \`m−\` (Subtract), and \`mr\` (Recall).
- Physical Constants Bar: One-click chips for $\pi$, $e$, speed of light $c$, Planck's $h$, gravitational constant $G$, Boltzmann $k_B$, and Avogadro $N_A$.

### 3. ⇄ Unit & Currency Converter (17 Physical Dimensions)
- Dimensions: Length, Temperature, Area, Volume, Weight/Mass, Time, Speed, Pressure, Energy, Power, Data Storage, Character/ASCII, Angles, Frequency, Force, Torque, and Fuel Economy.
- Dynamic Visual Magnitude Ratio Bar showing relative scale between units in real time.

### 4. 01 Programmer & Bitwise Laboratory
- **64-bit Interactive Bit-Flipper**: Click any bit (63..0) with tactile audio blips to toggle states.
- **Synchronous Multi-Radix Card**: Live simultaneous display and bidirectional editing across HEX, DEC, OCT, BIN, and ASCII.
- **ALU Diagnostics**: Population count (Hamming weight), Leading Zeros (CLZ), Trailing Zeros (CTZ), Power-of-2 detection, parity check, and signed two's/one's complement.
- **IEEE-754 Floating Point Dissector**: Visual bit breakdown of Float32 and Float64 into Sign, Biased Exponent, and Normalized Mantissa.
- **IPv4 & Subnet Inspector**: Dotted quad breakdown, interactive CIDR prefix slider (/0 to /32), netmask, network ID, broadcast, and host range.

### 5. 📈 Graphic Charts & Time-Series Studio
- Visualization Modes: Area Spline, Pill Bar Chart, Activity Ring, and Stepped Cumulative views.
- Statistical Regression Models: Linear ($y = mx + b$), Exponential, and 2nd-degree Polynomial curves with live $R^2$ goodness-of-fit indicator.
- Interactive Scrubber Tooltip: Displays daily values, percentage deltas vs previous day, and deviations from dataset average.

### 6. ∫ Calculus & Multi-Mode Grapher
- Cartesian ($f(x)$), Dual Curves ($f(x)$ & $g(x)$), Polar ($r(\theta)$), and Parametric ($[x(t), y(t)]$).
- Definite Integrals ($\int_a^b f(x)dx$) evaluated with Simpson's 1/3 rule and visual area shading.
- Numerical Derivatives ($f'(x_0)$) calculating tangent slopes with animated contact bead.

### 7. ⊞ Matrix & Linear Algebra Laboratory
- $2 \times 2$, $3 \times 3$, and $4 \times 4$ matrices.
- Addition, Subtraction, Matrix Multiplication ($A \times B$), Transpose, Determinant ($\det(A)$), Inverse ($A^{-1}$), and Gaussian elimination solver ($A \cdot x = b$).

### 8. △ Geometry & Triangles Studio
- Triangle solver by 3 Sides (SSS), 2 Sides + Angle (SAS), or 2 Angles + Side (ASA).
- Scale canvas rendering with angle arcs, side measurement pill badges, vertex indicators, and inscribed incircles.

### 9. 💎 Wealth & FIRE Planner
- Retirement nest egg trajectory with customizable savings, monthly contributions, expected returns, and annual spending.
- 4% Rule FIRE Target calculator determining exact age of financial independence.
- US Inflation Time Machine (1913–2026) using historical CPI data.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **0 .. 9** | Any Calculator | Enter numeric digits |
| **+ , - , * , /** | Scientific | Arithmetic operator entry |
| **Enter** or **=** | Scientific | Evaluate expression |
| **Backspace** | Any Input | Delete last character |
| **C** or **Escape** | Calculator | Clear display / reset |
| **Cmd + 1 .. 9** | Workspace | Switch directly between the computing studios |
| **F11** or **F** | Global | Toggle borderless fullscreen |
`);

  // 28_dr_codecaine_arcade.md
  writeFileSync(join(outDir, "28_dr_codecaine_arcade.md"), `# 💊 Dr. Codecaine Arcade -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native HTML5 Canvas & Web Audio Chiptune Synthesizer  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:dr_codecaine]  •  [Headless Server: bun run applications/dr_codecaine_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Dr. Codecaine Arcade** is a fast-paced, tactile capsule-matching puzzle arcade experience built natively for Bun RAD Studio. Combining nostalgic color-matching puzzle mechanics with procedural viral pathogens, retro audio synthesis, high-DPI scaling, and responsive desktop windowing, Dr. Codecaine Arcade brings pure arcade energy directly to your desktop workstation.

Featuring an authentic dual-tone capsule falling engine, 60fps physics, gravity cascade chaining, polyphonic square-wave sound effects, and pathogen AI, it offers endless hours of mental sharpness and dopamine-fueled puzzle action.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:dr_codecaine

# Launch headless web server
bun run applications/dr_codecaine_studio.ts --server
\`\`\`

---

## 🖼️ Visual Interface Tour

| High-Resolution Desktop (1280×850) | Responsive Viewport (960×720) |
| :---: | :---: |
| ![Dr. Codecaine Desktop](../../screenshots/apps/dr_codecaine_desktop.png) | ![Dr. Codecaine Responsive](../../screenshots/apps/dr_codecaine_responsive.png) |

---

## 🕹️ Gameplay Rules & Core Mechanics

### 1. Dual-Tone Capsule Matching
- **Objective**: Eradicate all viral pathogens in the pill jar before the capsules stack up to the top neck.
- **Tricolor Palette**:
  - 🔴 **Red Pathogen & Pill Segment** (Fever)
  - 🟡 **Yellow Pathogen & Pill Segment** (Jaundice)
  - 🔵 **Blue Pathogen & Pill Segment** (Chills)
- **4-in-a-Row Alignment**: Align 4 or more matching color segments horizontally or vertically to dissolve the cluster and eradicate any embedded pathogens.

### 2. Gravity & Cascade Multiplier Chains
- When a horizontal or vertical match dissolves, any unsupported capsule halves above it drop under real gravity.
- If falling halves create new matches upon landing, you trigger a **Cascade Chain**, multiplying your score exponentially (2x, 4x, 8x, 16x) and clearing the board in style.

### 3. Difficulty & Progression Modes
- **Speed Settings**:
  - \`LOW\`: Relaxed pacing, ideal for warm-up and deep tactical planning.
  - \`MED\`: Standard arcade speed, rapid reflexes required.
  - \`HI\`: High-speed descent for competitive high-score marathon runs.
- **Virus Count Slider**: Scale initial pathogen count from 1 up to 20 pathogens per stage.

---

## ⌨️ Desktop Keyboard & Gamepad Controls

| Action | Primary Key | Secondary Key |
| :--- | :--- | :--- |
| **Move Left** | \`←\` Left Arrow | \`A\` |
| **Move Right** | \`→\` Right Arrow | \`D\` |
| **Soft Drop (Accelerate)** | \`↓\` Down Arrow | \`S\` |
| **Hard Drop (Instant)** | \`Space\` | \`Enter\` |
| **Rotate Clockwise** | \`↑\` Up Arrow | \`W\` / \`X\` |
| **Rotate Counter-Clockwise** | \`Z\` | \`Shift\` |
| **Pause / Resume** | \`P\` | \`Escape\` |
| **Restart Level** | \`R\` | — |
| **Toggle Fullscreen** | \`F\` | \`F11\` |

---

## 💡 Pro Tips & Strategic Masterclass
- **Build Horizontal Foundations**: Try to place capsules flat horizontally across the floor to build stable bases before dropping vertical colors.
- **Watch Next Pill Window**: Always check the "NEXT" capsule preview in the top right to plan where your next colors will drop before your current pill touches down.
- **Set Up Cascade Combos**: Leave a suspended matching half-capsule ready to fall into place when a lower virus dissolves.
`);

  // 29_interval_timer_suite.md
  writeFileSync(join(outDir, "29_interval_timer_suite.md"), `# ⚡ Interval Timer & Calisthenics Suite -- Complete Production User Guide

\`\`\`
Version: 2.4.0  •  Engine: Native Audio/Tone.js & YouTube Music Deck  •  Dependencies: 0  •  Offline: 100%
Launchers: [Desktop GUI: bun run app:interval_timer]  •  [Headless Server: bun run applications/interval_timer_studio.ts --server]
\`\`\`

---

## 🌟 Executive Overview
**Interval Timer & Calisthenics Suite** is a high-performance, clinical-grade interval timer, isometric tendon remodeling system, and motivational soundtrack workstation built natively for Bun RAD Studio.

Designed around the peer-reviewed connective tissue research of **Dr. Keith Baar (UC Davis)**, this suite guides athletes and fitness practitioners through submaximal overcoming isometrics that stimulate collagen synthesis, crosslink tendon fibrils, and bulletproof joints without inducing muscular or central nervous system fatigue.

It now includes the **Built-in Codecaine YouTube Workout Music Deck**—featuring 24 curated albums, 25+ hours of driving beats, dynamic category filtering, and live playlist synchronization.

---

## 🚀 Quick Start & Launch

\`\`\`bash
# Standard desktop launch
bun run app:interval_timer

# Launch background server mode
bun run applications/interval_timer_studio.ts --server
\`\`\`

---

## 🖼️ Visual Interface Tour

| Main Circular Timer & Tendon Protocols | Codecaine 24-Album Music Deck & Drawer |
| :---: | :---: |
| ![Interval Timer Desktop](../../screenshots/apps/interval_timer_updated.png) | ![Codecaine Music Deck](../../screenshots/apps/interval_timer_music_deck.png) |

---

## 🧭 Core Protocols & Scientific Engineering

### 1. Dr. Keith Baar Overcoming Isometrics Protocol
- **Target Effort**: 50%–60% Submaximal Effort. Pushing at 100% maximal strain grinds joints and fatigues CNS; 50%–60% tension maximizes lysyl oxidase crosslinking and collagen-I transcription while preserving joint integrity.
- **Time Structure**: **10s Work Hold / 50s Complete Unloading Rest** across 10 sets (exactly 10 minutes total).
- **The 10-Minute Collagen Saturation Limit**: Research demonstrates mechanosensitive collagen signaling saturation occurs at 10 minutes. Training longer provides zero additional collagen synthesis and induces fatigue.
- **Complete Fluid Exchange**: The 50s rest is crucial; tendons express bound water under load. The 50s total de-load allows nutrient-rich synovial fluid, proline, and glycine to perfuse back into the tendon matrix.

### 2. Base64-Inlined Biomechanical Motion Guides
All exercise diagrams are base64-inlined directly into the application for 100% offline playback with zero network latency:
- Single-Arm Towel Overcoming Pull (Feet on Ground)
- Pull-Up Bar Finger Isometric (Feet on Floor)
- Ankle Wall Heel Drive & Plantarflexion Hold
- Towel & Bedsheet Rigging Masterclass Loops
- Tap-to-Zoom interactive visual inspector

### 3. Built-in Codecaine Original Workout Music Deck
- **24 Curated Albums (25+ Hours of Audio)**: Produced by @codecaine for high-dopamine training.
- **Dynamic Category Filtering**:
  - \`All (24)\`: Complete masterclass discography.
  - \`Mindset & Stoic (13)\`: Stoic philosophy, Jim Rohn wisdom, sovereign logic, and mental calibration.
  - \`High Energy & PRs (6)\`: Compounding drive, 1% daily discipline, 808s, and PR energy.
  - \`Rock & Metal (3)\`: Gritty guitars, Houston grit, and aggressive overdrive.
  - \`Megamixes (2)\`: 3-hour non-stop marathons for long endurance sessions.
- **Search Bar**: Real-time keyword filter across all 24 albums.
- **Live Sync Button**: Auto-syncs playlist with YouTube playlist via local server endpoint.

---

## ⌨️ Complete Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **Space** | Timer | Start / Pause Active Interval Cycle |
| **R** | Timer | Reset Current Protocol |
| **N** | Timer | Skip to Next Exercise Node |
| **M** | Music Deck | Open Routine Music & Audio Splits Panel |
| **F** / **F11** | Global | Toggle Borderless Fullscreen |
`);

  console.log("✔ Computing & Fitness (27 to 29) generated with AAA quality.");
}
