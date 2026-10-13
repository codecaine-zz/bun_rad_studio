import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";

/**
 * Documentation checks (no network needed):
 *  - every internal link and #anchor resolves
 *  - every page under docs/ is listed in docs/nav.json, and every nav entry exists
 *  - code fences are balanced; each page has exactly one H1
 *  - no accidental secrets
 * External links are only checked with --external, and failures are warnings (never fail the run).
 */

export interface Issue {
  file: string;
  line: number;
  kind: "link" | "anchor" | "nav" | "orphan" | "fence" | "heading" | "secret" | "external" | "command";
  message: string;
  severity: "error" | "warning";
}

export const ROOT = resolve(import.meta.dir, "..", "..");
export const DOCS = join(ROOT, "docs");

export function walkMarkdown(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkMarkdown(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** GitHub-style heading slug: lowercase, drop punctuation/emoji, spaces to hyphens. */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

interface Parsed {
  headings: { level: number; text: string; line: number }[];
  anchors: Set<string>;
  links: { target: string; line: number; image: boolean }[];
  fenceProblems: number[];
  lines: string[];
  codeLines: Set<number>;
}

export function parseMarkdown(text: string): Parsed {
  const lines = text.split("\n");
  const headings: Parsed["headings"] = [];
  const links: Parsed["links"] = [];
  const codeLines = new Set<number>();
  const fenceProblems: number[] = [];
  let fence: { marker: string; line: number } | null = null;
  lines.forEach((raw, i) => {
    const line = i + 1;
    const m = /^\s*(```+|~~~+)/.exec(raw);
    if (m) {
      const marker = m[1]![0]!.repeat(3);
      if (!fence) fence = { marker, line };
      else if (raw.trim().startsWith(fence.marker)) fence = null;
      codeLines.add(line);
      return;
    }
    if (fence) {
      codeLines.add(line);
      return;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw);
    if (h) headings.push({ level: h[1]!.length, text: h[2]!, line });
    // strip inline code before looking for links
    const noCode = raw.replace(/`[^`]*`/g, (s) => " ".repeat(s.length));
    const re = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let lm: RegExpExecArray | null;
    while ((lm = re.exec(noCode))) links.push({ target: lm[3]!, line, image: lm[1] === "!" });
    const htmlRe = /<(?:a|img)\b[^>]*?(?:href|src)="([^"]+)"/gi;
    while ((lm = htmlRe.exec(noCode))) links.push({ target: lm[1]!, line, image: false });
  });
  if (fence) fenceProblems.push((fence as { line: number }).line);
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  for (const h of headings) {
    const base = slugify(h.text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  // explicit anchors
  for (const m of text.matchAll(/<a\s+(?:name|id)="([^"]+)"/gi)) anchors.add(m[1]!);
  return { headings, anchors, links, fenceProblems, lines, codeLines };
}

const PLACEHOLDER = /^(your|example|placeholder|changeme|change-me|secret|password|passwd|xxx+|\*+|<|\$|\{|env|\.\.\.|redacted|choose|test|dummy|fake|sample|my[-_]|s3cret|hunter2$)/i;
const SECRET_PATTERNS: { re: RegExp; what: string }[] = [
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, what: "private key" },
  { re: /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/, what: "GitHub token" },
  { re: /\bAKIA[0-9A-Z]{16}\b/, what: "AWS access key id" },
  { re: /\bsk-[A-Za-z0-9]{32,}\b/, what: "API key" },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, what: "Slack token" },
];
const ASSIGN = /\b(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*["']?([^\s"'<>`,;)]{8,})/i;
const URL_PW = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:([^\s@/]{4,})@/i;

export function findSecrets(lines: string[]): { line: number; what: string }[] {
  const found: { line: number; what: string }[] = [];
  lines.forEach((l, i) => {
    for (const p of SECRET_PATTERNS) if (p.re.test(l)) found.push({ line: i + 1, what: p.what });
    const a = ASSIGN.exec(l);
    if (a && !PLACEHOLDER.test(a[1]!) && !/[(]/.test(a[1]!) && !/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(a[1]!)) found.push({ line: i + 1, what: "password/secret-looking assignment" });
    const u = URL_PW.exec(l);
    if (u && !PLACEHOLDER.test(u[1]!)) found.push({ line: i + 1, what: "password inside a URL" });
  });
  return found;
}

/** Placeholders that are written on purpose in examples and are not real scripts or files. */
// `build-app` is a script of the separate bun_webview repository that the README tells you to clone.
const COMMAND_PLACEHOLDERS = new Set(["app.ts", "./path", "app:", "build-app"]);
const BUILT_IN_BUN_COMMANDS = new Set(["start", "test", "build"]);

/**
 * Finds `bun run <name>` examples whose script is not in package.json or whose file does not exist, so a renamed
 * script or moved file cannot leave a command in the handbook that no longer works.
 */
export function findCommandProblems(lines: string[], scripts: Set<string>, fileExists: (path: string) => boolean): { line: number; command: string; what: string }[] {
  const found: { line: number; command: string; what: string }[] = [];
  lines.forEach((text, i) => {
    for (const m of text.matchAll(/\bbun run ([A-Za-z0-9:_\-./<>]+)/g)) {
      const name = m[1]!.replace(/\.$/, "");
      if (COMMAND_PLACEHOLDERS.has(name) || name.includes("<") || name.endsWith(":") || name.startsWith("-")) continue;
      if (/\.(ts|js|tsx|mjs)$/.test(name) || name.includes("/")) {
        if (!fileExists(name.replace(/^\.\//, ""))) found.push({ line: i + 1, command: `bun run ${name}`, what: "file does not exist" });
      } else if (!scripts.has(name) && !BUILT_IN_BUN_COMMANDS.has(name)) {
        found.push({ line: i + 1, command: `bun run ${name}`, what: "no such script in package.json" });
      }
    }
  });
  return found;
}

export interface NavPage {
  title: string;
  path: string;
}
export interface NavSection {
  title: string;
  pages: NavPage[];
}
export interface Nav {
  sections: NavSection[];
}

interface RawSection {
  title: string;
  pages?: NavPage[];
  /** A folder whose pages are all listed automatically (sorted by file name), so that new files cannot be forgotten. */
  auto?: string;
  intro?: string;
}

function h1Of(file: string): string {
  const m = /^#\s+(.*)$/m.exec(readFileSync(file, "utf8"));
  return (m?.[1] ?? file).replace(/[^\p{L}\p{N}\s&().,:'\/+-]/gu, "").replace(/\s+/g, " ").trim();
}

export function loadNav(): Nav {
  const raw = JSON.parse(readFileSync(join(DOCS, "nav.json"), "utf8")) as { sections: RawSection[] };
  return {
    sections: raw.sections.map((s) => {
      const pages = [...(s.pages ?? [])];
      if (s.auto) {
        const dir = join(DOCS, s.auto);
        for (const name of readdirSync(dir).filter((n) => n.endsWith(".md")).sort()) pages.push({ title: h1Of(join(dir, name)), path: `${s.auto}/${name}` });
      }
      return { title: s.title, pages };
    }),
  };
}

/** Pages that exist on disk but are intentionally not in the navigation (generated helpers). */
const NAV_EXEMPT = new Set<string>([]);

export async function checkDocs(opts: { external?: boolean } = {}): Promise<{ issues: Issue[]; files: number; links: number }> {
  const issues: Issue[] = [];
  const files = [...walkMarkdown(DOCS), join(ROOT, "README.md")].filter((f) => existsSync(f));
  const parsed = new Map<string, Parsed>();
  for (const f of files) parsed.set(f, parseMarkdown(readFileSync(f, "utf8")));
  const rel = (f: string) => relative(ROOT, f);
  const packageScripts = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts ?? {}));
  let linkCount = 0;
  const externals: { file: string; line: number; url: string }[] = [];

  for (const [file, p] of parsed) {
    for (const line of p.fenceProblems) issues.push({ file: rel(file), line, kind: "fence", message: "code fence is never closed", severity: "error" });
    const h1s = p.headings.filter((h) => h.level === 1);
    if (h1s.length !== 1 && file.startsWith(DOCS)) issues.push({ file: rel(file), line: h1s[1]?.line ?? 1, kind: "heading", message: `page must have exactly one H1 (found ${h1s.length})`, severity: "error" });
    for (const s of findSecrets(p.lines.filter((_, i) => true))) {
      issues.push({ file: rel(file), line: s.line, kind: "secret", message: `possible secret: ${s.what}`, severity: "error" });
    }
    for (const c of findCommandProblems(p.lines, packageScripts, (path) => existsSync(join(ROOT, path)))) {
      issues.push({ file: rel(file), line: c.line, kind: "command", message: `${c.command}: ${c.what}`, severity: "error" });
    }
    for (const l of p.links) {
      linkCount++;
      const t = l.target;
      if (/^(https?:|mailto:|tel:)/i.test(t)) {
        if (/^https?:/i.test(t)) externals.push({ file: rel(file), line: l.line, url: t });
        continue;
      }
      if (t.startsWith("data:") || t.startsWith("javascript:")) continue;
      const [pathPart, anchor] = t.split("#");
      let targetFile = file;
      if (pathPart) {
        targetFile = resolve(dirname(file), decodeURIComponent(pathPart));
        if (!existsSync(targetFile)) {
          issues.push({ file: rel(file), line: l.line, kind: "link", message: `broken link: ${t}`, severity: "error" });
          continue;
        }
      }
      if (anchor) {
        let tp = parsed.get(targetFile);
        if (!tp && targetFile.endsWith(".md") && existsSync(targetFile)) {
          tp = parseMarkdown(readFileSync(targetFile, "utf8"));
          parsed.set(targetFile, tp);
        }
        if (tp && !tp.anchors.has(decodeURIComponent(anchor).toLowerCase()) && !tp.anchors.has(anchor)) {
          issues.push({ file: rel(file), line: l.line, kind: "anchor", message: `missing anchor #${anchor} in ${rel(targetFile)}`, severity: "error" });
        }
      }
    }
  }

  // navigation <-> files
  let nav: Nav | null = null;
  try {
    nav = loadNav();
  } catch (e) {
    issues.push({ file: "docs/nav.json", line: 1, kind: "nav", message: `cannot read navigation: ${(e as Error).message}`, severity: "error" });
  }
  if (nav) {
    const listed = new Set<string>();
    for (const s of nav.sections) {
      for (const pg of s.pages) {
        const full = join(DOCS, pg.path);
        if (listed.has(full)) issues.push({ file: "docs/nav.json", line: 1, kind: "nav", message: `page listed twice: ${pg.path}`, severity: "error" });
        listed.add(full);
        if (!existsSync(full)) issues.push({ file: "docs/nav.json", line: 1, kind: "nav", message: `navigation points to a missing page: ${pg.path}`, severity: "error" });
      }
    }
    for (const f of walkMarkdown(DOCS)) {
      const r = relative(DOCS, f);
      if (!listed.has(f) && !NAV_EXEMPT.has(r)) issues.push({ file: rel(f), line: 1, kind: "orphan", message: "page is not listed in docs/nav.json (it would be missing from the table of contents)", severity: "error" });
    }
  }

  if (opts.external) {
    const seen = new Set<string>();
    for (const e of externals) {
      if (seen.has(e.url)) continue;
      seen.add(e.url);
      try {
        const res = await fetch(e.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
        if (res.status >= 400 && res.status !== 405 && res.status !== 403) issues.push({ file: e.file, line: e.line, kind: "external", message: `external link returned ${res.status}: ${e.url}`, severity: "warning" });
      } catch (err) {
        issues.push({ file: e.file, line: e.line, kind: "external", message: `external link not reachable (${(err as Error).name}): ${e.url}`, severity: "warning" });
      }
    }
  }
  return { issues, files: files.length, links: linkCount };
}

if (import.meta.main) {
  const external = process.argv.includes("--external");
  const { issues, files, links } = await checkDocs({ external });
  const errors = issues.filter((i) => i.severity === "error");
  for (const i of issues) console.log(`${i.severity === "error" ? "ERROR" : "warn "} ${i.file}:${i.line} [${i.kind}] ${i.message}`);
  console.log(`\nChecked ${files} files, ${links} links: ${errors.length} error(s), ${issues.length - errors.length} warning(s).${external ? "" : " (external links not checked; use --external)"}`);
  process.exit(errors.length ? 1 : 0);
}
