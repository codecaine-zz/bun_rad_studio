import { existsSync } from "fs";
import { join } from "path";

/**
 * Finds `resources/<name>` for a studio that serves its page from disk.
 *
 * Looks next to the studio's own file first (so it works from any working directory) and then in the current
 * directory (the previous behavior). Falls back to the first location so the caller's error message names it.
 */
export function findStudioResources(name: string, studioDir: string, cwd: string = process.cwd()): string {
  const candidates = [join(studioDir, "..", "resources", name), join(cwd, "resources", name)];
  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? candidates[0]!;
}
