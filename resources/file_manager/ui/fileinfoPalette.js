// "More info": the main colors of a picture, worked out here in the page. The picture is drawn small on a canvas
// (from this app's own address, so the canvas is never "tainted") and the colors are grouped with the median-cut method.
import { rawUrl } from "./api.js";
import { h } from "./dom.js";
import { copyValue } from "./fileinfoRender.js";

const MAX_SIDE = 64;

const hex2 = (n) => n.toString(16).padStart(2, "0");
export const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
export const toRgbText = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;

export function toHslText({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  let hue = 0, s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === R) hue = ((G - B) / d) % 6;
    else if (max === G) hue = (B - R) / d + 2;
    else hue = (R - G) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return `hsl(${Math.round(hue)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

/**
 * The dominant colors of some RGBA pixels, most common first. Median cut: the pixels are split in halves along the
 * color channel that varies most, until there are `k` boxes; each box gives its average color.
 * @param {ArrayLike<number>} data RGBA bytes
 * @param {number} [k] at most 8
 * @returns {Array<{ r: number, g: number, b: number, share: number }>}
 */
export function dominantColors(data, k = 6) {
  const limit = Math.max(1, Math.min(8, Math.floor(k)));
  const pixels = [];
  for (let i = 0; i + 3 < data.length && pixels.length < 8192; i += 4) if (data[i + 3] >= 125) pixels.push([data[i], data[i + 1], data[i + 2]]);
  if (!pixels.length) return [];
  const range = (box) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const p of box) for (let c = 0; c < 3; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; }
    const spans = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    const channel = spans.indexOf(Math.max(...spans));
    return { channel, span: spans[channel] };
  };
  const boxes = [pixels];
  while (boxes.length < limit) {
    let best = -1, bestScore = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const score = range(box).span * Math.sqrt(box.length);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best < 0 || bestScore === 0) break;
    const box = boxes[best];
    const { channel } = range(box);
    box.sort((a, b) => a[channel] - b[channel]);
    const mid = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }
  const seeds = boxes.map((box) => {
    const sum = [0, 0, 0];
    for (const p of box) { sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; }
    return [sum[0] / box.length, sum[1] / box.length, sum[2] / box.length];
  });
  // A few rounds of k-means from the median-cut colors: each pixel joins its nearest color, then each color moves to the middle of its pixels.
  let centers = seeds;
  let counts = [];
  for (let round = 0; round < 6; round++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of pixels) {
      let best = 0, bestD = Infinity;
      centers.forEach((c, i) => {
        const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
      const s = sums[best];
      s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
    }
    counts = sums.map((s) => s[3]);
    centers = centers.map((c, i) => (sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c));
  }
  const colors = centers
    .map((c, i) => ({ r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]), share: counts[i] / pixels.length }))
    .filter((c) => c.share > 0);
  colors.sort((a, b) => b.share - a.share);
  return colors;
}

/**
 * Loads the picture and works out its colors. Resolves null when the picture can't be drawn (not a picture the
 * browser can show, no canvas, or the pixels can't be read).
 */
export function loadPalette(path, k = 6) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.alt = "";
    img.addEventListener("error", () => resolve(null));
    img.addEventListener("load", () => {
      try {
        const w0 = img.naturalWidth || MAX_SIDE, h0 = img.naturalHeight || MAX_SIDE;
        const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * scale)), hh = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = hh;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, hh);
        resolve(dominantColors(ctx.getImageData(0, 0, w, hh).data, k));
      } catch {
        resolve(null);
      }
    });
    img.src = rawUrl(path);
  });
}

/** The group of rows for reports and searching: one row per color. */
export function paletteGroup(colors) {
  return {
    id: "palette",
    title: "Color palette",
    hint: "The main colors of the picture, found by looking at a small copy of it on this page.",
    rows: colors.map((c, i) => ({ label: `Color ${i + 1}`, value: `${toHex(c)}  ${toRgbText(c)}  ${toHslText(c)}  (${Math.round(c.share * 100)}% of the picture)`, hint: "HEX, RGB and HSL are three ways of writing the same color." })),
  };
}

/** Swatches you can click to copy a color. */
export function paletteView(colors) {
  const items = colors.map((c, i) => {
    const hex = toHex(c);
    const swatch = h("span", { class: "fi-swatch", "aria-hidden": "true" });
    swatch.style.setProperty("--fi-swatch", hex);
    return h("li", {}, h("button", { type: "button", class: "fi-chip", title: `Copy ${hex}`, "aria-label": `Copy color ${i + 1}: ${hex}, ${toRgbText(c)}, ${toHslText(c)}`, onclick: () => copyValue(hex, hex) },
      swatch,
      h("span", { class: "fi-chip-text" }, h("strong", {}, hex), h("span", {}, toRgbText(c)), h("span", {}, toHslText(c)), h("span", { class: "hint" }, `${Math.round(c.share * 100)}%`)),
    ));
  });
  return h("section", { class: "fi-group fi-palette", dataset: { group: "palette-view" } },
    h("h3", { class: "fi-title", title: "The main colors of the picture. Click one to copy its HEX code." }, "Color palette"),
    items.length ? h("ul", { class: "fi-chips" }, items) : h("p", { class: "hint" }, "The colors could not be worked out for this picture."),
  );
}
