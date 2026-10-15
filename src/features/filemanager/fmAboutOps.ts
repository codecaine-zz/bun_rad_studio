/**
 * The "About" links: the project on GitHub, its issue tracker, the author's profile and the donation page.
 * The page only ever sends a link's id; the addresses live here, so nothing else can be opened through this.
 */
import { promises as fsp } from "fs";
import * as nodePath from "path";
import { type FmContext, type FmHandler } from "./fmCore";
import { openCommand } from "./fmOpen";
import { FmError } from "./fmPaths";

export interface AboutLink {
  id: string;
  label: string;
  hint: string;
  url: string;
}

export const ABOUT_LINKS: readonly AboutLink[] = [
  { id: "project", label: "Project on GitHub", hint: "The source code, releases and documentation of Bun RAD Studio.", url: "https://github.com/codecaine-zz/bun_rad_studio" },
  { id: "website", label: "Website: codefreelance.net", hint: "The author's website, with more apps, tutorials and projects.", url: "https://www.codefreelance.net" },
  { id: "youtube", label: "YouTube channel: @codecaine", hint: "Videos by the author. Opens youtube.com in your web browser.", url: "https://www.youtube.com/@codecaine" },
  { id: "tutorials", label: "Markdown tutorials", hint: "Lessons and examples for learning Markdown, the plain-text writing format used for README files and notes. Opens codefreelance.net.", url: "https://codefreelance.net/apps/markdown_tutorials/" },
  { id: "issues", label: "Report a problem or suggest an idea", hint: "Opens the issue tracker on GitHub (you need a free GitHub account to post).", url: "https://github.com/codecaine-zz/bun_rad_studio/issues" },
  { id: "releases", label: "Downloads and release notes", hint: "Ready-made apps for macOS, Windows and Linux.", url: "https://github.com/codecaine-zz/bun_rad_studio/releases" },
  { id: "author", label: "codecaine-zz on GitHub", hint: "The author's GitHub profile, with the other projects.", url: "https://github.com/codecaine-zz" },
  { id: "donate", label: "Support the project (PayPal)", hint: "Optional. Opens the donation page.", url: "https://paypal.me/codecaine81" },
];

const GITHUB_RELEASES_URL = "https://github.com/codecaine-zz/bun_rad_studio/releases";
const PLATFORM_NAMES: Record<string, string> = { darwin: "macOS", win32: "Windows", linux: "Linux" };
const ASSET_IDS: Record<string, string> = {
  darwin: { arm64: "macos-arm64", x64: "macos-x64" },
  win32: { arm64: "windows-arm64", x64: "windows-x64" },
  linux: { arm64: "linux-arm64", x64: "linux-x64" },
};

export interface RuntimeInfo {
  /** The Bun the app runs on (`Bun.version`) and the short form of its build (`Bun.revision`). */
  bun: string;
  revision: string;
  platform: string;
  system: string;
  arch: string;
}

export interface UpdateCheck {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  releaseUrl: string;
  assetUrl: string | null;
  assetName: string | null;
  canAutoUpdate: boolean;
  checkedAt: string;
  error: string | null;
}

export function normalizeVersion(version: string): string {
  const trimmed = `${version}`.trim();
  return trimmed.startsWith("v") || trimmed.startsWith("V") ? trimmed.slice(1) : trimmed;
}

export function assetIdForPlatform(platform: string, arch: string): string | null {
  const archName = arch === "arm64" ? "arm64" : arch === "x64" ? "x64" : null;
  if (!archName) return null;
  const byPlatform = ASSET_IDS[platform];
  return byPlatform ? byPlatform[archName as keyof typeof byPlatform] ?? null : null;
}

export function compareVersions(a: string, b: string): number {
  return Bun.semver.order(normalizeVersion(a), normalizeVersion(b));
}

function downloadFolderFor(ctx: FmContext): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ctx.home;
  return ctx.platform === "win32" ? nodePath.join(home, "Downloads") : nodePath.join(home, "Downloads");
}

export function releaseAssetForPlatform(release: any, platform: string, arch: string): { name: string; url: string } | null {
  const assetId = assetIdForPlatform(platform, arch);
  if (!assetId || !release || !Array.isArray(release.assets)) return null;
  const pattern = new RegExp(`Codecaine-File-Manager-v.*-${assetId}\\.zip$`, "i");
  const asset = release.assets.find((entry: any) => typeof entry?.name === "string" && pattern.test(entry.name));
  if (!asset || typeof asset.browser_download_url !== "string") return null;
  return { name: asset.name, url: asset.browser_download_url };
}

export async function checkForUpdates(ctx: FmContext): Promise<UpdateCheck> {
  const { APP_VERSION } = await import("./fmServer");
  const currentVersion = normalizeVersion(APP_VERSION);
  const now = new Date().toISOString();
  try {
    const response = await fetch("https://api.github.com/repos/codecaine-zz/bun_rad_studio/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Codecaine-File-Manager" },
    });
    if (!response.ok) {
      return { currentVersion, latestVersion: null, hasUpdate: false, releaseUrl: GITHUB_RELEASES_URL, assetUrl: null, assetName: null, canAutoUpdate: false, checkedAt: now, error: `GitHub responded with ${response.status}.` };
    }
    const release = await response.json();
    const latestVersion = typeof release?.tag_name === "string" ? normalizeVersion(release.tag_name) : null;
    const releaseUrl = typeof release?.html_url === "string" ? release.html_url : GITHUB_RELEASES_URL;
    const asset = release && typeof release === "object" ? releaseAssetForPlatform(release, ctx.platform, process.arch) : null;
    const hasUpdate = latestVersion ? compareVersions(currentVersion, latestVersion) < 0 : false;
    return {
      currentVersion,
      latestVersion,
      hasUpdate,
      releaseUrl,
      assetUrl: asset?.url ?? null,
      assetName: asset?.name ?? null,
      canAutoUpdate: Boolean(asset?.url),
      checkedAt: now,
      error: null,
    };
  } catch (err: any) {
    return {
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      releaseUrl: GITHUB_RELEASES_URL,
      assetUrl: null,
      assetName: null,
      canAutoUpdate: false,
      checkedAt: now,
      error: err?.message ?? String(err ?? "Couldn't check for updates."),
    };
  }
}

async function openLink(ctx: FmContext, link: AboutLink): Promise<void> {
  const { command, args } = openCommand(ctx.platform, link.url);
  try {
    await ctx.launch(command, args);
  } catch (err: any) {
    throw new FmError("OPEN_FAILED", `Couldn't open your web browser: ${err?.message ?? err}. The address is ${link.url}`);
  }
}

export async function installLatestUpdate(ctx: FmContext): Promise<{ path: string; file: string; releaseUrl: string }> {
  const update = await checkForUpdates(ctx);
  if (!update.hasUpdate || !update.assetUrl) {
    throw new FmError("BAD_REQUEST", update.latestVersion ? `This version is already current (${update.currentVersion}).` : "There isn't a newer release for your platform yet.");
  }
  const folder = downloadFolderFor(ctx);
  await fsp.mkdir(folder, { recursive: true });
  const name = update.assetName ?? `Codecaine-File-Manager-v${update.latestVersion}.zip`;
  const target = nodePath.join(folder, name);
  const response = await fetch(update.assetUrl, { headers: { Accept: "application/octet-stream" } });
  if (!response.ok) throw new FmError("DOWNLOAD_FAILED", `GitHub refused the update file (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fsp.writeFile(target, bytes);
  return { path: folder, file: target, releaseUrl: update.releaseUrl };
}

export const aboutOperations: Record<string, FmHandler> = {
  async "about/info"(ctx) {
    // Read when asked, not when this file loads: the server module that owns the name imports this one.
    const { APP_NAME, APP_VERSION } = await import("./fmServer");
    return { links: ABOUT_LINKS, app: { name: APP_NAME, version: APP_VERSION }, runtime: runtimeInfo(ctx) };
  },
  async "about/check-update"(ctx) {
    return await checkForUpdates(ctx);
  },
  async "about/update-install"(ctx) {
    return await installLatestUpdate(ctx);
  },
  async "about/open"(ctx, b) {
    const link = ABOUT_LINKS.find((l) => l.id === b.id);
    if (!link) throw new FmError("BAD_REQUEST", "That link isn't one this app knows.");
    await openLink(ctx, link);
    return { opened: link.url };
  },
};

/** What the app runs on, for the About window and for bug reports. */
export function runtimeInfo(ctx: FmContext): RuntimeInfo {
  return { bun: Bun.version, revision: Bun.revision.slice(0, 8), platform: ctx.platform, system: PLATFORM_NAMES[ctx.platform] ?? ctx.platform, arch: process.arch };
}
