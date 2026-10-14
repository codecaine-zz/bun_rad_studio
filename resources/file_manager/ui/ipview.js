// What the IP info tool shows: the "at a glance" strip, the details table, recent lookups, and the raw output with
// deep links. Everything is built with h() (text only); nothing from the internet is ever treated as HTML.
import { call } from "./api.js";
import { clear, h } from "./dom.js";
import { toast } from "./menus.js";

export const MAX_HISTORY = 20;
const MAX_COPY = 100_000;

const grouped = (digits) => (/^\d+$/.test(String(digits)) ? BigInt(digits).toLocaleString("en-US") : String(digits));

/** Copies text with the File Manager's own clipboard operation, and says what happened. */
export async function copyText(text, what) {
  if (!text) return toast(`There is no ${what} to copy yet. Look something up first.`);
  if (text.length > MAX_COPY) return toast(`The ${what} is too long to copy. Use "Save results" instead.`, { kind: "error" });
  try {
    const r = await call("copytext", { text });
    toast(r.copied === false ? "The clipboard isn't available on this computer." : `${what[0].toUpperCase()}${what.slice(1)} copied.`, { kind: r.copied === false ? "error" : "success" });
  } catch (err) {
    toast(err.message, { kind: "error" });
  }
}

/** Tab-separated text of a table, for pasting into a spreadsheet. */
export const tableToTsv = (table) => [table.headers, ...table.rows].map((r) => r.map((c) => String(c).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");

/** Up to five labelled facts for the strip under the search box. */
export function glance(a) {
  const d = a.data ?? {};
  switch (a.kind) {
    case "ip":
      return [
        ["IP address", a.ip],
        ["Where", a.isPrivate ? "Private network (no public location)" : [d.city, d.region, d.country].filter(Boolean).join(", ") || "-"],
        ["Owner / ASN", d.org || "-"],
        ["Time zone", d.timezone || "-"],
        ["Status", a.isPrivate ? "Private address" : `Found via ${a.source}`],
      ];
    case "cidr": {
      const s = a.subnet;
      return [["Network", s.network], ["Netmask", s.netmask], [s.family === "v4" ? "Usable hosts" : "Addresses", grouped(s.usableHosts)], [s.family === "v4" ? "Broadcast" : "Last address", s.broadcast ?? s.lastAddress], ["Mode", "CIDR block"]];
    }
    case "interfaces": return [["Showing", "Network adapters"], ["Found", String(a.count)], ["Where", "This computer"]];
    case "bulk": return [["Looked up", String(a.rows.length)], ["Found", String(a.ok)], ["Failed", String(a.failed)], ["Time", `${a.secs}s`], ["Mode", "Bulk lookup"]];
    case "incidr": return [["Block", a.cidr], ["Tested", a.ip], ["Result", a.inside ? "Inside" : "Outside"]];
    case "split": return [["Block", a.cidr], ["New size", `/${a.prefix}`], ["Blocks", grouped(a.total)]];
    default: return [["Result", a.label ?? "-"]];
  }
}

/**
 * Builds the result areas. `actions.lookup(target)` repeats a lookup; `actions.open(link)` opens a web page
 * ({ kind, target, provider }); the server builds the actual address.
 */
export function createView(actions) {
  let last = null;
  let history = [];

  const metrics = h("div", { class: "ip-metrics", role: "group", "aria-label": "The result at a glance" });
  const note = h("p", { class: "ip-note", role: "status", hidden: true });
  const tableHost = h("div", { class: "pw-table-wrap ip-table-wrap", tabindex: "0", role: "region", "aria-label": "Details of the last result" });
  const historyHost = h("div", { class: "pw-table-wrap ip-history-wrap", tabindex: "0", role: "region", "aria-label": "Recent lookups" });
  const clearHistory = h("button", { type: "button", class: "pw-btn", title: "Forget the recent lookups listed above. This only affects this window.", onclick: () => { history = []; renderHistory(); toast("History cleared."); } }, "Clear history");
  const linksHost = h("ul", { class: "ip-links", "aria-label": "Deep links" });
  const raw = h("pre", { class: "pw-out ip-raw", tabindex: "0", "aria-label": "Raw output of the last result" });
  const status = h("p", { class: "pw-status ip-status", role: "status", "aria-live": "polite" }, "Ready. Type an address above and press Look up.");

  const actButton = (text, act) =>
    h("button", {
      type: "button", class: "ip-link",
      title: act.kind === "map" ? "Open this place on a map in your web browser" : `Look up ${act.target}`,
      onclick: () => (act.kind === "map" ? actions.open({ kind: "map", target: act.target, provider: "google" }) : actions.lookup(act.target)),
    }, text);

  function renderTable(table) {
    clear(tableHost);
    if (!table || !table.rows.length) {
      tableHost.append(h("p", { class: "pw-hint ip-empty" }, "Nothing to show yet. Look up an address to see its details here."));
      return;
    }
    tableHost.append(h("table", { class: "pw-table ip-table" },
      h("thead", {}, h("tr", {}, table.headers.map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, table.rows.map((row, r) => h("tr", {}, row.map((cell, c) => h("td", { class: c === 0 ? "ip-prop" : null }, c === 1 && table.acts?.[r] ? actButton(cell, table.acts[r]) : cell))))),
    ));
  }

  function renderLinks(links) {
    clear(linksHost);
    if (!links.length) {
      linksHost.append(h("li", { class: "pw-hint" }, "Deep links appear here after you look up a public address."));
      return;
    }
    for (const link of links) {
      linksHost.append(h("li", { class: "ip-link-row" },
        h("span", { class: "ip-link-label" }, link.label),
        h("code", { class: "ip-link-url pw-mono" }, link.url),
        h("button", { type: "button", class: "pw-btn", title: `Open "${link.label}" in your web browser`, "aria-label": `Open ${link.label}`, onclick: () => actions.open(link) }, "Open"),
        h("button", { type: "button", class: "pw-btn", title: "Copy this web address so you can paste it somewhere", "aria-label": `Copy the address of ${link.label}`, onclick: () => copyText(link.url, "link") }, "Copy link"),
      ));
    }
  }

  function renderHistory() {
    clear(historyHost);
    clearHistory.disabled = history.length === 0;
    if (!history.length) {
      historyHost.append(h("p", { class: "pw-hint ip-empty" }, "Your recent lookups appear here. Click one to do it again."));
      return;
    }
    historyHost.append(h("table", { class: "pw-table ip-table" },
      h("thead", {}, h("tr", {}, ["Target", "Result", "Time"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, history.map((e) => h("tr", {},
        h("td", {}, h("button", { type: "button", class: "ip-link", title: `Look up ${e.target} again`, onclick: () => actions.lookup(e.target) }, e.target)),
        h("td", {}, e.label), h("td", {}, e.time)))),
    ));
  }

  function setStatus(text, kind = "info") {
    status.textContent = text;
    status.className = `pw-status ip-status${kind === "error" ? " pw-bad" : kind === "success" ? " pw-ok" : ""}`;
  }

  function setNote(lines, kind = "info") {
    note.hidden = lines.length === 0;
    note.className = `ip-note${kind === "warn" ? " ip-note-warn" : ""}`;
    note.replaceChildren(...lines.map((l) => h("span", { class: "ip-note-line" }, l)));
  }

  function showMetrics(pairs) {
    clear(metrics);
    for (const [label, value] of pairs) metrics.append(h("div", { class: "ip-metric" }, h("span", { class: "ip-metric-label" }, label), h("strong", { class: "ip-metric-value" }, value)));
  }

  /** Shows an answer from the server everywhere. `target` is what was typed (for the history). */
  function show(answer, target) {
    last = answer;
    showMetrics(glance(answer));
    renderTable(answer.table);
    renderLinks(answer.links ?? []);
    raw.textContent = answer.kind === "ip" ? `${answer.summary}\n\nRAW JSON:\n${answer.json}` : `${answer.summary}\n\nJSON:\n${answer.json}`;
    const lines = [answer.explanation, ...(answer.warnings ?? [])].filter(Boolean);
    setNote(lines, answer.isPrivate ? "info" : "warn");
    if (answer.kind === "ip" || answer.kind === "cidr") {
      const typed = target || answer.query || answer.cidr;
      history = [{ target: typed, label: answer.label, time: new Date().toLocaleTimeString() }, ...history.filter((e) => e.target.toLowerCase() !== typed.toLowerCase())].slice(0, MAX_HISTORY);
      renderHistory();
    }
    const headline = answer.kind === "ip" ? (answer.isPrivate ? `${answer.ip} is a private address: it has no public location.` : `Found details for ${answer.ip}${answer.domain ? ` (${answer.domain})` : ""}.`) : answer.message ?? answer.label;
    setStatus(headline, answer.kind === "ip" && answer.isPrivate ? "info" : "success");
  }

  function showError(message, target) {
    last = null;
    showMetrics([["Target", target || "-"], ["Status", "Something went wrong"]]);
    renderTable({
      headers: ["What", "Details", "Result", "What to try"],
      rows: [
        ["What you typed", target || "(nothing)", "Not done", "Check the spelling of a name, the numbers of an address, or the CIDR block."],
        ["What went wrong", message, "Error", "Fix the problem and press Look up again."],
        ["Accepted input", "IPv4, IPv6, a domain name, a CIDR block or an adapter name", "Help", "For example 1.1.1.1, github.com, 192.168.1.0/24 or en0."],
      ],
      acts: [],
    });
    renderLinks([]);
    raw.textContent = "";
    setNote([]);
    setStatus(message, "error");
  }

  function reset() {
    last = null;
    showMetrics([]);
    renderTable(null);
    renderLinks([]);
    raw.textContent = "";
    setNote([]);
    setStatus("Cleared.");
  }

  showMetrics([["IP address", "-"], ["Where", "-"], ["Owner / ASN", "-"], ["Time zone", "-"], ["Status", "Ready"]]);
  renderTable(null);
  renderLinks([]);
  renderHistory();

  return { metrics, note, tableHost, historyHost, clearHistory, linksHost, raw, status, show, showError, reset, setStatus, last: () => last };
}
