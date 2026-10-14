// Progress and results of a lock or unlock job, shared by both dialogs. It asks the server how the job is going a few
// times a second, shows each item's state in words, and can cancel the job.
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { formatSize, plural } from "./util.js";

const PHASES = {
  scanning: "Looking at what to lock…",
  deriving: "Making the key from your password. This is slow on purpose, to protect you…",
  encrypting: "Encrypting…",
  verifying: "Checking the encrypted copy…",
  decrypting: "Decrypting…",
  finishing: "Finishing…",
  idle: "",
};

const STATE_TEXT = { waiting: "Waiting", working: "Working…", cancelled: "Cancelled" };

/** One line for one item, in words. */
export function itemText(item, kind) {
  if (item.state === "done") {
    const verb = kind === "encrypt" ? "Locked as" : "Unlocked as";
    const size = kind === "encrypt" && item.cipherBytes ? ` (${formatSize(item.cipherBytes)})` : "";
    return `${verb} ${item.outputName}${size}`;
  }
  if (item.state === "error") return `Didn't work: ${item.error?.message ?? "something went wrong."}`;
  return STATE_TEXT[item.state] ?? item.state;
}

/**
 * Shows a running job. Calls `onDone(task)` once when it has finished (done, failed or cancelled).
 * @param {{ task: any, kind: "encrypt" | "decrypt", onDone: (task: any) => void }} options
 */
export function runView({ task, kind, onDone }) {
  let version = -1;
  let stopped = false;
  let timer = 0;
  const bar = h("progress", { class: "vault-progress", max: "100", "aria-label": "Progress of the whole job", title: "How much of the work is done." });
  const status = h("p", { class: "vault-status", role: "status", "aria-live": "polite" });
  const list = h("ul", { class: "vault-results", "aria-label": "Each item" });
  const cancel = h("button", { type: "button", class: "btn", title: "Stop now. Nothing half-finished is kept, and your originals are never changed.", onclick: onCancel }, "Cancel");
  const el = h("div", { class: "vault-run" }, status, bar, list, h("div", { class: "dialog-buttons" }, cancel));

  async function onCancel() {
    cancel.disabled = true;
    try {
      await call("vault/cancel", { id: task.id });
    } catch {
      // the job may have just finished
    }
  }

  function render(t) {
    const verbing = kind === "encrypt" ? "Locking" : "Unlocking";
    const phase = PHASES[t.phase] ?? "";
    status.textContent = t.state === "running" ? `${verbing} ${t.total > 1 ? `${Math.min(t.currentIndex + 1, t.total)} of ${t.total}: ` : ""}${t.current ?? ""} ${phase}`.trim() : "";
    if (t.bytesTotal > 0 && (t.phase === "encrypting" || t.phase === "decrypting")) bar.value = Math.min(100, Math.round((t.bytesDone / t.bytesTotal) * 100));
    else if (t.state !== "running") bar.value = 100;
    else bar.removeAttribute("value");
    list.replaceChildren(...t.items.map((item) => h("li", { class: `vault-item vault-${item.state}` },
      h("span", { class: "vault-item-name" }, item.name),
      h("span", { class: "vault-item-state" }, itemText(item, kind)),
    )));
  }

  async function poll() {
    if (stopped) return;
    try {
      const res = await call("vault/status", { id: task.id, since: version });
      const t = res.task;
      if (!t.unchanged) {
        version = t.version;
        render(t);
      }
      if (t.state !== "running") {
        stopped = true;
        cancel.hidden = true;
        const final = (await call("vault/status", { id: task.id })).task;
        render(final);
        onDone(final);
        return;
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "NOT_FOUND") {
        stopped = true;
        status.textContent = "This job is no longer available.";
        onDone(null);
        return;
      }
    }
    timer = setTimeout(poll, 200);
  }
  render({ ...task, total: task.total ?? task.items.length });
  poll();

  return {
    el,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

/** The sentence that sums a finished job up. */
export function summaryText(task, kind) {
  const ok = task.items.filter((i) => i.state === "done").length;
  const bad = task.items.filter((i) => i.state === "error").length;
  const stopped = task.items.filter((i) => i.state === "cancelled").length;
  const noun = kind === "encrypt" ? "locked" : "unlocked";
  const parts = [];
  if (ok) parts.push(`${plural(ok, "item")} ${noun}`);
  if (bad) parts.push(`${bad} didn't work`);
  if (stopped) parts.push(`${stopped} cancelled`);
  return parts.join(", ") || "Nothing was done.";
}

/** The final list: what happened to each item, with any warnings and what became of the original. */
export function resultList(task, kind) {
  return h("ul", { class: "vault-results", "aria-label": "Results" }, task.items.map((item) => h("li", { class: `vault-item vault-${item.state}` },
    h("span", { class: "vault-item-name" }, item.name),
    h("span", { class: "vault-item-state" }, itemText(item, kind)),
    item.trashed ? h("span", { class: "vault-note" }, kind === "encrypt" ? "The original was moved to the Recycle Bin, so you can still get it back from there." : "The locked file was moved to the Recycle Bin.") : null,
    item.trashMessage ? h("span", { class: "vault-note vault-note-warn" }, item.trashMessage) : null,
    ...(item.warnings ?? []).map((w) => h("span", { class: "vault-note vault-note-warn" }, w)),
  )));
}
