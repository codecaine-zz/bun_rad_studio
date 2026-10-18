// The Image Studio: open a picture, drag sliders and see the change straight away, then "Save a copy". The preview is
// drawn by the browser (CSS filters, so it is instant); the saved picture is made by ImageMagick with the same
// settings, through one conversion job (studio-image), so the original is never changed.
import { rawUrl } from "./api.js";
import { h } from "./dom.js";
import { registerPowerTab } from "./power.js";
import { baseName, bulkCard, extOf, fileRow, group, presetCard, saveCopy, select, slider, toggle } from "./studioCommon.js";

const PICTURE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "avif", "ico", "svg"]);
/** Pictures the browser itself can show for the live preview (others still save fine). */
const PREVIEWABLE = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "ico", "svg"]);
export const isStudioPicture = (name) => PICTURE_EXTS.has(extOf(name));

const signed = (v) => (v > 0 ? `+${v}` : String(v));
const SHAPES = [["keep", "Keep the shape"], ["1:1", "Square (1:1)"], ["4:5", "Portrait post (4:5)"], ["9:16", "Tall: stories (9:16)"], ["16:9", "Wide: YouTube (16:9)"], ["4:3", "Classic photo (4:3)"], ["3:2", "Camera photo (3:2)"], ["circle", "Circle"]];

/** One-click looks: each sets a few sliders (everything else goes back to normal first). */
const PRESETS = [
  ["Auto-enhance", { enhance: true, contrast: 8, saturation: 112, sharpen: 1 }],
  ["Black and white", { gray: true, contrast: 10 }],
  ["Document scan", { gray: true, contrast: 65, brightness: 15, sharpen: 2 }],
  ["High contrast", { contrast: 45, saturation: 115, sharpen: 1 }],
  ["Vintage", { sepia: 60, contrast: -10, vignette: true, saturation: 80 }],
  ["Vivid", { saturation: 160, contrast: 15, enhance: true }],
  ["Warm", { warmth: 45, saturation: 110 }],
  ["Golden hour", { warmth: 65, brightness: 8, saturation: 125, vignette: true }],
  ["Cool", { warmth: -45 }],
  ["Dreamy", { blur: 1.5, brightness: 10, saturation: 120, vignette: true }],
  ["Polaroid frame", { warmth: 20, contrast: 10, border: 28, borderColour: "white", vignette: true }],
  ["Profile picture", { crop: "circle", width: 512, format: "png" }],
  ["Square post", { crop: "1:1", width: 1080 }],
  ["Story (9:16)", { crop: "9:16", width: 1080 }],
  ["YouTube (16:9)", { crop: "16:9", width: 1280, contrast: 10, saturation: 115 }],
  ["Transparent logo", { transparent: true, format: "png" }],
  ["Small WebP", { width: 1600, format: "webp", quality: 80, strip: true }],
];

function mount(root) {
  let path = null;
  const status = h("p", { class: "pw-status", role: "status", "aria-live": "polite" });
  const img = h("img", { class: "ist-img", alt: "", draggable: "false" });
  const frame = h("div", { class: "ist-frame" }, img);
  const vignette = h("div", { class: "ist-vignette", hidden: true });
  frame.append(vignette);
  const empty = h("p", { class: "pw-hint ist-empty" }, "Select a picture in the file list and press “Use the selected picture”, or right-click a picture and choose “Edit in Image Studio”.");
  const stage = h("div", { class: "ist-stage" }, empty, frame);
  const noPreview = h("p", { class: "pw-hint", hidden: true }, "This kind of picture can't be previewed here, but saving works as usual.");

  const c = {};
  const add = (ctl) => (c[ctl.input.dataset.opt] = ctl);
  const on = () => draw();
  add(slider({ id: "brightness", label: "Brightness", min: -100, max: 100, value: 0, format: signed, onInput: on }));
  add(slider({ id: "contrast", label: "Contrast", min: -100, max: 100, value: 0, format: signed, onInput: on }));
  add(slider({ id: "saturation", label: "Color", min: 0, max: 300, value: 100, format: (v) => `${v}%`, tip: "0% is black and white, 100% is normal, more is more colorful.", onInput: on }));
  add(slider({ id: "warmth", label: "Warmth", min: -100, max: 100, value: 0, format: signed, tip: "Warmer (more orange) or cooler (more blue).", onInput: on }));
  add(slider({ id: "hue", label: "Hue", min: -180, max: 180, value: 0, format: (v) => `${v}°`, tip: "Shifts every color around the color wheel.", onInput: on }));
  add(slider({ id: "sepia", label: "Sepia", min: 0, max: 100, value: 0, format: (v) => `${v}%`, tip: "An old brown photo look.", onInput: on }));
  add(slider({ id: "blur", label: "Blur", min: 0, max: 40, step: 0.5, value: 0, onInput: on }));
  add(slider({ id: "sharpen", label: "Sharpen", min: 0, max: 5, step: 0.5, value: 0, onInput: on }));
  add(toggle({ id: "gray", label: "Black and white", onInput: on }));
  add(toggle({ id: "invert", label: "Negative", onInput: on }));
  add(toggle({ id: "enhance", label: "Auto-enhance", tip: "Fixes dull, flat colors and contrast automatically.", onInput: on }));
  add(toggle({ id: "vignette", label: "Vignette", tip: "Darkens the edges to draw the eye to the middle.", onInput: on }));
  add(toggle({ id: "transparent", label: "White to see-through", tip: "Makes a white background see-through (saves as PNG).", onInput: on }));
  add(select({ id: "rotate", label: "Rotate", choices: [["0", "None"], ["90", "Right"], ["180", "Upside down"], ["270", "Left"]], value: "0", onInput: on }));
  add(toggle({ id: "flipH", label: "Mirror", tip: "Left becomes right.", onInput: on }));
  add(toggle({ id: "flipV", label: "Flip", tip: "Top becomes bottom.", onInput: on }));
  add(select({ id: "crop", label: "Shape", choices: SHAPES, value: "keep", tip: "Cuts the middle of the picture to this shape.", onInput: on }));
  add(slider({ id: "corners", label: "Round corners", min: 0, max: 400, value: 0, format: (v) => `${v} px`, onInput: on }));
  add(slider({ id: "border", label: "Border", min: 0, max: 300, value: 0, format: (v) => `${v} px`, onInput: on }));
  add(select({ id: "borderColour", label: "Border color", choices: [["white", "White"], ["black", "Black"], ["#808080", "Gray"]], value: "white", onInput: on }));
  add(slider({ id: "width", label: "Width", min: 0, max: 4000, step: 10, value: 0, format: (v) => (v ? `${v} px` : "Same size"), tip: "Shrinks the saved picture to this width. Same size keeps it as it is.", onInput: on }));
  add(select({ id: "format", label: "Save as", choices: [["keep", "Same as the original"], ["jpg", "JPG"], ["png", "PNG"], ["webp", "WebP"], ["avif", "AVIF"]], value: "keep", onInput: on }));
  add(slider({ id: "quality", label: "Quality", min: 30, max: 100, value: 88, format: (v) => `${v}%`, tip: "Lower makes a smaller file (JPG, WebP and AVIF).", onInput: on }));
  add(toggle({ id: "strip", label: "Remove location and camera info", value: true, tip: "Leaves out GPS location, camera details and other hidden information.", onInput: on }));

  const values = () => Object.fromEntries(Object.entries(c).map(([id, ctl]) => [id, ctl.get()]));
  const resetAll = () => { for (const ctl of Object.values(c)) ctl.reset(); draw(); };

  function draw() {
    const v = values();
    const warm = v.warmth;
    const f = [
      `brightness(${1 + v.brightness / 100})`,
      `contrast(${1 + v.contrast / 100 + (v.enhance ? 0.12 : 0) + v.sharpen * 0.03})`,
      `saturate(${v.saturation / 100 + (v.enhance ? 0.15 : 0)})`,
      warm > 0 ? `sepia(${warm * 0.35}%)` : "",
      `hue-rotate(${v.hue + (warm < 0 ? warm * 0.25 : 0)}deg)`,
      v.sepia ? `sepia(${v.sepia}%)` : "",
      v.gray ? "grayscale(1)" : "",
      v.invert ? "invert(1)" : "",
    ];
    const scale = img.naturalWidth ? img.clientWidth / img.naturalWidth || 1 : 1;
    if (v.blur) f.push(`blur(${Math.max(0.3, v.blur * scale)}px)`);
    img.style.filter = f.filter(Boolean).join(" ");
    img.style.transform = `rotate(${v.rotate}deg) scale(${v.flipH ? -1 : 1}, ${v.flipV ? -1 : 1})`;
    const shape = v.crop === "circle" ? "1 / 1" : v.crop === "keep" ? "" : v.crop.replace(":", " / ");
    frame.style.aspectRatio = shape;
    frame.classList.toggle("ist-shaped", !!shape);
    frame.style.borderRadius = v.crop === "circle" ? "50%" : `${v.corners * scale}px`;
    frame.style.outline = v.border ? `${Math.max(1, v.border * scale)}px solid ${v.borderColour}` : "";
    frame.style.outlineOffset = v.border ? `${-Math.max(1, v.border * scale)}px` : "";
    frame.classList.toggle("ist-checker", v.transparent || v.crop === "circle" || v.corners > 0);
    vignette.hidden = !v.vignette;
    // JPG can't keep see-through parts; say so before the person presses Save.
    const needsAlpha = v.transparent || v.crop === "circle" || v.corners > 0;
    const fmt = v.format === "keep" ? extOf(path ?? "") : v.format;
    warn.hidden = !(needsAlpha && ["jpg", "jpeg"].includes(fmt) && v.format !== "keep");
    c.quality.el.hidden = !["jpg", "jpeg", "webp", "avif"].includes(fmt);
  }
  const warn = h("p", { class: "pw-status pw-bad", hidden: true }, "A circle, round corners or a see-through background need PNG, WebP or AVIF: JPG can't keep see-through parts.");

  // "Hold to compare": while pressed, the preview shows the original.
  const compare = h("button", { type: "button", class: "pw-btn", id: "ist-compare", title: "Hold down to see the original picture" }, "Hold to compare");
  const showOriginal = (on) => frame.classList.toggle("ist-original", on);
  compare.addEventListener("pointerdown", () => showOriginal(true));
  for (const ev of ["pointerup", "pointerleave", "blur"]) compare.addEventListener(ev, () => showOriginal(false));
  compare.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") showOriginal(true); });
  compare.addEventListener("keyup", () => showOriginal(false));

  const saveBtn = h("button", { type: "button", class: "pw-btn primary", id: "ist-save", disabled: true, title: "Save the edited picture as a new file next to the original" }, "Save a copy");
  saveBtn.addEventListener("click", async () => {
    if (!path) return;
    const out = await saveCopy({ action: "studio-image", path, options: values(), status, button: saveBtn });
    if (out) savedAs.textContent = baseName(out);
  });
  const savedAs = h("span", { class: "pw-mono" });

  function load(p) {
    path = p;
    files.setName(p);
    const can = isStudioPicture(p);
    noPreview.hidden = can;
    empty.hidden = true;
    frame.hidden = !can;
    delete img.dataset.retried;
    if (can) img.src = rawUrl(p);
    saveBtn.disabled = false;
    status.textContent = "";
    draw();
  }
  img.addEventListener("load", draw);
  img.addEventListener("error", () => {
    if (path && !img.dataset.retried) {
      img.dataset.retried = "1";
      img.src = `${rawUrl(path)}&convert=1`;
      return;
    }
    frame.hidden = true;
    noPreview.hidden = false;
  });
  const files = fileRow({ what: "picture", accepts: isStudioPicture, onPick: load, idPrefix: "ist" });
  frame.hidden = true;

  const applyValues = (o) => { for (const ctl of Object.values(c)) ctl.reset(); for (const [k, val] of Object.entries(o)) c[k]?.set(val); draw(); };
  const mine = presetCard({ kind: "image", idPrefix: "ist", getValues: values, applyValues });
  const alphaProblem = () => (warn.hidden ? null : warn.textContent);
  const bulk = bulkCard({ what: "picture", whatMany: "pictures", accepts: isStudioPicture, action: "studio-image", getValues: values, idPrefix: "ist", check: alphaProblem });
  const presets = h("div", { class: "pw-row st-presets" }, h("span", { class: "st-file-label" }, "Quick looks:"),
    PRESETS.map(([label, set]) => h("button", { type: "button", class: "pw-btn st-preset", onclick: () => applyValues(set) }, label)),
    h("button", { type: "button", class: "pw-btn", id: "ist-reset", title: "Put every slider back to normal", onclick: resetAll }, "Reset all"));

  root.append(h("div", { class: "st-wrap" },
    h("div", { class: "st-head" }, h("h2", { class: "st-title" }, "🎨 Image Studio"), h("p", { class: "pw-hint" }, "Change a picture with sliders and see it straight away. Saving makes a new file — the original is never changed. Double-click a slider to reset it.")),
    files.el,
    presets,
    mine.el,
    h("div", { class: "st-body" },
      h("div", { class: "st-preview" }, stage, noPreview, h("div", { class: "pw-row" }, compare, saveBtn, savedAs), warn, status, bulk.el),
      h("div", { class: "st-panels" },
        group("Light and color", c.brightness.el, c.contrast.el, c.saturation.el, c.warmth.el, c.hue.el, c.enhance.el),
        group("Effects", c.gray.el, c.sepia.el, c.invert.el, c.vignette.el, c.blur.el, c.sharpen.el, c.transparent.el),
        group("Turn and shape", c.rotate.el, c.flipH.el, c.flipV.el, c.crop.el, c.corners.el, c.border.el, c.borderColour.el),
        group("Saving", c.width.el, c.format.el, c.quality.el, c.strip.el)))));
  draw();

  return {
    show(opts) {
      const first = opts?.path ?? opts?.paths?.[0];
      if (first) load(first);
      bulk.update();
    },
  };
}

registerPowerTab({ id: "imagestudio", label: "Image Studio", icon: "🎨", tip: "Edit a picture with sliders: light, color, effects, crop to a shape, circle, borders, size and format", group: "media", mount });
