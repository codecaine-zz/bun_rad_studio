/**
 * Bun + Windows compatibility shim for `systeminformation` v6 (`PowerShellWorker`).
 *
 * `systeminformation` v6 spawns persistent PowerShell workers via `require("node:child_process").spawn`
 * and calls `this.child.stdin.unref()`, `this.child.stdout.unref()`, `this.child.stdout.ref()`,
 * and `this.child.stderr.unref()`. Under Bun, `child.stdin` is a `Writable` stream without
 * `.unref()` / `.ref()`, throwing `TypeError: this.child.stdin.unref is not a function`.
 */
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";

const PATCHED = Symbol.for("bun_rad_studio.si_bun_stdio_compat");
const cjsRequire = createRequire(import.meta.url);

function ensureRefUnref(target: unknown): void {
  if (!target || typeof target !== "object") return;
  const obj = target as Record<string, unknown>;
  if (typeof obj.unref !== "function") {
    Object.defineProperty(obj, "unref", {
      value(this: unknown) {
        return this;
      },
      writable: true,
      configurable: true,
    });
  }
  if (typeof obj.ref !== "function") {
    Object.defineProperty(obj, "ref", {
      value(this: unknown) {
        return this;
      },
      writable: true,
      configurable: true,
    });
  }
}

export function installSystemInformationBunCompat(): void {
  const g = globalThis as Record<symbol, boolean | undefined>;
  if (g[PATCHED]) return;
  g[PATCHED] = true;

  ensureRefUnref(Writable.prototype);
  ensureRefUnref(Readable.prototype);

  try {
    const cp = cjsRequire("node:child_process") as {
      spawn?: (...args: unknown[]) => {
        stdin?: unknown;
        stdout?: unknown;
        stderr?: unknown;
      };
    };
    const origSpawn = cp.spawn;
    if (typeof origSpawn === "function") {
      cp.spawn = function patchedSpawn(this: unknown, ...args: unknown[]) {
        const child = origSpawn.apply(this, args);
        if (child && typeof child === "object") {
          ensureRefUnref(child.stdin);
          ensureRefUnref(child.stdout);
          ensureRefUnref(child.stderr);
        }
        return child;
      };
    }
  } catch {
    // Stream prototype fallbacks remain active if CJS child_process cannot be mutated.
  }
}

installSystemInformationBunCompat();
