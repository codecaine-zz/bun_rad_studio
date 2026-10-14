// Burying from the file list: right-click "Bury (Rip)", the Bury shortcut, and Delete when Settings says to use the
// graveyard. Burying moves things into the Rip graveyard, which can always be undone (Ctrl/⌘+Z) and is shared with Rip
// Studio. This module sits below ops.js (which uses it), so it asks for Undo steps by event instead of importing ops.js.
import { ApiError, call } from "./api.js";
import { toast } from "./menus.js";
import { busy, refresh } from "./nav.js";
import { openPower } from "./power.js";
import { emit, on, state } from "./state.js";
import { plural } from "./util.js";

const modKey = () => (state.platform === "darwin" ? "⌘" : "Ctrl+");

/** Asks the Graveyard tab to open (it also reloads itself when shown). */
export function openGraveyard() {
  openPower("grave");
}

function say(err) {
  return err instanceof ApiError ? err.message : "That didn't work.";
}

/**
 * Buries the items at `paths` and tells the person what happened. Items that live on another disk are copied by a
 * background task (see the task list) and can't be undone from here; they can be restored from the Graveyard tab.
 */
export async function buryItems(paths) {
  if (!paths.length) return;
  let res;
  try {
    res = await busy(() => call("grave/bury", { paths }));
  } catch (err) {
    return toast(say(err), { kind: "error" });
  }
  const done = res.results.filter((r) => r.ok).map((r) => r.value);
  const problems = [...new Set(res.results.filter((r) => !r.ok).map((r) => r.message))];
  if (res.job) emit("job-started", res.job);
  if (done.length) {
    const ids = done.map((d) => d.id);
    emit("undo-push", {
      label: `burial of ${plural(done.length, "item")}`,
      run: async () => {
        const back = await call("grave/restore", { ids });
        const bad = back.results.find((r) => !r.ok);
        if (bad) throw new Error(bad.message);
      },
    });
    const queued = res.queued ? ` ${plural(res.queued, "more item")} ${res.queued === 1 ? "is" : "are"} being copied; watch the task list.` : "";
    toast(`Buried ${plural(done.length, "item")}. Press ${modKey()}Z to undo.${queued}`, { kind: "success", action: { label: "Open Graveyard", run: openGraveyard } });
  } else if (res.queued) {
    toast(`${plural(res.queued, "item")} ${res.queued === 1 ? "is" : "are"} on another disk, so ${res.queued === 1 ? "it is" : "they are"} being copied to the graveyard. Watch the task list.`, { kind: "info", action: { label: "Open Graveyard", run: openGraveyard } });
  }
  if (problems.length) toast(problems.length === 1 ? problems[0] : `${plural(problems.length, "item")} couldn't be buried: ${problems[0]}`, { kind: "error" });
  emit("grave-changed");
  await refresh({ keepSelection: false });
}

// A background burial or restore that finished: what is listed on screen has changed.
on("grave-job-done", () => {
  emit("grave-changed");
  return refresh({ keepSelection: false });
});
