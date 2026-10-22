// Small DOM helpers. File names and paths come from disk and are untrusted, so the page never builds HTML from
// them: text always goes in through textContent (the h() helper does this for you).

export function quietInput(el) {
  for (const [key, value] of Object.entries({ spellcheck: "false", autocomplete: "off", autocorrect: "off", autocapitalize: "off" })) {
    el.setAttribute(key, value);
  }
}

/**
 * Creates an element. `attrs`: class, text, dataset, aria-* / other attributes, boolean flags, and on<event> handlers.
 * `children` may be strings, nodes, arrays or null.
 * @param {string} tag
 * @param {Record<string, any>} [attrs]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  if (tag === "input" || tag === "textarea") quietInput(el);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** @param {string} selector @param {ParentNode} [root] */
export const $ = (selector, root = document) => root.querySelector(selector);

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** Tells screen readers something (also useful as a quiet log). */
export function announce(message) {
  const live = $("#live");
  if (!live) return;
  live.textContent = "";
  setTimeout(() => (live.textContent = message), 30);
}
export const say = announce;

export const SYSTEM_ICON_CATALOG = [
  // ── 90 Semantic System Folder Icons ───────────────────────────────────────
  { id: "folder_general", category: "folder", topic: "general", label: "General Directory", icon: "📁", google3d: "📁" },
  { id: "folder_pictures", category: "folder", topic: "pictures", label: "Pictures & Gallery", icon: "🖼️", google3d: "🏞️" },
  { id: "folder_video", category: "folder", topic: "video", label: "Video & Cinema Studio", icon: "🎬", google3d: "🎞️" },
  { id: "folder_music", category: "folder", topic: "music", label: "Music & Audio Stems", icon: "🎧", google3d: "🎵" },
  { id: "folder_code", category: "folder", topic: "code", label: "Source Code & Modules", icon: "💻", google3d: "🧑‍💻" },
  { id: "folder_3d", category: "folder", topic: "3d", label: "3D Scenes, CAD & Meshes", icon: "🧊", google3d: "🧊" },
  { id: "folder_docs", category: "folder", topic: "docs", label: "Documents & Knowledgebase", icon: "📚", google3d: "📘" },
  { id: "folder_downloads", category: "folder", topic: "downloads", label: "Downloads & Incoming", icon: "📥", google3d: "⬇️" },
  { id: "folder_database", category: "folder", topic: "database", label: "Database & Migrations", icon: "🗄️", google3d: "🛢️" },
  { id: "folder_cloud", category: "folder", topic: "cloud", label: "Cloud Sync & Drive", icon: "☁️", google3d: "☁️" },
  { id: "folder_archive", category: "folder", topic: "archive", label: "Archives, Builds & Dist", icon: "📦", google3d: "🧳" },
  { id: "folder_ai_ml", category: "folder", topic: "ai_ml", label: "AI Models & Neural Weights", icon: "🧠", google3d: "✨" },
  { id: "folder_security", category: "folder", topic: "security", label: "Security, Keys & Vaults", icon: "🔐", google3d: "🛡️" },
  { id: "folder_docker", category: "folder", topic: "docker", label: "Containers & Dockerfiles", icon: "🐳", google3d: "🐳" },
  { id: "folder_kubernetes", category: "folder", topic: "kubernetes", label: "Kubernetes & Helm Charts", icon: "☸️", google3d: "☸️" },
  { id: "folder_git", category: "folder", topic: "git", label: "Git & Version Control", icon: "🌿", google3d: "🔀" },
  { id: "folder_config", category: "folder", topic: "config", label: "System & App Configuration", icon: "⚙️", google3d: "🎛️" },
  { id: "folder_tests", category: "folder", topic: "tests", label: "Test Suites & Benchmarks", icon: "🧪", google3d: "🧪" },
  { id: "folder_scripts", category: "folder", topic: "scripts", label: "Automation & Shell Scripts", icon: "📜", google3d: "⚡" },
  { id: "folder_fonts", category: "folder", topic: "fonts", label: "Typography & Font Families", icon: "🔤", google3d: "🔡" },
  { id: "folder_design", category: "folder", topic: "design", label: "UI/UX Design & Brand Assets", icon: "🎨", google3d: "🎨" },
  { id: "folder_games", category: "folder", topic: "games", label: "Game Engines & Assets", icon: "🎮", google3d: "🕹️" },
  { id: "folder_mobile", category: "folder", topic: "mobile", label: "Android & iOS Mobile Apps", icon: "📱", google3d: "📱" },
  { id: "folder_desktop", category: "folder", topic: "desktop", label: "Desktop Workspace", icon: "🖥️", google3d: "🖥️" },
  { id: "folder_web", category: "folder", topic: "web", label: "Web Public & Static Assets", icon: "🌐", google3d: "🌐" },
  { id: "folder_api", category: "folder", topic: "api", label: "API Routes, GraphQL & RPC", icon: "🔌", google3d: "🛰️" },
  { id: "folder_logs", category: "folder", topic: "logs", label: "Telemetry & System Logs", icon: "📋", google3d: "📈" },
  { id: "folder_temp", category: "folder", topic: "temp", label: "Scratch & Cache Buffers", icon: "⏳", google3d: "🫧" },
  { id: "folder_trash", category: "folder", topic: "trash", label: "Recycle Bin & Trash", icon: "🗑️", google3d: "🗑️" },
  { id: "folder_system", category: "folder", topic: "system", label: "OS Kernel & System Root", icon: "🏛️", google3d: "⚙️" },
  { id: "folder_network", category: "folder", topic: "network", label: "Network, DNS & Proxies", icon: "📡", google3d: "📡" },
  { id: "folder_crypto", category: "folder", topic: "crypto", label: "Web3, Contracts & Ledgers", icon: "⛓️", google3d: "💎" },
  { id: "folder_notebooks", category: "folder", topic: "notebooks", label: "Jupyter & Colab Notebooks", icon: "📓", google3d: "📓" },
  { id: "folder_workflows", category: "folder", topic: "workflows", label: "CI/CD Pipelines & Actions", icon: "🔄", google3d: "🚀" },
  { id: "folder_plugins", category: "folder", topic: "plugins", label: "Extensions, Plugins & Addons", icon: "🧩", google3d: "🧩" },
  { id: "folder_themes", category: "folder", topic: "themes", label: "Themes, Palettes & Styles", icon: "🌈", google3d: "💎" },
  { id: "folder_shaders", category: "folder", topic: "shaders", label: "GLSL/WGSL GPU Shaders", icon: "🔮", google3d: "🔮" },
  { id: "folder_audio_stems", category: "folder", topic: "audio_stems", label: "DAW Projects & Synth Banks", icon: "🎚️", google3d: "🎚️" },
  { id: "folder_camera_raw", category: "folder", topic: "camera_raw", label: "Camera RAW & DNG Negatives", icon: "📸", google3d: "📸" },
  { id: "folder_cad", category: "folder", topic: "cad", label: "Engineering Blueprints & PCB", icon: "📐", google3d: "📐" },
  { id: "folder_finance", category: "folder", topic: "finance", label: "Finance, Invoices & Ledger", icon: "💹", google3d: "📊" },
  { id: "folder_legal", category: "folder", topic: "legal", label: "Licenses, Contracts & Legal", icon: "⚖️", google3d: "⚖️" },
  { id: "folder_science", category: "folder", topic: "science", label: "Genomics, Lab & Research", icon: "🧬", google3d: "🧬" },
  { id: "folder_quantum", category: "folder", topic: "quantum", label: "Quantum Circuits & Qubits", icon: "⚛️", google3d: "⚛️" },
  { id: "folder_home", category: "folder", topic: "home", label: "User Home Directory", icon: "🏠", google3d: "🏠" },
  { id: "folder_applications", category: "folder", topic: "applications", label: "Applications & App Bundles", icon: "🚀", google3d: "🚀" },
  { id: "folder_screenshots", category: "folder", topic: "screenshots", label: "Screen Captures & Snaps", icon: "📸", google3d: "🖼️" },
  { id: "folder_wallpapers", category: "folder", topic: "wallpapers", label: "4K/8K Desktop Wallpapers", icon: "🏞️", google3d: "🏞️" },
  { id: "folder_memes", category: "folder", topic: "memes", label: "Memes, Stickers & Reactions", icon: "🎭", google3d: "🎭" },
  { id: "folder_podcasts", category: "folder", topic: "podcasts", label: "Podcasts & Voice Broadcasts", icon: "🎙️", google3d: "🎙️" },
  { id: "folder_audiobooks", category: "folder", topic: "audiobooks", label: "Audiobooks & Spoken Word", icon: "🎧", google3d: "📘" },
  { id: "folder_anime", category: "folder", topic: "anime", label: "Anime, Manga & Light Novels", icon: "⛩️", google3d: "⛩️" },
  { id: "folder_tv_shows", category: "folder", topic: "tv_shows", label: "TV Series & Documentaries", icon: "📺", google3d: "📺" },
  { id: "folder_electronics", category: "folder", topic: "electronics", label: "PCB, KiCad & FPGA Hardware", icon: "🔌", google3d: "🔩" },
  { id: "folder_robotics", category: "folder", topic: "robotics", label: "Robotics, ROS, Arduino & IoT", icon: "🤖", google3d: "🤖" },
  { id: "folder_vr_spatial", category: "folder", topic: "vr_spatial", label: "VR/XR & Spatial Computing", icon: "🥽", google3d: "🥽" },
  { id: "folder_roms", category: "folder", topic: "roms", label: "Retro ROMs & Emulators", icon: "🕹️", google3d: "🕹️" },
  { id: "folder_minecraft", category: "folder", topic: "minecraft", label: "Minecraft Worlds & Modpacks", icon: "⛏️", google3d: "🧊" },
  { id: "folder_rust", category: "folder", topic: "rust", label: "Rust Cargo Crates & Targets", icon: "🦀", google3d: "🦀" },
  { id: "folder_bun", category: "folder", topic: "bun", label: "Bun Runtime & Workspaces", icon: "🥟", google3d: "🥟" },
  { id: "folder_python", category: "folder", topic: "python", label: "Python Virtualenvs & Packages", icon: "🐍", google3d: "🐍" },
  { id: "folder_golang", category: "folder", topic: "golang", label: "Go Modules & Binaries", icon: "🐹", google3d: "🐹" },
  { id: "folder_apple", category: "folder", topic: "apple", label: "Xcode, Swift & macOS/iOS", icon: "🍎", google3d: "🍎" },
  { id: "folder_terraform", category: "folder", topic: "terraform", label: "Terraform, Ansible & IaC", icon: "🏗️", google3d: "☁️" },
  { id: "folder_pentest", category: "folder", topic: "pentest", label: "Cybersecurity, CTF & Forensics", icon: "🕵️", google3d: "🛡️" },
  { id: "folder_career", category: "folder", topic: "career", label: "Resumes, CVs & Portfolios", icon: "👔", google3d: "📘" },
  { id: "folder_ebooks", category: "folder", topic: "ebooks", label: "Digital Books & ePub Library", icon: "📖", google3d: "📕" },
  { id: "folder_comics", category: "folder", topic: "comics", label: "Comics, Graphic Novels & Zines", icon: "🗯️", google3d: "🗯️" },
  { id: "folder_recipes", category: "folder", topic: "recipes", label: "Recipes, Culinary & Nutrition", icon: "🍳", google3d: "🍳" },
  { id: "folder_travel", category: "folder", topic: "travel", label: "Travel, Maps & Itineraries", icon: "✈️", google3d: "🗺️" },
  { id: "folder_medical", category: "folder", topic: "medical", label: "Health, Fitness & Medical Labs", icon: "🩺", google3d: "🩺" },
  { id: "folder_astronomy", category: "folder", topic: "astronomy", label: "Astronomy, JWST & Astrophotography", icon: "🔭", google3d: "🪐" },
  { id: "folder_samples", category: "folder", topic: "samples", label: "MIDI Banks, Soundfonts & Drum Kits", icon: "🎹", google3d: "🎹" },
  { id: "folder_vfx", category: "folder", topic: "vfx", label: "After Effects, LUTs & VFX Renders", icon: "🎞️", google3d: "🎬" },
  { id: "folder_vms", category: "folder", topic: "vms", label: "Virtual Machines & Disk Images", icon: "💿", google3d: "💽" },
  { id: "folder_homelab", category: "folder", topic: "homelab", label: "NAS, RAID, Plex & Self-Hosted", icon: "🖧", google3d: "🛰️" },
  { id: "folder_dotfiles", category: "folder", topic: "dotfiles", label: "Dotfiles, Neovim & Terminal Rice", icon: "🛠️", google3d: "🎛️" },
  { id: "folder_prompts", category: "folder", topic: "prompts", label: "LLM Prompts, RAG & Agent Skills", icon: "✨", google3d: "✨" },
  { id: "folder_datasets", category: "folder", topic: "datasets", label: "Training Corpora & Data Lakes", icon: "📊", google3d: "📈" },
  { id: "folder_3dprint", category: "folder", topic: "3dprint", label: "3D Printing, STL & G-Code Slicers", icon: "📐", google3d: "🧊" },
  { id: "folder_backups", category: "folder", topic: "backups", label: "Time Machine & Cold Snapshots", icon: "🕰️", google3d: "🧳" },
  { id: "folder_favorites", category: "folder", topic: "favorites", label: "Starred & Pinned Collections", icon: "⭐", google3d: "🌟" },
  { id: "folder_shared", category: "folder", topic: "shared", label: "Team Shared & Public Dropboxes", icon: "🤝", google3d: "🌐" },
  { id: "folder_encrypted", category: "folder", topic: "encrypted", label: "Zero-Knowledge Encrypted Vaults", icon: "🛡️", google3d: "🛡️" },
  { id: "folder_mail", category: "folder", topic: "mail", label: "Mail Archives & MBOX Bundles", icon: "📬", google3d: "📬" },
  { id: "folder_fonts_pro", category: "folder", topic: "fonts_pro", label: "OpenType Variable Typefoundries", icon: "🔡", google3d: "🔡" },
  { id: "folder_shaders_fx", category: "folder", topic: "shaders_fx", label: "Raytracing & Post-FX Pipelines", icon: "🌈", google3d: "🔮" },
  { id: "folder_cinema_raw", category: "folder", topic: "cinema_raw", label: "ProRes, RED R3D & BRAW Dailies", icon: "🎥", google3d: "🎬" },
  { id: "folder_podcasts_studio", category: "folder", topic: "podcasts_studio", label: "Multitrack Broadcast Masters", icon: "📻", google3d: "🎙️" },
  { id: "folder_quantum_sim", category: "folder", topic: "quantum_sim", label: "Tensor Networks & Qubit Lattices", icon: "🌌", google3d: "⚛️" },
  { id: "folder_blender_3d", category: "folder", topic: "blender_3d", label: "Blender, Houdini & Geometry Nodes", icon: "🟠", google3d: "🧊" },
  { id: "folder_unreal_unity", category: "folder", topic: "unreal_unity", label: "Unreal Engine 5 & Unity Worlds", icon: "🎮", google3d: "🕹️" },
  { id: "folder_shaders_compute", category: "folder", topic: "shaders_compute", label: "CUDA, ROCm & Compute Kernels", icon: "⚡", google3d: "🔮" },
  { id: "folder_cybersecurity_vault", category: "folder", topic: "cybersecurity_vault", label: "Zero-Day Labs, SIEM & YARA Rules", icon: "🛡️", google3d: "🛡️" },
  { id: "folder_blockchain_zk", category: "folder", topic: "blockchain_zk", label: "Zero-Knowledge Proofs & Rollups", icon: "⛓️", google3d: "💎" },
  { id: "folder_astronomy_space", category: "folder", topic: "astronomy_space", label: "JWST, Telemetry & Orbital Mechanics", icon: "🛰️", google3d: "🪐" },
  { id: "folder_biotech_crispr", category: "folder", topic: "biotech_crispr", label: "CRISPR, Foldseek & Protein Structures", icon: "🧬", google3d: "🧬" },
  { id: "folder_cinema_dolby", category: "folder", topic: "cinema_dolby", label: "Dolby Vision HDR & Atmos Masters", icon: "🎞️", google3d: "🎬" },
  { id: "folder_vinyl_hi_res", category: "folder", topic: "vinyl_hi_res", label: "DSD, Vinyl Rips & Audiophile FLAC", icon: "💿", google3d: "🎧" },
  { id: "folder_synth_modular", category: "folder", topic: "synth_modular", label: "Eurorack, Modular Patches & CV", icon: "🎛️", google3d: "🎚️" },
  { id: "folder_retro_arcade", category: "folder", topic: "retro_arcade", label: "MAME Cabinets, CRT Shaders & 16-Bit", icon: "👾", google3d: "🕹️" },
  { id: "folder_tabletop_rpg", category: "folder", topic: "tabletop_rpg", label: "D&D Campaigns, VTT Maps & Sheets", icon: "🎲", google3d: "🎲" },
  { id: "folder_smart_home", category: "folder", topic: "smart_home", label: "Home Assistant, Matter & Zigbee IoT", icon: "🏡", google3d: "🏠" },
  { id: "folder_mechanical_keebs", category: "folder", topic: "mechanical_keebs", label: "QMK/VIA Firmware & Keycap Renders", icon: "⌨️", google3d: "⌨️" },
  { id: "folder_fpv_drones", category: "folder", topic: "fpv_drones", label: "Betaflight Blackbox & FPV Cinewhoop", icon: "🚁", google3d: "🛰️" },
  { id: "folder_photography_leica", category: "folder", topic: "photography_leica", label: "Medium Format, Film Scans & Sheets", icon: "📷", google3d: "📸" },
  { id: "folder_architecture_bim", category: "folder", topic: "architecture_bim", label: "Revit BIM, ArchiCAD & Floorplans", icon: "🏛️", google3d: "📐" },
  { id: "folder_legal_ip", category: "folder", topic: "legal_ip", label: "Patents, Trademarks & NDAs", icon: "📜", google3d: "⚖️" },
  { id: "folder_quant_trading", category: "folder", topic: "quant_trading", label: "Backtests, Orderbooks & Alpha Signals", icon: "📈", google3d: "📊" },
  { id: "folder_obsidian_pkms", category: "folder", topic: "obsidian_pkms", label: "Obsidian Vaults, Zettelkasten & Graphs", icon: "💎", google3d: "📓" },

  // ── 70 Exact System / Developer Filename Icons ────────────────────────────
  { id: "exact_dockerfile", category: "exact", match: ["dockerfile", "containerfile"], kind: "container", label: "Dockerfile / Containerfile", icon: "🐳", google3d: "🐳" },
  { id: "exact_docker_compose", category: "exact", match: ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", "docker-compose.override.yml"], kind: "container", label: "Docker Compose Stack", icon: "🐙", google3d: "🐳" },
  { id: "exact_package_json", category: "exact", match: ["package.json"], kind: "manifest", label: "Node / Bun Package Manifest", icon: "📦", google3d: "📦" },
  { id: "exact_bun_lock", category: "exact", match: ["bun.lockb", "bun.lock", "bunfig.toml"], kind: "lockfile", label: "Bun Runtime Lockfile & Config", icon: "🥟", google3d: "🥟" },
  { id: "exact_lockfile", category: "exact", match: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "cargo.lock", "poetry.lock", "uv.lock", "gemfile.lock", "composer.lock", "flake.lock"], kind: "lockfile", label: "Dependency Lockfile", icon: "🔒", google3d: "🔒" },
  { id: "exact_tsconfig", category: "exact", match: ["tsconfig.json", "tsconfig.base.json", "tsconfig.build.json", "jsconfig.json"], kind: "config", label: "TypeScript Compiler Config", icon: "📘", google3d: "📘" },
  { id: "exact_gitignore", category: "exact", match: [".gitignore", ".gitattributes", ".gitmodules", ".gitkeep", ".gitconfig"], kind: "git", label: "Git Configuration", icon: "🌿", google3d: "🔀" },
  { id: "exact_env", category: "exact", match: [".env", ".env.local", ".env.development", ".env.production", ".env.example", ".env.test", ".env.staging", ".env.vault"], kind: "secret", label: "Environment Secrets (.env)", icon: "🔑", google3d: "🔑" },
  { id: "exact_readme", category: "exact", match: ["readme.md", "readme.txt", "readme", "changelog.md", "contributing.md", "security.md", "release.md"], kind: "doc", label: "Project Readme & Guide", icon: "📖", google3d: "📘" },
  { id: "exact_license", category: "exact", match: ["license", "license.md", "license.txt", "copying", "notice", "patents"], kind: "legal", label: "Software License", icon: "⚖️", google3d: "⚖️" },
  { id: "exact_makefile", category: "exact", match: ["makefile", "gnumakefile", "justfile", "taskfile.yml", "taskfile.yaml", "earthfile"], kind: "build", label: "Makefile / Build Runner", icon: "🛠️", google3d: "🛠️" },
  { id: "exact_cmake", category: "exact", match: ["cmakelists.txt", "meson.build", "build.ninja", "cmakepresets.json", "configure.ac", "makefile.am"], kind: "build", label: "CMake / Native Build Graph", icon: "🏗️", google3d: "🏗️" },
  { id: "exact_cargo", category: "exact", match: ["cargo.toml"], kind: "manifest", label: "Rust Cargo Manifest", icon: "🦀", google3d: "🦀" },
  { id: "exact_gomod", category: "exact", match: ["go.mod", "go.sum", "go.work"], kind: "manifest", label: "Go Module Manifest", icon: "🐹", google3d: "🐹" },
  { id: "exact_vmod", category: "exact", match: ["v.mod"], kind: "manifest", label: "Vlang Module Manifest", icon: "⚡", google3d: "⚡" },
  { id: "exact_pyproject", category: "exact", match: ["pyproject.toml", "requirements.txt", "pipfile", "setup.py", "setup.cfg", "MANIFEST.in"], kind: "manifest", label: "Python Project Manifest", icon: "🐍", google3d: "🐍" },
  { id: "exact_gradle", category: "exact", match: ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "pom.xml", "gradlew"], kind: "build", label: "JVM Gradle / Maven Build", icon: "🐘", google3d: "☕" },
  { id: "exact_terraform", category: "exact", match: ["main.tf", "variables.tf", "outputs.tf", "terraform.tfstate", "versions.tf", "providers.tf"], kind: "cloud", label: "Terraform Cloud State", icon: "🌩️", google3d: "☁️" },
  { id: "exact_k8s", category: "exact", match: ["chart.yaml", "values.yaml", "kustomization.yaml", "skaffold.yaml", "helmfile.yaml"], kind: "cloud", label: "Kubernetes / Helm Manifest", icon: "☸️", google3d: "☸️" },
  { id: "exact_firebase", category: "exact", match: ["firebase.json", ".firebaserc", "firestore.rules", "firestore.indexes.json"], kind: "cloud", label: "Google Firebase Config", icon: "🔥", google3d: "🔥" },
  { id: "exact_gcloud", category: "exact", match: ["app.yaml", "cloudbuild.yaml", "cloudbuild.json", "dispatch.yaml", "cron.yaml"], kind: "cloud", label: "Google Cloud Build & AppEngine", icon: "☁️", google3d: "☁️" },
  { id: "exact_idx", category: "exact", match: ["dev.nix", "flake.nix", "shell.nix", "default.nix", "home.nix"], kind: "config", label: "Project IDX / Nix Environment", icon: "❄️", google3d: "✨" },
  { id: "exact_vite_webpack", category: "exact", match: ["vite.config.ts", "vite.config.js", "webpack.config.js", "rollup.config.js", "next.config.js", "next.config.mjs", "astro.config.mjs", "esbuild.config.js"], kind: "build", label: "Frontend Bundler Config", icon: "⚡", google3d: "⚡" },
  { id: "exact_tailwind", category: "exact", match: ["tailwind.config.js", "tailwind.config.ts", "postcss.config.js", "uno.config.ts"], kind: "design", label: "Tailwind & CSS Engine Config", icon: "🎨", google3d: "🎨" },
  { id: "exact_eslint_biome", category: "exact", match: ["biome.json", "biome.jsonc", ".eslintrc", ".eslintrc.json", "eslint.config.js", "eslint.config.mjs", ".prettierrc", ".editorconfig", ".stylelintrc"], kind: "config", label: "Linter & Formatter Rules", icon: "🧹", google3d: "✨" },
  { id: "exact_prisma", category: "exact", match: ["schema.prisma", "drizzle.config.ts", "knexfile.js", "knexfile.ts", "sqlc.yaml"], kind: "database", label: "Database ORM Schema", icon: "💎", google3d: "🗄️" },
  { id: "exact_github_workflow", category: "exact", match: ["action.yml", "action.yaml", ".gitlab-ci.yml", "jenkinsfile", ".travis.yml", "azure-pipelines.yml", "bitbucket-pipelines.yml"], kind: "ci", label: "CI/CD Workflow Spec", icon: "🚀", google3d: "🚀" },
  { id: "exact_ssh_authorized", category: "exact", match: ["id_rsa", "id_ed25519", "id_ecdsa", "authorized_keys", "known_hosts", "ssh_config"], kind: "secret", label: "SSH Cryptographic Identity", icon: "🗝️", google3d: "🛡️" },
  { id: "exact_hosts", category: "exact", match: ["hosts", "resolv.conf", "nginx.conf", "caddyfile", "traefik.yml", "haproxy.cfg"], kind: "network", label: "Network & Reverse Proxy Config", icon: "🌐", google3d: "📡" },
  { id: "exact_crontab", category: "exact", match: ["crontab", "procfile", "supervisord.conf"], kind: "system", label: "System Daemon Schedule", icon: "⏱️", google3d: "⏱️" },
  { id: "exact_claude_gemini", category: "exact", match: ["agents.md", "claude.md", "gemini.md", "skill.md", ".cursorrules", "copilot-instructions.md"], kind: "ai", label: "AI Agent Instructions & Skills", icon: "✨", google3d: "✨" },
  { id: "exact_bazel", category: "exact", match: ["build.bazel", "workspace.bazel", "module.bazel", ".bazelrc", "buckconfig"], kind: "build", label: "Google Bazel Build System", icon: "🟢", google3d: "🧱" },
  { id: "exact_android_manifest", category: "exact", match: ["androidmanifest.xml", "podfile", "info.plist", "fastfile"], kind: "mobile", label: "Mobile App Platform Manifest", icon: "📱", google3d: "📱" },
  { id: "exact_favicon", category: "exact", match: ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "site.webmanifest", "manifest.webmanifest"], kind: "image", label: "Web App Icon & Manifest", icon: "🌟", google3d: "🌟" },
  { id: "exact_ds_store", category: "exact", match: [".ds_store", "thumbs.db", "desktop.ini"], kind: "system", label: "OS Desktop Metadata", icon: "👻", google3d: "🫧" },
  { id: "exact_shell_rc", category: "exact", match: [".zshrc", ".bashrc", ".bash_profile", ".zprofile", ".profile", "config.fish", ".ashrc"], kind: "code", label: "Shell Startup Profile", icon: "🐚", google3d: "📟" },
  { id: "exact_vim_nvim", category: "exact", match: [".vimrc", ".nvimrc", "init.lua", "init.vim", ".ideavimrc", "lazy-lock.json"], kind: "code", label: "Vim / Neovim Configuration", icon: "🌙", google3d: "🌙" },
  { id: "exact_terminal_emulator", category: "exact", match: [".tmux.conf", "tmux.conf", "wezterm.lua", "alacritty.toml", "kitty.conf", "ghostty.config", "starship.toml"], kind: "config", label: "Terminal Multiplexer & GPU Config", icon: "🖥️", google3d: "📟" },
  { id: "exact_brewfile", category: "exact", match: ["brewfile", "brewfile.lock.json", "cartfile", "appfile", "matchfile"], kind: "manifest", label: "macOS Homebrew & Cocoa Bundle", icon: "🍎", google3d: "🍎" },
  { id: "exact_gemfile", category: "exact", match: ["gemfile", "rakefile", "guardfile", "config.ru", ".ruby-version"], kind: "manifest", label: "Ruby Bundler & Rakefile", icon: "💎", google3d: "💎" },
  { id: "exact_deno", category: "exact", match: ["deno.json", "deno.jsonc", "deno.lock", "import_map.json"], kind: "manifest", label: "Deno Runtime Config", icon: "🦕", google3d: "🦕" },
  { id: "exact_monorepo", category: "exact", match: ["turbo.json", "nx.json", "lerna.json", "pnpm-workspace.yaml", "rush.json", "workspace.json"], kind: "build", label: "Monorepo Orchestrator Config", icon: "⚡", google3d: "🚀" },
  { id: "exact_edge_deploy", category: "exact", match: ["vercel.json", "netlify.toml", "fly.toml", "wrangler.toml", "railway.json", "render.yaml", "amplify.yml"], kind: "cloud", label: "Edge & Serverless Deploy Config", icon: "☁️", google3d: "🚀" },
  { id: "exact_test_config", category: "exact", match: ["vitest.config.ts", "vitest.config.js", "jest.config.ts", "jest.config.js", "playwright.config.ts", "cypress.config.ts", "pytest.ini", "tox.ini"], kind: "code", label: "Automated Test Suite Config", icon: "🧪", google3d: "🧪" },
  { id: "exact_metaframework", category: "exact", match: ["svelte.config.js", "nuxt.config.ts", "remix.config.js", "angular.json", "solid.config.ts", "qwik.config.ts"], kind: "code", label: "Fullstack Web Framework Config", icon: "✨", google3d: "🌐" },
  { id: "exact_desktop_app", category: "exact", match: ["tauri.conf.json", "capacitor.config.ts", "electron-builder.yml", "forge.config.js", "app.json", "eas.json"], kind: "exec", label: "Cross-Platform App Packager", icon: "📱", google3d: "🚀" },
  { id: "exact_native_pkg", category: "exact", match: ["vcpkg.json", "conanfile.txt", "conanfile.py", "build.zig", "build.zig.zon", "xmake.lua", "kconfig"], kind: "build", label: "Systems & Native Package Graph", icon: "⚙️", google3d: "🔩" },
  { id: "exact_devops_iac", category: "exact", match: ["vagrantfile", "ansible.cfg", "playbook.yml", "pulumi.yaml", "serverless.yml", "packer.pkr.hcl", "nomad.hcl"], kind: "cloud", label: "Infrastructure & Provisioning Playbook", icon: "🏗️", google3d: "☁️" },
  { id: "exact_api_spec", category: "exact", match: ["openapi.yaml", "openapi.json", "swagger.yaml", "swagger.json", "asyncapi.yaml", "buf.yaml", "buf.gen.yaml"], kind: "code", label: "OpenAPI / Swagger / Protobuf Contract", icon: "📡", google3d: "🛰️" },
  { id: "exact_governance", category: "exact", match: ["codeowners", "authors", "contributors.md", "citation.cff", "funding.yml", "code_of_conduct.md", "support.md"], kind: "doc", label: "Repository Governance & Attribution", icon: "🛡️", google3d: "📘" },
  { id: "exact_web_crawler", category: "exact", match: ["robots.txt", "sitemap.xml", "humans.txt", "ads.txt", "security.txt", ".htaccess", "browserconfig.xml"], kind: "code", label: "Web Crawler & Server Directives", icon: "🌐", google3d: "🌐" },
  { id: "exact_ignore_list", category: "exact", match: [".dockerignore", ".npmignore", ".eslintignore", ".prettierignore", ".stylelintignore", ".cursorignore", ".aiignore"], kind: "config", label: "Tooling Ignore Filter Rules", icon: "🙈", google3d: "🛡️" },
  { id: "exact_rust_toolchain", category: "exact", match: ["rust-toolchain.toml", "rustfmt.toml", "clippy.toml", "cross.toml", "deny.toml"], kind: "config", label: "Rust Toolchain & Linter Spec", icon: "🦀", google3d: "🦀" },
  { id: "exact_python_env", category: "exact", match: [".flake8", ".pylintrc", "mypy.ini", ".python-version", "conda.yaml", "environment.yml"], kind: "config", label: "Python Typechecker & Conda Spec", icon: "🐍", google3d: "🐍" },
  { id: "exact_supabase", category: "exact", match: ["supabase.json", "seed.sql", "migrations.sql"], kind: "database", label: "Supabase & SQL Seed Script", icon: "⚡", google3d: "🛢️" },
  { id: "exact_cursor_windsurf", category: "exact", match: [".windsurfrules", ".clinerules", "aidev.md", "prompt.md", "system_prompt.md"], kind: "ai", label: "AI IDE Rules & Prompt Specs", icon: "🧠", google3d: "✨" },
  { id: "exact_mcp_config", category: "exact", match: ["mcp.json", ".mcp.json", "claude_desktop_config.json", "antigravity.json"], kind: "ai", label: "MCP Server & Agent Registry", icon: "🔌", google3d: "🛰️" },
  { id: "exact_raycast_alfred", category: "exact", match: ["raycast.json", "info.plist.alfred", "hotkeys.json", "karabiner.json"], kind: "config", label: "macOS Launcher & Keymap Config", icon: "⌘", google3d: "🍎" },
  { id: "exact_hyprland_sway", category: "exact", match: ["hyprland.conf", "hyprlock.conf", "waybar.json", "rofi.rasi"], kind: "config", label: "Wayland Compositor & Bar Rice", icon: "🪟", google3d: "🐧" },
  { id: "exact_qmk_keymap", category: "exact", match: ["keymap.c", "rules.mk", "vial.json", "zmk.keymap"], kind: "code", label: "QMK / ZMK Mechanical Keyboard Firmware", icon: "⌨️", google3d: "🔩" },
  { id: "exact_shader_pipeline", category: "exact", match: ["shader.glsl", "postprocess.wgsl", "raytrace.rgen", "bloom.frag"], kind: "shader", label: "Realtime Raytracing & Bloom Shader", icon: "🔮", google3d: "🔮" },
  { id: "exact_blender_startup", category: "exact", match: ["startup.blend", "userpref.blend", "geonodes.blend"], kind: "3d", label: "Blender Studio Scene & Node Graph", icon: "🧊", google3d: "🧊" },
  { id: "exact_ableton_als", category: "exact", match: ["project.als", "master.logicx", "session.ptx", "rack.adg"], kind: "audio", label: "DAW Master Session & Synth Rack", icon: "🎚️", google3d: "🎚️" },
  { id: "exact_davinci_drp", category: "exact", match: ["timeline.drp", "colorgrade.cube", "aces_config.ocio"], kind: "video", label: "DaVinci Resolve & ACES Color Pipeline", icon: "🎬", google3d: "🎬" },
  { id: "exact_wireshark_pcap", category: "exact", match: ["capture.pcap", "traffic.pcapng", "handshake.cap", "yara.rules"], kind: "secret", label: "Packet Capture & Threat Signatures", icon: "🦈", google3d: "🛡️" },
  { id: "exact_hardhat_foundry", category: "exact", match: ["foundry.toml", "hardhat.config.ts", "hardhat.config.js", "anchor.toml", "remappings.txt"], kind: "code", label: "Foundry / Hardhat Smart Contract Suite", icon: "⚒️", google3d: "💎" },
  { id: "exact_huggingface", category: "exact", match: ["model.safetensors.index.json", "tokenizer.json", "tokenizer_config.json", "adapter_config.json"], kind: "ai", label: "HuggingFace Tokenizer & LoRA Adapter", icon: "🤗", google3d: "✨" },
  { id: "exact_litestream_duckdb", category: "exact", match: ["litestream.yml", "duckdb.conf", "turso.toml", "wrangler.d1.toml"], kind: "database", label: "Edge Database & Replica Config", icon: "🦆", google3d: "🛢️" },
  { id: "exact_systemd_unit", category: "exact", match: ["docker.service", "nginx.service", "caddy.service", "crontab.root"], kind: "system", label: "Linux Systemd Service Unit", icon: "🐧", google3d: "⚙️" },
  { id: "exact_apple_entitlements", category: "exact", match: ["app.entitlements", "privacyinfo.xcprivacy", "package.swift", "project.pbxproj"], kind: "code", label: "Swift Package & Apple Privacy Manifest", icon: "🍎", google3d: "🍎" },

  // ── 80 File Extension / Semantic Kind System Icons ────────────────────────
  { id: "ext_typescript", category: "extension", exts: "ts tsx mts cts", kind: "code", label: "TypeScript & TSX", icon: "🔷", google3d: "🔷" },
  { id: "ext_javascript", category: "extension", exts: "js jsx mjs cjs", kind: "code", label: "JavaScript & JSX", icon: "🟨", google3d: "⚡" },
  { id: "ext_python", category: "extension", exts: "py pyw pyi pyx pxd", kind: "code", label: "Python Script & Stubs", icon: "🐍", google3d: "🐍" },
  { id: "ext_rust", category: "extension", exts: "rs rlib", kind: "code", label: "Rust Systems Code", icon: "🦀", google3d: "🦀" },
  { id: "ext_go", category: "extension", exts: "go", kind: "code", label: "Go Source Code", icon: "🐹", google3d: "🐹" },
  { id: "ext_vlang", category: "extension", exts: "v vsh vv", kind: "code", label: "Vlang Source & Script", icon: "⚡", google3d: "⚡" },
  { id: "ext_cpp_c", category: "extension", exts: "c h cpp hpp cc cxx hh hxx ino", kind: "code", label: "C / C++ & Embedded Firmware", icon: "⚙️", google3d: "🔩" },
  { id: "ext_zig_nim", category: "extension", exts: "zig zon nim nims", kind: "code", label: "Zig & Nim Systems Code", icon: "⚡", google3d: "⚡" },
  { id: "ext_java_kotlin", category: "extension", exts: "java kt kts class scala groovy", kind: "code", label: "Java, Kotlin & JVM", icon: "☕", google3d: "☕" },
  { id: "ext_swift_apple", category: "extension", exts: "swift m mm xib storyboard pbxproj", kind: "code", label: "Swift & Apple Cocoa", icon: "🦅", google3d: "🍎" },
  { id: "ext_csharp_dotnet", category: "extension", exts: "cs csx fs fsx vb sln csproj", kind: "code", label: "C# & .NET Solution", icon: "🟣", google3d: "🟣" },
  { id: "ext_web_markup", category: "extension", exts: "html htm xhtml ejs hbs pug astro", kind: "code", label: "HTML & Web Templates", icon: "🌐", google3d: "🌐" },
  { id: "ext_stylesheets", category: "extension", exts: "css scss sass less styl", kind: "code", label: "CSS & Stylesheets", icon: "🎨", google3d: "🎨" },
  { id: "ext_reactive_ui", category: "extension", exts: "vue svelte solid", kind: "code", label: "Vue & Svelte Components", icon: "🧩", google3d: "🧩" },
  { id: "ext_dart_flutter", category: "extension", exts: "dart arb", kind: "code", label: "Google Dart & Flutter UI", icon: "🎯", google3d: "🎯" },
  { id: "ext_ruby_php", category: "extension", exts: "rb erb rake gemspec php phtml blade", kind: "code", label: "Ruby & PHP Backend", icon: "💎", google3d: "💎" },
  { id: "ext_functional", category: "extension", exts: "ex exs erl hrl hs lhs ml mli clj cljs cljc el lisp scm", kind: "code", label: "Elixir, Haskell & Lisp", icon: "🧪", google3d: "λ" },
  { id: "ext_data_science", category: "extension", exts: "r rmd jl mat nb", kind: "code", label: "R, Julia & Scientific Computing", icon: "🔬", google3d: "🔬" },
  { id: "ext_jupyter", category: "extension", exts: "ipynb", kind: "notebook", label: "Jupyter / Google Colab Notebook", icon: "📓", google3d: "📓" },
  { id: "ext_shell", category: "extension", exts: "sh bash zsh fish ksh csh tcsh ps1 psm1 bat cmd awk sed", kind: "code", label: "Shell & Terminal Scripts", icon: "🐚", google3d: "📟" },
  { id: "ext_lua_scripting", category: "extension", exts: "lua luau tcl pl pm gd", kind: "code", label: "Lua, Perl & Game Scripting", icon: "🌙", google3d: "🌙" },
  { id: "ext_wasm_asm", category: "extension", exts: "wasm wat asm s nasm spv", kind: "code", label: "WebAssembly & Assembly", icon: "🧬", google3d: "🧱" },
  { id: "ext_gpu_shader", category: "extension", exts: "glsl vert frag comp geom tesc tese wgsl hlsl fx metal", kind: "shader", label: "GPU 3D & Compute Shaders", icon: "🔮", google3d: "🔮" },
  { id: "ext_ai_weights", category: "extension", exts: "safetensors gguf onnx pt pth bin ckpt tflite h5 keras mlmodel", kind: "ai", label: "AI Neural Network Weights", icon: "🧠", google3d: "✨" },
  { id: "ext_database", category: "extension", exts: "sql sqlite sqlite3 db db3 mdb accdb duckdb parquet feather arrow orc avro", kind: "database", label: "SQL, SQLite & Columnar Data", icon: "🗄️", google3d: "🛢️" },
  { id: "ext_api_schema", category: "extension", exts: "graphql gql proto thrift avsc openapi", kind: "code", label: "Protobuf & GraphQL Schemas", icon: "🔌", google3d: "🛰️" },
  { id: "ext_structured_data", category: "extension", exts: "json jsonc json5 jsonl ndjson yaml yml toml xml plist kdl hcl", kind: "code", label: "JSON, YAML & TOML Config", icon: "📋", google3d: "📋" },
  { id: "ext_Infrastructure", category: "extension", exts: "tf tfvars bicep nomad", kind: "cloud", label: "Cloud Infrastructure as Code", icon: "☁️", google3d: "☁️" },
  { id: "ext_smart_contract", category: "extension", exts: "sol vy move cairo", kind: "code", label: "Smart Contracts & Web3", icon: "⛓️", google3d: "💎" },
  { id: "ext_security_cert", category: "extension", exts: "pem crt cer key pub pfx p12 der csr gpg pgp asc sig kdbx", kind: "secret", label: "Certificates, Keys & Vaults", icon: "🔐", google3d: "🛡️" },
  { id: "ext_raster_image", category: "extension", exts: "png jpg jpeg gif webp bmp ico tif tiff heic heif avif jxl", kind: "image", label: "Raster Photos & Graphics", icon: "🖼️", google3d: "🏞️" },
  { id: "ext_raw_photo", category: "extension", exts: "raw dng cr2 cr3 nef nrw arw srf sr2 orf rw2 raf pef", kind: "image", label: "Camera RAW Sensor Negatives", icon: "📸", google3d: "📸" },
  { id: "ext_vector_design", category: "extension", exts: "svg eps ai psd psb xcf fig sketch xd afdesign afphoto indd", kind: "image", label: "Vector & Pro Design Suites", icon: "✒️", google3d: "🎨" },
  { id: "ext_3d_mesh_cad", category: "extension", exts: "obj fbx gltf glb blend stl dae 3ds ply usdz usd step stp iges igs dwg dxf", kind: "3d", label: "3D Models, USDZ & CAD", icon: "🧊", google3d: "🧊" },
  { id: "ext_video_cinema", category: "extension", exts: "mp4 mov mkv avi webm wmv flv m4v mpg mpeg ts m2ts prores braw r3d", kind: "video", label: "Video & Cinema Footage", icon: "🎞️", google3d: "🎬" },
  { id: "ext_audio_music", category: "extension", exts: "mp3 wav flac aac ogg m4a wma opus aiff aif alac dsd", kind: "audio", label: "Lossless & Mastered Audio", icon: "🎵", google3d: "🎧" },
  { id: "ext_midi_daw", category: "extension", exts: "mid midi als flp logicx ptx rpp vst vst3 sf2", kind: "audio", label: "MIDI, DAW & Synth Plugins", icon: "🎹", google3d: "🎚️" },
  { id: "ext_pdf_ebook", category: "extension", exts: "pdf epub mobi azw3 djvu cbz cbr", kind: "pdf", label: "PDF & Digital Books", icon: "📕", google3d: "📕" },
  { id: "ext_word_docs", category: "extension", exts: "doc docx odt rtf pages wpd", kind: "doc", label: "Word Processing Documents", icon: "📄", google3d: "📘" },
  { id: "ext_spreadsheets", category: "extension", exts: "xls xlsx xlsm ods csv tsv numbers", kind: "sheet", label: "Spreadsheets & Tabular Data", icon: "📊", google3d: "📈" },
  { id: "ext_presentations", category: "extension", exts: "ppt pptx odp key", kind: "slide", label: "Keynote & Slide Decks", icon: "📽️", google3d: "📽️" },
  { id: "ext_markdown_notes", category: "extension", exts: "txt md markdown mdx rst tex bib org adoc nfo", kind: "text", label: "Markdown, LaTeX & Notes", icon: "📝", google3d: "🗒️" },
  { id: "ext_logs_patches", category: "extension", exts: "log diff patch err out", kind: "text", label: "System Logs & Git Patches", icon: "📜", google3d: "📋" },
  { id: "ext_ini_config", category: "extension", exts: "ini cfg conf properties reg service", kind: "text", label: "System & Service Config", icon: "🛠️", google3d: "🎛️" },
  { id: "ext_archives", category: "extension", exts: "zip rar 7z tar gz tgz bz2 xz zst lz4 br cab arj", kind: "archive", label: "Compressed Archives", icon: "🗜️", google3d: "📦" },
  { id: "ext_executables", category: "extension", exts: "exe msi app command jar apk aab ipa appimage scr com run vbs deb rpm pkg flatpak snap", kind: "exec", label: "Apps, Installers & Packages", icon: "⚙️", google3d: "🚀" },
  { id: "ext_shared_libs", category: "extension", exts: "dll so dylib a lib pdb o obj", kind: "exec", label: "Native Libraries & Binaries", icon: "🧱", google3d: "🧩" },
  { id: "ext_disk_images", category: "extension", exts: "iso dmg img vhd vhdx vmdk qcow2 ova ovf toast", kind: "disk", label: "Disk Images & Virtual Machines", icon: "💿", google3d: "💽" },
  { id: "ext_fonts", category: "extension", exts: "ttf otf woff woff2 eot pfb pfm", kind: "font", label: "TrueType & Web Fonts", icon: "🔤", google3d: "🔤" },
  { id: "ext_bio_science", category: "extension", exts: "fasta fa fastq fq vcf bam sam pdb cif mmcif sdf mol2", kind: "science", label: "Bioinformatics & Molecular Structures", icon: "🧬", google3d: "🧬" },
  { id: "ext_3d_print_cad", category: "extension", exts: "gcode bgcode 3mf amf scad fcstd f3d sldprt sldasm iam ipt catpart", kind: "3d", label: "3D Printing G-Code & Parametric CAD", icon: "📐", google3d: "🧊" },
  { id: "ext_pcb_eda", category: "extension", exts: "kicad_pcb kicad_sch kicad_pro kicad_mod gbr ger drl brd dsn", kind: "code", label: "KiCad PCB & Gerber Schematics", icon: "🔌", google3d: "📐" },
  { id: "ext_hdl_fpga", category: "extension", exts: "sv svh vhd vhdl bit xdc sdc qsf pcf", kind: "code", label: "Verilog, VHDL & FPGA Bitstreams", icon: "🎛️", google3d: "🔩" },
  { id: "ext_gis_maps", category: "extension", exts: "geojson topojson kml kmz gpx fit tcx shp shx dbf osm mbtiles", kind: "code", label: "GIS Cartography & GPS Tracks", icon: "🗺️", google3d: "🌐" },
  { id: "ext_macos_bundles", category: "extension", exts: "icns mobileconfig provisionprofile entitlements xcassets xcodeproj xcworkspace scpt applescript shortcut workflow", kind: "exec", label: "macOS & Xcode Asset Bundles", icon: "🍎", google3d: "🍎" },
  { id: "ext_windows_pro", category: "extension", exts: "lnk url inf cat sys drv dmp evtx vcxproj fsproj nupkg vsix appx msix rdp", kind: "exec", label: "Windows System & Visual Studio Packages", icon: "🪟", google3d: "⚙️" },
  { id: "ext_linux_systemd", category: "extension", exts: "flatpakref desktop socket timer target mount rules ebuild pkgbuild", kind: "exec", label: "Linux Desktop & Systemd Units", icon: "🐧", google3d: "🐧" },
  { id: "ext_retro_roms", category: "extension", exts: "nes sfc smc gb gbc gba nds 3ds cia n64 z64 v64 gcm wbfs rvz nsp xci chd pbp cso gen sms gg pce a26", kind: "disk", label: "Retro Console ROM Cartridges & ISOs", icon: "🕹️", google3d: "🕹️" },
  { id: "ext_game_engine", category: "extension", exts: "wad pk3 pak vpk bsp unitypackage unity prefab uasset umap upk tscn tres gdshader mcworld mcpack mcaddon mrpack schem nbt", kind: "archive", label: "Unity, Unreal, Godot & Minecraft Assets", icon: "🎮", google3d: "🕹️" },
  { id: "ext_daw_patches", category: "extension", exts: "alp bwproject cpr npr aup3 aup sesx omf aaf sfz nki nkm nksf exs fxp fxb component lv2 clap", kind: "audio", label: "Studio DAW Sessions & Synth Patches", icon: "🎚️", google3d: "🎚️" },
  { id: "ext_video_project", category: "extension", exts: "prproj aep aet mogrt drp dra fcpxml fcpbundle mlt kdenlive osp veg edl cube 3dl look", kind: "video", label: "Premiere, After Effects, DaVinci & 3D LUTs", icon: "🎬", google3d: "🎬" },
  { id: "ext_subtitles", category: "extension", exts: "srt vtt ass ssa sub idx sbv lrc ttml dfxp", kind: "text", label: "Subtitles, Captions & Timed Lyrics", icon: "💬", google3d: "🗒️" },
  { id: "ext_design_palettes", category: "extension", exts: "afpub idml cdr procreate brushset swatches ase aco clr pur lottie", kind: "image", label: "Procreate, Swatches & Lottie Animations", icon: "🎨", google3d: "🎨" },
  { id: "ext_encrypted_vault", category: "extension", exts: "radenc radsec age kbx 1pif 1pux ovpn wg tblk keystore jks", kind: "secret", label: "Encrypted Vaults & VPN Tunnels", icon: "🔐", google3d: "🛡️" },
  { id: "ext_theme_packages", category: "extension", exts: "ccfm tmtheme icls colorscheme itermcolors terminal css-theme vsix-theme", kind: "code", label: "Theme Packs & Color Schemes", icon: "🌈", google3d: "💎" },
  { id: "ext_diagrams_canvas", category: "extension", exts: "qmd typ asciidoc wiki canvas excalidraw drawio mermaid mmd puml plantuml dot gv", kind: "doc", label: "Architecture Diagrams, Typst & Canvas", icon: "📝", google3d: "📘" },
  { id: "ext_finance_ledgers", category: "extension", exts: "qfx ofx qif qbo iif gnucash beancount ledger hledger", kind: "sheet", label: "Financial Ledgers & Banking Exports", icon: "💹", google3d: "📊" },
  { id: "ext_torrent_magnet", category: "extension", exts: "torrent magnet nzb metalink meta4 part crdownload aria2", kind: "archive", label: "BitTorrent, P2P & Partial Transfers", icon: "🧲", google3d: "⬇️" },
  { id: "ext_astro_fits", category: "extension", exts: "fits fit fts asdf healpix", kind: "science", label: "Astronomy FITS & Telescope Cubes", icon: "🔭", google3d: "🪐" },
  { id: "ext_ebook_comic", category: "extension", exts: "cb7 cbt cba fb2 lit lrf", kind: "pdf", label: "Comic Archives & Fiction eBooks", icon: "🗯️", google3d: "📕" },
  { id: "ext_cuda_hip", category: "extension", exts: "cu cuh hip cl ptx cubin fatbin", kind: "code", label: "CUDA, HIP & OpenCL GPU Kernels", icon: "🟢", google3d: "⚡" },
  { id: "ext_apple_metal_ar", category: "extension", exts: "metallib reality rkassets scn sks", kind: "3d", label: "Apple Metal Shaders & RealityKit 3D", icon: "🥽", google3d: "🥽" },
  { id: "ext_cinema_camera", category: "extension", exts: "ari crm mxf dpx exr cin cdng", kind: "video", label: "ARRI Alexa, OpenEXR & Cinema Dailies", icon: "🎥", google3d: "🎬" },
  { id: "ext_eurorack_synth", category: "extension", exts: "vcv pd maxpat maxhelp amxd adg adv", kind: "audio", label: "VCV Rack, Max/MSP & Ableton Racks", icon: "🎛️", google3d: "🎚️" },
  { id: "ext_lossless_hires", category: "extension", exts: "dff dsf wv ape tak mqa", kind: "audio", label: "Audiophile DSD, WavPack & Hi-Res Audio", icon: "💿", google3d: "🎧" },
  { id: "ext_pcap_forensics", category: "extension", exts: "pcap pcapng cap rawmem yara yar", kind: "secret", label: "Network Packet Captures & Memory Dumps", icon: "🦈", google3d: "🛡️" },
  { id: "ext_zk_circuits", category: "extension", exts: "circom noir leo zkey r1cs wasm_zk", kind: "code", label: "Zero-Knowledge Circom & Noir Circuits", icon: "⛓️", google3d: "💎" },
  { id: "ext_llm_quantized", category: "extension", exts: "ggml awq gptq exl2 lora mar", kind: "ai", label: "Quantized LLM Weights & LoRA Tensors", icon: "🧠", google3d: "✨" },
  { id: "ext_medical_dicom", category: "extension", exts: "dcm dicom nii gz_nii mha mhd nrrd", kind: "science", label: "Medical DICOM & Neuroimaging Volumes", icon: "🩺", google3d: "🧬" },
  { id: "ext_chem_quantum", category: "extension", exts: "xyz mol rxn cml inp out_qc chk fchk cube_qc", kind: "science", label: "Quantum Chemistry & Molecular Orbitals", icon: "⚛️", google3d: "⚛️" },
  { id: "ext_drone_telemetry", category: "extension", exts: "bbl bfl ulog tlog igc kml_fpv", kind: "code", label: "FPV Drone Blackbox & MAVLink Telemetry", icon: "🚁", google3d: "🛰️" },
  { id: "ext_keeb_firmware", category: "extension", exts: "uf2 hex bin_qmk via vil keymap", kind: "exec", label: "UF2 Bootloader & VIA Keyboard Maps", icon: "⌨️", google3d: "🔩" },
  { id: "ext_bim_architecture", category: "extension", exts: "rvt rfa ifc nwd nwc skp layout", kind: "3d", label: "Revit BIM, IFC & SketchUp Architecture", icon: "🏛️", google3d: "📐" },
  { id: "ext_vtt_tabletop", category: "extension", exts: "dd2vtt uvtt fvtt dnd5e pch2", kind: "doc", label: "Virtual Tabletop Maps & RPG Campaigns", icon: "🎲", google3d: "🎲" },
  { id: "ext_obsidian_graph", category: "extension", exts: "base canvas_ob loom excalidraw_md", kind: "doc", label: "Obsidian Canvas & Knowledge Bases", icon: "💎", google3d: "📓" },
];

export const BUTTON_ICON_CATALOG = [
  { id: "back", group: "nav", label: "Navigate Back", icon: "←", macos: "◀", fluent: "⬅️", studio: "◁", cyber: "◁", inferno: "🔥←", slime: "🧪←", storm: "🌬️←", cryo: "❄️←", arcane: "⚜️←", royal: "👑←", godmode: "◀" },
  { id: "forward", group: "nav", label: "Navigate Forward", icon: "→", macos: "▶", fluent: "➡️", studio: "▷", cyber: "▷", inferno: "→🔥", slime: "→🧪", storm: "→🌬️", cryo: "→❄️", arcane: "→⚜️", royal: "→👑", godmode: "▶" },
  { id: "up", group: "nav", label: "Parent Folder", icon: "↑", macos: "▲", fluent: "⬆️", studio: "△", cyber: "△", inferno: "🔥↑", slime: "🧪↑", storm: "🌪️↑", cryo: "🧊↑", arcane: "🏰↑", royal: "👑↑", godmode: "▲" },
  { id: "refresh", group: "nav", label: "Reload Directory", icon: "↻", macos: "↻", fluent: "🔄", studio: "⟳", cyber: "⟳", inferno: "☄️", slime: "🫧", storm: "🌀", cryo: "❄️", arcane: "🔮", royal: "⚜️", godmode: "🔄" },
  { id: "newFolder", group: "create", label: "New Folder Button", icon: "📁+", macos: "📁+", fluent: "🗂️+", studio: "🗄️+", cyber: "💠+", inferno: "🔥+", slime: "🧪+", storm: "🌪️+", cryo: "🧊+", arcane: "📜+", royal: "👑+", godmode: "🪐+" },
  { id: "newFile", group: "create", label: "New File Button", icon: "📄+", macos: "📄+", fluent: "📃+", studio: "📑+", cyber: "📟+", inferno: "🧨+", slime: "💧+", storm: "🌧️+", cryo: "❄️+", arcane: "🪶+", royal: "💎+", godmode: "✨+" },
  { id: "newSqlite", group: "create", label: "New SQLite Database Button", icon: "🗄️+", macos: "🗄️+", fluent: "🛢️+", studio: "🛢️+", cyber: "🧊+", inferno: "🌋+", slime: "🧫+", storm: "🌊+", cryo: "🏔️+", arcane: "🏺+", royal: "🏛️+", godmode: "⚛️+" },
  { id: "cut", group: "clipboard", label: "Cut Selection", icon: "✂", macos: "✂️", fluent: "✂️", studio: "🎞️", cyber: "⚡", inferno: "🗡️", slime: "🧪", storm: "⚡", cryo: "⛏️", arcane: "⚔️", royal: "⚜️", godmode: "⚡" },
  { id: "copy", group: "clipboard", label: "Copy Selection", icon: "⎘", macos: "📑", fluent: "📋", studio: "⎘", cyber: "⧉", inferno: "🔥", slime: "🦠", storm: "🌩️", cryo: "🪞", arcane: "🪞", royal: "💍", godmode: "💠" },
  { id: "paste", group: "clipboard", label: "Paste Clipboard", icon: "📋", macos: "📋", fluent: "📥", studio: "📋", cyber: "📲", inferno: "🏮", slime: "🧫", storm: "🌊", cryo: "🧊", arcane: "📜", royal: "📋", godmode: "📋" },
  { id: "rename", group: "edit", label: "Rename Item", icon: "✎", macos: "✏️", fluent: "🖊️", studio: "✒️", cyber: "✎", inferno: "🔱", slime: "🧬", storm: "🍃", cryo: "❄️", arcane: "🪶", royal: "✒️", godmode: "✒️" },
  { id: "delete", group: "danger", label: "Move to Recycle Bin", icon: "🗑", macos: "🗑️", fluent: "🗑️", studio: "🗑️", cyber: "☢️", inferno: "💣", slime: "☣️", storm: "🌩️", cryo: "🌨️", arcane: "💀", royal: "🗑️", godmode: "🕳️" },
  { id: "restore", group: "recycle", label: "Restore from Bin", icon: "↩", macos: "↩️", fluent: "♻️", studio: "↩", cyber: "⏪", inferno: "🌅", slime: "🌱", storm: "🌈", cryo: "❄️", arcane: "✨", royal: "👑", godmode: "⏳" },
  { id: "deleteForever", group: "danger", label: "Delete Permanently", icon: "✕", macos: "🗑️✕", fluent: "💥", studio: "✕", cyber: "💥", inferno: "🌋", slime: "☣️", storm: "⛈️", cryo: "💥", arcane: "⚰️", royal: "⚜️✕", godmode: "💥" },
  { id: "empty", group: "danger", label: "Empty Recycle Bin", icon: "🧹", macos: "🧹", fluent: "🧹", studio: "🧹", cyber: "☢️", inferno: "🌋", slime: "☣️", storm: "🌀", cryo: "🌬️", arcane: "🔥", royal: "🧹", godmode: "🕳️" },
  { id: "undo", group: "history", label: "Undo Action", icon: "↶", macos: "↩️", fluent: "↩️", studio: "↶", cyber: "⏪", inferno: "🕯️", slime: "🫧", storm: "🌬️", cryo: "❄️", arcane: "⏳", royal: "🕰️", godmode: "⏳" },
  { id: "activity", group: "history", label: "Activity Log", icon: "🕘", macos: "🕒", fluent: "📈", studio: "📡", cyber: "📡", inferno: "🏮", slime: "🔬", storm: "🧭", cryo: "🌌", arcane: "📜", royal: "🕰️", godmode: "🔭" },
  { id: "view", group: "view", label: "Layout & View Switcher", icon: "☰", macos: "⊞", fluent: "🪟", studio: "🎛️", cyber: "⊞", inferno: "🎆", slime: "🧫", storm: "🧭", cryo: "🧊", arcane: "🧿", royal: "💠", godmode: "💠" },
  { id: "favorites", group: "places", label: "Favorites & Bookmarks", icon: "⭐", macos: "⭐", fluent: "🌟", studio: "⭐", cyber: "💠", inferno: "🔥", slime: "🦠", storm: "⚡", cryo: "❄️", arcane: "🌟", royal: "👑", godmode: "🌟" },
  { id: "recent", group: "places", label: "Recent Files Menu", icon: "🕘", macos: "🕒", fluent: "🕘", studio: "⏱️", cyber: "⏱️", inferno: "🕯️", slime: "🧪", storm: "🌪️", cryo: "🧊", arcane: "⏳", royal: "🕰️", godmode: "⏳" },
  { id: "info", group: "inspect", label: "File Inspector & Metadata", icon: "ℹ", macos: "ℹ️", fluent: "ℹ️", studio: "📋", cyber: "📡", inferno: "🏮", slime: "🔬", storm: "🧭", cryo: "❄️", arcane: "🧿", royal: "💎", godmode: "🔮" },
  { id: "lock", group: "security", label: "Encrypt & Vault Lock", icon: "🔒", macos: "🔐", fluent: "🛡️", studio: "🔐", cyber: "🛡️", inferno: "🔱", slime: "☣️", storm: "⚡", cryo: "🧊", arcane: "🗝️", royal: "🔐", godmode: "🛡️" },
  { id: "tools", group: "studio", label: "Text, File & Media Tools", icon: "🧰", macos: "🧰", fluent: "🛠️", studio: "🎛️", cyber: "🛠️", inferno: "⚒️", slime: "🧪", storm: "🧭", cryo: "⛏️", arcane: "⚗️", royal: "⚜️", godmode: "🧰" },
  { id: "power", group: "studio", label: "Power Compare, Sync & Serve", icon: "⚡", macos: "⚡", fluent: "⚡", studio: "⚡", cyber: "🔋", inferno: "☄️", slime: "🧬", storm: "🌩️", cryo: "❄️", arcane: "🔮", royal: "👑", godmode: "⚛️" },
  { id: "databases", group: "studio", label: "SQL & Database Studios", icon: "🗄️", macos: "🗄️", fluent: "🛢️", studio: "🗄️", cyber: "🧊", inferno: "🌋", slime: "🛢️", storm: "🌊", cryo: "🏔️", arcane: "🏺", royal: "🏛️", godmode: "🛢️" },
  { id: "games", group: "studio", label: "Arcade & Game Studios", icon: "🕹️", macos: "🎮", fluent: "🕹️", studio: "🕹️", cyber: "👾", inferno: "🎆", slime: "👁️", storm: "⛈️", cryo: "⛷️", arcane: "🎲", royal: "👑", godmode: "🕹️" },
  { id: "terminal", group: "studio", label: "Integrated Terminal", icon: ">_", macos: "⌘_", fluent: ">_", studio: ">_", cyber: "📟", inferno: "🔥_", slime: "🧪_", storm: "⚡_", cryo: "❄️_", arcane: "🔮_", royal: "⚜️_", godmode: "⚡_" },
  { id: "themes", group: "appearance", label: "Themes & Shader Studio", icon: "🎨", macos: "🎨", fluent: "🌈", studio: "🌈", cyber: "🔮", inferno: "🎆", slime: "🧫", storm: "🌈", cryo: "🌌", arcane: "🎭", royal: "💎", godmode: "🌈" },
  { id: "settings", group: "appearance", label: "File Manager Settings", icon: "⚙", macos: "⚙️", fluent: "🎛️", studio: "🎛️", cyber: "🎛️", inferno: "🔱", slime: "🧬", storm: "🧭", cryo: "❄️", arcane: "⚙️", royal: "🕰️", godmode: "🎛️" },
  { id: "help", group: "help", label: "User Guide & Shortcuts", icon: "❓", macos: "❓", fluent: "💡", studio: "❓", cyber: "❔", inferno: "🏮", slime: "👁️", storm: "🌈", cryo: "❄️", arcane: "📖", royal: "⚜️", godmode: "🔮" },
  { id: "home", group: "places", label: "Home Dashboard", icon: "🏠", macos: "🏠", fluent: "🏠", studio: "🏛️", cyber: "🛸", inferno: "🏮", slime: "🧫", storm: "🧭", cryo: "🏔️", arcane: "🏰", royal: "🏛️", godmode: "🏛️" },
  { id: "recycle", group: "places", label: "Recycle Bin", icon: "🗑️", macos: "🗑️", fluent: "🗑️", studio: "🗑️", cyber: "🕳️", inferno: "🌋", slime: "☣️", storm: "🌀", cryo: "🕳️", arcane: "⚰️", royal: "🏺", godmode: "🕳️" },
  { id: "search", group: "nav", label: "Quick Search & Filter", icon: "🔍", macos: "🔍", fluent: "🔎", studio: "🔭", cyber: "📡", inferno: "🔥", slime: "🔬", storm: "⚡", cryo: "❄️", arcane: "🧿", royal: "💎", godmode: "🔭" },
  { id: "compress", group: "studio", label: "Compress Archive", icon: "🗜️", macos: "📦", fluent: "🧳", studio: "🧰", cyber: "🧊", inferno: "💣", slime: "🛢️", storm: "🌊", cryo: "🏔️", arcane: "🏺", royal: "💍", godmode: "📦" },
  { id: "extract", group: "studio", label: "Extract Archive", icon: "📂", macos: "📂", fluent: "🗂️", studio: "🗄️", cyber: "💠", inferno: "🎆", slime: "🫧", storm: "🌪️", cryo: "🧊", arcane: "📜", royal: "👑", godmode: "🪐" },
  { id: "share", group: "studio", label: "Share & Export", icon: "📤", macos: "📤", fluent: "🚀", studio: "🛰️", cyber: "📡", inferno: "☄️", slime: "🫧", storm: "🌬️", cryo: "❄️", arcane: "🦅", royal: "⚜️", godmode: "🛰️" },
  { id: "newTemplate", group: "create", label: "New from Template", icon: "✨+", macos: "✨+", fluent: "🪄+", studio: "🎬+", cyber: "⚡+", inferno: "☄️+", slime: "🧬+", storm: "🌈+", cryo: "❄️+", arcane: "🔮+", royal: "👑+", godmode: "🌟+" },
  { id: "duplicate", group: "clipboard", label: "Duplicate Selection", icon: "⧉", macos: "⧉", fluent: "📑", studio: "⧉", cyber: "💠", inferno: "🔥", slime: "🦠", storm: "🌩️", cryo: "🪞", arcane: "🪞", royal: "💍", godmode: "💠" },
  { id: "zip", group: "studio", label: "Zip Archive", icon: "🗜️", macos: "📦", fluent: "🧳", studio: "🧰", cyber: "🧊", inferno: "💣", slime: "🛢️", storm: "🌊", cryo: "🏔️", arcane: "🏺", royal: "💍", godmode: "📦" },
  { id: "upload", group: "nav", label: "Upload Files", icon: "⬆️", macos: "📤", fluent: "⬆️", studio: "📡", cyber: "⚡", inferno: "🚀", slime: "🫧", storm: "🌪️", cryo: "❄️", arcane: "🦅", royal: "⚜️", godmode: "🚀" },
  { id: "download", group: "nav", label: "Download Selection", icon: "⬇️", macos: "📥", fluent: "⬇️", studio: "📡", cyber: "💠", inferno: "☄️", slime: "💧", storm: "🌧️", cryo: "🧊", arcane: "📜", royal: "👑", godmode: "⬇️" },
  { id: "commandPalette", group: "studio", label: "Command Palette", icon: "⌘K", macos: "⌘", fluent: "🔎", studio: "🎛️", cyber: "📟", inferno: "🔥", slime: "🧪", storm: "⚡", cryo: "❄️", arcane: "🔮", royal: "👑", godmode: "✨" },
  { id: "grave", group: "recycle", label: "Graveyard & Recovery", icon: "🪦", macos: "🕰️", fluent: "♻️", studio: "🗄️", cyber: "🕳️", inferno: "🌋", slime: "☣️", storm: "🌀", cryo: "🧊", arcane: "⚰️", royal: "🏺", godmode: "⏳" },
  { id: "qr", group: "studio", label: "QR Drop & Mobile Beam", icon: "📱", macos: "📱", fluent: "📲", studio: "📡", cyber: "📡", inferno: "🏮", slime: "🔬", storm: "⚡", cryo: "❄️", arcane: "🧿", royal: "💎", godmode: "🛰️" },
  { id: "serve", group: "studio", label: "HTTP Live Server", icon: "🌐", macos: "🌐", fluent: "🛰️", studio: "📡", cyber: "🛰️", inferno: "🔥", slime: "🫧", storm: "🌩️", cryo: "❄️", arcane: "🔮", royal: "👑", godmode: "🛰️" },
  { id: "secrets", group: "security", label: "Secrets & Key Vault", icon: "🗝️", macos: "🗝️", fluent: "🛡️", studio: "🔐", cyber: "🛡️", inferno: "🔱", slime: "☣️", storm: "⚡", cryo: "🧊", arcane: "🗝️", royal: "👑", godmode: "🛡️" },
  { id: "imagestudio", group: "studio", label: "HDR Image Studio", icon: "🎨", macos: "🏞️", fluent: "🎨", studio: "📸", cyber: "🔮", inferno: "🌅", slime: "🦠", storm: "🌈", cryo: "❄️", arcane: "🎭", royal: "🖼️", godmode: "🌈" },
  { id: "mediadeck", group: "studio", label: "Cinema Media Deck", icon: "🎬", macos: "🎬", fluent: "📽️", studio: "🎞️", cyber: "📡", inferno: "🎆", slime: "👁️", storm: "🌩️", cryo: "🏔️", arcane: "🔮", royal: "🎬", godmode: "🎬" },
  // Quickbar Kind Filter Chips
  { id: "chip.all", group: "chip", label: "All Items Chip", icon: "✦", macos: "✦", fluent: "✨", studio: "🎛️", cyber: "💠", inferno: "🔥", slime: "🧪", storm: "⚡", cryo: "❄️", arcane: "🔮", royal: "👑", godmode: "🪐" },
  { id: "chip.folder", group: "chip", label: "Folders Filter Chip", icon: "📁", macos: "📁", fluent: "🗂️", studio: "🗄️", cyber: "💠", inferno: "🔥", slime: "🧪", storm: "🌪️", cryo: "🧊", arcane: "📜", royal: "👑", godmode: "🪐" },
  { id: "chip.code", group: "chip", label: "Code Filter Chip", icon: "💻", macos: "🧑‍💻", fluent: "💻", studio: "⚡", cyber: "⚡", inferno: "☄️", slime: "🧬", storm: "⚡", cryo: "❄️", arcane: "🔮", royal: "💎", godmode: "⚡" },
  { id: "chip.image", group: "chip", label: "Images Filter Chip", icon: "🖼️", macos: "🏞️", fluent: "🖼️", studio: "📸", cyber: "🔮", inferno: "🌅", slime: "🦠", storm: "🌈", cryo: "❄️", arcane: "🎭", royal: "🖼️", godmode: "🏞️" },
  { id: "chip.video", group: "chip", label: "Video Filter Chip", icon: "🎞️", macos: "🎬", fluent: "📽️", studio: "🎞️", cyber: "📡", inferno: "🎬", slime: "👁️", storm: "🌩️", cryo: "🏔️", arcane: "🪩", royal: "🎬", godmode: "🎬" },
  { id: "chip.audio", group: "chip", label: "Audio Filter Chip", icon: "🎵", macos: "🎧", fluent: "🎵", studio: "🎚️", cyber: "🎛️", inferno: "🎸", slime: "🫧", storm: "🌬️", cryo: "🎐", arcane: "🎶", royal: "🎼", godmode: "🎧" },
  { id: "chip.docs", group: "chip", label: "Docs Filter Chip", icon: "📕", macos: "📘", fluent: "📕", studio: "📑", cyber: "📟", inferno: "📜", slime: "🧫", storm: "🍃", cryo: "🌨️", arcane: "📜", royal: "📘", godmode: "📘" },
  { id: "chip.data", group: "chip", label: "Data Filter Chip", icon: "📊", macos: "📊", fluent: "📈", studio: "📐", cyber: "📉", inferno: "📈", slime: "🧬", storm: "🧭", cryo: "🧊", arcane: "🧿", royal: "💹", godmode: "📈" },
  { id: "chip.archive", group: "chip", label: "Archives Filter Chip", icon: "🗜️", macos: "📦", fluent: "🧳", studio: "🧰", cyber: "🧊", inferno: "💣", slime: "🛢️", storm: "🌊", cryo: "🏔️", arcane: "🏺", royal: "💍", godmode: "📦" },
  // Selection Action Bar Buttons
  { id: "sb.quicklook", group: "selection", label: "Quick Look Selection", icon: "👁️", macos: "👁️", fluent: "🔎", studio: "🔭", cyber: "📡", inferno: "🔥", slime: "👁️", storm: "⚡", cryo: "❄️", arcane: "🧿", royal: "💎", godmode: "🔮" },
  { id: "sb.code", group: "selection", label: "Edit in Code Studio", icon: "📝", macos: "🧑‍💻", fluent: "📝", studio: "⚡", cyber: "📟", inferno: "🕯️", slime: "🧬", storm: "⚡", cryo: "❄️", arcane: "🪶", royal: "✒️", godmode: "⚡" },
  { id: "sb.hex", group: "selection", label: "Hex Binary Inspector", icon: "🔢", macos: "🔢", fluent: "🧩", studio: "🎛️", cyber: "👾", inferno: "🔱", slime: "🔬", storm: "🧭", cryo: "🧊", arcane: "🔯", royal: "⚜️", godmode: "⚛️" },
  { id: "sb.compare", group: "selection", label: "Diff & Compare", icon: "⚖️", macos: "⚖️", fluent: "🔀", studio: "📐", cyber: "⧉", inferno: "⚔️", slime: "🧪", storm: "⚡", cryo: "🪞", arcane: "⚖️", royal: "👑", godmode: "⚖️" },
  { id: "sb.batchRename", group: "selection", label: "Batch Rename", icon: "🏷️", macos: "🏷️", fluent: "🖊️", studio: "✒️", cyber: "✎", inferno: "🔱", slime: "🧬", storm: "🍃", cryo: "❄️", arcane: "🪶", royal: "✒️", godmode: "🏷️" },
  { id: "sb.BatchEnc", group: "selection", label: "Batch Encrypt", icon: "🔐", macos: "🔐", fluent: "🛡️", studio: "🔐", cyber: "🛡️", inferno: "🔱", slime: "☣️", storm: "⚡", cryo: "🧊", arcane: "🗝️", royal: "🔐", godmode: "🛡️" },
  { id: "sb.checksums", group: "selection", label: "SHA-256 Checksums", icon: "🧮", macos: "🧮", fluent: "🔬", studio: "📡", cyber: "📡", inferno: "🏮", slime: "🔬", storm: "🧭", cryo: "❄️", arcane: "🧿", royal: "💎", godmode: "🔭" },
  // Status Bar & Workspace View Switchers
  { id: "view.details", group: "view", label: "Details Table View", icon: "☰", macos: "☰", fluent: "📋", studio: "☰", cyber: "⊞", inferno: "🔥", slime: "🧪", storm: "⚡", cryo: "❄️", arcane: "📜", royal: "👑", godmode: "☰" },
  { id: "view.list", group: "view", label: "Compact List View", icon: "▤", macos: "▤", fluent: "📃", studio: "▤", cyber: "▤", inferno: "🏮", slime: "🧫", storm: "🍃", cryo: "🧊", arcane: "📖", royal: "⚜️", godmode: "▤" },
  { id: "view.icons", group: "view", label: "3D Icon Grid View", icon: "⊞", macos: "⊞", fluent: "🪟", studio: "🎛️", cyber: "💠", inferno: "🎆", slime: "🫧", storm: "🌈", cryo: "❄️", arcane: "🔮", royal: "💎", godmode: "🪐" },
  { id: "ws.browse", group: "workspace", label: "File Browser Workspace", icon: "📁", macos: "📁", fluent: "🗂️", studio: "🗄️", cyber: "💠", inferno: "🔥", slime: "🧪", storm: "🌪️", cryo: "🧊", arcane: "🏰", royal: "👑", godmode: "🪐" },
  { id: "ws.code", group: "workspace", label: "Code Editor Workspace", icon: "💻", macos: "🧑‍💻", fluent: "💻", studio: "⚡", cyber: "📟", inferno: "☄️", slime: "🧬", storm: "⚡", cryo: "❄️", arcane: "🔮", royal: "💎", godmode: "⚡" },
  { id: "ws.hex", group: "workspace", label: "Hex Inspector Workspace", icon: "🔬", macos: "🔬", fluent: "🧩", studio: "🎛️", cyber: "👾", inferno: "🔱", slime: "🔬", storm: "🧭", cryo: "🧊", arcane: "🔯", royal: "⚜️", godmode: "⚛️" },
  { id: "ws.media", group: "workspace", label: "Media Studio Workspace", icon: "🎬", macos: "🎬", fluent: "📽️", studio: "🎞️", cyber: "📡", inferno: "🎆", slime: "👁️", storm: "🌩️", cryo: "🏔️", arcane: "🪩", royal: "🎬", godmode: "🎬" },
  { id: "ws.db", group: "workspace", label: "SQLite Studio Workspace", icon: "🗄️", macos: "🗄️", fluent: "🛢️", studio: "🗄️", cyber: "🧊", inferno: "🌋", slime: "🛢️", storm: "🌊", cryo: "🏔️", arcane: "🏺", royal: "🏛️", godmode: "🛢️" },
];
const BUTTON_ICON_BY_ID = new Map(BUTTON_ICON_CATALOG.map((item) => [item.id, item]));

const ICONS = [
  ["🖼️", "png jpg jpeg gif webp bmp svg ico tif tiff heic heif avif jxl raw dng cr2 cr3 nef nrw arw srf sr2 orf rw2 raf pef eps ai psd psb xcf fig sketch xd afdesign afphoto afpub indd idml cdr procreate brushset swatches ase aco clr pur lottie", "image"],
  ["🎞️", "mp4 mov mkv avi webm wmv flv m4v mpg mpeg ts m2ts prores braw r3d ari crm mxf dpx exr cin cdng prproj aep aet mogrt drp dra fcpxml fcpbundle mlt kdenlive osp veg edl cube 3dl look", "video"],
  ["🎵", "mp3 wav flac aac ogg m4a wma opus aiff aif alac dsd dff dsf wv ape tak mqa mid midi als alp flp logicx ptx ptf rpp bwproject cpr npr aup3 aup sesx omf aaf vst vst3 sf2 sfz nki nkm nksf exs fxp fxb component lv2 clap vcv pd maxpat maxhelp amxd adg adv", "audio"],
  ["📕", "pdf epub mobi azw3 djvu cbz cbr cb7 cbt cba fb2 lit lrf", "pdf"],
  ["📄", "doc docx odt rtf pages wpd qmd typ asciidoc wiki canvas excalidraw drawio mermaid mmd puml plantuml dot gv dd2vtt uvtt fvtt dnd5e pch2 base canvas_ob loom excalidraw_md", "doc"],
  ["📊", "xls xlsx xlsm ods csv tsv numbers qfx ofx qif qbo iif gnucash beancount ledger hledger", "sheet"],
  ["📽️", "ppt pptx odp key", "slide"],
  ["🗜️", "zip rar 7z tar gz tgz bz2 xz zst lz4 br cab arj wad pk3 pak vpk bsp unitypackage unity prefab uasset umap upk tscn tres gdshader mcworld mcpack mcaddon mrpack schem nbt torrent magnet nzb metalink meta4 part crdownload aria2", "archive"],
  ["💻", "js mjs cjs ts tsx jsx py pyw pyi pyx pxd rb erb rake gemspec go rs rlib java kt kts scala groovy swift c h cpp hpp cc cxx hh hxx ino cu cuh hip cl ptx cubin fatbin cs csx fs fsx vb sln csproj php phtml html htm xhtml ejs hbs pug astro css scss sass less styl json jsonc json5 jsonl ndjson xml yaml yml toml kdl hcl sql lua luau dart arb vue svelte solid ps1 psm1 bat cmd sh bash zsh fish ksh csh awk sed v vsh vv zig zon nim ex exs erl hrl hs lhs ml mli clj cljs el lisp r rmd jl mat pl pm asm s m mm mts cts graphql gql proto thrift cmake gradle tf tfvars sol vy move cairo circom noir leo zkey r1cs wasm_zk wat wasm glsl vert frag comp wgsl hlsl fx metal ipynb fasta vcf cif dcm dicom nii gz_nii mha mhd nrrd xyz mol rxn cml inp out_qc chk fchk cube_qc kicad_pcb kicad_sch kicad_pro kicad_mod gbr ger drl brd dsn sv svh vhd vhdl bit xdc sdc qsf pcf geojson topojson kml kmz gpx fit tcx shp shx dbf osm mbtiles bbl bfl ulog tlog igc kml_fpv ccfm tmtheme icls colorscheme itermcolors terminal css-theme vsix-theme", "code"],
  ["📝", "txt md markdown mdx log diff patch err out ini cfg conf properties reg service env rst tex bib org adoc nfo srt vtt ass ssa sub idx sbv lrc ttml dfxp", "text"],
  ["⚙️", "exe msi app command jar apk aab ipa appimage scr com run vbs deb rpm pkg flatpak snap dll so dylib icns mobileconfig provisionprofile entitlements xcassets xcodeproj xcworkspace scpt applescript shortcut workflow lnk url inf cat sys drv dmp evtx vcxproj fsproj nupkg vsix appx msix rdp flatpakref desktop socket timer target mount rules ebuild pkgbuild uf2 hex bin_qmk via vil keymap", "exec"],
  ["💿", "dmg img iso vhd vhdx vmdk qcow2 ova ovf nes sfc smc gb gbc gba nds 3ds cia n64 z64 v64 gcm wbfs rvz nsp xci chd pbp cso gen sms gg pce a26", "disk"],
  ["🔤", "ttf otf woff woff2 eot pfb pfm", "font"],
];
const ICON_BY_EXT = new Map(ICONS.flatMap(([icon, exts]) => exts.split(" ").map((e) => [e, icon])));
const KIND_BY_EXT = new Map(ICONS.flatMap(([, exts, kind]) => exts.split(" ").map((e) => [e, kind])));
const EXACT_SYSTEM_ICON_BY_NAME = new Map(
  SYSTEM_ICON_CATALOG.filter((item) => item.category === "exact" && Array.isArray(item.match))
    .flatMap((item) => item.match.map((m) => [m.toLowerCase(), item])),
);
const EXT_SYSTEM_ICON_BY_EXT = new Map(
  SYSTEM_ICON_CATALOG.filter((item) => item.category === "extension" && typeof item.exts === "string")
    .flatMap((item) => item.exts.split(" ").map((e) => [e.toLowerCase(), item])),
);
const FOLDER_SYSTEM_ICON_BY_TOPIC = new Map(
  SYSTEM_ICON_CATALOG.filter((item) => item.category === "folder" && item.topic)
    .map((item) => [item.topic, item]),
);

const ALL_SEMANTIC_FOLDER_TOPICS = Object.fromEntries(
  SYSTEM_ICON_CATALOG.filter((item) => item.category === "folder" && item.topic && item.topic !== "general")
    .map((item) => [item.topic, item.icon]),
);
const ALL_GOOGLE_3D_FOLDER_TOPICS = Object.fromEntries(
  SYSTEM_ICON_CATALOG.filter((item) => item.category === "folder" && item.topic && item.topic !== "general")
    .map((item) => [item.topic, item.google3d || item.icon]),
);

export const ICON_PACK_GLYPHS = {
  default: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "🗜️", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📃",
  },
  macos_tahoe_3d: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "🖼️", archive: "📦", code: "🧑‍💻", text: "🗒️", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "macos", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "💠", "3d": "🧊", docs: "📚", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", ai_ml: "🧠", security: "🔐", docker: "🐳", kubernetes: "☸️", git: "🌿", config: "⚙️", tests: "🧪", scripts: "📜", fonts: "🔤", design: "🎨", games: "🎮", mobile: "📱", desktop: "🖥️", web: "🌐", api: "🔌", logs: "📋", temp: "⏳", trash: "🗑️", system: "🏛️", network: "📡", crypto: "⛓️", notebooks: "📓", workflows: "🔄", plugins: "🧩", themes: "🌈", shaders: "🔮", audio_stems: "🎚️", camera_raw: "📸", cad: "📐", finance: "💹", legal: "⚖️", science: "🧬", quantum: "⚛️", home: "🏠" },
  },
  win11_fluent_pro: {
    folder: "🗂️", image: "🖼️", video: "📽️", audio: "🎵", pdf: "📕", doc: "📃",
    sheet: "📈", slide: "📊", archive: "📦", code: "💻", text: "📝", exec: "⚡",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "fluent", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "📽️", videos: "📽️", music: "🎵", code: "💻", "3d": "🧊", docs: "🗂️", downloads: "⬇️", archive: "📦", cloud: "☁️", database: "🛢️", ai_ml: "🧠", security: "🛡️", docker: "🐳", kubernetes: "☸️", git: "🔀", config: "⚙️", tests: "🧪", scripts: "⚡", fonts: "🔤", design: "🎨", games: "🎮", mobile: "📱", desktop: "🖥️", web: "🌐", api: "🔌", logs: "📋", temp: "⏳", trash: "🗑️", system: "🏛️", network: "📡", crypto: "⛓️", notebooks: "📓", workflows: "🔄", plugins: "🧩", themes: "🌈", shaders: "🔮", audio_stems: "🎚️", camera_raw: "📸", cad: "📐", finance: "💹", legal: "⚖️", science: "🧬", quantum: "⚛️", home: "🏠" },
  },
  pro_studio_xdr: {
    folder: "🗂️", image: "📸", video: "🎞️", audio: "🎚️", pdf: "📕", doc: "📄",
    sheet: "📐", slide: "📽️", archive: "📦", code: "💻", text: "🗒️", exec: "🎛️",
    disk: "💽", font: "🔡", file: "📄", buttonPreset: "studio", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "📸", video: "🎞️", videos: "🎞️", music: "🎚️", code: "💻", "3d": "🧊", docs: "🗂️", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", ai_ml: "🧠", security: "🔐", docker: "🐳", kubernetes: "☸️", git: "🌿", config: "🎛️", tests: "🧪", scripts: "⚡", fonts: "🔡", design: "🎨", games: "🕹️", mobile: "📱", desktop: "🖥️", web: "🌐", api: "🛰️", logs: "📈", temp: "⏳", trash: "🗑️", system: "⚙️", network: "📡", crypto: "💎", notebooks: "📓", workflows: "🚀", plugins: "🧩", themes: "🌈", shaders: "🔮", audio_stems: "🎚️", camera_raw: "📸", cad: "📐", finance: "💹", legal: "⚖️", science: "🧬", quantum: "⚛️", home: "🏠" },
  },
  hdr_photo_studio: {
    folder: "📁", image: "🖼️", video: "🎥", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🎬",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "studio", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "📸", video: "🎥", videos: "🎥", music: "🎧", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", camera_raw: "📸", design: "🎨", shaders: "🔮" },
  },
  linux_papirus_pro: {
    folder: "📂", image: "🖼️", video: "🎞️", audio: "🎶", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💽", font: "🔤", file: "📃", buttonPreset: "fluent", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎶", code: "🐧", "3d": "🧊", docs: "📂", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", docker: "🐳", kubernetes: "☸️", git: "🌿", config: "⚙️", scripts: "🐚", system: "🐧" },
  },
  nordic_minimal: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📃", buttonPreset: "macos", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️" },
  },
  google_material_3d: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "🗒️", exec: "🚀",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "fluent", useGoogle3d: true,
    topics: {
      ...ALL_GOOGLE_3D_FOLDER_TOPICS,
      pictures: "🏞️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", "3d": "🧊",
      docs: "📘", downloads: "⬇️", archive: "📦", cloud: "☁️", database: "🛢️",
      ai_ml: "✨", security: "🛡️", docker: "🐳", kubernetes: "☸️", git: "🔀",
      config: "🎛️", tests: "🧪", scripts: "⚡", fonts: "🔡", design: "🎨",
      games: "🕹️", mobile: "📱", desktop: "🖥️", web: "🌐", api: "🛰️",
      logs: "📈", temp: "🫧", trash: "🗑️", system: "⚙️", network: "📡",
      crypto: "💎", notebooks: "📓", workflows: "🚀", plugins: "🧩", themes: "💎",
      shaders: "🔮", audio_stems: "🎚️", camera_raw: "📸", cad: "📐", finance: "📊",
      legal: "⚖️", science: "🧬", quantum: "⚛️", home: "🏠",
    },
  },
  inferno: {
    folder: "📁", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📈", slide: "📽️", archive: "📦", code: "⚡", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "inferno", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, code: "🔥", docs: "📁", pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", downloads: "📥", archive: "📦" },
  },
  slime: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "slime", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, biohazard_vat: "🧪", science: "🧬", tests: "🧪", docs: "📁", pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", downloads: "📥", archive: "📦" },
  },
  storm_tempest: {
    folder: "🗂️", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "storm", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, storm_vortex: "🌪️", docs: "🗂️", pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", downloads: "📥", archive: "📦" },
  },
  neon_cyber: {
    folder: "🗂️", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "cyber", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", downloads: "📥", archive: "📦" },
  },
  liquid_gems: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "royal", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "🏞️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", downloads: "📥", archive: "📦" },
  },
  cryo_crystal: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📃",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "cryo", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", downloads: "📥", archive: "📦" },
  },
  retro_pixel: {
    folder: "📂", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💾", font: "🔤", file: "📃", buttonPreset: "cyber", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📂", pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", games: "🕹️", roms: "👾", downloads: "📥", archive: "📦" },
  },
  xenotech_2126: {
    folder: "🗂️", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "godmode", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", downloads: "📥", archive: "📦" },
  },
  psychedelic_trip: {
    folder: "📁", image: "🖼️", video: "🎬", audio: "🎶", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "arcane", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🌈", video: "🎬", videos: "🎬", music: "🎶", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️" },
  },
  lava_groovy: {
    folder: "📁", image: "🖼️", video: "🎬", audio: "🎸", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "inferno", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎸", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️" },
  },
  op_art_illusion: {
    folder: "🗂️", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚡",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "cyber", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🌀", videos: "🌀", music: "🎵", code: "💻", "3d": "🧊", docs: "🗂️", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️" },
  },
  us_holidays_festive: {
    folder: "📁", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "royal", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🎮" },
  },
  nerd_rpg_arcane: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "arcane", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🎮" },
  },
  nerd_scifi_fleet: {
    folder: "🗂️", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "cyber", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", "3d": "🧊", docs: "🗂️", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🎮" },
  },
  nerd_hacker_retro: {
    folder: "📂", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💾", font: "🔤", file: "📃", buttonPreset: "cyber", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", docs: "📂", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🕹️", security: "🔐" },
  },
  horror_crypt: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📃", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📃", buttonPreset: "arcane", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", security: "🔐" },
  },
  realworld_objects: {
    folder: "📁", image: "🖼️", video: "📽️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "royal", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "📽️", videos: "📽️", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🎮" },
  },
  cupertino_hig_studio: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "📽️", archive: "📦", code: "🧑‍💻", text: "📝", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "macos", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🏞️", video: "🎬", videos: "🎬", music: "🎧", code: "🧑‍💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", ai_ml: "🧠", security: "🔐", design: "🎨", mobile: "📱", desktop: "🖥️", home: "🏠" },
  },
  swiss_horology_gold: {
    folder: "🗂️", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "royal", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", docs: "🗂️", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", finance: "💹", legal: "⚖️", security: "🔐" },
  },
  teenage_field_synth: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎚️", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🎛️",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "studio", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎚️", audio_stems: "🎚️", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", config: "🎛️" },
  },
  blueprint_cad_pro: {
    folder: "🗂️", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📐", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "studio", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", cad: "📐", docs: "🗂️", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", science: "🧬" },
  },
  kyoto_zen_ink: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📃", buttonPreset: "macos", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", home: "🏠" },
  },
  carbon_aerospace: {
    folder: "🗂️", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "studio", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", "3d": "🧊", cad: "📐", docs: "🗂️", downloads: "📥", archive: "📦", cloud: "🛰️", database: "🗄️", logs: "📈" },
  },
  godmode_celestial: {
    folder: "📁", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "⚡", text: "📝", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "godmode", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, singularity_core: "🪐", pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", "3d": "🧊", ai_ml: "🧠", quantum: "⚛️", shaders: "🔮", science: "🧬", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", home: "🏛️" },
  },
  godmode_photonic: {
    folder: "🗂️", image: "🏞️", video: "🎞️", audio: "🎚️", pdf: "📕", doc: "📄",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚡",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "godmode", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🏞️", video: "🎞️", videos: "🎞️", music: "🎧", code: "💻", "3d": "🧊", ai_ml: "🧠", quantum: "⚛️", shaders: "🔮", science: "🔬", docs: "🗂️", downloads: "📥", archive: "📦", cloud: "🛰️", database: "🗄️", themes: "🌈" },
  },
  godmode_quantum: {
    folder: "🗂️", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "godmode", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎵", code: "💻", "3d": "🧊", ai_ml: "🧠", quantum: "⚛️", shaders: "🔮", science: "🧬", cad: "📐", docs: "🗂️", downloads: "📥", archive: "📦", cloud: "🛰️", database: "🛢️" },
  },
  godmode_chrono: {
    folder: "🗂️", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "godmode", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, security: "⏳", pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", ai_ml: "🧠", quantum: "⏳", shaders: "🔮", science: "🧬", docs: "📂", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", logs: "📈" },
  },
  // ── 10 New Flagship & God-Mode Custom Icon Packs ──────────────────────────
  godmode_omni_pantheon: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "godmode", useExact: true, useGoogle3d: true,
    topics: { ...ALL_GOOGLE_3D_FOLDER_TOPICS, pictures: "🏞️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", "3d": "🧊", ai_ml: "🧠", quantum: "⚛️", shaders: "🔮", science: "🧬", cad: "📐", docs: "📁", downloads: "⬇️", archive: "📦", cloud: "🛰️", database: "🛢️", security: "🛡️", home: "🏛️" },
  },
  macos_sequoia_hig: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "🖼️", archive: "📦", code: "🧑‍💻", text: "🗒️", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "macos", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "🧑‍💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", apple: "🍎", applications: "🚀", home: "🏠" },
  },
  apple_vision_glass_3d: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "🗒️", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "macos", useExact: true,
    topics: { ...ALL_GOOGLE_3D_FOLDER_TOPICS, pictures: "🏞️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", "3d": "🥽", vr_spatial: "🥽", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", home: "🏠" },
  },
  dev_polyglot_pro: {
    folder: "🗂️", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "📽️", archive: "📦", code: "🧑‍💻", text: "📝", exec: "🚀",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "studio", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", code: "🧑‍💻", rust: "🦀", bun: "🥟", python: "🐍", golang: "🐹", docker: "🐳", kubernetes: "☸️", git: "🔀", ai_ml: "🧠", prompts: "✨", database: "🛢️", terraform: "🏗️", tests: "🧪" },
  },
  creative_cinema_8k: {
    folder: "🗂️", image: "📸", video: "🎥", audio: "🎚️", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🎛️",
    disk: "💽", font: "🔡", file: "📄", buttonPreset: "studio", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "📸", camera_raw: "📸", video: "🎥", videos: "🎥", cinema_raw: "🎥", vfx: "🎞️", music: "🎚️", audio_stems: "🎚️", samples: "🎹", "3d": "🧊", design: "🎨", shaders: "🔮" },
  },
  cyberdeck_matrix_hud: {
    folder: "📂", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💾", font: "🔤", file: "📄", buttonPreset: "cyber", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📂", code: "💻", security: "🛡️", pentest: "🕵️", network: "📡", ai_ml: "🧠", crypto: "⛓️", docker: "🐳", kubernetes: "☸️", database: "🗄️", home: "🏠" },
  },
  royal_24k_gold_obsidian: {
    folder: "🗂️", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "royal", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", finance: "💹", legal: "⚖️", crypto: "💎", security: "🔐", pictures: "🖼️", home: "🏛️" },
  },
  anime_mecha_neon: {
    folder: "📁", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "cyber", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", anime: "⛩️", comics: "🗯️", games: "🎮", roms: "🕹️", robotics: "🤖", pictures: "🖼️", video: "🎬", music: "🎧", code: "💻" },
  },
  steampunk_brass_clockwork: {
    folder: "🗂️", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📐", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "arcane", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", cad: "📐", electronics: "🔌", science: "🔬", archive: "📦", config: "⚙️", backups: "🕰️", home: "🏠" },
  },
  bioluminescent_eden: {
    folder: "📁", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "slime", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", science: "🧬", medical: "🩺", recipes: "🍳", travel: "🗺️", pictures: "🖼️", music: "🎵", git: "🌿", home: "🏡" },
  },
  // ── 8 Ultra-Detailed Collectors & Studio Custom Icon Packs ────────────────
  holo_prismatic_foil: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "godmode", useExact: true, useGoogle3d: true,
    topics: { ...ALL_GOOGLE_3D_FOLDER_TOPICS, docs: "📁", pictures: "🏞️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", "3d": "🧊", themes: "🌈", shaders: "🔮", ai_ml: "✨", home: "🏛️" },
  },
  stained_glass_cathedral_pro: {
    folder: "🗂️", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "arcane", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "🖼️", video: "🎞️", music: "🎵", legal: "⚖️", archive: "📦", home: "🏠" },
  },
  synthwave_outrun_1984: {
    folder: "📂", image: "🖼️", video: "🎞️", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "🚀",
    disk: "💾", font: "🔤", file: "📄", buttonPreset: "cyber", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📂", pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎧", games: "🕹️", roms: "👾", retro_arcade: "👾", code: "💻", home: "🏠" },
  },
  nasa_apollo_telemetry: {
    folder: "🗂️", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📐", slide: "📽️", archive: "📦", code: "💻", text: "🗒️", exec: "🚀",
    disk: "💽", font: "🔡", file: "📄", buttonPreset: "studio", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", astronomy: "🔭", astronomy_space: "🛰️", quantum: "⚛️", cad: "📐", electronics: "🔌", robotics: "🤖", fpv_drones: "🚁", logs: "📈", home: "🏠" },
  },
  obsidian_blood_ruby: {
    folder: "📁", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "inferno", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", security: "🛡️", cybersecurity_vault: "🛡️", pentest: "🕵️", obsidian_pkms: "💎", games: "🎮", home: "🏠" },
  },
  aurora_nordic_ice: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "🗒️", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "cryo", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "🏞️", video: "🎬", music: "🎧", cloud: "☁️", home: "🏡" },
  },
  vaporwave_marble_plaza: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄", buttonPreset: "royal", useExact: true,
    topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "🖼️", video: "🎞️", music: "🎧", design: "🎨", themes: "🌈", home: "🏛️" },
  },
  quantum_superconductor: {
    folder: "🗂️", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📈", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚡",
    disk: "💽", font: "🔤", file: "📄", buttonPreset: "godmode", useExact: true, useGoogle3d: true,
    topics: { ...ALL_GOOGLE_3D_FOLDER_TOPICS, docs: "🗂️", quantum: "⚛️", quantum_sim: "🌌", shaders_compute: "⚡", ai_ml: "🧠", biotech_crispr: "🧬", science: "🔬", home: "🏛️" },
  },
};
ICON_PACK_GLYPHS.inferno_burn = ICON_PACK_GLYPHS.inferno;
ICON_PACK_GLYPHS.bio_slime = ICON_PACK_GLYPHS.slime;
ICON_PACK_GLYPHS.storm_weather = ICON_PACK_GLYPHS.storm_tempest;
ICON_PACK_GLYPHS.liquid_chrome = ICON_PACK_GLYPHS.liquid_gems;
ICON_PACK_GLYPHS.arcane_glyphs = ICON_PACK_GLYPHS.xenotech_2126;
ICON_PACK_GLYPHS.classic_os_win95 = {
  folder: "📁", image: "🖼️", video: "📼", audio: "🔊", pdf: "📕", doc: "📄",
  sheet: "📊", slide: "📽️", archive: "🗜️", code: "📟", text: "📝", exec: "💾",
  disk: "💽", font: "🔤", file: "📃", buttonPreset: "studio", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "🖼️", music: "🔊", video: "📼", downloads: "💾", home: "🖥️" },
};
ICON_PACK_GLYPHS.handheld_gameboy = {
  folder: "📂", image: "👾", video: "📺", audio: "🎵", pdf: "📕", doc: "📜",
  sheet: "🔢", slide: "🃏", archive: "📦", code: "🕹️", text: "💬", exec: "▶️",
  disk: "💾", font: "🔠", file: "🟩", buttonPreset: "cyber", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, games: "🎮", roms: "👾", music: "🎵", downloads: "📥" },
};
ICON_PACK_GLYPHS.art_deco_gold = {
  folder: "🗂️", image: "🖼️", video: "🎞️", audio: "🎺", pdf: "📕", doc: "📜",
  sheet: "📈", slide: "🎭", archive: "📦", code: "💠", text: "🖋️", exec: "⚜️",
  disk: "💿", font: "🔱", file: "📄", buttonPreset: "royal", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "🖼️", music: "🎺", home: "🏙️" },
};
ICON_PACK_GLYPHS.bauhaus_primary = {
  folder: "📁", image: "🔵", video: "🔺", audio: "🟡", pdf: "📕", doc: "⬜",
  sheet: "🟦", slide: "🔶", archive: "📦", code: "◼️", text: "▫️", exec: "▶️",
  disk: "⚫", font: "🅰️", file: "⬜", buttonPreset: "studio", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "🔵", music: "🟡", video: "🔺" },
};
ICON_PACK_GLYPHS.memphis_80s_pop = {
  folder: "🗂️", image: "🌈", video: "📹", audio: "🎧", pdf: "📕", doc: "📃",
  sheet: "📊", slide: "🎪", archive: "📦", code: "💻", text: "✏️", exec: "⚡",
  disk: "💿", font: "🔤", file: "📄", buttonPreset: "cyber", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "🌈", music: "🎧", games: "🎪" },
};
ICON_PACK_GLYPHS.neo_brutalist_flat = {
  folder: "📁", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📄",
  sheet: "📊", slide: "📽️", archive: "📦", code: "⌨️", text: "📝", exec: "⚙️",
  disk: "💽", font: "🔤", file: "📄", buttonPreset: "studio", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "🖼️", music: "🎵" },
};
ICON_PACK_GLYPHS.ukiyoe_woodblock = {
  folder: "📂", image: "🗻", video: "🎎", audio: "🎐", pdf: "📕", doc: "📜",
  sheet: "🈷️", slide: "🎴", archive: "📦", code: "⛩️", text: "🖌️", exec: "🗡️",
  disk: "💿", font: "🈁", file: "📃", buttonPreset: "macos", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📂", pictures: "🗻", music: "🎐", home: "🏯" },
};
ICON_PACK_GLYPHS.pop_art_comic = {
  folder: "📁", image: "📸", video: "🎬", audio: "🔊", pdf: "📕", doc: "💬",
  sheet: "📊", slide: "🗯️", archive: "📦", code: "⚡", text: "💭", exec: "💣",
  disk: "💿", font: "🔤", file: "📄", buttonPreset: "cyber", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "📸", music: "🔊", games: "🦸" },
};
ICON_PACK_GLYPHS.sketch_chalkboard = {
  folder: "📂", image: "🖍️", video: "🎞️", audio: "🎶", pdf: "📕", doc: "📝",
  sheet: "🧮", slide: "🪧", archive: "📦", code: "✍️", text: "✏️", exec: "🪄",
  disk: "💿", font: "🔡", file: "📄", buttonPreset: "studio", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📂", pictures: "🖍️", music: "🎶" },
};
ICON_PACK_GLYPHS.clay_soft_3d = {
  folder: "🗂️", image: "🌼", video: "🍿", audio: "🎈", pdf: "📕", doc: "🧁",
  sheet: "🍬", slide: "🎠", archive: "📦", code: "🧩", text: "🍪", exec: "🚀",
  disk: "🍩", font: "🔤", file: "🍞", buttonPreset: "macos", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "🌼", music: "🎈", games: "🧩" },
};
ICON_PACK_GLYPHS.origami_papercraft = {
  folder: "🗂️", image: "🦋", video: "🎏", audio: "🎐", pdf: "📕", doc: "📃",
  sheet: "🗒️", slide: "🪁", archive: "📦", code: "🧩", text: "✂️", exec: "🦢",
  disk: "💿", font: "🔤", file: "📄", buttonPreset: "macos", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "🦋", music: "🎐" },
};
ICON_PACK_GLYPHS.lowpoly_isometric = {
  folder: "📂", image: "🏔️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
  sheet: "📊", slide: "🔶", archive: "📦", code: "🔷", text: "📝", exec: "🔺",
  disk: "💽", font: "🔤", file: "◽", buttonPreset: "fluent", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📂", pictures: "🏔️", music: "🎵" },
};
ICON_PACK_GLYPHS.thin_line_duotone = {
  folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📄", doc: "📄",
  sheet: "📊", slide: "📽️", archive: "🗜️", code: "⌨️", text: "📝", exec: "⚙️",
  disk: "💽", font: "🔤", file: "📄", buttonPreset: "fluent", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "🖼️" },
};
ICON_PACK_GLYPHS.mono_high_contrast = {
  folder: "📁", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📄",
  sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
  disk: "💿", font: "🔤", file: "📄", buttonPreset: "studio", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📁", pictures: "🖼️" },
};
ICON_PACK_GLYPHS.terminal_ascii_tui = {
  folder: "📂", image: "🖼️", video: "📼", audio: "🔈", pdf: "📕", doc: "📄",
  sheet: "🧮", slide: "📽️", archive: "🗜️", code: "⌨️", text: "📝", exec: "▶️",
  disk: "💾", font: "🔤", file: "📃", buttonPreset: "cyber", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📂", downloads: "📥" },
};
ICON_PACK_GLYPHS.deep_sea_biolum = {
  folder: "🗂️", image: "🐠", video: "🐋", audio: "🐚", pdf: "📕", doc: "🐡",
  sheet: "🪸", slide: "🦈", archive: "📦", code: "🦐", text: "🦀", exec: "⚓",
  disk: "🫧", font: "🐟", file: "🐚", buttonPreset: "cryo", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "🐠", music: "🐚", home: "🌊" },
};
ICON_PACK_GLYPHS.desert_sandstone = {
  folder: "📂", image: "🌵", video: "🐪", audio: "🪘", pdf: "📕", doc: "📜",
  sheet: "🧱", slide: "🌄", archive: "📦", code: "🔥", text: "🪶", exec: "☀️",
  disk: "💿", font: "🔤", file: "📃", buttonPreset: "inferno", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "📂", pictures: "🌵", music: "🪘", home: "🛖" },
};
ICON_PACK_GLYPHS.cottagecore_botanical = {
  folder: "🗂️", image: "🌸", video: "🎞️", audio: "🐦", pdf: "📕", doc: "🍃",
  sheet: "🌻", slide: "🌷", archive: "📦", code: "🍄", text: "🪶", exec: "🌱",
  disk: "🫙", font: "🔤", file: "🍂", buttonPreset: "macos", useExact: true,
  topics: { ...ALL_SEMANTIC_FOLDER_TOPICS, docs: "🗂️", pictures: "🌸", music: "🐦", home: "🏡" },
};

/** Bespoke Holiday Crest Badges & Festive Celebrations for all 18 US Holiday Themes (`holiday_*`). */
export const HOLIDAY_THEME_CRESTS = {
  holiday_new_years_times_square: { crest: "🥂", badge: "🎆", label: "New Year's Eve Ball Drop", month: 1, day: 1, anim: "raytraced_caustic_refraction", particles: ["🥂", "🎆", "✨", "🎊", "🍾"] },
  holiday_mlk_dream_memorial: { crest: "🕊️", badge: "🕯️", label: "MLK Jr. Day Memorial", month: 1, day: 19, anim: "orbital_halo_spin", particles: ["🕊️", "🕯️", "✨", "🌟"] },
  holiday_valentines_velvet_rose: { crest: "💝", badge: "🌹", label: "Valentine's Velvet Rose", month: 2, day: 14, anim: "heartbeat_biolum", particles: ["💝", "🌹", "💖", "✨", "💘"] },
  holiday_presidents_mount_rushmore: { crest: "🦅", badge: "🏛️", label: "Presidents' Day Heritage", month: 2, day: 16, anim: "c4d_mograph_cloner_wave", particles: ["🦅", "⭐", "🏛️", "✨"] },
  holiday_st_patricks_emerald_clover: { crest: "☘️", badge: "🍀", label: "St. Patrick's Emerald Clover", month: 3, day: 17, anim: "holo_foil_shimmer", particles: ["☘️", "🍀", "🪙", "🌈", "✨"] },
  holiday_easter_pastel_egg_hunt: { crest: "🥚", badge: "🐣", label: "Easter Pastel Egg Hunt", month: 4, day: 5, anim: "spring_pop_3d", particles: ["🥚", "🐣", "🌷", "🐰", "✨"] },
  holiday_mothers_day_botanical_tea: { crest: "🌸", badge: "🫖", label: "Mother's Day Botanical Tea", month: 5, day: 10, anim: "blender_geometry_nodes_bloom", particles: ["🌸", "🌺", "🫖", "💐", "✨"] },
  holiday_memorial_day_poppy_honor: { crest: "🌺", badge: "🎖️", label: "Memorial Day Poppy Honor", month: 5, day: 25, anim: "orbital_halo_spin", particles: ["🌺", "⭐", "🕯️", "🎖️"] },
  holiday_juneteenth_jubilee_star: { crest: "🌟", badge: "🎆", label: "Juneteenth Jubilee Star", month: 6, day: 19, anim: "houdini_vex_particle_burst", particles: ["🌟", "🎆", "✨", "🎊"] },
  holiday_fathers_day_leather_den: { crest: "⌚", badge: "🧭", label: "Father's Day Horology Den", month: 6, day: 21, anim: "clockwork_gear_tick", particles: ["⌚", "🧭", "🥃", "⚙️"] },
  holiday_fourth_of_july_fireworks: { crest: "🎆", badge: "🗽", label: "4th of July Grand Fireworks", month: 7, day: 4, anim: "houdini_vex_particle_burst", particles: ["🎆", "🎇", "🗽", "⭐", "🦅"] },
  holiday_labor_day_rivet_forge: { crest: "⚒️", badge: "⚙️", label: "Labor Day Rivet Forge", month: 9, day: 7, anim: "fire_ember_flicker", particles: ["⚒️", "⚙️", "🔥", "✨"] },
  holiday_halloween_jack_o_lantern: { crest: "🎃", badge: "🦇", label: "Halloween Jack-O'-Lantern", month: 10, day: 31, anim: "jelly_squish_3d", particles: ["🎃", "🦇", "👻", "🕯️", "🕸️"] },
  holiday_dia_de_los_muertos_marigold: { crest: "🌼", badge: "💀", label: "Día de los Muertos Marigold", month: 11, day: 2, anim: "blender_geometry_nodes_bloom", particles: ["🌼", "💀", "🕯️", "🦋", "🌺"] },
  holiday_veterans_day_valor_medallion: { crest: "🎖️", badge: "🦅", label: "Veterans Day Valor Medallion", month: 11, day: 11, anim: "c4d_mograph_cloner_wave", particles: ["🎖️", "🦅", "⭐", "✨"] },
  holiday_thanksgiving_harvest_hearth: { crest: "🦃", badge: "🍁", label: "Thanksgiving Harvest Hearth", month: 11, day: 26, anim: "fire_ember_flicker", particles: ["🦃", "🍁", "🥧", "🍂", "🌽"] },
  holiday_hanukkah_menorah_sapphire: { crest: "🕎", badge: "✡️", label: "Hanukkah Menorah Sapphire", month: 12, day: 14, anim: "raytraced_caustic_refraction", particles: ["🕎", "🕯️", "🪙", "✨", "💙"] },
  holiday_christmas_nutcracker_hearth: { crest: "🎄", badge: "🎅", label: "Christmas Nutcracker Hearth", month: 12, day: 25, anim: "godmode_pantheon_ascend", particles: ["🎄", "🎅", "❄️", "🎁", "🔔"] },
};

/** Returns the Holiday Crest definition when a `holiday_*` theme is active. */
export function resolveHolidayCrestForPalette(paletteKey) {
  const key = String(paletteKey || (typeof document !== "undefined" ? document.documentElement?.dataset?.palette : "") || "").trim();
  return HOLIDAY_THEME_CRESTS[key] || null;
}

const FOLDER_TOPIC_CACHE = new Map();
const ICON_KIND_CACHE = new Map();

/** Classifies a folder's semantic purpose across 110+ high-class workstation topics for 3D folder badges and system icon templates. */
export function classifyFolderTopic(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "general";
  const cached = FOLDER_TOPIC_CACHE.get(n);
  if (cached !== undefined) return cached;
  let topic = "general";
  if (/(?:^|[\s_.-])(mutants?|biohazard_?vat|ooze_?lab)(?:$|[\s_.-])/.test(n)) topic = "biohazard_vat";
  else if (/(?:^|[\s_.-])(tornado_?alley|storm_?vortex|cyclone_?eye)(?:$|[\s_.-])/.test(n)) topic = "storm_vortex";
  else if (/(?:^|[\s_.-])(singularity|event_?horizon|omega_?core)(?:$|[\s_.-])/.test(n)) topic = "singularity_core";
  else if (/(?:^|[\s_.-])(3dprint|3d_printing|stl_files|gcode|cura|bambu|prusa|slicer)(?:$|[\s_.-])/.test(n)) topic = "3dprint";
  else if (/(?:^|[\s_.-])(blender_3d_studio|geometry_?nodes|houdini_?fx)(?:$|[\s_.-])|^blender_3d$/.test(n)) topic = "blender_3d";
  else if (/(?:^|[\s_.-])(3d|blender|maya|zbrush|cinema4d|houdini|meshes|rigging|usd|usdz|gltf)(?:$|[\s_.-])/.test(n)) topic = "3d";
  else if (/(?:^|[\s_.-])(pcb|kicad|eagle|fpga|verilog|vhdl|electronics|circuits?)(?:$|[\s_.-])/.test(n)) topic = "electronics";
  else if (/(?:^|[\s_.-])(fpv_?drones?|betaflight|cinewhoop|mavlink)(?:$|[\s_.-])/.test(n)) topic = "fpv_drones";
  else if (/(?:^|[\s_.-])(robotics?|ros|arduino|esp32|raspberry_?pi|microcontrollers?|drones?|iot)(?:$|[\s_.-])/.test(n)) topic = "robotics";
  else if (/(?:^|[\s_.-])(vr|xr|ar|visionos|openxr|spatial|hololens|quest)(?:$|[\s_.-])/.test(n)) topic = "vr_spatial";
  else if (/(?:^|[\s_.-])(architecture_?bim|revit|archicad|floorplans?)(?:$|[\s_.-])/.test(n)) topic = "architecture_bim";
  else if (/(?:^|[\s_.-])(cad|blueprints?|gerber|schematics?|autocad|solidworks|freecad)(?:$|[\s_.-])/.test(n)) topic = "cad";
  else if (/(?:^|[\s_.-])(photography_?leica|film_?scans?|contact_?sheets?|medium_?format)(?:$|[\s_.-])/.test(n)) topic = "photography_leica";
  else if (/(?:^|[\s_.-])(raw|dng|negatives?|cr2|cr3|nef|arw|lightroom|captureone)(?:$|[\s_.-])/.test(n)) topic = "camera_raw";
  else if (/(?:^|[\s_.-])(screenshots?|screen_captures?|screenrecordings?|snaps?)(?:$|[\s_.-])/.test(n)) topic = "screenshots";
  else if (/(?:^|[\s_.-])(wallpapers?|backdrops?|desktop_pictures?)(?:$|[\s_.-])/.test(n)) topic = "wallpapers";
  else if (/(?:^|[\s_.-])(memes?|gifs?|stickers?|reactions?|emotes?)(?:$|[\s_.-])/.test(n)) topic = "memes";
  else if (/(?:^|[\s_.-])(pictures?|photos?|images?|img|camera|renders?|gallery|art|icons?|avatars?|thumbnails?)(?:$|[\s_.-])/.test(n)) topic = "pictures";
  else if (/(?:^|[\s_.-])(cinema_?dolby|dolby_?vision|dolby_?atmos)(?:$|[\s_.-])/.test(n)) topic = "cinema_dolby";
  else if (/(?:^|[\s_.-])(prores|braw|r3d|dailies|cinema_raw)(?:$|[\s_.-])/.test(n)) topic = "cinema_raw";
  else if (/(?:^|[\s_.-])(vfx|after_?effects|nuke|fusion|luts?|color_?grading|proxies)(?:$|[\s_.-])/.test(n)) topic = "vfx";
  else if (/(?:^|[\s_.-])(anime|manga|ova|light_?novels?|crunchyroll)(?:$|[\s_.-])/.test(n)) topic = "anime";
  else if (/(?:^|[\s_.-])(tv_?shows?|series|seasons?|sitcoms?|documentaries)(?:$|[\s_.-])/.test(n)) topic = "tv_shows";
  else if (/(?:^|[\s_.-])(videos?|movies?|films?|clips?|footage|cinema|recordings?|captures?|premiere|davinci|finalcut)(?:$|[\s_.-])/.test(n)) topic = "video";
  else if (/(?:^|[\s_.-])(synth_?modular|eurorack|vcv_?rack)(?:$|[\s_.-])/.test(n)) topic = "synth_modular";
  else if (/(?:^|[\s_.-])(vinyl_?hi_?res|audiophile|vinyl_?rips?|dsd_?masters?)(?:$|[\s_.-])/.test(n)) topic = "vinyl_hi_res";
  else if (/(?:^|[\s_.-])(midi|soundfonts?|drum_?kits?|oneshots?|sample_?packs?|kontakt|serum)(?:$|[\s_.-])/.test(n)) topic = "samples";
  else if (/(?:^|[\s_.-])(stems?|daw|ableton|logic|protools|flstudio|vst|synths?|samples?|loops?)(?:$|[\s_.-])/.test(n)) topic = "audio_stems";
  else if (/(?:^|[\s_.-])(podcasts_?studio|multitrack_?broadcast)(?:$|[\s_.-])/.test(n)) topic = "podcasts_studio";
  else if (/(?:^|[\s_.-])(podcasts?|broadcasts?|interviews?|voice_?memos?|radio)(?:$|[\s_.-])/.test(n)) topic = "podcasts";
  else if (/(?:^|[\s_.-])(audiobooks?|audible|spoken_?word|narrations?)(?:$|[\s_.-])/.test(n)) topic = "audiobooks";
  else if (/(?:^|[\s_.-])(music|audio|sounds?|tracks?|sfx|playlists?)(?:$|[\s_.-])/.test(n)) topic = "music";
  else if (/(?:^|[\s_.-])(prompts?|rag|agents?|skills?|cursorrules|claude|chatgpt|ollama)(?:$|[\s_.-])/.test(n)) topic = "prompts";
  else if (/(?:^|[\s_.-])(datasets?|corpora|training_?data|datalake|parquet|kaggle|huggingface)(?:$|[\s_.-])/.test(n)) topic = "datasets";
  else if (/(?:^|[\s_.-])(ai|ml|models?|llm|weights|checkpoints?|neural|gemini|deepmind|vertex|tensors?|lora|embeddings?)(?:$|[\s_.-])/.test(n)) topic = "ai_ml";
  else if (/(?:^|[\s_.-])(quantum_?sim|tensor_?networks?|qubit_?lattices?)(?:$|[\s_.-])/.test(n)) topic = "quantum_sim";
  else if (/(?:^|[\s_.-])(quantum|qubits?|willow|cirq|qiskit)(?:$|[\s_.-])/.test(n)) topic = "quantum";
  else if (/(?:^|[\s_.-])(astronomy_?space|orbital_?mechanics|deep_?space)(?:$|[\s_.-])/.test(n)) topic = "astronomy_space";
  else if (/(?:^|[\s_.-])(astronomy|astrophotography|jwst|telescope|fits|starmaps?|orbital)(?:$|[\s_.-])/.test(n)) topic = "astronomy";
  else if (/(?:^|[\s_.-])(medical|health|fitness|workouts?|dicom|clinical|wellness)(?:$|[\s_.-])/.test(n)) topic = "medical";
  else if (/(?:^|[\s_.-])(biotech_?crispr|crispr|foldseek)(?:$|[\s_.-])/.test(n)) topic = "biotech_crispr";
  else if (/(?:^|[\s_.-])(science|genomics?|bio|protein|alphafold|chemistry|physics|lab|research)(?:$|[\s_.-])/.test(n)) topic = "science";
  else if (/(?:^|[\s_.-])(notebooks?|jupyter|colab|ipynb|quarto|marimo)(?:$|[\s_.-])/.test(n)) topic = "notebooks";
  else if (/(?:^|[\s_.-])(shaders_?compute|cuda_?kernels?|rocm_?kernels?)(?:$|[\s_.-])/.test(n)) topic = "shaders_compute";
  else if (/(?:^|[\s_.-])(shaders_?fx|post_?fx)(?:$|[\s_.-])/.test(n)) topic = "shaders_fx";
  else if (/(?:^|[\s_.-])(shaders?|glsl|wgsl|hlsl|vulkan|metal|raytracing)(?:$|[\s_.-])/.test(n)) topic = "shaders";
  else if (/(?:^|[\s_.-])(docker|containers?|compose|podman)(?:$|[\s_.-])/.test(n)) topic = "docker";
  else if (/(?:^|[\s_.-])(k8s|kubernetes|helm|clusters?|manifests?)(?:$|[\s_.-])/.test(n)) topic = "kubernetes";
  else if (/(?:^|[\s_.-])(terraform|pulumi|ansible|playbooks?|cloudformation|bicep|iac)(?:$|[\s_.-])/.test(n)) topic = "terraform";
  else if (/(?:^|[\s_.-])(\.git|\.github|git|repos?|branches|patches)(?:$|[\s_.-])/.test(n)) topic = "git";
  else if (/(?:^|[\s_.-])(workflows?|ci|cd|pipelines?|actions|jenkins|cloudbuild)(?:$|[\s_.-])/.test(n)) topic = "workflows";
  else if (/(?:^|[\s_.-])(tests?|__tests__|spec|specs|e2e|benchmarks?|coverage|cypress|playwright)(?:$|[\s_.-])/.test(n)) topic = "tests";
  else if (/(?:^|[\s_.-])(mechanical_?keebs?|keycaps?|qmk_?firmware|zmk_?config)(?:$|[\s_.-])/.test(n)) topic = "mechanical_keebs";
  else if (/(?:^|[\s_.-])(dotfiles?|nvim|neovim|wezterm|alacritty|kitty|tmux|hyprland|rice)(?:$|[\s_.-])/.test(n)) topic = "dotfiles";
  else if (/(?:^|[\s_.-])(scripts?|bin|tools|automation|cron|hooks)(?:$|[\s_.-])/.test(n)) topic = "scripts";
  else if (/(?:^|[\s_.-])(rust|cargo|crates)(?:$|[\s_.-])/.test(n)) topic = "rust";
  else if (/(?:^|[\s_.-])(bun|deno)(?:$|[\s_.-])/.test(n)) topic = "bun";
  else if (/(?:^|[\s_.-])(python|venv|\.venv|virtualenv|conda|poetry|__pycache__)(?:$|[\s_.-])/.test(n)) topic = "python";
  else if (/(?:^|[\s_.-])(golang|gopath)(?:$|[\s_.-])/.test(n)) topic = "golang";
  else if (/(?:^|[\s_.-])(xcode|swift|swiftui|cocoapods|macos)(?:$|[\s_.-])/.test(n)) topic = "apple";
  else if (/(?:^|[\s_.-])(api|graphql|grpc|proto|routes|endpoints|controllers|handlers|webhooks)(?:$|[\s_.-])/.test(n)) topic = "api";
  else if (/(?:^|[\s_.-])(web|public|static|www|pages|views|frontend|client|ui)(?:$|[\s_.-])/.test(n)) topic = "web";
  else if (/(?:^|[\s_.-])(mobile|android|ios|flutter|react-native|apk|ipa)(?:$|[\s_.-])/.test(n)) topic = "mobile";
  else if (/(?:^|[\s_.-])(applications?|apps?|programs?|software)(?:$|[\s_.-])/.test(n)) topic = "applications";
  else if (/(?:^|[\s_.-])(retro_?arcade|crt_?arcade|coin_?op)(?:$|[\s_.-])/.test(n)) topic = "retro_arcade";
  else if (/(?:^|[\s_.-])(roms?|emulators?|retroarch|mame|dolphin|pcsx2|yuzu)(?:$|[\s_.-])/.test(n)) topic = "roms";
  else if (/(?:^|[\s_.-])(minecraft|modpacks?|resourcepacks?|shaderpacks?|curseforge|modrinth)(?:$|[\s_.-])/.test(n)) topic = "minecraft";
  else if (/(?:^|[\s_.-])(tabletop_?rpg|dnd_?campaigns?|vtt_?maps?)(?:$|[\s_.-])/.test(n)) topic = "tabletop_rpg";
  else if (/(?:^|[\s_.-])(unreal_?unity|unreal_?engine|ue5|unity_?worlds?)(?:$|[\s_.-])/.test(n)) topic = "unreal_unity";
  else if (/(?:^|[\s_.-])(games?|unity|unreal|godot|saves?|mods?)(?:$|[\s_.-])/.test(n)) topic = "games";
  else if (/(?:^|[\s_.-])(plugins?|extensions?|addons?|mods|widgets?)(?:$|[\s_.-])/.test(n)) topic = "plugins";
  else if (/(?:^|[\s_.-])(themes?|palettes?|styles?|tokens?|skins?)(?:$|[\s_.-])/.test(n)) topic = "themes";
  else if (/(?:^|[\s_.-])(design|figma|sketch|brand|ux|wireframes?|mockups?|vectors?)(?:$|[\s_.-])/.test(n)) topic = "design";
  else if (/(?:^|[\s_.-])(fonts_?pro|typefoundries|variable_?fonts?)(?:$|[\s_.-])/.test(n)) topic = "fonts_pro";
  else if (/(?:^|[\s_.-])(fonts?|typography|typefaces?)(?:$|[\s_.-])/.test(n)) topic = "fonts";
  else if (/(?:^|[\s_.-])(cybersecurity_?vault|siem|yara_?rules?|zero_?day)(?:$|[\s_.-])/.test(n)) topic = "cybersecurity_vault";
  else if (/(?:^|[\s_.-])(pentest|ctf|exploits?|kali|burp|wireshark|ghidra|forensics|osint)(?:$|[\s_.-])/.test(n)) topic = "pentest";
  else if (/(?:^|[\s_.-])(encrypted|cipher|radenc|zero_?knowledge)(?:$|[\s_.-])/.test(n)) topic = "encrypted";
  else if (/(?:^|[\s_.-])(security|keys?|certs?|certificates?|ssh|gpg|vault|secrets?|auth|ssl)(?:$|[\s_.-])/.test(n)) topic = "security";
  else if (/(?:^|[\s_.-])(blockchain_?zk|zk_?proofs?|circom|rollups?)(?:$|[\s_.-])/.test(n)) topic = "blockchain_zk";
  else if (/(?:^|[\s_.-])(crypto|web3|blockchain|contracts?|wallets?|solidity|defi|nft)(?:$|[\s_.-])/.test(n)) topic = "crypto";
  else if (/(?:^|[\s_.-])(config|configs|configuration|settings|etc|\.config|\.vscode|\.idx)(?:$|[\s_.-])/.test(n)) topic = "config";
  else if (/(?:^|[\s_.-])(src|lib|app|components|packages|server|core|shared|features|modules|cmd|internal|pkg)(?:$|[\s_.-])/.test(n)) topic = "code";
  else if (/(?:^|[\s_.-])(obsidian_?pkms|zettelkasten|obsidian_?vault)(?:$|[\s_.-])/.test(n)) topic = "obsidian_pkms";
  else if (/(?:^|[\s_.-])(ebooks?|epub|kindle|calibre|textbooks?|whitepapers?)(?:$|[\s_.-])/.test(n)) topic = "ebooks";
  else if (/(?:^|[\s_.-])(comics?|graphic_?novels?|cbz|cbr|zines?|webtoons?)(?:$|[\s_.-])/.test(n)) topic = "comics";
  else if (/(?:^|[\s_.-])(resumes?|cv|cover_?letters?|portfolios?|career|hiring)(?:$|[\s_.-])/.test(n)) topic = "career";
  else if (/(?:^|[\s_.-])(recipes?|cooking|baking|culinary|meal_?prep|nutrition)(?:$|[\s_.-])/.test(n)) topic = "recipes";
  else if (/(?:^|[\s_.-])(travel|trips?|vacations?|itineraries|flights?|maps?|gpx|hiking)(?:$|[\s_.-])/.test(n)) topic = "travel";
  else if (/(?:^|[\s_.-])(mail|emails?|inbox_?mail|mbox|newsletters?)(?:$|[\s_.-])/.test(n)) topic = "mail";
  else if (/(?:^|[\s_.-])(favorites?|starred|bookmarks?|pinned)(?:$|[\s_.-])/.test(n)) topic = "favorites";
  else if (/(?:^|[\s_.-])(docs?|documentation|notes|guides|manuals|papers|books|wiki|readme|rfcs?)(?:$|[\s_.-])/.test(n)) topic = "docs";
  else if (/(?:^|[\s_.-])(quant_?trading|orderbooks?|alpha_?signals?|backtests?)(?:$|[\s_.-])/.test(n)) topic = "quant_trading";
  else if (/(?:^|[\s_.-])(finance|invoices?|taxes|accounting|budget|billing|receipts?|ledger)(?:$|[\s_.-])/.test(n)) topic = "finance";
  else if (/(?:^|[\s_.-])(legal_?ip|trademarks?|ndas?)(?:$|[\s_.-])/.test(n)) topic = "legal_ip";
  else if (/(?:^|[\s_.-])(legal|contracts?|licenses?|patents?|compliance|terms|privacy)(?:$|[\s_.-])/.test(n)) topic = "legal";
  else if (/(?:^|[\s_.-])(logs?|telemetry|metrics|traces|audit|crash)(?:$|[\s_.-])/.test(n)) topic = "logs";
  else if (/(?:^|[\s_.-])(temp|tmp|cache|\.cache|scratch|staging)(?:$|[\s_.-])/.test(n)) topic = "temp";
  else if (/(?:^|[\s_.-])(trash|recycle|\.trash|deleted)(?:$|[\s_.-])/.test(n)) topic = "trash";
  else if (/(?:^|[\s_.-])(downloads?|inbox|incoming)(?:$|[\s_.-])/.test(n)) topic = "downloads";
  else if (/(?:^|[\s_.-])(db|databases?|sql|migrations|data|prisma|seeds|postgres|sqlite|bigquery)(?:$|[\s_.-])/.test(n)) topic = "database";
  else if (/(?:^|[\s_.-])(smart_?home|home_?assistant|zigbee|matter_?iot)(?:$|[\s_.-])/.test(n)) topic = "smart_home";
  else if (/(?:^|[\s_.-])(homelab|nas|synology|truenas|unraid|plex|jellyfin|selfhosted)(?:$|[\s_.-])/.test(n)) topic = "homelab";
  else if (/(?:^|[\s_.-])(vms?|virtual_?machines?|parallels|vmware|utm|qemu|proxmox|isos?)(?:$|[\s_.-])/.test(n)) topic = "vms";
  else if (/(?:^|[\s_.-])(team_?shared|shared_?drive|public_?dropbox)(?:$|[\s_.-])/.test(n)) topic = "shared";
  else if (/(?:^|[\s_.-])(cloud|sync|icloud|dropbox|drive|onedrive|shared|gcloud|s3|buckets?)(?:$|[\s_.-])/.test(n)) topic = "cloud";
  else if (/(?:^|[\s_.-])(network|dns|vpn|proxy|nginx|caddy|sockets?|firewall)(?:$|[\s_.-])/.test(n)) topic = "network";
  else if (/(?:^|[\s_.-])(system|os|kernel|drivers?|firmware|boot|usr|var|opt)(?:$|[\s_.-])/.test(n)) topic = "system";
  else if (/(?:^|[\s_.-])(desktop)(?:$|[\s_.-])/.test(n)) topic = "desktop";
  else if (/(?:^|[\s_.-])(home|users?)(?:$|[\s_.-])/.test(n)) topic = "home";
  else if (/(?:^|[\s_.-])(time_?machine|snapshots?)(?:$|[\s_.-])/.test(n)) topic = "backups";
  else if (/(?:^|[\s_.-])(archives?|backups?|dist|build|out|releases?|vendor|node_modules|target)(?:$|[\s_.-])/.test(n)) topic = "archive";
  if (FOLDER_TOPIC_CACHE.size > 4096) FOLDER_TOPIC_CACHE.clear();
  FOLDER_TOPIC_CACHE.set(n, topic);
  return topic;
}

/** Resolves the rich semantic metadata entry from `SYSTEM_ICON_CATALOG` (260+ system icons) for any file or folder name. */
export function resolveSystemIcon(name, isDir = false) {
  const raw = String(name || "").trim();
  const lower = raw.toLowerCase();
  if (isDir) {
    const topic = classifyFolderTopic(lower);
    return FOLDER_SYSTEM_ICON_BY_TOPIC.get(topic) || FOLDER_SYSTEM_ICON_BY_TOPIC.get("general");
  }
  const exact = EXACT_SYSTEM_ICON_BY_NAME.get(lower);
  if (exact) return exact;
  if (lower.startsWith(".env.")) return EXACT_SYSTEM_ICON_BY_NAME.get(".env");
  if (lower.startsWith("dockerfile.")) return EXACT_SYSTEM_ICON_BY_NAME.get("dockerfile");
  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";
  if (ext && EXT_SYSTEM_ICON_BY_EXT.has(ext)) {
    return EXT_SYSTEM_ICON_BY_EXT.get(ext);
  }
  return null;
}

export function classifyIconKind(name, isDir) {
  if (isDir) return "folder";
  const lower = String(name || "").trim().toLowerCase();
  const cached = ICON_KIND_CACHE.get(lower);
  if (cached !== undefined) return cached;
  const exact = EXACT_SYSTEM_ICON_BY_NAME.get(lower);
  let kind;
  if (exact?.kind && ICON_PACK_GLYPHS.default[exact.kind]) {
    kind = exact.kind;
  } else {
    const dot = lower.lastIndexOf(".");
    const ext = dot > 0 ? lower.slice(dot + 1) : "";
    kind = KIND_BY_EXT.get(ext) ?? "file";
  }
  if (ICON_KIND_CACHE.size > 4096) ICON_KIND_CACHE.clear();
  ICON_KIND_CACHE.set(lower, kind);
  return kind;
}

export function activeIconPackStyle() {
  try {
    const p = typeof document !== "undefined" ? document.documentElement?.dataset?.iconPack : "";
    return p && ICON_PACK_GLYPHS[p] ? p : "default";
  } catch {
    return "default";
  }
}

/** A picture-word for a file name, for places (like the Recycle Bin) where the server didn't classify it, or when a custom Icon Pack is active. */
export function iconFor(name, isDir, packOverride, kindHint) {
  const pack = packOverride && ICON_PACK_GLYPHS[packOverride] ? packOverride : activeIconPackStyle();
  const sysEntry = resolveSystemIcon(name, isDir);
  if (pack !== "default") {
    const def = ICON_PACK_GLYPHS[pack];
    if (isDir && def?.topics) {
      const topic = sysEntry?.topic && sysEntry.topic !== "general" ? sysEntry.topic : classifyFolderTopic(name);
      if (topic !== "general" && def.topics[topic]) return def.topics[topic];
    }
    if (!isDir && (pack === "google_material_3d" || def?.useGoogle3d) && sysEntry?.google3d) {
      return sysEntry.google3d;
    }
    if (!isDir && sysEntry?.category === "exact" && def?.useExact) {
      return sysEntry.icon;
    }
    const kind = isDir ? "folder" : (kindHint && def?.[kindHint] ? kindHint : classifyIconKind(name, false));
    return def?.[kind] ?? def?.file ?? "📁";
  }
  if (isDir) {
    return sysEntry && sysEntry.topic !== "general" ? sysEntry.icon : "📁";
  }
  if (sysEntry?.icon) return sysEntry.icon;
  const s = String(name || "");
  const dot = s.lastIndexOf(".");
  const ext = dot > 0 ? s.slice(dot + 1).toLowerCase() : "";
  return ICON_BY_EXT.get(ext) ?? "📃";
}

/** Resolves a theme-aware icon for any File Manager toolbar button, quick-action button, or navigation action. */
export function buttonIconFor(actionId, packOverride, fallbackIcon) {
  const id = String(actionId || "").trim();
  const spec = BUTTON_ICON_BY_ID.get(id);
  const defaultGlyph = fallbackIcon || spec?.icon || "⚙️";
  const pack = packOverride && ICON_PACK_GLYPHS[packOverride] ? packOverride : activeIconPackStyle();
  if (pack === "default") return defaultGlyph;
  const def = ICON_PACK_GLYPHS[pack];
  if (def?.buttons?.[id]) return def.buttons[id];
  const preset = def?.buttonPreset;
  if (preset && spec?.[preset]) return spec[preset];
  return defaultGlyph;
}

/** Resolves a theme-aware icon for sidebar places, Home place cards, Favorites, Recent folders, and Tabs. */
export function placeIconFor(placeId, label, packOverride, fallbackIcon) {
  const id = String(placeId || "").trim().toLowerCase();
  const pack = packOverride && ICON_PACK_GLYPHS[packOverride] ? packOverride : activeIconPackStyle();
  if (pack === "default") {
    return fallbackIcon || (id === "home" ? "🏠" : id === "recycle" ? "🗑️" : iconFor(label || id, true, "default"));
  }
  if (id === "home") return buttonIconFor("home", pack, fallbackIcon || "🏠");
  if (id === "recycle" || id === "trash") return buttonIconFor("recycle", pack, fallbackIcon || "🗑️");
  return iconFor(label || id, true, pack);
}

/** Resolves the display icon for a File Manager entry, respecting custom Icon Pack styles when active. */
export function iconForEntry(entry, packOverride) {
  const isDir = Boolean(entry?.isDir || entry?.isDirectory);
  const pack = packOverride && ICON_PACK_GLYPHS[packOverride] ? packOverride : activeIconPackStyle();
  if (pack !== "default") {
    return iconFor(entry?.name || "", isDir, pack, entry?.kind);
  }
  return entry?.icon || iconFor(entry?.name || "", isDir, "default", entry?.kind);
}
export const entryIcon = iconForEntry;

/** Updates all visible `.row .c-icon`, toolbar/action buttons, sidebar places, folder tree nodes, inspector icons, and tabs when the active Icon Pack changes. */
export function syncVisibleIcons(root = typeof document !== "undefined" ? document : null) {
  if (!root?.querySelectorAll) return;
  const pack = activeIconPackStyle();
  const activePalette = typeof document !== "undefined" ? (document.documentElement?.dataset?.palette || "") : "";
  const activeUiFx = typeof document !== "undefined" ? (document.documentElement?.dataset?.uiFx || "") : "";
  const holidaySpec = HOLIDAY_THEME_CRESTS[activePalette] || (activeUiFx === "holiday_festive_glow" ? HOLIDAY_THEME_CRESTS.holiday_halloween_jack_o_lantern : null);
  const holidayCrest = holidaySpec?.crest || "";
  root.querySelectorAll(".row").forEach((row) => {
    const ico = row.querySelector(".c-icon");
    if (!ico) return;
    const nameEl = row.querySelector(".name-text");
    const isDir = row.classList.contains("is-folder") || row.dataset.isDir === "1";
    const name = row.dataset.entryName || nameEl?.textContent || "";
    const holidayBadge = holidaySpec?.badge || "";
    if (isDir) {
      if (holidayCrest) {
        if (row.dataset.holidayCrest !== holidayCrest) row.dataset.holidayCrest = holidayCrest;
        if (ico.dataset.holidayCrest !== holidayCrest) ico.dataset.holidayCrest = holidayCrest;
        if (nameEl && nameEl.dataset.holidayCrest !== holidayCrest) nameEl.dataset.holidayCrest = holidayCrest;
      } else {
        if (row.dataset.holidayCrest) delete row.dataset.holidayCrest;
        if (ico.dataset.holidayCrest) delete ico.dataset.holidayCrest;
        if (nameEl?.dataset?.holidayCrest) delete nameEl.dataset.holidayCrest;
      }
      if (row.dataset.holidayBadge) delete row.dataset.holidayBadge;
      if (ico.dataset.holidayBadge) delete ico.dataset.holidayBadge;
      if (nameEl?.dataset?.holidayBadge) delete nameEl.dataset.holidayBadge;
    } else if (holidayBadge) {
      if (row.dataset.holidayBadge !== holidayBadge) row.dataset.holidayBadge = holidayBadge;
      if (ico.dataset.holidayBadge !== holidayBadge) ico.dataset.holidayBadge = holidayBadge;
      if (nameEl && nameEl.dataset.holidayBadge !== holidayBadge) nameEl.dataset.holidayBadge = holidayBadge;
    } else {
      if (row.dataset.holidayBadge) delete row.dataset.holidayBadge;
      if (ico.dataset.holidayBadge) delete ico.dataset.holidayBadge;
      if (nameEl?.dataset?.holidayBadge) delete nameEl.dataset.holidayBadge;
    }
    if (ico.dataset.appliedPack === pack && ico.dataset.appliedName === name && ico.dataset.iconKind) {
      return;
    }
    const kind = classifyIconKind(name, isDir);
    const sysEntry = resolveSystemIcon(name, isDir);
    const isFolderStr = isDir ? "1" : "0";
    if (ico.dataset.iconKind !== kind) ico.dataset.iconKind = kind;
    if (ico.dataset.isFolder !== isFolderStr) ico.dataset.isFolder = isFolderStr;
    if (row.dataset.iconKind !== kind) row.dataset.iconKind = kind;
    if (sysEntry?.id && ico.dataset.systemIcon !== sysEntry.id) {
      ico.dataset.systemIcon = sysEntry.id;
    }
    if (isDir) {
      const topic = sysEntry?.topic && sysEntry.topic !== "general" ? sysEntry.topic : classifyFolderTopic(name);
      if (row.dataset.folderTopic !== topic) row.dataset.folderTopic = topic;
      if (row.dataset.topic !== topic) row.dataset.topic = topic;
      if (ico.dataset.folderTopic !== topic) ico.dataset.folderTopic = topic;
      if (ico.dataset.topic !== topic) ico.dataset.topic = topic;
    }
    const nextGlyph = pack === "default"
      ? (row.dataset.defaultIcon || iconFor(name, isDir, "default", kind))
      : iconFor(name, isDir, pack, kind);
    if (ico.textContent !== nextGlyph) ico.textContent = nextGlyph;
    ico.dataset.appliedPack = pack;
    ico.dataset.appliedName = name;
  });

  // Sync Inspector `.info-icon[data-entry-name]`
  root.querySelectorAll(".info-icon[data-entry-name]").forEach((el) => {
    const name = el.dataset.entryName || "";
    const isDir = el.dataset.isDir === "1";
    const defaultIcon = el.dataset.defaultIcon || el.textContent || "";
    if (!el.dataset.defaultIcon && defaultIcon) el.dataset.defaultIcon = defaultIcon;
    if (el.dataset.appliedPack === pack && el.dataset.appliedName === name) return;
    const nextGlyph = pack === "default"
      ? (defaultIcon || iconFor(name, isDir, "default"))
      : iconFor(name, isDir, pack);
    if (el.textContent !== nextGlyph) el.textContent = nextGlyph;
    el.dataset.appliedPack = pack;
    el.dataset.appliedName = name;
  });

  // Sync toolbar & quick-action button icons (`[data-btn-icon]`)
  root.querySelectorAll("[data-btn-icon]").forEach((el) => {
    const btnId = el.dataset.btnIcon;
    if (!btnId) return;
    const defaultIcon = el.dataset.defaultIcon || el.textContent || "";
    if (!el.dataset.defaultIcon && defaultIcon) el.dataset.defaultIcon = defaultIcon;
    if (el.dataset.appliedPack === pack) return;
    const nextGlyph = buttonIconFor(btnId, pack, defaultIcon);
    if (el.textContent !== nextGlyph) el.textContent = nextGlyph;
    el.dataset.appliedPack = pack;
  });

  // Sync sidebar places, favorites, recents, and Home place cards (`[data-place-icon]`)
  root.querySelectorAll("[data-place-icon]").forEach((el) => {
    const placeId = el.dataset.placeIcon;
    const placeName = el.dataset.placeName || placeId || "";
    const defaultIcon = el.dataset.defaultIcon || el.textContent || "";
    if (!el.dataset.defaultIcon && defaultIcon) el.dataset.defaultIcon = defaultIcon;
    if (el.dataset.appliedPack === pack && el.dataset.appliedName === placeName) return;
    const nextGlyph = placeIconFor(placeId, placeName, pack, defaultIcon);
    if (el.textContent !== nextGlyph) el.textContent = nextGlyph;
    el.dataset.appliedPack = pack;
    el.dataset.appliedName = placeName;
  });

  // Sync folder tree nodes (`[data-tree-name]`)
  root.querySelectorAll("[data-tree-name]").forEach((el) => {
    const treeName = el.dataset.treeName || "";
    const defaultIcon = el.dataset.defaultIcon || el.textContent || "📁";
    if (!el.dataset.defaultIcon) el.dataset.defaultIcon = defaultIcon;
    if (el.dataset.appliedPack === pack && el.dataset.appliedName === treeName) return;
    const nextGlyph = pack === "default" ? defaultIcon : iconFor(treeName, true, pack);
    if (el.textContent !== nextGlyph) el.textContent = nextGlyph;
    el.dataset.appliedPack = pack;
    el.dataset.appliedName = treeName;
  });

  // Sync folder tabs (`[data-tab-icon]`)
  root.querySelectorAll("[data-tab-icon]").forEach((el) => {
    const tabKind = el.dataset.tabIcon || "folder";
    const tabName = el.dataset.tabName || "";
    const defaultIcon = el.dataset.defaultIcon || el.textContent || (tabKind === "home" ? "🏠" : "📁");
    if (!el.dataset.defaultIcon) el.dataset.defaultIcon = defaultIcon;
    if (el.dataset.appliedPack === pack && el.dataset.appliedName === tabName) return;
    const nextGlyph = tabKind === "home"
      ? placeIconFor("home", "Home", pack, defaultIcon)
      : (pack === "default" ? defaultIcon : iconFor(tabName, true, pack));
    if (el.textContent !== nextGlyph) el.textContent = nextGlyph;
    el.dataset.appliedPack = pack;
    el.dataset.appliedName = tabName;
  });
}

/** Runs `fn` at most once per `ms` after the last call. */
export function debounce(fn, ms) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
