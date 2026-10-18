/**
 * Builds SHOWCASE.md, a picture-led page that presents every application, from the screenshots in screenshots/apps/
 * and the launcher's descriptions (KNOWN_STUDIO_META). It is meant for sharing: put it on a website, a README or a
 * post. Everything in it is generated, so it cannot drift from the screenshots or the app list.
 *
 *   bun run showcase          write SHOWCASE.md
 *   bun run showcase:check    fail if SHOWCASE.md is out of date (also run by the tests)
 *
 * An app appears when it has a screenshot named `<name>_desktop.png`, where <name> is its file name without `.ts`,
 * or without `_studio`. Apps that are the same window under another name (identical pictures) are listed once.
 */
import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { KNOWN_STUDIO_META } from "../applications/launcher_studio";

const ROOT = join(import.meta.dir, "..");
const SHOTS = join(ROOT, "screenshots", "apps");
const OUT = join(ROOT, "SHOWCASE.md");

const GUIDES = readdirSync(join(ROOT, "docs", "userguides")).filter((f) => /^\d+_.+\.md$/.test(f));
const SCRIPTS: Record<string, string> = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;

/** Category order and a one-line promise for each. */
const CATEGORIES: Array<[string, string]> = [
  ["File & Directory Tools", "Find, clean, move and understand the files on your computer."],
  ["Developer Tools", "Everything a developer reaches for, in one window each."],
  ["Database & Storage", "Look inside and work with SQLite, MySQL, PostgreSQL and Redis."],
  ["Network & Cloud", "See what the network is doing and where it leads."],
  ["Security & Crypto", "Hashes, keys, secrets and encryption without the command line."],
  ["System & Hardware", "Know what your machine is running and keep it tidy."],
  ["Productivity & Text", "Write, convert, calculate and keep time."],
  ["Design & Media", "Color, drawing and design tokens."],
  ["Design & UX", "Build the interface itself."],
  ["RAD Studio", "The visual designer and the tools around it."],
  ["Games & Entertainment", "Quick, polished games for a break."],
];

function slug(s: string): string {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(stem: string): string {
  return stem.replace(/_studio$/, "").split("_").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}

/** Application files that open the same window under another name (the package scripts may use either). */
const ALIASES: Record<string, string[]> = {
  jq_studio: ["json_studio"], json_studio: ["jq_studio"], watchexec_studio: ["watcher_studio"], watcher_studio: ["watchexec_studio"],
  omnitool_studio: ["devtools_studio"], devtools_studio: ["omnitool_studio"], task_manager: ["process_studio"], process_studio: ["task_manager"],
  sqlite_studio: ["database_studio"], brew_studio: ["system_studio"], system_studio: ["brew_studio"],
};

/** `bun run app:xxx` for an application file (or an alias of it): the shortest script that runs it. */
function runCommand(file: string): string | null {
  for (const f of [file, ...(ALIASES[file] ?? [])]) {
    const target = `bun run applications/${f}.ts`;
    const names = Object.entries(SCRIPTS).filter(([n, cmd]) => n.startsWith("app:") && cmd === target).map(([n]) => n).sort((a, b) => a.length - b.length || a.localeCompare(b));
    if (names[0]) return `bun run ${names[0]}`;
  }
  return null;
}

function guideFor(file: string): string | null {
  const short = file.replace(/_studio$/, "");
  const alias: Record<string, string> = { jq_studio: "json_query", json_studio: "json_query", sqlite_studio: "sqlite_studio", brew_studio: "system_package", system_studio: "system_package", task_manager: "process_monitor", process_studio: "process_monitor", interval_timer_studio: "interval_timer", devtools_studio: "devtools", omnitool_studio: "devtools", watcher_studio: "task_watcher", watchexec_studio: "watchexec", network_studio: "network_forensics", git_studio: "git_workbench", color_studio: "color_token", env_studio: "environment_vault", dataconvert_studio: "data_converter", world_time_zones_studio: "world_time_zones", dr_codecaine_studio: "dr_codecaine", codecaine_bros_studio: "codecaine_bros", rodents_revenge_studio: "rodents_revenge", pacman_studio: "pacman", pong_studio: "pong", word_search_studio: "word_search", lolo_studio: "lolo", maze_generator_studio: "maze_generator", tictactoe_studio: "tictactoe", connect4_studio: "connect4" };
  const keys = [alias[file], file, short].filter(Boolean) as string[];
  for (const k of keys) {
    const hit = GUIDES.find((g) => g.replace(/^\d+_/, "").replace(/\.md$/, "").startsWith(k) || g.replace(/^\d+_/, "").replace(/\.md$/, "") === k);
    if (hit) return `docs/userguides/${hit}`;
  }
  return null;
}

/** When several app files show the same window, this one is the name to present. */
const PREFERRED = new Set(["sqlite_studio", "jq_studio", "watchexec_studio", "omnitool_studio", "task_manager"]);

/** Apps the launcher's table does not describe (or describes too thinly for a promotion). */
const OVERRIDES: Record<string, { name: string; icon: string; category: string; description: string }> = {
  launcher_studio: { name: "Launcher Studio Pro", icon: "🚀", category: "RAD Studio", description: "The home screen of the toolbox: search, favorite and open any application with one click, with history and categories" },
};

export interface Entry { file: string; name: string; icon: string; category: string; description: string; image: string; command: string | null; guide: string | null; hash: string }

export function collect(): Entry[] {
  const all: Entry[] = [];
  const files = readdirSync(join(ROOT, "applications")).filter((f) => f.endsWith("_studio.ts") || f === "task_manager.ts").map((f) => f.replace(/\.ts$/, "")).sort();
  for (const file of files) {
    const short = file.replace(/_studio$/, "");
    const image = [`${file}_desktop.png`, `${short}_desktop.png`].find((n) => existsSync(join(SHOTS, n)));
    if (!image) continue;
    const hash = createHash("sha1").update(readFileSync(join(SHOTS, image))).digest("hex");
    const meta = OVERRIDES[file] ? { displayName: OVERRIDES[file]!.name, ...OVERRIDES[file]! } : ((KNOWN_STUDIO_META as Record<string, any>)[file] ?? (KNOWN_STUDIO_META as Record<string, any>)[short]);
    all.push({
      file, image: `screenshots/apps/${image}`,
      name: meta?.displayName ?? meta?.name ?? titleCase(file),
      icon: meta?.icon ?? "",
      category: meta?.category ?? "Developer Tools",
      description: meta?.description ?? "",
      command: runCommand(file),
      guide: guideFor(file),
      hash,
    });
  }
  // The visual designer is not an `applications/` file: its picture is the one in the repository root.
  if (existsSync(join(ROOT, "screenshot.png"))) {
    all.push({
      file: "designer", image: "screenshot.png", name: "Visual Form Designer", icon: "🖌️", category: "RAD Studio",
      description: "Drag and drop a form together like Delphi or Visual Basic, set every property, and export a ready-to-run Bun project",
      command: "bun run start", guide: "docs/visual-designer/index.md", hash: createHash("sha1").update(readFileSync(join(ROOT, "screenshot.png"))).digest("hex"),
    });
  }
  // The same window under two names is shown once, under the preferred name.
  const byHash = new Map<string, Entry[]>();
  for (const e of all) byHash.set(e.hash, [...(byHash.get(e.hash) ?? []), e]);
  const keep = new Set<string>();
  for (const group of byHash.values()) keep.add((group.find((e) => PREFERRED.has(e.file)) ?? group[0]!).file);
  return all.filter((e) => keep.has(e.file));
}

export function buildShowcase(): string {
  const entries = collect();
  const byCategory = new Map<string, Entry[]>();
  for (const e of entries) byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e]);
  const known = CATEGORIES.map(([c]) => c);
  const order = [...known.filter((c) => byCategory.has(c)), ...[...byCategory.keys()].filter((c) => !known.includes(c)).sort()];

  const L: string[] = [];
  L.push("# Bun RAD Studio: the applications");
  L.push("");
  L.push(`**${entries.length} desktop applications** in one toolbox: databases, developer tools, file tools, system monitors, productivity and games. Each one is a real window, runs on your own computer, has no accounts and no cloud, shares one set of 60+ themes, and explains every button when you hover over it.`);
  L.push("");
  L.push("> Install once, then open any of them from the **Launcher** (`bun run app:launcher`), or run its command below.");
  L.push("");
  L.push("## Contents");
  L.push("");
  L.push("- [Featured: the File Manager](#featured-the-file-manager)");
  for (const c of order) L.push(`- [${c}](#${slug(c)}) (${byCategory.get(c)!.length})`);
  L.push("");

  // Featured
  const fm = ["desktop", "convert", "terminal", "responsive", "databases", "themes"].every((k) => existsSync(join(SHOTS, `file_manager_studio_${k}.png`)));
  if (fm) {
    L.push("## Featured: the File Manager");
    L.push("");
    L.push("An easy, safe file manager for macOS, Windows and Linux. A sidebar and address bar anyone can read, previews, drag and drop, an undoable Recycle Bin, **batch conversion of pictures, video, sound and documents**, and a **terminal that opens in the folder you are looking at**.");
    L.push("");
    L.push("| Browse and preview | Convert in batches |");
    L.push("| :--- | :--- |");
    L.push("| ![The File Manager showing a selected picture and its preview](screenshots/apps/file_manager_studio_desktop.png) | ![The Convert and process window listing what can be done with three selected pictures](screenshots/apps/file_manager_studio_convert.png) |");
    L.push("| **Terminal in the current folder** | **Fits a smaller window** |");
    L.push("| ![The File Manager with its terminal open](screenshots/apps/file_manager_studio_terminal.png) | ![The File Manager in a narrow window](screenshots/apps/file_manager_studio_responsive.png) |");
    L.push("| **Databases, one click away** | **Edit Redis keys in place** |");
    L.push("| ![The Databases tool with a Redis connection that was found automatically](screenshots/apps/file_manager_studio_databases.png) | ![Redis Studio editing the score of a sorted-set member](screenshots/apps/redis_studio_editing.png) |");
    L.push("| **Enhanced themes: glass, glow, motion and texture** | |");
    L.push("| ![The File Manager theme gallery filtered to enhanced themes with special effects](screenshots/apps/file_manager_studio_themes.png) | |");
    L.push("");
    L.push("`bun run app:files`  ·  [User guide](docs/userguides/43_file_manager.md)");
    L.push("");
  }

  for (const c of order) {
    const promise = CATEGORIES.find(([n]) => n === c)?.[1];
    L.push(`## ${c}`);
    L.push("");
    if (promise) { L.push(`_${promise}_`); L.push(""); }
    for (const e of byCategory.get(c)!) {
      L.push(`### ${e.icon ? `${e.icon} ` : ""}${e.name}`);
      L.push("");
      if (e.description) { L.push(e.description.replace(/\s*\.?$/, ".")); L.push(""); }
      L.push(`![${e.name}](${e.image})`);
      L.push("");
      const bits = [e.command ? `\`${e.command}\`` : null, e.guide ? `[User guide](${e.guide})` : null].filter(Boolean);
      if (bits.length) { L.push(bits.join("  ·  ")); L.push(""); }
    }
  }
  L.push("---");
  L.push("");
  L.push("_This page is generated by `bun run showcase` from the screenshots in `screenshots/apps/`. To refresh the pictures, see `scripts/capture_app_screenshots.ts` and `scripts/capture_extra_screenshots.ts`._");
  L.push("");
  return L.join("\n");
}

if (import.meta.main) {
  const text = buildShowcase();
  if (process.argv.includes("--check")) {
    const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (current !== text) {
      console.error("SHOWCASE.md is out of date. Run: bun run showcase");
      process.exit(1);
    }
    console.log("SHOWCASE.md is up to date.");
  } else {
    writeFileSync(OUT, text);
    console.log(`Wrote SHOWCASE.md with ${text.match(/^### /gm)?.length ?? 0} applications.`);
  }
  process.exit(0);
}
