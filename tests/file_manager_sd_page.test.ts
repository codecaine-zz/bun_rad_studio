import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { JSDOM } from "jsdom";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";

// The Replace tab, run for real in a fake browser (jsdom) against the real server. The fake browser's globals are
// removed again in afterAll so that other test files are not affected.
const GLOBALS = ["document", "window", "Node", "HTMLElement", "HTMLInputElement", "navigator", "location", "fetch"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

const root = mkdtempSync(join(tmpdir(), "fm-sd-ui-"));
const home = join(root, "home");
const work = join(home, "work");
let server: ReturnType<typeof startFileManagerServer>;
let doc: any;
let power: any;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pane = () => doc.getElementById("power-pane-sd")!;
const button = (text: string): any => [...pane().querySelectorAll("button")].find((b) => b.textContent!.includes(text));
const field = (label: string): any => [...pane().querySelectorAll("label")].find((x) => x.querySelector("span")?.textContent?.trim().startsWith(label))!.querySelector("input, textarea, select");
const type = (el: any, value: string) => {
  el.value = value;
  el.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
};
const click = async (text: string, wait = 400) => {
  button(text).click();
  await sleep(wait);
};
const rows = () => [...pane().querySelectorAll(".sd-table tbody tr")];
const dialogButton = (text: string): any => [...doc.querySelectorAll(".modal-backdrop button")].find((b: any) => b.textContent.trim() === text);
const read = (name: string) => readFileSync(join(work, name), "utf8");

beforeAll(async () => {
  mkdirSync(work, { recursive: true });
  writeFileSync(join(work, "a.txt"), "one\nfoo here\nthree\n");
  writeFileSync(join(work, "b.txt"), "foo foo\n");
  writeFileSync(join(work, "c.txt"), "nothing\n");
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
  await import("../resources/file_manager/ui/sd.js");
  power.wirePower();
  power.openPower("sd", { targets: [work] });
  await sleep(300);
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

describe("the Replace tab in a browser-like page", () => {
  test("opens with the targets prefilled, and every control has a label and a tooltip", () => {
    expect(field("Files and folders").value).toBe(work);
    const controls = [...pane().querySelectorAll("button, input, textarea, select")];
    expect(controls.length).toBeGreaterThan(15);
    for (const c of controls) {
      expect(c.getAttribute("title"), c.outerHTML.slice(0, 100)).toBeTruthy();
      if (c.tagName !== "BUTTON") expect((c as any).labels?.length || c.getAttribute("aria-label"), c.outerHTML.slice(0, 100)).toBeTruthy();
    }
    expect(pane().querySelectorAll("[style]").length).toBe(0);
    expect(button("Replace in ticked").disabled).toBe(true);
    expect(button("Replace in ticked").title).toContain("Preview");
    expect(button("Undo").disabled).toBe(true);
  });

  test("a preset fills in the boxes, and Swap exchanges Find and Replace", () => {
    const select = field("Presets");
    select.value = String([...select.options].findIndex((o: any) => o.textContent === "http:// → https://") - 1);
    select.dispatchEvent(new doc.defaultView.Event("change", { bubbles: true }));
    expect(field("Find").value).toBe("http://");
    expect(field("Replace with").value).toBe("https://");
    expect(field("Plain text").checked).toBe(true);
    button("Swap").click();
    expect(field("Find").value).toBe("https://");
    button("Clear").click();
    expect(field("Find").value).toBe("");
  });

  test("an empty Find is explained, nothing runs", async () => {
    await click("Preview changes", 100);
    expect(pane().querySelector(".sd-message").textContent).toContain("Type what to look for");
  });

  test("count shows per-file counts and the numbers; the tick boxes wait for a preview", async () => {
    type(field("Find"), "foo");
    type(field("Replace with"), "bar");
    await click("Count matches");
    expect(rows().length).toBe(2);
    expect(rows().map((r: any) => r.children[2].textContent)).toEqual(["1", "2"]);
    expect([...pane().querySelectorAll(".sd-stat-n")].map((e: any) => e.textContent).slice(0, 3)).toEqual(["3", "2", "3"]);
    expect(rows()[0].querySelector("input").disabled).toBe(true);
    expect(button("Replace in ticked").disabled).toBe(true);
  });

  test("preview ticks the files that would change, and the diff shows + and − marks", async () => {
    await click("Preview changes");
    expect(rows().length).toBe(2);
    expect(rows().every((r: any) => r.querySelector("input").checked)).toBe(true);
    expect(rows()[0].children[3].textContent).toBe("+1 / −1");
    rows()[0].querySelector(".sd-file").click();
    await sleep(300);
    const lines = [...pane().querySelectorAll(".sd-diff .sd-line")];
    const add = lines.find((l: any) => l.classList.contains("sd-add")) as any;
    const del = lines.find((l: any) => l.classList.contains("sd-del")) as any;
    expect(add.querySelector(".sd-mark").textContent).toBe("+");
    expect(add.textContent).toContain("bar here");
    expect(del.querySelector(".sd-mark").textContent).toBe("−");
    expect(rows()[0].getAttribute("aria-selected")).toBe("true");
    expect(button("Replace in ticked").disabled).toBe(false);
    expect(read("a.txt")).toContain("foo here");
  });

  test("changing a setting after the preview blocks Replace until the next preview", async () => {
    type(field("Replace with"), "baz");
    expect(button("Replace in ticked").disabled).toBe(true);
    expect(button("Replace in ticked").title).toContain("changed the settings");
    expect(pane().querySelector(".sd-message").textContent).toContain("Press Preview changes again");
    type(field("Replace with"), "bar");
    await click("Preview changes");
    expect(button("Replace in ticked").disabled).toBe(false);
  });

  test("the confirm dialog says what will change; cancelling changes nothing; confirming replaces only ticked files", async () => {
    rows()[1].querySelector("input").click();
    await sleep(50);
    expect(pane().querySelector(".sd-results .pw-status").textContent).toContain("1 file ticked");
    await click("Replace in ticked", 100);
    const text = doc.querySelector(".modal-backdrop").textContent;
    expect(text).toContain("Replace in 1 file?");
    expect(text).toContain("1 place in 1 file");
    expect(text).toContain("No backup copies");
    dialogButton("Cancel").click();
    await sleep(100);
    expect(read("a.txt")).toContain("foo here");
    await click("Replace in ticked", 100);
    dialogButton("Replace").click();
    await sleep(500);
    expect(read("a.txt")).toBe("one\nbar here\nthree\n");
    expect(read("b.txt")).toBe("foo foo\n");
    expect(rows()[0].children[4].textContent).toContain("Replaced");
    expect(button("Undo").disabled).toBe(false);
  });

  test("undo asks first, then puts the file back", async () => {
    await click("Undo last replace", 100);
    expect(doc.querySelector(".modal-backdrop").textContent).toContain("Undo the last replace?");
    dialogButton("Undo").click();
    await sleep(500);
    expect(read("a.txt")).toBe("one\nfoo here\nthree\n");
    expect(rows()[0].children[4].textContent).toContain("Restored");
    expect(button("Undo").disabled).toBe(true);
  });

  test("a backup is made when asked, and a file edited after the preview is skipped with a reason", async () => {
    field("Keep a backup").click();
    await click("Preview changes");
    writeFileSync(join(work, "b.txt"), "foo foo, edited\n");
    await click("Replace in ticked", 100);
    expect(doc.querySelector(".modal-backdrop").textContent).toContain("saved next to it");
    dialogButton("Replace").click();
    await sleep(500);
    expect(read("a.txt.bak")).toBe("one\nfoo here\nthree\n");
    expect(read("a.txt")).toContain("bar here");
    expect(read("b.txt")).toBe("foo foo, edited\n");
    const statuses = rows().map((r: any) => r.children[4].textContent);
    expect(statuses[0]).toContain("Replaced");
    expect(statuses[1]).toContain("Skipped: file was edited");
  });

  test("saving the report makes a new file in the chosen folder", async () => {
    await click("Count matches");
    const out = join(root, "out");
    mkdirSync(out);
    type(field("Save into folder"), out);
    await click("Save a report");
    expect(readFileSync(join(out, "replace_report.md"), "utf8")).toContain("| ");
    expect(pane().querySelector(".sd-message").textContent).toContain("Saved the report as replace_report.md");
  });
});
