/**
 * Process Monitor Studio -- Real-Time Process & Resource Manager
 * Native macOS process management and signal dispatcher.
 */
import { createProcessStudio, createTaskTracker } from "./task_manager";

export { createProcessStudio, createTaskTracker };

if (import.meta.main) {
  const win = createProcessStudio();
  console.log("⚡ Launching Process Monitor Studio...");
  win.run();
}
