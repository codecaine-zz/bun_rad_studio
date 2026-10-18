/**
 * Project overview for the Dev tab: recognizes the kinds of project in a folder from their manifests and shows a
 * summary card for each. Read only: manifests are parsed (never run), each read is size-capped, nothing is fetched
 * from the network, and `.env` files are listed by name only (their contents are never read).
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { detectLicense, parseTomlLite, readText } from "./fmDevManifest";

export interface ProjectCard {
  id: string;
  title: string;
  icon: string;
  facts: Array<[string, string]>;
  lists: Array<{ label: string; items: string[] }>;
  /** Scripts the page can offer to run (Node/Bun), and the program that runs them. */
  scripts?: Array<{ name: string; command: string }>;
  runner?: string;
}

export interface ProjectInfo {
  root: string;
  cards: ProjectCard[];
  /** Names of the things found at the top of the folder (for the page's "nothing recognized" message). */
  topLevel: number;
}

const MAX_LIST = 40;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const keyCount = (o: unknown) => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o as object).length : 0);
const card = (id: string, title: string, icon: string, facts: Array<[string, string | number | undefined | null | false]>, lists: ProjectCard["lists"] = []): ProjectCard => ({
  id, title, icon, facts: facts.filter((f): f is [string, string | number] => f[1] !== undefined && f[1] !== null && f[1] !== false && f[1] !== "").map(([k, v]) => [k, String(v)]), lists: lists.filter((l) => l.items.length > 0),
});

async function nodeCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const raw = await readText(nodePath.join(root, "package.json"));
  if (raw === null) return null;
  let pkg: Record<string, any> = {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) pkg = parsed;
  } catch {
    // an unreadable manifest still gets a card
  }
  const deps = { ...pkg.devDependencies, ...pkg.dependencies } as Record<string, string>;
  const lock = names.has("bun.lock") || names.has("bun.lockb") ? "bun" : names.has("pnpm-lock.yaml") ? "pnpm" : names.has("yarn.lock") ? "yarn" : names.has("package-lock.json") ? "npm" : null;
  const manager = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : null;
  const runner = lock ?? manager ?? (names.has("bunfig.toml") || pkg.engines?.bun ? "bun" : "npm");
  const scripts = pkg.scripts && typeof pkg.scripts === "object" ? Object.entries(pkg.scripts as Record<string, unknown>).filter(([, v]) => typeof v === "string").slice(0, 80).map(([name, command]) => ({ name, command: String(command).slice(0, 300) })) : [];
  const testRunner = ["vitest", "jest", "mocha", "ava", "tap", "@playwright/test", "playwright", "cypress", "jasmine"].find((d) => d in deps) ?? (/\bbun test\b/.test(String(pkg.scripts?.test ?? "")) || names.has("bunfig.toml") ? "bun test" : null);
  const ts = names.has("tsconfig.json") || "typescript" in deps;
  const tsconfig = names.has("tsconfig.json") ? await readText(nodePath.join(root, "tsconfig.json")) : null;
  const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : Array.isArray(pkg.workspaces?.packages) ? pkg.workspaces.packages : [];
  const engines = pkg.engines && typeof pkg.engines === "object" ? Object.entries(pkg.engines as Record<string, unknown>).map(([k, v]) => `${k} ${String(v)}`) : [];
  const c = card("node", runner === "bun" ? "Node / Bun" : "Node.js", "🟩", [
    ["Package", [pkg.name, pkg.version].filter((v) => typeof v === "string").join(" ")],
    ["Module type", typeof pkg.type === "string" ? pkg.type : "commonjs (default)"],
    ["Dependencies", plural(keyCount(pkg.dependencies), "package")],
    ["Dev dependencies", plural(keyCount(pkg.devDependencies), "package")],
    ["Lockfile", lock ? `${lock}${names.has("bun.lockb") ? " (binary)" : ""}` : "none found"],
    ["Package manager", manager ?? undefined],
    ["TypeScript", ts ? `yes${tsconfig && /"strict"\s*:\s*true/.test(tsconfig) ? ", strict" : ""}` : "no"],
    ["Test runner", testRunner ?? "none detected"],
    ["Private", pkg.private === true ? "yes" : undefined],
    ["License", typeof pkg.license === "string" ? pkg.license : undefined],
  ], [
    { label: "Workspaces", items: workspaces.filter((w: unknown) => typeof w === "string").slice(0, MAX_LIST) },
    { label: "Engines", items: engines },
  ]);
  c.scripts = scripts;
  c.runner = runner;
  return c;
}

async function cargoCard(root: string): Promise<ProjectCard | null> {
  const raw = await readText(nodePath.join(root, "Cargo.toml"));
  if (raw === null) return null;
  const t = parseTomlLite(raw);
  const pkg = t.package ?? t["workspace.package"] ?? {};
  const members = t.workspace?.members;
  return card("rust", "Rust", "🦀", [
    ["Package", [pkg.name, pkg.version].filter((v) => typeof v === "string").join(" ")],
    ["Edition", typeof pkg.edition === "string" ? pkg.edition : undefined],
    ["Dependencies", plural(keyCount(t.dependencies) + keyCount(t["workspace.dependencies"]), "crate")],
    ["Dev dependencies", plural(keyCount(t["dev-dependencies"]), "crate")],
    ["License", typeof pkg.license === "string" ? pkg.license : undefined],
  ], [{ label: "Workspace members", items: Array.isArray(members) ? members.slice(0, MAX_LIST) : [] }]);
}

async function goCard(root: string): Promise<ProjectCard | null> {
  const raw = await readText(nodePath.join(root, "go.mod"));
  if (raw === null) return null;
  const requires = (raw.match(/^require\s*\(([\s\S]*?)\)/gm) ?? []).flatMap((b) => b.split("\n").slice(1, -1)).filter((l) => l.trim() && !l.trim().startsWith("//")).length + (raw.match(/^require[ \t]+[^\s(]\S*[ \t]+\S+/gm) ?? []).length;
  return card("go", "Go", "🐹", [
    ["Module", /^module\s+(\S+)/m.exec(raw)?.[1]],
    ["Go version", /^go\s+(\S+)/m.exec(raw)?.[1]],
    ["Toolchain", /^toolchain\s+(\S+)/m.exec(raw)?.[1]],
    ["Requirements", requires ? plural(requires, "module") : undefined],
  ]);
}

async function pythonCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const hasAny = ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile"].some((n) => names.has(n)) || [...names].some((n) => /^requirements.*\.txt$/.test(n));
  if (!hasAny) return null;
  const facts: Array<[string, string | undefined]> = [];
  const lists: ProjectCard["lists"] = [];
  const py = names.has("pyproject.toml") ? parseTomlLite((await readText(nodePath.join(root, "pyproject.toml"))) ?? "") : null;
  if (py) {
    const proj = py.project ?? py["tool.poetry"] ?? {};
    facts.push(["Project", [proj.name, proj.version].filter((v) => typeof v === "string").join(" ")], ["Python", typeof proj["requires-python"] === "string" ? proj["requires-python"] : undefined]);
    const deps = Array.isArray(proj.dependencies) ? proj.dependencies.length : keyCount(py["tool.poetry.dependencies"]);
    if (deps) facts.push(["Dependencies", plural(deps, "package")]);
    const backend = py["build-system"]?.["build-backend"];
    if (typeof backend === "string") facts.push(["Build backend", backend]);
    const tools = Object.keys(py).filter((k) => k.startsWith("tool.") && k.split(".").length === 2).map((k) => k.slice(5));
    lists.push({ label: "Configured tools", items: tools.slice(0, MAX_LIST) });
  }
  const reqFiles = [...names].filter((n) => /^requirements.*\.txt$/.test(n)).sort();
  for (const f of reqFiles.slice(0, 5)) {
    const text = await readText(nodePath.join(root, f));
    if (text !== null) facts.push([f, plural(text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("-")).length, "requirement")]);
  }
  const venv = [".venv", "venv", "env"].find((n) => names.has(n));
  let hasVenv = false;
  if (venv) hasVenv = await fsp.lstat(nodePath.join(root, venv, "pyvenv.cfg")).then(() => true, () => false);
  facts.push(["Virtual environment", hasVenv ? `${venv}/` : "none found"]);
  const other = ["setup.py", "setup.cfg", "Pipfile", "poetry.lock", "uv.lock", "tox.ini", "pytest.ini"].filter((n) => names.has(n));
  facts.push(["Other files", other.join(", ") || undefined]);
  return card("python", "Python", "🐍", facts, lists);
}

async function vCard(root: string): Promise<ProjectCard | null> {
  const raw = await readText(nodePath.join(root, "v.mod"));
  if (raw === null) return null;
  const field = (k: string) => new RegExp(`${k}\\s*:\\s*['"]([^'"]*)['"]`).exec(raw)?.[1];
  const deps = /dependencies\s*:\s*\[([^\]]*)\]/.exec(raw)?.[1]?.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean) ?? [];
  return card("v", "V", "🅥", [["Module", field("name")], ["Version", field("version")], ["Description", field("description")], ["License", field("license")]], [{ label: "Dependencies", items: deps.slice(0, MAX_LIST) }]);
}

async function jvmCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const gradle = ["build.gradle", "build.gradle.kts"].find((n) => names.has(n));
  if (!names.has("pom.xml") && !gradle) return null;
  const facts: Array<[string, string | undefined]> = [];
  if (names.has("pom.xml")) {
    const pom = (await readText(nodePath.join(root, "pom.xml"))) ?? "";
    const body = pom.replace(/<parent>[\s\S]*?<\/parent>/, "").replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/, "");
    const tag = (t: string) => new RegExp(`<${t}>([^<]+)</${t}>`).exec(body)?.[1]?.trim();
    facts.push(["Maven", [tag("groupId"), tag("artifactId"), tag("version")].filter(Boolean).join(":")], ["Dependencies", plural((pom.match(/<dependency>/g) ?? []).length, "dependency").replace("dependencys", "dependencies")]);
  }
  if (gradle) {
    const text = (await readText(nodePath.join(root, gradle))) ?? "";
    const plugins = ["java", "kotlin", "application", "android", "spring", "scala", "groovy"].filter((p) => new RegExp(`['"(]\\s*(?:org\\.jetbrains\\.)?${p}|id\\(?\\s*['"][^'"]*${p}`, "i").test(text) || new RegExp(`\\b${p}\\b`, "i").test(text.split("\n").filter((l) => /plugin|apply|id/.test(l)).join("\n")));
    facts.push(["Gradle", gradle], ["Plugins seen", plugins.join(", ") || undefined], ["Wrapper", names.has("gradlew") ? "gradlew present" : "none"]);
  }
  const kotlin = names.has("build.gradle.kts") || [...names].some((n) => n.endsWith(".kt"));
  return card("jvm", kotlin ? "Java / Kotlin" : "Java", "☕", facts);
}

async function dotnetCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const projects = [...names].filter((n) => /\.(csproj|fsproj|vbproj)$/.test(n)).sort();
  const solutions = [...names].filter((n) => /\.(sln|slnx)$/.test(n)).sort();
  if (!projects.length && !solutions.length) return null;
  const frameworks = new Set<string>();
  for (const p of projects.slice(0, 5)) {
    const text = (await readText(nodePath.join(root, p))) ?? "";
    for (const m of text.matchAll(/<TargetFrameworks?>([^<]+)<\/TargetFrameworks?>/g)) for (const f of m[1]!.split(";")) frameworks.add(f.trim());
  }
  return card("dotnet", ".NET", "🟪", [["Target frameworks", [...frameworks].join(", ")]], [{ label: "Solutions", items: solutions }, { label: "Projects", items: projects.slice(0, MAX_LIST) }]);
}

async function phpCard(root: string): Promise<ProjectCard | null> {
  const raw = await readText(nodePath.join(root, "composer.json"));
  if (raw === null) return null;
  let c: Record<string, any> = {};
  try {
    c = JSON.parse(raw) ?? {};
  } catch {
    // keep what we have
  }
  const require = c.require && typeof c.require === "object" ? (c.require as Record<string, string>) : {};
  return card("php", "PHP", "🐘", [["Package", typeof c.name === "string" ? c.name : undefined], ["PHP", require.php], ["Dependencies", plural(Object.keys(require).filter((k) => k !== "php" && !k.startsWith("ext-")).length, "package")], ["Dev dependencies", plural(keyCount(c["require-dev"]), "package")], ["License", typeof c.license === "string" ? c.license : undefined]]);
}

async function rubyCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const raw = await readText(nodePath.join(root, "Gemfile"));
  const gemspec = [...names].find((n) => n.endsWith(".gemspec"));
  if (raw === null && !gemspec) return null;
  return card("ruby", "Ruby", "💎", [["Gems in Gemfile", raw === null ? undefined : String((raw.match(/^\s*gem\s+['"]/gm) ?? []).length)], ["Ruby", raw === null ? undefined : /^\s*ruby\s+['"]([^'"]+)['"]/m.exec(raw)?.[1]], ["Gemspec", gemspec], ["Lockfile", names.has("Gemfile.lock") ? "Gemfile.lock" : undefined]]);
}

async function swiftCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const raw = await readText(nodePath.join(root, "Package.swift"));
  const xcode = [...names].filter((n) => /\.(xcodeproj|xcworkspace)$/.test(n));
  if (raw === null && !xcode.length) return null;
  return card("swift", "Swift", "🕊️", [["Package", raw === null ? undefined : /name:\s*"([^"]+)"/.exec(raw)?.[1]], ["Swift tools", raw === null ? undefined : /swift-tools-version:\s*([\d.]+)/.exec(raw)?.[1]], ["Dependencies", raw === null ? undefined : plural((raw.match(/\.package\(/g) ?? []).length, "package")], ["CocoaPods", names.has("Podfile") ? "Podfile" : undefined]], [{ label: "Xcode", items: xcode }]);
}

async function cCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const found = ["CMakeLists.txt", "Makefile", "makefile", "GNUmakefile", "meson.build", "configure.ac", "Package.swift"].filter((n) => names.has(n) && n !== "Package.swift");
  if (!found.length) return null;
  const cmake = names.has("CMakeLists.txt") ? ((await readText(nodePath.join(root, "CMakeLists.txt"))) ?? "") : "";
  return card("c", "C / C++ build", "🛠️", [["Build files", found.join(", ")], ["CMake project", /^\s*project\s*\(\s*([\w.+-]+)/im.exec(cmake)?.[1]], ["CMake minimum", /cmake_minimum_required\s*\(\s*VERSION\s+([\d.]+)/i.exec(cmake)?.[1]]]);
}

async function dockerCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const files = [...names].filter((n) => /^(Dockerfile|Containerfile)(\..+)?$/.test(n) || /^(docker-)?compose(\..+)?\.ya?ml$/.test(n)).sort();
  if (!files.length) return null;
  const images: string[] = [];
  const services: string[] = [];
  for (const f of files.slice(0, 6)) {
    const text = (await readText(nodePath.join(root, f))) ?? "";
    if (/compose/.test(f)) {
      const block = /^services:\s*\n((?:[ \t]+.*\n?|\s*\n)*)/m.exec(text)?.[1] ?? "";
      for (const m of block.matchAll(/^ {2}([\w.-]+):\s*$/gm)) services.push(m[1]!);
    } else for (const m of text.matchAll(/^FROM\s+(?:--\S+\s+)*(\S+)/gim)) images.push(m[1]!);
  }
  return card("docker", "Docker", "🐳", [["Files", files.join(", ")]], [{ label: "Base images", items: [...new Set(images)].slice(0, MAX_LIST) }, { label: "Compose services", items: [...new Set(services)].slice(0, MAX_LIST) }]);
}

async function makeCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const file = ["Makefile", "makefile", "GNUmakefile", "justfile", "Justfile"].find((n) => names.has(n));
  if (!file) return null;
  const text = (await readText(nodePath.join(root, file))) ?? "";
  const targets = [...new Set([...text.matchAll(/^([A-Za-z0-9_][A-Za-z0-9_.-]*)\s*:(?![=])/gm)].map((m) => m[1]!))];
  return card("make", file.toLowerCase().includes("just") ? "Just recipes" : "Make targets", "🎯", [["File", file]], [{ label: "Targets", items: targets.slice(0, MAX_LIST) }]);
}

async function ciCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const lists: ProjectCard["lists"] = [];
  const found: string[] = [];
  if (names.has(".github")) {
    try {
      const dir = nodePath.join(root, ".github", "workflows");
      const items: string[] = [];
      for (const f of (await fsp.readdir(dir)).filter((n) => /\.ya?ml$/.test(n)).sort().slice(0, 30)) {
        const text = (await readText(nodePath.join(dir, f))) ?? "";
        const title = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
        items.push(title && title !== f ? `${title} (${f})` : f);
      }
      lists.push({ label: "GitHub Actions workflows", items });
      if (items.length) found.push("GitHub Actions");
    } catch {
      // no workflows folder
    }
  }
  for (const [file, label] of [[".gitlab-ci.yml", "GitLab CI"], ["azure-pipelines.yml", "Azure Pipelines"], ["Jenkinsfile", "Jenkins"], [".travis.yml", "Travis CI"], ["bitbucket-pipelines.yml", "Bitbucket Pipelines"], ["appveyor.yml", "AppVeyor"]] as const) if (names.has(file)) found.push(label);
  if (names.has(".circleci")) found.push("CircleCI");
  return found.length ? card("ci", "Continuous integration", "🔁", [["Systems", found.join(", ")]], lists) : null;
}

async function filesCard(root: string, names: Set<string>): Promise<ProjectCard | null> {
  const facts: Array<[string, string | undefined]> = [];
  const lists: ProjectCard["lists"] = [];
  const readme = [...names].filter((n) => /^readme(\.\w+)?$/i.test(n)).sort()[0];
  if (readme) facts.push(["README", readme]);
  const licenseFile = [...names].filter((n) => /^(licen[sc]e|copying|unlicense)(\.\w+)?$/i.test(n)).sort()[0];
  if (licenseFile) {
    const text = await readText(nodePath.join(root, licenseFile));
    facts.push(["License file", `${licenseFile}${text ? ` — ${detectLicense(text) ?? "type not recognized"}` : ""}`]);
  } else facts.push(["License file", "none found"]);
  if (names.has(".editorconfig")) {
    const text = (await readText(nodePath.join(root, ".editorconfig"))) ?? "";
    const pick = (k: string) => new RegExp(`^\\s*${k}\\s*=\\s*(\\S+)`, "mi").exec(text)?.[1];
    facts.push([".editorconfig", [pick("indent_style"), pick("indent_size") && `size ${pick("indent_size")}`, pick("end_of_line"), pick("charset")].filter(Boolean).join(", ") || "present"]);
  }
  const owners = [["CODEOWNERS"], [".github", "CODEOWNERS"], ["docs", "CODEOWNERS"]].map((p) => p.join("/")).filter((p) => (p.includes("/") ? names.has(p.split("/")[0]!) : names.has(p)));
  for (const rel of owners) {
    const text = await readText(nodePath.join(root, ...rel.split("/")));
    if (text !== null) {
      facts.push(["CODEOWNERS", `${rel} — ${plural(text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length, "rule")}`]);
      break;
    }
  }
  const env = [...names].filter((n) => /^\.env(\..+)?$|^\.envrc$/.test(n)).sort();
  if (env.length) lists.push({ label: "Environment files (names only, contents are never read)", items: env });
  const pins = [".nvmrc", ".node-version", ".tool-versions", ".python-version", ".ruby-version", ".java-version", "rust-toolchain", "rust-toolchain.toml", "go.work", ".bun-version"].filter((n) => names.has(n));
  if (pins.length) lists.push({ label: "Version pin files", items: pins });
  if (names.has(".gitignore")) facts.push([".gitignore", "present"]);
  return facts.length || lists.length ? card("files", "Project files", "📋", facts, lists) : null;
}

/** `dev/project`: what kinds of project the folder holds, with a summary card each. */
export async function projectInfo(root: string): Promise<ProjectInfo> {
  let entries: string[] = [];
  try {
    entries = (await fsp.readdir(root)).slice(0, 5000);
  } catch {
    // an unreadable folder has nothing to show
  }
  const names = new Set(entries);
  const builders: Array<Promise<ProjectCard | null>> = [nodeCard(root, names), cargoCard(root), goCard(root), pythonCard(root, names), vCard(root), jvmCard(root, names), dotnetCard(root, names), phpCard(root), rubyCard(root, names), swiftCard(root, names), cCard(root, names), dockerCard(root, names), makeCard(root, names), ciCard(root, names), filesCard(root, names)];
  const cards = (await Promise.all(builders.map((p) => p.catch(() => null)))).filter((c): c is ProjectCard => !!c);
  return { root, cards, topLevel: entries.length };
}
