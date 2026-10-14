#!/usr/bin/env bun
/**
 * Shows how to support the project: the PayPal link, a QR code you can scan with a phone (drawn in the terminal when
 * `qrencode` is installed), and opens the page in your browser.
 *
 *   bun run donate             show the link and the QR code, and open the page
 *   bun run donate -- --no-open
 */
import { Sys } from "../src/simplecli/sys";

export const DONATE_URL = "https://paypal.me/codecaine81";

export async function qrText(url: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["qrencode", "-t", "ANSIUTF8", "-m", "2", url], { stdout: "pipe", stderr: "ignore" });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return code === 0 && out.trim() ? out : null;
  } catch {
    return null; // qrencode is not installed
  }
}

if (import.meta.main) {
  console.log("\nThank you for supporting Bun RAD Studio!\n");
  console.log(`  ${DONATE_URL}\n`);
  const qr = await qrText(DONATE_URL);
  if (qr) console.log(qr);
  else console.log("  (A QR code is in docs/images/donate-paypal-qr.png. Install `qrencode` to draw it here.)\n");
  if (!process.argv.includes("--no-open")) Sys.openUrl(DONATE_URL);
}
