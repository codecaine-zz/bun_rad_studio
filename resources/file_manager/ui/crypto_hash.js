// The hashing half of the Crypto tool: hash text (with an optional HMAC key), hash files, one shared results table,
// copy/save the digests, and check a published checksum.
import { ApiError, call } from "./api.js";
import { clear, h } from "./dom.js";
import { toast } from "./menus.js";
import { selectedEntries } from "./selection.js";
import { currentPath } from "./state.js";
import { formatSize, plural } from "./util.js";
import { actionButton, attempt, card, checkBox, copyCell, digestTable, formatMs, lineBox, secretBox, statusLine, textBox } from "./crypto_ui.js";

const MAX_FILES = 20;
const NO_RESULTS = "Results appear here after you hash some text or a file.";

/** Builds the three hashing cards. Returns { cards, show(opts), clear() }. */
export function buildHashCards(env) {
  let current = { rows: [], source: "" };
  let meta = { hints: {}, fastTitle: "" };
  let files = [];
  let pathTouched = false;
  let folderTouched = false;

  // ---- Hash some text -------------------------------------------------------------------------------------------
  const text = textBox({ label: "Text to hash", tip: "Type or paste the text you want a fingerprint (hash) of. Even one changed letter gives a completely different result.", placeholder: "The quick brown fox jumps over the lazy dog", rows: 3 });
  const key = secretBox({ label: "HMAC key (optional)", tip: "Only fill this in if you want an HMAC: a hash that also needs a secret key. Whoever has the same key and text gets the same result. Leave empty for plain hashes.", placeholder: "secret-signing-key", secrets: env.secrets });
  const textStatus = statusLine();
  const hashButton = actionButton("Calculate hashes", "Work out SHA-256, SHA-512, SHA-384, SHA-1, MD5, the SHA-3, BLAKE2 and RIPEMD kinds, and the fast checksums (CRC32, xxHash and more) for this text. An HMAC of each classic kind is added when a key is given.", async () => {
    const r = await attempt(hashButton, textStatus, () => call("crypto/hash", { text: text.input.value, key: key.input.value }));
    if (!r) return;
    showDigests(r.rows, "Text input", r.fast, r.hints, r.fastTitle);
    textStatus.set(`Done: ${r.rows.length} results for ${formatSize(r.bytes)} of text in ${formatMs(r.ms)}. See "Results" below.`, "ok");
    env.log("Hash text", `${formatSize(r.bytes)}${r.hmac ? ", with an HMAC key" : ""}, ${formatMs(r.ms)}`);
  }, { primary: true });
  const textCard = card("Hash some text", "What is a hash? A short fingerprint of some data. The same text always gives the same hash, a tiny change gives a totally different one, and the original can't be recovered from it. An HMAC adds a secret key, so only people who know the key can produce it. Never share your key.",
    text.el, key.el, h("div", { class: "pw-row" }, hashButton), textStatus.el);

  // ---- Hash files -----------------------------------------------------------------------------------------------
  const path = lineBox({ label: "File to hash", tip: "The full location of one file, like /Users/you/Downloads/setup.zip or C:\\Users\\you\\setup.zip. It is read in small pieces, so very big files are fine.", placeholder: "Full path of a file", width: "crypto-wide" });
  path.input.addEventListener("input", () => (pathTouched = true));
  const extras = checkBox("Also work out the extra kinds and the fast checksums", "Adds SHA-3, BLAKE2, RIPEMD, SHA-224 and old MD4, and the fast checksums (CRC32, Adler-32, xxHash, wyhash, CityHash, MurmurHash, rapidhash). Takes longer for big files. The fast checksums only spot accidental changes and are NOT secure.", false);
  const fileStatus = statusLine();
  const selectedNote = h("span", { class: "pw-hint", role: "status" });
  const fileButton = actionButton("Hash this file", "Work out SHA-256, SHA-384, SHA-512, SHA-1 and MD5 of the file (and more kinds when the box is ticked). Nothing is changed or uploaded.", () => hashFiles([path.input.value.trim()].filter(Boolean)), { primary: true });
  const selectedButton = actionButton("Hash the selected files", `Hash the files that are selected in the file list (up to ${MAX_FILES}). Folders are skipped.`, () => {
    const paths = selectedEntries().filter((e) => !e.isDir).map((e) => e.path);
    if (paths.length === 0) return fileStatus.set("No files are selected in the file list. Close this panel, select some files, and open the Crypto tool again.", "bad");
    if (paths.length > MAX_FILES) fileStatus.set(`Only the first ${MAX_FILES} of ${paths.length} selected files will be hashed.`);
    return hashFiles(paths.slice(0, MAX_FILES));
  });
  const fileCard = card("Hash a file", "Use this to check that a download wasn't damaged or tampered with: hash it here, then compare with the checksum the website published. Files are only read, never changed.",
    path.el, h("div", { class: "pw-row" }, extras.el), h("div", { class: "pw-row" }, fileButton, selectedButton, selectedNote), fileStatus.el);

  async function hashFiles(paths) {
    if (paths.length === 0) return fileStatus.set("Type the location of a file first.", "bad");
    fileStatus.set(`Hashing ${plural(paths.length, "file")}… big files can take a while.`);
    const t0 = performance.now();
    selectedButton.disabled = true;
    try {
      const r = await attempt(fileButton, fileStatus, () => call("crypto/filehash", { paths, extras: extras.input.checked }));
      if (!r) return;
      files = r.results;
      meta = { hints: r.hints ?? {}, fastTitle: r.fastTitle ?? "" };
      const good = files.filter((f) => f.ok);
      const total = good.reduce((sum, f) => sum + f.size, 0);
      renderFiles();
      const took = formatMs(performance.now() - t0);
      const all = good.length === files.length;
      fileStatus.set(all ? `Done: ${plural(good.length, "file")} (${formatSize(total)}) in ${took}.` : `${plural(good.length, "file")} hashed, ${files.length - good.length} could not be read. Details are in the results.`, all ? "ok" : "bad");
      env.log("Hash files", `${plural(files.length, "file")}, ${formatSize(total)}, ${took}`);
    } finally {
      selectedButton.disabled = false;
    }
  }

  // ---- Results --------------------------------------------------------------------------------------------------
  const sourceLine = h("p", { class: "pw-status", role: "status" }, "Nothing hashed yet.");
  const fileList = h("div", { class: "crypto-filelist" });
  const tableHost = h("div", { class: "crypto-tablehost" }, h("p", { class: "pw-hint" }, NO_RESULTS));
  const verifyStatus = statusLine("Checksum check result");
  const folder = lineBox({ label: "Save report in folder", tip: "The folder where the new report file will be made. You can type ~/Documents. Nothing already there is overwritten.", placeholder: "Folder location", width: "crypto-wide" });
  folder.input.addEventListener("input", () => (folderTouched = true));
  const fileName = lineBox({ label: "File name", tip: "Name for the new report. If a file with this name exists, a number is added (like Digests (2).txt) instead of replacing it.", value: "Digests.txt" });
  const useFolder = actionButton("Use the open folder", "Fill in the folder you were looking at in the file list.", () => {
    folder.input.value = currentPath();
    folderTouched = true;
  });
  const saveStatus = statusLine();
  const saveButton = actionButton("Save digests as a new file", "Write the digests shown above to a new text file. An existing file is never replaced.", async () => {
    if (current.rows.length === 0) return saveStatus.set("Hash some text or a file first.", "bad");
    if (!folder.input.value.trim()) return saveStatus.set("Choose a folder to save into first.", "bad");
    const saved = await attempt(saveButton, saveStatus, async () => {
      const typed = await call("typedpath", { text: folder.input.value.trim(), cwd: currentPath() || undefined });
      if (!typed.isDir) throw new ApiError("That folder doesn't exist.", "NOT_FOUND", 400);
      return await call("crypto/savedigests", { folder: typed.path, name: fileName.input.value, rows: current.rows, source: current.source });
    });
    if (!saved) return;
    saveStatus.set(`Saved as ${saved.name} in ${saved.path.slice(0, saved.path.length - saved.name.length)}`, "ok");
    toast(`Saved ${saved.name}`, { kind: "success" });
    env.log("Save digests", "new text file");
  });
  const expected = lineBox({ label: "Published checksum", tip: "Paste the checksum the website gave you. Spaces, capital letters, a leading sha256: and 'checksum  filename' lines are all fine.", placeholder: "Paste a SHA-256, SHA-1, MD5 … here", width: "crypto-wide" });
  const verifyButton = actionButton("Check the checksum", "Compare the pasted checksum with the digests above. A match means the file or text is exactly what the checksum describes.", async () => {
    if (current.rows.length === 0) return verifyStatus.set("Hash some text or a file first, then paste the checksum to compare.", "bad");
    const r = await attempt(verifyButton, verifyStatus, () => call("crypto/verify", { expected: expected.input.value, rows: current.rows, source: current.source }));
    if (!r) return;
    verifyStatus.set(r.matched ? `✔ It matches: this is the ${r.match} digest of ${current.source}. It is exactly what the checksum describes.` : `✖ No match. ${r.hint}`, r.matched ? "ok" : "bad");
    env.log("Verify checksum", r.matched ? `match (${r.match})` : "no match");
  }, { primary: true });
  const resultsCard = card("Results", "The newest digests from either card above. Digests are not secret, so you can share them. An HMAC row (when a key was given) can't be used for checksum checks. Every row has its own Copy button; the Copy button at the top right of this card copies everything shown here.",
    sourceLine, fileList, tableHost,
    h("div", { class: "pw-row crypto-group" }, folder.el, fileName.el, useFolder, saveButton), saveStatus.el,
    h("div", { class: "pw-row crypto-group" }, expected.el, verifyButton), verifyStatus.el);

  /** `fast` are the fast checksums: shown in their own, clearly labelled table, but used by checks and reports like the rest. */
  function showDigests(rows, source, fast = [], hints = {}, fastTitle = "", skipped = []) {
    current = { rows: [...rows, ...fast], source };
    sourceLine.textContent = `Digests of: ${source}`;
    clear(tableHost).append(...[
      digestTable(rows, `Digests of ${source}`, hints),
      fast.length ? h("div", { class: "crypto-fast" },
        h("h4", { class: "crypto-subtitle" }, fastTitle || "Fast checksums (to spot accidental changes only, NOT secure)"),
        h("p", { class: "pw-hint" }, "These are very quick check numbers for noticing accidental damage. Anyone can make a different file with the same number, so never use them to prove a download is genuine. Each is the number the function returns (seed 0), written in hex with the most significant digit first."),
        digestTable(fast, `Fast checksums of ${source}`, hints)) : null,
      skipped.length ? h("ul", { class: "crypto-list pw-hint", "data-copy": "Skipped checksums" }, skipped.map((x) => h("li", {}, `${x.label}: ${x.reason}`))) : null,
    ].filter(Boolean));
    env.setLast(current.rows.map(([algo, digest]) => `${algo}  ${digest}`).join("\n"));
    verifyStatus.set("");
    saveStatus.set("");
  }

  function pick(i) {
    const f = files.filter((x) => x.ok)[i];
    if (f) showDigests(f.rows, `${f.name} (${formatSize(f.size)})`, f.fast, meta.hints, meta.fastTitle, f.skipped);
  }

  function renderFiles() {
    clear(fileList);
    const good = files.filter((f) => f.ok);
    if (files.length > 1) {
      fileList.append(h("div", { class: "pw-table-wrap" }, h("table", { class: "pw-table" },
        h("caption", { class: "crypto-caption" }, `${plural(files.length, "file")} hashed`),
        h("thead", {}, h("tr", {}, ["File", "Size", "SHA-256 / problem"].map((t) => h("th", { scope: "col" }, t)), h("th", { scope: "col", "data-copy-ui": "" }, "Copy"))),
        h("tbody", {}, files.map((f) => h("tr", {},
          h("th", { scope: "row", title: f.path }, f.name),
          h("td", { class: "num" }, f.ok ? formatSize(f.size) : ""),
          h("td", { class: f.ok ? "pw-mono crypto-digest" : "pw-bad" }, f.ok ? f.rows[0][1] : f.error),
          f.ok ? copyCell(`the SHA-256 digest of ${f.name}`, () => f.rows[0][1]) : h("td", { "data-copy-ui": "" })))))));
      if (good.length > 1) {
        const choose = h("select", { class: "crypto-input", id: "crypto-file-choice", title: "Choose which file's full set of digests to show below, copy, save or check.", onchange: () => pick(Number(choose.value)) },
          good.map((f, i) => h("option", { value: String(i) }, f.name)));
        fileList.append(h("div", { class: "pw-field crypto-field" }, h("label", { for: "crypto-file-choice" }, "Show all digests for"), choose));
      }
    }
    if (good.length > 0) pick(0);
    else {
      current = { rows: [], source: "" };
      sourceLine.textContent = "No digests: the file couldn't be read.";
      clear(tableHost).append(h("p", { class: "pw-bad", role: "alert" }, files[0]?.error ?? "That file couldn't be read."));
    }
  }

  return {
    cards: [textCard, fileCard, resultsCard],
    show(opts) {
      const selected = selectedEntries().filter((e) => !e.isDir);
      selectedNote.textContent = selected.length ? `${plural(selected.length, "file")} selected in the list.` : "No files selected in the list.";
      if (opts?.path) {
        path.input.value = opts.path;
        pathTouched = true;
        fileButton.focus();
      } else if (!pathTouched && selected.length === 1) path.input.value = selected[0].path;
      if (!folderTouched) folder.input.value = currentPath();
    },
    clear() {
      for (const box of [text, key, path, expected]) box.input.value = "";
      extras.input.checked = false;
      fileName.input.value = "Digests.txt";
      pathTouched = folderTouched = false;
      files = [];
      current = { rows: [], source: "" };
      clear(fileList);
      clear(tableHost).append(h("p", { class: "pw-hint" }, NO_RESULTS));
      sourceLine.textContent = "Nothing hashed yet.";
      for (const s of [textStatus, fileStatus, saveStatus, verifyStatus]) s.set("");
      folder.input.value = currentPath();
    },
  };
}
