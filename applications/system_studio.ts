/**
 * System Studio -- Native Bun System & Package Workstation
 * Replaces legacy Homebrew studio with zero external dependencies.
 */
import { createBunSystemStudio, createSystemStudio, createBrewStudio } from "./brew_studio";

export { createBunSystemStudio, createSystemStudio, createBrewStudio };

if (import.meta.main) {
  const win = createSystemStudio();
  console.log("⚡ Launching System & Package Workstation...");
  win.run();
}
