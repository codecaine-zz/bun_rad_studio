// Talking to the server for the Code tab: reading and saving files (big text goes up in pieces, because one request
// may be at most 1 MB), the workspace file list, searching, Git, and the remembered session. Nothing here touches the page.
import { call } from "./api.js";

const CHUNK = 100_000;

const randomId = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `up-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
};

/** Reads a file: { path, name, text, encoding, eol, mixedEol, size, mtimeMs, truncated, symlink, writable }. */
export async function readFile(path, encoding) {
  return (await call("code/read", encoding ? { path, encoding } : { path })).file;
}

/**
 * Saves text. `op` is "code/save" (a file opened from disk) or "code/saveas" (a typed path). Text over 100,000
 * characters is sent in pieces first, then referred to by an upload id.
 */
export async function writeText(op, body) {
  const { text, ...rest } = body;
  if (text.length <= CHUNK) return await call(op, { ...rest, text });
  const id = randomId();
  for (let at = 0, index = 0; at < text.length; at += CHUNK, index++) await call("code/chunk", { id, index, text: text.slice(at, at + CHUNK) });
  return await call(op, { ...rest, upload: id });
}

export const statFiles = async (paths) => (paths.length ? (await call("code/stat", { paths })).stats : []);
export const workspaceFiles = (root, hidden) => call("code/files", { root, hidden });
export const searchFiles = (body) => call("code/search", body);
export const gitCall = (body) => call("code/git", body);
export const loadSession = async () => (await call("code/session", {})).session;
export const saveSession = (set) => call("code/session", { set });
export const projectRoot = async (path) => (await call("code/root", { path })).root;

export const listPresets = (path) => call("code/presets/list", { path });
export const savePreset = (path, scope, preset) => call("code/presets/save", { path, scope, preset });
export const deletePreset = (path, id) => call("code/presets/delete", { path, id });
export const reorderPresets = (path, ids, scope) => call("code/presets/reorder", { path, ids, scope });
export const setDefaultPreset = (path, id, kind) => call("code/presets/default", { path, id, kind });
export const recordRun = (path, id) => call("code/presets/ran", { path, id });
export const movePresets = (from, to) => call("code/presets/move", { from, to });
export const exportPresets = async () => (await call("code/presets/export", {})).data;
export const importPresets = (data, mode) => call("code/presets/import", { data, mode });

/** Formats V source with `v fmt` on the server: { available, formatted, text | problem | message }. */
export const formatV = (text) => call("code/format", { tool: "v", text });
