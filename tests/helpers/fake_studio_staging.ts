/**
 * A stand-in studio that also records what the File Manager sends to `/api/staging/grant` (the secret header and the body),
 * and answers /__env with its environment, like fake_studio.ts.
 */
import { watchParentProcess } from "../../src/parentWatch";

const grants: { secret: string | null; body: unknown }[] = [];
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/__env") return Response.json({ env: process.env, args: process.argv.slice(2), pid: process.pid });
    if (url.pathname === "/__grants") return Response.json(grants);
    if (url.pathname === "/api/staging/grant" && req.method === "POST") {
      grants.push({ secret: req.headers.get("x-staging-grant"), body: await req.json().catch(() => null) });
      return Response.json({ ok: true });
    }
    return new Response("<!doctype html><title>fake studio</title>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});
console.log(`READY:${server.port}`);
watchParentProcess();
setInterval(() => {}, 60_000);
