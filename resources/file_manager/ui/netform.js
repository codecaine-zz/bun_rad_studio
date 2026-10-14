// The controls of the Network tool: every input has a visible label, every control has a tooltip written for a
// beginner, and everything is reachable with the keyboard. Built with h() only; net.js wires up the behaviour.
import { h } from "./dom.js";

function button(label, tip, onclick, { icon = "", cls = "", run = true } = {}) {
  return h("button", { type: "button", class: `pw-btn${cls ? ` ${cls}` : ""}${run ? " net-run" : ""}`, title: tip, onclick },
    icon ? h("span", { "aria-hidden": "true" }, `${icon} `) : null, label);
}

function field(label, tip, input, extraClass = "") {
  input.title = tip;
  return h("label", { class: `pw-field ${extraClass}`.trim(), title: tip }, label, input);
}

const textInput = (value, extra = {}) => h("input", { type: "text", value, spellcheck: "false", autocomplete: "off", autocapitalize: "off", ...extra });
const checkbox = (label, tip, checked) => {
  const input = h("input", { type: "checkbox", checked, title: tip });
  return { input, node: h("label", { class: "net-check", title: tip }, input, ` ${label}`) };
};

function card(title, intro, ...children) {
  return h("section", { class: "pw-card net-card" }, h("h3", {}, title), intro ? h("p", { class: "pw-hint" }, intro) : null, ...children);
}

const DNS_BUTTONS = [
  ["A", "A (IPv4)", "The IPv4 addresses a name points to, like 93.184.216.34."],
  ["AAAA", "AAAA (IPv6)", "The IPv6 addresses a name points to (long ones with colons)."],
  ["MX", "MX (mail)", "Which mail servers receive email for this name."],
  ["TXT", "TXT (notes)", "Text notes, often used to prove who owns a domain or to fight spam."],
  ["NS", "NS (name servers)", "Which servers are in charge of this domain."],
  ["SOA", "SOA (zone)", "The domain's main name server and its refresh timings."],
  ["CAA", "CAA (certificates)", "Which companies may issue SSL certificates for this domain."],
  ["PTR", "Reverse (PTR)", "Turns an IP address back into a name. Type an IP address like 8.8.8.8 in the Computer box first."],
];

/** Builds the whole tool into `root` and returns the pieces net.js needs to talk to. `a` holds the click handlers. */
export function buildLayout(root, a) {
  const host = textInput("127.0.0.1", { placeholder: "example.com or 192.168.1.10", "aria-label": "Computer or website to check" });
  const port = textInput("", { placeholder: "443", inputmode: "numeric", maxlength: "5", size: "6", "aria-label": "Port number" });
  const scheme = h("select", { "aria-label": "Web address type" }, [["auto", "Automatic"], ["https", "HTTPS (secure)"], ["http", "HTTP (plain)"]].map(([v, l]) => h("option", { value: v }, l)));
  const readBody = checkbox("Also read the first few KB", "Asks for the page itself (GET) instead of only its headers (HEAD), but never reads more than a few kilobytes. Tick this if the quick check says the server doesn't allow HEAD.", false);
  const presetRow = h("div", { class: "pw-row", role: "group", "aria-label": "Quick targets" });

  const ports = textInput("22,80,443,3000,5432,8000-8010", { placeholder: "22,80,443,8000-8010", "aria-label": "Ports to scan" });
  const timeout = h("input", { type: "number", min: "100", max: "5000", step: "50", value: "500", "aria-label": "Time to wait per port in milliseconds" });
  const openOnly = checkbox("Show open ports only", "Hide the closed and silent ports so only the ones where something is listening are listed.", false);
  const cancel = button("Cancel", "Stops the running scan or ping right now and closes its connections.", a.cancel, { icon: "⏹", cls: "danger", run: false });
  cancel.hidden = true;
  const progress = h("progress", { class: "net-progress", max: "100", value: "0", "aria-label": "Scan progress", hidden: true });
  const status = h("span", { class: "pw-status", role: "status" }, "");

  const folder = textInput("", { placeholder: "~/Documents", "aria-label": "Folder to save the report in" });
  const name = textInput("", { placeholder: "Network report.txt", "aria-label": "Report file name (optional)" });
  const format = h("select", { "aria-label": "Report format" }, [h("option", { value: "text" }, "Text report (.txt)"), h("option", { value: "csv", disabled: true }, "Scan table (.csv)")]);

  const results = h("div", { class: "net-results", tabindex: "-1", role: "region", "aria-label": "Results" });
  const consoleEl = h("div", { class: "pw-out net-console", role: "log", "aria-live": "off", "aria-label": "Live diagnostics stream", tabindex: "0", title: "Every step the tool takes is listed here as it happens. Click and use the arrow keys to scroll." });
  const auditBody = h("tbody", {});
  const auditEmpty = h("p", { class: "pw-hint" }, "No connections yet. Each connection the tool makes will be listed here.");

  root.append(
    h("div", { class: "net-warning", role: "note" },
      h("strong", {}, "⚠ Only scan computers and networks you own or have permission to test."),
      h("span", {}, " These checks connect from this computer to the one you name. Scanning other people's computers without permission can be against the law or break their rules."),
    ),
    h("div", { class: "pw-split" },
      card("Target", "Which computer do you want to look at? Use a name like example.com or an address like 192.168.1.10.",
        h("div", { class: "pw-row" }, field("Computer or website", "Type the name or address of the computer to check, like example.com or 192.168.1.10. Don't add http:// or a path.", host, "net-grow"), field("Port", "A port is a numbered door on a computer. 443 is secure websites, 80 is plain websites, 22 is remote login (SSH). Leave it empty to use the usual port for a web check, SSL certificate or TCP ping.", port)),
        presetRow,
        h("div", { class: "pw-row" },
          button("Check website", "Asks the website for its status and headers, and times each step. Redirects are shown but not followed.", a.httpCheck, { icon: "⚡", cls: "primary" }),
          button("Check this port", "Tests whether something is listening on the port number above.", a.checkPort, { icon: "🔌" }),
          button("Scan common ports", "Checks 12 popular ports (web, SSH, databases and more) on this computer.", a.scanTop, { icon: "🌐" }),
        ),
        h("div", { class: "pw-row" }, field("Web address type", "Automatic uses HTTPS except for port 80 and for this computer. Choose HTTP or HTTPS to force it.", scheme), readBody.node),
      ),
      card("Scan a list of ports", "Check many ports in one go. Use commas and ranges, up to 1024 ports at a time.",
        h("div", { class: "pw-row" }, field("Ports", "Ports to check, separated by commas. Ranges work too: 22,80,443,8000-8010.", ports, "net-grow"), field("Wait per port (ms)", "How long to wait for each port before calling it \"no answer\". 100 to 5000 milliseconds. Longer is slower but more reliable on slow networks.", timeout)),
        h("div", { class: "pw-row" }, openOnly.node,
          button("Scan port list", "Checks every port in the list. You can cancel while it runs.", a.scanList, { icon: "🎯", cls: "primary" }), cancel, progress, status),
      ),
      card("DNS: names and addresses", "DNS is the internet's phone book. These look up what is published about a name.",
        h("div", { class: "pw-row" }, button("Full DNS audit", "Looks up every kind of DNS record for the name above and shows them together.", a.dnsAll, { icon: "⚡", cls: "primary" })),
        h("div", { class: "pw-row" }, DNS_BUTTONS.map(([type, label, tip]) => button(label, tip, () => a.dns(type)))),
      ),
      card("Certificate and speed", "Check a site's SSL certificate, or time how fast connections open.",
        h("div", { class: "pw-row" },
          button("SSL certificate", "Shows the site's security certificate: who it was issued to, who vouched for it, when it expires. Uses the Port above (443 for normal websites).", a.tls, { icon: "🔒" }),
          button("TCP ping ×5", "Opens 5 connections in a row to the port above and reports how long each took and whether any were lost.", a.ping, { icon: "📡" })),
      ),
    ),
    h("section", { class: "pw-card net-card" },
      h("h3", {}, "Results"),
      results,
      h("div", { class: "pw-row" },
        button("Copy report", "Copies the latest result as plain text so you can paste it into an email or note.", a.copy, { icon: "📋", run: false }),
        button("Clear", "Empties the results, the live stream and the connection list.", a.clear, { icon: "🧹", run: false }),
      ),
      h("div", { class: "pw-row net-save" },
        field("Save in folder", "The folder to put the report in. Type a location such as ~/Documents. Nothing is ever overwritten: an existing file keeps its name and the report gets a new one.", folder, "net-grow"),
        field("File name (optional)", "Leave empty for \"Network report\". If a file with that name already exists, a number is added.", name),
        field("Format", "Text saves what you see above. The scan table (CSV) opens in a spreadsheet and is available after a port scan.", format),
        button("Use current folder", "Fills in the folder you were browsing in the File Manager.", a.useFolder, { run: false }),
        button("Save report", "Saves the latest result as a new file in the folder. Existing files are never overwritten.", a.save, { icon: "💾", run: false }),
      ),
    ),
    h("div", { class: "pw-split" },
      h("section", { class: "pw-card net-card" }, h("h3", {}, "Live diagnostics stream"), h("p", { class: "pw-hint" }, "A running log of what the tool is doing and what came back."), consoleEl),
      h("section", { class: "pw-card net-card" }, h("h3", {}, "Activity and connection audit"), h("p", { class: "pw-hint" }, "Every connection this tool has made from your computer, newest first."), auditEmpty,
        h("div", { class: "pw-table-wrap net-table-scroll net-audit" },
          h("table", { class: "pw-table", "aria-label": "Connections made by this tool" },
            h("thead", {}, h("tr", {}, ["Time", "Action", "Target", "Result", "ms"].map((c, i) => h("th", { scope: "col", class: i === 4 ? "num" : null }, c)))), auditBody))),
    ),
    h("details", { class: "net-help" },
      h("summary", { title: "Short explanations of the words used in this tool" }, "What do these words mean?"),
      h("dl", {},
        ...[["Open port", "Something on that computer is listening and accepted the connection."], ["Closed port", "The computer answered, but nothing is listening on that port."],
          ["No answer", "Nothing came back in time. A firewall may be silently blocking the port, or the computer is off or unreachable."], ["Firewall", "A guard that blocks or allows network connections."],
          ["DNS", "The internet's phone book: it turns names like example.com into addresses."], ["SSL/TLS", "The encryption behind https:// websites. Its certificate is the site's ID card."],
          ["TCP ping", "Times how long it takes to open a connection. It isn't the same as the classic ping but answers the same question: is it reachable, and how fast?"]]
          .flatMap(([t, d]) => [h("dt", {}, t), h("dd", {}, d)])),
    ),
  );
  return { host, port, scheme, readBody: readBody.input, presetRow, ports, timeout, openOnly: openOnly.input, cancel, progress, status, folder, name, format, results, consoleEl, auditBody, auditEmpty };
}
