// The "QR" tool of the Power tools panel: make QR codes (text, web addresses, Wi-Fi, contacts, e-mail, SMS, phone, place, event)
// and read them from pictures (a file, a drop, the clipboard). Everything is worked out in this page: what you type and what is
// read is never sent anywhere or saved, except when you choose Save (a PNG, SVG or text file in the folder you are looking at).
import { ApiError, call, rawUrl } from "./api.js";
import { confirmBox } from "./dialogs.js";
import { h } from "./dom.js";
import { toast } from "./menus.js";
import { refresh } from "./nav.js";
import { currentPath } from "./pane.js";
import { registerPowerTab } from "./power.js";
import { selectedEntries } from "./selection.js";
import { state } from "./state.js";
import { QrError, encodeQr, maxCapacity } from "./qrencode.js";
import { decodeMatrix, decodeQrAsync } from "./qrdecode.js";
import { qrToSvg, qrToText } from "./qrrender.js";
import { describePayload, emailPayload, eventPayload, geoPayload, phonePayload, smsPayload, urlPayload, vcardPayload, wifiPayload } from "./qrcontent.js";
import { drawCode, drawPreview, imageDataFromBlob, imageDataFromUrl, pictureScale, pngBase64 } from "./qrimage.js";

const need = (value, message) => {
  if (!String(value ?? "").trim()) throw new Error(message);
  return value;
};

/** The kinds of code that can be made: the fields to fill in and how they become the text inside the code. */
const FORMS = {
  text: { label: "Text", fields: [{ id: "text", label: "Text", kind: "textarea", placeholder: "Anything you like" }], build: (v) => need(v.text, "Type or paste the text to put in the code.") },
  url: { label: "Web address", fields: [{ id: "url", label: "Web address", placeholder: "example.com/page" }], build: (v) => need(urlPayload(v.url), "Type the web address.") },
  wifi: {
    label: "Wi-Fi network",
    fields: [
      { id: "ssid", label: "Network name (SSID)" },
      { id: "password", label: "Password", kind: "password" },
      { id: "security", label: "Security", kind: "select", options: [["WPA", "WPA, WPA2 or WPA3 (most networks)"], ["WEP", "WEP (old)"], ["nopass", "No password"]], def: "WPA" },
      { id: "hidden", label: "The network is hidden", kind: "checkbox" },
    ],
    build: (v) => wifiPayload({ ssid: v.ssid, password: v.password ?? "", security: v.security ?? "WPA", hidden: !!v.hidden }),
    note: "Phones that scan this code join the network. The password is only used to make the code and is never saved by this program.",
  },
  contact: {
    label: "Contact card",
    fields: [{ id: "first", label: "First name" }, { id: "last", label: "Last name" }, { id: "org", label: "Organisation" }, { id: "title", label: "Job title" }, { id: "phone", label: "Mobile phone" }, { id: "workPhone", label: "Work phone" }, { id: "email", label: "E-mail" }, { id: "url", label: "Web site" }, { id: "address", label: "Address" }, { id: "note", label: "Note", kind: "textarea" }],
    build: (v) => vcardPayload(v),
  },
  email: { label: "E-mail", fields: [{ id: "to", label: "To", placeholder: "name@example.com" }, { id: "subject", label: "Subject" }, { id: "body", label: "Message", kind: "textarea" }], build: (v) => emailPayload({ to: v.to, subject: v.subject, body: v.body }) },
  sms: { label: "Text message (SMS)", fields: [{ id: "number", label: "Phone number", placeholder: "+1 555 0100" }, { id: "message", label: "Message", kind: "textarea" }], build: (v) => smsPayload({ number: v.number, message: v.message }) },
  phone: { label: "Phone number", fields: [{ id: "number", label: "Phone number", placeholder: "+1 555 0100" }], build: (v) => phonePayload(v.number) },
  geo: { label: "Place on a map", fields: [{ id: "lat", label: "Latitude", placeholder: "48.8584" }, { id: "lon", label: "Longitude", placeholder: "2.2945" }, { id: "label", label: "Name of the place" }], build: (v) => geoPayload({ lat: v.lat, lon: v.lon, label: v.label }) },
  event: {
    label: "Calendar event",
    fields: [{ id: "title", label: "Title" }, { id: "start", label: "Starts", kind: "datetime-local" }, { id: "end", label: "Ends", kind: "datetime-local" }, { id: "allDay", label: "All day", kind: "checkbox" }, { id: "location", label: "Where" }, { id: "description", label: "Details", kind: "textarea" }],
    build: (v) => eventPayload({ title: v.title, start: v.start, end: v.end || v.start, location: v.location, description: v.description, allDay: !!v.allDay }),
  },
};

const LEVELS = [["L", "Low (7%): the smallest code"], ["M", "Medium (15%): a good choice"], ["Q", "Quartile (25%): for printing"], ["H", "High (30%): survives dirt and a logo"]];
const SIZES = [[4, "Small (4 pixels per square)"], [8, "Medium (8)"], [16, "Large (16)"], [32, "Very large (32)"]];

/** How bright a #rrggbb colour is (0 to 1). */
function luminance(hex) {
  const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

/** WCAG-style contrast of two colours (1 to 21). */
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const folderToSave = () => currentPath() || state.home;

function mount(root) {
  const values = Object.fromEntries(Object.keys(FORMS).map((k) => [k, {}]));
  let type = "text";
  let qr = null;
  let payload = "";
  let readAbort = null;
  const style = { ecc: "M", size: 8, border: 4, fg: "#000000", bg: "#ffffff" };

  // ---------------------------------------------------------------------------------------------------------------
  // Make
  // ---------------------------------------------------------------------------------------------------------------
  const typeSelect = h("select", { class: "select", "aria-label": "What the code holds", onchange: () => { type = typeSelect.value; drawForm(); update(); } },
    ...Object.entries(FORMS).map(([id, f]) => h("option", { value: id }, f.label)));
  const formBox = h("div", { class: "qr-form" });
  const message = h("p", { class: "qr-message", role: "status", "aria-live": "polite" });
  const canvas = h("canvas", { class: "qr-canvas", role: "img", "aria-label": "The QR code" });
  const facts = h("p", { class: "qr-facts" });
  const check = h("p", { class: "qr-check", role: "status" });
  const warn = h("p", { class: "qr-warn", role: "status" });
  const select = (label, options, key, tip, parse = (v) => v) => h("label", { class: "field" }, h("span", { class: "field-label" }, label),
    h("select", { class: "select", title: tip, onchange: (e) => { style[key] = parse(e.target.value); update(); } }, ...options.map(([v, l]) => h("option", { value: String(v), selected: String(style[key]) === String(v) }, l))));
  const colour = (label, key) => h("label", { class: "qr-colour" }, h("span", {}, label), h("input", { type: "color", value: style[key], "aria-label": label, oninput: (e) => { style[key] = e.target.value; update(); } }));

  function field(f) {
    const v = values[type];
    const common = { id: `qr-${type}-${f.id}`, "aria-label": f.label };
    let control;
    if (f.kind === "textarea") control = h("textarea", { ...common, class: "input qr-input", rows: "4", placeholder: f.placeholder ?? "", oninput: (e) => { v[f.id] = e.target.value; update(); } }, v[f.id] ?? "");
    else if (f.kind === "select") control = h("select", { ...common, class: "select", onchange: (e) => { v[f.id] = e.target.value; update(); } }, ...f.options.map(([val, l]) => h("option", { value: val, selected: (v[f.id] ?? f.def) === val }, l)));
    else if (f.kind === "checkbox") {
      control = h("input", { ...common, type: "checkbox", checked: !!v[f.id], onchange: (e) => { v[f.id] = e.target.checked; update(); } });
      return h("label", { class: "qr-check-field" }, control, " ", f.label);
    } else {
      control = h("input", { ...common, class: "input qr-input", type: f.kind ?? "text", value: v[f.id] ?? "", placeholder: f.placeholder ?? "", autocomplete: "off", spellcheck: "false", oninput: (e) => { v[f.id] = e.target.value; update(); } });
      if (f.kind === "password") {
        const show = h("button", { type: "button", class: "btn", "aria-pressed": "false", title: "Show or hide the password", onclick: () => { const on = control.type === "password"; control.type = on ? "text" : "password"; show.setAttribute("aria-pressed", String(on)); show.textContent = on ? "Hide" : "Show"; } }, "Show");
        return h("label", { class: "field" }, h("span", { class: "field-label" }, f.label), h("span", { class: "range-row" }, control, show));
      }
    }
    return h("label", { class: "field" }, h("span", { class: "field-label" }, f.label), control);
  }

  function drawForm() {
    const f = FORMS[type];
    formBox.replaceChildren(...[...f.fields.map(field), f.note ? h("p", { class: "hint" }, f.note) : null].filter(Boolean));
  }

  function update() {
    qr = null;
    payload = "";
    message.textContent = "";
    check.textContent = "";
    warn.textContent = "";
    facts.textContent = "";
    try {
      payload = FORMS[type].build(values[type]);
    } catch (err) {
      message.textContent = err.message;
      return paint();
    }
    try {
      qr = encodeQr(payload, { ecc: style.ecc });
    } catch (err) {
      message.textContent = err instanceof QrError ? err.message : "The code couldn't be made.";
      return paint();
    }
    const mode = qr.mode === "byte" ? "text" : qr.mode === "alnum" ? "capital letters and digits" : "digits";
    facts.textContent = `Version ${qr.version} (${qr.size} × ${qr.size} squares), error correction ${qr.ecc}, stored as ${mode}.  ${new TextEncoder().encode(payload).length} bytes of ${maxCapacity("byte", qr.ecc).toLocaleString()} possible.`;
    // A code that can't be read back by our own reader would be a bug: say so rather than hand out a broken code.
    const back = decodeMatrix(qr.modules, qr.size);
    check.textContent = back && back.text === payload ? "✓ Checked: the code reads back as exactly this." : "⚠ This code didn't read back correctly. Try a different error-correction level.";
    const ratio = contrast(style.fg, style.bg);
    const lighter = luminance(style.fg) > luminance(style.bg);
    if (ratio < 3) warn.textContent = "These colours are too close: many scanners won't read the code. Use dark squares on a light background.";
    else if (lighter && ratio >= 3) warn.textContent = "Light squares on a dark background (an inverted code) can't be read by many scanners.";
    else if (payload.length > 900) warn.textContent = "This is a lot of data, so the code is dense. Print it large, or shorten the text.";
    paint();
  }

  function paint() {
    const buttons = [saveSvg, savePng, copyPic, copyArt, copyText];
    for (const b of buttons) b.disabled = !qr;
    canvas.hidden = !qr;
    if (!qr) return;
    const scale = Math.max(2, Math.min(8, Math.floor(300 / (qr.size + style.border * 2))));
    drawCode(canvas, qr, { scale, border: style.border, fg: style.fg, bg: style.bg });
    canvas.setAttribute("aria-label", `QR code of ${FORMS[type].label.toLowerCase()}, version ${qr.version}`);
  }

  const pictureOptions = () => ({ scale: pictureScale(qr, style.size, style.border), border: style.border, fg: style.fg, bg: style.bg });

  async function save(kind) {
    if (!qr) return;
    try {
      let data;
      if (kind === "png") data = (await pngBase64(qr, pictureOptions())).base64;
      else if (kind === "svg") data = qrToSvg(qr, { border: style.border, fg: style.fg, bg: style.bg });
      else data = qrToText(qr, { border: 2 });
      const r = await call("qr/save", { dir: folderToSave(), name: "qr-code", kind, data });
      toast(`Saved “${r.name}” in the folder you are looking at.`, { kind: "success" });
      if (folderToSave() === currentPath()) refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : err.message || "The QR code couldn't be saved.", { kind: "error" });
    }
  }
  async function copyPicture() {
    if (!qr) return;
    try {
      const { base64, blob } = await pngBase64(qr, pictureOptions());
      try {
        await call("qr/copy-image", { data: base64 });
      } catch (err) {
        if (!(err instanceof ApiError && err.code === "CLIPBOARD_FAILED") || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw err;
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      }
      toast("Copied the QR code to the clipboard as a picture.", { kind: "success" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The QR code couldn't be copied.", { kind: "error" });
    }
  }
  async function copyString(text, what) {
    try {
      const r = await call("copytext", { text });
      toast(r.copied ? `Copied ${what} to the clipboard.` : "The clipboard couldn't be used.", { kind: r.copied ? "success" : "error" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "The clipboard couldn't be used.", { kind: "error" });
    }
  }
  const act = (label, tip, run) => h("button", { type: "button", class: "btn", title: tip, onclick: run }, label);
  const savePng = act("Save PNG", "Save the picture as a PNG file in the folder you are looking at. Nothing is replaced.", () => save("png"));
  const saveSvg = act("Save SVG", "Save a sharp picture that can be printed at any size, in the folder you are looking at.", () => save("svg"));
  const copyPic = act("Copy picture", "Put the QR code on the clipboard as a picture, to paste into a document or chat.", copyPicture);
  const copyArt = act("Copy as text art", "Copy the code drawn with block characters.", () => copyString(qrToText(qr, { border: 2 }), "the text art"));
  const copyText = act("Copy the contents", "Copy what the code says (the text, link or Wi-Fi details).", () => copyString(payload, "the contents"));

  const makePanel = h("div", { class: "qr-grid", role: "tabpanel", "aria-label": "Make a QR code" },
    h("div", { class: "qr-left" },
      h("label", { class: "field" }, h("span", { class: "field-label" }, "What is it?"), typeSelect),
      formBox,
      h("details", { class: "qr-more" }, h("summary", {}, "Size, error correction and colours"),
        select("Error correction", LEVELS, "ecc", "How much damage the code survives. Higher levels make a bigger code."),
        select("Picture size", SIZES, "size", "How many pixels each square gets in a saved PNG.", Number),
        select("White border", [[0, "None"], [2, "Narrow"], [4, "Normal (needed by most scanners)"], [8, "Wide"]], "border", "The empty space around the code.", Number),
        h("div", { class: "qr-colours" }, colour("Squares", "fg"), colour("Background", "bg")))),
    h("div", { class: "qr-right" }, message, canvas, facts, check, warn,
      h("div", { class: "qr-actions" }, savePng, saveSvg, copyPic, copyArt, copyText),
      h("p", { class: "hint" }, "Save puts the file in the folder you are looking at, under a name that is free. Nothing you type here is stored.")));

  // ---------------------------------------------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------------------------------------------
  const status = h("p", { class: "qr-message", role: "status", "aria-live": "polite" }, "Choose a picture, drop one here, or paste one.");
  const preview = h("canvas", { class: "qr-preview", role: "img", "aria-label": "The picture that was searched", hidden: true });
  const result = h("div", { class: "qr-result", "aria-live": "polite" });
  const file = h("input", { type: "file", accept: "image/*", hidden: true, onchange: () => { const f = file.files?.[0]; file.value = ""; if (f) readBlob(f, f.name); } });
  const drop = h("div", { class: "qr-drop", tabindex: "0", role: "button", "aria-label": "Drop a picture here, or press Enter to choose one", onclick: () => file.click(), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } } },
    h("strong", {}, "Drop a picture here"), h("span", {}, "or click to choose one, or paste with Ctrl/⌘+V"));
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const f = [...(e.dataTransfer?.files ?? [])].find((x) => x.type.startsWith("image/"));
    if (f) readBlob(f, f.name);
    else status.textContent = "That isn't a picture. Drop a PNG, JPEG, WebP or GIF.";
  });
  root.addEventListener("paste", (e) => {
    if (readPanel.hidden || (e.target instanceof HTMLInputElement) || (e.target instanceof HTMLTextAreaElement)) return;
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
    if (!f) return;
    e.preventDefault();
    readBlob(f, "the pasted picture");
  });

  async function readFrom(loader, name) {
    readAbort?.abort();
    const ctl = (readAbort = new AbortController());
    result.replaceChildren();
    preview.hidden = true;
    status.textContent = `Looking for a QR code in ${name}…`;
    let image;
    try {
      image = await loader();
    } catch (err) {
      status.textContent = err.message || "The picture couldn't be opened.";
      return;
    }
    if (ctl.signal.aborted) return;
    const found = await decodeQrAsync(image, ctl.signal);
    if (ctl.signal.aborted) return;
    preview.hidden = false;
    drawPreview(preview, image, found?.corners);
    if (!found) {
      status.textContent = `No QR code was found in ${name}. Try a sharper or larger picture, crop it close to the code, and make sure the whole code (with its three big corner squares) is in view.`;
      return;
    }
    status.textContent = `Found a QR code in ${name}.`;
    showResult(found);
  }
  const readBlob = (blob, name) => readFrom(() => imageDataFromBlob(blob), name);
  const readPath = (path, name) => readFrom(() => imageDataFromUrl(rawUrl(path)), name);

  function showResult(found) {
    const info = describePayload(found.text);
    const rows = info.fields.map((f) => {
      const value = h("span", { class: "qr-value" }, f.secret ? "••••••••" : f.value);
      const row = h("div", { class: "qr-field" }, h("span", { class: "qr-field-label" }, f.label), value);
      if (f.secret) {
        const toggle = h("button", { type: "button", class: "btn", "aria-pressed": "false", onclick: () => { const on = toggle.getAttribute("aria-pressed") === "false"; value.textContent = on ? f.value : "••••••••"; toggle.setAttribute("aria-pressed", String(on)); toggle.textContent = on ? "Hide" : "Show"; } }, "Show");
        row.append(toggle);
      }
      return row;
    });
    const raw = h("textarea", { class: "input qr-raw", readonly: true, rows: String(Math.min(10, Math.max(2, found.text.split("\n").length + 1))), "aria-label": "Everything the code says" }, found.binary ? "(This code holds binary data, shown here as best it can be.)\n" + found.text : found.text);
    const actions = [act("Copy the contents", "Copy everything the code says.", () => copyString(found.text, "the contents"))];
    if (info.url) {
      actions.push(act("Open the address…", "Open this web address in your browser, after you check it.", async () => {
        const ok = await confirmBox({ title: "Open this web address?", message: info.url, confirmLabel: "Open it", details: ["Check the address first: a code can lead to any site, including fake ones that look like a real one."] });
        if (!ok) return;
        try {
          await call("qr/open-url", { url: info.url });
        } catch (err) {
          toast(err instanceof ApiError ? err.message : "The address couldn't be opened.", { kind: "error" });
        }
      }));
    }
    actions.push(act("Make a new code from this", "Open the Make page with this text, to change it or save it again.", () => { values.text.text = found.text; type = "text"; typeSelect.value = "text"; showTab("make"); drawForm(); update(); }));
    const technical = `Version ${found.version} (${found.size} × ${found.size}), error correction ${found.ecc}${found.corrected ? `, ${found.corrected} damaged ${found.corrected === 1 ? "byte was" : "bytes were"} repaired` : ""}${found.mirrored ? ", the picture was a mirror image" : ""}${found.eci ? `, text coding ${found.eci}` : ""}.`;
    result.replaceChildren(...[
      h("h3", {}, info.title),
      info.warning ? h("p", { class: "qr-warn", role: "alert" }, info.warning) : null,
      info.fields.length ? h("div", { class: "qr-fields" }, ...rows) : null,
      raw,
      h("div", { class: "qr-actions" }, ...actions),
      h("p", { class: "hint" }, technical),
    ].filter(Boolean));
  }

  const readPanel = h("div", { class: "qr-readgrid", role: "tabpanel", "aria-label": "Read a QR code", hidden: true },
    h("div", { class: "qr-left" },
      drop, file,
      h("div", { class: "qr-actions" },
        act("Choose a picture…", "Pick a picture file from this computer.", () => file.click()),
        act("Read the selected file", "Search the picture you selected in the file list.", () => {
          const pic = selectedEntries().find((e) => !e.isDir && e.kind === "image");
          if (pic) readPath(pic.path, pic.name);
          else status.textContent = "Select a picture in the file list first, then press this button.";
        }),
        act("Paste from the clipboard", "Search a picture you copied.", async () => {
          try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
              const t = item.types.find((x) => x.startsWith("image/"));
              if (t) return void (await readBlob(await item.getType(t), "the clipboard picture"));
            }
            status.textContent = "The clipboard has no picture in it.";
          } catch {
            status.textContent = "This window can't read the clipboard by itself. Click here and press Ctrl/⌘+V to paste the picture.";
          }
        })),
      status, preview),
    h("div", { class: "qr-right" }, result));

  // ---------------------------------------------------------------------------------------------------------------
  // The two pages
  // ---------------------------------------------------------------------------------------------------------------
  const tabs = {};
  function showTab(which) {
    makePanel.hidden = which !== "make";
    readPanel.hidden = which !== "read";
    for (const [id, b] of Object.entries(tabs)) {
      b.setAttribute("aria-selected", String(id === which));
      b.tabIndex = id === which ? 0 : -1;
    }
  }
  const tabBar = h("div", { class: "qr-tabs", role: "tablist", "aria-label": "QR tool" },
    ...[["make", "Make a QR code"], ["read", "Read a QR code"]].map(([id, label]) => (tabs[id] = h("button", { type: "button", role: "tab", class: "qr-tab", "aria-selected": String(id === "make"), onclick: () => showTab(id), onkeydown: (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const next = id === "make" ? "read" : "make"; showTab(next); tabs[next].focus(); } } }, label))));

  root.classList.add("qr-root");
  root.replaceChildren(h("p", { class: "hint" }, "Make a QR code for a link, a Wi-Fi network, a contact and more, or read one from a picture. Everything stays on this computer."), tabBar, makePanel, readPanel);
  drawForm();
  update();

  return {
    async show(opts = {}) {
      if (opts.read) {
        showTab("read");
        await readPath(opts.read, opts.name ?? "this picture");
      } else if (opts.text !== undefined) {
        values.text.text = opts.text;
        type = "text";
        typeSelect.value = "text";
        showTab("make");
        drawForm();
        update();
      } else if (opts.makeFromFile) {
        showTab("make");
        try {
          const { preview: p } = await call("preview", { path: opts.makeFromFile });
          if (p.type !== "text") throw new Error("That isn't a text file.");
          values.text.text = p.text.length > 2000 && p.truncated ? p.text.slice(0, 2000) : p.text;
          type = "text";
          typeSelect.value = "text";
          drawForm();
          update();
          if (p.truncated) message.textContent = `${message.textContent ? `${message.textContent} ` : ""}Only the start of the file was used: a QR code holds a few thousand characters at most.`;
        } catch (err) {
          toast(err instanceof ApiError ? err.message : err.message || "That file couldn't be used.", { kind: "error" });
        }
      }
    },
    hide() {
      readAbort?.abort();
    },
  };
}

registerPowerTab({
  id: "qr", label: "QR", icon: "🔳", tip: "Make QR codes (text, links, Wi-Fi, contacts and more) and read them from pictures",
  mount,
});
