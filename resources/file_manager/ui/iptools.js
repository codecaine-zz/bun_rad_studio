// The IP info tool's "Productivity toolkit": bulk lookup, copy and save, the pages on the internet, and the
// offline calculators (is it in a block, split a block, notations, mask converter). All work happens on the server.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { openDialog, promptBox } from "./dialogs.js";
import { toast } from "./menus.js";
import { currentPath, state } from "./state.js";
import { copyText, tableToTsv } from "./ipview.js";

const field = (label, control) => h("label", { class: "field" }, h("span", { class: "field-label" }, label), control);

/**
 * @param {{ view: any, getTarget: () => string, getToken: () => string, openLink: (link: any) => Promise<void> }} deps
 * @returns {HTMLElement}
 */
export function buildToolkit({ view, getTarget, getToken, openLink }) {
  const bulk = h("textarea", {
    class: "ip-bulk", rows: "5", spellcheck: "false", "aria-label": "Addresses for the bulk lookup, one per line", placeholder: "8.8.8.8\n1.1.1.1\ngithub.com",
    title: "Paste or type one IP address or domain name per line. You can look up to 100 at once. A line starting with # is ignored.",
  });
  const testIp = h("input", { type: "text", spellcheck: "false", autocomplete: "off", placeholder: "192.168.1.77", "aria-label": "Test IP address", title: "An address to test against the block typed in the box at the top, like 192.168.1.77" });
  const prefix = h("input", { type: "number", min: "0", max: "128", value: "26", class: "ip-prefix", "aria-label": "Size of the smaller blocks (prefix length)", title: "The size of the smaller blocks: a bigger number means smaller blocks. For example /26 cuts a /24 into four." });

  /** Runs one server operation and shows its answer; problems go to the status line and a message, never a crash. */
  const toolBtn = (label, title, op, makeBody) => {
    const button = h("button", { type: "button", class: "pw-btn", title }, label);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        view.show(await call(op, makeBody()));
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "That didn't work. Check what you typed and try again.";
        view.setStatus(message, "error");
        toast(message, { kind: "error" });
      } finally {
        button.disabled = false;
      }
    });
    return button;
  };
  const btn = (label, title, onclick) => h("button", { type: "button", class: "pw-btn", title, onclick }, label);

  const currentIp = () => {
    const a = view.last();
    return a?.kind === "ip" ? a.ip : a?.kind === "cidr" ? a.subnet.network : "";
  };

  const openPage = (kind) => {
    const ip = currentIp();
    if (!ip) return toast("Look up an IP address first.");
    if (view.last()?.isPrivate) return toast("That is a private address, so it has no page on the internet.");
    return openLink({ kind, target: ip });
  };

  async function loadList() {
    const picked = state.selection.size === 1 ? [...state.selection][0] : "";
    const isFile = picked && state.entries.some((e) => e.path === picked && !e.isDir);
    const folder = currentPath();
    const start = isFile ? picked : folder ? `${folder}${folder.endsWith(state.sep) ? "" : state.sep}` : "";
    const res = await promptBox({
      title: "Load a list of addresses",
      label: "Where is the text file?",
      value: start,
      confirmLabel: "Load list",
      hint: "Type the location of a plain text file with one IP address or domain name per line. \"~\" means your home folder. The file is only read, never changed.",
      submit: async (text) => {
        const found = await call("typedpath", { text, cwd: folder || state.home });
        if (!found.exists) throw new ApiError("That file doesn't exist.", "NOT_FOUND", 400);
        return await call("ip/loadlist", { path: found.path });
      },
    });
    if (!res || res === true) return;
    bulk.value = res.text;
    const extra = res.truncated ? " (only the start of a big file was read)" : res.skipped ? ` (${res.skipped} over the limit of 100 will be skipped)` : "";
    view.setStatus(`Loaded ${res.name}: ${res.count} address${res.count === 1 ? "" : "es"}${extra}. Press "Look up all".`, "success");
    toast(`Loaded ${res.name}.`, { kind: "success" });
  }

  async function saveResults() {
    const a = view.last();
    if (!a?.json) return toast("There's nothing to save yet. Look something up first.");
    const folder = h("input", { type: "text", class: "text-input", spellcheck: "false", autocomplete: "off", value: currentPath() || state.home, "aria-label": "Folder to save in", title: "The folder where the new file is created. You can type a location like ~/Documents." });
    const name = h("input", { type: "text", class: "text-input", spellcheck: "false", autocomplete: "off", value: "ipinfo_results", "aria-label": "File name", title: "A name for the new file. The extension is added for you." });
    const format = h("select", { class: "select", "aria-label": "File format", title: "JSON keeps every detail. CSV opens in a spreadsheet." },
      h("option", { value: "json" }, "JSON (.json)"), h("option", { value: "csv" }, "CSV (.csv, for spreadsheets)"));
    const dlg = openDialog({
      title: "Save results",
      body: [
        field("Save in this folder", folder), field("File name", name), field("Format", format),
        h("p", { class: "hint" }, "A new file is always made. If the name is taken, a number is added; nothing is ever replaced."),
      ],
      buttons: [{ label: "Cancel", value: null }, { label: "Save", value: "save", primary: true }],
      initialFocus: name,
    });
    const ok = [...dlg.el.querySelectorAll(".btn")].find((b) => b.classList.contains("primary"));
    ok.addEventListener("click", async (e) => {
      e.stopImmediatePropagation();
      ok.disabled = true;
      try {
        const where = await call("typedpath", { text: folder.value, cwd: currentPath() || state.home });
        if (!where.isDir) throw new ApiError(where.exists ? "That isn't a folder." : "That folder doesn't exist.", "BAD_PATH", 400);
        const saved = await call("ip/save", { folder: where.path, name: name.value, format: format.value, text: format.value === "csv" ? a.csv : a.json });
        dlg.close("saved");
        toast(`Saved "${saved.name}" in ${saved.folder}.`, { kind: "success" });
        view.setStatus(`Saved ${saved.path}.`, "success");
      } catch (err) {
        dlg.setError(err instanceof ApiError ? err.message : "That couldn't be saved. Try a different folder or name.");
        ok.disabled = false;
      }
    }, true);
  }

  const bulkButton = toolBtn("⚡ Look up all", "Look up every address in the list above (up to 100). Private addresses are answered on this computer.", "ip/bulk", () => {
    if (!bulk.value.trim()) throw new ApiError("Add at least one IP address or domain name to the list first.", "NO_TARGETS", 0);
    return { text: bulk.value, token: getToken() };
  });
  const inBlock = toolBtn("✔ Is it in this block?", "Checks whether the test address is inside the CIDR block typed in the box at the top.", "ip/incidr", () => ({ cidr: getTarget(), ip: testIp.value }));
  const split = toolBtn("✂ Split block", "Cuts the CIDR block at the top into smaller blocks of the size chosen on the left.", "ip/split", () => ({ cidr: getTarget(), prefix: prefix.value === "" ? null : Number(prefix.value) }));
  testIp.addEventListener("keydown", (e) => e.key === "Enter" && inBlock.click());
  prefix.addEventListener("keydown", (e) => e.key === "Enter" && split.click());

  return h("div", { class: "pw-card ip-toolkit" },
    h("h3", {}, "Toolkit"),
    h("label", { class: "pw-field ip-bulk-field" }, "Bulk lookup: one IP address or domain per line (up to 100, # starts a comment)", bulk),
    h("div", { class: "pw-row" },
      btn("📄 Load list…", "Fill the list above from a text file on this computer.", loadList),
      bulkButton,
      btn("📋 Copy IP", "Copy the IP address of the current result.", () => copyText(currentIp(), "IP address")),
      btn("📋 Copy table", "Copy the details table so you can paste it into a spreadsheet.", () => copyText(view.last() ? tableToTsv(view.last().table) : "", "table")),
      btn("💾 Save results…", "Save the current result to a new file (JSON or CSV).", saveResults),
      btn("🌐 ipinfo.io page", "Open this address's page on ipinfo.io in your web browser.", () => openPage("ipinfo")),
      btn("🛰️ BGP / ASN page", "Open this address's routing page on bgp.he.net in your web browser.", () => openPage("bgp")),
    ),
    h("div", { class: "pw-row" },
      h("label", {}, "Test IP:", testIp),
      inBlock,
      h("label", {}, "Split into /", prefix),
      split,
      toolBtn("🔢 IP formats", "Show the address typed at the top in other ways: number, hexadecimal, binary, IPv6 and more.", "ip/formats", () => ({ ip: getTarget() })),
      toolBtn("🎭 Mask ⇄ prefix", "Turn a prefix like /24 into a mask like 255.255.255.0, or the other way round (type either at the top).", "ip/mask", () => ({ value: getTarget() })),
    ),
    h("p", { class: "pw-hint" }, "The block, address or mask for these tools is the one typed in the box at the top."),
  );
}
