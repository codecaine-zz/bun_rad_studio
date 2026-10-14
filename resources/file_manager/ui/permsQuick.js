// The quick permission actions in the right-click menu: Make executable, Remove execute, and Permissions…
// (which opens the Properties window at its permissions section). They ask the server like the full section does,
// and every change is one step of Undo.
import { ApiError, call } from "./api.js";
import { confirmBox } from "./dialogs.js";
import { showProperties } from "./extras.js";
import { toast } from "./menus.js";
import { busy, refresh } from "./nav.js";
import { emit, inTrash, state } from "./state.js";
import { plural } from "./util.js";

const isPlainFile = (e) => !e.isDir && !e.isSymlink;
const knownMode = (e) => typeof e.mode === "number";

async function ask(err, what) {
  const risks = err.details?.risks ?? [];
  return await confirmBox({ title: "Are you sure?", message: `${what} needs your confirmation. Please check this first:`, details: risks.map((r) => r.message), confirmLabel: "Change permissions", danger: true });
}

/** Changes the run permission of the plain files among `entries` ("a+x" or "a-x"). */
export async function quickRun(entries, symbolic) {
  const files = entries.filter(isPlainFile);
  if (!files.length) return;
  const adding = symbolic === "a+x";
  const body = { paths: files.map((e) => e.path), change: { symbolic } };
  let result;
  try {
    try {
      result = (await busy(() => call("perms/apply", body))).result;
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== "NEEDS_CONFIRM") throw err;
      if (!(await ask(err, adding ? "Making this executable" : "Removing execute"))) return;
      result = (await busy(() => call("perms/apply", { ...body, confirmed: true }))).result;
    }
  } catch (err) {
    toast(err instanceof ApiError ? err.message : "That didn't work.", { kind: "error" });
    return;
  }
  const n = result.counts.changed;
  const what = adding ? "executable" : "not executable";
  if (result.undo) {
    const id = result.undo.id;
    emit("undo-push", {
      label: `${adding ? "make executable" : "remove execute"} (${plural(n, "file")})`,
      run: async () => {
        await call("perms/undo", { undo: id });
      },
    });
  }
  if (result.counts.failed) toast(result.problems[0]?.reason ?? "Some files couldn't be changed.", { kind: "error" });
  else toast(n ? `${plural(n, "file")} ${n === 1 ? "is" : "are"} now ${what}.` : `Nothing needed changing: ${files.length === 1 ? "it was" : "they were"} already ${what}.`, { kind: "success" });
  await refresh().catch(() => {});
}

/** The menu items for the chosen entries. */
export function permissionItems(entries) {
  if (inTrash() || !entries.length) return [];
  const files = entries.filter(isPlainFile);
  const unix = state.platform !== "win32";
  const canMake = unix && files.some((e) => !knownMode(e) || (e.mode & 0o111) !== 0o111);
  const canRemove = unix && files.some((e) => !knownMode(e) || (e.mode & 0o111) !== 0);
  return [
    canMake ? { label: "Make executable", icon: "▶️", tip: "Lets the chosen files run as programs or scripts. Folders are left alone.", action: () => quickRun(entries, "a+x") } : null,
    canRemove ? { label: "Remove execute", icon: "⏹️", tip: "Stops the chosen files from running as programs. Folders are left alone.", action: () => quickRun(entries, "a-x") } : null,
    { label: "Permissions…", icon: "🔐", tip: "See and change who can read, write or run these items.", action: () => showProperties(entries.map((e) => e.path), { section: "permissions" }) },
  ];
}
