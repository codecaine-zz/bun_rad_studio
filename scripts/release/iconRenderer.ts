// The drawing program for the Mac icons, written in JavaScript for Automation (run with `osascript -l JavaScript`).
// Each icon is a multi-layered, high-detail "liquid glass & machined studio" tile: an outer titanium-glass bezel,
// deep dark-to-vivid aurora lighting, precision blueprint grid with crosshairs, polar telemetry dial ring, corner HUD
// brackets, an elevated frosted-glass center medallion with micro-rivets and status LEDs, a 3D extruded glass glyph,
// and a secondary corner instrument badge.
export const ICON_RENDERER = String.raw`ObjC.import("AppKit");
ObjC.import("CoreGraphics");
const S = 1024;
function col(hex, a) { const n = parseInt(hex.slice(1), 16); return $.NSColor.colorWithSRGBRedGreenBlueAlpha(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a === undefined ? 1 : a); }
function P(x, y) { return $.NSMakePoint(x, y); }
function R(x, y, w, h) { return $.NSMakeRect(x, y, w, h); }
function squircle(x, y, w, h, n) {
  const p = $.NSBezierPath.bezierPath;
  const cx = x + w / 2, cy = y + h / 2, a = w / 2, b = h / 2, N = 240;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const px = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), py = cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (i === 0) p.moveToPoint(P(px, py)); else p.lineToPoint(P(px, py));
  }
  p.closePath;
  return p;
}
function rounded(x, y, w, h, r) { return $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(R(x, y, w, h), r, r); }
function disc(cx, cy, r) { return $.NSBezierPath.bezierPathWithOvalInRect(R(cx - r, cy - r, 2 * r, 2 * r)); }
function stroke(path, width) { path.lineWidth = width; path.lineCapStyle = 1; path.lineJoinStyle = 1; path.stroke; }
function line(x1, y1, x2, y2, w) { const p = $.NSBezierPath.bezierPath; p.moveToPoint(P(x1, y1)); p.lineToPoint(P(x2, y2)); stroke(p, w); }

// ---- glyph masks: white shapes on transparent, 1024 square ----
function drawSymbolAt(name, cx, cy, ptSize, maxBox) {
  const sym = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription(name, $());
  if (!sym || sym.isNil()) return;
  const cfg = $.NSImageSymbolConfiguration.configurationWithPointSizeWeight(ptSize, $.NSFontWeightBold).configurationByApplyingConfiguration($.NSImageSymbolConfiguration.configurationPreferringMonochrome);
  const g = sym.imageWithSymbolConfiguration(cfg);
  const sz = g.size, k = Math.min(maxBox / sz.width, maxBox / sz.height, 2.35), w = sz.width * k, h = sz.height * k;
  g.drawInRectFromRectOperationFraction(R(cx - w / 2, cy - h / 2, w, h), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
}
function symbolMask(name) {
  drawSymbolAt(name, 512, 516, 340, 440);
}
function textMask(text) {
  const font = $.NSFont.fontWithNameSize("Menlo-Bold", 320) || $.NSFont.boldSystemFontOfSize(320);
  const attrs = $.NSMutableDictionary.alloc.init;
  attrs.setObjectForKey(font, "NSFont");
  attrs.setObjectForKey(col("#ffffff"), "NSColor");
  const t = $(text), box = t.sizeWithAttributes(attrs);
  t.drawAtPointWithAttributes(P(512 - box.width / 2, 516 - box.height / 2), attrs);
}
function clearOp(fn) {
  $.NSGraphicsContext.currentContext.compositingOperation = $.NSCompositingOperationClear;
  fn();
  $.NSGraphicsContext.currentContext.compositingOperation = $.NSCompositingOperationSourceOver;
}
function bevelBlock(x, y, s, r) {
  rounded(x, y, s, s, r).fill;
  clearOp(() => {
    stroke(rounded(x + 18, y + 18, s - 36, s - 36, Math.max(8, r - 12)), 10);
  });
  rounded(x + 34, y + s - 48, s - 68, 14, 7).fill;
}
const CUSTOM = {
  pacman() {
    // Arcade maze rails top & bottom
    rounded(260, 704, 504, 18, 9).fill;
    rounded(260, 302, 504, 18, 9).fill;
    // Pac-Man sculpted body
    const p = $.NSBezierPath.bezierPath;
    p.moveToPoint(P(430, 512));
    p.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngle(P(430, 512), 165, 36, 324);
    p.closePath; p.fill;
    clearOp(() => {
      disc(476, 612, 26).fill;
      stroke(disc(430, 512, 138), 10);
    });
    disc(484, 616, 10).fill;
    // Power pellets with rings
    disc(636, 512, 22).fill;
    disc(728, 512, 32).fill;
    clearOp(() => stroke(disc(728, 512, 20), 6));
  },
  tetris() {
    const s = 128, g = 14, x0 = 512 - (3 * s + 2 * g) / 2, y0 = 490 - (2 * s + g) / 2;
    for (let i = 0; i < 3; i++) bevelBlock(x0 + i * (s + g), y0 + s + g, s, 28);
    bevelBlock(x0 + (s + g), y0, s, 28);
    // Ghost/next piece indicator bar above
    for (let i = 0; i < 4; i++) stroke(rounded(330 + i * 94, 704, 80, 26, 8), 8);
  },
  snake() {
    const p = $.NSBezierPath.bezierPath;
    p.moveToPoint(P(618, 686));
    p.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise(P(512, 622), 124, 28, 270, false);
    p.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise(P(512, 386), 118, 90, 210, true);
    stroke(p, 84);
    disc(628, 692, 60).fill;
    // Dorsal scale notches & eye
    clearOp(() => {
      disc(644, 710, 16).fill;
      for (const [sx, sy] of [[490, 742], [394, 646], [460, 514], [596, 480], [620, 366], [496, 272]]) {
        disc(sx, sy, 14).fill;
      }
    });
    // Target energy orb
    disc(348, 464, 34).fill;
    clearOp(() => disc(348, 464, 14).fill);
  },
  pong() {
    // Left & right beveled arcade paddles
    rounded(266, 380, 54, 250, 24).fill;
    rounded(704, 420, 54, 250, 24).fill;
    clearOp(() => {
      rounded(284, 416, 18, 178, 9).fill;
      rounded(722, 456, 18, 178, 9).fill;
    });
    // Center court net & ring
    for (let i = 0; i < 7; i++) rounded(502, 268 + i * 76, 20, 44, 10).fill;
    stroke(disc(512, 512, 88), 10);
    // Ball & motion trail
    disc(564, 558, 34).fill;
    disc(506, 520, 20).fill;
    disc(458, 488, 12).fill;
  },
  breakout() {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const bx = 268 + c * 126, by = 646 - r * 68;
      rounded(bx, by, 110, 52, 14).fill;
      clearOp(() => rounded(bx + 16, by + 14, 78, 24, 7).fill);
    }
    // Trajectory vector & ball
    line(430, 356, 548, 456, 12);
    line(548, 456, 484, 526, 10);
    disc(484, 526, 32).fill;
    // Winged Vaus paddle
    rounded(362, 292, 300, 46, 23).fill;
    clearOp(() => rounded(432, 306, 160, 18, 9).fill);
  },
  maze() {
    // Outer, mid and inner labyrinth rings with openings
    const p = $.NSBezierPath.bezierPath;
    p.moveToPoint(P(276, 340)); p.lineToPoint(P(276, 276)); p.lineToPoint(P(748, 276)); p.lineToPoint(P(748, 748)); p.lineToPoint(P(276, 748)); p.lineToPoint(P(276, 430));
    p.moveToPoint(P(356, 590)); p.lineToPoint(P(356, 356)); p.lineToPoint(P(668, 356)); p.lineToPoint(P(668, 668)); p.lineToPoint(P(356, 668));
    p.moveToPoint(P(436, 436)); p.lineToPoint(P(588, 436)); p.lineToPoint(P(588, 588)); p.lineToPoint(P(436, 588)); p.lineToPoint(P(436, 512));
    stroke(p, 38);
    // Center goal core & breadcrumb dots
    disc(512, 512, 32).fill;
    for (const [dx, dy] of [[276, 386], [316, 630], [396, 512]]) disc(dx, dy, 12).fill;
  },
  frog() {
    // Lilypad base rim
    stroke(disc(512, 456, 218), 18);
    // Frog head & eyes
    $.NSBezierPath.bezierPathWithOvalInRect(R(256, 300, 512, 340)).fill;
    disc(368, 616, 94).fill; disc(656, 616, 94).fill;
    clearOp(() => {
      disc(368, 624, 48).fill; disc(656, 624, 48).fill;
      const m = $.NSBezierPath.bezierPath;
      m.moveToPoint(P(366, 424));
      m.curveToPointControlPoint1ControlPoint2(P(658, 424), P(440, 344), P(584, 344));
      stroke(m, 30);
      disc(476, 492, 12).fill; disc(548, 492, 12).fill;
    });
    disc(368, 624, 22).fill; disc(656, 624, 22).fill;
  },
  tictactoe() {
    for (const v of [432, 592]) {
      rounded(v - 16, 272, 32, 480, 16).fill;
      rounded(272, v - 16, 480, 32, 16).fill;
    }
    for (const gx of [432, 592]) for (const gy of [432, 592]) disc(gx, gy, 24).fill;
    const drawX = (cx, cy, r) => { line(cx - r, cy - r, cx + r, cy + r, 32); line(cx + r, cy - r, cx - r, cy + r, 32); };
    drawX(344, 680, 44);
    drawX(512, 512, 44);
    drawX(680, 344, 44);
    stroke(disc(680, 680, 46), 28);
    stroke(disc(344, 344, 46), 28);
    // Winning strike line
    line(292, 732, 732, 292, 16);
  },
  minesweeper() {
    // Naval mine sphere & 8 stepped horns
    disc(512, 512, 158).fill;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      line(512 + c * 136, 512 + s * 136, 512 + c * 214, 512 + s * 214, 44);
      disc(512 + c * 220, 512 + s * 220, 25).fill;
    }
    clearOp(() => {
      stroke(disc(512, 512, 114), 12);
      disc(512, 512, 52).fill;
      disc(456, 570, 24).fill;
    });
    disc(512, 512, 24).fill;
  },
  connect4() {
    // Rack frame & 3x3 tokens
    stroke(rounded(266, 266, 492, 492, 44), 22);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const cx = 358 + c * 154, cy = 358 + r * 154;
      if (c === r || (r === 0 && c === 2)) {
        disc(cx, cy, 58).fill;
        clearOp(() => stroke(disc(cx, cy, 34), 10));
      } else {
        stroke(disc(cx, cy, 52), 18);
      }
    }
    line(318, 318, 706, 706, 16);
  },
};
function glyphMask(spec) {
  const img = $.NSImage.alloc.initWithSize($.NSMakeSize(S, S));
  img.lockFocus;
  col("#ffffff").setFill; col("#ffffff").setStroke;
  if (spec.custom && CUSTOM[spec.custom]) CUSTOM[spec.custom]();
  else if (spec.text) textMask(spec.text);
  else symbolMask(spec.symbol || "app.dashed");
  img.unlockFocus;
  return img;
}
function badgeMask(symbolName) {
  const img = $.NSImage.alloc.initWithSize($.NSMakeSize(S, S));
  img.lockFocus;
  col("#ffffff").setFill; col("#ffffff").setStroke;
  drawSymbolAt(symbolName, 718, 306, 68, 86);
  img.unlockFocus;
  return img;
}
function tinted(mask, top, bottom) {
  const out = $.NSImage.alloc.initWithSize($.NSMakeSize(S, S));
  out.lockFocus;
  mask.drawInRectFromRectOperationFraction(R(0, 0, S, S), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
  $.NSGraphicsContext.currentContext.compositingOperation = $.NSCompositingOperationSourceIn;
  $.NSGradient.alloc.initWithStartingColorEndingColor(top, bottom).drawInRectAngle(R(0, 0, S, S), -90);
  $.NSGraphicsContext.currentContext.compositingOperation = $.NSCompositingOperationSourceOver;
  out.unlockFocus;
  return out;
}
function render(spec, outPath) {
  const image = $.NSImage.alloc.initWithSize($.NSMakeSize(S, S));
  image.lockFocus;
  const cg = $.NSGraphicsContext.currentContext.CGContext;

  // 1. Outer machined titanium/glass bezel with deep drop shadow (continuous smooth gradient, zero banding)
  const outerBox = R(92, 92, 840, 840), outerPath = squircle(92, 92, 840, 840, 5);
  $.CGContextSaveGState(cg);
  const shadow = $.NSShadow.alloc.init;
  shadow.shadowOffset = $.NSMakeSize(0, -20); shadow.shadowBlurRadius = 40; shadow.shadowColor = col("#000000", 0.58); shadow.set;
  col(spec.dark).setFill; outerPath.fill;
  $.CGContextRestoreGState(cg);

  $.CGContextSaveGState(cg);
  outerPath.addClip;
  $.NSGradient.alloc.initWithStartingColorEndingColor(col("#ffffff", 0.85), col(spec.vivid, 0.35)).drawInRectAngle(outerBox, -90);
  $.NSGradient.alloc.initWithStartingColorEndingColor(col(spec.tint, 0.45), col(spec.dark, 0.95)).drawInRectAngle(outerBox, -65);
  $.CGContextRestoreGState(cg);

  // Recessed dark seam between outer bezel and inner studio canvas
  const seamPath = squircle(100, 100, 824, 824, 5);
  col("#030612", 0.88).setFill; seamPath.fill;

  // 2. Main inner studio tile canvas
  const box = R(106, 106, 812, 812), path = squircle(106, 106, 812, 812, 5);
  $.CGContextSaveGState(cg);
  path.addClip;
  $.NSGradient.alloc.initWithStartingColorEndingColor(col(spec.dark), col(spec.vivid)).drawInRectAngle(box, -55);
  const blob = (x, y, r, hex, a) => $.NSGradient.alloc.initWithStartingColorEndingColor(col(hex, a), col(hex, 0)).drawFromCenterRadiusToCenterRadiusOptions(P(x, y), 0, P(x, y), r, 0);
  blob(780, 220, 560, spec.glow, 0.92);
  blob(230, 810, 520, spec.vivid, 0.40);
  blob(512, 850, 440, spec.tint, 0.20);
  blob(512, 480, 440, spec.dark, 0.72);

  // 3. Precision blueprint sub-grid + major grid with registration crosshairs
  col("#ffffff", 0.036).setStroke;
  for (let i = 1; i < 16; i++) {
    const pos = 106 + i * 812 / 16;
    line(pos, 106, pos, 918, 1.5);
    line(106, pos, 918, pos, 1.5);
  }
  col(spec.tint, 0.085).setStroke;
  for (let i = 1; i < 4; i++) {
    const pos = 106 + i * 812 / 4;
    line(pos, 106, pos, 918, 2.5);
    line(106, pos, 918, pos, 2.5);
  }
  col(spec.tint, 0.28).setStroke;
  for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) {
    const gx = 106 + i * 812 / 4, gy = 106 + j * 812 / 4;
    line(gx - 9, gy, gx + 9, gy, 2.5);
    line(gx, gy - 9, gx, gy + 9, 2.5);
  }

  // 4. Concentric polar telemetry rings & degree ticks
  col(spec.tint, 0.14).setStroke;
  stroke(disc(512, 512, 372), 2.5);
  col("#ffffff", 0.07).setStroke;
  stroke(disc(512, 512, 342), 1.5);
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = deg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const major = deg % 30 === 0;
    const r0 = major ? 344 : 352, r1 = major ? 370 : 364;
    col(major ? spec.tint : "#ffffff", major ? 0.32 : 0.11).setStroke;
    line(512 + c * r0, 512 + s * r0, 512 + c * r1, 512 + s * r1, major ? 3 : 1.5);
  }
  // Glowing telemetry arc accents
  col(spec.glow, 0.55).setStroke;
  for (const [a0, a1] of [[32, 78], [212, 258]]) {
    const arc = $.NSBezierPath.bezierPath;
    arc.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngle(P(512, 512), 372, a0, a1);
    stroke(arc, 5);
  }

  // 5. Corner HUD framing brackets & glowing indicator LEDs
  const corners = [[154, 154, 1, 1], [870, 154, -1, 1], [154, 870, 1, -1], [870, 870, -1, -1]];
  for (const [cx, cy, dx, dy] of corners) {
    col(spec.tint, 0.36).setStroke;
    line(cx, cy, cx + dx * 42, cy, 4);
    line(cx, cy, cx, cy + dy * 42, 4);
    col(spec.glow, 0.82).setFill;
    disc(cx + dx * 16, cy + dy * 16, 5.5).fill;
  }

  // Upper glass canopy sheen across the tile
  $.NSGradient.alloc.initWithStartingColorEndingColor(col("#ffffff", 0.16), col("#ffffff", 0)).drawInRectAngle(R(106, 520, 812, 398), -90);

  // 6. Center elevated frosted-glass medallion / pedestal stage
  const plate = squircle(212, 212, 600, 600, 4.5);
  $.CGContextSaveGState(cg);
  const plateShadow = $.NSShadow.alloc.init;
  plateShadow.shadowOffset = $.NSMakeSize(0, -16); plateShadow.shadowBlurRadius = 32; plateShadow.shadowColor = col("#000000", 0.55); plateShadow.set;
  col(spec.dark, 0.76).setFill; plate.fill;
  $.CGContextRestoreGState(cg);

  $.CGContextSaveGState(cg);
  plate.addClip;
  $.NSGradient.alloc.initWithStartingColorEndingColor(col(spec.dark, 0.84), col(spec.vivid, 0.28)).drawInRectAngle(R(212, 212, 600, 600), -60);
  blob(660, 320, 360, spec.glow, 0.34);
  blob(340, 700, 320, spec.vivid, 0.26);
  col("#ffffff", 0.025).setStroke;
  for (let y = 224; y < 800; y += 14) line(212, y, 812, y, 1);
  $.NSGradient.alloc.initWithStartingColorEndingColor(col("#ffffff", 0.17), col("#ffffff", 0)).drawInRectAngle(R(212, 530, 600, 282), -90);
  $.CGContextRestoreGState(cg);

  // Medallion double-ring border + corner micro-bolts + top telemetry status bar
  col(spec.glow, 0.38).setStroke;
  stroke(plate, 7);
  col(spec.tint, 0.58).setStroke;
  stroke(squircle(218, 218, 588, 588, 4.5), 2.5);
  for (const [bx, by] of [[266, 266], [758, 266], [266, 758], [758, 758]]) {
    col(spec.tint, 0.52).setFill; disc(bx, by, 7.5).fill;
    col(spec.dark, 0.92).setFill; disc(bx, by, 3.5).fill;
  }
  col(spec.glow, 0.85).setFill; rounded(442, 764, 52, 8, 4).fill;
  col(spec.tint, 0.78).setFill; rounded(504, 764, 32, 8, 4).fill;
  col("#ffffff", 0.65).setFill; rounded(546, 764, 18, 8, 4).fill;
  $.CGContextRestoreGState(cg);

  // 7. 3D Sculpted Main Glyph (drop shadow + 3D bottom extrusion bevel + top rim + glowing glass face)
  const mask = glyphMask(spec);
  const shadowLayer = tinted(mask, col("#000000", 0.62), col("#000000", 0.62));
  $.CGContextSaveGState(cg);
  const dropGlow = $.NSShadow.alloc.init;
  dropGlow.shadowOffset = $.NSMakeSize(0, -14); dropGlow.shadowBlurRadius = 24; dropGlow.shadowColor = col("#000000", 0.65); dropGlow.set;
  shadowLayer.drawInRectFromRectOperationFraction(R(0, -14, S, S), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
  $.CGContextRestoreGState(cg);

  const extrudeLayer = tinted(mask, col(spec.vivid, 0.92), col(spec.dark, 0.98));
  for (let dy = -10; dy <= -2; dy += 2) {
    extrudeLayer.drawInRectFromRectOperationFraction(R(0, dy, S, S), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
  }

  const rimLayer = tinted(mask, col("#ffffff", 0.96), col(spec.tint, 0.82));
  rimLayer.drawInRectFromRectOperationFraction(R(0, 3, S, S), $.NSZeroRect, $.NSCompositingOperationSourceOver, 0.9);

  $.CGContextSaveGState(cg);
  const glow = $.NSShadow.alloc.init;
  glow.shadowOffset = $.NSMakeSize(0, 0); glow.shadowBlurRadius = 52; glow.shadowColor = col(spec.glow, 0.95); glow.set;
  tinted(mask, col("#ffffff"), col(spec.tint)).drawInRectFromRectOperationFraction(R(0, 0, S, S), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
  $.CGContextRestoreGState(cg);

  // 8. Secondary Corner Instrument Badge (if spec.badge is defined)
  if (spec.badge) {
    const bcx = 718, bcy = 306, br = 72;
    const bPath = disc(bcx, bcy, br);
    $.CGContextSaveGState(cg);
    const bShadow = $.NSShadow.alloc.init;
    bShadow.shadowOffset = $.NSMakeSize(0, -8); bShadow.shadowBlurRadius = 18; bShadow.shadowColor = col("#000000", 0.68); bShadow.set;
    col(spec.dark, 0.95).setFill; bPath.fill;
    $.CGContextRestoreGState(cg);

    $.CGContextSaveGState(cg);
    bPath.addClip;
    $.NSGradient.alloc.initWithStartingColorEndingColor(col(spec.dark, 0.95), col(spec.vivid, 0.62)).drawInRectAngle(R(bcx - br, bcy - br, br * 2, br * 2), -55);
    $.NSGradient.alloc.initWithStartingColorEndingColor(col("#ffffff", 0.22), col("#ffffff", 0)).drawInRectAngle(R(bcx - br, bcy, br * 2, br), -90);
    $.CGContextRestoreGState(cg);

    col(spec.glow, 0.85).setStroke;
    stroke(bPath, 5.5);
    col("#ffffff", 0.55).setStroke;
    stroke(disc(bcx, bcy, br - 6), 2);

    const bMask = badgeMask(spec.badge);
    const bExtrude = tinted(bMask, col(spec.vivid, 0.9), col(spec.dark, 0.95));
    bExtrude.drawInRectFromRectOperationFraction(R(0, -3, S, S), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
    $.CGContextSaveGState(cg);
    const bGlow = $.NSShadow.alloc.init;
    bGlow.shadowOffset = $.NSMakeSize(0, 0); bGlow.shadowBlurRadius = 18; bGlow.shadowColor = col(spec.glow, 0.95); bGlow.set;
    tinted(bMask, col("#ffffff"), col(spec.tint)).drawInRectFromRectOperationFraction(R(0, 0, S, S), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
    $.CGContextRestoreGState(cg);
  }

  image.unlockFocus;
  const rep = $.NSBitmapImageRep.alloc.initWithData(image.TIFFRepresentation);
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({})).writeToFileAtomically(outPath, true);
}
function run(argv) {
  const raw = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null);
  const specs = JSON.parse(ObjC.unwrap(raw));
  for (const spec of specs) render(spec, argv[1] + "/" + spec.name + ".png");
}
`;
