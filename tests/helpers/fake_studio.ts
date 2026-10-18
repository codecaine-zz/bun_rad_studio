/**
 * A stand-in for the database studios in tests: it takes the same `--server` / `--port` arguments, prints
 * READY:<port>, and answers /__env with exactly what it was started with (environment, arguments, folder).
 * FAKE_MODE changes its behavior: "crash" exits after READY, "silent" never says READY, "leak" prints a password it was given.
 */
import { watchParentProcess } from "../../src/parentWatch";

const args = process.argv.slice(2);
const mode = process.env.FAKE_MODE ?? "";

if (mode === "silent") {
  setInterval(() => {}, 1000);
} else {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/__env") {
        return Response.json({ env: process.env, argv: process.argv.slice(1), args, cwd: process.cwd(), pid: process.pid, execArgv: process.execArgv });
      }
      return new Response("<!doctype html><title>fake studio</title><p>fake studio</p>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
    },
  });
  if (mode === "leak") console.error(`connecting with password ${process.env.FAKE_SECRET ?? ""} and url postgres://u:${process.env.FAKE_SECRET ?? ""}@h/db`);
  console.log(`READY:${server.port}`);
  watchParentProcess();
  if (mode === "crash") setTimeout(() => process.exit(3), 300);
  // Ends on SIGTERM like a studio would; "stubborn" ignores it so the KILL path can be tested.
  if (mode === "stubborn") process.on("SIGTERM", () => {});
  setInterval(() => {}, 60_000);
}
