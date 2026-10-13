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

/** Standalone server for the workbench (used by tests and `bun run src/db/workbench_server.ts`). */
export async function startWorkbenchServer(options: { port?: number; hostname?: string; handler?: WorkbenchHandler } = {}) {
  const handler = options.handler ?? (await getSharedWorkbench());
  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: options.hostname ?? "127.0.0.1",
    async fetch(req) {
      return (await handler.handle(req)) ?? new Response("Not found", { status: 404 });
    },
  });
  return { server, handler, url: `http://127.0.0.1:${server.port}/workbench` };
}

if (import.meta.main) {
  const port = Number(process.env.WORKBENCH_PORT || 0);
  const { url } = await startWorkbenchServer({ port });
  console.log(`Database Workbench: ${url}`);
}
