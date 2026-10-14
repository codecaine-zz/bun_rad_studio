/**
 * Worker entry for the built-in converters: receives one job, runs it, answers with a note or a plain message.
 * Ending this worker (cancel, time limit) stops the conversion at once; the caller removes whatever it had written.
 */
import { describeFsError } from "./fmPaths";
import { runBuiltin, type BuiltinJob } from "./fmConvBuiltin";

declare const self: { onmessage: ((e: MessageEvent) => void) | null; postMessage(message: unknown): void };

function plainMessage(err: any): string {
  if (err?.name === "ConvError" || err?.name === "FmError") return String(err.message);
  if (typeof err?.code === "string" && /^E[A-Z]+$/.test(err.code)) return describeFsError(err).message;
  if (err instanceof RangeError && /memory|string length|Invalid (?:string|array) length|too large/i.test(String(err.message))) return "This file is too big for the built-in converter to hold in memory.";
  return `Something went wrong while converting: ${String(err?.message ?? err).slice(0, 200)}`;
}

self.onmessage = async (e: MessageEvent) => {
  try {
    const note = await runBuiltin(e.data as BuiltinJob);
    self.postMessage({ ok: true, note });
  } catch (err) {
    self.postMessage({ ok: false, message: plainMessage(err) });
  }
};
