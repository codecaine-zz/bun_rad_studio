// Quick Look: press Space on a file (or choose Quick Look in its menu) to look at it without opening another program.
// Pictures, text and, on a Mac, documents (PDF, Word, Excel, Keynote, HEIC ...) show right here, and sound and video open
// a full player (mediaplayer.js). The arrow keys move to the next and previous item of the list, Enter opens the item in
// its own program, Space or Esc closes it. For sound, video and animated GIFs Space plays and pauses, and Esc closes.
import { ApiError, call, rawUrl } from "./api.js";
import { $, announce, h, iconFor } from "./dom.js";
import { menuIsOpen, showMenu, toast } from "./menus.js";
import { goToIn, visibleEntries } from "./nav.js";
import { copyImageFile, copyTextFile } from "./clipfile.js";
import { copyToClipboard, flashCopied } from "./copyclip.js";
import { copyPathOf, openEntry, revealEntry } from "./ops.js";
import { openInCode } from "./code.js";
import { isKnownTextName } from "./codeLang.js";
import { renderMarkdown } from "./codePreview.js";
import { showMoreInfo } from "./fileinfo.js";
import { showProperties } from "./extras.js";
import { createGifViewer } from "./gifviewer.js";
import { createPlayer } from "./mediaplayer.js";
import { mediaKindOfName } from "./mediacore.js";
import { showOpenWith } from "./openwith.js";
import { showToolsDialog } from "./tools.js";
import { activePane } from "./pane.js";
import { focusIndex, selectedEntries } from "./selection.js";
import { inTrash, on, state } from "./state.js";
import { parseTable } from "./quicklookTable.js";
import {
  buildQuickLookCopyButtons,
  clearQuickLookHighlights,
  extractQuickLookPreviewText,
  getSelectedTextInQuickLook,
  renderRichQuickLook,
  setCachedQuickLookSelection,
  toggleQuickLookFindBar,
} from "./quicklookFormat.js";
import { openPower } from "./power.js";
import { isStudioPicture } from "./imageStudio.js";
import { isStudioMedia } from "./mediaStudio.js";
import { quickMediaMenuItems } from "./mediaQuick.js";
import { extensionOf, formatDate, formatSize, isDocumentPackageEntry, plural } from "./util.js";

const DEFAULT_FOOT = "Space or Esc closes  ·  ← → show the next or previous item  ·  Enter opens it in another program";
const MD_FOOT = "Space or Esc closes  ·  P toggles Preview / Plain text  ·  ← → show the next or previous item  ·  Enter opens it in another program";

/** The open Quick Look, or null. */
let ql = null;

export const quickLookIsOpen = () => ql !== null;

const thumbUrl = (path) => `${rawUrl(path)}&thumb=1`;
const TABLE_EXTS = new Set(["csv", "tsv"]);
const MD_EXTS = new Set(["md", "markdown", "mdx", "mkd", "mdown", "mkdn"]);
const isMarkdownName = (name) => MD_EXTS.has(extensionOf(name)) || /^readme$/i.test(String(name ?? ""));

function destroyPlayer() {
  if (!ql?.player) return;
  ql.player.destroy();
  ql.player = null;
}

function destroyGif() {
  if (!ql?.gif) return;
  ql.gif.destroy();
  ql.gif = null;
}

function factsList(entry, extra = []) {
  const facts = [["Type", entry.label], ["Size", entry.isDir ? "" : formatSize(entry.size)], ["Modified", entry.mtimeMs ? formatDate(entry.mtimeMs) : ""], ...extra].filter(([, v]) => v);
  return h("dl", { class: "ql-facts" }, ...facts.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
}

/** The plain card: used for folders and for files that can't be drawn here. */
function infoCard(entry, note, extra = []) {
  return h("div", { class: "ql-card" },
    h("div", { class: "ql-bigicon", "aria-hidden": "true" }, entry.icon || iconFor(entry.name, entry.isDir)),
    h("h3", {}, entry.name),
    factsList(entry, extra),
    note ? h("p", { class: "ql-note" }, note) : null,
  );
}

/** The header's Copy button: shown only when the item in view is a picture or text that can be copied. */
function setCopy(offer) {
  ql.copyAction = offer ? offer.run : null;
  ql.copyBtn.hidden = !offer;
  if (offer) {
    ql.copyBtn.textContent = offer.label;
    ql.copyBtn.title = offer.tip;
  }
}

function setRichCopyIfAvailable(entry, preview, richNode) {
  const kind = preview?.rich?.kind;
  if (!kind || kind === "binary" || kind === "font" || kind === "model3d") return;
  const text = extractQuickLookPreviewText(entry, preview, richNode);
  if (!text || !text.trim()) return;
  setCopy({
    label: "Copy text",
    tip: "Put all text in this preview on the clipboard",
    run: async () => {
      const currentText = extractQuickLookPreviewText(entry, preview, ql?.body ?? richNode);
      if (await copyToClipboard(currentText || text, { what: `all preview text from ${entry.name}` })) {
        flashCopied(ql.copyBtn, "Copied ✓");
      }
    },
  });
}

function onSelectionChange() {
  if (!ql) return;
  const selText = getSelectedTextInQuickLook(ql.body);
  setCachedQuickLookSelection(selText);
  if (ql.copySelBtn) {
    ql.copySelBtn.hidden = !selText;
    ql.copySelBtn.textContent = selText
      ? `✂️ Copy selected (${selText.length.toLocaleString("en-US")} chars)`
      : "✂️ Copy selected";
  }
  for (const btn of ql.body.querySelectorAll(".ql-copy-sel-btn")) {
    btn.classList.toggle("active", Boolean(selText));
    btn.textContent = selText
      ? `✂️ Copy Selected (${selText.length.toLocaleString("en-US")} chars)`
      : "✂️ Copy Selected";
  }
}

/** Which of the header's other buttons make sense for the item in view. */
function setActions(entry) {
  const isDocPkg = isDocumentPackageEntry(entry);
  const text = !entry.isDir && isKnownTextName(entry.name);
  ql.convertBtn.hidden = entry.isDir && !isDocPkg;
  ql.editBtn.hidden = !text;
  ql.studioBtn.hidden = entry.isDir || !(isStudioPicture(entry.name) || isStudioMedia(entry.name));
  if (ql.pkgBtn) {
    ql.pkgBtn.hidden = !(isDocPkg || (entry.isDir && /\.app$/i.test(entry.name)));
  }
}

function setSub(text) {
  ql.sub.textContent = text;
}

function baseSub(entry) {
  const isFolderOnly = entry.isDir && !isDocumentPackageEntry(entry);
  return [entry.label, isFolderOnly ? "" : formatSize(entry.size), entry.mtimeMs ? formatDate(entry.mtimeMs) : ""].filter(Boolean).join("  ·  ");
}

function failed(entry, what) {
  return infoCard(entry, `${what} Press Enter to open it in the program your computer uses for it.`);
}

function resolveQuickLookImageSrc(entry, rawSrc) {
  const s = String(rawSrc ?? "").trim();
  if (!s || (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^file:\/\//i.test(s) && !/^[A-Za-z]:[\\/]/.test(s))) return "";
  let clean = s.split("#")[0].split("?")[0];
  try { clean = decodeURIComponent(clean); } catch {}
  if (/^file:\/\//i.test(clean)) {
    try { clean = decodeURIComponent(new URL(clean).pathname); } catch { return ""; }
  }
  const sep = state.sep || "/";
  const baseDir = entry?.path
    ? entry.path.slice(0, Math.max(entry.path.lastIndexOf("/"), entry.path.lastIndexOf("\\"))) || entry.path
    : state.home || "";
  const isAbs = clean.startsWith("/") || /^[A-Za-z]:[\\/]/.test(clean);
  const joined = isAbs ? clean : `${baseDir}${sep}${clean}`;
  const driveMatch = /^[A-Za-z]:/.exec(joined);
  const prefix = driveMatch ? driveMatch[0] : "";
  const parts = joined.slice(prefix.length).split(/[\\/]+/);
  const norm = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") norm.pop();
    else norm.push(part);
  }
  const resolved = prefix ? `${prefix}${sep}${norm.join(sep)}` : `${sep}${norm.join(sep)}`;
  return rawUrl(resolved);
}

async function openQuickLookMarkdownLink(entry, rawHref) {
  const href = String(rawHref ?? "").trim();
  if (!href) return;
  if (/^(?:https?:\/\/|\/\/|www\.[^\s/]+\.[^\s]+)/i.test(href)) {
    const url = href.startsWith("//") ? `https:${href}` : /^www\./i.test(href) ? `https://${href}` : href;
    try {
      await call("link/open", { url });
    } catch (err) {
      toast(err?.message || "Couldn't open that web address.", { kind: "error" });
    }
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^file:\/\//i.test(href) && !/^[A-Za-z]:[\\/]/.test(href)) {
    const addr = href.replace(/^mailto:/i, "");
    call("copytext", { text: addr })
      .then(() => toast(`Copied "${addr}" to the clipboard.`))
      .catch(() => toast(`Link: ${href}`));
    return;
  }
  const hashIdx = href.indexOf("#");
  let pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  let frag = hashIdx >= 0 ? href.slice(hashIdx + 1) : "";
  try { pathPart = decodeURIComponent(pathPart); } catch {}
  try { frag = decodeURIComponent(frag); } catch {}
  if (!pathPart && frag) {
    if (ql?.mdController?.jumpToSlug?.(frag)) return;
    if (entry?.path) {
      closeQuickLook();
      openInCode(entry.path, { frag });
    }
    return;
  }
  const baseDir = entry?.path
    ? entry.path.slice(0, Math.max(entry.path.lastIndexOf("/"), entry.path.lastIndexOf("\\"))) || entry.path
    : state.home || "";
  try {
    const resolved = await call("typedpath", { text: pathPart || entry.path, cwd: baseDir });
    if (!resolved.exists) {
      toast(`Linked file not found: ${pathPart}`, { kind: "error" });
      return;
    }
    const idx = ql?.entries.findIndex((e) => e.path === resolved.path) ?? -1;
    if (idx >= 0 && !frag) {
      show(idx);
      return;
    }
    closeQuickLook();
    openInCode(resolved.path, frag ? { frag } : undefined);
  } catch (err) {
    toast(err?.message || "Couldn't open that linked file.", { kind: "error" });
  }
}

async function renderBody(entry, mine) {
  const open = (node) => { if (ql && mine === ql.seq) ql.body.replaceChildren(node); };
  ql.mdController = null;
  if (entry.isDir && !isDocumentPackageEntry(entry)) {
    open(infoCard(entry, "Press Enter to open this folder."));
    try {
      const { properties: p } = await call("props", { paths: [entry.path] });
      open(infoCard(entry, "Press Enter to open this folder.", [["Contains", `${plural(p.files, "file")}, ${plural(p.folders, "folder")}${p.partial ? " (counted partly)" : ""}`], ["Total size", formatSize(p.size)]]));
    } catch { /* the plain card already says what it can */ }
    return;
  }
  if (mediaKindOfName(entry.name)) return mountPlayer(entry, mine);
  open(h("p", { class: "ql-loading", role: "status" }, "Loading…"));
  let preview;
  try {
    ({ preview } = await call("preview", { path: entry.path }));
  } catch (err) {
    open(infoCard(entry, err instanceof ApiError ? err.message : "This couldn't be read."));
    return;
  }
  if (!ql || mine !== ql.seq) return;
  switch (preview.type) {
    case "image": {
      if (extensionOf(entry.name) === "gif") return mountGif(entry, mine, open);
      setCopy({ label: "Copy picture", tip: "Put the picture on the clipboard, to paste into a document or chat", run: () => copyImageFile(entry) });
      let zoom = 1;
      let rot = 0;
      let flipX = 1;
      let flipY = 1;
      let backdropMode = "grid"; // "grid" | "dark" | "light"

      const dimBadge = h("span", { class: "ql-fmt-badge", dataset: { qlImgDims: "" } }, (extensionOf(entry.name) || "IMG").toUpperCase());
      const zoomLabelBtn = h("button", {
        type: "button",
        class: "btn ql-mini-btn",
        dataset: { qlImgZoomReset: "" },
        title: "Reset zoom & orientation to Fit (100%) — Shortcut: 0",
        onclick: () => {
          zoom = 1;
          rot = 0;
          flipX = 1;
          flipY = 1;
          applyTransform();
        },
      }, "100% (Fit)");

      const stage = h("div", {
        class: "ql-image-stage ql-bg-grid",
        dataset: { qlImgStage: "", backdrop: backdropMode },
        style: "display: flex; overflow: auto; flex: 1 1 0%; min-height: 0; min-width: 0; width: 100%; height: 100%; position: relative; z-index: 1; clip-path: inset(0); padding: 16px; box-sizing: border-box; background-image: linear-gradient(45deg, rgba(148,163,184,0.14) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.14) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.14) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.14) 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0;",
      });

      const canvasWrap = h("div", {
        class: "ql-image-canvas",
        style: "margin: auto; display: flex; align-items: center; justify-content: center; position: relative; flex-shrink: 0;",
      });

      const img = h("img", {
        class: "ql-image",
        src: rawUrl(entry.path),
        alt: `Preview of ${entry.name}`,
        draggable: "false",
        style: "max-width: none; max-height: none; object-fit: contain; transform-origin: center center; display: block; flex-shrink: 0; user-select: none; -webkit-user-drag: none;",
        onload: () => {
          if (ql && mine === ql.seq) {
            setSub(`${baseSub(entry)}  ·  ${img.naturalWidth} × ${img.naturalHeight}`);
            dimBadge.textContent = `${(extensionOf(entry.name) || "IMG").toUpperCase()} · ${img.naturalWidth} × ${img.naturalHeight}`;
            requestAnimationFrame(() => applyTransform(true));
          }
        },
        onerror: () => {
          if (!img.dataset.retried) {
            img.dataset.retried = "1";
            img.src = `${rawUrl(entry.path)}&convert=1`;
            return;
          }
          open(failed(entry, "This picture can't be shown here."));
        },
      });

      function applyTransform(resetCenter = false) {
        const pct = Math.round(zoom * 100);
        zoomLabelBtn.textContent = zoom === 1 && rot === 0 && flipX === 1 && flipY === 1 ? "100% (Fit)" : `${pct}%`;

        // Record current viewport center ratio before resizing so zooming keeps the image centered
        const prevScrollW = stage.scrollWidth;
        const prevScrollH = stage.scrollHeight;
        const prevClientW = stage.clientWidth;
        const prevClientH = stage.clientHeight;
        const centerRatioX = !resetCenter && prevScrollW > prevClientW
          ? (stage.scrollLeft + prevClientW / 2) / prevScrollW
          : 0.5;
        const centerRatioY = !resetCenter && prevScrollH > prevClientH
          ? (stage.scrollTop + prevClientH / 2) / prevScrollH
          : 0.5;

        const natW = img.naturalWidth || 640;
        const natH = img.naturalHeight || 480;
        const availW = Math.max(120, (stage.clientWidth || 800) - 32);
        const availH = Math.max(120, (stage.clientHeight || 520) - 32);
        const isRot90 = Math.abs(rot % 180) === 90;

        // Fit scale so 100% (Fit) fits nicely inside the stage without exceeding 1:1 natural pixels unless zoomed
        const fitScale = isRot90
          ? Math.min(availW / natH, availH / natW, 1)
          : Math.min(availW / natW, availH / natH, 1);

        const targetW = Math.max(24, Math.round(natW * fitScale * zoom));
        const targetH = Math.max(24, Math.round(natH * fitScale * zoom));
        const boxW = isRot90 ? targetH : targetW;
        const boxH = isRot90 ? targetW : targetH;

        canvasWrap.style.width = `${boxW}px`;
        canvasWrap.style.height = `${boxH}px`;
        img.style.width = `${targetW}px`;
        img.style.height = `${targetH}px`;
        img.style.transform = `rotate(${rot}deg) scale(${flipX}, ${flipY})`;

        const isScrollable = boxW > availW || boxH > availH;
        stage.style.cursor = isScrollable ? "grab" : "default";

        const scheduleFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
        scheduleFrame(() => {
          const newScrollW = stage.scrollWidth;
          const newScrollH = stage.scrollHeight;
          const newClientW = stage.clientWidth;
          const newClientH = stage.clientHeight;
          if (newScrollW > newClientW) {
            stage.scrollLeft = Math.max(0, Math.round(newScrollW * centerRatioX - newClientW / 2));
          } else {
            stage.scrollLeft = 0;
          }
          if (newScrollH > newClientH) {
            stage.scrollTop = Math.max(0, Math.round(newScrollH * centerRatioY - newClientH / 2));
          } else {
            stage.scrollTop = 0;
          }
        });
      }

      // Click-and-drag panning when zoomed in
      let panState = null;
      stage.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        if (stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight) return;
        ev.preventDefault();
        panState = {
          startX: ev.clientX,
          startY: ev.clientY,
          scrollLeft: stage.scrollLeft,
          scrollTop: stage.scrollTop,
        };
        stage.style.cursor = "grabbing";
      });
      stage.addEventListener("mousemove", (ev) => {
        if (!panState) return;
        stage.scrollLeft = panState.scrollLeft - (ev.clientX - panState.startX);
        stage.scrollTop = panState.scrollTop - (ev.clientY - panState.startY);
      });
      const stopPan = () => {
        if (!panState) return;
        panState = null;
        const isScrollable = stage.scrollWidth > stage.clientWidth || stage.scrollHeight > stage.clientHeight;
        stage.style.cursor = isScrollable ? "grab" : "default";
      };
      stage.addEventListener("mouseup", stopPan);
      stage.addEventListener("mouseleave", stopPan);

      function applyBackdrop(mode) {
        backdropMode = mode;
        stage.dataset.backdrop = mode;
      }

      const inspectorBar = h("div", {
        class: "ql-fmt-head ql-img-inspector",
        dataset: { qlImgInspector: "" },
        style: "flex: 0 0 auto; position: relative; z-index: 10; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 8px 12px; margin: 0; background: var(--bg); border-bottom: 1px solid var(--border);",
      },
        dimBadge,
        h("span", { class: "code-grow" }),
        h("button", { type: "button", class: "btn ql-mini-btn", dataset: { qlImgZoomOut: "" }, title: "Zoom out (−)", onclick: () => { zoom = Math.max(0.25, +(zoom - 0.25).toFixed(2)); applyTransform(); } }, "−"),
        zoomLabelBtn,
        h("button", { type: "button", class: "btn ql-mini-btn", dataset: { qlImgZoomIn: "" }, title: "Zoom in (+)", onclick: () => { zoom = Math.min(4, +(zoom + 0.25).toFixed(2)); applyTransform(); } }, "+"),
        h("button", { type: "button", class: "btn ql-mini-btn", dataset: { qlImgRotLeft: "" }, title: "Rotate 90° counter-clockwise (⇧R)", onclick: () => { rot = (rot - 90) % 360; applyTransform(); } }, "↶"),
        h("button", { type: "button", class: "btn ql-mini-btn", dataset: { qlImgRotRight: "" }, title: "Rotate 90° clockwise (R)", onclick: () => { rot = (rot + 90) % 360; applyTransform(); } }, "↷"),
        h("button", { type: "button", class: "btn ql-mini-btn", dataset: { qlImgFlipH: "" }, title: "Flip horizontally (H)", onclick: () => { flipX *= -1; applyTransform(); } }, "⇄"),
        h("button", { type: "button", class: "btn ql-mini-btn", dataset: { qlImgFlipV: "" }, title: "Flip vertically (V)", onclick: () => { flipY *= -1; applyTransform(); } }, "⇅"),
        h("button", {
          type: "button",
          class: "btn ql-mini-btn",
          dataset: { qlImgBackdrop: "" },
          title: "Cycle transparency backdrop (Checkerboard Grid / Dark / Light)",
          onclick: () => applyBackdrop(backdropMode === "grid" ? "dark" : backdropMode === "dark" ? "light" : "grid"),
        }, "🏁 Backdrop"),
        h("button", {
          type: "button",
          class: "btn ql-mini-btn",
          dataset: { qlImgAskAi: "" },
          title: "Analyze this image with AI Vision (Ollama / LM Studio Bionic)",
          onclick: () => {
            closeQuickLook();
            openPower("ollama", {
              subTab: "assistant",
              paths: [entry.path],
              prompt: `Describe and analyze the image "${entry.name}" in detail.`,
            });
          },
        }, "🤖 Ask AI"),
      );

      canvasWrap.append(img);
      stage.append(canvasWrap);
      return open(h("div", { class: "ql-img-wrap", style: "display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; min-width: 0; overflow: hidden; position: relative;" }, inspectorBar, stage));
    }
    case "thumb": {
      const richNode = renderRichQuickLook(entry, preview, { onClose: closeQuickLook });
      if (richNode) {
        setRichCopyIfAvailable(entry, preview, richNode);
        return open(richNode);
      }
      const img = h("img", { class: "ql-image", src: thumbUrl(entry.path), alt: `First page or picture of ${entry.name}`, onerror: () => open(failed(entry, "This computer couldn't make a preview of it.")) });
      return open(h("div", { class: "ql-doc" }, img, h("p", { class: "ql-note" }, "A picture of the first page, made by your computer's own Quick Look.")));
    }
    case "text": {
      setCopy({ label: "Copy text", tip: "Put the whole text of this file on the clipboard", run: () => copyTextFile(entry) });
      const ext = extensionOf(entry.name);
      const note = preview.truncated ? h("p", { class: "ql-note" }, `Showing the start of the file (${formatSize(new Blob([preview.text]).size)} of ${formatSize(preview.size)}).`) : null;
      if (TABLE_EXTS.has(ext)) {
        const rows = parseTable(preview.text, ext === "tsv" ? "\t" : ",").slice(0, 300);
        if (rows.length) {
          const width = Math.max(...rows.map((r) => r.length));
          const body = rows.slice(1).map((r) => h("tr", {}, ...Array.from({ length: width }, (_, i) => h("td", {}, r[i] ?? ""))));
          const copyBar = h("div", { class: "ql-fmt-head ql-plain-copybar" }, h("span", { class: "ql-fmt-badge" }, `${ext.toUpperCase()} Table`), h("span", { class: "code-grow" }), buildQuickLookCopyButtons(entry, preview, () => ql?.body, { onClose: closeQuickLook }));
          return open(h("div", { class: "ql-tablewrap", tabindex: "0", "aria-label": `Table ${entry.name}` }, copyBar, h("table", { class: "ql-table" }, h("thead", {}, h("tr", {}, ...Array.from({ length: width }, (_, i) => h("th", { scope: "col" }, rows[0][i] ?? "")))), h("tbody", {}, ...body)), note, rows.length >= 300 ? h("p", { class: "ql-note" }, "Showing the first 300 rows.") : null));
        }
      }
      if (isMarkdownName(entry.name)) {
        const plainPre = h("pre", { class: "ql-text", tabindex: "0", "aria-label": `Contents of ${entry.name}` }, preview.text || "(An empty file.)");
        const mdWrap = h("div", { class: "ql-textwrap ql-md-wrap code-preview-body" });
        ql.mdController = renderMarkdown(mdWrap, preview.text, {
          plainEl: plainPre,
          mode: ql.mdMode || "preview",
          onModeChange: (m) => { ql.mdMode = m; },
          onOpenLink: (href) => openQuickLookMarkdownLink(entry, href),
          resolveImageSrc: (src) => resolveQuickLookImageSrc(entry, src),
        });
        const mdBar = mdWrap.querySelector(".code-md-toolbar");
        if (mdBar) mdBar.append(buildQuickLookCopyButtons(entry, preview, () => ql?.body, { onClose: closeQuickLook }));
        if (note) mdWrap.append(note);
        ql.foot.textContent = MD_FOOT;
        return open(mdWrap);
      }
      const richNode = renderRichQuickLook(entry, preview, { onClose: closeQuickLook });
      if (richNode) {
        if (note) richNode.append(note);
        return open(richNode);
      }
      const plainCopyBar = h("div", { class: "ql-fmt-head ql-plain-copybar" }, h("span", { class: "ql-fmt-badge" }, "Plain Text"), h("span", { class: "code-grow" }), buildQuickLookCopyButtons(entry, preview, () => ql?.body, { onClose: closeQuickLook }));
      return open(h("div", { class: "ql-textwrap" }, plainCopyBar, h("pre", { class: "ql-text", tabindex: "0", "aria-label": `Contents of ${entry.name}` }, preview.text || "(An empty file.)"), note));
    }
    default: {
      const richNode = renderRichQuickLook(entry, preview, { onClose: closeQuickLook });
      if (richNode) {
        setRichCopyIfAvailable(entry, preview, richNode);
        return open(richNode);
      }
      return open(infoCard(entry, "There is no preview for this kind of file. Press Enter to open it in the program your computer uses for it."));
    }
  }
}

const GIF_FOOT = "Space plays or pauses  ·  , and . step a frame  ·  [ and ] speed  ·  L loops  ·  F fits  ·  ← → show the next or previous item  ·  Esc closes";

/** An animated GIF: a viewer with play, pause, frame stepping, speed and loop (a plain picture when it can't be read frame by frame). */
function mountGif(entry, mine, open) {
  setCopy({ label: "Copy picture", tip: "Put the picture on the clipboard, to paste into a document or chat", run: () => copyImageFile(entry) });
  destroyGif();
  const viewer = createGifViewer(entry);
  ql.gif = viewer;
  open(viewer.root);
  viewer.ready.then((r) => {
    if (!ql || mine !== ql.seq) return;
    if (r.fallback) {
      destroyGif();
      open(r.fallback);
      return;
    }
    setSub(`${baseSub(entry)}  ·  ${r.facts}`);
    ql.foot.textContent = GIF_FOOT;
  });
}

/** Sound and video: one player for the whole queue (the other sound and video files of the folder). */
function mountPlayer(entry, mine) {
  if (ql.player) {
    if (ql.player.show(entry)) return;
    destroyPlayer();
  }
  if (mine !== ql.seq) return;
  ql.player = createPlayer({ entries: ql.entries, start: entry, subtitleEntries: ql.entries, announce, onTrack: (e) => followTrack(e) });
  ql.body.replaceChildren(ql.player.root);
  ql.foot.textContent = "Space plays or pauses  ·  ← → seek  ·  ↑ ↓ volume  ·  N and B next and previous  ·  E equalizer  ·  Q queue  ·  Esc closes  ·  Enter opens it in another program";
}

/** The player moved to another track by itself (the queue, shuffle, repeat): keep the window's header and selection in step. */
function followTrack(entry) {
  if (!ql) return;
  const index = ql.entries.findIndex((e) => e.path === entry.path);
  if (index < 0 || index === ql.index) return;
  ql.index = index;
  ++ql.seq;
  ql.icon.textContent = entry.icon || iconFor(entry.name, entry.isDir);
  ql.title.textContent = entry.name;
  setSub(baseSub(entry));
  ql.count.textContent = `${index + 1} of ${ql.entries.length}`;
  ql.dialog.setAttribute("aria-label", `Quick Look: ${entry.name}`);
  setActions(entry);
  focusIndex(index, { pane: ql.pane });
}

async function show(index) {
  const entry = ql.entries[index];
  if (!entry) return;
  const mine = ++ql.seq;
  ql.index = index;
  destroyGif();
  if (!mediaKindOfName(entry.name)) {
    destroyPlayer();
    ql.foot.textContent = DEFAULT_FOOT;
  }
  setCopy(null);
  setCachedQuickLookSelection("");
  clearQuickLookHighlights();
  if (ql.copySelBtn) ql.copySelBtn.hidden = true;
  setActions(entry);
  ql.icon.textContent = entry.icon || iconFor(entry.name, entry.isDir);
  ql.title.textContent = entry.name;
  setSub(baseSub(entry));
  ql.count.textContent = `${index + 1} of ${ql.entries.length}`;
  ql.dialog.setAttribute("aria-label", `Quick Look: ${entry.name}`);
  announce(`Quick Look: ${entry.name}, ${index + 1} of ${ql.entries.length}`);
  focusIndex(index, { pane: ql.pane });
  await renderBody(entry, mine);
}

export function closeQuickLook() {
  if (!ql) return;
  destroyPlayer();
  destroyGif();
  setCachedQuickLookSelection("");
  clearQuickLookHighlights();
  document.removeEventListener("keydown", onKey, true);
  document.removeEventListener("selectionchange", onSelectionChange);
  ql.backdrop.remove();
  const { opener } = ql;
  ql = null;
  if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
}

function step(delta) {
  const next = ql.index + delta;
  if (next >= 0 && next < ql.entries.length) show(next);
}

function openCurrent() {
  const entry = ql.entries[ql.index];
  closeQuickLook();
  if (entry) openEntry(entry, { viewer: false });
}

function onKey(e) {
  if (!ql) return;
  // A menu or a dialog opened from here has the keys first.
  if (menuIsOpen() || document.querySelector(".modal-backdrop")) return;
  const target = e.target instanceof Element ? e.target : null;
  const onControl = !!target?.closest("button, select, input, textarea, a[href], [role='link']");
  const isArrow = e.key.startsWith("Arrow");
  if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "f" || e.key === "F")) {
    e.stopPropagation();
    e.preventDefault();
    const selText = getSelectedTextInQuickLook(ql.body);
    toggleQuickLookFindBar(ql.body, selText && selText.length <= 80 ? selText.trim() : "");
    return;
  }
  // While Quick Look is open it owns the keyboard: nothing reaches the file list underneath.
  if (e.ctrlKey || e.metaKey || e.altKey) { if (!e.metaKey && !e.ctrlKey) e.stopPropagation(); return; }
  if (e.key === "Escape") {
    e.stopPropagation();
    e.preventDefault();
    // A player filling the window steps back first; the next Esc closes Quick Look.
    if (ql.player?.leaveFill?.()) return;
    return closeQuickLook();
  }
  if (e.key === "Tab") {
    e.stopPropagation();
    e.preventDefault();
    const items = [...ql.dialog.querySelectorAll("button, select, input, audio[controls], video[controls], [tabindex='0']")].filter((el) => !el.disabled && !el.hidden && !el.closest("[hidden]"));
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    return;
  }
  // A focused button, list or slider keeps the keys it uses itself (Space and Enter press a button; arrows move a slider or a list).
  if (e.key === "Enter" && target?.closest("button, [role='link']")) { e.stopPropagation(); return; }
  if (e.key === " " && onControl) { e.stopPropagation(); return; }
  if (isArrow && target?.closest("select, input[type=range], input[type=text], input[type=search]")) { e.stopPropagation(); return; }
  if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); return openCurrent(); }
  // The player owns the rest of the keys while a sound or video is in view.
  if (ql.player && ql.player.handleKey(e)) { e.stopPropagation(); e.preventDefault(); return; }
  if (ql.gif && ql.gif.handleKey(e)) { e.stopPropagation(); e.preventDefault(); return; }
  if ((e.key === "p" || e.key === "P") && ql.mdController && !target?.closest("input, textarea")) {
    e.stopPropagation();
    e.preventDefault();
    ql.mdController.toggleMode();
    return;
  }
  const imgInspector = ql.body?.querySelector("[data-ql-img-inspector]");
  if (imgInspector && !target?.closest("input, textarea, select")) {
    const keyMap = {
      "+": "[data-ql-img-zoom-in]",
      "=": "[data-ql-img-zoom-in]",
      "-": "[data-ql-img-zoom-out]",
      "_": "[data-ql-img-zoom-out]",
      "0": "[data-ql-img-zoom-reset]",
      "r": "[data-ql-img-rot-right]",
      "R": e.shiftKey ? "[data-ql-img-rot-left]" : "[data-ql-img-rot-right]",
      "h": "[data-ql-img-flip-h]",
      "H": "[data-ql-img-flip-h]",
      "v": "[data-ql-img-flip-v]",
      "V": "[data-ql-img-flip-v]",
      "b": "[data-ql-img-backdrop]",
      "B": "[data-ql-img-backdrop]",
    };
    const btnSel = keyMap[e.key];
    if (btnSel) {
      const btn = imgInspector.querySelector(btnSel);
      if (btn) {
        e.stopPropagation();
        e.preventDefault();
        btn.click();
        return;
      }
    }
  }
  const mine = e.key === " " || isArrow || e.key === "Home" || e.key === "End";
  if (!mine) { e.stopPropagation(); return; }
  e.stopPropagation();
  e.preventDefault();
  if (e.key === " ") return closeQuickLook();
  if (e.key === "ArrowRight" || e.key === "ArrowDown") return step(1);
  if (e.key === "ArrowLeft" || e.key === "ArrowUp") return step(-1);
  if (e.key === "Home") return show(0);
  if (e.key === "End") return show(ql.entries.length - 1);
}

// ops.openPath asks for a look by event (it sits below this module).
on("quicklook-open", (entry) => {
  closeQuickLook();
  openQuickLook(entry);
});

/** Opens Quick Look on `entry` (default: the focused or first selected item of the active list). */
export function openQuickLook(entry = null, pane = activePane()) {
  if (ql) return closeQuickLook();
  if (inTrash()) return toast("Restore it from the Recycle Bin first, then you can look at it.");
  const entries = visibleEntries(pane);
  const target = entry ?? entries.find((e) => e.path === pane.focusKey) ?? selectedEntries()[0];
  const index = target ? entries.findIndex((e) => e.path === target.path) : -1;
  if (index < 0) return toast("Select a file first, then press Space.");
  const icon = h("span", { class: "ql-icon", "aria-hidden": "true" });
  const title = h("div", { class: "ql-title" });
  const sub = h("div", { class: "ql-sub" });
  const count = h("span", { class: "ql-count" });
  const body = h("div", { class: "ql-body", "aria-live": "off" });
  const foot = h("div", { class: "ql-foot" }, DEFAULT_FOOT);
  const copyBtn = h("button", { type: "button", class: "btn", hidden: true, onmousedown: (e) => e.preventDefault(), onclick: () => ql?.copyAction?.() }, "Copy");
  const copySelBtn = h(
    "button",
    {
      type: "button",
      class: "btn primary",
      hidden: true,
      title: "Copy the selected text in this preview to the clipboard",
      onmousedown: (e) => e.preventDefault(),
      onclick: async () => {
        const selText = getSelectedTextInQuickLook(ql?.body);
        if (!selText) return;
        if (await copyToClipboard(selText, { what: `selected text (${selText.length.toLocaleString("en-US")} chars)` })) {
          flashCopied(copySelBtn, "Copied ✓");
        }
      },
    },
    "✂️ Copy selected",
  );
  const current = () => ql?.entries[ql.index];
  // Convert, Edit and the dialogs of the More menu work on the selection, which follows Quick Look, so Quick Look steps aside first.
  const thenClose = (fn) => () => { const e = current(); if (!e) return; closeQuickLook(); fn(e); };
  const pkgBtn = h("button", { type: "button", class: "btn", hidden: true, title: "Browse the internal files and folders inside this package directory", onclick: thenClose((e) => goToIn(activePane(), e.path)) }, "📦 Package Contents");
  const convertBtn = h("button", { type: "button", class: "btn", hidden: true, title: "Turn this file into another format, or make a smaller or changed copy (Convert and process)", onclick: thenClose(() => showToolsDialog()) }, "Convert…");
  const editBtn = h("button", { type: "button", class: "btn", hidden: true, title: "Edit it in the built-in Code editor", onclick: thenClose((e) => openInCode(e.path)) }, "Edit");
  const studioBtn = h("button", { type: "button", class: "btn", hidden: true, id: "ql-studio", title: "Change it with sliders in the Image Studio or the Media Studio, then save a copy", onclick: thenClose((e) => openPower(isStudioPicture(e.name) ? "imagestudio" : "mediastudio", { path: e.path })) }, "Edit in Studio");
  const moreBtn = h("button", { type: "button", class: "btn", "aria-haspopup": "menu", title: "More things to do with this file", onclick: () => {
    const e = current();
    if (!e) return;
    const isPkg = isDocumentPackageEntry(e) || (e.isDir && /\.app$/i.test(e.name));
    const quick = quickMediaMenuItems([e], { limit: 8 });
    showMenu([
      { label: "Copy path", icon: "🔗", action: () => copyPathOf([e]) },
      ...(isPkg ? [{ label: "Browse package contents", icon: "📦", action: thenClose((x) => goToIn(activePane(), x.path)) }] : []),
      { label: "Open with…", icon: "🧩", disabled: e.isDir && !isPkg, action: thenClose((x) => showOpenWith([x])) },
      { label: "Show in file manager", icon: "🔎", action: () => revealEntry(e) },
      ...(quick.length ? [{ separator: true }, ...quick] : []),
      { separator: true },
      { label: "Properties…", icon: "ℹ️", action: thenClose((x) => showProperties([x.path])) },
      { label: "More info…", icon: "🔍", action: thenClose((x) => showMoreInfo([x.path])) },
    ], { anchor: moreBtn, label: "More" });
  } }, "More ▾");
  const dialog = h("div", { class: "ql", role: "dialog", "aria-modal": "true", "aria-label": "Quick Look", tabindex: "-1" },
    h("div", { class: "ql-head" }, icon, h("div", { class: "ql-headtext" }, title, sub), count,
      copyBtn, copySelBtn, pkgBtn, convertBtn, editBtn, studioBtn,
      h("button", { type: "button", class: "btn", title: "Open it with the program chosen in Settings, or the one your computer uses for it (Enter). Pictures, sound and video go to your computer's program from here.", onclick: () => openCurrent() }, "Open"),
      moreBtn,
      h("button", { type: "button", class: "btn", "aria-label": "Close Quick Look", title: "Close (Space or Esc)", onclick: () => closeQuickLook() }, "Close")),
    body,
    foot);
  const backdrop = h("div", { class: "ql-backdrop", onclick: (ev) => { if (ev.target === backdrop) closeQuickLook(); } }, dialog);
  ql = { backdrop, dialog, body, icon, title, sub, count, foot, copyBtn, copySelBtn, pkgBtn, convertBtn, editBtn, studioBtn, player: null, copyAction: null, entries, index, pane, seq: 0, opener: document.activeElement };
  $("#overlay").append(backdrop);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("selectionchange", onSelectionChange);
  dialog.focus();
  show(index);
}
