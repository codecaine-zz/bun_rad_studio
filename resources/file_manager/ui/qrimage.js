// Picture helpers for the QR tool: draw a code on a canvas, make a PNG of it for saving or copying, and turn a picture file
// (from disk, the clipboard or a drop) into pixels for the reader. Needs a page (canvas); the QR maths is in qrencode.js and qrdecode.js.
import { checkColour } from "./qrrender.js";

export const MAX_READ_SIDE = 4096;
export const MAX_READ_PIXELS = 60_000_000;

/** Draws a code (qr from encodeQr) into a canvas: each module is `scale` pixels, with `border` modules around. */
export function drawCode(canvas, qr, { scale = 8, border = 4, fg = "#000000", bg = "#ffffff" } = {}) {
  const side = (qr.size + border * 2) * scale;
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = checkColour(bg, "#ffffff");
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = checkColour(fg, "#000000");
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y * qr.size + x]) { x++; continue; }
      let w = 1;
      while (x + w < qr.size && qr.modules[y * qr.size + x + w]) w++;
      ctx.fillRect((x + border) * scale, (y + border) * scale, w * scale, scale);
      x += w;
    }
  }
  return side;
}

/** The pixel size of a picture of the code, kept within what can be saved (a side of at most `limit` pixels). */
export function pictureScale(qr, wanted, border, limit = MAX_READ_SIDE) {
  return Math.max(1, Math.min(wanted, Math.floor(limit / (qr.size + border * 2))));
}

function bytesToBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A PNG of the code as base64 text (for the server to save, or to put on the clipboard). */
export async function pngBase64(qr, opts) {
  const canvas = document.createElement("canvas");
  drawCode(canvas, qr, opts);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture couldn't be made."))), "image/png"));
  return { base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())), blob, width: canvas.width };
}

/** Pixels (RGBA) of a bitmap or image, shrunk to fit MAX_READ_SIDE. Throws a sentence when the picture is too big. */
export function imageDataOf(source, width, height) {
  if (width * height > MAX_READ_PIXELS) throw new Error(`That picture is ${(width * height / 1e6).toFixed(0)} million pixels, which is too big to search. Crop it or shrink it first.`);
  const k = Math.min(1, MAX_READ_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  // A see-through picture is drawn on white, as a person would see it on paper.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Loads a picture from a Blob or File. */
export async function imageDataFromBlob(blob) {
  if (!blob || !(blob.type || "").startsWith("image/")) throw new Error("That isn't a picture. Choose a PNG, JPEG, WebP, GIF or similar picture.");
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap) throw new Error("This picture couldn't be opened. Its format may not be supported here.");
  try {
    return imageDataOf(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close?.();
  }
}

/** Loads a picture from an address of this app (a file shown by the File Manager). */
export async function imageDataFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("The picture couldn't be read.");
  const blob = await res.blob();
  try {
    return await imageDataFromBlob(blob);
  } catch (err) {
    // SVG and a few other types can only be drawn through an <img> (an address of this app is allowed by the page's policy).
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw err;
    }
    return imageDataOf(img, img.naturalWidth || 512, img.naturalHeight || 512);
  }
}

/** Shows pixels in a canvas, at most `maxSide` pixels wide or high, with the found code outlined (corners from the reader). */
export function drawPreview(canvas, image, corners, maxSide = 320) {
  const k = Math.min(1, maxSide / Math.max(image.width, image.height));
  const full = document.createElement("canvas");
  full.width = image.width;
  full.height = image.height;
  full.getContext("2d").putImageData(image, 0, 0);
  canvas.width = Math.max(1, Math.round(image.width * k));
  canvas.height = Math.max(1, Math.round(image.height * k));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
  if (!corners) return;
  const { tl, tr, bl } = corners;
  const br = { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y };
  // The centers of the corner squares; grow the outline by about a module and a half to cover the whole code.
  const cx = (tl.x + tr.x + bl.x + br.x) / 4;
  const cy = (tl.y + tr.y + bl.y + br.y) / 4;
  const grow = (p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const extra = tl.size * 3.5;
    return { x: (p.x + (dx / len) * extra) * k, y: (p.y + (dy / len) * extra) * k };
  };
  const pts = [tl, tr, br, bl].map(grow);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#1fbf6a";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.stroke();
}
