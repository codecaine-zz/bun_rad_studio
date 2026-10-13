import { getSharedWorkbench } from "./workbench_shared";
import type { WorkbenchHandler } from "./workbench_http";

/** Standalone server for the workbench (`bun run workbench`); loopback only. */
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
  const { url } = await startWorkbenchServer({ port: Number(process.env.WORKBENCH_PORT || 0) });
  console.log(`Database Workbench: ${url}`);
}
