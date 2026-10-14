// The drawing program for the Mac icons, written in JavaScript for Automation (run with `osascript -l JavaScript`).
// Each icon is a deep, glowing "liquid glass" tile: a dark-to-vivid gradient with aurora light, a faint technical grid,
// light falling from above, a bright rim along the top edge and, in the middle, a glowing glass glyph. Glyphs are Apple's
// SF Symbols (clean, professionally drawn vector art) or, for the games that have no symbol, shapes drawn here.
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

// ---- glyph masks: white shapes on transparent, 1024 square ----
function symbolMask(name) {
  const sym = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription(name, $());
  const cfg = $.NSImageSymbolConfiguration.configurationWithPointSizeWeight(400, $.NSFontWeightBold).configurationByApplyingConfiguration($.NSImageSymbolConfiguration.configurationPreferringMonochrome);
  const g = sym.imageWithSymbolConfiguration(cfg);
  const sz = g.size, k = Math.min(540 / sz.width, 540 / sz.height, 2.4), w = sz.width * k, h = sz.height * k;
  g.drawInRectFromRectOperationFraction(R(512 - w / 2, 512 - h / 2, w, h), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
}
function textMask(text) {
  const font = $.NSFont.fontWithNameSize("Menlo-Bold", 360) || $.NSFont.boldSystemFontOfSize(360);
  const attrs = $.NSMutableDictionary.alloc.init;
  attrs.setObjectForKey(font, "NSFont");
  attrs.setObjectForKey(col("#ffffff"), "NSColor");
  const t = $(text), box = t.sizeWithAttributes(attrs);
  t.drawAtPointWithAttributes(P(512 - box.width / 2, 512 - box.height / 2), attrs);
}
function clearOp(fn) {
  $.NSGraphicsContext.currentContext.compositingOperation = $.NSCompositingOperationClear;
  fn();
  $.NSGraphicsContext.currentContext.compositingOperation = $.NSCompositingOperationSourceOver;
}
const CUSTOM = {
  pacman() {
    const p = $.NSBezierPath.bezierPath;
    p.moveToPoint(P(440, 520));
    p.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngle(P(440, 520), 270, 38, 322);
    p.closePath; p.fill;
    disc(760, 520, 38).fill; disc(880, 520, 26).fill;
    clearOp(() => disc(520, 690, 40).fill);
  },
  tetris() {
    const s = 168, g = 16, x0 = 512 - (3 * s + 2 * g) / 2, y0 = 512 - (2 * s + g) / 2;
    for (let i = 0; i < 3; i++) rounded(x0 + i * (s + g), y0 + s + g, s, s, 38).fill;
    rounded(x0 + (s + g), y0, s, s, 38).fill;
  },
  snake() {
    const p = $.NSBezierPath.bezierPath;
    p.moveToPoint(P(642, 739));
    p.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise(P(512, 664), 150, 30, 270, false);
    p.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise(P(512, 364), 150, 90, 205, true);
    stroke(p, 104);
    disc(652, 745, 74).fill;
    clearOp(() => disc(670, 770, 20).fill);
  },
  pong() {
    rounded(220, 340, 70, 344, 30).fill;
    rounded(734, 420, 70, 344, 30).fill;
    disc(512, 520, 46).fill;
    for (let i = 0; i < 6; i++) rounded(500, 250 + i * 110, 24, 60, 12).fill;
  },
  breakout() {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) rounded(214 + c * 124, 690 - r * 84, 112, 68, 20).fill;
    disc(512, 400, 38).fill;
    rounded(392, 270, 240, 46, 22).fill;
  },
  maze() {
    const p = $.NSBezierPath.bezierPath;
    p.moveToPoint(P(240, 240)); p.lineToPoint(P(784, 240)); p.lineToPoint(P(784, 784)); p.lineToPoint(P(240, 784));
    p.lineToPoint(P(240, 380)); p.lineToPoint(P(644, 380)); p.lineToPoint(P(644, 644)); p.lineToPoint(P(380, 644)); p.lineToPoint(P(380, 520)); p.lineToPoint(P(520, 520));
    stroke(p, 64);
  },
  frog() {
    $.NSBezierPath.bezierPathWithOvalInRect(R(190, 250, 644, 430)).fill;
    disc(340, 640, 112).fill; disc(684, 640, 112).fill;
    clearOp(() => { disc(340, 650, 46).fill; disc(684, 650, 46).fill; const m = $.NSBezierPath.bezierPath; m.moveToPoint(P(350, 400)); m.curveToPointControlPoint1ControlPoint2(P(674, 400), P(430, 320), P(594, 320)); stroke(m, 34); });
  },
  tictactoe() {
    for (const v of [419, 605]) { rounded(v - 20, 222, 40, 580, 20).fill; rounded(222, v - 20, 580, 40, 20).fill; }
    const x = $.NSBezierPath.bezierPath;
    x.moveToPoint(P(262, 634)); x.lineToPoint(P(380, 752)); x.moveToPoint(P(380, 634)); x.lineToPoint(P(262, 752));
    stroke(x, 44);
    stroke(disc(698, 326, 62), 40);
  },
  minesweeper() {
    disc(512, 512, 200).fill;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const p = $.NSBezierPath.bezierPath; p.moveToPoint(P(512 + Math.cos(a) * 180, 512 + Math.sin(a) * 180)); p.lineToPoint(P(512 + Math.cos(a) * 290, 512 + Math.sin(a) * 290)); stroke(p, 60); }
    clearOp(() => disc(450, 574, 44).fill);
  },
  connect4() {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const cx = 290 + c * 222, cy = 290 + r * 222, d = disc(cx, cy, 82);
      if ((c === r) ) d.fill; else stroke(disc(cx, cy, 70), 26);
    }
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
  const box = R(100, 100, 824, 824), path = squircle(100, 100, 824, 824, 5);
  $.CGContextSaveGState(cg);
  const shadow = $.NSShadow.alloc.init;
  shadow.shadowOffset = $.NSMakeSize(0, -18); shadow.shadowBlurRadius = 36; shadow.shadowColor = col("#000000", 0.5); shadow.set;
  col(spec.dark).setFill; path.fill;
  $.CGContextRestoreGState(cg);
  $.CGContextSaveGState(cg);
  path.addClip;
  $.NSGradient.alloc.initWithStartingColorEndingColor(col(spec.dark), col(spec.vivid)).drawInRectAngle(box, -55);
  const blob = (x, y, r, hex, a) => $.NSGradient.alloc.initWithStartingColorEndingColor(col(hex, a), col(hex, 0)).drawFromCenterRadiusToCenterRadiusOptions(P(x, y), 0, P(x, y), r, 0);
  blob(780, 230, 560, spec.glow, 0.9);
  blob(250, 800, 520, spec.vivid, 0.32);
  blob(520, 470, 430, spec.dark, 0.7);
  col("#ffffff", 0.045).setStroke;
  for (let i = 1; i < 12; i++) {
    const a = $.NSBezierPath.bezierPath; a.lineWidth = 2; a.moveToPoint(P(100 + i * 824 / 12, 100)); a.lineToPoint(P(100 + i * 824 / 12, 924)); a.stroke;
    const b = $.NSBezierPath.bezierPath; b.lineWidth = 2; b.moveToPoint(P(100, 100 + i * 824 / 12)); b.lineToPoint(P(924, 100 + i * 824 / 12)); b.stroke;
  }
  $.NSGradient.alloc.initWithStartingColorEndingColor(col("#ffffff", 0.13), col("#ffffff", 0)).drawInRectAngle(R(100, 520, 824, 404), -90);
  $.CGContextRestoreGState(cg);
  const mask = glyphMask(spec);
  $.CGContextSaveGState(cg);
  const glow = $.NSShadow.alloc.init;
  glow.shadowOffset = $.NSMakeSize(0, 0); glow.shadowBlurRadius = 60; glow.shadowColor = col(spec.glow, 1); glow.set;
  tinted(mask, col("#ffffff"), col(spec.tint)).drawInRectFromRectOperationFraction(R(0, 0, S, S), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
  $.CGContextRestoreGState(cg);
  // rim light: bright along the top edge, fading smoothly to faint along the bottom
  $.CGContextSaveGState(cg);
  path.addClip;
  const ring = squircle(104, 104, 816, 816, 5);
  const bands = 16;
  for (let i = 0; i < bands; i++) {
    const y0 = 1024 - (i + 1) * (1024 / bands);
    $.CGContextSaveGState(cg);
    $.NSBezierPath.clipRect(R(0, y0, S, 1024 / bands + 1));
    col("#ffffff", 0.8 * Math.pow(1 - i / bands, 2) + 0.1).setStroke;
    ring.lineWidth = 6; ring.stroke;
    $.CGContextRestoreGState(cg);
  }
  $.CGContextRestoreGState(cg);
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
