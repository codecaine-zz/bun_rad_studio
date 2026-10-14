// The inspector of the Find tool: details about the selected result (size, permissions, owner, link target, SHA-256,
// hex view, preview) and the actions for one item: open, show it, copy its path.
import { ApiError, call, rawUrl } from "./api.js";
import { debounce, h } from "./dom.js";
import { confirmBox } from "./dialogs.js";
import { fs, onFind, selectedItems } from "./findStore.js";
import { totalBytes } from "./findCore.js";
import { attempt, button, card, dropdown, outputBox, row, showOutput } from "./findUi.js";
import { toast } from "./menus.js";
import { goToContaining, revealEntry } from "./ops.js";
import { closePower } from "./power.js";
import { state } from "./state.js";
import { askOpenAnyway, skipMismatchGuard } from "./typecheck.js";
import { formatDate, formatSize, plural } from "./util.js";

/** Opens an item with its normal program; asks first when that program would be run. */
export async function openItem(item) {
  const attemptOpen = async (confirmed, mismatchOk = false) => {
    try {
      await call("open", { path: item.path, confirmProgram: confirmed, confirmMismatch: mismatchOk || skipMismatchGuard() });
      toast(`Opening ${item.name}…`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "TYPE_MISMATCH") {
        if (await askOpenAnyway(item.path, err)) await attemptOpen(confirmed, true);
        return;
      }
      if (err instanceof ApiError && err.code === "NEEDS_CONFIRM") {
        const ok = await confirmBox({
          title: "Run this program?",
          message: `"${item.name}" is a program or installer. Opening it will run it on your computer. Only continue if you trust where it came from.`,
          confirmLabel: "Run it",
          danger: true,
        });
        if (ok) await attemptOpen(true, mismatchOk);
        return;
      }
      toast(err instanceof ApiError ? err.message : "That couldn't be opened.", { kind: "error" });
    }
  };
  await attemptOpen(false);
}

/** Puts text on the clipboard through the server (the page itself may not touch the clipboard). */
export async function copyText(text, what) {
  if (text.length > 100_000) return toast("That's too much text to copy at once. Save it to a file instead (Export).", { kind: "error" });
  const res = await attempt(() => call("copytext", { text }));
  if (res) toast(res.copied ? `Copied ${what}.` : "The clipboard couldn't be used.", { kind: res.copied ? "success" : "error" });
  return undefined;
}

const asEntry = (item) => ({ path: item.path, name: item.name, isDir: item.type === "directory" });
const kindOf = (item) => (item.type === "directory" ? "Folder" : item.type === "symlink" ? "Link (shortcut)" : item.type === "executable" ? "Program" : "File");
const fact = (name, value) => (value === null || value === undefined || value === "" ? null : [h("dt", {}, name), h("dd", {}, value)]);

export function createInspector() {
  let token = 0;
  const title = h("p", { class: "find-inspect-title" });
  const facts = h("dl", { class: "find-facts" });
  const note = h("p", { class: "pw-hint", hidden: true });
  const shaLine = h("p", { class: "pw-mono find-sha", hidden: true, tabindex: "0", "aria-label": "SHA-256 fingerprint of the file" });
  const hexBytes = dropdown([{ value: "256", label: "256 bytes" }, { value: "1024", label: "1 KB" }, { value: "4096", label: "4 KB" }], { label: "How much to show in the hex view", tip: "How many bytes of the file to show in the hex view" });
  const output = outputBox("Preview of the selected item");
  const image = h("img", { class: "find-preview-img", alt: "", hidden: true });

  const one = () => {
    const picked = selectedItems();
    return picked.length === 1 ? picked[0] : null;
  };
  const clearOutput = () => {
    showOutput(output, "");
    image.hidden = true;
    image.removeAttribute("src");
  };

  const open = button("Open", () => { const i = one(); if (i) openItem(i); }, { tip: "Open the selected item with the program your computer uses for it" });
  const reveal = button("Show in system", () => { const i = one(); if (i) revealEntry(asEntry(i)); }, { tip: `Show the selected item in ${state.fmName}` });
  const showHere = button("Show in this File Manager", async () => {
    const i = one();
    if (!i) return;
    await goToContaining(asEntry(i));
    closePower();
  }, { tip: "Close the power tools and show the folder that contains this item, with the item selected" });
  const preview = button("Preview", async () => {
    const i = one();
    if (!i) return;
    clearOutput();
    if (i.type === "directory") {
      const res = await attempt(() => call("list", { path: i.path, showHidden: true }));
      if (res) showOutput(output, `${plural(res.total, "item")} inside:\n${res.entries.slice(0, 40).map((e) => (e.isDir ? "📁 " : "   ") + e.name).join("\n")}${res.total > 40 ? "\n…" : ""}`);
      return;
    }
    const res = await attempt(() => call("preview", { path: i.path }));
    if (!res) return;
    const p = res.preview;
    if (p.type === "image") {
      image.alt = `Preview of ${i.name}`;
      image.src = rawUrl(i.path);
      image.hidden = false;
    } else if (p.type === "text") {
      showOutput(output, (p.text || "(the file is empty)") + (p.truncated ? "\n… (only the beginning is shown)" : ""));
    } else {
      showOutput(output, "This file isn't text, so there is nothing to read here. Try the hex view.");
    }
  }, { tip: "Look inside the selected file: text and pictures are shown here" });
  const hex = button("Hex view", async () => {
    const i = one();
    if (!i) return;
    clearOutput();
    const res = await attempt(() => call("find/hex", { path: i.path, length: Number(hexBytes.value) }));
    if (res) showOutput(output, `First ${res.bytes} of ${formatSize(res.size)}:\n${res.hex || "(the file is empty)"}`);
  }, { tip: "Show the raw bytes of the file as numbers (hexadecimal) next to their letters" });
  const sha = button("SHA-256", async () => {
    const i = one();
    if (!i) return;
    shaLine.hidden = false;
    shaLine.textContent = "Working it out…";
    const res = await attempt(() => call("find/sha256", { path: i.path }));
    shaLine.textContent = res ? `SHA-256: ${res.sha256}` : "The fingerprint couldn't be made.";
  }, { tip: "Work out the file's SHA-256 fingerprint: a long code that changes if even one byte of the file changes" });
  const copyRel = button("Copy relative path", () => { const i = one(); if (i) copyText(i.relativePath, "the path"); }, { tip: "Copy the path of the item inside the search folder" });
  const copyAbs = button("Copy full path", () => { const i = one(); if (i) copyText(i.path, "the full path"); }, { tip: "Copy the complete location of the item" });

  /** `detail` is the server's fresh look at the item (find/inspect), once it has arrived. */
  function renderFacts(item, detail) {
    const list = [
      fact("Location", item.path),
      fact("Kind", kindOf(item)),
      item.type === "directory" ? null : fact("Size", formatSize(item.sizeBytes)),
      fact("Changed", formatDate(detail?.mtimeMs ?? item.mtimeMs)),
      detail?.owner ? fact("Owner", detail.owner) : null,
      detail?.linkTarget ? fact("Points to", `${detail.linkTarget}${detail.broken ? " (missing)" : ""}`) : null,
      detail && detail.entries !== null ? fact("Contains", plural(detail.entries, "item")) : null,
      fs.meta.posix ? fact("Permissions", detail ? `${detail.permStr} (${detail.mode})` : item.permStr) : null,
    ];
    facts.replaceChildren(...list.filter(Boolean).flat());
  }

  function paint(items) {
    token++;
    clearOutput();
    shaLine.hidden = true;
    note.hidden = true;
    facts.replaceChildren();
    const item = items.length === 1 ? items[0] : null;
    for (const b of [open, reveal, showHere, preview, copyRel, copyAbs]) b.disabled = !item;
    const noBytes = !item || item.type === "directory";
    hex.disabled = noBytes;
    sha.disabled = noBytes;
    hexBytes.disabled = noBytes;
    if (!items.length) {
      title.textContent = "Nothing selected. Click a result to see its details here.";
      return;
    }
    if (!item) {
      title.textContent = `${plural(items.length, "item")} selected (${formatSize(totalBytes(items))} in files)`;
      note.textContent = "Pick just one result to see its details, or use the actions below to work on all of the selected ones.";
      note.hidden = false;
      return;
    }
    title.textContent = item.name;
    renderFacts(item, null);
    const mine = token;
    call("find/inspect", { path: item.path }).then((detail) => {
      if (mine !== token) return;
      renderFacts(item, detail);
      if (detail.protected) {
        note.textContent = `🔒 ${detail.protected}`;
        note.hidden = false;
      }
    }).catch(() => {
      if (mine !== token) return;
      note.textContent = "This item may have been moved or deleted. Search again to refresh the list.";
      note.hidden = false;
    });
  }

  const el = card("Selected item", "Details and actions for the result you picked.",
    title, facts, note,
    row(open, reveal, showHere, preview, copyRel, copyAbs),
    row(hex, hexBytes, sha),
    shaLine, output, image,
  );

  const paintSoon = debounce(() => paint(selectedItems()), 120);
  onFind("selection", paintSoon);
  onFind("results", () => paint(selectedItems()));
  paint([]);
  return { el };
}
