// The controls of the Subdomains tool. Every input has a visible label, every control has a tooltip written for a
// beginner, and everything is reachable with the keyboard. Built with h() only; subs.js wires up the behavior.
import { h } from "./dom.js";
import { COLUMNS } from "./subscore.js";

function button(label, tip, onclick, { icon = "", cls = "" } = {}) {
  return h("button", { type: "button", class: `pw-btn${cls ? ` ${cls}` : ""}`, title: tip, onclick },
    icon ? h("span", { "aria-hidden": "true" }, `${icon} `) : null, label);
}

const field = (label, tip, input, extraClass = "") => {
  input.title = tip;
  return h("label", { class: `pw-field ${extraClass}`.trim(), title: tip }, label, input);
};

const numberInput = (value, min, max, label) => h("input", { type: "number", min: String(min), max: String(max), step: "1", value: String(value), "aria-label": label, inputmode: "numeric" });

function check(label, tip, checked = false) {
  const input = h("input", { type: "checkbox", checked, title: tip });
  return { input, node: h("label", { class: "subs-check", title: tip }, input, ` ${label}`) };
}

const card = (title, intro, ...children) => h("section", { class: "pw-card subs-card" }, h("h3", {}, title), intro ? h("p", { class: "pw-hint" }, intro) : null, ...children);

const FILTER_STATUS = [["any", "Any web answer"], ["2xx", "2xx (OK)"], ["3xx", "3xx (moved)"], ["4xx", "4xx (refused or missing)"], ["5xx", "5xx (server problem)"], ["none", "No web answer"]];
const FILTER_IP = [["any", "Any address"], ["has", "Has an IP address"], ["none", "No IP address"]];

/** Builds the whole tool into `root`. `a` holds the click handlers; the returned object holds the elements subs.js talks to. */
export function buildLayout(root, a) {
  const ui = {};
  ui.domain = h("input", { type: "text", placeholder: "example.com", spellcheck: "false", autocomplete: "off", autocapitalize: "off", "aria-label": "Domain to look up", maxlength: "300" });
  ui.shown = h("p", { class: "pw-hint subs-shown", role: "status" }, "");
  ui.run = button("Find subdomains", "Asks the ticked sources for subdomains of this domain, then runs any extra steps you switched on. Passive sources only read public records; they don't contact the domain.", a.run, { icon: "🔭", cls: "primary" });
  ui.cancel = button("Cancel", "Stops the run right now. What was found so far is kept.", a.cancel, { icon: "⏹", cls: "danger" });
  ui.cancel.hidden = true;
  ui.progress = h("progress", { class: "subs-progress", max: "100", value: "0", "aria-label": "Progress of the current step", hidden: true });
  ui.status = h("span", { class: "pw-status", role: "status" }, "");
  ui.message = h("p", { class: "subs-message", role: "alert", hidden: true });

  // ---- sources ----
  ui.sourceList = h("ul", { class: "subs-sources", "aria-label": "Sources to ask" });

  // ---- options ----
  ui.timeout = numberInput(15, 3, 60, "Time limit per source in seconds");
  ui.max = numberInput(2000, 1, 10000, "Most results to keep");
  ui.dns = numberInput(8, 1, 10, "DNS lookups at once");
  ui.http = numberInput(4, 1, 5, "Web checks at once");
  ui.ports = h("input", { type: "text", value: "80,443", spellcheck: "false", autocomplete: "off", "aria-label": "Ports to probe", size: "18", placeholder: "80,443" });
  ui.resolve = check("Resolve DNS (find live IP addresses)", "Active step. Looks up the IP address of every host found. This asks DNS servers about each name, and can reach the domain's own name servers.");
  ui.probeHttp = check("Probe HTTP/HTTPS (status and title)", "Active step. Opens a web connection to each live host once and reads its status code and page title. Needs Resolve DNS.");
  ui.probePorts = check("Probe ports", "Active step. Tries to connect to each port in the list on every live host. Needs Resolve DNS. Only do this on your own systems.");
  ui.wildcard = check("Detect wildcard DNS", "Active step. Asks DNS for three random names that cannot exist. If they answer, the domain has a wildcard and hosts that only match it are marked. Needs Resolve DNS.");
  ui.allowPrivate = check("Allow private/internal addresses", "Off by default. Normally hosts whose DNS points inside a private network (10.x, 192.168.x, 127.x and similar) are never connected to. Turn this on only to test your own internal network.");
  ui.untrusted = check("Accept untrusted HTTPS certificates", "Off by default. Normally a website whose certificate can't be verified is not read over HTTPS. Turn this on to see hosts with self-signed certificates.");
  ui.keep = check("Keep these results in the history", "Off by default. The history normally keeps only the target, time and counts. Tick this to also keep the host names of this run on this computer.");
  ui.permissionBox = check("I own this domain or have permission to test it", "Required before DNS lookups or probing. It is remembered for this domain until you close the File Manager.");
  ui.permissionNote = h("p", { class: "pw-hint" }, "Tick this once per domain. It is remembered only until you close the File Manager.");
  ui.permission = h("div", { class: "subs-permission", role: "group", "aria-label": "Permission to use active steps", hidden: true },
    h("p", {}, h("strong", {}, "Active steps contact the target's own computers.")),
    ui.permissionBox.node,
    ui.permissionNote);

  // ---- results ----
  ui.counts = h("p", { class: "pw-status subs-counts", role: "status", "aria-live": "polite" }, "No run yet.");
  ui.filterText = h("input", { type: "search", class: "subs-filter", placeholder: "Narrow these results…", "aria-label": "Narrow these results", title: "Type part of a host name, title, address or source to show fewer rows. Nothing is asked again.", spellcheck: "false", autocomplete: "off" });
  ui.filterIp = h("select", { "aria-label": "Filter by IP address", title: "Show only hosts that do or don't have an IP address." }, FILTER_IP.map(([v, l]) => h("option", { value: v }, l)));
  ui.filterStatus = h("select", { "aria-label": "Filter by web status", title: "Show only hosts by the kind of web answer they gave." }, FILTER_STATUS.map(([v, l]) => h("option", { value: v }, l)));
  ui.filterSource = h("select", { "aria-label": "Filter by source", title: "Show only hosts that a particular source reported." }, h("option", { value: "any" }, "Any source"));
  const onlyLive = check("Only live", "Show only hosts that have an IP address or answered on the web.");
  ui.onlyLive = onlyLive.input;
  ui.thead = h("tr", { role: "row" }, COLUMNS.map((c) => h("th", { scope: "col", role: "columnheader", "aria-sort": "none", dataset: { key: c.key } },
    h("button", { type: "button", class: "subs-sort", title: `Sort by ${c.label.toLowerCase()}. ${c.tip}`, onclick: () => a.sort(c.key) }, c.label))));
  ui.tbody = h("tbody", {});
  ui.table = h("table", { class: "pw-table subs-table", role: "grid", "aria-label": "Subdomains found. Click a row to select it; arrow keys move between rows.", "aria-rowcount": "0" }, h("thead", {}, ui.thead), ui.tbody);
  ui.more = button("Show more", "Show the next rows of the table.", a.more, { cls: "subs-more" });
  ui.more.hidden = true;
  ui.selected = h("p", { class: "pw-status", role: "status" }, "Click a row to work with that host.");
  ui.selNetwork = button("Open in Network tab", "Switch to the Network tab with this host filled in, to check its DNS records, certificate or ports there.", a.openNetwork, { icon: "📡" });
  ui.selCopyUrl = button("Copy URL", "Copy the web address (https:// or http://) of the selected host.", a.copyUrl, { icon: "🔗" });
  ui.selBrowser = button("Open in browser", "Open the selected host in your web browser. Only http and https addresses are opened, and only when you press this.", a.openBrowser, { icon: "↗" });
  ui.selCopyRow = button("Copy row", "Copy every column of the selected host as tab-separated text.", a.copyRow, { icon: "⧉" });
  for (const b of [ui.selNetwork, ui.selCopyUrl, ui.selBrowser, ui.selCopyRow]) b.disabled = true;
  ui.copyColumn = h("select", { "aria-label": "Column to copy", title: "Choose a column to copy all its values (for the rows shown)." }, COLUMNS.map((c) => h("option", { value: c.key }, c.label)));
  const copyRow = h("div", { class: "pw-row", role: "group", "aria-label": "Copy the results" },
    button("Copy hosts (one per line)", "Copy just the host names of the rows shown, one per line.", a.copyHosts, { icon: "⧉" }),
    button("Copy as CSV", "Copy the rows shown as CSV (spreadsheet) text.", () => a.copyAs("csv")),
    button("Copy as JSON", "Copy the rows shown as JSON.", () => a.copyAs("json")),
    button("Copy as Markdown", "Copy the rows shown as a Markdown table.", () => a.copyAs("markdown")),
    ui.copyColumn, button("Copy column", "Copy every value of the chosen column for the rows shown.", a.copyColumn));
  ui.copyHint = h("p", { class: "pw-hint" }, "Tip: double-click any cell to copy just that cell.");

  // ---- save ----
  ui.folder = h("input", { type: "text", placeholder: "~/Documents", "aria-label": "Folder to save in", spellcheck: "false", autocomplete: "off" });
  ui.name = h("input", { type: "text", placeholder: "example.com hosts.txt", "aria-label": "File name (optional)", spellcheck: "false", autocomplete: "off" });
  ui.format = h("select", { "aria-label": "Export format" }, [["txt", "Host list (.txt)"], ["csv", "Spreadsheet (.csv)"], ["json", "JSON (.json)"]].map(([v, l]) => h("option", { value: v }, l)));

  // ---- history, console ----
  ui.historyList = h("ul", { class: "subs-history", "aria-label": "Recent runs" });
  ui.historyEmpty = h("p", { class: "pw-hint" }, "No runs yet. Each run you start is listed here (target, time and counts).");
  ui.clearHistory = button("Clear history", "Forget every run in this list, including any host names that were kept.", a.clearHistory, { icon: "🗑", cls: "danger" });
  ui.consoleEl = h("div", { class: "pw-out subs-console", role: "log", "aria-live": "off", "aria-label": "What the tool is doing", tabindex: "0", title: "Every step is listed here as it happens. Click and use the arrow keys to scroll." });

  root.append(
    h("div", { class: "subs-warning", role: "note" },
      h("strong", {}, "⚠ Use this on domains you own or are allowed to test."),
      h("span", {}, " Asking the public sources (certificate logs and passive-DNS services) is generally fine: it reads public records and never touches the domain. The steps below it — DNS lookups, web probing and port probing — contact the target's own computers. They are off by default, and you are asked to confirm you may test the domain before the first one runs."),
    ),
    h("div", { class: "pw-split" },
      card("Target", "The domain whose subdomains you want to find, like example.com. No http://, path or port.",
        h("div", { class: "pw-row" }, field("Domain", "Type a domain you own or are allowed to test, like example.com. International names such as bücher.example work too.", ui.domain, "subs-grow")),
        ui.shown,
        h("div", { class: "pw-row" }, ui.run, ui.cancel, ui.progress, ui.status),
        ui.message,
      ),
      card("Sources", "Passive: these only read public records about the domain.", ui.sourceList),
      card("Options", "Polite defaults: a few requests at a time, with a pause between requests to the same host.",
        h("div", { class: "pw-row" },
          field("Time limit per source (s)", "How long to wait for each source before giving up on it (3 to 60 seconds).", ui.timeout),
          field("Most results to keep", "The run stops adding hosts after this many (1 to 10,000).", ui.max)),
        h("fieldset", { class: "subs-active" },
          h("legend", {}, "Active steps (off by default)"),
          h("p", { class: "pw-hint" }, "These contact the target's own computers. Only use them on domains you own or have permission to test."),
          h("div", { class: "subs-step" }, ui.resolve.node, h("p", { class: "pw-hint" }, "Asks DNS for each host's IP address, so you can tell which names are live. Adds a lookup per host.")),
          h("div", { class: "subs-step" }, ui.wildcard.node, h("p", { class: "pw-hint" }, "Asks for three names that can't exist. If DNS answers anyway, hosts that only match that answer are marked \"wildcard\".")),
          h("div", { class: "subs-step" }, ui.probeHttp.node, h("p", { class: "pw-hint" }, "Visits each live host's website once (HTTPS first, then HTTP) to read its status and title. Follows up to 3 redirects within the same domain. No cookies are sent.")),
          h("div", { class: "subs-step" }, ui.probePorts.node, field("Ports", "The ports to try, like 80,443 or 8000-8003. At most 20.", ui.ports), h("p", { class: "pw-hint" }, "Tries to connect to each port on each live host. This can look like a port scan to the owner.")),
          h("div", { class: "pw-row" }, field("DNS lookups at once", "How many DNS lookups run at the same time (1 to 10).", ui.dns), field("Web checks at once", "How many websites are checked at the same time (1 to 5).", ui.http)),
          h("div", { class: "subs-step" }, ui.allowPrivate.node, h("p", { class: "pw-hint" }, "Off: a host whose DNS points to a private, loopback or link-local address is never connected to, even after a redirect.")),
          h("div", { class: "subs-step" }, ui.untrusted.node, h("p", { class: "pw-hint" }, "Off: HTTPS certificates are verified.")),
          ui.permission,
        ),
        h("div", { class: "pw-row" }, ui.keep.node),
      ),
    ),
    h("section", { class: "pw-card subs-card subs-results" },
      h("h3", {}, "Results"),
      ui.counts,
      h("div", { class: "pw-row" }, ui.filterText, ui.filterIp, ui.filterStatus, ui.filterSource, onlyLive.node),
      h("div", { class: "pw-row subs-selbar" }, ui.selected, ui.selNetwork, ui.selCopyUrl, ui.selBrowser, ui.selCopyRow),
      h("div", { class: "pw-table-wrap subs-table-wrap" }, ui.table),
      h("div", { class: "pw-row" }, ui.more),
      copyRow, ui.copyHint,
    ),
    card("Save", "Export the hosts to a new file, or save a Markdown report. Nothing is ever overwritten.",
      h("div", { class: "pw-row" },
        field("Folder", "The folder to save in, like ~/Documents.", ui.folder, "subs-grow"),
        field("File name (optional)", "Leave empty to name the file after the domain. A number is added if the name is already taken.", ui.name),
        field("Format", "The kind of file to export.", ui.format)),
      h("div", { class: "pw-row" },
        button("Use current folder", "Fill in the folder you are looking at in the file list.", a.useFolder),
        button("Export", "Save the hosts the table shows (or all of them when no filter is on) in the chosen format.", a.exportFile, { icon: "💾", cls: "primary" }),
        button("Save as a report", "Save a Markdown report: date, target, sources used, counts, the hosts and notes in plain words.", a.saveReport, { icon: "📝" })),
    ),
    card("History", "Your last 20 runs: target, time and counts. Host names are kept only for runs where you ticked \"Keep these results\".",
      ui.historyList, ui.historyEmpty, h("div", { class: "pw-row" }, ui.clearHistory)),
    h("section", { class: "pw-card subs-card" }, h("h3", {}, "Activity"), ui.consoleEl),
  );
  return ui;
}

/** One source row: a checkbox, its name and note, and the status, count and error of the current run. */
export function sourceRow(source, installed, hint) {
  const input = h("input", { type: "checkbox", title: source.note, disabled: !installed, checked: installed && source.id !== "subfinder" });
  const badge = h("span", { class: "subs-badge subs-badge-ready" }, installed ? "ready" : "not installed");
  const count = h("span", { class: "pw-hint subs-count" }, "");
  const error = h("span", { class: "subs-source-error", hidden: true });
  const bar = h("progress", { class: "subs-source-progress", "aria-label": `${source.label} progress`, hidden: true });
  const li = h("li", { class: "subs-source", dataset: { source: source.id } },
    h("label", { class: "subs-check", title: source.note }, input, ` ${source.label}`),
    h("span", { class: "pw-hint" }, source.note + (installed ? "" : ` Not installed here. To get it: ${hint}`)),
    h("span", { class: "subs-source-state" }, badge, bar, count), error);
  return { li, input, badge, count, error, bar };
}
