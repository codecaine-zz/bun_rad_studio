/**
 * The "About" links: the project on GitHub, its issue tracker, the author's profile and the donation page.
 * The page only ever sends a link's id; the addresses live here, so nothing else can be opened through this.
 */
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

const PLATFORM_NAMES: Record<string, string> = { darwin: "macOS", win32: "Windows", linux: "Linux" };

export interface RuntimeInfo {
  /** The Bun the app runs on (`Bun.version`) and the short form of its build (`Bun.revision`). */
  bun: string;
  revision: string;
  platform: string;
  system: string;
  arch: string;
}

/** What the app runs on, for the About window and for bug reports. */
export function runtimeInfo(ctx: FmContext): RuntimeInfo {
  return { bun: Bun.version, revision: Bun.revision.slice(0, 8), platform: ctx.platform, system: PLATFORM_NAMES[ctx.platform] ?? ctx.platform, arch: process.arch };
}

async function openLink(ctx: FmContext, link: AboutLink): Promise<void> {
  const { command, args } = openCommand(ctx.platform, link.url);
  try {
    await ctx.launch(command, args);
  } catch (err: any) {
    throw new FmError("OPEN_FAILED", `Couldn't open your web browser: ${err?.message ?? err}. The address is ${link.url}`);
  }
}

export const aboutOperations: Record<string, FmHandler> = {
  async "about/info"(ctx) {
    // Read when asked, not when this file loads: the server module that owns the name imports this one.
    const { APP_NAME, APP_VERSION } = await import("./fmServer");
    return { links: ABOUT_LINKS, app: { name: APP_NAME, version: APP_VERSION }, runtime: runtimeInfo(ctx) };
  },
  async "about/open"(ctx, b) {
    const link = ABOUT_LINKS.find((l) => l.id === b.id);
    if (!link) throw new FmError("BAD_REQUEST", "That link isn't one this app knows.");
    await openLink(ctx, link);
    return { opened: link.url };
  },
};
