import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The Crypto tab, run for real in a fake browser (jsdom) against the real server. The fake browser's globals are
// removed again in afterAll so that other test files are not affected.
const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

const root = mkdtempSync(join(tmpdir(), "fm-crypto-ui-"));
const home = join(root, "home");
const PASS = "ui-passphrase-QX81";
const KEY = "ui-hmac-key-QX82";
const PLAIN = "ui-plain-text-QX83";
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let power: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pane = () => doc.getElementById("power-pane-crypto")!;
const button = (text: string): any => [...pane().querySelectorAll("button")].find((b) => b.textContent!.trim() === text);
const field = (label: string): any => {
  const l = [...pane().querySelectorAll("label")].find((x) => x.textContent!.trim().startsWith(label));
  return doc.getElementById(l!.getAttribute("for")!);
};
const output = (label: string) => [...pane().querySelectorAll("pre")].find((p) => p.getAttribute("aria-label") === label)!.textContent!;
const statuses = () => [...pane().querySelectorAll(".crypto-status")].map((e) => e.textContent!).join(" | ");
const click = async (text: string) => {
  button(text).click();
  await sleep(150);
};

beforeAll(async () => {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "abc.txt"), "abc");
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data") } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform);
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  power = await import("../resources/file_manager/ui/power.js");
  await import("../resources/file_manager/ui/crypto.js");
  power.wirePower();
  power.openPower("crypto", { path: join(home, "abc.txt") });
});

afterAll(() => {
  const g = globalThis as any;
  for (const key of GLOBALS) {
    const before = saved.get(key);
    if (before) Object.defineProperty(g, key, before);
    else delete g[key];
  }
  server.stop(true);
  rmSync(root, { recursive: true, force: true });
});

describe("the Crypto tab in a browser-like page", () => {
  test("opens with the file path prefilled, and every control has a label and a tooltip", () => {
    expect(field("File to hash").value).toBe(join(home, "abc.txt"));
    const controls = [...pane().querySelectorAll("button, input, textarea, select")];
    expect(controls.length).toBeGreaterThan(40);
    for (const c of controls) {
      expect(c.getAttribute("title"), c.outerHTML.slice(0, 100)).toBeTruthy();
      if (c.tagName !== "BUTTON") expect((c as any).labels?.length || c.getAttribute("aria-label"), c.outerHTML.slice(0, 100)).toBeTruthy();
    }
    expect(pane().querySelectorAll("[style]").length).toBe(0);
    for (const secret of pane().querySelectorAll(".crypto-secret")) {
      expect((secret as any).type).toBe("password");
      expect(secret.getAttribute("autocomplete")).toBe("off");
      expect(secret.getAttribute("spellcheck")).toBe("false");
    }
  });

  test("hash a file, then check a published checksum written the way tools print it", async () => {
    await click("Hash this file");
    expect(statuses()).toContain("Done: 1 file (3 bytes)");
    expect([...pane().querySelectorAll(".crypto-digests td")][0]!.textContent).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    field("Published checksum").value = "SHA256: BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD  abc.txt";
    await click("Check the checksum");
    expect(statuses()).toContain("✔ It matches");
    field("Published checksum").value = "0".repeat(64);
    await click("Check the checksum");
    expect(statuses()).toContain("✖ No match");
  });

  test("text hashes with an HMAC key; the key can be shown and is hidden again when the tab is left", async () => {
    field("Text to hash").value = "Hi There";
    field("HMAC key (optional)").value = KEY;
    (pane().querySelector('button[aria-label="Show HMAC key"]')).click();
    expect(field("HMAC key (optional)").type).toBe("text");
    await click("Calculate hashes");
    const rows = [...pane().querySelectorAll(".crypto-digests tr")].map((r) => r.textContent!);
    expect(rows.some((r) => r.startsWith("HMAC-SHA256"))).toBe(true);
    power.closePower();
    expect(field("HMAC key (optional)").type).toBe("password");
    power.openPower("crypto");
  });

  test("lock and unlock; a wrong passphrase gets a plain sentence", async () => {
    field("Passphrase").value = PASS;
    field("Text to lock, or locked text to unlock").value = PLAIN;
    await click("Lock (encrypt)");
    expect(output("Lock or unlock result")).toMatch(/^[0-9a-f]{32}:/);
    await click("Move result up");
    field("Passphrase").value = "not-the-passphrase";
    await click("Unlock (decrypt)");
    expect(statuses()).toMatch(/passphrase is wrong|looks like nonsense/);
    field("Passphrase").value = PASS;
    await click("Unlock (decrypt)");
    expect(output("Lock or unlock result")).toBe(PLAIN);
  });

  test("strength, random values, password, JWT and encoders", async () => {
    await click("Check passphrase strength");
    expect(pane().querySelector(".crypto-strength")!.textContent).toMatch(/bits/);
    await click("New UUID v4");
    expect(output("Generated value")).toMatch(/^[0-9a-f-]{36}$/);
    await click("Generate password");
    expect(output("Generated password")).toHaveLength(20);
    field("Token (JWT)").value = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    field("Secret (to check").value = "your-256-bit-secret";
    await click("Check signature");
    expect(pane().querySelector(".crypto-jwt")!.textContent).toContain("✔ The signature is valid (HS256)");
    field("Text to convert").value = "Hello";
    await click("Base64 encode");
    expect(output("Converted text")).toBe("SGVsbG8=");
    field("Text to convert").value = "%zz";
    await click("URL decode");
    expect(statuses()).toContain("valid URL-encoded");
  });

  test("a digest report is saved as a new file and never over an existing one", async () => {
    await click("Hash this file");
    field("Save report in folder").value = home;
    await click("Save digests as a new file");
    expect(existsSync(join(home, "Digests.txt"))).toBe(true);
    await click("Save digests as a new file");
    expect(existsSync(join(home, "Digests (2).txt"))).toBe(true);
    expect(readFileSync(join(home, "Digests.txt"), "utf8")).toContain("Source: abc.txt (3 bytes)");
  });

  test("the activity log lists what was done but never a secret", () => {
    const log = pane().querySelector(".crypto-log")!.textContent!;
    expect(log).toContain("AES-256 lock");
    expect(log).toContain("Hash files");
    for (const secret of [PASS, KEY, PLAIN, "not-the-passphrase", "your-256-bit-secret", output("Generated password"), "SGVsbG8"]) expect(log).not.toContain(secret);
  });

  test("Clear all empties the boxes and the log, and hides secrets again", async () => {
    (pane().querySelector('button[aria-label="Show passphrase"]')).click();
    expect(field("Passphrase").type).toBe("text");
    await click("Clear all");
    for (const label of ["Passphrase", "Text to hash", "HMAC key (optional)", "Token (JWT)", "Secret (to check", "Text to convert", "Text to lock", "File to hash", "Published checksum"]) expect(field(label).value, label).toBe("");
    expect(field("Passphrase").type).toBe("password");
    expect(output("Lock or unlock result")).toBe("");
    expect(output("Converted text")).toBe("");
    expect(output("Generated password")).toBe("");
    expect(pane().querySelectorAll(".crypto-log-table tbody tr").length).toBe(0);
  });
});
