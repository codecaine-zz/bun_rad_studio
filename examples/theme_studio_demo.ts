/**
 * Visual Theme Studio & 3-Layer Smart Math Engine Live Runner
 *
 * Usage:
 *   bun run examples/theme_studio_demo.ts
 */

import { startThemeStudioServer } from "../src/features/theme-studio";

if (import.meta.main) {
  const port = Number(process.env.PORT || 0);
  const server = startThemeStudioServer({ port, host: "127.0.0.1" });
  const url = `http://127.0.0.1:${server.port}/`;
  console.log(`⚡ Visual Theme Studio running at ${url}`);
  console.log(`READY:${server.port}`);
}
