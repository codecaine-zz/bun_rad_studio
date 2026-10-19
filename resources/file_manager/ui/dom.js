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
  // ── 45 Semantic System Folder Icons ───────────────────────────────────────
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

  // ── 35 Exact System / Developer Filename Icons ────────────────────────────
  { id: "exact_dockerfile", category: "exact", match: ["dockerfile", "containerfile"], kind: "container", label: "Dockerfile / Containerfile", icon: "🐳", google3d: "🐳" },
  { id: "exact_docker_compose", category: "exact", match: ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"], kind: "container", label: "Docker Compose Stack", icon: "🐙", google3d: "🐳" },
  { id: "exact_package_json", category: "exact", match: ["package.json"], kind: "manifest", label: "Node / Bun Package Manifest", icon: "📦", google3d: "📦" },
  { id: "exact_bun_lock", category: "exact", match: ["bun.lockb", "bun.lock", "bunfig.toml"], kind: "lockfile", label: "Bun Runtime Lockfile & Config", icon: "🥟", google3d: "🥟" },
  { id: "exact_lockfile", category: "exact", match: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "cargo.lock", "poetry.lock", "uv.lock", "gemfile.lock", "composer.lock"], kind: "lockfile", label: "Dependency Lockfile", icon: "🔒", google3d: "🔒" },
  { id: "exact_tsconfig", category: "exact", match: ["tsconfig.json", "tsconfig.base.json", "jsconfig.json"], kind: "config", label: "TypeScript Compiler Config", icon: "📘", google3d: "📘" },
  { id: "exact_gitignore", category: "exact", match: [".gitignore", ".gitattributes", ".gitmodules", ".gitkeep"], kind: "git", label: "Git Configuration", icon: "🌿", google3d: "🔀" },
  { id: "exact_env", category: "exact", match: [".env", ".env.local", ".env.development", ".env.production", ".env.example", ".env.test"], kind: "secret", label: "Environment Secrets (.env)", icon: "🔑", google3d: "🔑" },
  { id: "exact_readme", category: "exact", match: ["readme.md", "readme.txt", "readme", "changelog.md", "contributing.md", "security.md"], kind: "doc", label: "Project Readme & Guide", icon: "📖", google3d: "📘" },
  { id: "exact_license", category: "exact", match: ["license", "license.md", "license.txt", "copying", "notice"], kind: "legal", label: "Software License", icon: "⚖️", google3d: "⚖️" },
  { id: "exact_makefile", category: "exact", match: ["makefile", "gnumakefile", "justfile", "taskfile.yml"], kind: "build", label: "Makefile / Build Runner", icon: "🛠️", google3d: "🛠️" },
  { id: "exact_cmake", category: "exact", match: ["cmakelists.txt", "meson.build", "build.ninja"], kind: "build", label: "CMake / Native Build Graph", icon: "🏗️", google3d: "🏗️" },
  { id: "exact_cargo", category: "exact", match: ["cargo.toml"], kind: "manifest", label: "Rust Cargo Manifest", icon: "🦀", google3d: "🦀" },
  { id: "exact_gomod", category: "exact", match: ["go.mod", "go.sum", "go.work"], kind: "manifest", label: "Go Module Manifest", icon: "🐹", google3d: "🐹" },
  { id: "exact_vmod", category: "exact", match: ["v.mod"], kind: "manifest", label: "Vlang Module Manifest", icon: "⚡", google3d: "⚡" },
  { id: "exact_pyproject", category: "exact", match: ["pyproject.toml", "requirements.txt", "pipfile", "setup.py"], kind: "manifest", label: "Python Project Manifest", icon: "🐍", google3d: "🐍" },
  { id: "exact_gradle", category: "exact", match: ["build.gradle", "build.gradle.kts", "settings.gradle", "pom.xml"], kind: "build", label: "JVM Gradle / Maven Build", icon: "🐘", google3d: "☕" },
  { id: "exact_terraform", category: "exact", match: ["main.tf", "variables.tf", "outputs.tf", "terraform.tfstate"], kind: "cloud", label: "Terraform Cloud State", icon: "🌩️", google3d: "☁️" },
  { id: "exact_k8s", category: "exact", match: ["chart.yaml", "values.yaml", "kustomization.yaml", "skaffold.yaml"], kind: "cloud", label: "Kubernetes / Helm Manifest", icon: "☸️", google3d: "☸️" },
  { id: "exact_firebase", category: "exact", match: ["firebase.json", ".firebaserc", "firestore.rules", "firestore.indexes.json"], kind: "cloud", label: "Google Firebase Config", icon: "🔥", google3d: "🔥" },
  { id: "exact_gcloud", category: "exact", match: ["app.yaml", "cloudbuild.yaml", "cloudbuild.json"], kind: "cloud", label: "Google Cloud Build & AppEngine", icon: "☁️", google3d: "☁️" },
  { id: "exact_idx", category: "exact", match: ["dev.nix", "flake.nix", "shell.nix", "default.nix"], kind: "config", label: "Project IDX / Nix Environment", icon: "❄️", google3d: "✨" },
  { id: "exact_vite_webpack", category: "exact", match: ["vite.config.ts", "vite.config.js", "webpack.config.js", "rollup.config.js", "next.config.js", "next.config.mjs", "astro.config.mjs"], kind: "build", label: "Frontend Bundler Config", icon: "⚡", google3d: "⚡" },
  { id: "exact_tailwind", category: "exact", match: ["tailwind.config.js", "tailwind.config.ts", "postcss.config.js"], kind: "design", label: "Tailwind & CSS Engine Config", icon: "🎨", google3d: "🎨" },
  { id: "exact_eslint_biome", category: "exact", match: ["biome.json", "biome.jsonc", ".eslintrc", ".eslintrc.json", "eslint.config.js", ".prettierrc", ".editorconfig"], kind: "config", label: "Linter & Formatter Rules", icon: "🧹", google3d: "✨" },
  { id: "exact_prisma", category: "exact", match: ["schema.prisma", "drizzle.config.ts"], kind: "database", label: "Database ORM Schema", icon: "💎", google3d: "🗄️" },
  { id: "exact_github_workflow", category: "exact", match: ["action.yml", "action.yaml", ".gitlab-ci.yml", "jenkinsfile", ".travis.yml"], kind: "ci", label: "CI/CD Workflow Spec", icon: "🚀", google3d: "🚀" },
  { id: "exact_ssh_authorized", category: "exact", match: ["id_rsa", "id_ed25519", "id_ecdsa", "authorized_keys", "known_hosts"], kind: "secret", label: "SSH Cryptographic Identity", icon: "🗝️", google3d: "🛡️" },
  { id: "exact_hosts", category: "exact", match: ["hosts", "resolv.conf", "nginx.conf", "caddyfile"], kind: "network", label: "Network & Reverse Proxy Config", icon: "🌐", google3d: "📡" },
  { id: "exact_crontab", category: "exact", match: ["crontab", "procfile"], kind: "system", label: "System Daemon Schedule", icon: "⏱️", google3d: "⏱️" },
  { id: "exact_claude_gemini", category: "exact", match: ["agents.md", "claude.md", "gemini.md", "skill.md", ".cursorrules"], kind: "ai", label: "AI Agent Instructions & Skills", icon: "✨", google3d: "✨" },
  { id: "exact_bazel", category: "exact", match: ["build.bazel", "workspace.bazel", "module.bazel", ".bazelrc"], kind: "build", label: "Google Bazel Build System", icon: "🟢", google3d: "🧱" },
  { id: "exact_android_manifest", category: "exact", match: ["androidmanifest.xml", " podfile", "info.plist"], kind: "mobile", label: "Mobile App Platform Manifest", icon: "📱", google3d: "📱" },
  { id: "exact_favicon", category: "exact", match: ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "site.webmanifest"], kind: "image", label: "Web App Icon & Manifest", icon: "🌟", google3d: "🌟" },
  { id: "exact_ds_store", category: "exact", match: [".ds_store", "thumbs.db", "desktop.ini"], kind: "system", label: "OS Desktop Metadata", icon: "👻", google3d: "🫧" },

  // ── 45 File Extension / Semantic Kind System Icons ────────────────────────
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
];

const ICONS = [
  ["🖼️", "png jpg jpeg gif webp bmp svg ico tif tiff heic heif avif jxl raw dng cr2 cr3 nef arw orf rw2 eps ai psd psb xcf fig sketch xd afdesign afphoto indd", "image"],
  ["🎞️", "mp4 mov mkv avi webm wmv flv m4v mpg mpeg ts m2ts prores braw r3d", "video"],
  ["🎵", "mp3 wav flac aac ogg m4a wma opus aiff aif alac dsd mid midi als flp logicx ptx rpp vst vst3 sf2", "audio"],
  ["📕", "pdf epub mobi azw3 djvu cbz cbr", "pdf"],
  ["📄", "doc docx odt rtf pages wpd", "doc"],
  ["📊", "xls xlsx xlsm ods csv tsv numbers", "sheet"],
  ["📽️", "ppt pptx odp key", "slide"],
  ["🗜️", "zip rar 7z tar gz tgz bz2 xz zst lz4 br cab arj", "archive"],
  ["💻", "js mjs cjs ts tsx jsx py pyw pyi pyx pxd rb erb rake gemspec go rs rlib java kt kts scala groovy swift c h cpp hpp cc cxx hh hxx ino cs csx fs fsx vb sln csproj php phtml html htm xhtml ejs hbs pug astro css scss sass less styl json jsonc json5 jsonl ndjson xml yaml yml toml kdl hcl sql lua luau dart arb vue svelte solid ps1 psm1 bat cmd sh bash zsh fish ksh csh awk sed v vsh vv zig zon nim ex exs erl hrl hs lhs ml mli clj cljs el lisp r rmd jl mat pl pm asm s m mm mts cts graphql gql proto thrift cmake gradle tf tfvars sol vy move cairo wat wasm glsl vert frag comp wgsl hlsl fx metal ipynb fasta vcf cif", "code"],
  ["📝", "txt md markdown mdx log diff patch err out ini cfg conf properties reg service env rst tex bib org adoc nfo", "text"],
  ["⚙️", "exe msi app command jar apk aab ipa appimage scr com run vbs deb rpm pkg flatpak snap dll so dylib", "exec"],
  ["💿", "dmg img iso vhd vhdx vmdk qcow2 ova ovf", "disk"],
  ["🔤", "ttf otf woff woff2 eot", "font"],
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

export const ICON_PACK_GLYPHS = {
  default: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "🗜️", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📃",
  },
  macos_tahoe_3d: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📊", slide: "🖼️", archive: "📦", code: "🧑‍💻", text: "🗒️", exec: "🚀",
    disk: "💿", font: "🔤", file: "📄",
    topics: { pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "💠", "3d": "🧊", docs: "📚", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", ai_ml: "🧠", security: "🔐", docker: "🐳", kubernetes: "☸️", git: "🌿", config: "⚙️", tests: "🧪", scripts: "📜", fonts: "🔤", design: "🎨", games: "🎮", mobile: "📱", desktop: "🖥️", web: "🌐", api: "🔌", logs: "📋", temp: "⏳", trash: "🗑️", system: "🏛️", network: "📡", crypto: "⛓️", notebooks: "📓", workflows: "🔄", plugins: "🧩", themes: "🌈", shaders: "🔮", audio_stems: "🎚️", camera_raw: "📸", cad: "📐", finance: "💹", legal: "⚖️", science: "🧬", quantum: "⚛️", home: "🏠" },
  },
  win11_fluent_pro: {
    folder: "🗂️", image: "🖼️", video: "📽️", audio: "🎵", pdf: "📕", doc: "📃",
    sheet: "📈", slide: "📊", archive: "🧳", code: "💻", text: "📝", exec: "⚡",
    disk: "💽", font: "🔤", file: "📄",
    topics: { pictures: "🖼️", video: "📽️", videos: "📽️", music: "🎵", code: "💻", "3d": "🧊", docs: "🗂️", downloads: "⬇️", archive: "🧳", cloud: "☁️", database: "🛢️", ai_ml: "🧠", security: "🛡️", docker: "🐳", kubernetes: "☸️", git: "🔀", config: "⚙️", tests: "🧪", scripts: "⚡", fonts: "🔤", design: "🎨", games: "🎮", mobile: "📱", desktop: "🖥️", web: "🌐", api: "🔌", logs: "📋", temp: "⏳", trash: "🗑️", system: "🏛️", network: "📡", crypto: "⛓️", notebooks: "📓", workflows: "🔄", plugins: "🧩", themes: "🌈", shaders: "🔮", audio_stems: "🎚️", camera_raw: "📸", cad: "📐", finance: "💹", legal: "⚖️", science: "🧬", quantum: "⚛️", home: "🏠" },
  },
  pro_studio_xdr: {
    folder: "🗄️", image: "📸", video: "🎞️", audio: "🎚️", pdf: "📋", doc: "📑",
    sheet: "📐", slide: "🖥️", archive: "🧰", code: "⚡", text: "🗒️", exec: "🎛️",
    disk: "💽", font: "🔡", file: "📄",
    topics: { pictures: "📸", video: "🎞️", videos: "🎞️", music: "🎚️", code: "⚡", "3d": "🧊", docs: "📑", downloads: "📡", archive: "🧰", cloud: "🛰️", database: "🗄️", ai_ml: "🧠", security: "🔐", docker: "🐳", kubernetes: "☸️", git: "🌿", config: "🎛️", tests: "🧪", scripts: "⚡", fonts: "🔡", design: "🎨", games: "🕹️", mobile: "📱", desktop: "🖥️", web: "🌐", api: "🛰️", logs: "📈", temp: "⏳", trash: "🗑️", system: "⚙️", network: "📡", crypto: "💎", notebooks: "📓", workflows: "🚀", plugins: "🧩", themes: "🌈", shaders: "🔮", audio_stems: "🎚️", camera_raw: "📸", cad: "📐", finance: "💹", legal: "⚖️", science: "🧬", quantum: "⚛️", home: "🏠" },
  },
  hdr_photo_studio: {
    folder: "📸", image: "🖼️", video: "🎥", audio: "🎙️", pdf: "🎞️", doc: "🖼️",
    sheet: "🎨", slide: "📽️", archive: "🎞️", code: "✨", text: "📝", exec: "🎬",
    disk: "💿", font: "🔤", file: "🖼️",
    topics: { pictures: "📸", video: "🎥", videos: "🎥", music: "🎙️", code: "✨", "3d": "🧊", docs: "🖼️", downloads: "📥", archive: "🎞️", cloud: "☁️", database: "🗄️", camera_raw: "📸", design: "🎨", shaders: "🔮" },
  },
  linux_papirus_pro: {
    folder: "📂", image: "🖼️", video: "🎞️", audio: "🎶", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "🐧", text: "📝", exec: "⚙️",
    disk: "💽", font: "🔤", file: "📃",
    topics: { pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎶", code: "🐧", "3d": "🧊", docs: "📚", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", docker: "🐳", kubernetes: "☸️", git: "🌿", config: "⚙️", scripts: "🐚", system: "🐧" },
  },
  nordic_minimal: {
    folder: "📁", image: "🎨", video: "🎞️", audio: "🎵", pdf: "📓", doc: "📄",
    sheet: "📊", slide: "🖼️", archive: "📦", code: "🧩", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📃",
    topics: { pictures: "🎨", video: "🎞️", videos: "🎞️", music: "🎵", code: "🧩", "3d": "🧊", docs: "📓", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️" },
  },
  google_material_3d: {
    folder: "📁", image: "🏞️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📘",
    sheet: "📈", slide: "📽️", archive: "📦", code: "✨", text: "🗒️", exec: "🚀",
    disk: "💽", font: "🔤", file: "📄",
    topics: {
      pictures: "🏞️", video: "🎬", videos: "🎬", music: "🎧", code: "✨", "3d": "🧊",
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
    folder: "🔥", image: "🌅", video: "🎬", audio: "🎸", pdf: "📜", doc: "🏮",
    sheet: "📈", slide: "🎆", archive: "💣", code: "⚡", text: "🕯️", exec: "☄️",
    disk: "🌋", font: "🔱", file: "🧨",
  },
  slime: {
    folder: "🧪", image: "🦠", video: "👁️", audio: "🫧", pdf: "🧫", doc: "📋",
    sheet: "🧬", slide: "🔬", archive: "🛢️", code: "🧬", text: "🧪", exec: "☣️",
    disk: "🟢", font: "🦠", file: "💧",
  },
  storm_tempest: {
    folder: "🌪️", image: "🌈", video: "🌩️", audio: "🌬️", pdf: "⚡", doc: "🍃",
    sheet: "🧭", slide: "⛈️", archive: "🌊", code: "⚡", text: "🍂", exec: "🌀",
    disk: "🛟", font: "💨", file: "🌧️",
  },
  neon_cyber: {
    folder: "💠", image: "🔮", video: "📡", audio: "🎛️", pdf: "🪪", doc: "📟",
    sheet: "📉", slide: "🛰️", archive: "🧊", code: "⚡", text: "💾", exec: "🚀",
    disk: "💽", font: "🔣", file: "🔹",
  },
  liquid_gems: {
    folder: "💎", image: "🔮", video: "🪩", audio: "🎐", pdf: "👑", doc: "💠",
    sheet: "✨", slide: "🌟", archive: "💍", code: "🔷", text: "🫧", exec: "⚜️",
    disk: "💿", font: "💠", file: "🔹",
  },
  cryo_crystal: {
    folder: "🧊", image: "❄️", video: "🏔️", audio: "🎐", pdf: "🌨️", doc: "📃",
    sheet: "🧊", slide: "🌌", archive: "🏔️", code: "❄️", text: "🌬️", exec: "⛷️",
    disk: "💿", font: "❄️", file: "🧊",
  },
  retro_pixel: {
    folder: "👾", image: "🎨", video: "📺", audio: "📻", pdf: "📕", doc: "📜",
    sheet: "🧮", slide: "🕹️", archive: "📦", code: "🕹️", text: "📟", exec: "🪙",
    disk: "💾", font: "🔤", file: "📼",
  },
  xenotech_2126: {
    folder: "🛸", image: "🌌", video: "🪐", audio: "〰️", pdf: "🧿", doc: "📡",
    sheet: "⚛️", slide: "🔭", archive: "🕳️", code: "⚛️", text: "🧬", exec: "🚀",
    disk: "🪐", font: "🔯", file: "✨",
  },
  psychedelic_trip: {
    folder: "🍄", image: "🌈", video: "🔮", audio: "🎶", pdf: "🧿", doc: "📜",
    sheet: "🦋", slide: "🪷", archive: "🪐", code: "🧬", text: "✨", exec: "🚀",
    disk: "💿", font: "🔯", file: "🌸",
    topics: { pictures: "🌈", video: "🔮", videos: "🔮", music: "🎶", code: "🧬", "3d": "🪷", docs: "🧿", downloads: "🦋", archive: "🪐", cloud: "☁️", database: "🍄" },
  },
  lava_groovy: {
    folder: "🫧", image: "🌻", video: "🪩", audio: "🎸", pdf: "☮️", doc: "🌺",
    sheet: "🌈", slide: "🪩", archive: "🧳", code: "⚡", text: "✌️", exec: "🚀",
    disk: "💿", font: "🔤", file: "🌼",
    topics: { pictures: "🌻", video: "🪩", videos: "🪩", music: "🎸", code: "⚡", "3d": "🫧", docs: "☮️", downloads: "🌈", archive: "🧳", cloud: "☁️", database: "🪩" },
  },
  op_art_illusion: {
    folder: "🌀", image: "👁️", video: "🎞️", audio: "〰️", pdf: "💠", doc: "📐",
    sheet: "📊", slide: "🔮", archive: "🧊", code: "♾️", text: "📝", exec: "⚡",
    disk: "💿", font: "🔣", file: "🔹",
    topics: { pictures: "👁️", video: "🌀", videos: "🌀", music: "〰️", code: "♾️", "3d": "🧊", docs: "📐", downloads: "💠", archive: "🧊", cloud: "🌀", database: "🔮" },
  },
  us_holidays_festive: {
    folder: "📁", image: "🖼️", video: "🎬", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄",
    topics: { pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🎮" },
  },
  nerd_rpg_arcane: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄",
    topics: { pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🎮" },
  },
  nerd_scifi_fleet: {
    folder: "🗂️", image: "🖼️", video: "🎬", audio: "🎧", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄",
    topics: { pictures: "🖼️", video: "🎬", videos: "🎬", music: "🎧", code: "💻", "3d": "🧊", docs: "🗂️", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🎮" },
  },
  nerd_hacker_retro: {
    folder: "📂", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💾", font: "🔤", file: "📃",
    topics: { pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", docs: "📂", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🕹️", security: "🔐" },
  },
  horror_crypt: {
    folder: "📁", image: "🖼️", video: "🎞️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📃", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📃",
    topics: { pictures: "🖼️", video: "🎞️", videos: "🎞️", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", security: "🔐" },
  },
  realworld_objects: {
    folder: "📁", image: "🖼️", video: "📽️", audio: "🎵", pdf: "📕", doc: "📄",
    sheet: "📊", slide: "📽️", archive: "📦", code: "💻", text: "📝", exec: "⚙️",
    disk: "💿", font: "🔤", file: "📄",
    topics: { pictures: "🖼️", video: "📽️", videos: "📽️", music: "🎵", code: "💻", "3d": "🧊", docs: "📁", downloads: "📥", archive: "📦", cloud: "☁️", database: "🗄️", games: "🎮" },
  },
};
ICON_PACK_GLYPHS.inferno_burn = ICON_PACK_GLYPHS.inferno;
ICON_PACK_GLYPHS.bio_slime = ICON_PACK_GLYPHS.slime;
ICON_PACK_GLYPHS.storm_weather = ICON_PACK_GLYPHS.storm_tempest;
ICON_PACK_GLYPHS.liquid_chrome = ICON_PACK_GLYPHS.liquid_gems;
ICON_PACK_GLYPHS.arcane_glyphs = ICON_PACK_GLYPHS.xenotech_2126;

/** Classifies a folder's semantic purpose across 45+ high-class workstation topics for 3D folder badges and system icon templates. */
export function classifyFolderTopic(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return "general";
  if (/(?:^|[\s_.-])(3d|blender|maya|zbrush|cinema4d|houdini|meshes|rigging|usd|usdz|gltf)(?:$|[\s_.-])/.test(n)) return "3d";
  if (/(?:^|[\s_.-])(cad|blueprints?|pcb|gerber|schematics?|autocad|solidworks|freecad)(?:$|[\s_.-])/.test(n)) return "cad";
  if (/(?:^|[\s_.-])(raw|dng|negatives?|cr2|cr3|nef|arw|lightroom|captureone)(?:$|[\s_.-])/.test(n)) return "camera_raw";
  if (/(?:^|[\s_.-])(pictures?|photos?|images?|img|wallpapers?|screenshots?|camera|renders?|gallery|art|icons?|avatars?|thumbnails?)(?:$|[\s_.-])/.test(n)) return "pictures";
  if (/(?:^|[\s_.-])(videos?|movies?|films?|clips?|footage|cinema|recordings?|captures?|premiere|davinci|finalcut)(?:$|[\s_.-])/.test(n)) return "video";
  if (/(?:^|[\s_.-])(stems?|daw|ableton|logic|protools|flstudio|vst|synths?|samples?|loops?)(?:$|[\s_.-])/.test(n)) return "audio_stems";
  if (/(?:^|[\s_.-])(music|audio|sounds?|podcasts?|tracks?|sfx|playlists?)(?:$|[\s_.-])/.test(n)) return "music";
  if (/(?:^|[\s_.-])(ai|ml|models?|llm|weights|checkpoints?|neural|gemini|deepmind|vertex|tensors?|lora|embeddings?)(?:$|[\s_.-])/.test(n)) return "ai_ml";
  if (/(?:^|[\s_.-])(quantum|qubits?|willow|cirq|qiskit)(?:$|[\s_.-])/.test(n)) return "quantum";
  if (/(?:^|[\s_.-])(science|genomics?|bio|protein|alphafold|chemistry|lab|research|datasets?)(?:$|[\s_.-])/.test(n)) return "science";
  if (/(?:^|[\s_.-])(notebooks?|jupyter|colab|ipynb)(?:$|[\s_.-])/.test(n)) return "notebooks";
  if (/(?:^|[\s_.-])(shaders?|glsl|wgsl|hlsl|vulkan|metal|raytracing)(?:$|[\s_.-])/.test(n)) return "shaders";
  if (/(?:^|[\s_.-])(docker|containers?|compose|podman)(?:$|[\s_.-])/.test(n)) return "docker";
  if (/(?:^|[\s_.-])(k8s|kubernetes|helm|clusters?|manifests?)(?:$|[\s_.-])/.test(n)) return "kubernetes";
  if (/(?:^|[\s_.-])(\.git|\.github|git|repos?|branches|patches)(?:$|[\s_.-])/.test(n)) return "git";
  if (/(?:^|[\s_.-])(workflows?|ci|cd|pipelines?|actions|jenkins|cloudbuild)(?:$|[\s_.-])/.test(n)) return "workflows";
  if (/(?:^|[\s_.-])(tests?|__tests__|spec|specs|e2e|benchmarks?|coverage|cypress|playwright)(?:$|[\s_.-])/.test(n)) return "tests";
  if (/(?:^|[\s_.-])(scripts?|bin|tools|automation|cron|hooks)(?:$|[\s_.-])/.test(n)) return "scripts";
  if (/(?:^|[\s_.-])(api|graphql|grpc|proto|routes|endpoints|controllers|handlers|webhooks)(?:$|[\s_.-])/.test(n)) return "api";
  if (/(?:^|[\s_.-])(web|public|static|www|pages|views|frontend|client|ui)(?:$|[\s_.-])/.test(n)) return "web";
  if (/(?:^|[\s_.-])(mobile|android|ios|flutter|react-native|apk|ipa)(?:$|[\s_.-])/.test(n)) return "mobile";
  if (/(?:^|[\s_.-])(games?|unity|unreal|godot|roms?|saves?|mods?)(?:$|[\s_.-])/.test(n)) return "games";
  if (/(?:^|[\s_.-])(plugins?|extensions?|addons?|mods|widgets?)(?:$|[\s_.-])/.test(n)) return "plugins";
  if (/(?:^|[\s_.-])(themes?|palettes?|styles?|tokens?|skins?)(?:$|[\s_.-])/.test(n)) return "themes";
  if (/(?:^|[\s_.-])(design|figma|sketch|brand|ux|wireframes?|mockups?|vectors?)(?:$|[\s_.-])/.test(n)) return "design";
  if (/(?:^|[\s_.-])(fonts?|typography|typefaces?)(?:$|[\s_.-])/.test(n)) return "fonts";
  if (/(?:^|[\s_.-])(security|keys?|certs?|certificates?|ssh|gpg|vault|secrets?|auth|ssl)(?:$|[\s_.-])/.test(n)) return "security";
  if (/(?:^|[\s_.-])(crypto|web3|blockchain|contracts?|wallets?|solidity)(?:$|[\s_.-])/.test(n)) return "crypto";
  if (/(?:^|[\s_.-])(config|configs|configuration|settings|etc|\.config|\.vscode|\.idx)(?:$|[\s_.-])/.test(n)) return "config";
  if (/(?:^|[\s_.-])(src|lib|app|components|packages|server|core|shared|features|modules|crates|cmd|internal|pkg)(?:$|[\s_.-])/.test(n)) return "code";
  if (/(?:^|[\s_.-])(docs?|documentation|notes|guides|manuals|papers|books|wiki|readme|rfcs?)(?:$|[\s_.-])/.test(n)) return "docs";
  if (/(?:^|[\s_.-])(finance|invoices?|taxes|accounting|budget|billing|receipts?|ledger)(?:$|[\s_.-])/.test(n)) return "finance";
  if (/(?:^|[\s_.-])(legal|contracts?|licenses?|patents?|compliance|terms|privacy)(?:$|[\s_.-])/.test(n)) return "legal";
  if (/(?:^|[\s_.-])(logs?|telemetry|metrics|traces|audit|crash)(?:$|[\s_.-])/.test(n)) return "logs";
  if (/(?:^|[\s_.-])(temp|tmp|cache|\.cache|scratch|staging)(?:$|[\s_.-])/.test(n)) return "temp";
  if (/(?:^|[\s_.-])(trash|recycle|\.trash|deleted)(?:$|[\s_.-])/.test(n)) return "trash";
  if (/(?:^|[\s_.-])(downloads?|inbox|incoming)(?:$|[\s_.-])/.test(n)) return "downloads";
  if (/(?:^|[\s_.-])(db|databases?|sql|migrations|data|prisma|seeds|postgres|sqlite|bigquery)(?:$|[\s_.-])/.test(n)) return "database";
  if (/(?:^|[\s_.-])(cloud|sync|icloud|dropbox|drive|onedrive|shared|gcloud|s3|buckets?)(?:$|[\s_.-])/.test(n)) return "cloud";
  if (/(?:^|[\s_.-])(network|dns|vpn|proxy|nginx|caddy|sockets?|firewall)(?:$|[\s_.-])/.test(n)) return "network";
  if (/(?:^|[\s_.-])(system|os|kernel|drivers?|firmware|boot|usr|var|opt)(?:$|[\s_.-])/.test(n)) return "system";
  if (/(?:^|[\s_.-])(desktop)(?:$|[\s_.-])/.test(n)) return "desktop";
  if (/(?:^|[\s_.-])(home|users?)(?:$|[\s_.-])/.test(n)) return "home";
  if (/(?:^|[\s_.-])(archives?|backups?|dist|build|out|releases?|vendor|node_modules|target)(?:$|[\s_.-])/.test(n)) return "archive";
  return "general";
}

/** Resolves the rich semantic metadata entry from `SYSTEM_ICON_CATALOG` (120+ system icons) for any file or folder name. */
export function resolveSystemIcon(name, isDir = false) {
  const raw = String(name || "").trim();
  const lower = raw.toLowerCase();
  if (isDir) {
    const topic = classifyFolderTopic(raw);
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
  const s = String(name || "").trim();
  const lower = s.toLowerCase();
  const exact = EXACT_SYSTEM_ICON_BY_NAME.get(lower);
  if (exact?.kind && ICON_PACK_GLYPHS.default[exact.kind]) return exact.kind;
  const dot = lower.lastIndexOf(".");
  const ext = dot > 0 ? lower.slice(dot + 1) : "";
  return KIND_BY_EXT.get(ext) ?? "file";
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
      const topic = classifyFolderTopic(name);
      if (topic !== "general" && def.topics[topic]) return def.topics[topic];
    }
    if (!isDir && pack === "google_material_3d" && sysEntry?.google3d) {
      return sysEntry.google3d;
    }
    if (!isDir && sysEntry?.category === "exact" && (pack === "macos_tahoe_3d" || pack === "win11_fluent_pro" || pack === "pro_studio_xdr" || pack === "linux_papirus_pro" || pack === "us_holidays_festive" || pack === "nerd_rpg_arcane" || pack === "nerd_scifi_fleet" || pack === "nerd_hacker_retro" || pack === "horror_crypt" || pack === "realworld_objects")) {
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

/** Updates all visible `.row .c-icon` elements in place when the active Icon Pack changes. */
export function syncVisibleIcons(root = typeof document !== "undefined" ? document : null) {
  if (!root?.querySelectorAll) return;
  const pack = activeIconPackStyle();
  root.querySelectorAll(".row").forEach((row) => {
    const ico = row.querySelector(".c-icon");
    if (!ico) return;
    const isDir = row.classList.contains("is-folder") || row.dataset.isDir === "1";
    const name = row.dataset.entryName || row.querySelector(".name-text")?.textContent || "";
    const kind = classifyIconKind(name, isDir);
    const sysEntry = resolveSystemIcon(name, isDir);
    ico.dataset.iconKind = kind;
    ico.dataset.isFolder = isDir ? "1" : "0";
    row.dataset.iconKind = kind;
    if (sysEntry?.id) {
      ico.dataset.systemIcon = sysEntry.id;
    }
    if (isDir) {
      const topic = classifyFolderTopic(name);
      row.dataset.folderTopic = topic;
      ico.dataset.folderTopic = topic;
    }
    if (pack === "default") {
      ico.textContent = row.dataset.defaultIcon || iconFor(name, isDir, "default");
    } else {
      ico.textContent = iconFor(name, isDir, pack);
    }
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
