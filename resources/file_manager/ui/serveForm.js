// The "Start a new server" form of the Serve tool. It only draws and reads the fields; serve.js decides what to do.
import { h } from "./dom.js";

const KINDS = [
  ["auto", "Automatic (PHP if the folder has PHP files, otherwise a live server)"],
  ["static", "Live server (web pages and files, with automatic reload)"],
  ["php", "PHP server (PHP's built-in server)"],
];

const LAN_WARNING = "Anyone on the same Wi-Fi or network will be able to open this server and read every file in the folder while it runs. Only use this on a network you trust, such as your home. PHP's built-in server is for development only and is not safe on a network.";

function field(text, control, tip, extraClass = "") {
  control.title = tip;
  return h("label", { class: `pw-field serve-field ${extraClass}`.trim(), title: tip }, text, control);
}

function check(text, tip, checked = false) {
  const input = h("input", { type: "checkbox", title: tip });
  input.checked = checked;
  return { input, el: h("label", { class: "serve-check", title: tip }, input, text) };
}

export function buildServeForm({ onStart, onFolderChange, onUseCurrent }) {
  const folder = h("input", { type: "text", class: "pw-mono", placeholder: "Type or paste a folder, or use the button", spellcheck: "false", autocomplete: "off", "aria-label": "Folder to serve" });
  const useCurrent = h("button", { type: "button", class: "pw-btn", title: "Fill in the folder you are looking at in the file list", onclick: () => onUseCurrent() }, "Use the folder I'm looking at");
  const kind = h("select", { "aria-label": "Kind of server" }, KINDS.map(([value, label]) => h("option", { value }, label)));
  const port = h("input", { type: "text", inputmode: "numeric", placeholder: "Auto", size: "7", "aria-label": "Port number" });
  const detect = h("p", { class: "pw-hint serve-detect", role: "status" });

  const live = check("Reload the page when files change", "Pages you have open in your browser reload by themselves when you save a file. Style changes appear without a reload.", true);
  const open = check("Open my browser when it starts", "Opens the address in your default web browser as soon as the server is ready.", true);
  const hidden = check("Show hidden files (names starting with a dot)", "Files like .env are normally hidden from the server, because they often hold passwords. The .git folder is never shown.");
  const cors = check("Let other websites read these files (CORS)", "Only needed if a page on another address has to load files from this server. Leave it off otherwise.");
  const lan = check("Let other devices on my network see it (LAN)", "Starts the server for your whole network instead of this computer only. Read the warning below first.");
  const lanWarn = h("p", { class: "serve-lan-warning", role: "note", hidden: true }, `Warning: ${LAN_WARNING}`);
  lan.input.addEventListener("change", () => { lanWarn.hidden = !lan.input.checked; });

  const docroot = h("input", { type: "text", class: "pw-mono", placeholder: "Same as the folder", spellcheck: "false", autocomplete: "off", "aria-label": "Document folder inside the project" });
  const router = h("input", { type: "text", class: "pw-mono", placeholder: "None", spellcheck: "false", autocomplete: "off", "aria-label": "PHP router script" });
  const phpPath = h("input", { type: "text", class: "pw-mono", placeholder: "Use the one found on this computer", spellcheck: "false", autocomplete: "off", "aria-label": "Path of the PHP program" });
  const phpInfo = h("p", { class: "pw-hint serve-php-info", role: "note" });
  const phpHints = h("ul", { class: "serve-php-hints", hidden: true });

  const message = h("p", { class: "pw-status serve-message", role: "status" });
  const go = h("button", { type: "button", class: "pw-btn serve-go", title: "Start the server and show it in the list above", onclick: () => onStart() }, "Start server");
  folder.addEventListener("change", () => onFolderChange(folder.value.trim()));
  folder.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onStart(); } });
  port.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); onStart(); } });

  const el = h("section", { class: "pw-card serve-form", "aria-label": "Start a new server" },
    h("h3", {}, "Start a new server"),
    h("div", { class: "pw-row serve-grid" },
      field("Folder", folder, "The folder whose files will be served. Pick a project folder, not your whole home folder.", "serve-grow"),
      useCurrent,
    ),
    detect,
    h("div", { class: "pw-row serve-grid" },
      field("Kind", kind, "Choose Automatic unless you know which one you want.", "serve-grow"),
      field("Port", port, "The number after the colon in the address. Leave it on Auto to use the first free one (5500 and up for the live server, 8000 and up for PHP), or type one from 1024 to 65535."),
    ),
    h("div", { class: "pw-row serve-checks" }, live.el, open.el, hidden.el, cors.el),
    h("div", { class: "serve-lan" }, lan.el, lanWarn),
    h("details", { class: "serve-advanced" },
      h("summary", {}, "PHP options"),
      h("div", { class: "pw-row serve-grid" },
        field("Document folder (inside the project)", docroot, "The folder PHP treats as the top of the website, for example public in a Laravel project. Leave it empty to use the whole folder.", "serve-grow"),
        field("Router script (optional)", router, "A PHP file, inside the project, that gets every request first. Frameworks like Slim use one. Leave it empty if you don't know.", "serve-grow"),
        field("PHP program (optional)", phpPath, "Only if you want a particular PHP, for example /opt/homebrew/bin/php8.3. Leave it empty to use the one found automatically.", "serve-grow"),
      ),
      phpInfo, phpHints,
    ),
    h("div", { class: "pw-row" }, go, message),
  );

  let docrootSuggestion = "";
  return {
    el,
    read: () => ({
      folder: folder.value.trim(), kind: kind.value, port: port.value.trim(), lan: lan.input.checked,
      liveReload: live.input.checked, openBrowser: open.input.checked, dotfiles: hidden.input.checked, cors: cors.input.checked,
      docroot: docroot.value.trim(), router: router.value.trim(), phpPath: phpPath.value.trim(),
    }),
    write(v) {
      if (v.kind) kind.value = v.kind;
      if (typeof v.liveReload === "boolean") live.input.checked = v.liveReload;
      if (typeof v.openBrowser === "boolean") open.input.checked = v.openBrowser;
    },
    setFolder(path) {
      folder.value = path;
    },
    /** The network option never stays ticked: each server that is meant for the network has to be asked for again. */
    resetLan() {
      lan.input.checked = false;
      lanWarn.hidden = true;
    },
    hasFolder: () => !!folder.value.trim(),
    focusFolder: () => folder.focus(),
    /** What the folder looks like (from serve/detect): a sentence, and a suggested document folder when the person hasn't typed one. */
    setDetect(result) {
      detect.textContent = result ? result.hints.join(" ") : "";
      detect.hidden = !detect.textContent;
      const suggestion = result?.suggestedDocroot ?? "";
      if (!docroot.value.trim() || docroot.value === docrootSuggestion) docroot.value = suggestion;
      docrootSuggestion = suggestion;
    },
    setPhp(php) {
      phpInfo.textContent = php.available ? `PHP found: ${php.version} at ${php.path}` : "PHP isn't installed on this computer, so the PHP server can't be used yet. The live server works without it.";
      phpHints.replaceChildren(...php.hints.map((t) => h("li", {}, t)));
      phpHints.hidden = !php.hints.length;
    },
    setMessage(text, bad = false) {
      message.textContent = text;
      message.classList.toggle("pw-bad", bad);
    },
    setBusy(busy) {
      go.disabled = busy;
    },
    setCanStart(ok, why) {
      go.disabled = !ok;
      go.title = ok ? "Start the server and show it in the list above" : why;
    },
  };
}
