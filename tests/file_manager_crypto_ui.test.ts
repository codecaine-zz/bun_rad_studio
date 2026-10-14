import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createHmac } from "crypto";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The Crypto tab, run for real in a fake browser (jsdom) against the real server. The fake browser's globals are
// removed again in afterAll so that other test files are not affected.
const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "MutationObserver", "KeyboardEvent", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

const root = mkdtempSync(join(tmpdir(), "fm-crypto-ui-"));
const home = join(root, "home");
const PASS = "ui-passphrase-QX81";
const KEY = "ui-hmac-key-QX82";
const PLAIN = "ui-plain-text-QX83";
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let power: any;
let section: any;
let state: any;
/** Every text the page put on the clipboard (the page's fetch is wrapped, so the "copytext" operation is recorded here). */
const copied: string[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn: () => any, ms = 1500) {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await sleep(15);
  expect(fn()).toBeTruthy();
}
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
  writeFileSync(join(home, "def.txt"), "def");
  server = startFileManagerServer({ port: 0, token: "ui-token", context: { home, dataDir: join(root, "data") } });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, process.platform);
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const key of GLOBALS) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
  for (const key of GLOBALS.filter((k) => k !== "fetch")) Object.defineProperty(g, key, { value: (dom.window as any)[key], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", {
    value: async (u: any, o: any) => {
      if (typeof u === "string" && u.endsWith("/api/copytext")) {
        copied.push(JSON.parse(o.body).text);
        return new Response(JSON.stringify({ ok: true, copied: true }), { headers: { "Content-Type": "application/json" } });
      }
      return realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o);
    },
    configurable: true,
    writable: true,
  });
  doc = dom.window.document;
  win = dom.window;
  state = (await import("../resources/file_manager/ui/state.js")).state;
  power = await import("../resources/file_manager/ui/power.js");
  section = await import("../resources/file_manager/ui/copysection.js");
  await import("../resources/file_manager/ui/crypto.js");
  power.wirePower();
  power.openPower("crypto", { path: join(home, "abc.txt") });
  section.startCopySections();
  await sleep(80);
  section.scanCopySections();
});

afterAll(() => {
  section.stopCopySections();
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

  test("text hashes: the extra kinds, and the fast checksums in their own clearly labelled table that the checksum check also understands", async () => {
    field("Text to hash").value = "abc";
    field("HMAC key (optional)").value = "";
    await click("Calculate hashes");
    const tables = [...pane().querySelectorAll(".crypto-digests")];
    expect(tables.length).toBe(2);
    const labels = (t: any) => [...t.querySelectorAll("tbody th")].map((x: any) => x.textContent);
    expect(labels(tables[0])).toEqual(expect.arrayContaining(["SHA-256", "SHA3-512", "BLAKE2b-256", "RIPEMD-160", "MD4"]));
    expect(labels(tables[1])).toEqual(expect.arrayContaining(["CRC32", "Adler-32", "xxHash64", "XXH3", "wyhash", "rapidhash"]));
    expect(labels(tables[1])).not.toContain("SHA-256");
    expect(pane().querySelector(".crypto-subtitle")!.textContent).toBe("Fast checksums (to spot accidental changes only, NOT secure)");
    expect([...tables[0].querySelectorAll("tbody th")].find((x: any) => x.textContent === "MD4")!.getAttribute("title")).toMatch(/OBSOLETE and BROKEN/);
    expect([...tables[1].querySelectorAll("td.crypto-digest")].map((x: any) => x.textContent)).toContain("44bc2cf5ad770999");
    field("Published checksum").value = "44BC2CF5AD770999";
    await click("Check the checksum");
    expect(statuses()).toContain("✔ It matches: this is the xxHash64 digest");
  });

  test("hashing a file with the extras box ticked adds the extra kinds and the fast table", async () => {
    const box = [...pane().querySelectorAll("input[type=checkbox]")].find((i: any) => i.parentElement.textContent.includes("Also work out the extra kinds")) as any;
    expect(box.getAttribute("title")).toMatch(/NOT secure/);
    expect(box.checked).toBe(false);
    await click("Hash this file");
    expect([...pane().querySelectorAll(".crypto-digests")].length).toBe(1);
    box.checked = true;
    await click("Hash this file");
    await waitFor(() => pane().querySelectorAll(".crypto-digests").length === 2);
    const fast = [...pane().querySelectorAll(".crypto-digests")][1]!;
    expect([...fast.querySelectorAll("tbody tr")].find((r: any) => r.querySelector("th").textContent === "CRC32")!.querySelector("td")!.textContent).toBe("352441c2");
    box.checked = false;
  });

  test("password card: hash, empty the box, check the right and a wrong password; bcrypt swaps the settings", async () => {
    const PW = "ui-password-QX90";
    expect(field("Password to hash").type).toBe("password");
    field("Password to hash").value = PW;
    field("Memory (KiB)").value = "1024";
    field("Passes").value = "1";
    await click("Hash the password");
   
    await waitFor(() => output("Hash to store").startsWith("$argon2id$"), 5000);
    const hash = output("Hash to store");
    expect(hash).toContain("m=1024,t=1,p=1");
    expect(field("Password to hash").value).toBe("");
    expect(statuses()).toContain("Store this hash, not the password");
    field("Password to check").value = PW;
    field("Stored hash").value = hash;
    await click("Check the password");
    await waitFor(() => statuses().includes("✔ That is the right password (argon2id"), 5000);
    expect(field("Password to check").value).toBe("");
    field("Password to check").value = `${PW}x`;
    await click("Check the password");
    await waitFor(() => statuses().includes("✖ That is not the password"), 5000);
    field("Stored hash").value = "not a hash";
    field("Password to check").value = PW;
    await click("Check the password");
    await waitFor(() => statuses().includes("doesn't look like a password hash"), 5000);

    const method = field("Method");
    method.value = "bcrypt";
    method.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect(field("Memory (KiB)").closest(".crypto-field").hidden).toBe(true);
    expect(field("Cost").closest(".crypto-field").hidden).toBe(false);
    field("Password to hash").value = "x".repeat(80);
    field("Cost").value = "4";
    await click("Hash the password");
    await waitFor(() => output("Hash to store").startsWith("$2b$04$"), 5000);
    expect(pane().textContent).toContain("bcrypt only reads the first 72 bytes");
    field("Cost").value = "99";
    field("Password to hash").value = "y";
    await click("Hash the password");
    await waitFor(() => statuses().includes("bcrypt cost must be a whole number from 4 to 16"), 5000);
    method.value = "argon2id";
    method.dispatchEvent(new win.Event("change", { bubbles: true }));
    // the activity log names the work but never a password
    const log = pane().querySelector(".crypto-log")!.textContent!;
    expect(log).toContain("Hash password");
    expect(log).not.toContain(PW);
    expect(pane().textContent).not.toContain(PW);
  });

  test("colour card: a swatch drawn with the style object model, every form with its own Copy, and a plain error", async () => {
    field("Colour").value = "Tomato";
    await click("Show all forms");
    await waitFor(() => pane().querySelectorAll(".crypto-colors tbody tr").length > 10);
    const swatch = pane().querySelector(".crypto-swatch-colour") as any;
    expect(swatch.style.getPropertyValue("background-color")).toBe("tomato");
    expect(pane().querySelector(".crypto-swatch")!.hasAttribute("hidden")).toBe(false);
    const rows = [...pane().querySelectorAll(".crypto-colors tbody tr")];
    const hex = rows.find((r: any) => r.querySelector("th").textContent === "Hex #rrggbb") as any;
    expect(hex.querySelector("td").textContent).toBe("#ff6347");
    expect(hex.querySelector("th").getAttribute("title")).toMatch(/six hex digits/i);
    for (const r of rows) expect((r as any).querySelector("button")!.getAttribute("aria-label")).toMatch(/^Copy /);
    field("Colour").value = "zzz not a colour";
    await click("Show all forms");
    await waitFor(() => statuses().includes("Couldn't read"));
    expect(pane().querySelector(".crypto-swatch")!.hasAttribute("hidden")).toBe(true);
    expect(pane().querySelectorAll(".crypto-colors").length).toBe(0);
    field("Colour").value = "rgba(10 20 30 / 50%)";
    await click("Show all forms");
    await waitFor(() => pane().querySelector(".crypto-colors"));
    expect(pane().textContent).toContain("partly transparent");
  });

  test("text tools: HTML escape and unescape, colour codes and text width", async () => {
    const box = field("Text to convert");
    box.value = `<b>"Tom" & 'Jerry'</b>`;
    await click("HTML escape");
    expect(output("Converted text")).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#x27;Jerry&#x27;&lt;&#x2F;b&gt;".replace("&#x2F;", "/"));
    await click("Move result up");
    await click("HTML unescape");
    expect(output("Converted text")).toBe(`<b>"Tom" & 'Jerry'</b>`);
    box.value = "\u001b[31mred\u001b[0m ok".replace(/\\u001b/g, "\u001b");
    await click("Remove colour codes");
    expect(output("Converted text")).toBe("red ok");
    box.value = "日本語😀";
    await click("Text width");
    expect(output("Converted text")).toContain("Columns in a terminal: 8");
    box.value = "";
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
    await click("New UUID v7");
    expect(output("Generated value")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    field("UUID").value = output("Generated value");
    await click("Look inside");
    expect(output("What is inside")).toMatch(/Version: 7[\s\S]*Made at: \d{4}-\d\d-\d\dT/);
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

// ---------------------------------------------------------------------------------------------------------------
// Copy buttons: every section, table and single value of the Crypto tab (same page, same state as above).
// ---------------------------------------------------------------------------------------------------------------
const card = (title: string): any => [...pane().querySelectorAll("section.crypto-card")].find((c: any) => c.querySelector("h3")!.textContent === title)!;
const cardCopy = (title: string): any => card(title).querySelector(":scope > .copy-bar .copy-main");
const item = (label: string): any => pane().querySelector(`button.copy-item[aria-label="Copy ${label}"]`);
const lastCopied = () => copied.at(-1);
const press = async (b: any) => {
  const before = copied.length;
  b.click();
  const end = Date.now() + 800;
  while (copied.length <= before && Date.now() < end) await sleep(15);
  await sleep(30);
  return copied.length > before ? copied.at(-1)! : null;
};
const toasts = () => [...doc.querySelectorAll("#toasts .toast")].map((t: any) => t.textContent as string).join(" | ");
const menuChoose = async (label: string) => {
  const entry = [...doc.querySelectorAll(".menu-item")].find((b: any) => b.textContent.includes(label)) as any;
  expect(entry, `menu item ${label}`).toBeTruthy();
  const before = copied.length;
  entry.click();
  await sleep(120);
  return copied.length > before ? copied.at(-1)! : null;
};
const settle = async () => {
  await sleep(80);
  section.scanCopySections();
};
const COPY_PASS = "copy-passphrase-QX81";
const COPY_PLAIN = "copy-plain-text-QX83";

describe("Crypto tab: every section and value can be copied by itself", () => {
  test("every card has one Copy button after its heading, with a name and a tooltip, and every value has its own", () => {
    const cards = [...pane().querySelectorAll("section.crypto-card")];
    expect(cards.map((c: any) => c.querySelector("h3").textContent)).toEqual([
      "Hash some text", "Hash a file", "Results", "Lock and unlock text with a passphrase (AES-256)", "Random keys and IDs", "Password generator", "Hash a password for storing", "Check a password against a stored hash", "JWT reader and signature check", "Look inside a UUID", "Encoders: URL, Base64, hex and text tools", "Colour converter", "Activity log",
    ]);
    for (const c of cards) {
      const bars = c.querySelectorAll(":scope > .copy-bar-host");
      expect(bars.length, String(c.querySelector("h3").textContent)).toBe(1);
      expect(c.querySelector("h3").nextElementSibling).toBe(bars[0]);
      const main = bars[0].querySelector(".copy-main");
      expect(main.getAttribute("aria-label")).toBe(`Copy the section ${c.querySelector("h3").textContent}`);
      expect(main.getAttribute("title")).toMatch(/Alt\+Shift\+C|⌥⇧C/);
      expect(bars[0].querySelector(".copy-more").getAttribute("aria-haspopup")).toBe("menu");
    }
    for (const b of pane().querySelectorAll(".copy-bar button, .copy-item")) {
      expect(b.getAttribute("aria-label"), b.outerHTML).toBeTruthy();
      expect(b.getAttribute("title"), b.outerHTML).toBeTruthy();
    }
    const labels = [...pane().querySelectorAll("button.copy-item")].map((b: any) => b.getAttribute("aria-label"));
    for (const want of ["Copy Lock or unlock result", "Copy Generated value", "Copy Generated password", "Copy Header", "Copy Payload (claims)", "Copy Converted text"]) expect(labels, want).toContain(want);
    expect(pane().querySelectorAll("[style]:not(.crypto-swatch-colour)").length).toBe(0);
  });

  test("empty results hide their bars, and a Copy with nothing in it says so instead of copying", async () => {
    const hiddenBars = [...pane().querySelectorAll(".copy-bar")].filter((b: any) => b.hidden).length;
    expect(hiddenBars).toBeGreaterThan(2);
    const before = copied.length;
    item("Generated password").click();
    await sleep(80);
    expect(copied.length).toBe(before);
    expect(toasts()).toContain("nothing to copy");
  });

  test("hashing text: each digest row copies just its hash; the table copies as TSV, Markdown and JSON; the Results card copies everything", async () => {
    field("Text to hash").value = "abc";
    field("HMAC key (optional)").value = "hmac-key-QX82";
    await click("Calculate hashes");
    await settle();
    const sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(await press(item("the SHA-256 digest"))).toBe(sha);
    expect(toasts()).not.toContain("clipboard, so paste");
    await waitFor(() => item("the SHA-256 digest").textContent === "Copied ✓");
    expect((await press(item("the HMAC-SHA256 digest")))!).toMatch(/^[0-9a-f]{64}$/);
    expect(lastCopied()).not.toBe(sha);
    expect(await press(item("the MD5 digest"))).toBe("900150983cd24fb0d6963f7d28e17f72");

    const resultsCard = card("Results");
    const tableBar = resultsCard.querySelector(".crypto-tablehost > .copy-bar");
    expect(tableBar.querySelector(".copy-main").textContent).toBe("Copy table");
    const tsv = (await press(tableBar.querySelector(".copy-main")))!;
    expect(tsv.startsWith("Digests of Text input\nAlgorithm\tDigest (hex)\nSHA-256\t" + sha)).toBe(true);
    expect(tsv).not.toContain("Copy");

    tableBar.querySelector(".copy-more").click();
    await sleep(40);
    const labels = [...doc.querySelectorAll(".menu-item")].map((b: any) => b.querySelector(".menu-label").textContent);
    expect(labels).toEqual(["Copy as text", "Copy as table (for spreadsheets)", "Copy as Markdown", "Copy as JSON", "Copy text without the heading"]);
    const table = (await menuChoose("Copy as table"))!;
    expect(table.startsWith("Algorithm\tDigest (hex)\nSHA-256\t" + sha)).toBe(true);
    tableBar.querySelector(".copy-more").click();
    await sleep(40);
    const json = JSON.parse((await menuChoose("Copy as JSON"))!);
    expect(json.find((r: any) => r.Algorithm === "SHA-256")["Digest (hex)"]).toBe(sha);
    expect(Object.keys(json[0])).toEqual(["Algorithm", "Digest (hex)"]);
    tableBar.querySelector(".copy-more").click();
    await sleep(40);
    const md = (await menuChoose("Copy as Markdown"))!;
    expect(md).toContain("| Algorithm | Digest (hex) |\n| --- | --- |\n| SHA-256 | " + sha + " |");

    const all = (await press(cardCopy("Results")))!;
    expect(all.startsWith("Results\n")).toBe(true);
    expect(all).toContain("Digests of: Text input");
    expect(all).toContain(`SHA-256\t${sha}`);
    expect(all).not.toContain("hmac-key-QX82");
    expect(all).not.toMatch(/\bnull\b|undefined/);
  });

  test("hashing several selected files gives every file row its own Copy", async () => {
    state.location = { kind: "folder", path: home };
    state.entries = [join(home, "abc.txt"), join(home, "def.txt")].map((path) => ({ path, name: path.split("/").pop(), isDir: false, type: "file", size: 3 }));
    state.selection = new Set(state.entries.map((e: any) => e.path));
    await click("Hash the selected files");
    await settle();
    const abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const copy = item("the SHA-256 digest of abc.txt");
    expect(copy, "per-file button").toBeTruthy();
    expect(await press(copy)).toBe(abc);
    expect(await press(item("the SHA-256 digest of def.txt"))).toBe("cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34");
    const fileTable = pane().querySelector(".crypto-filelist .copy-bar");
    expect(fileTable.querySelector(".copy-main").textContent).toBe("Copy table");
    const tsv = (await press(fileTable.querySelector(".copy-main")))!;
    expect(tsv.split("\n")[0]).toBe("2 files hashed");
    expect(tsv).toContain("File\tSize\tSHA-256 / problem");
    expect(tsv).toContain(`abc.txt\t3 bytes\t${abc}`);
  });

  test("the checksum check result has its own Copy", async () => {
    field("Published checksum").value = "0".repeat(64);
    await click("Check the checksum");
    await settle();
    const bar = card("Results").querySelector(".crypto-status[data-copy]")!.previousElementSibling as any;
    expect(bar.classList.contains("copy-bar")).toBe(true);
    expect(bar.hidden).toBe(false);
    expect(bar.querySelector(".copy-main").getAttribute("aria-label")).toBe("Copy the text Checksum check result");
    expect((await press(bar.querySelector(".copy-main")))!).toContain("✖ No match");
  });

  test("lock and unlock: the result copies by itself and the passphrase is never in what is copied", async () => {
    field("Passphrase").value = COPY_PASS;
    field("Text to lock, or locked text to unlock").value = COPY_PLAIN;
    await click("Lock (encrypt)");
    await settle();
    const locked = output("Lock or unlock result");
    expect(locked).toMatch(/^[0-9a-f]{32}:/);
    expect(await press(item("Lock or unlock result"))).toBe(locked);
    expect(toasts()).toContain("Other programs can read the clipboard, so paste it soon.");
    expect(toasts()).toContain("“Lock or unlock result”");
    const whole = (await press(cardCopy("Lock and unlock text with a passphrase (AES-256)")))!;
    expect(whole.startsWith("Lock and unlock text with a passphrase (AES-256)\n")).toBe(true);
    expect(whole).toContain(locked);
    expect(whole).toContain("Lock or unlock result");
    expect(whole).not.toContain(COPY_PASS);
    expect(whole).not.toContain(COPY_PLAIN);
    expect(toasts()).toContain("Other programs can read the clipboard");
  });

  test("strength estimate has a Copy", async () => {
    await click("Check passphrase strength");
    await settle();
    const bar = card("Lock and unlock text with a passphrase (AES-256)").querySelector(".crypto-strength > .copy-bar") as any;
    expect(bar).toBeTruthy();
    expect((await press(bar.querySelector(".copy-main")))!).toMatch(/bits/);
  });

  test("random values and passwords copy one value at a time", async () => {
    await click("New UUID v4");
    await settle();
    const uuid = output("Generated value");
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(await press(item("Generated value"))).toBe(uuid);
    await click("32-byte hex key");
    expect(await press(item("Generated value"))).toMatch(/^[0-9a-f]{64}$/);
    expect(lastCopied()).not.toBe(uuid);
    await click("256-bit Base64 key");
    expect(await press(item("Generated value"))).toBe(output("Generated value"));
    await click("Make random bytes");
    expect((await press(item("Generated value")))!.length).toBe(32);

    expect(button("Copy password")).toBeUndefined();
    await click("Generate password");
    await settle();
    const pw = output("Generated password");
    expect(pw.length).toBe(20);
    expect(await press(item("Generated password"))).toBe(pw);
    const whole = (await press(cardCopy("Password generator")))!;
    expect(whole).toContain(pw);
    expect(whole.startsWith("Password generator\n")).toBe(true);
    expect(toasts()).toContain("Other programs can read the clipboard");
    const randomCard = (await press(cardCopy("Random keys and IDs")))!;
    expect(randomCard).toContain("Generated value");
    expect(randomCard).not.toContain(pw);
  });

  test("a token: header, payload, times, warnings and the signature verdict each copy on their own", async () => {
    const b64 = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const head = b64({ alg: "HS256", typ: "JWT" });
    const body = b64({ sub: "user-1", exp: Math.floor(Date.now() / 1000) + 3600 });
    const sig = createHmac("sha256", "jwt-secret-QX99").update(`${head}.${body}`).digest("base64url");
    field("Token (JWT)").value = `${head}.${body}.${sig}`;
    field("Secret (to check").value = "jwt-secret-QX99";
    await click("Check signature");
    await settle();
    expect(JSON.parse((await press(item("Header")))!)).toEqual({ alg: "HS256", typ: "JWT" });
    expect(toasts()).toContain("“Header”");
    expect(JSON.parse((await press(item("Payload (claims)")))!).sub).toBe("user-1");
    const jwt = card("JWT reader and signature check");
    const times = jwt.querySelector("ul[data-copy='Token times']").previousElementSibling as any;
    expect(times.classList.contains("copy-bar")).toBe(true);
    expect((await press(times.querySelector(".copy-main")))!).toMatch(/^- .*[Ee]xpires/m);
    const verdict = jwt.querySelector("p[data-copy='Signature check result']").previousElementSibling as any;
    expect((await press(verdict.querySelector(".copy-main")))!).toContain("✔ The signature is valid (HS256)");
    const whole = (await press(cardCopy("JWT reader and signature check")))!;
    expect(whole).toContain("Header");
    expect(whole).toContain("Times");
    expect(whole).not.toContain("jwt-secret-QX99");
  });

  test("encoders: the converted text copies on its own and keeps its exact characters", async () => {
    field("Text to convert").value = "a b&c=d é";
    await click("URL encode");
    await settle();
    expect(await press(item("Converted text"))).toBe("a%20b%26c%3Dd%20%C3%A9");
    await click("Base64 encode");
    expect(await press(item("Converted text"))).toBe(Buffer.from("a b&c=d é").toString("base64"));
    expect(toasts()).toContain("Other programs can read the clipboard");
  });

  test("the activity log copies per entry (time, what, details), as a table, and as a whole card", async () => {
    const log = card("Activity log");
    const rows = [...log.querySelectorAll("tbody tr")];
    expect(rows.length).toBeGreaterThan(8);
    const rowButton = rows[0].querySelector("button.copy-item") as any;
    expect(rowButton.getAttribute("aria-label")).toMatch(/^Copy the log entry /);
    const first = (await press(rowButton))!;
    const cells = [...rows[0].querySelectorAll("td")].slice(0, 3).map((c: any) => c.textContent);
    expect(first).toBe(cells.join("\t"));
    const bar = log.querySelector(".crypto-log")!.previousElementSibling as any;
    expect(bar.classList.contains("copy-bar")).toBe(true);
    const tsv = (await press(bar.querySelector(".copy-main")))!;
    expect(tsv.split("\n")[0]).toBe("Activity, newest first");
    expect(tsv.split("\n")[1]).toBe("Time\tWhat\tDetails");
    expect(tsv.split("\n").length).toBe(rows.length + 2);
    expect(tsv.split("\n").every((l, i) => i < 2 || l.split("\t").length === 3)).toBe(true);
    const whole = (await press(cardCopy("Activity log")))!;
    expect(whole.startsWith("Activity log\n")).toBe(true);
    expect(whole).toContain("Hash text");
    expect(whole).not.toMatch(new RegExp(`${COPY_PASS}|${COPY_PLAIN}`));
  });

  test("Copy all gives the whole tab as text without anything typed", async () => {
    const all = (await press(button("Copy all")))!;
    for (const heading of ["Hash some text", "Hash a file", "Results", "Lock and unlock text with a passphrase (AES-256)", "Random keys and IDs", "Password generator", "JWT reader and signature check", "Hash a password for storing", "Encoders: URL, Base64, hex and text tools", "Colour converter", "Activity log"]) expect(all, heading).toContain(heading);
    expect(all).toContain("Digests of");
    expect(all).not.toContain(COPY_PASS);
    expect(all).not.toContain("hmac-key-QX82");
    expect(all).not.toContain("jwt-secret-QX99");
    expect(all).not.toMatch(/\bnull\b|\bundefined\b/);
    expect(all.length).toBeLessThanOrEqual(100_000);
    expect(toasts()).toContain("Other programs can read the clipboard");
  });

  test("Alt+Shift+C copies the section that has the keyboard focus", async () => {
    const pre = pane().querySelector('pre[aria-label="Generated password"]') as any;
    pre.focus();
    const before = copied.length;
    pre.dispatchEvent(new win.KeyboardEvent("keydown", { key: "C", code: "KeyC", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await sleep(120);
    expect(copied.length).toBe(before + 1);
    expect(lastCopied()!.startsWith("Password generator\n")).toBe(true);
    // without Shift nothing happens
    pre.dispatchEvent(new win.KeyboardEvent("keydown", { key: "c", code: "KeyC", altKey: true, bubbles: true }));
    await sleep(60);
    expect(copied.length).toBe(before + 1);
  });

  test("re-rendering never doubles a button; Clear all hides the empty ones; data-copy=\"off\" is respected", async () => {
    for (let i = 0; i < 3; i++) await click("Calculate hashes");
    await settle();
    const resultsCard = card("Results");
    expect(resultsCard.querySelectorAll(":scope > .copy-bar-host").length).toBe(1);
    expect(resultsCard.querySelectorAll(".crypto-tablehost .copy-bar").length).toBe(2); // the digests and the fast checksums
    expect(resultsCard.querySelectorAll("button.copy-item[aria-label='Copy the SHA-256 digest']").length).toBe(1);
    for (const c of pane().querySelectorAll("section.crypto-card")) expect(c.querySelectorAll(":scope > .copy-bar-host").length).toBe(1);

    const off = doc.createElement("section");
    off.setAttribute("data-copy", "off");
    off.append(Object.assign(doc.createElement("h3"), { textContent: "No button here" }));
    pane().append(off);
    await settle();
    expect(off.querySelector(".copy-bar")).toBeNull();
    off.remove();

    await click("Clear all");
    await settle();
    expect(output("Generated password")).toBe("");
    const before = copied.length;
    item("Generated password").click();
    await sleep(80);
    expect(copied.length).toBe(before);
    const visibleTables = [...pane().querySelectorAll(".copy-bar")].filter((b: any) => !b.hidden && b.querySelector(".copy-main").textContent === "Copy table");
    expect(visibleTables.length).toBe(0);
  });

  test("nothing in the tab says null or undefined, and the observer lets go on teardown", async () => {
    expect(pane().textContent).not.toMatch(/\bnull\b|\bundefined\b/);
    expect(section.copySectionCount()).toBeGreaterThan(8);
    section.stopCopySections();
    expect(section.copySectionCount()).toBe(0);
    expect(pane().querySelectorAll(".copy-bar").length).toBe(0);
    expect(pane().querySelectorAll(".copy-host").length).toBe(0);
    const extra = doc.createElement("section");
    extra.append(Object.assign(doc.createElement("h3"), { textContent: "Late section" }));
    pane().append(extra);
    await sleep(120);
    expect(extra.querySelector(".copy-bar")).toBeNull();
    extra.remove();
    section.startCopySections();
    await settle();
    expect(pane().querySelectorAll("section.crypto-card > .copy-bar-host").length).toBe(13);
  });
});
