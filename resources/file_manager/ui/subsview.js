// Drawing for the Subdomains tool. Everything that came from the network (host names, titles, notes, errors) goes in
// through textContent only; nothing here builds HTML from text.
import { h } from "./dom.js";
import { COLUMNS, SOURCE_STATE_WORDS, cells, stepsWords } from "./subscore.js";

const when = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function consoleLine(level, text, at) {
  return h("div", { class: `subs-line subs-${level}` }, h("span", { class: "subs-time" }, `${when(at ?? Date.now())} `), String(text));
}

/** Updates one source row with the status the server reported. */
export function paintSource(entry, s) {
  entry.badge.className = `subs-badge subs-badge-${s.state}`;
  entry.badge.textContent = SOURCE_STATE_WORDS[s.state] ?? s.state;
  entry.bar.hidden = s.state !== "running";
  entry.count.textContent = s.state === "done" ? `${s.count} host${s.count === 1 ? "" : "s"}${s.dropped ? `, ${s.dropped} other name${s.dropped === 1 ? "" : "s"} ignored` : ""}${s.note ? `. ${s.note}` : ""}` : "";
  entry.error.hidden = !s.error;
  entry.error.textContent = s.error ?? "";
  entry.li.dataset.state = s.state;
}

/** The "ready" look of a source row before any run. */
export function resetSource(entry, installed) {
  entry.badge.className = "subs-badge subs-badge-ready";
  entry.badge.textContent = installed ? "ready" : "not installed";
  entry.bar.hidden = true;
  entry.count.textContent = "";
  entry.error.hidden = true;
  entry.error.textContent = "";
  delete entry.li.dataset.state;
}

/** Marks the sort column in the table heading. */
export function paintSortHeads(thead, key, dir) {
  for (const th of thead.children) th.setAttribute("aria-sort", th.dataset.key === key ? (dir === "asc" ? "ascending" : "descending") : "none");
}

/** One table row. `hooks`: { select(host), copyCell(text, label) }. */
function rowFor(row, index, selected, hooks) {
  const c = cells(row);
  const td = (key, extra = {}) => {
    const label = COLUMNS.find((x) => x.key === key).label;
    return h("td", { role: "gridcell", title: row.note && key === "host" ? row.note : "Double-click to copy this cell.", ...extra, ondblclick: () => hooks.copyCell(c[key], label) }, c[key] || "—");
  };
  const hostCell = td("host", { class: "pw-mono subs-host" });
  if (row.note) hostCell.append(h("div", { class: "subs-note" }, row.note));
  return h("tr", {
    role: "row", tabindex: "-1", dataset: { host: row.host, index: String(index) }, "aria-selected": selected === row.host ? "true" : "false",
    onclick: () => hooks.select(row.host),
  },
    hostCell, td("sources"), td("ip", { class: "pw-mono" }), td("status", { class: row.httpStatus !== undefined && row.httpStatus >= 400 ? "subs-bad" : "" }),
    td("title", { class: "subs-title" }), td("ports"), td("wildcard"));
}

/** Draws the first `limit` rows of `rows`. */
export function paintRows(ui, rows, limit, selected, hooks, emptyText) {
  const slice = rows.slice(0, limit);
  if (!slice.length) {
    ui.tbody.replaceChildren(h("tr", { role: "row" }, h("td", { role: "gridcell", colspan: String(COLUMNS.length), class: "pw-hint" }, emptyText)));
  } else {
    ui.tbody.replaceChildren(...slice.map((r, i) => rowFor(r, i, selected, hooks)));
  }
  ui.table.setAttribute("aria-rowcount", String(rows.length));
  ui.more.hidden = rows.length <= limit;
  ui.more.textContent = `Show ${Math.min(300, rows.length - limit)} more (${rows.length - limit} not shown yet)`;
}

/** One history entry with its buttons. `hooks`: { use(entry), load(entry) }. */
export function historyItem(entry, hooks) {
  const counts = entry.counts;
  const bits = [`${counts.hosts} host${counts.hosts === 1 ? "" : "s"}`];
  if (entry.steps.resolve) bits.push(`${counts.live} with an IP address`);
  if (entry.steps.probeHttp) bits.push(`${counts.http} answered on the web`);
  const shown = entry.unicode && entry.unicode !== entry.domain ? `${entry.unicode} (${entry.domain})` : entry.domain;
  return h("li", { class: "subs-history-item" },
    h("strong", { class: "pw-mono" }, shown),
    h("span", { class: "pw-hint" }, ` ${new Date(entry.at).toLocaleString()} · ${bits.join(" · ")} · ${stepsWords(entry.steps)}${entry.state === "cancelled" ? " · cancelled" : ""}${entry.truncated ? " · reached the limit" : ""}`),
    h("span", { class: "subs-history-actions" },
      h("button", { type: "button", class: "pw-btn", title: `Put ${entry.domain} in the domain box again.`, onclick: () => hooks.use(entry) }, "Use this domain"),
      entry.hasResults
        ? h("button", { type: "button", class: "pw-btn", title: `Show the ${entry.keptHosts} host names that were kept for this run.`, onclick: () => hooks.load(entry) }, "Show kept results")
        : h("span", { class: "pw-hint" }, "no host names kept")));
}
