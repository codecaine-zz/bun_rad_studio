import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import { secretsOperations } from "../src/features/filemanager/fmSecretsOps";
import { FakeStore, TINY } from "./file_manager_secrets_helpers";

const GLOBALS = ["document", "window", "Node", "Element", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "MutationObserver", "KeyboardEvent", "Event", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
const root = mkdtempSync(join(tmpdir(), "fm-secrets-ui-"));
const home = join(root, "home");
const MASTER = "violet-anchor-lizard-orbit-meadow-quartz";
const M = { pw: "PAGE-PW-5c2e!Zq", note: "PAGE-NOTE-5c2e", totp: "JBSWY3DPEHPK3PXP", card: "4929555500005c2e", custom: "PAGE-CUSTOM-5c2e" };

let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let win: any;
let power: any;
let section: any;
let sstate: any;
let sx: any;
let clockMod: any;
const store = new FakeStore();
const clip = { text: "" };
const fetchLog: string[] = [];
const breachReply = { text: "" };
let recoveryKey = "";
/** Browsers print "null" for append(null) and "[object ...]" for an array; jsdom is kinder, so catch the call itself. */
const badInsertions: string[] = [];

// A clock the page can't outrun: timers run only when the test says so.
const fake = (() => {
  let now = Date.now();
  let id = 0;
  const timers = new Map<number, { fn: () => void; at: number; every?: number }>();
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => { const h = ++id; timers.set(h, { fn, at: now + ms }); return h; },
    clearTimeout: (h: number) => void timers.delete(h),
    setInterval: (fn: () => void, ms: number) => { const h = ++id; timers.set(h, { fn, at: now + ms, every: ms }); return h; },
    clearInterval: (h: number) => void timers.delete(h),
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = Math.max(now, next[1].at);
        if (next[1].every) next[1].at += next[1].every;
        else timers.delete(next[0]);
        next[1].fn();
      }
      now = end;
    },
    count: () => timers.size,
  };
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => any, what: string, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(15);
  }
  throw new Error(`Timed out waiting for ${what}. The tab says: ${String(pane()?.textContent ?? "").replace(/\s+/g, " ").slice(0, 400)} | dialog: ${String(top()?.textContent ?? "").replace(/\s+/g, " ").slice(0, 300)}`);
}
/** Moves the page's fake time forward and lets the answers to whatever that triggered arrive. */
async function tick(ms: number) {
  fake.advance(ms);
  await sleep(40);
}
const pane = (): any => doc.getElementById("power-pane-secrets");
const dialogs = (): any[] => [...doc.querySelectorAll(".modal-backdrop")];
const top = (): any => dialogs().at(-1);
const btn = (text: string, from: any = pane()): any => [...from.querySelectorAll("button")].find((b: any) => b.textContent.trim().startsWith(text));
const click = (el: any) => el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
const setValue = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
};
const key = (target: any, k: string, opts: Record<string, any> = {}) => target.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
const closeAll = () => {
  for (const d of dialogs()) d.remove();
  doc.querySelectorAll(".menu").forEach((m: any) => m.remove());
  doc.querySelectorAll("#toasts .toast").forEach((t: any) => t.remove());
};
const rowTitles = (): string[] => [...pane().querySelectorAll(".sx-rtitle")].map((e: any) => e.textContent);
const selectRow = async (title: string) => {
  const row = [...pane().querySelectorAll(".sx-row-item")].find((r: any) => r.querySelector(".sx-rtitle").textContent === title);
  if (!row) throw new Error(`No row called ${title}`);
  click(row);
  await until(() => pane().querySelector(".sx-detail h2")?.textContent === title, `the detail of ${title}`);
};
const toasts = () => doc.querySelector("#toasts")?.textContent ?? "";
const chooseMenu = async (anchorText: string, itemText: string) => {
  click(btn(anchorText));
  await until(() => doc.querySelector(".menu"), "a menu");
  click([...doc.querySelectorAll(".menu-item")].find((b: any) => b.textContent.includes(itemText)));
};
const op = async (name: string, body: Record<string, any> = {}) => (await secretsOperations[name]!(server.context, body)) as any;

beforeAll(async () => {
  mock.module("../resources/file_manager/ui/terminal.js", () => ({ terminalShell: () => "posix", terminalWsl: () => ({}),
    terminalAvailable: () => true, typeInTerminal: () => true, showTerminal() {}, hideTerminal() {}, toggleTerminal() {}, wireTerminal() {}, isTerminalOpen: () => false,
  }));
  mkdirSync(home, { recursive: true });
  server = startFileManagerServer({
    port: 0,
    token: "ui-token",
    context: {
      home, dataDir: join(root, "data"), platform: "linux",
      secrets: {
        kdf: TINY, backupMinIntervalMs: 0, store,
        clipboard: { read: () => clip.text, write: (t) => ((clip.text = t), true) },
        fetch: async (url) => ({ ok: true, status: 200, text: async () => (fetchLog.push(url), breachReply.text) }),
      },
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const html = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "index.html"), "utf8").replace(/__FM_TOKEN__/g, "ui-token").replace(/__FM_PLATFORM__/g, "linux").replace(/__FM_NONCE__/g, "n").replace(/__FM_START__/g, "");
  const dom = new JSDOM(html, { url: `${base}/` });
  const g = globalThis as any;
  for (const k of GLOBALS) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
  for (const k of GLOBALS.filter((x) => x !== "fetch")) Object.defineProperty(g, k, { value: (dom.window as any)[k], configurable: true, writable: true });
  const realFetch = saved.get("fetch")!.value as typeof fetch;
  Object.defineProperty(g, "fetch", { value: (u: any, o: any) => realFetch(typeof u === "string" && u.startsWith("/") ? base + u : u, o), configurable: true, writable: true });
  doc = dom.window.document;
  win = dom.window;
  for (const name of ["replaceChildren", "append", "prepend"]) {
    const original = (win.Element.prototype as any)[name];
    (win.Element.prototype as any)[name] = function (...args: any[]) {
      for (const a of args) if (a === null || a === undefined || Array.isArray(a)) badInsertions.push(`${name}(${a === null ? "null" : a === undefined ? "undefined" : "an array"}) on .${this.className}`);
      return original.apply(this, args);
    };
  }
  sstate = (await import("../resources/file_manager/ui/state.js")).state;
  sstate.platform = "linux";
  sstate.sep = "/";
  sstate.home = home;
  sstate.location = { kind: "folder", path: home };
  clockMod = await import("../resources/file_manager/ui/secretsClock.js");
  clockMod.setClock(fake);
  power = await import("../resources/file_manager/ui/power.js");
  section = await import("../resources/file_manager/ui/copysection.js");
  sx = (await import("../resources/file_manager/ui/secretsState.js")).sx;
  await import("../resources/file_manager/ui/secrets.js");
  // Other test files in the same process may have started the page first, on their own fake window.
  const watch = await import("../resources/file_manager/ui/secretsStatus.js");
  watch.stopStatusWatch();
  watch.startStatusWatch();
  power.resetPower();
  sx.status = null;
  power.wirePower();
  power.openPower("secrets");
  section.startCopySections();
  await until(() => pane()?.textContent.includes("Create your secret space"), "the wizard");
});

afterAll(async () => {
  closeAll();
  try {
    clockMod.setClock();
    await op("secrets/lock");
  } catch {
    // already gone
  }
  section?.stopCopySections();
  (await import("../resources/file_manager/ui/secretsStatus.js")).stopStatusWatch();
  const g = globalThis as any;
  for (const k of GLOBALS) {
    const d = saved.get(k);
    if (d) Object.defineProperty(g, k, d);
    else delete g[k];
  }
  mock.restore();
  server?.stop(true);
  rmSync(root, { recursive: true, force: true });
});

/** Everything a person could look at or a script could read, other than text: attributes, the title, the address, storage. */
function nonTextDump(): string {
  const out: string[] = [doc.title, String(win.location.href), JSON.stringify({ ...win.localStorage }), JSON.stringify({ ...win.sessionStorage })];
  for (const el of doc.querySelectorAll("*")) for (const a of el.attributes) out.push(`${a.name}=${a.value}`);
  return out.join("\n");
}
const allText = (): string => doc.documentElement.textContent;

describe("first run", () => {
  test("the wizard says what the vault is, that there is no reset, and keeps Create off until the password is good and repeated", async () => {
    const p = pane();
    expect(p.textContent).toContain("Create your secret space");
    expect(p.textContent).toContain("There is no password reset");
    expect(p.textContent).toContain("recovery key");
    const create = btn("Create my vault");
    expect(create.disabled).toBe(true);
    const [first, second] = p.querySelectorAll("input[type=password]");
    for (const el of [first, second]) {
      expect(el.getAttribute("autocomplete")).toBe("off");
      expect(el.getAttribute("spellcheck")).toBe("false");
    }
    setValue(first, "short");
    setValue(second, "short");
    await tick(300);
    await until(() => p.textContent.includes("✗"), "the verdict on a weak password");
    expect(create.disabled).toBe(true);
    setValue(first, MASTER);
    setValue(second, "not-the-same");
    await tick(300);
    await until(() => p.textContent.includes("✓ This master password"), "the verdict on a good password");
    expect(create.disabled).toBe(true);
    setValue(second, MASTER);
    expect(create.disabled).toBe(false);
    // the passphrase suggester fills both boxes without typing: that must count too
    click(btn("Suggest a passphrase"));
    await until(() => first.value !== MASTER && first.value.split("-").length === 6, "a suggested passphrase");
    expect(create.disabled).toBe(true);
    for (let i = 0; i < 20 && create.disabled; i++) await tick(300);
    expect(create.disabled).toBe(false);
    setValue(first, MASTER);
    setValue(second, MASTER);
    for (let i = 0; i < 20 && create.disabled; i++) await tick(300);
    expect(create.disabled).toBe(false);
    // the measured unlock time for each strength, on this computer
    click(btn("Measure on this computer"));
    await until(() => /Standard: about [\d.]+ s/.test(p.textContent) && /Maximum: about/.test(p.textContent), "the measurements");
    expect(p.textContent).toMatch(/Strong: about/);
  });

  test("creating shows the recovery key once (and won't go on until it is ticked), then offers 'Unlock with this computer'", async () => {
    click(btn("Create my vault"));
    await until(() => top()?.textContent.includes("Your recovery key"), "the recovery key");
    const code = top().querySelector(".sx-recovery").textContent;
    expect(code).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    recoveryKey = code;
    const next = btn("Continue", top());
    expect(next.disabled).toBe(true);
    next.click(); // a disabled button does nothing
    expect(top().textContent).toContain("Your recovery key");
    key(doc, "Escape"); // closing the window without saying "saved" shows the key again
    await until(() => top()?.textContent.includes("Your recovery key"), "the key shown again");
    const copyBtn = btn("Copy to clipboard", top());
    expect(copyBtn.title).toContain("instead of typing");
    expect(btn("Save to a file", top()).title).toContain("only you can read");
    clip.text = "";
    click(copyBtn);
    await until(() => clip.text === recoveryKey, "the recovery key on the clipboard");
    await until(() => doc.body.textContent.includes("Recovery key copied"), "the toast");
    expect(doc.body.textContent.includes(recoveryKey)).toBe(true); // only the window shows it
    expect(doc.querySelector(".toast, [role=status]")?.textContent ?? "").not.toContain(recoveryKey);
    const check = top().querySelector("#sx-rk-saved");
    check.checked = true;
    check.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect(btn("Continue", top()).disabled).toBe(false);
    click(btn("Continue", top()));
    await until(() => top()?.textContent.includes("Unlock with this computer"), "the offer of the computer shortcut");
    expect(allText().includes(recoveryKey)).toBe(false);
    expect(top().textContent).toContain("anyone who can use your logged-in computer account");
    click(btn("Close", top()));
    await until(() => btn("New item"), "the vault screen");
    expect(pane().textContent).toContain("No items yet");
    expect(doc.querySelector(".secrets-pill").textContent).toMatch(/^🔓 Unlocked · locks in \d:\d\d$/);
  });
});

describe("working with items", () => {
  test("New item → Login: fill in, generate a password, save; the list and the detail show it without the secrets", async () => {
    await chooseMenu("New item", "Login");
    await until(() => pane().querySelector("form.sx-form"), "the form");
    const form = pane().querySelector("form.sx-form");
    const input = (label: string) => doc.getElementById([...form.querySelectorAll("label")].find((l: any) => l.textContent.trim().startsWith(label)).getAttribute("for"));
    setValue(input("Title"), "Example Bank");
    setValue(input("Username"), "alice@example.com");
    setValue(input("Website"), "https://bank.example.com/login");
    // the generator
    click(btn("Generate", form));
    await until(() => form.querySelector(".sx-gen-out")?.textContent.length > 8, "a generated password");
    expect(form.querySelector(".sx-gen")).toBeTruthy();
    const length = form.querySelector(".sx-gen input[type=range]");
    setValue(length, "32");
    await until(() => form.querySelector(".sx-gen-out").textContent.length === 32, "a longer password");
    const mode = form.querySelector(".sx-gen select");
    mode.value = "passphrase";
    mode.dispatchEvent(new win.Event("change", { bubbles: true }));
    await until(() => form.querySelector(".sx-gen-out").textContent.split("-").length >= 5, "a passphrase");
    expect(form.querySelector(".sx-gen [role=status]").textContent).toMatch(/about \d+ bits/);
    mode.value = "password";
    mode.dispatchEvent(new win.Event("change", { bubbles: true }));
    await until(() => form.querySelector(".sx-gen-out").textContent.length === 32, "random characters again");
    setValue(input("Password"), M.pw);
    expect(input("Password").type).toBe("password");
    click(btn("Show", input("Password").parentElement));
    expect(input("Password").type).toBe("text");
    setValue(input("One-time code"), M.totp);
    setValue(form.querySelector("textarea"), `${M.note}\n\nsecond **paragraph**`);
    setValue(input("Tags"), "money, important");
    expect(nonTextDump().includes(M.pw)).toBe(false); // typed values live in the boxes' value property, not in attributes
    click(btn("Save", form));
    await until(() => rowTitles().includes("Example Bank"), "the saved item in the list");
    await until(() => pane().querySelector(".sx-detail h2")?.textContent === "Example Bank", "the detail");
    const detail = pane().querySelector(".sx-detail");
    expect(detail.textContent).toContain("alice@example.com");
    expect(detail.textContent).toContain("https://bank.example.com/login");
    expect(detail.textContent).not.toContain(M.pw);
    expect(detail.textContent).not.toContain(M.note);
    expect(detail.textContent).not.toContain(M.totp);
    expect(nonTextDump()).not.toContain(M.pw);
    expect(pane().querySelector(".sx-row-item .sx-badge")?.textContent).toBeTruthy();
  });

  test("Reveal shows the password only in a text node, hides it after 15 seconds, and Copy never passes it through the page", async () => {
    const detail = pane().querySelector(".sx-detail");
    const row = [...detail.querySelectorAll(".sx-field")].find((r: any) => r.textContent.startsWith("Password"));
    const reveal = btn("Reveal", row);
    expect(reveal.getAttribute("aria-label")).toBe("Show Password");
    click(reveal);
    await until(() => row.querySelector(".sx-value").textContent === M.pw, "the revealed password");
    expect(nonTextDump().includes(M.pw)).toBe(false);
    expect(row.querySelector("button[aria-pressed=true]")).toBeTruthy();
    await tick(14_000);
    expect(row.querySelector(".sx-value").textContent).toBe(M.pw);
    await tick(1_100);
    expect(row.querySelector(".sx-value").textContent).toBe("••••••••");
    expect(allText().includes(M.pw)).toBe(false);
    // Hide by hand, and the other hiding triggers: window blur
    click(reveal);
    await until(() => row.querySelector(".sx-value").textContent === M.pw, "revealed again");
    win.dispatchEvent(new win.Event("blur"));
    expect(row.querySelector(".sx-value").textContent).toBe("••••••••");
    // copying is done by the server
    clip.text = "";
    click(btn("Copy", row));
    await until(() => clip.text === M.pw, "the server's clipboard");
    expect(row.querySelector(".sx-value").textContent).toBe("••••••••");
    // The server fills the clipboard before the page hears back, so the confirmation can arrive a moment later.
    await until(() => !!(btn("Copied", row) ?? row.textContent.includes("Copied")), "the Copied confirmation");
    expect(btn("Copied", row) ?? row.textContent.includes("Copied")).toBeTruthy();
    expect(doc.querySelector("#live").textContent + toasts()).not.toContain(M.pw);
    expect(allText().includes(M.pw)).toBe(false);
  });

  test("the one-time code shows with a countdown ring, ticks down, renews itself and copies", async () => {
    const detail = pane().querySelector(".sx-detail");
    const row = [...detail.querySelectorAll(".sx-field")].find((r: any) => r.textContent.startsWith("One-time code"));
    expect(row.textContent).not.toMatch(/\d{3} \d{3}/);
    click(btn("Show code", row));
    await until(() => /^\d{3} \d{3}$/.test(row.querySelector(".sx-code").textContent), "the code");
    const ring = row.querySelector(".sx-ring");
    expect(ring.hidden).toBe(false);
    const left = Number(ring.firstChild.textContent);
    expect(left).toBeGreaterThan(0);
    expect(ring.getAttribute("aria-label")).toBe(`${left} seconds left for this code`);
    await tick(1000);
    expect(Number(ring.firstChild.textContent)).toBe(left - 1);
    await tick((left + 1) * 1000);
    await until(() => Number(ring.firstChild.textContent) > 20 || /^\d{3} \d{3}$/.test(row.querySelector(".sx-code").textContent), "a renewed code");
    expect(row.querySelector(".sx-code").textContent).toMatch(/^\d{3} \d{3}$/);
    clip.text = "";
    click(btn("Copy", row));
    await until(() => /^\d{6}$/.test(clip.text), "the code on the clipboard");
    win.dispatchEvent(new win.Event("blur"));
    expect(row.querySelector(".sx-code").textContent).toBe("••• •••");
    expect(ring.hidden).toBe(true);
  });

  test("notes are shown only on request, as safe formatted text, and hidden again", async () => {
    const detail = pane().querySelector(".sx-detail");
    expect(detail.textContent).not.toContain(M.note);
    click(btn("Show notes", detail));
    await until(() => detail.querySelector(".sx-notes")?.textContent.includes(M.note), "the notes");
    expect(detail.querySelector(".sx-notes strong")?.textContent).toBe("paragraph");
    expect(nonTextDump()).not.toContain(M.note);
    await tick(61_000);
    expect(detail.querySelector(".sx-notes").textContent).toBe("");
  });

  test("more items: a note with a script in it, a card and a login; HTML in notes is shown as text, never run", async () => {
    await op("secrets/save", { item: { type: "note", title: "Plans", notes: `<img src=x onerror="window.__pwned=1"> ${M.note}-2 [click](javascript:alert(1))` } });
    await op("secrets/save", { item: { type: "card", title: "Visa", fields: { cardholder: "A Person", number: M.card, cvv: "321" }, favorite: true } });
    await op("secrets/save", { item: { type: "login", title: "Mail", fields: { username: "bob", password: M.pw, url: "mail.example.org" }, custom: [{ label: "pin", kind: "hidden", value: M.custom }], tags: ["money"] } });
    sx.status = (await op("secrets/status")).status;
    doc.defaultView.dispatchEvent(new win.Event("focus"));
    click(btn("Health report")); // opens and closes: also forces a list refresh below
    await until(() => top()?.textContent.includes("Password health"), "the health report");
    click(btn("Close", top()));
    const { emit } = await import("../resources/file_manager/ui/state.js");
    emit("secrets-items");
    await until(() => rowTitles().length >= 4, "four items");
    expect(rowTitles()).toEqual(["Visa", "Example Bank", "Mail", "Plans"]); // favorites first, then A–Z
    click(pane().querySelectorAll(".sx-row-item")[3]);
    await until(() => pane().querySelector(".sx-detail h2")?.textContent === "Plans", "the Plans note");
    click(btn("Show notes", pane().querySelector(".sx-detail")));
    await until(() => pane().querySelector(".sx-notes")?.textContent.includes(`${M.note}-2`), "the note text");
    expect((win as any).__pwned).toBeUndefined();
    expect(pane().querySelector(".sx-notes img")).toBeNull();
    expect(pane().querySelector(".sx-notes a")).toBeNull();
    expect(nonTextDump().includes("javascript:")).toBe(false);
    expect(nonTextDump().includes("onerror")).toBe(false);
  });

  test("search filters instantly by title, user name, address, tag and note text, never by password; chips filter by kind", async () => {
    const search = pane().querySelector(".sx-search");
    const typeAndSettle = async (text: string) => {
      setValue(search, text);
      await tick(200);
      await sleep(60);
    };
    await typeAndSettle("bank");
    await until(() => rowTitles().join() === "Example Bank", "the bank");
    await typeAndSettle("bob");
    await until(() => rowTitles().join() === "Mail", "bob's login");
    await typeAndSettle("mail.example.org");
    await until(() => rowTitles().join() === "Mail", "the address");
    await typeAndSettle(`${M.note}-2`);
    await until(() => rowTitles().join() === "Plans", "the note body");
    await typeAndSettle(M.pw);
    await until(() => rowTitles().length === 0 && pane().textContent.includes("Nothing matches"), "no password search");
    await typeAndSettle("");
    await until(() => rowTitles().length === 4, "all again");
    click(btn("Cards"));
    await until(() => rowTitles().join() === "Visa", "cards");
    expect(btn("Cards").getAttribute("aria-pressed")).toBe("true");
    click(btn("Favorites"));
    await until(() => rowTitles().join() === "Visa", "favorites");
    click(btn("Notes"));
    await until(() => rowTitles().join() === "Plans", "notes");
    click(btn("Logins"));
    await until(() => rowTitles().length === 2, "logins");
    click(btn("All"));
    await until(() => rowTitles().length === 4, "all");
    click(btn("Weak or reused"));
    await until(() => rowTitles().join() === "Example Bank, Mail" || rowTitles().length === 2, "the reused ones");
    click(btn("All"));
    await until(() => rowTitles().length === 4, "all once more");
  });

  test("keyboard: / goes to search, arrows move through the list, Enter opens, Ctrl+Shift+C copies the password", async () => {
    const scroller = pane().querySelector(".sx-scroll");
    key(scroller, "/");
    expect(doc.activeElement).toBe(pane().querySelector(".sx-search"));
    scroller.focus();
    const selected = () => pane().querySelector(".sx-row-item.selected .sx-rtitle")?.textContent;
    const start = selected();
    key(scroller, "ArrowDown");
    await until(() => selected() !== start, "the next row");
    await until(() => pane().querySelector(".sx-detail h2")?.textContent === selected(), "its detail");
    key(scroller, "Home");
    expect(selected()).toBe("Visa");
    key(scroller, "End");
    expect(selected()).toBe("Plans");
    expect(scroller.getAttribute("aria-activedescendant")).toMatch(/^sx-opt-/);
    key(scroller, "Enter");
    key(scroller, "Home");
    key(scroller, "ArrowDown");
    key(scroller, "ArrowDown");
    await until(() => pane().querySelector(".sx-detail h2")?.textContent === "Mail", "Mail's detail");
    clip.text = "";
    key(scroller, "C", { ctrlKey: true, shiftKey: true });
    await until(() => clip.text === M.pw, "the copied password");
  });

  test("a custom hidden field is secret too; Duplicate, favorite, Trash, Restore and Delete for good", async () => {
    const detail = pane().querySelector(".sx-detail");
    const pin = [...detail.querySelectorAll(".sx-field")].find((r: any) => r.textContent.startsWith("pin"));
    expect(pin.textContent).not.toContain(M.custom);
    click(btn("Reveal", pin));
    await until(() => pin.querySelector(".sx-value").textContent === M.custom, "the hidden field");
    win.dispatchEvent(new win.Event("blur"));
    click(btn("Duplicate", detail));
    await until(() => rowTitles().includes("Mail (copy)"), "the copy");
    await until(() => pane().querySelector(".sx-detail h2")?.textContent === "Mail (copy)", "the copy's detail");
    click(btn("Move to Trash", pane().querySelector(".sx-detail")));
    await until(() => !rowTitles().includes("Mail (copy)"), "the copy gone");
    expect(toasts()).toContain("Moved to the Trash");
    click(btn("Trash"));
    await until(() => rowTitles().join() === "Mail (copy)", "the Trash list");
    expect(btn("Empty the Trash…").hidden).toBe(false);
    await until(() => btn("Restore", pane().querySelector(".sx-detail")), "Restore");
    click(btn("Restore", pane().querySelector(".sx-detail")));
    await until(() => rowTitles().length === 0, "the Trash empty");
    click(btn("All"));
    await until(() => rowTitles().includes("Mail (copy)"), "restored");
    await selectRow("Mail (copy)");
    click(btn("Move to Trash", pane().querySelector(".sx-detail")));
    await until(() => !rowTitles().includes("Mail (copy)"), "trashed again");
    click(btn("Trash"));
    await until(() => rowTitles().join() === "Mail (copy)", "in the Trash again");
    click(btn("Empty the Trash…"));
    await until(() => top()?.textContent.includes("Empty the Trash?"), "the confirmation");
    click(btn("Empty the Trash", top()));
    await until(() => rowTitles().length === 0, "the Trash emptied");
    click(btn("All"));
    await until(() => rowTitles().length === 4, "back to four");
  });

  test("editing: the form loads the secrets masked, keeps what isn't changed, and Cancel asks before throwing changes away", async () => {
    await selectRow("Mail");
    click(btn("Edit", pane().querySelector(".sx-detail")));
    await until(() => pane().querySelector("form.sx-form"), "the edit form");
    const form = pane().querySelector("form.sx-form");
    const pw = [...form.querySelectorAll("input")].find((i: any) => i.value === M.pw);
    expect(pw.type).toBe("password");
    expect(nonTextDump().includes(M.pw)).toBe(false);
    setValue(form.querySelector("input"), "Mail (edited)");
    click(btn("Cancel", form));
    await until(() => top()?.textContent.includes("Discard your changes?"), "the question");
    click(btn("Keep editing", top()));
    await until(() => !top(), "the dialog gone");
    click(btn("Save", form));
    await until(() => rowTitles().includes("Mail (edited)"), "the saved title");
    expect((await op("secrets/reveal", { id: (await op("secrets/list", { query: "edited" })).items[0].id, field: "password" })).value).toBe(M.pw);
  });
});

describe("health report, import, settings", () => {
  test("the health report lists the problems with fixes, and the breach check explains what it sends, only when asked", async () => {
    await op("secrets/save", { item: { type: "login", title: "Twin", fields: { username: "t", password: M.pw, url: "https://twin.example" } } });
    await op("secrets/save", { item: { type: "login", title: "Code host", fields: { username: "dev", password: "Unique-Strong-7788-Xq!", url: "https://github.com/login" } } });
    click(btn("Health report"));
    await until(() => top()?.textContent.includes("Reused passwords"), "the reused section");
    const d = top();
    expect(d.textContent).toContain("Every site should have its own password");
    expect(d.textContent).not.toContain(M.pw);
    expect(d.textContent).toContain("Two-step sign-in");
    expect(fetchLog.length).toBe(0);
    click(btn("Check for known breaches", d));
    await until(() => dialogs().length === 2 && top().textContent.includes("sends ONLY its first 5 characters"), "the explanation");
    expect(fetchLog.length).toBe(0);
    click(btn("Cancel", top()));
    await until(() => dialogs().length === 1, "the explanation closed");
    expect(fetchLog.length).toBe(0);
    breachReply.text = "";
    click(btn("Check for known breaches", d));
    await until(() => dialogs().length === 2, "the explanation again");
    click(btn("Check now", top()));
    await until(() => d.querySelector(".sx-breach")?.textContent.includes("none was found"), "the result");
    expect(fetchLog.length).toBeGreaterThan(0);
    for (const u of fetchLog) expect(u).toMatch(/\/range\/[0-9A-F]{5}$/);
    click(btn("Mail", d) ?? btn("Twin", d)); // jumping to an item closes the report and selects it
    await until(() => dialogs().length === 0, "the report closed");
  });

  test("Import…: a preview first (with counts, duplicates and a sample), then the commit; nothing is changed by the preview", async () => {
    const csv = join(root, "export.csv");
    writeFileSync(csv, "name,url,username,password\nImported One,https://one.example,u1,pw-one-Zq!\nImported Two,https://two.example,u2,pw-two-Zq!\nExample Bank,https://bank.example.com/login,alice@example.com,whatever\n");
    const before = (await op("secrets/list", {})).total;
    click(btn("Import…"));
    await until(() => top()?.textContent.includes("Import or restore"), "the dialog");
    const d = top();
    setValue(d.querySelector("input[type=text]"), csv);
    click(btn("Preview", d));
    await until(() => d.textContent.includes("Found 3 items from Chrome or Edge"), "the preview");
    expect(d.textContent).toContain("Imported One");
    expect(d.textContent).not.toContain("pw-one-Zq!");
    expect((await op("secrets/list", {})).total).toBe(before);
    expect(rowTitles().includes("Imported One")).toBe(false);
    click(btn("Import 3 items", d));
    await until(() => rowTitles().includes("Imported One") && rowTitles().includes("Imported Two"), "the imported items");
    expect(toasts()).toContain("Now delete the file you imported");
    // a second time: they are all duplicates now
    click(btn("Import…"));
    await until(() => top()?.textContent.includes("Import or restore"), "the dialog again");
    const again = top();
    setValue(again.querySelector("input[type=text]"), csv);
    click(btn("Preview", again));
    await until(() => again.textContent.includes("Found 0 items") && again.textContent.includes("already in your vault will be skipped"), "all duplicates");
    click(btn("Cancel", again));
  });

  test("Settings: auto-lock, clipboard and lock-on-blur are saved in the vault, and 'Never' says what that means", async () => {
    click(btn("Settings"));
    await until(() => top()?.textContent.includes("Vault settings"), "the dialog");
    const d = top();
    const [lock, clipSel] = d.querySelectorAll("select");
    expect(lock.value).toBe("5");
    expect(clipSel.value).toBe("30");
    expect(d.querySelector(".sx-warning:not([hidden])")).toBeNull();
    lock.value = "0";
    lock.dispatchEvent(new win.Event("change", { bubbles: true }));
    expect(d.querySelector(".sx-warning:not([hidden])")?.textContent).toContain("stays open until you lock it");
    lock.value = "10";
    lock.dispatchEvent(new win.Event("change", { bubbles: true }));
    clipSel.value = "60";
    d.querySelector("input[type=checkbox]").checked = true;
    click(btn("Save settings", d));
    await until(() => !top(), "the dialog closed");
    const s = (await op("secrets/status")).status.settings;
    expect(s).toMatchObject({ autoLockMinutes: 10, clipboardSeconds: 60, lockOnBlur: true });
  });

  test("Vault info and the activity log tell the truth, and Export backup writes an encrypted file", async () => {
    await chooseMenu("More", "Vault info");
    await until(() => top()?.textContent.includes("Vault info"), "the info");
    expect(top().textContent).toContain("RADSEC v1");
    expect(top().textContent).toContain("Unlock with this computer");
    expect(top().textContent).toContain("not been independently audited");
    click(btn("Close", top()));
    await chooseMenu("More", "Activity log");
    await until(() => top()?.textContent.includes("Vault created"), "the log");
    expect(top().textContent).not.toContain("Example Bank");
    click(btn("Close", top()));
    await until(() => !top(), "closed");
    await chooseMenu("More", "Export an encrypted backup");
    await until(() => top()?.textContent.includes("Export an encrypted backup"), "the export dialog");
    const name = top().querySelector("input[type=text]");
    setValue(name, "my-backup.radsec");
    click(btn("Save the backup", top()));
    await until(() => toasts().includes("Backup saved"), "the toast");
    const raw = readFileSync(join(home, "my-backup.radsec")).toString("latin1");
    expect(raw.startsWith("RADSEC01")).toBe(true);
    expect(raw.includes("Example Bank")).toBe(false);
    expect(raw.includes(M.pw)).toBe(false);
  });

  test("the plain-text export asks for the password, a tick and a loud warning", async () => {
    await chooseMenu("More", "Export as plain text");
    await until(() => top()?.textContent.includes("NOT encrypted"), "the warning");
    const d = top();
    expect(d.textContent).toContain("WARNING");
    setValue(d.querySelector("input[type=password]"), MASTER);
    setValue(d.querySelector("input[type=text]"), "plain.csv");
    click(btn("Export without encryption", d));
    await until(() => d.querySelector(".dialog-error:not([hidden])"), "the refusal without the tick");
    d.querySelector("#sx-csv-agree").checked = true;
    click(btn("Export without encryption", d));
    await until(() => toasts().includes("is NOT encrypted"), "the done message");
    expect(readFileSync(join(home, "plain.csv"), "utf8")).toContain("Example Bank");
  });
});

describe("locking, unlocking and what is left behind", () => {
  test("Lock now empties the screen of every secret; the status pill follows; nothing is in storage, attributes or the address", async () => {
    const detail = pane().querySelector(".sx-detail");
    const row = [...detail.querySelectorAll(".sx-field")].find((r: any) => r.textContent.startsWith("Password"));
    if (row) {
      click(btn("Reveal", row));
      await until(() => row.querySelector(".sx-value").textContent !== "••••••••", "a revealed value");
    }
    expect(doc.querySelector(".secrets-pill").textContent).toMatch(/Unlocked/);
    click(btn("🔒 Lock now"));
    await until(() => pane().textContent.includes("Your secret space is locked"), "the locked screen");
    for (const m of [M.pw, M.note, M.totp, M.card, M.custom, "Example Bank", "alice@example.com", "bob"]) {
      expect(allText().includes(m), `text: ${m}`).toBe(false);
      expect(nonTextDump().includes(m), `attributes: ${m}`).toBe(false);
    }
    expect(doc.querySelector(".secrets-pill").textContent).toBe("🔒 Locked");
    expect(win.localStorage.length + win.sessionStorage.length).toBe(0);
    expect(pane().querySelector("input[type=password]").getAttribute("autocomplete")).toBe("off");
  });

  test("a wrong password gives the plain message, a countdown after a few tries, and the right one opens", async () => {
    const p = pane();
    const pw = p.querySelector("#sx-unlock-pw");
    const msg = () => p.querySelector(".sx-error");
    const unlock = () => btn("Unlock", p);
    for (let i = 0; i < 3; i++) {
      setValue(pw, `Wrong-password-${i}-Zq!`);
      click(unlock());
      await until(() => !msg().hidden && /Wrong password or key/.test(msg().textContent) || /Too many/.test(msg().textContent), `failure ${i}`);
      await until(() => !unlock().disabled || /Too many/.test(msg().textContent), "the button again");
    }
    expect(msg().textContent).toMatch(/Too many wrong attempts. Try again in \d+ seconds?/);
    expect(unlock().disabled).toBe(true);
    await tick(2500);
    expect(unlock().disabled).toBe(false);
    expect(msg().hidden).toBe(true);
    await sleep(1100); // the server's own wait runs on real time
    setValue(pw, MASTER);
    click(unlock());
    await until(() => btn("New item"), "the vault again");
    expect(pw.value).toBe("");
  });

  test("lock on blur: switching away locks, when it is turned on", async () => {
    expect(sx.status.settings.lockOnBlur).toBe(true);
    win.dispatchEvent(new win.Event("blur"));
    await until(() => pane().textContent.includes("Your secret space is locked"), "locked by blur");
    // the settings are inside the locked vault, so unlocking brings them back
    const pw = pane().querySelector("#sx-unlock-pw");
    setValue(pw, MASTER);
    click(btn("Unlock", pane()));
    await until(() => btn("New item"), "the vault");
  });

  test("the server locking it (idle timeout) is noticed by the status check, with a plain note", async () => {
    // the vault is locked behind the page's back, as the idle timer would do
    const { secretsService } = await import("../src/features/filemanager/fmSecretsService");
    secretsService(server.context).lock("auto-lock");
    await tick(10_000);
    await until(() => pane().textContent.includes("Your secret space is locked"), "the locked screen");
    expect(toasts()).toContain("locked itself after being idle");
    closeAll();
    setValue(pane().querySelector("#sx-unlock-pw"), MASTER);
    click(btn("Unlock", pane()));
    await until(() => btn("New item"), "unlocked again");
  });

  test("the recovery key opens a vault whose password is forgotten, and the page then asks for a new master password", async () => {
    click(btn("🔒 Lock now"));
    await until(() => pane().textContent.includes("Your secret space is locked"), "locked");
    click(btn("Forgot the password?"));
    const box = pane().querySelector("#sx-unlock-rk");
    expect(pane().querySelector(".sx-recoverybox").hidden).toBe(false);
    setValue(box, "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA");
    click(btn("Unlock with the recovery key"));
    await until(() => /Wrong password or key/.test(pane().querySelector(".sx-error").textContent) || /Too many/.test(pane().querySelector(".sx-error").textContent), "refused");
    expect(box.value).toBe("");
    await tick(60_000);
    setValue(box, recoveryKey.toLowerCase());
    click(btn("Unlock with the recovery key"));
    await until(() => btn("New item"), "the vault via recovery");
    await until(() => pane().querySelector(".sx-banner:not([hidden])")?.textContent.includes("recovery key"), "the banner");
    click(btn("Change master password…", pane().querySelector(".sx-banner")));
    await until(() => top()?.textContent.includes("so no current password is needed"), "the dialog");
    const d = top();
    const [a, b] = d.querySelectorAll("input[type=password]");
    setValue(a, "A-brand-new-master-Passphrase-77");
    setValue(b, "A-brand-new-master-Passphrase-77");
    click(btn("Change password", d));
    await until(() => toasts().includes("Master password changed"), "changed");
  });
});

describe("the whole tab", () => {
  test("no 'null' or 'undefined' text, no inline colors, no copy-section buttons that could dump a secret", async () => {
    const states: string[] = [];
    states.push(pane().textContent);
    for (const item of [0, 1, 2, 3]) {
      click(pane().querySelectorAll(".sx-row-item")[item]);
      await sleep(120);
      states.push(pane().textContent);
    }
    for (const t of states) expect(t).not.toMatch(/\bnull\b|\bundefined\b|\[object/);
    section.scanCopySections();
    await sleep(80);
    expect(pane().querySelectorAll(".copy-bar, [data-copy-ui]").length).toBe(0);
    for (const el of pane().querySelectorAll("[style]")) expect(el.getAttribute("style"), el.className).toMatch(/^(padding-(top|bottom): [\d.]+px;? ?)+$/);
    const css = readFileSync(join(import.meta.dir, "..", "resources", "file_manager", "ui", "secrets.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|(?<![-\w])(?:white|black|red|green|blue|yellow|orange)(?![-\w])/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  test("nothing was ever inserted into the page as null, undefined or an array (a browser would print it as text)", () => {
    expect(badInsertions).toEqual([]);
  });

  test("every button and field has a visible name or aria-label and a beginner-friendly title", async () => {
    const controls: any[] = [...pane().querySelectorAll("button, input:not([type=hidden]), select, textarea")];
    const bad = controls.filter((el) => {
      const name = el.getAttribute("aria-label") || el.textContent.trim() || el.getAttribute("placeholder") || (el.id && doc.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
      return !name || !(el.getAttribute("title") || el.closest("label")?.getAttribute("title") || el.getAttribute("aria-label"));
    });
    expect(bad.map((el) => `${el.tagName} ${el.className} ${el.textContent.slice(0, 20)}`)).toEqual([]);
    for (const el of controls.filter((x) => x.tagName === "BUTTON")) expect(el.getAttribute("title") || el.getAttribute("aria-label")).toBeTruthy();
  });

  test("a vault of 2,500 items stays smooth: only the visible rows are drawn, and scrolling moves the window", async () => {
    const rows = ["title,url,username,password"];
    for (let i = 0; i < 2500; i++) rows.push(`Bulk ${String(i).padStart(4, "0")},https://b${i}.example,user${i},pw-${i}-Zq!x`);
    const pre = await op("secrets/import", { text: rows.join("\n") });
    await op("secrets/import", { commit: true, token: pre.token });
    const { emit } = await import("../resources/file_manager/ui/state.js");
    const started = performance.now();
    emit("secrets-items");
    await until(() => pane().querySelector(".sx-count")?.textContent.startsWith("25"), "the long list", 20_000);
    expect(performance.now() - started).toBeLessThan(15_000);
    expect(pane().querySelectorAll(".sx-row-item").length).toBeLessThan(60);
    expect(pane().querySelector(".sx-count").textContent).toMatch(/250\d items/);
    const scroller = pane().querySelector(".sx-scroll");
    scroller.scrollTop = 52 * 1200;
    scroller.dispatchEvent(new win.Event("scroll"));
    const pos = Number(pane().querySelector(".sx-row-item").getAttribute("aria-posinset"));
    expect(pos).toBeGreaterThan(1100);
    expect(pos).toBeLessThan(1300);
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new win.Event("scroll"));
  });

  test("opening the tab with a backup file (right-click → Open in Secrets) offers to restore it", async () => {
    closeAll();
    power.openPower("secrets", { restorePath: join(home, "my-backup.radsec") });
    await until(() => top()?.textContent.includes("Import or restore"), "the restore dialog");
    const input = top().querySelector("input[type=text]");
    expect(input.value).toBe(join(home, "my-backup.radsec"));
    expect(top().querySelector("input[value=backup]").checked).toBe(true);
    expect(top().textContent).toContain("Master password of that backup");
    closeAll();
  });
});
