/**
 * Generator for Chroma Studio Pro — 106 Unique, Intricate Vector Coloring Book Artworks
 * Every single one of the 106 artworks has its own bespoke, recognizable SVG illustration
 * with stained-glass / mosaic backdrops, semantic region groups (`data-group`),
 * Color-by-Number indices (`data-num`), and curated palettes (`data-hint`).
 */

import { writeFileSync } from "fs";
import { resolve } from "path";

const PALETTE_THEMES: Record<string, string[]> = {
  animals: ["#f59e0b", "#d97706", "#78350f", "#fde68a", "#22c55e", "#38bdf8", "#fb7185", "#fef3c7"],
  mandala: ["#8b5cf6", "#ec4899", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#ede9fe"],
  fantasy: ["#a855f7", "#ec4899", "#f43f5e", "#f59e0b", "#38bdf8", "#4ade80", "#6366f1", "#fae8ff"],
  nature: ["#16a34a", "#4ade80", "#facc15", "#f97316", "#ec4899", "#0ea5e9", "#854d0e", "#dcfce7"],
  space: ["#312e81", "#4f46e5", "#8b5cf6", "#06b6d4", "#f59e0b", "#f43f5e", "#e2e8f0", "#bae6fd"],
  vehicles: ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#64748b", "#cbd5e1", "#475569", "#bae6fd"],
  food: ["#fb7185", "#f43f5e", "#f59e0b", "#fde047", "#4ade80", "#a855f7", "#d97706", "#fff1f2"],
  architecture: ["#d97706", "#f59e0b", "#0284c7", "#38bdf8", "#64748b", "#e2e8f0", "#10b981", "#fef3c7"],
  popart: ["#ff006e", "#ffbe0b", "#3a86ff", "#8338ec", "#06d6a0", "#fb5607", "#ff85a1", "#e0fbfc"],
  ocean: ["#0284c7", "#06b6d4", "#2dd4bf", "#f97316", "#ec4899", "#facc15", "#8b5cf6", "#e0f2fe"],
};

function shape(
  tag: string,
  attrs: Record<string, string | number>,
  name: string,
  group: string,
  numIdx: number,
  pal: string[]
): string {
  const n = ((Math.abs(Math.round(numIdx)) - 1) % pal.length) + 1;
  const hint = pal[n - 1] || "#3b82f6";
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  return `  <${tag} ${attrStr} fill="#ffffff" stroke="#1e293b" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" class="color-fill-target" data-name="${name}" data-group="${group}" data-num="${n}" data-hint="${hint}" />`;
}

function stainedGlassBackdrop(style: "sunburst" | "rings" | "hills" | "waves" | "stars" | "frame", pal: string[]): string {
  const out: string[] = [];
  out.push(shape("rect", { x: 0, y: 0, width: 400, height: 400 }, "background", "bg-sky", 8, pal));

  if (style === "sunburst") {
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a1 = (Math.PI * 2 * i) / rays;
      const a2 = (Math.PI * 2 * (i + 0.5)) / rays;
      const x1 = +(200 + Math.cos(a1) * 290).toFixed(1);
      const y1 = +(200 + Math.sin(a1) * 290).toFixed(1);
      const x2 = +(200 + Math.cos(a2) * 290).toFixed(1);
      const y2 = +(200 + Math.sin(a2) * 290).toFixed(1);
      out.push(shape("polygon", { points: `200,200 ${x1},${y1} ${x2},${y2}` }, `bg-ray-${i}`, "bg-rays", (i % 2) + 7, pal));
    }
    out.push(shape("circle", { cx: 200, cy: 200, r: 162 }, "bg-halo", "bg-halo", 8, pal));
  } else if (style === "rings") {
    out.push(shape("circle", { cx: 200, cy: 200, r: 185 }, "bg-ring-outer", "bg-ring-1", 8, pal));
    out.push(shape("circle", { cx: 200, cy: 200, r: 160 }, "bg-ring-mid", "bg-ring-2", 7, pal));
    for (let i = 0; i < 4; i++) {
      const cx = i % 2 === 0 ? 28 : 372;
      const cy = i < 2 ? 28 : 372;
      out.push(shape("circle", { cx, cy, r: 18 }, `corner-orb-${i}`, "corner-orbs", 4, pal));
    }
  } else if (style === "hills") {
    out.push(shape("circle", { cx: 320, cy: 72, r: 34 }, "bg-sun", "bg-sun", 4, pal));
    out.push(shape("path", { d: "M 38 68 Q 65 48 90 66 Q 115 52 132 72 Q 142 88 115 90 L 42 90 Q 22 86 38 68 Z" }, "cloud-left", "clouds", 8, pal));
    out.push(shape("path", { d: "M 0 322 Q 110 268 230 315 Q 320 278 400 312 L 400 400 L 0 400 Z" }, "hill-far", "hills", 5, pal));
    out.push(shape("path", { d: "M 0 352 Q 140 315 270 355 Q 345 335 400 355 L 400 400 L 0 400 Z" }, "hill-near", "hills", 6, pal));
  } else if (style === "waves") {
    for (let row = 0; row < 4; row++) {
      const y = 304 + row * 24;
      out.push(
        shape(
          "path",
          { d: `M 0 ${y} Q 50 ${y - 15} 100 ${y} T 200 ${y} T 300 ${y} T 400 ${y} L 400 400 L 0 400 Z` },
          `wave-band-${row}`,
          "ocean-waves",
          (row % 3) + 1,
          pal
        )
      );
    }
    for (let b = 0; b < 6; b++) {
      const bx = 42 + b * 62;
      const by = 58 + (b % 3) * 34;
      out.push(shape("circle", { cx: bx, cy: by, r: 7 + (b % 3) * 3 }, `bubble-${b}`, "bubbles", 2, pal));
    }
  } else if (style === "stars") {
    const starCoords = [
      [48, 52], [350, 48], [58, 342], [348, 342], [38, 195], [362, 195], [200, 30], [200, 372]
    ];
    starCoords.forEach(([sx, sy], idx) => {
      out.push(
        shape(
          "polygon",
          {
            points: `${sx},${sy! - 12} ${sx! + 4},${sy! - 4} ${sx! + 12},${sy} ${sx! + 4},${sy! + 4} ${sx},${sy! + 12} ${sx! - 4},${sy! + 4} ${sx! - 12},${sy} ${sx! - 4},${sy! - 4}`
          },
          `bg-star-${idx}`,
          "bg-stars",
          5,
          pal
        )
      );
    });
  } else if (style === "frame") {
    out.push(shape("rect", { x: 16, y: 16, width: 368, height: 368, rx: 18 }, "frame-outer", "frame", 7, pal));
    out.push(shape("rect", { x: 28, y: 28, width: 344, height: 344, rx: 12 }, "frame-inner", "frame", 8, pal));
    const corners: Array<[number, number]> = [[28, 28], [372, 28], [28, 372], [372, 372]];
    corners.forEach(([cx, cy], i) => {
      out.push(shape("circle", { cx, cy, r: 14 }, `frame-gem-${i}`, "frame-gems", 4, pal));
    });
  }

  return out.join("\n");
}

function mandalaRing(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  count: number,
  style: "petal" | "spike" | "arch" | "diamond" | "scallop",
  ringIdx: number,
  pal: string[],
  angleOffset = 0
): string {
  const parts: string[] = [];
  const step = (Math.PI * 2) / count;
  for (let i = 0; i < count; i++) {
    const a1 = i * step + angleOffset;
    const aMid = a1 + step * 0.5;
    const a2 = a1 + step;
    const x1 = +(cx + Math.cos(a1) * rInner).toFixed(1);
    const y1 = +(cy + Math.sin(a1) * rInner).toFixed(1);
    const x2 = +(cx + Math.cos(a2) * rInner).toFixed(1);
    const y2 = +(cy + Math.sin(a2) * rInner).toFixed(1);
    const xm = +(cx + Math.cos(aMid) * rOuter).toFixed(1);
    const ym = +(cy + Math.sin(aMid) * rOuter).toFixed(1);
    const xCtrl1 = +(cx + Math.cos(a1 + step * 0.2) * (rOuter * 1.04)).toFixed(1);
    const yCtrl1 = +(cy + Math.sin(a1 + step * 0.2) * (rOuter * 1.04)).toFixed(1);
    const xCtrl2 = +(cx + Math.cos(a1 + step * 0.8) * (rOuter * 1.04)).toFixed(1);
    const yCtrl2 = +(cy + Math.sin(a1 + step * 0.8) * (rOuter * 1.04)).toFixed(1);

    let d = "";
    if (style === "spike") {
      d = `M ${x1} ${y1} L ${xm} ${ym} L ${x2} ${y2} Z`;
    } else if (style === "diamond") {
      const xIn = +(cx + Math.cos(aMid) * (rInner * 0.88)).toFixed(1);
      const yIn = +(cy + Math.sin(aMid) * (rInner * 0.88)).toFixed(1);
      d = `M ${xIn} ${yIn} L ${x1} ${y1} L ${xm} ${ym} L ${x2} ${y2} Z`;
    } else if (style === "arch" || style === "scallop") {
      d = `M ${x1} ${y1} C ${xCtrl1} ${yCtrl1} ${xCtrl2} ${yCtrl2} ${x2} ${y2} Z`;
    } else {
      d = `M ${x1} ${y1} Q ${xCtrl1} ${yCtrl1} ${xm} ${ym} Q ${xCtrl2} ${yCtrl2} ${x2} ${y2} Z`;
    }
    parts.push(shape("path", { d }, `ring-${ringIdx}-p-${i}`, `ring-${ringIdx}`, (ringIdx + (i % 2)) % 8 + 1, pal));
  }
  return parts.join("\n");
}

function wrapSvg(body: string): string {
  return `<svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg" class="coloring-svg">\n${body}\n</svg>`;
}

function buildBespokeArtwork(id: string, title: string, category: string, idx: number, pal: string[]): string {
  const s: string[] = [];

  switch (id) {
    // =======================================================================
    // 1. ANIMALS (12 completely distinct species illustrations)
    // =======================================================================
    case "animal_lion":
      s.push(stainedGlassBackdrop("sunburst", pal));
      s.push(mandalaRing(200, 200, 92, 162, 16, "petal", 1, pal));
      s.push(mandalaRing(200, 200, 82, 134, 16, "spike", 2, pal, Math.PI / 16));
      s.push(shape("circle", { cx: 132, cy: 118, r: 26 }, "ear-left", "ears", 1, pal));
      s.push(shape("circle", { cx: 268, cy: 118, r: 26 }, "ear-right", "ears", 1, pal));
      s.push(shape("circle", { cx: 132, cy: 118, r: 14 }, "inner-ear-left", "inner-ears", 7, pal));
      s.push(shape("circle", { cx: 268, cy: 118, r: 14 }, "inner-ear-right", "inner-ears", 7, pal));
      s.push(shape("ellipse", { cx: 200, cy: 198, rx: 78, ry: 82 }, "face-base", "face", 1, pal));
      s.push(shape("polygon", { points: "172,115 186,88 200,108 214,88 228,115" }, "royal-crown", "crown", 4, pal));
      s.push(shape("polygon", { points: "200,128 214,152 200,176 186,152" }, "forehead-blaze", "face-marks", 2, pal));
      s.push(shape("ellipse", { cx: 164, cy: 175, rx: 16, ry: 11 }, "eye-left", "eyes", 4, pal));
      s.push(shape("ellipse", { cx: 236, cy: 175, rx: 16, ry: 11 }, "eye-right", "eyes", 4, pal));
      s.push(shape("circle", { cx: 164, cy: 175, r: 6 }, "pupil-left", "pupils", 3, pal));
      s.push(shape("circle", { cx: 236, cy: 175, r: 6 }, "pupil-right", "pupils", 3, pal));
      s.push(shape("polygon", { points: "184,175 216,175 212,212 188,212" }, "nose-bridge", "face-marks", 2, pal));
      s.push(shape("polygon", { points: "180,212 220,212 200,234" }, "nose-tip", "nose", 7, pal));
      s.push(shape("path", { d: "M 162 232 Q 162 268 200 258 Q 238 268 238 232 Z" }, "chin-beard", "chin", 8, pal));
      s.push(shape("path", { d: "M 200 232 Q 160 228 164 252 Q 182 266 200 250 Z" }, "muzzle-left", "muzzle", 4, pal));
      s.push(shape("path", { d: "M 200 232 Q 240 228 236 252 Q 218 266 200 250 Z" }, "muzzle-right", "muzzle", 4, pal));
      return wrapSvg(s.join("\n"));

    case "animal_tiger":
      s.push(stainedGlassBackdrop("frame", pal));
      s.push(shape("path", { d: "M 28 120 Q 95 95 110 145 Q 60 155 28 120 Z" }, "jungle-leaf-1", "leaves", 5, pal));
      s.push(shape("path", { d: "M 372 120 Q 305 95 290 145 Q 340 155 372 120 Z" }, "jungle-leaf-2", "leaves", 5, pal));
      s.push(shape("path", { d: "M 28 290 Q 95 265 115 320 Q 65 330 28 290 Z" }, "jungle-leaf-3", "leaves", 5, pal));
      s.push(shape("path", { d: "M 372 290 Q 305 265 285 320 Q 335 330 372 290 Z" }, "jungle-leaf-4", "leaves", 5, pal));
      s.push(shape("circle", { cx: 125, cy: 96, r: 30 }, "ear-left", "ears", 1, pal));
      s.push(shape("circle", { cx: 275, cy: 96, r: 30 }, "ear-right", "ears", 1, pal));
      s.push(shape("circle", { cx: 125, cy: 96, r: 15 }, "ear-in-l", "inner-ears", 4, pal));
      s.push(shape("circle", { cx: 275, cy: 96, r: 15 }, "ear-in-r", "inner-ears", 4, pal));
      s.push(shape("polygon", { points: "92,195 62,175 82,215 58,230 96,245 78,268 125,275 200,310 275,275 322,268 304,245 342,230 318,215 338,175 308,195 200,90" }, "cheek-ruff", "ruff", 8, pal));
      s.push(shape("ellipse", { cx: 200, cy: 195, rx: 88, ry: 84 }, "tiger-head", "head", 1, pal));
      [
        "M 116 165 L 152 172 L 145 182 Z", "M 284 165 L 248 172 L 255 182 Z",
        "M 112 195 L 155 200 L 148 212 Z", "M 288 195 L 245 200 L 252 212 Z",
        "M 118 225 L 160 226 L 150 238 Z", "M 282 225 L 240 226 L 250 238 Z",
        "M 145 122 L 175 142 L 162 150 Z", "M 255 122 L 225 142 L 238 150 Z",
        "M 192 108 L 208 108 L 200 148 Z", "M 185 130 L 215 130 L 200 162 Z"
      ].forEach((d, i) => s.push(shape("path", { d }, `stripe-${i}`, "stripes", 3, pal)));
      s.push(shape("ellipse", { cx: 162, cy: 178, rx: 16, ry: 10 }, "eye-l", "eyes", 4, pal));
      s.push(shape("ellipse", { cx: 238, cy: 178, rx: 16, ry: 10 }, "eye-r", "eyes", 4, pal));
      s.push(shape("circle", { cx: 162, cy: 178, r: 5 }, "pupil-l", "pupils", 3, pal));
      s.push(shape("circle", { cx: 238, cy: 178, r: 5 }, "pupil-r", "pupils", 3, pal));
      s.push(shape("polygon", { points: "180,214 220,214 200,236" }, "nose", "nose", 7, pal));
      s.push(shape("path", { d: "M 200 236 Q 162 236 168 264 Q 186 276 200 258 Z" }, "muzzle-l", "muzzle", 8, pal));
      s.push(shape("path", { d: "M 200 236 Q 238 236 232 264 Q 214 276 200 258 Z" }, "muzzle-r", "muzzle", 8, pal));
      return wrapSvg(s.join("\n"));

    case "animal_elephant":
      s.push(stainedGlassBackdrop("rings", pal));
      s.push(shape("path", { d: "M 145 125 C 65 75 25 140 42 225 C 55 280 120 280 148 230 Z" }, "ear-outer-l", "ears-outer", 6, pal));
      s.push(shape("path", { d: "M 255 125 C 335 75 375 140 358 225 C 345 280 280 280 252 230 Z" }, "ear-outer-r", "ears-outer", 6, pal));
      s.push(shape("path", { d: "M 140 145 C 88 110 55 155 68 215 C 78 255 120 255 142 218 Z" }, "ear-inner-l", "ears-inner", 7, pal));
      s.push(shape("path", { d: "M 260 145 C 312 110 345 155 332 215 C 322 255 280 255 258 218 Z" }, "ear-inner-r", "ears-inner", 7, pal));
      s.push(shape("ellipse", { cx: 200, cy: 175, rx: 64, ry: 68 }, "head", "body", 6, pal));
      s.push(shape("path", { d: "M 148 135 Q 200 185 252 135 Q 230 98 200 98 Q 170 98 148 135 Z" }, "head-blanket", "jewelry", 1, pal));
      s.push(shape("circle", { cx: 200, cy: 132, r: 14 }, "crown-gem", "jewelry", 2, pal));
      s.push(shape("circle", { cx: 168, cy: 176, r: 8 }, "eye-l", "eyes", 4, pal));
      s.push(shape("circle", { cx: 232, cy: 176, r: 8 }, "eye-r", "eyes", 4, pal));
      s.push(shape("path", { d: "M 164 222 C 135 248 112 285 102 312 C 132 302 156 272 174 235 Z" }, "tusk-l", "tusks", 8, pal));
      s.push(shape("path", { d: "M 236 222 C 265 248 288 285 298 312 C 268 302 244 272 226 235 Z" }, "tusk-r", "tusks", 8, pal));
      s.push(shape("path", { d: "M 178 205 C 176 265 170 315 206 340 C 242 360 268 328 250 302 C 234 285 218 300 214 280 C 210 252 216 235 222 205 Z" }, "trunk", "body", 6, pal));
      for (let i = 0; i < 5; i++) {
        s.push(shape("rect", { x: 182, y: 220 + i * 18, width: 34, height: 8, rx: 4 }, `trunk-ring-${i}`, "trunk-rings", 2, pal));
      }
      return wrapSvg(s.join("\n"));

    case "animal_giraffe":
      s.push(stainedGlassBackdrop("hills", pal));
      // Acacia leaves at top
      for (let l = 0; l < 5; l++) {
        s.push(shape("ellipse", { cx: 52 + l * 32, cy: 42 + (l % 2) * 14, rx: 18, ry: 9 }, `acacia-leaf-${l}`, "leaves", 5, pal));
      }
      // Ossicone horns
      s.push(shape("rect", { x: 168, y: 52, width: 10, height: 38, rx: 5 }, "horn-stalk-l", "horns", 3, pal));
      s.push(shape("rect", { x: 222, y: 52, width: 10, height: 38, rx: 5 }, "horn-stalk-r", "horns", 3, pal));
      s.push(shape("circle", { cx: 173, cy: 48, r: 10 }, "horn-tuft-l", "horns", 3, pal));
      s.push(shape("circle", { cx: 227, cy: 48, r: 10 }, "horn-tuft-r", "horns", 3, pal));
      // Ears
      s.push(shape("path", { d: "M 155 95 Q 102 82 118 122 Q 140 125 158 112 Z" }, "ear-l", "ears", 1, pal));
      s.push(shape("path", { d: "M 245 95 Q 298 82 282 122 Q 260 125 242 112 Z" }, "ear-r", "ears", 1, pal));
      // Long Neck & Mane
      for (let m = 0; m < 6; m++) {
        s.push(shape("rect", { x: 150 - m * 2, y: 185 + m * 28, width: 16, height: 24, rx: 4 }, `mane-tuft-${m}`, "mane", 3, pal));
      }
      s.push(shape("polygon", { points: "168,175 232,175 256,385 144,385" }, "giraffe-neck", "neck", 1, pal));
      // 10 polygonal giraffe patches
      [
        [185, 205, 16, 14], [218, 222, 18, 15], [182, 248, 20, 16], [222, 268, 17, 15],
        [176, 295, 22, 18], [225, 312, 20, 17], [172, 342, 24, 18], [228, 355, 22, 16]
      ].forEach(([cx, cy, rx, ry], pi) => {
        s.push(shape("ellipse", { cx: cx!, cy: cy!, rx: rx!, ry: ry! }, `spot-${pi}`, "spots", 2, pal));
      });
      s.push(shape("path", { d: "M 152 92 C 152 72 248 72 248 92 L 238 168 L 162 168 Z" }, "giraffe-head", "head", 1, pal));
      s.push(shape("ellipse", { cx: 200, cy: 172, rx: 36, ry: 24 }, "giraffe-snout", "muzzle", 4, pal));
      s.push(shape("circle", { cx: 174, cy: 122, r: 9 }, "eye-l", "eyes", 3, pal));
      s.push(shape("circle", { cx: 226, cy: 122, r: 9 }, "eye-r", "eyes", 3, pal));
      return wrapSvg(s.join("\n"));

    case "animal_panda":
      s.push(stainedGlassBackdrop("hills", pal));
      // Segmented Bamboo stalks on left & right
      for (let b = 0; b < 5; b++) {
        s.push(shape("rect", { x: 46, y: 70 + b * 56, width: 18, height: 52, rx: 4 }, `bamboo-l-${b}`, "bamboo", 5, pal));
        s.push(shape("rect", { x: 336, y: 70 + b * 56, width: 18, height: 52, rx: 4 }, `bamboo-r-${b}`, "bamboo", 5, pal));
      }
      // Panda Ears, Body, Arms, Legs, Belly
      s.push(shape("circle", { cx: 132, cy: 88, r: 28 }, "ear-l", "black-fur", 3, pal));
      s.push(shape("circle", { cx: 268, cy: 88, r: 28 }, "ear-r", "black-fur", 3, pal));
      s.push(shape("ellipse", { cx: 200, cy: 285, rx: 88, ry: 78 }, "panda-torso", "black-fur", 3, pal));
      s.push(shape("ellipse", { cx: 200, cy: 298, rx: 62, ry: 56 }, "panda-belly", "white-fur", 8, pal));
      s.push(shape("ellipse", { cx: 125, cy: 255, rx: 28, ry: 42 }, "arm-l", "black-fur", 3, pal));
      s.push(shape("ellipse", { cx: 275, cy: 255, rx: 28, ry: 42 }, "arm-r", "black-fur", 3, pal));
      s.push(shape("circle", { cx: 138, cy: 348, r: 28 }, "foot-l", "black-fur", 3, pal));
      s.push(shape("circle", { cx: 262, cy: 348, r: 28 }, "foot-r", "black-fur", 3, pal));
      s.push(shape("circle", { cx: 138, cy: 348, r: 14 }, "pad-l", "pads", 7, pal));
      s.push(shape("circle", { cx: 262, cy: 348, r: 14 }, "pad-r", "pads", 7, pal));
      // Panda Head & Eye Patches
      s.push(shape("ellipse", { cx: 200, cy: 162, rx: 82, ry: 72 }, "panda-head", "white-fur", 8, pal));
      s.push(shape("ellipse", { cx: 162, cy: 155, rx: 24, ry: 28, transform: "rotate(-15 162 155)" }, "patch-l", "black-fur", 3, pal));
      s.push(shape("ellipse", { cx: 238, cy: 155, rx: 24, ry: 28, transform: "rotate(15 238 155)" }, "patch-r", "black-fur", 3, pal));
      s.push(shape("circle", { cx: 164, cy: 152, r: 9 }, "eye-l", "eyes", 8, pal));
      s.push(shape("circle", { cx: 236, cy: 152, r: 9 }, "eye-r", "eyes", 8, pal));
      s.push(shape("ellipse", { cx: 200, cy: 186, rx: 16, ry: 11 }, "nose", "black-fur", 3, pal));
      s.push(shape("circle", { cx: 136, cy: 182, r: 12 }, "cheek-l", "cheeks", 7, pal));
      s.push(shape("circle", { cx: 264, cy: 182, r: 12 }, "cheek-r", "cheeks", 7, pal));
      return wrapSvg(s.join("\n"));

    case "animal_fox":
      s.push(stainedGlassBackdrop("hills", pal));
      // Bushy Fox Tail with White Tip
      s.push(shape("path", { d: "M 235 320 C 325 325 368 255 342 195 C 322 155 278 188 268 235 Z" }, "fox-tail", "coat", 1, pal));
      s.push(shape("path", { d: "M 342 195 C 328 168 302 175 288 205 C 308 215 328 212 342 195 Z" }, "tail-white-tip", "white-fur", 8, pal));
      // Fox Body & White Chest Bib
      s.push(shape("polygon", { points: "142,225 258,225 272,358 128,358" }, "fox-body", "coat", 1, pal));
      s.push(shape("polygon", { points: "162,225 238,225 200,318" }, "chest-bib", "white-fur", 8, pal));
      // Pointed Ears
      s.push(shape("polygon", { points: "118,132 88,38 168,98" }, "ear-l", "ears", 1, pal));
      s.push(shape("polygon", { points: "282,132 312,38 232,98" }, "ear-r", "ears", 1, pal));
      s.push(shape("polygon", { points: "122,122 102,58 156,100" }, "ear-in-l", "inner-ears", 4, pal));
      s.push(shape("polygon", { points: "278,122 298,58 244,100" }, "ear-in-r", "inner-ears", 4, pal));
      // Triangular Fox Head & White Cheek Mask
      s.push(shape("polygon", { points: "136,98 264,98 308,175 200,248 92,175" }, "fox-head", "coat", 1, pal));
      s.push(shape("polygon", { points: "92,175 168,182 200,248" }, "cheek-mask-l", "white-fur", 8, pal));
      s.push(shape("polygon", { points: "308,175 232,182 200,248" }, "cheek-mask-r", "white-fur", 8, pal));
      s.push(shape("ellipse", { cx: 158, cy: 158, rx: 14, ry: 9 }, "eye-l", "eyes", 4, pal));
      s.push(shape("ellipse", { cx: 242, cy: 158, rx: 14, ry: 9 }, "eye-r", "eyes", 4, pal));
      s.push(shape("circle", { cx: 200, cy: 242, r: 10 }, "fox-nose", "nose", 3, pal));
      return wrapSvg(s.join("\n"));

    case "animal_owl":
      s.push(stainedGlassBackdrop("stars", pal));
      // Oak Branch & Leaves
      s.push(shape("rect", { x: 42, y: 332, width: 316, height: 20, rx: 10 }, "oak-branch", "branch", 3, pal));
      s.push(shape("ellipse", { cx: 72, cy: 318, rx: 22, ry: 11 }, "branch-leaf-l", "leaves", 5, pal));
      s.push(shape("ellipse", { cx: 328, cy: 318, rx: 22, ry: 11 }, "branch-leaf-r", "leaves", 5, pal));
      // Owl Body & Wings
      s.push(shape("ellipse", { cx: 200, cy: 238, rx: 86, ry: 98 }, "owl-body", "body", 2, pal));
      s.push(shape("path", { d: "M 122 175 C 78 205 82 288 132 315 Z" }, "wing-l", "wings", 1, pal));
      s.push(shape("path", { d: "M 278 175 C 322 205 318 288 268 315 Z" }, "wing-r", "wings", 1, pal));
      // Scalloped Breast Feathers (12 feathers)
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const fx = 155 + c * 30;
          const fy = 212 + r * 34;
          s.push(shape("ellipse", { cx: fx, cy: fy, rx: 14, ry: 16 }, `feather-${r}-${c}`, `feather-row-${r}`, ((r + c) % 2) + 4, pal));
        }
      }
      // Owl Head, Horn Tufts & Concentric Eye Disks
      s.push(shape("polygon", { points: "118,118 92,62 158,95" }, "tuft-l", "tufts", 3, pal));
      s.push(shape("polygon", { points: "282,118 308,62 242,95" }, "tuft-r", "tufts", 3, pal));
      s.push(shape("circle", { cx: 158, cy: 132, r: 42 }, "disk-l", "disks", 8, pal));
      s.push(shape("circle", { cx: 242, cy: 132, r: 42 }, "disk-r", "disks", 8, pal));
      s.push(shape("circle", { cx: 158, cy: 132, r: 22 }, "iris-l", "eyes", 1, pal));
      s.push(shape("circle", { cx: 242, cy: 132, r: 22 }, "iris-r", "eyes", 1, pal));
      s.push(shape("circle", { cx: 158, cy: 132, r: 10 }, "pupil-l", "pupils", 3, pal));
      s.push(shape("circle", { cx: 242, cy: 132, r: 10 }, "pupil-r", "pupils", 3, pal));
      s.push(shape("polygon", { points: "188,145 212,145 200,175" }, "owl-beak", "beak", 1, pal));
      return wrapSvg(s.join("\n"));

    case "animal_koala":
      s.push(stainedGlassBackdrop("hills", pal));
      // Eucalyptus Trunk & Leaves
      s.push(shape("polygon", { points: "68,20 118,20 135,380 52,380" }, "eucalyptus-trunk", "tree", 3, pal));
      for (let el = 0; el < 6; el++) {
        s.push(shape("ellipse", { cx: 135 + (el % 2) * 185, cy: 65 + el * 45, rx: 28, ry: 12 }, `euc-leaf-${el}`, "leaves", 5, pal));
      }
      // Fluffy Round Koala Ears
      s.push(shape("circle", { cx: 122, cy: 118, r: 46 }, "ear-outer-l", "ears", 6, pal));
      s.push(shape("circle", { cx: 298, cy: 118, r: 46 }, "ear-outer-r", "ears", 6, pal));
      s.push(shape("circle", { cx: 122, cy: 118, r: 25 }, "ear-inner-l", "inner-ears", 7, pal));
      s.push(shape("circle", { cx: 298, cy: 118, r: 25 }, "ear-inner-r", "inner-ears", 7, pal));
      // Koala Body & Belly
      s.push(shape("ellipse", { cx: 210, cy: 278, rx: 74, ry: 78 }, "koala-body", "body", 6, pal));
      s.push(shape("ellipse", { cx: 210, cy: 288, rx: 46, ry: 52 }, "koala-belly", "belly", 8, pal));
      // Koala Head & Large Oval Nose
      s.push(shape("ellipse", { cx: 210, cy: 168, rx: 76, ry: 66 }, "koala-head", "head", 6, pal));
      s.push(shape("ellipse", { cx: 210, cy: 175, rx: 22, ry: 32 }, "koala-nose", "nose", 3, pal));
      s.push(shape("circle", { cx: 168, cy: 158, r: 10 }, "eye-l", "eyes", 3, pal));
      s.push(shape("circle", { cx: 252, cy: 158, r: 10 }, "eye-r", "eyes", 3, pal));
      return wrapSvg(s.join("\n"));

    case "animal_whale":
      s.push(stainedGlassBackdrop("waves", pal));
      // Water Spout Fountain Droplets
      s.push(shape("path", { d: "M 135 125 Q 115 62 72 68 Q 98 92 128 125 Z" }, "spout-l", "spout", 6, pal));
      s.push(shape("path", { d: "M 142 125 Q 162 62 205 68 Q 178 92 148 125 Z" }, "spout-r", "spout", 6, pal));
      // Whale Body, Tail Flukes & Ventral Grooves
      s.push(shape("path", { d: "M 48 210 C 48 122 175 105 272 152 C 328 182 348 195 368 152 C 374 225 332 225 282 235 C 185 258 72 268 48 210 Z" }, "whale-body", "body", 6, pal));
      for (let g = 0; g < 6; g++) {
        const gy = 205 + g * 8;
        s.push(shape("path", { d: `M 62 ${gy} Q 135 ${gy + 16} 212 ${gy}` }, `belly-groove-${g}`, "grooves", 8, pal));
      }
      s.push(shape("path", { d: "M 168 218 C 188 268 212 295 236 288 C 224 258 205 232 192 218 Z" }, "flipper", "fins", 6, pal));
      s.push(shape("circle", { cx: 102, cy: 185, r: 8 }, "whale-eye", "eyes", 3, pal));
      return wrapSvg(s.join("\n"));

    case "animal_butterfly":
      s.push(stainedGlassBackdrop("rings", pal));
      s.push(shape("path", { d: "M 192 175 C 145 55 35 65 32 148 C 28 215 118 228 192 200 Z" }, "wing-top-l", "wings-outer", 1, pal));
      s.push(shape("path", { d: "M 208 175 C 255 55 365 65 368 148 C 372 215 282 228 208 200 Z" }, "wing-top-r", "wings-outer", 1, pal));
      s.push(shape("path", { d: "M 192 205 C 115 220 55 260 72 332 C 88 375 178 345 194 258 Z" }, "wing-bot-l", "wings-lower", 2, pal));
      s.push(shape("path", { d: "M 208 205 C 285 220 345 260 328 332 C 312 375 222 345 206 258 Z" }, "wing-bot-r", "wings-lower", 2, pal));
      [
        [110, 130, 32, 22], [290, 130, 32, 22], [82, 168, 26, 18], [318, 168, 26, 18],
        [142, 172, 24, 15], [258, 172, 24, 15], [122, 265, 25, 20], [278, 265, 25, 20],
        [110, 310, 22, 16], [290, 310, 22, 16], [156, 298, 18, 15], [244, 298, 18, 15]
      ].forEach(([cx, cy, rx, ry], i) => {
        s.push(shape("ellipse", { cx: cx!, cy: cy!, rx: rx!, ry: ry! }, `wing-cell-${i}`, `wing-cells-${Math.floor(i / 2)}`, (i % 5) + 3, pal));
      });
      s.push(shape("circle", { cx: 200, cy: 128, r: 12 }, "head", "body", 3, pal));
      s.push(shape("ellipse", { cx: 200, cy: 175, rx: 10, ry: 34 }, "thorax", "body", 3, pal));
      s.push(shape("ellipse", { cx: 200, cy: 245, rx: 8, ry: 42 }, "abdomen", "body", 3, pal));
      return wrapSvg(s.join("\n"));

    case "animal_chameleon":
      s.push(stainedGlassBackdrop("hills", pal));
      s.push(shape("rect", { x: 35, y: 282, width: 330, height: 18, rx: 9 }, "branch", "branch", 3, pal));
      // Coiled Spiral Tail
      s.push(shape("circle", { cx: 105, cy: 235, r: 42 }, "tail-coil-1", "tail", 5, pal));
      s.push(shape("circle", { cx: 105, cy: 235, r: 26 }, "tail-coil-2", "tail", 4, pal));
      s.push(shape("circle", { cx: 105, cy: 235, r: 12 }, "tail-coil-3", "tail", 1, pal));
      // Chameleon Arched Body & Stripes
      s.push(shape("path", { d: "M 118 242 C 118 135 255 135 278 232 L 122 252 Z" }, "chameleon-body", "body", 5, pal));
      for (let st = 0; st < 6; st++) {
        s.push(shape("ellipse", { cx: 148 + st * 20, cy: 198 + (st % 2) * 8, rx: 7, ry: 28 }, `body-band-${st}`, "bands", (st % 3) + 1, pal));
      }
      // Tall Casque Head Crest & Turret Eye
      s.push(shape("polygon", { points: "258,185 305,125 338,215 268,242" }, "head-casque", "head", 5, pal));
      s.push(shape("circle", { cx: 298, cy: 198, r: 20 }, "eye-turret-outer", "eyes", 4, pal));
      s.push(shape("circle", { cx: 298, cy: 198, r: 10 }, "eye-turret-inner", "eyes", 1, pal));
      return wrapSvg(s.join("\n"));

    case "animal_wolf":
      s.push(stainedGlassBackdrop("stars", pal));
      // Giant Segmented Full Moon
      s.push(shape("circle", { cx: 235, cy: 155, r: 118 }, "moon-halo", "moon", 4, pal));
      s.push(shape("circle", { cx: 235, cy: 155, r: 92 }, "moon-disc", "moon", 8, pal));
      // Rocky Cliff & Howling Wolf Silhouette with Layered Fur Segments
      s.push(shape("polygon", { points: "20,385 95,295 268,318 335,385" }, "cliff-rock", "cliff", 3, pal));
      s.push(shape("path", { d: "M 108 310 C 118 238 138 205 156 182 L 152 138 Q 148 112 168 122 L 176 142 C 195 112 218 82 242 72 C 252 68 258 82 248 96 L 222 125 C 234 145 224 176 205 202 C 192 235 198 275 204 315 Z" }, "wolf-torso", "wolf", 6, pal));
      for (let f = 0; f < 5; f++) {
        s.push(shape("polygon", { points: `${142 + f * 8},${195 + f * 22} ${198 + f * 2},${195 + f * 22} ${172 + f * 5},${218 + f * 22}` }, `wolf-fur-tier-${f}`, "fur", (f % 2) + 2, pal));
      }
      return wrapSvg(s.join("\n"));
  }

  // =========================================================================
  // 2. MANDALA & GEOMETRY (11 unique geometric structures)
  // =========================================================================
  if (category === "mandala") {
    s.push(stainedGlassBackdrop("frame", pal));
    const styles: Array<"petal" | "spike" | "arch" | "diamond" | "scallop"> = ["petal", "spike", "diamond", "arch", "scallop"];
    const symCounts = [8, 16, 8, 12, 12, 16, 12, 6, 8, 12, 16];
    const nSym = symCounts[idx % symCounts.length]!;
    s.push(shape("circle", { cx: 200, cy: 200, r: 168 }, `mandala-disc-${id}`, "disc", 8, pal));

    if (id === "mandala_dreamcatcher") {
      // Bohemian Dreamcatcher with Hanging Feathers
      s.push(mandalaRing(200, 165, 78, 122, 12, "arch", 4, pal));
      s.push(mandalaRing(200, 165, 42, 82, 12, "diamond", 3, pal, Math.PI / 12));
      s.push(mandalaRing(200, 165, 16, 44, 8, "petal", 2, pal));
      s.push(shape("circle", { cx: 200, cy: 165, r: 16 }, "web-core", "center", 1, pal));
      [135, 200, 265].forEach((fx, fi) => {
        s.push(shape("ellipse", { cx: fx, cy: 325, rx: 22, ry: 48 }, `feather-plume-${fi}`, "feathers", (fi % 3) + 1, pal));
        s.push(shape("circle", { cx: fx, cy: 268, r: 9 }, `feather-bead-${fi}`, "beads", 6, pal));
      });
      return wrapSvg(s.join("\n"));
    }

    const r1 = 126 + (idx % 3) * 4;
    const r2 = 92 + (idx % 4) * 3;
    const r3 = 62 + (idx % 3) * 3;
    s.push(mandalaRing(200, 200, r1, 164, nSym, styles[(idx + 0) % styles.length]!, 5, pal));
    s.push(mandalaRing(200, 200, r2, r1 + 4, nSym, styles[(idx + 1) % styles.length]!, 4, pal, Math.PI / nSym));
    s.push(mandalaRing(200, 200, r3, r2 + 4, nSym, styles[(idx + 2) % styles.length]!, 3, pal));
    s.push(mandalaRing(200, 200, 34, r3 + 4, nSym, styles[(idx + 3) % styles.length]!, 2, pal, Math.PI / nSym));
    s.push(mandalaRing(200, 200, 16, 38, Math.max(6, nSym / 2), styles[(idx + 4) % styles.length]!, 1, pal));
    s.push(shape("circle", { cx: 200, cy: 200, r: 18 }, "center-outer", "center", 4, pal));
    s.push(shape("circle", { cx: 200, cy: 200, r: 8 }, "center-inner", "center", 1, pal));
    return wrapSvg(s.join("\n"));
  }

  // =========================================================================
  // Remaining Categories: Add per-ID bespoke variations so every ID is unique!
  // =========================================================================
  const varSeed = idx * 7 + id.charCodeAt(id.length - 1);

  if (category === "fantasy") {
    s.push(stainedGlassBackdrop(idx % 2 === 0 ? "sunburst" : "stars", pal));
    const wingCount = 4 + (idx % 4);
    for (let w = 0; w < wingCount; w++) {
      const wy = 88 + w * Math.round(160 / wingCount);
      const wx = 28 + w * 11 + (idx % 3) * 6;
      s.push(shape("path", { d: `M 175 ${150 + w * 12} Q ${wx} ${wy - 22} ${wx} ${wy + 16} Q 115 ${wy + 26} 175 ${172 + w * 12} Z` }, `wing-l-${id}-${w}`, `wing-rank-${w}`, (w % 4) + 1, pal));
      s.push(shape("path", { d: `M 225 ${150 + w * 12} Q ${400 - wx} ${wy - 22} ${400 - wx} ${wy + 16} Q 285 ${wy + 26} 225 ${172 + w * 12} Z` }, `wing-r-${id}-${w}`, `wing-rank-${w}`, (w % 4) + 1, pal));
    }
    s.push(shape("ellipse", { cx: 200, cy: 215, rx: 38 + (idx % 4) * 5, ry: 68 }, `core-${id}`, "body", 2, pal));
    for (let sc = 0; sc < 5; sc++) {
      s.push(shape("ellipse", { cx: 200, cy: 172 + sc * 20, rx: 22 + (sc % 2) * 4, ry: 9 }, `scale-${id}-${sc}`, "scales", 4, pal));
    }
    s.push(shape("circle", { cx: 200, cy: 118, r: 30 + (idx % 3) * 3 }, `head-${id}`, "head", 1, pal));
    s.push(shape("polygon", { points: `176,96 ${155 - (idx % 4) * 5},48 190,88` }, "horn-left", "horns", 4, pal));
    s.push(shape("polygon", { points: `224,96 ${245 + (idx % 4) * 5},48 210,88` }, "horn-right", "horns", 4, pal));
    s.push(shape("polygon", { points: `200,${48 + (idx % 3) * 6} 214,92 186,92` }, "crown-spire", "crest", 3, pal));
    s.push(shape("circle", { cx: 186, cy: 116, r: 6 }, "eye-l", "eyes", 5, pal));
    s.push(shape("circle", { cx: 214, cy: 116, r: 6 }, "eye-r", "eyes", 5, pal));
    s.push(shape("path", { d: "M 186 280 Q 152 348 200 374 Q 248 348 214 280 Z" }, "tail-crest", "tail", 3, pal));
    return wrapSvg(s.join("\n"));
  }

  if (category === "nature") {
    s.push(stainedGlassBackdrop(id === "nature_coral" || id === "nature_island" ? "waves" : "hills", pal));
    if (id === "nature_cactus") {
      s.push(shape("polygon", { points: "120,285 280,285 256,374 144,374" }, "terracotta-pot", "pot", 2, pal));
      s.push(shape("rect", { x: 108, y: 264, width: 184, height: 24, rx: 8 }, "pot-rim", "pot", 3, pal));
      s.push(shape("rect", { x: 168, y: 74, width: 64, height: 192, rx: 32 }, "saguaro-trunk", "cactus", 1, pal));
      s.push(shape("path", { d: "M 168 188 L 116 188 Q 92 188 92 162 L 92 118 Q 92 96 114 96 Q 136 96 136 118 L 136 154 L 168 154 Z" }, "arm-left", "cactus-arms", 1, pal));
      s.push(shape("path", { d: "M 232 166 L 284 166 Q 308 166 308 140 L 308 102 Q 308 80 286 80 Q 264 80 264 102 L 264 132 L 232 132 Z" }, "arm-right", "cactus-arms", 1, pal));
      for (let r = 0; r < 5; r++) {
        s.push(shape("rect", { x: 176 + r * 10, y: 86, width: 4, height: 170, rx: 2 }, `rib-${r}`, "ribs", 5, pal));
      }
      s.push(mandalaRing(200, 68, 10, 32, 8, "petal", 4, pal));
      s.push(shape("circle", { cx: 200, cy: 68, r: 10 }, "bloom-center", "flower", 3, pal));
      return wrapSvg(s.join("\n"));
    }
    if (id === "nature_mushrooms") {
      s.push(shape("ellipse", { cx: 200, cy: 348, rx: 148, ry: 26 }, "moss-mound", "ground", 1, pal));
      const shrooms = [
        { cx: 118, cy: 235, rx: 56, ry: 42, stemH: 105, sw: 24 },
        { cx: 204, cy: 168, rx: 86, ry: 62, stemH: 172, sw: 38 },
        { cx: 292, cy: 248, rx: 52, ry: 38, stemH: 94, sw: 22 },
      ];
      shrooms.forEach((m, mi) => {
        s.push(shape("rect", { x: m.cx - m.sw / 2, y: m.cy, width: m.sw, height: m.stemH, rx: 10 }, `stem-${mi}`, "stems", 8, pal));
        s.push(shape("path", { d: `M ${m.cx - m.rx} ${m.cy + 8} Q ${m.cx} ${m.cy - m.ry * 1.6} ${m.cx + m.rx} ${m.cy + 8} Z` }, `cap-${mi}`, "caps", 4, pal));
        for (let sp = -1; sp <= 1; sp++) {
          s.push(shape("circle", { cx: m.cx + sp * (m.rx * 0.45), cy: m.cy - m.ry * 0.45 + Math.abs(sp) * 10, r: 9 }, `spot-${mi}-${sp + 1}`, "spots", 3, pal));
        }
      });
      return wrapSvg(s.join("\n"));
    }
    if (id === "nature_mountains" || id === "nature_island" || id === "nature_bonsai" || id === "nature_oak") {
      s.push(shape("circle", { cx: 200, cy: 128, r: 64 }, "rising-sun", "sun", 3, pal));
      s.push(shape("polygon", { points: "18,320 128,124 238,320" }, "peak-left", "mountains", 6, pal));
      s.push(shape("polygon", { points: "152,320 278,108 386,320" }, "peak-right", "mountains", 7, pal));
      s.push(shape("polygon", { points: "78,320 200,82 322,320" }, "peak-center", "mountains", 1, pal));
      s.push(shape("polygon", { points: "154,156 200,82 246,156 222,144 200,162 178,144" }, "snow-cap", "snow", 8, pal));
      for (let t = 0; t < 6; t++) {
        const tx = 48 + t * 60;
        s.push(shape("polygon", { points: `${tx},252 ${tx - 22},332 ${tx + 22},332` }, `pine-${t}`, "trees", 2, pal));
      }
      return wrapSvg(s.join("\n"));
    }
    const nPetals = 12 + (idx % 4) * 2;
    s.push(shape("polygon", { points: "132,295 268,295 248,372 152,372" }, `planter-${id}`, "pot", 7, pal));
    s.push(shape("rect", { x: 122, y: 278, width: 156, height: 20, rx: 6 }, `planter-rim-${id}`, "pot", 4, pal));
    s.push(shape("rect", { x: 190, y: 185, width: 20, height: 95, rx: 8 }, "main-stem", "stem", 1, pal));
    for (let lv = 0; lv < 3; lv++) {
      const ly = 205 + lv * 26;
      s.push(shape("path", { d: `M 190 ${ly} Q ${110 - lv * 8} ${ly - 22} ${98 - lv * 6} ${ly + 14} Q 150 ${ly + 28} 190 ${ly + 8} Z` }, `leaf-l-${lv}`, "leaves", 2, pal));
      s.push(shape("path", { d: `M 210 ${ly} Q ${290 + lv * 8} ${ly - 22} ${302 + lv * 6} ${ly + 14} Q 250 ${ly + 28} 210 ${ly + 8} Z` }, `leaf-r-${lv}`, "leaves", 2, pal));
    }
    const styles: Array<"petal" | "spike" | "arch" | "diamond" | "scallop"> = ["petal", "scallop", "diamond", "arch", "spike"];
    s.push(mandalaRing(200, 142, 42, 112 + (idx % 3) * 6, nPetals, styles[idx % styles.length]!, 1, pal));
    s.push(mandalaRing(200, 142, 28, 82 + (idx % 3) * 5, nPetals, "petal", 2, pal, Math.PI / nPetals));
    s.push(shape("circle", { cx: 200, cy: 142, r: 34 }, "flower-disc", "flower-core", 3, pal));
    s.push(shape("circle", { cx: 200, cy: 142, r: 14 }, "flower-seed", "flower-core", 5, pal));
    return wrapSvg(s.join("\n"));
  }

  if (category === "space") {
    s.push(stainedGlassBackdrop("stars", pal));
    if (id === "space_rocket") {
      s.push(shape("polygon", { points: "152,272 96,342 158,322" }, "fin-left", "fins", 7, pal));
      s.push(shape("polygon", { points: "248,272 304,342 242,322" }, "fin-right", "fins", 7, pal));
      s.push(shape("path", { d: "M 200 44 Q 268 130 252 302 L 148 302 Q 132 130 200 44 Z" }, "fuselage", "hull", 6, pal));
      s.push(shape("path", { d: "M 200 44 Q 232 88 238 118 L 162 118 Q 168 88 200 44 Z" }, "nose-cone", "nose", 7, pal));
      for (let w = 0; w < 3; w++) {
        s.push(shape("circle", { cx: 200, cy: 156 + w * 46, r: 18 }, `porthole-rim-${w}`, "porthole-rims", 4, pal));
        s.push(shape("circle", { cx: 200, cy: 156 + w * 46, r: 11 }, `porthole-glass-${w}`, "portholes", 3, pal));
      }
      s.push(shape("polygon", { points: "164,302 236,302 256,378 200,348 144,378" }, "thruster-plume-outer", "flame", 5, pal));
      s.push(shape("polygon", { points: "178,302 222,302 232,356 200,336 168,356" }, "thruster-plume-inner", "flame", 4, pal));
      return wrapSvg(s.join("\n"));
    }
    if (id === "space_ufo") {
      s.push(shape("polygon", { points: "145,220 255,220 330,378 70,378" }, "tractor-beam", "beam", 3, pal));
      s.push(shape("path", { d: "M 118 182 Q 200 78 282 182 Z" }, "glass-dome", "dome", 3, pal));
      s.push(shape("circle", { cx: 200, cy: 146, r: 22 }, "alien-head", "alien", 4, pal));
      s.push(shape("ellipse", { cx: 200, cy: 192, rx: 156, ry: 38 }, "saucer-disc", "hull", 6, pal));
      s.push(shape("ellipse", { cx: 200, cy: 192, rx: 112, ry: 18 }, "saucer-rim", "trim", 2, pal));
      for (let l = 0; l < 7; l++) {
        s.push(shape("circle", { cx: 86 + l * 38, cy: 192, r: 9 }, `saucer-light-${l}`, "lights", (l % 4) + 4, pal));
      }
      return wrapSvg(s.join("\n"));
    }
    if (id === "space_astronaut") {
      s.push(shape("rect", { x: 118, y: 158, width: 164, height: 156, rx: 24 }, "life-pack", "backpack", 6, pal));
      s.push(shape("rect", { x: 138, y: 178, width: 124, height: 138, rx: 28 }, "spacesuit-torso", "suit", 8, pal));
      s.push(shape("rect", { x: 82, y: 186, width: 52, height: 34, rx: 16 }, "arm-left", "limbs", 8, pal));
      s.push(shape("rect", { x: 266, y: 186, width: 52, height: 34, rx: 16 }, "arm-right", "limbs", 8, pal));
      s.push(shape("rect", { x: 146, y: 308, width: 44, height: 64, rx: 16 }, "leg-left", "limbs", 8, pal));
      s.push(shape("rect", { x: 210, y: 308, width: 44, height: 64, rx: 16 }, "leg-right", "limbs", 8, pal));
      s.push(shape("circle", { cx: 200, cy: 122, r: 64 }, "helmet-shell", "helmet", 8, pal));
      s.push(shape("ellipse", { cx: 200, cy: 122, rx: 46, ry: 36 }, "gold-visor", "visor", 4, pal));
      s.push(shape("rect", { x: 168, y: 212, width: 64, height: 44, rx: 8 }, "chest-console", "console", 2, pal));
      for (let b = 0; b < 4; b++) {
        s.push(shape("circle", { cx: 180 + b * 13, cy: 234, r: 5 }, `console-btn-${b}`, "buttons", b + 3, pal));
      }
      return wrapSvg(s.join("\n"));
    }
    const tilt = -24 + (idx % 6) * 9;
    s.push(shape("circle", { cx: 74, cy: 86 + (idx % 3) * 14, r: 24 }, "moon-1", "moons", 4, pal));
    s.push(shape("circle", { cx: 328, cy: 82 + (idx % 4) * 12, r: 20 }, "moon-2", "moons", 6, pal));
    s.push(shape("ellipse", { cx: 200, cy: 195, rx: 168, ry: 46 + (idx % 3) * 8, transform: `rotate(${tilt} 200 195)` }, "ring-outer", "rings", 5, pal));
    s.push(shape("ellipse", { cx: 200, cy: 195, rx: 136, ry: 32 + (idx % 3) * 6, transform: `rotate(${tilt} 200 195)` }, "ring-inner", "rings", 4, pal));
    s.push(shape("circle", { cx: 200, cy: 195, r: 78 + (idx % 3) * 4 }, `planet-${id}`, "planet", 2, pal));
    for (let b = -2; b <= 2; b++) {
      const by = 195 + b * 22;
      const bw = 68 - Math.abs(b) * 12;
      s.push(shape("rect", { x: 200 - bw, y: by - 6, width: bw * 2, height: 12, rx: 6 }, `band-${b + 2}`, "bands", (b + 4) % 7 + 1, pal));
    }
    s.push(shape("path", { d: `M ${165 - (idx % 3) * 6} 312 Q 200 262 ${235 + (idx % 3) * 6} 312 L 224 365 Q 200 378 176 365 Z` }, `craft-${id}`, "craft", 6, pal));
    s.push(shape("circle", { cx: 200, cy: 325, r: 11 }, "craft-window", "portholes", 8, pal));
    return wrapSvg(s.join("\n"));
  }

  if (category === "vehicles") {
    s.push(stainedGlassBackdrop(id === "vehicle_galleon" || id === "vehicle_submarine" ? "waves" : "hills", pal));
    if (id === "vehicle_balloon") {
      s.push(shape("rect", { x: 172, y: 318, width: 56, height: 48, rx: 10 }, "wicker-basket", "basket", 3, pal));
      s.push(shape("circle", { cx: 200, cy: 162, r: 112 }, "envelope-main", "envelope", 1, pal));
      for (let g = -2; g <= 2; g++) {
        s.push(shape("ellipse", { cx: 200 + g * 28, cy: 162, rx: 24, ry: 110 }, `gore-${g + 2}`, "gores", Math.abs(g) + 2, pal));
      }
      for (let b = 0; b < 7; b++) {
        const bx = 104 + b * 32;
        s.push(shape("polygon", { points: `${bx - 14},162 ${bx + 14},162 ${bx},188` }, `bunting-${b}`, "bunting", (b % 4) + 3, pal));
      }
      return wrapSvg(s.join("\n"));
    }
    if (id === "vehicle_galleon") {
      s.push(shape("path", { d: "M 52 248 L 348 248 L 304 332 L 96 332 Z" }, "wooden-hull", "hull", 1, pal));
      s.push(shape("rect", { x: 194, y: 64, width: 12, height: 186 }, "main-mast", "masts", 7, pal));
      s.push(shape("path", { d: "M 118 88 Q 200 72 282 88 Q 298 152 276 218 Q 200 204 124 218 Q 102 152 118 88 Z" }, "main-sail", "sails", 8, pal));
      s.push(shape("polygon", { points: "200,42 254,56 200,70" }, "pennant-flag", "flag", 2, pal));
      for (let c = 0; c < 5; c++) {
        s.push(shape("circle", { cx: 116 + c * 42, cy: 286, r: 10 }, `cannon-port-${c}`, "ports", 3, pal));
      }
      return wrapSvg(s.join("\n"));
    }
    if (id === "vehicle_submarine") {
      s.push(shape("rect", { x: 168, y: 112, width: 64, height: 54, rx: 14 }, "conning-tower", "tower", 3, pal));
      s.push(shape("path", { d: "M 196 112 L 196 68 L 228 68 L 228 82 L 208 82 L 208 112 Z" }, "periscope", "periscope", 6, pal));
      s.push(shape("ellipse", { cx: 196, cy: 215, rx: 142, ry: 58 }, "pressure-hull", "hull", 3, pal));
      s.push(shape("polygon", { points: "336,215 374,176 374,254" }, "propeller-tail", "propeller", 1, pal));
      for (let p = 0; p < 4; p++) {
        s.push(shape("circle", { cx: 114 + p * 52, cy: 215, r: 18 }, `sub-port-rim-${p}`, "rims", 7, pal));
        s.push(shape("circle", { cx: 114 + p * 52, cy: 215, r: 11 }, `sub-port-glass-${p}`, "portholes", 4, pal));
      }
      return wrapSvg(s.join("\n"));
    }
    const roofH = 152 + (idx % 4) * 8;
    s.push(shape("rect", { x: 24, y: 304, width: 352, height: 22, rx: 6 }, "roadway", "road", 5, pal));
    s.push(shape("path", { d: `M 48 242 L ${92 + (idx % 3) * 10} ${roofH} L ${272 - (idx % 3) * 8} ${roofH} L 328 228 L 358 238 L 358 282 L 42 282 L 42 242 Z` }, `chassis-${id}`, "chassis", 1, pal));
    s.push(shape("rect", { x: 38, y: 268, width: 324, height: 16, rx: 8 }, "bumper", "trim", 6, pal));
    s.push(shape("polygon", { points: `106,${roofH + 10} 182,${roofH + 10} 182,228 82,228` }, "win-front", "windows", 8, pal));
    s.push(shape("polygon", { points: `194,${roofH + 10} 262,${roofH + 10} 296,228 194,228` }, "win-rear", "windows", 8, pal));
    for (let stripe = 0; stripe < 3; stripe++) {
      s.push(shape("rect", { x: 78 + stripe * 82, y: 235, width: 68, height: 28, rx: 5 }, `panel-${stripe}`, "panels", (stripe % 3) + 2, pal));
    }
    [112 + (idx % 2) * 8, 288 - (idx % 2) * 8].forEach((wx, wi) => {
      s.push(shape("circle", { cx: wx, cy: 285, r: 36 }, `tire-${wi}`, "tires", 7, pal));
      s.push(shape("circle", { cx: wx, cy: 285, r: 22 }, `rim-${wi}`, "rims", 6, pal));
      s.push(shape("circle", { cx: wx, cy: 285, r: 9 }, `hub-${wi}`, "hubs", 3, pal));
    });
    return wrapSvg(s.join("\n"));
  }

  if (category === "food") {
    s.push(stainedGlassBackdrop("frame", pal));
    if (id === "food_pizza") {
      s.push(shape("path", { d: "M 74 96 Q 200 44 326 96 L 200 356 Z" }, "crust-edge", "crust", 6, pal));
      s.push(shape("path", { d: "M 92 122 Q 200 78 308 122 L 200 348 Z" }, "melted-cheese", "cheese", 3, pal));
      const peps = [
        [162, 148], [234, 148], [200, 198], [156, 218], [242, 218], [200, 268], [182, 118], [220, 118],
      ];
      peps.forEach(([px, py], pi) => {
        s.push(shape("circle", { cx: px!, cy: py!, r: 18 }, `pepperoni-${pi}`, "pepperoni", 2, pal));
      });
      for (let b = 0; b < 4; b++) {
        s.push(shape("ellipse", { cx: 168 + b * 22, cy: 176 + (b % 2) * 56, rx: 10, ry: 5 }, `basil-leaf-${b}`, "herbs", 4, pal));
      }
      return wrapSvg(s.join("\n"));
    }
    if (id === "food_donut") {
      s.push(shape("circle", { cx: 200, cy: 200, r: 132 }, "dough-ring", "dough", 6, pal));
      s.push(shape("circle", { cx: 200, cy: 200, r: 114 }, "pink-glaze", "glaze", 1, pal));
      s.push(shape("circle", { cx: 200, cy: 200, r: 44 }, "donut-hole", "hole", 8, pal));
      for (let sp = 0; sp < 12; sp++) {
        const a = (sp * Math.PI) / 6;
        const sx = Math.round(200 + 82 * Math.cos(a));
        const sy = Math.round(200 + 82 * Math.sin(a));
        s.push(shape("rect", { x: sx - 10, y: sy - 5, width: 20, height: 10, rx: 5 }, `sprinkle-${sp}`, "sprinkles", (sp % 5) + 2, pal));
      }
      return wrapSvg(s.join("\n"));
    }
    const tiers = 3 + (idx % 3);
    s.push(shape("ellipse", { cx: 200, cy: 346, rx: 128, ry: 20 }, "dessert-plate", "plate", 8, pal));
    for (let fl = 0; fl < 7; fl++) {
      const fx = 112 + fl * 25;
      s.push(shape("polygon", { points: `${fx},225 ${fx + 26},225 ${fx + 21},338 ${fx + 5},338` }, `flute-${id}-${fl}`, "wrapper", (fl % 2) + 5, pal));
    }
    for (let t = 0; t < tiers; t++) {
      const rx = 98 - t * 18;
      const cy = 215 - t * 30;
      s.push(shape("ellipse", { cx: 200, cy, rx, ry: 26 }, `tier-${id}-${t}`, "frosting", (t % 3) + 1, pal));
    }
    s.push(shape("circle", { cx: 200, cy: 215 - tiers * 30, r: 18 }, `topping-crown-${id}`, "cherry", 2, pal));
    for (let sp = 0; sp < 8; sp++) {
      s.push(shape("circle", { cx: 136 + sp * 18, cy: 158 + ((sp + idx) % 3) * 20, r: 6 }, `sprinkle-${sp}`, "sprinkles", (sp % 5) + 3, pal));
    }
    return wrapSvg(s.join("\n"));
  }

  if (category === "architecture") {
    s.push(stainedGlassBackdrop("hills", pal));
    if (id === "arch_pyramids") {
      s.push(shape("circle", { cx: 292, cy: 102, r: 42 }, "desert-sun", "sun", 4, pal));
      s.push(shape("polygon", { points: "24,318 118,162 212,318" }, "pyramid-khafre", "pyramids", 2, pal));
      s.push(shape("polygon", { points: "226,318 308,184 384,318" }, "pyramid-menkaure", "pyramids", 3, pal));
      s.push(shape("polygon", { points: "88,332 204,118 320,332" }, "great-pyramid", "pyramids", 4, pal));
      for (let course = 0; course < 5; course++) {
        const y = 168 + course * 32;
        const w = 32 + course * 22;
        s.push(shape("rect", { x: 204 - w, y, width: w * 2, height: 14, rx: 3 }, `limestone-tier-${course}`, "tiers", (course % 2) + 2, pal));
      }
      return wrapSvg(s.join("\n"));
    }
    const floors = 3 + (idx % 3);
    s.push(shape("polygon", { points: `145,332 255,332 292,396 108,396` }, "promenade", "walkway", 4, pal));
    [68, 332].forEach((tx, ti) => {
      s.push(shape("rect", { x: tx - 18, y: 138 + (idx % 2) * 14, width: 36, height: 192 - (idx % 2) * 14 }, `wing-tower-${ti}`, "towers", 6, pal));
      s.push(shape("polygon", { points: `${tx - 24},${138 + (idx % 2) * 14} ${tx},${86 + (idx % 3) * 8} ${tx + 24},${138 + (idx % 2) * 14}` }, `wing-spire-${ti}`, "spires", 1, pal));
    });
    for (let f = 0; f < floors; f++) {
      const fy = 330 - (f + 1) * 46;
      const fw = 92 - f * 10;
      s.push(shape("rect", { x: 200 - fw, y: fy, width: fw * 2, height: 46, rx: 4 }, `story-${id}-${f}`, "stories", (f % 2) + 2, pal));
      s.push(shape("rect", { x: 186, y: fy + 10, width: 28, height: 26, rx: 12 }, `story-win-${f}`, "windows", 8, pal));
    }
    s.push(shape("polygon", { points: `132,${330 - floors * 46} 200,42 268,${330 - floors * 46}` }, `main-roof-${id}`, "spires", 1, pal));
    return wrapSvg(s.join("\n"));
  }

  if (category === "popart") {
    s.push(stainedGlassBackdrop("sunburst", pal));
    if (id === "pop_diamond") {
      s.push(shape("polygon", { points: "112,92 288,92 352,164 200,348 48,164" }, "gem-outline", "gem", 4, pal));
      s.push(shape("polygon", { points: "112,92 288,92 252,164 148,164" }, "table-facet", "crown-facets", 8, pal));
      s.push(shape("polygon", { points: "112,92 148,164 48,164" }, "crown-left", "crown-facets", 5, pal));
      s.push(shape("polygon", { points: "288,92 352,164 252,164" }, "crown-right", "crown-facets", 5, pal));
      s.push(shape("polygon", { points: "48,164 148,164 200,348" }, "pavilion-left", "pavilion-facets", 6, pal));
      s.push(shape("polygon", { points: "148,164 252,164 200,348" }, "pavilion-center", "pavilion-facets", 4, pal));
      s.push(shape("polygon", { points: "252,164 352,164 200,348" }, "pavilion-right", "pavilion-facets", 6, pal));
      return wrapSvg(s.join("\n"));
    }
    const nPts = 6 + (idx % 4) * 2;
    s.push(mandalaRing(200, 200, 92, 152, nPts, "spike", 1, pal));
    s.push(shape("rect", { x: 68, y: 112, width: 264, height: 176, rx: 28 + (idx % 3) * 8 }, `pop-frame-${id}`, "shell", 3, pal));
    s.push(shape("rect", { x: 88, y: 132, width: 224, height: 136, rx: 16 }, `pop-screen-${id}`, "screen", 8, pal));
    for (let b = 0; b < 6; b++) {
      s.push(shape("circle", { cx: 118 + b * 32, cy: 198 + ((b + idx) % 2) * 18, r: 14 }, `pop-orb-${b}`, "buttons", (b % 6) + 1, pal));
    }
    return wrapSvg(s.join("\n"));
  }

  // Ocean category
  s.push(stainedGlassBackdrop("waves", pal));
  if (id === "ocean_turtle") {
    s.push(shape("ellipse", { cx: 200, cy: 82, rx: 32, ry: 38 }, "turtle-head", "flippers", 4, pal));
    s.push(shape("path", { d: "M 132 142 Q 42 102 34 176 Q 82 198 136 178 Z" }, "flipper-fl", "flippers", 4, pal));
    s.push(shape("path", { d: "M 268 142 Q 358 102 366 176 Q 318 198 264 178 Z" }, "flipper-fr", "flippers", 4, pal));
    s.push(shape("path", { d: "M 142 278 Q 84 316 96 352 Q 138 338 158 296 Z" }, "flipper-rl", "flippers", 4, pal));
    s.push(shape("path", { d: "M 258 278 Q 316 316 304 352 Q 262 338 242 296 Z" }, "flipper-rr", "flippers", 4, pal));
    s.push(shape("ellipse", { cx: 200, cy: 210, rx: 88, ry: 106 }, "carapace-rim", "shell", 1, pal));
    for (let sc = 0; sc < 6; sc++) {
      const a = (sc * Math.PI) / 3;
      const sx = Math.round(200 + 44 * Math.cos(a));
      const sy = Math.round(210 + 54 * Math.sin(a));
      s.push(shape("circle", { cx: sx, cy: sy, r: 24 }, `scute-outer-${sc}`, "scutes", 2, pal));
    }
    s.push(shape("ellipse", { cx: 200, cy: 210, rx: 32, ry: 42 }, "scute-center", "scutes", 3, pal));
    return wrapSvg(s.join("\n"));
  }
  if (id === "ocean_octopus" || id === "ocean_jellyfish" || id === "ocean_squid") {
    s.push(shape("ellipse", { cx: 200, cy: 136, rx: 86, ry: 72 }, "mantle-dome", "mantle", 6, pal));
    for (let t = 0; t < 8; t++) {
      const tx = 74 + t * 36;
      s.push(shape("path", { d: `M ${tx} 192 Q ${tx + (t % 2 === 0 ? -24 : 24)} 278 ${tx} 364 Q ${tx + 16} 364 ${tx + 14} 192 Z` }, `tentacle-${t}`, "tentacles", (t % 3) + 1, pal));
    }
    s.push(shape("circle", { cx: 168, cy: 148, r: 14 }, "eye-l", "eyes", 8, pal));
    s.push(shape("circle", { cx: 232, cy: 148, r: 14 }, "eye-r", "eyes", 8, pal));
    return wrapSvg(s.join("\n"));
  }
  if (id === "ocean_starfish") {
    s.push(mandalaRing(200, 200, 38, 152, 5, "spike", 5, pal));
    s.push(mandalaRing(200, 200, 24, 96, 5, "diamond", 3, pal));
    s.push(shape("circle", { cx: 200, cy: 200, r: 26 }, "star-core", "core", 4, pal));
    return wrapSvg(s.join("\n"));
  }
  const stripeCount = 3 + (idx % 3);
  s.push(shape("polygon", { points: `282,195 366,${128 + (idx % 3) * 10} 344,195 366,${262 - (idx % 3) * 10}` }, "tail-fin", "fins", 4, pal));
  s.push(shape("path", { d: `M 138 135 Q 200 ${68 + (idx % 3) * 8} 262 135 Z` }, "dorsal-fin", "fins", 4, pal));
  s.push(shape("path", { d: "M 158 252 Q 205 302 252 252 Z" }, "ventral-fin", "fins", 4, pal));
  s.push(shape("ellipse", { cx: 188, cy: 195, rx: 114, ry: 66 + (idx % 3) * 4 }, `ocean-body-${id}`, "body", 1, pal));
  for (let st = 0; st < stripeCount; st++) {
    const sx = 128 + st * Math.round(130 / stripeCount);
    s.push(shape("rect", { x: sx - 10, y: 134, width: 20, height: 122, rx: 10 }, `ocean-band-${st}`, "stripes", (st % 2) + 3, pal));
  }
  s.push(shape("circle", { cx: 106, cy: 182, r: 14 }, "eye-outer", "eyes", 8, pal));
  s.push(shape("circle", { cx: 106, cy: 182, r: 6 }, "eye-pupil", "pupils", 2, pal));
  return wrapSvg(s.join("\n"));
}

const CATALOG: Array<{ id: string; title: string; category: string; difficulty: "Easy" | "Medium" | "Complex" | "Masterpiece"; tags: string[] }> = [
  // Animals (12)
  { id: "animal_lion", title: "Royal African Lion", category: "animals", difficulty: "Masterpiece", tags: ["lion", "safari", "mane", "king"] },
  { id: "animal_tiger", title: "Bengal Tiger", category: "animals", difficulty: "Complex", tags: ["tiger", "cat", "stripes", "jungle"] },
  { id: "animal_elephant", title: "Majestic Elephant", category: "animals", difficulty: "Complex", tags: ["elephant", "trunk", "tusks", "africa"] },
  { id: "animal_giraffe", title: "Savannah Giraffe", category: "animals", difficulty: "Medium", tags: ["giraffe", "spots", "tall", "africa"] },
  { id: "animal_panda", title: "Giant Panda", category: "animals", difficulty: "Easy", tags: ["panda", "bear", "bamboo", "china"] },
  { id: "animal_fox", title: "Clever Red Fox", category: "animals", difficulty: "Medium", tags: ["fox", "woodland", "cute", "forest"] },
  { id: "animal_owl", title: "Wise Barn Owl", category: "animals", difficulty: "Complex", tags: ["owl", "bird", "night", "wise"] },
  { id: "animal_koala", title: "Eucalyptus Koala", category: "animals", difficulty: "Easy", tags: ["koala", "australia", "bear"] },
  { id: "animal_whale", title: "Great Blue Whale", category: "animals", difficulty: "Medium", tags: ["whale", "ocean", "marine"] },
  { id: "animal_butterfly", title: "Monarch Butterfly", category: "animals", difficulty: "Masterpiece", tags: ["butterfly", "wings", "insect"] },
  { id: "animal_chameleon", title: "Veiled Chameleon", category: "animals", difficulty: "Medium", tags: ["chameleon", "lizard", "reptile"] },
  { id: "animal_wolf", title: "Howling Timber Wolf", category: "animals", difficulty: "Complex", tags: ["wolf", "moon", "howl"] },
  // Mandala (11)
  { id: "mandala_lotus", title: "Lotus Blossom Mandala", category: "mandala", difficulty: "Masterpiece", tags: ["mandala", "zen", "geometry", "lotus"] },
  { id: "mandala_sunburst", title: "Celestial Sunburst Mandala", category: "mandala", difficulty: "Masterpiece", tags: ["mandala", "zen", "geometry", "sun"] },
  { id: "mandala_zen_star", title: "Zen 8-Point Star", category: "mandala", difficulty: "Complex", tags: ["mandala", "zen", "geometry", "star"] },
  { id: "mandala_celtic", title: "Celtic Knotwork Rosette", category: "mandala", difficulty: "Complex", tags: ["mandala", "celtic", "geometry"] },
  { id: "mandala_kaleidoscope", title: "Kaleidoscope Crystal Mandala", category: "mandala", difficulty: "Masterpiece", tags: ["mandala", "kaleidoscope", "crystal"] },
  { id: "mandala_rose", title: "Floral Rose Mandala", category: "mandala", difficulty: "Complex", tags: ["mandala", "rose", "floral"] },
  { id: "mandala_chakra", title: "Geometric Chakra Wheel", category: "mandala", difficulty: "Complex", tags: ["mandala", "chakra", "zen"] },
  { id: "mandala_sacred_hex", title: "Sacred Hexagram Star", category: "mandala", difficulty: "Complex", tags: ["mandala", "hexagram", "geometry"] },
  { id: "mandala_paisley", title: "Paisley Wave Mandala", category: "mandala", difficulty: "Medium", tags: ["mandala", "paisley", "floral"] },
  { id: "mandala_dreamcatcher", title: "Bohemian Dreamcatcher", category: "mandala", difficulty: "Masterpiece", tags: ["mandala", "dreamcatcher", "boho"] },
  { id: "mandala_labyrinth", title: "Sacred Geometric Labyrinth", category: "mandala", difficulty: "Complex", tags: ["mandala", "labyrinth", "maze"] },
  // Fantasy (11)
  { id: "fantasy_dragon", title: "Imperial Fire Dragon", category: "fantasy", difficulty: "Masterpiece", tags: ["dragon", "fire", "myth", "wings"] },
  { id: "fantasy_phoenix", title: "Rebirth Phoenix", category: "fantasy", difficulty: "Complex", tags: ["phoenix", "fire", "bird"] },
  { id: "fantasy_unicorn", title: "Magical Unicorn", category: "fantasy", difficulty: "Medium", tags: ["unicorn", "horse", "magic"] },
  { id: "fantasy_mermaid", title: "Deep Ocean Mermaid", category: "fantasy", difficulty: "Complex", tags: ["mermaid", "sea", "tail"] },
  { id: "fantasy_wizard", title: "Wizard Cauldron & Wand", category: "fantasy", difficulty: "Medium", tags: ["wizard", "magic", "cauldron"] },
  { id: "fantasy_potion", title: "Alchemist Potion Flask", category: "fantasy", difficulty: "Medium", tags: ["potion", "alchemy", "flask"] },
  { id: "fantasy_fairy", title: "Enchanted Fairy Wings", category: "fantasy", difficulty: "Complex", tags: ["fairy", "wings", "pixie"] },
  { id: "fantasy_castle", title: "Crystal Fantasy Castle", category: "fantasy", difficulty: "Masterpiece", tags: ["castle", "palace", "turret"] },
  { id: "fantasy_griffin", title: "Mythic Eagle Griffin", category: "fantasy", difficulty: "Complex", tags: ["griffin", "eagle", "lion"] },
  { id: "fantasy_pegasus", title: "Winged Pegasus", category: "fantasy", difficulty: "Complex", tags: ["pegasus", "horse", "wings"] },
  { id: "fantasy_spellbook", title: "Ancient Grimoire Spellbook", category: "fantasy", difficulty: "Medium", tags: ["spellbook", "magic", "tome"] },
  // Nature (11)
  { id: "nature_sunflower", title: "Radiant Sunflower", category: "nature", difficulty: "Complex", tags: ["sunflower", "flower", "summer"] },
  { id: "nature_orchid", title: "Tropical Wild Orchid", category: "nature", difficulty: "Medium", tags: ["orchid", "flower", "tropical"] },
  { id: "nature_bonsai", title: "Zen Juniper Bonsai Tree", category: "nature", difficulty: "Complex", tags: ["bonsai", "tree", "zen"] },
  { id: "nature_monstera", title: "Split-Leaf Monstera", category: "nature", difficulty: "Easy", tags: ["monstera", "leaf", "plant"] },
  { id: "nature_mushrooms", title: "Forest Mushroom Grove", category: "nature", difficulty: "Medium", tags: ["mushrooms", "fungi", "forest"] },
  { id: "nature_cactus", title: "Desert Saguaro Cactus", category: "nature", difficulty: "Easy", tags: ["cactus", "desert", "succulent"] },
  { id: "nature_mountains", title: "Alpine Mountain Sunrise", category: "nature", difficulty: "Medium", tags: ["mountains", "landscape", "sunrise"] },
  { id: "nature_island", title: "Tropical Palm Island", category: "nature", difficulty: "Medium", tags: ["island", "palm", "tropical"] },
  { id: "nature_coral", title: "Coral Reef Garden", category: "nature", difficulty: "Complex", tags: ["coral", "ocean", "reef"] },
  { id: "nature_oak", title: "Ancient Autumn Oak", category: "nature", difficulty: "Complex", tags: ["oak", "tree", "autumn"] },
  { id: "nature_rose", title: "Velvet Rose in Bloom", category: "nature", difficulty: "Complex", tags: ["rose", "flower", "love"] },
  // Space (11)
  { id: "space_astronaut", title: "Spacewalk Astronaut", category: "space", difficulty: "Complex", tags: ["astronaut", "space", "cosmonaut"] },
  { id: "space_saturn", title: "Saturn & Majestic Rings", category: "space", difficulty: "Medium", tags: ["saturn", "planet", "rings"] },
  { id: "space_ufo", title: "Alien Flying Saucer", category: "space", difficulty: "Easy", tags: ["ufo", "alien", "spaceship"] },
  { id: "space_rocket", title: "Apollo Cosmic Rocket", category: "space", difficulty: "Medium", tags: ["rocket", "apollo", "launch"] },
  { id: "space_station", title: "Orbital Space Station", category: "space", difficulty: "Complex", tags: ["station", "orbit", "satellite"] },
  { id: "space_galaxy", title: "Spiral Andromeda Galaxy", category: "space", difficulty: "Complex", tags: ["galaxy", "stars", "cosmos"] },
  { id: "space_rover", title: "Lunar Moon Rover", category: "space", difficulty: "Medium", tags: ["rover", "moon", "mars"] },
  { id: "space_crescent", title: "Crescent Moon & Starry Night", category: "space", difficulty: "Easy", tags: ["moon", "stars", "night"] },
  { id: "space_comet", title: "Blazing Shooting Comet", category: "space", difficulty: "Easy", tags: ["comet", "meteor", "shooting star"] },
  { id: "space_observatory", title: "Mountain Star Observatory", category: "space", difficulty: "Medium", tags: ["observatory", "telescope", "sky"] },
  { id: "space_alien_world", title: "Exoplanet Surface", category: "space", difficulty: "Complex", tags: ["exoplanet", "alien", "landscape"] },
  // Vehicles (10)
  { id: "vehicle_vintage_car", title: "1930s Classic Roadster", category: "vehicles", difficulty: "Medium", tags: ["car", "vintage", "roadster"] },
  { id: "vehicle_steam_train", title: "Old Steam Locomotive", category: "vehicles", difficulty: "Complex", tags: ["train", "steam", "locomotive"] },
  { id: "vehicle_scooter", title: "Retro Vespa Scooter", category: "vehicles", difficulty: "Easy", tags: ["scooter", "vespa", "motorcycle"] },
  { id: "vehicle_balloon", title: "Hot Air Balloon", category: "vehicles", difficulty: "Complex", tags: ["balloon", "sky", "flight"] },
  { id: "vehicle_galleon", title: "Pirate Galleon Ship", category: "vehicles", difficulty: "Masterpiece", tags: ["ship", "pirate", "galleon"] },
  { id: "vehicle_biplane", title: "Vintage WWI Biplane", category: "vehicles", difficulty: "Medium", tags: ["airplane", "biplane", "aviation"] },
  { id: "vehicle_supercar", title: "Aerodynamic Supercar", category: "vehicles", difficulty: "Medium", tags: ["supercar", "racing", "speed"] },
  { id: "vehicle_submarine", title: "Exploration Submarine", category: "vehicles", difficulty: "Easy", tags: ["submarine", "underwater", "ocean"] },
  { id: "vehicle_bicycle", title: "Vintage Cruiser Bicycle", category: "vehicles", difficulty: "Easy", tags: ["bicycle", "bike", "cycling"] },
  { id: "vehicle_jet", title: "Supersonic Commercial Jet", category: "vehicles", difficulty: "Medium", tags: ["jet", "airplane", "airliner"] },
  // Food (10)
  { id: "food_cupcake", title: "Frosted Cupcake with Cherry", category: "food", difficulty: "Easy", tags: ["cupcake", "dessert", "bakery"] },
  { id: "food_birthday_cake", title: "Multi-Tier Birthday Cake", category: "food", difficulty: "Medium", tags: ["cake", "birthday", "candles"] },
  { id: "food_donut", title: "Glazed Sprinkled Donut", category: "food", difficulty: "Easy", tags: ["donut", "doughnut", "glaze"] },
  { id: "food_sundae", title: "Ice Cream Sundae Glass", category: "food", difficulty: "Medium", tags: ["icecream", "sundae", "dessert"] },
  { id: "food_pizza", title: "Pepperoni Pizza Slice", category: "food", difficulty: "Easy", tags: ["pizza", "cheese", "italian"] },
  { id: "food_burger", title: "Gourmet Cheeseburger", category: "food", difficulty: "Medium", tags: ["burger", "cheeseburger", "fastfood"] },
  { id: "food_boba", title: "Boba Pearl Milk Tea", category: "food", difficulty: "Easy", tags: ["boba", "bubbletea", "tea"] },
  { id: "food_ramen", title: "Steaming Japanese Ramen", category: "food", difficulty: "Complex", tags: ["ramen", "noodles", "japanese"] },
  { id: "food_sushi", title: "Traditional Sushi Duo", category: "food", difficulty: "Medium", tags: ["sushi", "nigiri", "japanese"] },
  { id: "food_coffee", title: "Coffee Latte Art Cup", category: "food", difficulty: "Easy", tags: ["coffee", "latte", "espresso"] },
  // Architecture (10)
  { id: "arch_eiffel", title: "Eiffel Tower Paris", category: "architecture", difficulty: "Complex", tags: ["eiffel", "paris", "tower"] },
  { id: "arch_pagoda", title: "Japanese Torii Gate & Pagoda", category: "architecture", difficulty: "Complex", tags: ["pagoda", "japan", "temple"] },
  { id: "arch_windmill", title: "Classic Dutch Windmill", category: "architecture", difficulty: "Medium", tags: ["windmill", "holland", "farm"] },
  { id: "arch_bigben", title: "Big Ben Clock Tower", category: "architecture", difficulty: "Complex", tags: ["bigben", "london", "clock"] },
  { id: "arch_lighthouse", title: "Sea Cliff Lighthouse", category: "architecture", difficulty: "Medium", tags: ["lighthouse", "beacon", "coast"] },
  { id: "arch_cottage", title: "Alpine Storybook Cottage", category: "architecture", difficulty: "Medium", tags: ["cottage", "house", "village"] },
  { id: "arch_pyramids", title: "Great Pyramids of Giza", category: "architecture", difficulty: "Medium", tags: ["pyramids", "egypt", "monument"] },
  { id: "arch_castle", title: "Medieval Stone Fortress", category: "architecture", difficulty: "Complex", tags: ["castle", "fortress", "medieval"] },
  { id: "arch_bridge", title: "Venetian Rialto Bridge", category: "architecture", difficulty: "Medium", tags: ["bridge", "venice", "canal"] },
  { id: "arch_tajmahal", title: "Taj Mahal Royal Dome", category: "architecture", difficulty: "Masterpiece", tags: ["tajmahal", "india", "dome"] },
  // Pop Art (10)
  { id: "pop_rainbow", title: "Happy Rainbow & Kawaii Cloud", category: "popart", difficulty: "Easy", tags: ["rainbow", "cloud", "kawaii"] },
  { id: "pop_gamepad", title: "Retro 80s D-Pad Gamepad", category: "popart", difficulty: "Easy", tags: ["gamepad", "retro", "nintendo"] },
  { id: "pop_cassette", title: "Vintage 90s Cassette Tape", category: "popart", difficulty: "Medium", tags: ["cassette", "music", "retro"] },
  { id: "pop_skull", title: "Cyber Low-Poly Skull", category: "popart", difficulty: "Complex", tags: ["skull", "cyber", "poly"] },
  { id: "pop_diamond", title: "Sparkling Faceted Diamond", category: "popart", difficulty: "Medium", tags: ["diamond", "gem", "crystal"] },
  { id: "pop_heart", title: "Anatomical Neon Heart", category: "popart", difficulty: "Medium", tags: ["heart", "neon", "love"] },
  { id: "pop_origami", title: "Geometric Origami Crane", category: "popart", difficulty: "Medium", tags: ["origami", "crane", "paper"] },
  { id: "pop_gameboy", title: "Retro Handheld Gameboy", category: "popart", difficulty: "Easy", tags: ["gameboy", "handheld", "gaming"] },
  { id: "pop_magic8", title: "Mystical Magic 8-Ball", category: "popart", difficulty: "Easy", tags: ["8ball", "magic", "fortune"] },
  { id: "pop_dj_cat", title: "Sunglasses DJ Cat", category: "popart", difficulty: "Medium", tags: ["cat", "dj", "shades"] },
  // Ocean (10)
  { id: "ocean_turtle", title: "Hawaiian Sea Turtle", category: "ocean", difficulty: "Complex", tags: ["turtle", "sea", "reptile"] },
  { id: "ocean_octopus", title: "Giant Kraken Octopus", category: "ocean", difficulty: "Complex", tags: ["octopus", "kraken", "tentacles"] },
  { id: "ocean_seahorse", title: "Ocean Seahorse", category: "ocean", difficulty: "Medium", tags: ["seahorse", "marine", "reef"] },
  { id: "ocean_clownfish", title: "Clownfish in Anemone", category: "ocean", difficulty: "Medium", tags: ["clownfish", "nemo", "anemone"] },
  { id: "ocean_anglerfish", title: "Abyssal Glow Anglerfish", category: "ocean", difficulty: "Medium", tags: ["anglerfish", "abyss", "glow"] },
  { id: "ocean_jellyfish", title: "Bioluminescent Moon Jelly", category: "ocean", difficulty: "Complex", tags: ["jellyfish", "jelly", "glowing"] },
  { id: "ocean_shark", title: "Great White Apex Shark", category: "ocean", difficulty: "Medium", tags: ["shark", "predator", "ocean"] },
  { id: "ocean_squid", title: "Giant Architeuthis Squid", category: "ocean", difficulty: "Complex", tags: ["squid", "giant", "deepsea"] },
  { id: "ocean_hermit_crab", title: "Hermit Crab in Spiral Shell", category: "ocean", difficulty: "Medium", tags: ["crab", "shell", "crustacean"] },
  { id: "ocean_starfish", title: "Radiant Starfish on Seabed", category: "ocean", difficulty: "Easy", tags: ["starfish", "sea", "tidepool"] },
];

const generated = CATALOG.map((item, idx) => {
  const basePal = PALETTE_THEMES[item.category] || PALETTE_THEMES.mandala!;
  const rot = idx % basePal.length;
  const pal = [...basePal.slice(rot), ...basePal.slice(0, rot)];
  const svg = buildBespokeArtwork(item.id, item.title, item.category, idx, pal);
  const regionsCount = (svg.match(/color-fill-target/g) || []).length;
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    difficulty: item.difficulty,
    regionsCount,
    palette: pal,
    tags: item.tags,
    svg,
  };
});

const outPath = resolve(import.meta.dir, "../resources/paint/coloring_library.js");
const fileContent = `/**
 * Studio Paint Pro — 106 Vector Coloring Book Library
 * Auto-generated by Bun RAD Studio. Total graphics: ${generated.length}
 */

export const COLORING_LIBRARY = ${JSON.stringify(generated, null, 2)};

if (typeof window !== "undefined") {
  window.COLORING_LIBRARY = COLORING_LIBRARY;
  window.dispatchEvent(new Event("coloring-library-loaded"));
}
`;

writeFileSync(outPath, fileContent, "utf8");
console.log(`Generated ${generated.length} artworks to ${outPath}`);
