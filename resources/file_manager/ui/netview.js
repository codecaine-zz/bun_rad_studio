// How the Network tool shows its answers. Every function returns { node, text }: `node` is what is drawn
// (built with h(), never HTML strings) and `text` is the same information as a plain-text report for copying and saving.
import { h } from "./dom.js";

export const fmtMs = (v) => (v === null || v === undefined ? "-" : `${v} ms`);
export const fmtClock = (ms) => new Date(ms).toLocaleTimeString();

const PORT_STATUS = {
  OPEN: { label: "Open", cls: "open", meaning: "Something is listening" },
  CLOSED: { label: "Closed", cls: "closed", meaning: "Nothing is listening there" },
  TIMEOUT: { label: "No answer", cls: "quiet", meaning: "No reply: a firewall may be blocking it" },
};

const LEVEL_MARK = { ok: "✔", warn: "⚠", error: "✖", info: "•" };

/** One line of the live diagnostics stream. The mark makes the level clear without relying on color. */
export function consoleLine(level, text, at = Date.now()) {
  return h("div", { class: `net-line net-${level}` }, h("span", { class: "net-time" }, fmtClock(at)), " ", h("span", { "aria-hidden": "true" }, LEVEL_MARK[level] ?? "•"), " ", text);
}

export function activityRow(row) {
  return h("tr", {}, h("td", {}, fmtClock(row.at)), h("td", {}, row.kind), h("td", { class: "pw-mono" }, row.target), h("td", {}, row.result), h("td", { class: "num" }, row.ms === null ? "-" : String(row.ms)));
}

const pad = (s, n) => String(s).padEnd(n);
const textTable = (rows) => {
  const w = Math.max(0, ...rows.map((r) => String(r[0]).length)) + 2;
  return rows.map(([k, v]) => `${pad(k, w)}${v}`).join("\n");
};

/** The common frame: a colored heading with a plain-language line under it, then the content. */
function frame(tone, title, subtitle, children, text) {
  const node = h("div", { class: `net-result net-tone-${tone}` },
    h("h3", { class: "net-result-title" }, title),
    subtitle ? h("p", { class: "net-result-sub" }, subtitle) : null,
    children,
  );
  return { node, text: `${title}\n${subtitle ? `${subtitle}\n` : ""}${text}`.trimEnd() + "\n" };
}

function kvTable(rows, label) {
  return h("div", { class: "pw-table-wrap" },
    h("table", { class: "pw-table net-kv", "aria-label": label },
      h("tbody", {}, rows.map(([k, v]) => h("tr", {}, h("th", { scope: "row" }, k), h("td", { class: "pw-mono net-wrap" }, v)))),
    ),
  );
}

export function renderWelcome(connections, limits) {
  const rows = connections.map((c) => [c.name, `${c.family}${c.internal ? " (this computer only)" : ""} - ${c.address}`]);
  const node = h("div", { class: "net-result net-tone-info" },
    h("h3", { class: "net-result-title" }, "Ready"),
    h("p", { class: "net-result-sub" }, "Pick a target above, then press a button. Answers appear here in plain words, and every step is listed in the live stream below."),
    limits ? h("p", { class: "pw-hint" }, `Safety limits: up to ${limits.maxPorts} ports per scan, ${limits.maxConcurrency} connections at once, ${limits.maxRunningTasks} long checks at a time, and a ${limits.scanTimeCapMs / 1000}-second cap on any scan.`) : null,
    rows.length ? h("details", {}, h("summary", { title: "The network connections this computer has. Addresses other than the loopback one are hidden for your privacy." }, "This computer's network connections"), kvTable(rows, "This computer's network connections")) : null,
  );
  return { node, text: "" };
}

export function renderError(title, message, hints = []) {
  const node = h("div", { class: "net-result net-tone-bad", role: "alert" },
    h("h3", { class: "net-result-title" }, `✖ ${title}`),
    h("p", { class: "net-result-sub" }, message),
    hints.length ? h("ul", { class: "net-hints" }, hints.map((t) => h("li", {}, t))) : null,
  );
  return { node, text: `${title}\n${message}\n` };
}

// ---------------------------------------------------------------------------------------------------------------
// Port scans and TCP ping
// ---------------------------------------------------------------------------------------------------------------

export function renderScan(task, openOnly) {
  const rows = task.results.filter((r) => !openOnly || r.status === "OPEN").sort((a, b) => a.port - b.port);
  const hidden = task.results.length - rows.length;
  const running = task.state === "running";
  const title = task.mode === "single" ? `Port check: ${task.host}:${task.port}` : `Port scan: ${task.host}`;
  const subtitle = running ? `Checking... ${task.done} of ${task.total} ports done.` : task.error ? task.error.message : task.summary;
  const tone = task.error ? "bad" : running ? "info" : task.counts.open > 0 ? "ok" : "warn";
  const table = rows.length
    ? h("div", { class: "pw-table-wrap net-table-scroll" },
      h("table", { class: "pw-table", "aria-label": `Ports checked on ${task.host}` },
        h("thead", {}, h("tr", {}, ["Port", "Service", "Result", "Time", "What it means"].map((c, i) => h("th", { scope: "col", class: i === 3 ? "num" : null }, c)))),
        h("tbody", {}, rows.map((r) => {
          const s = PORT_STATUS[r.status];
          return h("tr", {}, h("td", { class: "pw-mono" }, String(r.port)), h("td", {}, r.service), h("td", {}, h("span", { class: `net-badge net-badge-${s.cls}` }, s.label)), h("td", { class: "num" }, fmtMs(r.latencyMs)), h("td", {}, s.meaning));
        })),
      ),
    )
    : h("p", { class: "pw-hint" }, running ? "Waiting for the first answers..." : task.error ? "" : task.state === "cancelled" ? "Nothing was listed before the scan was cancelled." : "No open ports were found.");
  const children = [
    task.headline ? h("p", { class: "net-headline" }, task.headline) : null,
    task.counts.open + task.counts.closed + task.counts.timeout > 0 ? h("p", { class: "net-chips" },
      h("span", { class: "net-chip", title: "Ports where something answered" }, `Open: ${task.counts.open}`),
      h("span", { class: "net-chip", title: "Ports where the computer answered but nothing is listening" }, `Closed: ${task.counts.closed}`),
      h("span", { class: "net-chip", title: "Ports that did not answer in time" }, `No answer: ${task.counts.timeout}`),
    ) : null,
    table,
    hidden > 0 ? h("p", { class: "pw-hint" }, `${hidden} closed or silent port${hidden === 1 ? " is" : "s are"} hidden because "Show open ports only" is ticked.`) : null,
  ];
  const lines = rows.map((r) => `${pad(r.port, 8)}${pad(r.service, 20)}${pad(PORT_STATUS[r.status].label, 11)}${fmtMs(r.latencyMs)}`);
  return frame(tone, title, subtitle, children, `${task.headline ? `${task.headline}\n` : ""}\nPORT    SERVICE             RESULT     TIME\n${lines.join("\n")}${hidden > 0 ? `\n(${hidden} hidden)` : ""}`);
}

export function renderPing(task) {
  const s = task.stats;
  const rows = task.samples.map((v, i) => [`Reply ${i + 1}`, v === null ? "no reply (refused or timed out)" : `${v} ms`]);
  if (s) {
    rows.push(["Sent / received", `${s.sent} / ${s.received}`], ["Packets lost", `${s.lossPct}%`], ["Fastest / average / slowest", s.min === null ? "-" : `${s.min} / ${s.avg} / ${s.max} ms`], ["Jitter (wobble)", s.jitter === null ? "-" : `${s.jitter} ms`]);
  }
  const running = task.state === "running";
  const tone = task.error ? "bad" : running ? "info" : !s || s.received === 0 ? "bad" : s.lossPct > 0 ? "warn" : "ok";
  const subtitle = running ? `Timing connection ${task.done + 1} of ${task.total}...` : task.error ? task.error.message : task.summary;
  return frame(tone, `TCP ping: ${task.host}:${task.port}`, subtitle, [
    h("p", { class: "pw-hint" }, "Each reply is how long it took to open a connection. Smaller numbers are faster; \"lost\" means a try got no answer."),
    rows.length ? kvTable(rows, "TCP ping results") : null,
  ], textTable(rows));
}

// ---------------------------------------------------------------------------------------------------------------
// Web check and certificate
// ---------------------------------------------------------------------------------------------------------------

export function renderProbe(res) {
  if (res.error) return renderError("The web check failed", res.error.message, [`Address tried: ${res.url}`]);
  const tone = res.status < 300 ? "ok" : res.status < 400 ? "info" : "warn";
  const t = res.timings;
  const chips = [["Name lookup", t.dnsMs, "How long finding the computer's address took"], ["Connect", t.connectMs, "How long opening the connection took"],
    ...(res.scheme === "https" ? [["Secure handshake", t.tlsMs, "How long setting up the encryption took"]] : []),
    ["First byte", t.ttfbMs, "How long the server took to start answering"], ["Total", t.totalMs, "The whole check, start to finish"]];
  const rows = [["Address", res.url], ["Remote IP", res.remoteIp ?? "-"], ["Status", `${res.status} ${res.statusText}`], ...chips.map(([l, v]) => [l, fmtMs(v)])];
  const headerRows = res.headers.map(([k, v]) => [k, v]);
  const children = [
    h("p", { class: "net-headline" }, h("span", { class: `net-badge net-badge-${tone === "ok" ? "open" : tone === "info" ? "quiet" : "bad"}` }, `${res.status} ${res.statusText}`), " ", res.explain),
    h("p", { class: "net-chips" }, chips.map(([l, v, tip]) => h("span", { class: "net-chip", title: tip }, `${l}: ${fmtMs(v)}`))),
    res.redirect ? h("p", { class: "net-note" }, `Redirect (not followed): the server says to go to ${res.redirect.to}. ${res.redirect.sameHost ? "That is the same computer." : "That is a different computer, so check it separately if you trust it."}`) : null,
    res.tls && !res.tls.trusted ? h("p", { class: "net-note" }, `Heads up: this computer doesn't trust the site's certificate${res.tls.authError ? ` (${res.tls.authError})` : ""}. Use "SSL certificate" for details.`) : null,
    res.method === "GET" ? h("p", { class: "pw-hint" }, `Read ${res.bodyBytesRead} byte${res.bodyBytesRead === 1 ? "" : "s"} of the page${res.bodyTruncated ? " and then stopped (only the first few KB are ever read)" : ""}.`) : null,
    h("h4", { class: "net-sub" }, `Response headers (${headerRows.length})`),
    h("p", { class: "pw-hint" }, "Headers are notes the server sends with its answer, such as the type of content and caching rules."),
    headerRows.length ? h("div", { class: "pw-table-wrap net-table-scroll" }, h("table", { class: "pw-table net-kv", "aria-label": "Response headers" }, h("tbody", {}, headerRows.map(([k, v]) => h("tr", {}, h("th", { scope: "row" }, k), h("td", { class: "pw-mono net-wrap" }, v)))))) : null,
  ];
  const text = `${textTable(rows)}${res.redirect ? `\nRedirect (not followed): ${res.redirect.to}` : ""}\nResponse headers:\n${headerRows.map(([k, v]) => `  ${k}: ${v}`).join("\n")}`;
  return frame(tone, `Web check: ${res.url}`, `${res.method} request answered in ${fmtMs(t.totalMs)}.`, children, text);
}

export function renderTls(res) {
  if (res.error) return renderError(`Certificate check failed for ${res.host}:${res.port}`, res.error.message, ["The SSL certificate check only works on secure ports, such as 443."]);
  const tone = res.verdict === "ok" ? "ok" : res.verdict === "warn" ? "warn" : "bad";
  return frame(tone, `SSL/TLS certificate: ${res.host}:${res.port}`, res.explain, [
    h("p", { class: "pw-hint" }, "A certificate is the site's ID card. It says who the site is, who vouched for it, and when it stops being valid."),
    kvTable(res.rows, "Certificate details"),
  ], textTable(res.rows));
}

// ---------------------------------------------------------------------------------------------------------------
// DNS
// ---------------------------------------------------------------------------------------------------------------

const DNS_NAMES = { A: "IPv4 addresses", AAAA: "IPv6 addresses", MX: "Mail servers", TXT: "Text notes", NS: "Name servers", SOA: "Zone details", CAA: "Certificate rules", CNAME: "Alias", PTR: "Reverse lookup" };

function dnsBlock(r) {
  const body = r.error ? h("p", { class: "net-note" }, r.error.message)
    : r.lines.length ? h("ul", { class: "net-records pw-mono" }, r.lines.map((l) => h("li", {}, l)))
      : h("p", { class: "pw-hint" }, r.explain);
  return h("div", { class: "net-dns-block" }, body, r.lines.length ? h("p", { class: "pw-hint" }, r.explain) : null, h("p", { class: "pw-hint" }, `Answered by: ${r.sourceLabel} in ${fmtMs(r.elapsedMs)}.`));
}

const dnsText = (r) => `--- ${r.type} (${DNS_NAMES[r.type]}) via ${r.sourceLabel}, ${fmtMs(r.elapsedMs)} ---\n${r.error ? r.error.message : r.lines.length ? r.lines.join("\n") : `(no ${r.type} records)`}\n`;

export function renderDns(res) {
  const r = res.result;
  const tone = r.error ? "bad" : r.lines.length ? "ok" : "warn";
  return frame(tone, `DNS ${r.type} (${DNS_NAMES[r.type]}): ${r.host}`, r.error ? r.error.message : r.lines.length ? `${r.lines.length} line${r.lines.length === 1 ? "" : "s"} found.` : "Nothing found for this record type.", [dnsBlock(r)], dnsText(r));
}

export function renderDnsAudit(res) {
  const tone = res.active > 0 ? "ok" : "warn";
  const sections = res.results.map((r) => h("details", { open: r.lines.length > 0 || !!r.error },
    h("summary", {}, `${r.type} - ${DNS_NAMES[r.type]}: ${r.error ? "problem" : r.lines.length ? `${r.lines.length} found` : "none"}`),
    dnsBlock(r),
  ));
  return frame(tone, `Full DNS audit: ${res.host}`, `${res.active} of ${res.results.length} record types have data (${fmtMs(res.elapsedMs)} in total). DNS is the internet's phone book: it turns names into addresses.`, sections, res.results.map(dnsText).join("\n"));
}
