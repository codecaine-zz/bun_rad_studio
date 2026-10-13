import { ProfileStore, detectSecretStore, defaultProfileDir } from "./profiles";
import { WorkbenchService } from "./service";
import { createWorkbenchHandler, type WorkbenchHandler } from "./workbench_http";

let shared: Promise<WorkbenchHandler> | null = null;

/** One workbench per process, shared by every studio server that mounts it. */
export function getSharedWorkbench(title = "Database Workbench"): Promise<WorkbenchHandler> {
  if (!shared) {
    shared = (async () => {
      const secrets = await detectSecretStore();
      const service = new WorkbenchService(new ProfileStore(defaultProfileDir(), secrets));
      return createWorkbenchHandler(service, { title });
    })();
  }
  return shared;
}
