// Turns a QR code (from qrencode.js) into something to look at or save: SVG text, a grid of RGBA pixels, or text art.
// Pure functions. Colours must be #rgb, #rrggbb or #rrggbbaa so that nothing but a colour can reach the SVG.

const COLOUR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function checkColour(value, fallback) {
  return typeof value === "string" && COLOUR.test(value) ? value.toLowerCase() : fallback;
}

/** "#rrggbb" to [r, g, b, a] (0-255). */
export function parseColour(value) {
  let h = checkColour(value, "#000000").slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  if (h.length === 6) h += "ff";
  return [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const quiet = (border) => Math.max(0, Math.min(20, Math.floor(Number.isFinite(border) ? border : 4)));

/** An SVG picture of the code, one rectangle path per row of dark modules. */
export function qrToSvg(qr, { border = 4, fg = "#000000", bg = "#ffffff", pixels = 0 } = {}) {
  const b = quiet(border);
  const full = qr.size + b * 2;
  const parts = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y * qr.size + x]) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < qr.size && qr.modules[y * qr.size + x + w]) w++;
      parts.push(`M${x + b},${y + b}h${w}v1h-${w}z`);
      x += w;
    }
  }
  const dim = pixels > 0 ? ` width="${Math.round(pixels)}" height="${Math.round(pixels)}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}"${dim} shape-rendering="crispEdges">\n<rect width="100%" height="100%" fill="${checkColour(bg, "#ffffff")}"/>\n<path d="${parts.join("")}" fill="${checkColour(fg, "#000000")}"/>\n</svg>\n`;
}

/** The code as pixels: { data (RGBA), width, height }, each module `scale` pixels wide, with the quiet zone around it. */
export function qrToRgba(qr, { scale = 8, border = 4, fg = "#000000", bg = "#ffffff" } = {}) {
  const b = quiet(border);
  const s = Math.max(1, Math.min(64, Math.floor(scale)));
  const full = (qr.size + b * 2) * s;
  const data = new Uint8ClampedArray(full * full * 4);
  const light = parseColour(bg);
  const dark = parseColour(fg);
  for (let y = 0; y < full; y++) {
    for (let x = 0; x < full; x++) {
      const mx = Math.floor(x / s) - b;
      const my = Math.floor(y / s) - b;
      const on = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx] === 1;
      const c = on ? dark : light;
      const i = (y * full + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = c[3];
    }
  }
  return { data, width: full, height: full };
}

/** Text art made of block characters, two module rows per line. `invert` swaps dark and light (for a dark terminal). */
export function qrToText(qr, { border = 2, invert = false } = {}) {
  const b = quiet(border);
  const full = qr.size + b * 2;
  const dark = (x, y) => {
    const mx = x - b;
    const my = y - b;
    const on = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my * qr.size + mx] === 1;
    return invert ? !on : on;
  };
  const lines = [];
  for (let y = 0; y < full; y += 2) {
    let line = "";
    for (let x = 0; x < full; x++) {
      const top = dark(x, y);
      const bottom = y + 1 < full ? dark(x, y + 1) : !invert ? false : true;
      line += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n") + "\n";
}
