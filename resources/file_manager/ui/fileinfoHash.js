// "More info": fingerprints of a file (MD5, SHA-1, SHA-256, SHA-512, CRC32), worked out on demand with progress,
// a Cancel button, and a box to compare with a fingerprint you were given.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { copyButton } from "./fileinfoRender.js";

/**
 * @param {string} path
 * @param {{ onChange?: () => void }} [options]
 */
export function hashSection(path, { onChange } = {}) {
  let rows = [];
  let taskId = "";
  let timer = 0;
  let stopped = false;

  const status = h("p", { class: "fi-hash-status", role: "status", "aria-live": "polite" });
  const progress = h("progress", { class: "fi-progress", max: "100", value: "0", hidden: true, "aria-label": "How far the fingerprints are" });
  const results = h("div", { class: "fi-hash-results" });
  const compareResult = h("p", { class: "fi-compare-result", role: "status", "aria-live": "polite" });
  const input = h("input", { type: "text", class: "text-input fi-compare-input", spellcheck: "false", autocomplete: "off", placeholder: "Paste a fingerprint, like sha256:9f86d0…", "aria-label": "A fingerprint to compare with", title: "Paste the fingerprint from the download page. Spaces, capitals and a name like sha256: in front are fine." });
  const compare = h("button", { type: "button", class: "btn", disabled: true, title: "Check whether the fingerprint you pasted matches this file", onclick: () => check() }, "Compare");
  const comparer = h("div", { class: "fi-compare", hidden: true }, input, compare, compareResult);
  const cancel = h("button", { type: "button", class: "btn", hidden: true, title: "Stop working out the fingerprints", onclick: () => stop() }, "Cancel");
  const start = h("button", { type: "button", class: "btn", title: "Work out MD5, SHA-1, SHA-256, SHA-512 and CRC32 of this file. Big files take a while; you can cancel.", onclick: () => begin() }, "Calculate fingerprints");

  input.addEventListener("input", () => (compare.disabled = !input.value.trim() || !rows.length));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !compare.disabled) {
      e.preventDefault();
      check();
    }
  });

  function draw() {
    results.replaceChildren();
    if (!rows.length) return;
    results.append(h("table", { class: "fi-table fi-hash-table" },
      h("caption", { class: "sr-only" }, "Fingerprints of the file"),
      h("colgroup", {}, h("col", { class: "fi-col-label" }), h("col", {}), h("col", { class: "fi-col-act" })),
      h("thead", { class: "sr-only" }, h("tr", {}, h("th", { scope: "col" }, "Kind"), h("th", { scope: "col" }, "Fingerprint"), h("th", { scope: "col" }, "Copy"))),
      h("tbody", {}, rows.map((r) => h("tr", { class: "fi-row" }, h("th", { scope: "row", class: "fi-label", title: r.hint }, r.label), h("td", { class: "fi-value fi-mono" }, r.value), h("td", { class: "fi-act" }, copyButton(r.label, () => r.value)))))));
  }

  async function begin() {
    stopped = false;
    start.disabled = true;
    cancel.hidden = false;
    progress.hidden = false;
    progress.value = 0;
    status.textContent = "Working it out…";
    compareResult.textContent = "";
    try {
      taskId = (await call("info/hash", { path })).task.id;
    } catch (err) {
      finish(err instanceof ApiError ? err.message : "That didn't start.");
      return;
    }
    poll();
  }

  async function poll() {
    clearTimeout(timer);
    if (stopped) return;
    let task;
    try {
      task = (await call("info/task", { id: taskId })).task;
    } catch (err) {
      return finish(err instanceof ApiError ? err.message : "Lost track of the job.");
    }
    if (task.state === "running") {
      progress.max = Math.max(1, task.total);
      progress.value = task.done;
      status.textContent = task.total ? `Working it out… ${Math.floor((task.done / task.total) * 100)}%` : "Working it out…";
      timer = setTimeout(poll, 250);
    } else if (task.state === "done") {
      rows = task.result.rows;
      finish(`Done. ${rows.length} fingerprints of ${task.result.size.toLocaleString("en-US")} bytes.`);
      comparer.hidden = false;
      compare.disabled = !input.value.trim();
      draw();
      onChange?.();
    } else finish(task.state === "cancelled" ? "Stopped." : task.error || "That didn't work.");
  }

  function finish(message) {
    clearTimeout(timer);
    start.disabled = false;
    start.textContent = rows.length ? "Calculate again" : "Calculate fingerprints";
    cancel.hidden = true;
    progress.hidden = true;
    status.textContent = message;
  }

  function stop() {
    stopped = true;
    if (taskId) call("info/cancel", { id: taskId }).catch(() => {});
    finish("Stopped.");
  }

  async function check() {
    compareResult.textContent = "";
    try {
      const r = await call("info/compare", { expected: input.value, rows: rows.map(({ id, value }) => ({ id, value })) });
      compareResult.textContent = `${r.matched ? "✔ Match. " : "✖ No match. "}${r.hint}`;
      compareResult.className = `fi-compare-result ${r.matched ? "fi-good" : "fi-warn"}`;
    } catch (err) {
      compareResult.textContent = err instanceof ApiError ? err.message : "That didn't work.";
      compareResult.className = "fi-compare-result fi-warn";
    }
  }

  const el = h("section", { class: "fi-group fi-hashes", dataset: { group: "hashes" } },
    h("h3", { class: "fi-title", title: "A fingerprint (hash) is a short code worked out from the whole file. Two files with the same fingerprint are the same file, so it proves a download wasn't damaged or changed." }, "Fingerprints (hashes)"),
    h("div", { class: "fi-hash-actions" }, start, cancel, progress), status, results, comparer);

  return {
    el,
    /** The rows for the report (empty until calculated). */
    group: () => ({ id: "hashes", title: "Fingerprints (hashes)", hint: "Short codes worked out from the whole file.", rows: rows.map((r) => ({ label: r.label, value: r.value, hint: r.hint })) }),
    /** Stops any running work (when the window closes). */
    dispose() {
      stopped = true;
      clearTimeout(timer);
      if (taskId && !rows.length) call("info/cancel", { id: taskId }).catch(() => {});
    },
  };
}
