/**
 * DevTools Studio Pro -- Native Developer CLI & Code Tool Suite
 * Zero Homebrew reliance -- 6 developer engines powered natively by Bun system APIs
 */
import { createDevToolsStudio, createOmnitoolStudio } from "./omnitool_studio";

export { createDevToolsStudio, createOmnitoolStudio };

if (import.meta.main) {
  const win = createDevToolsStudio({ fullscreen: true });
  console.log("⚡ Launching DevTools Studio Pro (Fullscreen)...");
  win.run();
}
