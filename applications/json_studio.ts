/**
 * JSON Query Studio Pro -- High-Performance JSON Query & Transformation
 * Zero Homebrew reliance -- Powered by Bun's native JSON & JavaScript query engine
 */
import { createJsonStudio, createJqStudio, evaluateBunJsonQuery } from "./jq_studio";

export { createJsonStudio, createJqStudio, evaluateBunJsonQuery };

if (import.meta.main) {
  const win = createJsonStudio({ fullscreen: true });
  console.log("⚡ Launching JSON Query Studio Pro...");
  win.run();
}
