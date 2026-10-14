// Small SVG charts for the Dev tool, built with DOM calls (never HTML text): a stacked share bar, a one-row bar for a
// table cell, and a sparkline. Colours come from CSS classes (dev.css), so every theme works; the numbers are always
// written out too (legend, table, <title>), so colour is never the only signal.

const NS = "http://www.w3.org/2000/svg";

function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.append(c);
  return el;
}

const title = (text) => {
  const t = svg("title");
  t.textContent = text;
  return t;
};

/** Number of colour classes in dev.css (.dev-s0 ... .dev-s9). */
export const PALETTE = 10;

/** A one-line bar showing `part` of `whole`, for a table cell. */
export function barCell(part, whole, label) {
  const share = whole > 0 ? Math.max(0, Math.min(100, (part / whole) * 100)) : 0;
  return svg("svg", { class: "dev-bar", viewBox: "0 0 100 8", preserveAspectRatio: "none", role: "img", "aria-label": label, focusable: "false" },
    svg("rect", { class: "dev-bar-bg", x: 0, y: 0, width: 100, height: 8 }),
    svg("rect", { class: "dev-bar-fill", x: 0, y: 0, width: share.toFixed(2), height: 8 }),
    title(label));
}

/**
 * A stacked bar of language shares. items: [{ name, value }] (largest first). Small ones are merged into "Other".
 * Returns { svg, legend } where legend is a list of what each colour is, with the percentage.
 */
export function shareBar(items, { max = 9, unit = "lines", describe } = {}) {
  const total = items.reduce((n, i) => n + i.value, 0);
  const shown = items.slice(0, max);
  const rest = items.slice(max).reduce((n, i) => n + i.value, 0);
  if (rest > 0) shown.push({ name: "Other", value: rest, other: true });
  const root = svg("svg", { class: "dev-share", viewBox: "0 0 1000 28", preserveAspectRatio: "none", role: "img", "aria-label": `Share of ${unit} by language` });
  const legend = document.createElement("ul");
  legend.className = "dev-legend";
  let x = 0;
  shown.forEach((item, i) => {
    const share = total > 0 ? (item.value / total) * 100 : 0;
    const width = total > 0 ? (item.value / total) * 1000 : 0;
    const text = describe ? describe(item, share) : `${item.name}: ${item.value.toLocaleString()} ${unit} (${share.toFixed(1)}%)`;
    const cls = `dev-seg dev-s${item.other ? PALETTE - 1 : i % (PALETTE - 1)}`;
    if (width > 0) root.append(svg("rect", { class: cls, x: x.toFixed(2), y: 0, width: Math.max(width, 0.5).toFixed(2), height: 28 }, title(text)));
    x += width;
    const li = document.createElement("li");
    li.append(svg("svg", { class: "dev-swatch", viewBox: "0 0 10 10", "aria-hidden": "true", focusable: "false" }, svg("rect", { class: cls, width: 10, height: 10 })), ` ${text}`);
    legend.append(li);
  });
  return { svg: root, legend };
}

/** A sparkline of `points` [{ label, value }] as columns, with the values in each column's <title> and in `summary`. */
export function sparkline(points, { summary = "" } = {}) {
  const w = 240;
  const hgt = 48;
  const peak = Math.max(1, ...points.map((p) => p.value));
  const gap = 3;
  const bw = (w - gap * (points.length - 1)) / Math.max(1, points.length);
  const root = svg("svg", { class: "dev-spark", viewBox: `0 0 ${w} ${hgt}`, role: "img", "aria-label": summary || "Commits per month", focusable: "false" });
  root.append(svg("line", { class: "dev-spark-base", x1: 0, y1: hgt - 0.5, x2: w, y2: hgt - 0.5 }));
  points.forEach((p, i) => {
    const bh = p.value > 0 ? Math.max(2, (p.value / peak) * (hgt - 4)) : 0;
    root.append(svg("rect", { class: "dev-spark-bar", x: (i * (bw + gap)).toFixed(2), y: (hgt - bh).toFixed(2), width: bw.toFixed(2), height: bh.toFixed(2) }, title(`${p.label}: ${p.value} commit${p.value === 1 ? "" : "s"}`)));
  });
  return root;
}
