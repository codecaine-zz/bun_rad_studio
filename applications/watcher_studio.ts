/**
 * Task Watcher Studio -- Continuous Task & Test Watcher
 * Zero Homebrew reliance -- Powered by Bun's native fs.watch system API
 */
import { createWatcherStudio, createWatchexecStudio, createBunWatchStudio } from "./watchexec_studio";

export { createWatcherStudio, createWatchexecStudio, createBunWatchStudio };

if (import.meta.main) {
  const win = createWatcherStudio({ fullscreen: true });
  console.log("⚡ Launching Task Watcher Studio...");
  win.run();
}
