// The animated GIF viewer of Quick Look: play and pause, step frame by frame, scrub, change the speed, loop on or off, see
// how many frames and how long it is, and save or copy one frame as a picture. The GIF is read here (gifcore.js), so pausing
// and stepping are exact. A GIF that is a single picture, too big to hold frame by frame, or damaged is shown by the browser
// as it is (it still moves if it can), with a sentence saying why there are no controls.
import { ApiError, call, rawUrl } from "./api.js";
import { announce, h } from "./dom.js";
import { toast } from "./menus.js";
import { refresh } from "./nav.js";
import { state } from "./state.js";
import { GifError, composeFrames, composedBytes, describeGif, frameMs, parseGif } from "./gifcore.js";
import { formatSize, parentOf } from "./util.js";

export const MAX_GIF_BYTES = 40 * 1024 * 1024;
export const MAX_COMPOSED_BYTES = 256 * 1024 * 1024;
const SPEEDS = [0.25, 0.5, 1, 2, 4];

const clock = (ms) => `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;

function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** What to show when the frame controls can't be offered: the picture as the browser draws it, and why. */
function plainPicture(entry, why) {
  return h("div", { class: "gv-plain" }, h("img", { class: "ql-image", src: rawUrl(entry.path), alt: `Preview of ${entry.name}` }), why ? h("p", { class: "ql-note" }, why) : null);
}

/**
 * Makes the viewer for a GIF file entry. Returns { root, ready, handleKey, destroy }. `ready` resolves to
 * { facts } when the controls are shown, or { fallback: Node } when the plain picture should be shown instead.
 */
export function createGifViewer(entry) {
  const root = h("div", { class: "gv-root" }, h("p", { class: "ql-loading", role: "status" }, "Reading the GIF…"));
  let alive = true;
  let timer = 0;
  const stopTimer = () => {
    clearTimeout(timer);
    timer = 0;
  };
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ready = (async () => {
    if (entry.size > MAX_GIF_BYTES) return { fallback: plainPicture(entry, `This GIF is ${formatSize(entry.size)}, which is too big to step through frame by frame. It plays as it is.`) };
    let gif;
    try {
      const res = await fetch(rawUrl(entry.path));
      if (!res.ok) throw new GifError("The file couldn't be read.");
      gif = parseGif(new Uint8Array(await res.arrayBuffer()));
    } catch (err) {
      return { fallback: plainPicture(entry, err instanceof GifError ? `${err.message} It is shown as the browser draws it.` : "The file couldn't be read, so there are no frame controls.") };
    }
    if (!alive) return { fallback: plainPicture(entry, "") };
    const info = describeGif(gif);
    if (!info.animated) return { fallback: plainPicture(entry, "This GIF is a single picture, so there is nothing to play.") };
    if (composedBytes(gif) > MAX_COMPOSED_BYTES) {
      return { fallback: plainPicture(entry, `This GIF has ${info.frames} frames of ${gif.width} × ${gif.height} pixels, which is too much to hold for frame-by-frame viewing. It plays as it is.`) };
    }
    const rgba = composeFrames(gif);
    // Only a picture with holes in it is "see-through": most GIFs use a transparent colour just to save space between frames.
    const seeThrough = rgba.some((px) => {
      for (let i = 3; i < px.length; i += 4) if (px[i] === 0) return true;
      return false;
    });
    const images = rgba.map((px) => new ImageData(px, gif.width, gif.height));
    const delays = gif.frames.map((f) => frameMs(f.delay));
    const starts = delays.reduce((acc, d, i) => (acc.push(i ? acc[i - 1] + delays[i - 1] : 0), acc), []);
    const total = delays.reduce((a, b) => a + b, 0);
    const n = images.length;

    let at = 0;
    let playing = !reduced;
    let speed = 1;
    let loop = gif.loop !== -1;
    let fit = true;

    const canvas = h("canvas", { class: "gv-canvas", width: gif.width, height: gif.height, role: "img", "aria-label": `${entry.name}, an animated picture of ${n} frames` });
    const ctx = canvas.getContext("2d");
    const stage = h("div", { class: "gv-stage" }, canvas);
    const label = h("span", { class: "gv-label", "aria-hidden": "true" });
    const live = h("span", { class: "sr-only", role: "status", "aria-live": "polite" });
    const scrub = h("input", { type: "range", class: "gv-scrub", min: "0", max: String(n - 1), step: "1", value: "0", "aria-label": "Frame" });
    const btn = (text, tip, on, extra = {}) => h("button", { type: "button", class: "gv-btn", title: tip, "aria-label": tip, onclick: on, ...extra }, text);
    const playBtn = btn("⏸", "Pause (Space)", () => toggle(), { dataset: { role: "play" } });
    const speedSel = h("select", { class: "gv-select", "aria-label": "Speed", title: "How fast it plays ([ and ] change it)", onchange: () => { speed = Number(speedSel.value); } },
      ...SPEEDS.map((s) => h("option", { value: String(s), selected: s === 1 }, `${s}×`)));
    const loopBox = h("input", { type: "checkbox", checked: loop, onchange: () => { loop = loopBox.checked; } });
    const fitBtn = btn("⤢", "Fit to the window or show at actual size (F)", () => setFit(!fit), { "aria-pressed": "true" });

    function draw(index, quiet = false) {
      at = Math.max(0, Math.min(n - 1, index));
      ctx.putImageData(images[at], 0, 0);
      scrub.value = String(at);
      label.textContent = `Frame ${at + 1} of ${n}  ·  ${clock(starts[at])} of ${clock(total)}`;
      if (!quiet) live.textContent = `Frame ${at + 1} of ${n}`;
    }
    function schedule() {
      stopTimer();
      if (!alive || !playing) return;
      timer = setTimeout(() => {
        const last = at + 1 >= n;
        if (last && !loop) return pause();
        draw(last ? 0 : at + 1, true);
        schedule();
      }, Math.max(10, delays[at] / speed));
    }
    function pause() {
      playing = false;
      stopTimer();
      playBtn.textContent = "▶";
      playBtn.title = "Play (Space)";
      playBtn.setAttribute("aria-label", "Play (Space)");
      live.textContent = `Paused at frame ${at + 1} of ${n}`;
    }
    function play() {
      if (at + 1 >= n && !loop) draw(0, true);
      playing = true;
      playBtn.textContent = "⏸";
      playBtn.title = "Pause (Space)";
      playBtn.setAttribute("aria-label", "Pause (Space)");
      schedule();
    }
    function toggle() {
      if (playing) pause();
      else play();
    }
    function stepBy(delta) {
      if (playing) pause();
      draw((at + delta + n) % n);
    }
    function setSpeed(delta) {
      const i = Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + delta));
      speed = SPEEDS[i];
      speedSel.value = String(speed);
      announce(`Speed ${speed} times`);
    }
    function setFit(on) {
      fit = on;
      stage.classList.toggle("gv-actual", !on);
      fitBtn.setAttribute("aria-pressed", String(on));
    }

    async function frameAsPng() {
      const c = document.createElement("canvas");
      c.width = gif.width;
      c.height = gif.height;
      c.getContext("2d").putImageData(images[at], 0, 0);
      const blob = await new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The frame couldn't be made into a picture."))), "image/png"));
      return { blob, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
    }
    async function saveFrame() {
      if (playing) pause();
      try {
        const { base64 } = await frameAsPng();
        const stem = entry.name.replace(/\.[^.]*$/, "");
        const r = await call("png/save", { dir: parentOf(entry.path, state.sep), name: `${stem}-frame-${at + 1}`, data: base64 });
        toast(`Saved frame ${at + 1} as “${r.name}” next to the GIF.`, { kind: "success" });
        refresh();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "The frame couldn't be saved.", { kind: "error" });
      }
    }
    async function copyFrame() {
      if (playing) pause();
      try {
        const { base64, blob } = await frameAsPng();
        try {
          await call("png/copy", { data: base64 });
        } catch (err) {
          if (!(err instanceof ApiError && err.code === "CLIPBOARD_FAILED") || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw err;
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        }
        toast(`Copied frame ${at + 1} to the clipboard as a picture.`, { kind: "success" });
      } catch (err) {
        toast(err instanceof ApiError ? err.message : "The frame couldn't be copied.", { kind: "error" });
      }
    }

    scrub.addEventListener("input", () => {
      if (playing) pause();
      draw(Number(scrub.value));
    });
    const bar = h("div", { class: "gv-bar", role: "group", "aria-label": "GIF controls" },
      btn("⏮", "First frame", () => stepBy(-at)),
      btn("◀", "Previous frame (,)", () => stepBy(-1)),
      playBtn,
      btn("▶|", "Next frame (.)", () => stepBy(1)),
      btn("⏭", "Last frame", () => stepBy(n - 1 - at)),
      scrub, label,
      h("label", { class: "gv-opt" }, "Speed ", speedSel),
      h("label", { class: "gv-opt" }, loopBox, " Loop"),
      fitBtn,
      btn("💾", "Save this frame as a PNG next to the GIF", saveFrame),
      btn("📋", "Copy this frame to the clipboard as a picture", copyFrame),
      live,
    );
    root.replaceChildren(stage, bar);
    draw(0, true);
    if (playing) schedule();
    else pause();

    api.handleKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.key === " ") { toggle(); return true; }
      if (e.key === ",") { stepBy(-1); return true; }
      if (e.key === ".") { stepBy(1); return true; }
      if (e.key === "[") { setSpeed(-1); return true; }
      if (e.key === "]") { setSpeed(1); return true; }
      if (e.key.toLowerCase() === "l") { loop = !loop; loopBox.checked = loop; announce(loop ? "Loop on" : "Loop off"); return true; }
      if (e.key.toLowerCase() === "f") { setFit(!fit); return true; }
      return false;
    };
    return { facts: `${gif.width} × ${gif.height}  ·  ${n} frames  ·  ${clock(total)}  ·  ${info.fps} per second  ·  repeats ${info.loop}${seeThrough ? "  ·  see-through" : ""}` };
  })();

  const api = {
    root,
    ready,
    handleKey: () => false,
    destroy() {
      alive = false;
      stopTimer();
    },
  };
  return api;
}
