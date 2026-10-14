// Shared pieces of the Dev tool: running a server job and polling it, small element builders, and a sortable table
// made of real <table> markup (header cells have scope, the sorted column says so with aria-sort). Text from disk
// only ever goes in through h()/textContent.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";

let pollMs = 200;
/** For tests: how often a running job is asked for news. */
export const setPollInterval = (ms) => {
  pollMs = ms;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts a server job and waits for it. `onProgress(progress, elapsedMs)` runs whenever something changed.
 * Resolves { id, state, result, elapsedMs } ("done" or "cancelled"); rejects with an ApiError when the job failed.
 * `cancel()` asks the server to stop it.
 */
export function runJob(startOp, body, onProgress) {
  let id = null;
  let cancelNow = false;
  const promise = (async () => {
    const started = await call(startOp, body);
    id = started.id;
    if (cancelNow) await call("dev/job/cancel", { id }).catch(() => {});
    let since = 0;
    for (;;) {
      const p = await call("dev/job/poll", { id, since });
      since = p.seq;
      if (p.state === "failed") throw new ApiError(p.error?.message ?? "The scan failed.", p.error?.code ?? "FAILED", 400);
      if (p.state !== "running") return { id, state: p.state, result: p.result, elapsedMs: p.elapsedMs };
      if (!p.unchanged) onProgress?.(p.progress ?? {}, p.elapsedMs);
      await sleep(pollMs);
    }
  })();
  return {
    promise,
    get id() {
      return id;
    },
    cancel() {
      cancelNow = true;
      return id ? call("dev/job/cancel", { id }).catch(() => {}) : Promise.resolve();
    },
  };
}

/** A button with visible text and a tooltip. */
export function btn(label, title, onclick, { primary = false, danger = false } = {}) {
  return h("button", { type: "button", class: `pw-btn${primary ? " primary" : ""}${danger ? " danger" : ""}`, title, onclick }, label);
}

/** A labelled input/select/checkbox. `control` already has its own title. */
export function field(label, control, { inline = false } = {}) {
  return h("label", { class: inline ? "dev-check" : "pw-field" }, inline ? [control, " ", label] : [label, control]);
}

export function checkbox(id, label, title, checked) {
  return field(label, h("input", { type: "checkbox", id, title, checked: checked || null }), { inline: true });
}

export const num = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : "");
export const signed = (n) => (n > 0 ? `+${num(n)}` : n < 0 ? `−${num(Math.abs(n))}` : "0");
export const percent = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "0%");
export const seconds = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);

/** A shown path with an easy way to select it (a button-looking link) — never HTML. */
export function linkButton(text, title, onclick) {
  return h("button", { type: "button", class: "dev-link", title, onclick }, text);
}

/**
 * A table with sortable columns.
 * columns: [{ key, label, num?, sort?: boolean, title? }]. Call render(rows, sort) with rows = [{ cells: [Node|string], onclick?, ondblclick?, key?, selected? }].
 * onSort(key, dir) is called when a sortable header is pressed; the owner re-renders with the new sort.
 */
export function createTable({ caption, columns, onSort, className = "" }) {
  const head = h("tr", {});
  const body = h("tbody", {});
  const table = h("table", { class: `pw-table dev-table ${className}` }, h("caption", { class: "dev-caption" }, caption), h("thead", {}, head), body);
  const wrap = h("div", { class: "pw-table-wrap dev-table-wrap" }, table);
  let sort = { key: null, dir: "desc" };
  const headCells = columns.map((c) => {
    const th = h("th", { scope: "col", class: c.num ? "num" : "", "aria-sort": c.sort ? "none" : null });
    if (c.sort) th.append(h("button", { type: "button", class: "dev-sort", title: c.title ?? `Sort by ${c.label}. Press again to reverse.`, onclick: () => onSort?.(c.key, sort.key === c.key && sort.dir === "desc" ? "asc" : "desc") }, c.label, h("span", { class: "dev-sort-mark", "aria-hidden": "true" })));
    else th.append(c.label);
    head.append(th);
    return th;
  });
  function mark() {
    columns.forEach((c, i) => {
      if (!c.sort) return;
      const on = sort.key === c.key;
      headCells[i].setAttribute("aria-sort", on ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
      headCells[i].querySelector(".dev-sort-mark").textContent = on ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
    });
  }
  return {
    el: wrap,
    table,
    setSort(key, dir) {
      sort = { key, dir };
      mark();
    },
    render(rows) {
      body.replaceChildren();
      for (const r of rows) {
        const tr = h("tr", { "aria-selected": r.selected ? "true" : null, tabindex: r.onclick || r.ondblclick ? "0" : null, class: r.onclick || r.ondblclick ? "dev-row-click" : "", dataset: r.key ? { key: r.key } : null });
        r.cells.forEach((cell, i) => tr.append(h(columns[i]?.rowHeader ? "th" : "td", { class: columns[i]?.num ? "num" : "", scope: columns[i]?.rowHeader ? "row" : null }, cell)));
        if (r.onclick) tr.addEventListener("click", () => r.onclick(tr));
        if (r.ondblclick) tr.addEventListener("dblclick", () => r.ondblclick(tr));
        if (r.onclick || r.ondblclick) {
          tr.addEventListener("keydown", (e) => {
            if (e.target !== tr) return;
            if (e.key === "Enter") {
              e.preventDefault();
              (r.ondblclick ?? r.onclick)(tr);
            } else if (e.key === " ") {
              e.preventDefault();
              r.onclick?.(tr);
            }
          });
        }
        body.append(tr);
      }
      if (!rows.length) body.append(h("tr", {}, h("td", { colspan: String(columns.length), class: "dev-empty" }, "Nothing to show.")));
    },
  };
}

/** The message under a section's buttons. Plain text; `bad` colours it and adds a ✗ so colour isn't the only signal. */
export function createStatus() {
  const el = h("p", { class: "pw-status dev-status", role: "status", "aria-live": "polite" });
  return {
    el,
    set(text, bad = false) {
      el.textContent = bad ? `✗ ${text}` : text;
      el.classList.toggle("pw-bad", bad);
    },
  };
}

export const errorText = (err, fallback = "That didn't work.") => (err instanceof ApiError ? err.message : fallback);

/** A key/value list of facts as a real description list. */
export function factList(facts) {
  const dl = h("dl", { class: "dev-facts" });
  for (const [k, v] of facts) dl.append(h("dt", {}, k), h("dd", {}, v));
  return dl;
}
