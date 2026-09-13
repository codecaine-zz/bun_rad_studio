/**
 * Process Monitor Studio (Procs Studio Pro) -- Real-Time Process & Resource Manager
 * Powered by native Bun process telemetry, TCP port inspection, and signal dispatcher.
 */
import { createProcessStudio, createTaskTracker } from "./task_manager";
import { createProcsStudio } from "./procs_studio";

export { createProcessStudio, createTaskTracker, createProcsStudio };

if (import.meta.main) {
  const win = createProcessStudio({ fullscreen: true });
  console.log("⚡ Launching Process Monitor Studio...");
  win.run();
}
