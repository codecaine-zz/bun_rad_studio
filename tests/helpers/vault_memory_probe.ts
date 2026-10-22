/**
 * Run in a fresh process by tests/file_manager_vault.test.ts: encrypts, checks and decrypts a 100 MB file and prints how far
 * the process's memory (RSS) grew. A fresh process has a small heap, so the number says what this one job costs, not what
 * the other test files before it left behind.
 *
 *   bun tests/helpers/vault_memory_probe.ts <scratch folder>
 * Prints one JSON line: { ok, growthMB, encryptMBps, decryptMBps }.
 */
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, mkdirSync } from "node:fs";
import { open as openFile } from "node:fs/promises";
import { join } from "node:path";
import { decryptFile, encryptItem } from "../../src/features/filemanager/fmVaultEngine";

const dir = process.argv[2]!;
mkdirSync(dir, { recursive: true });
const PW = "correct horse battery staple";
const FAST = { memoryKiB: 64, passes: 1, parallelism: 1 };

async function shaFile(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

const src = join(dir, "big.bin");
const block = randomBytes(1 << 20);
const fh = await openFile(src, "w");
const hash = createHash("sha256");
for (let i = 0; i < 100; i++) {
  block.writeUInt32BE(i, 0);
  await fh.write(block);
  hash.update(block);
}
await fh.close();
const want = hash.digest("hex");

Bun.gc(true);
const baseline = process.memoryUsage().rss;
let peak = baseline;
const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 10);
const t0 = performance.now();
const r = await encryptItem({ source: src, outputDir: dir, password: PW, level: "standard", compress: false, hideName: false, internal: { kdf: FAST } });
const t1 = performance.now();
const outDir = join(dir, "out");
mkdirSync(outDir);
const d = await decryptFile({ source: r.output, outputDir: outDir, password: PW });
const t2 = performance.now();
clearInterval(timer);
const mb = 100 * 1.048576;
console.log(JSON.stringify({
  ok: (await shaFile(d.output)) === want,
  growthMB: (peak - baseline) / 1048576,
  encryptMBps: mb / ((t1 - t0) / 1000),
  decryptMBps: mb / ((t2 - t1) / 1000),
}));
