/**
 * API operations of the "Code" power tool, namespaced `code/...`.
 *
 *   code/read     { path, encoding? }                         -> the file's text and details (see CodeFile)
 *   code/chunk    { id, index, text }                         -> { received }   (big text is sent in pieces)
 *   code/save     { path, text | upload, encoding, eol, expected, force } -> { path, size, mtimeMs }
 *   code/saveas   { path, text | upload, encoding, eol, overwrite }       -> { path, size, mtimeMs, created }
 *   code/stat     { paths }                                   -> { stats: [{ path, exists, size, mtimeMs }] }
 *   code/files    { root, hidden? }                           -> { files, truncated, ... }  relative paths
 *   code/search   { root, query, regex, caseSensitive, wholeWord, include?, hidden? } -> { matches, ... }
 *   code/git      { root, action, file? }                     -> status / diff / committed text
 *   code/session  { set? }                                    -> { session }
 *   code/presets/list    { path }                             -> { path, presets, defaultRun, defaultBuild, last }
 *   code/presets/save    { path, scope: "file" | "ext", preset } -> same as list
 *   code/presets/delete  { path, id }                         -> same as list
 *   code/presets/reorder { path, ids, scope? }                -> same as list
 *   code/presets/default { path, id, kind: "run" | "build" }  -> same as list
 *   code/presets/ran     { path, id }                         -> same as list (counts a run; the page does the running)
 *   code/presets/move    { from, to }                         -> { moved }
 *   code/presets/export  {}                                   -> { data }
 *   code/presets/import  { data, mode: "merge" | "replace" }  -> { imported, skipped, files, types }
 *   code/root            { path }                             -> { root }  nearest project folder, or ""
 *   code/format          { tool: "v", text }                  -> { available, formatted, text | problem | message }  runs `v fmt` (argv only)
 *   code/formatter       {}                                   -> { available, version }  is V installed?
 *   code/prettify        { mode?: "prettify" | "minify", text, path?, lang?, tabWidth?, useTabs? } -> { formatted, text, engine, basic?, message? | problem: { message, line?, col? } }
 */
import type { FmHandler } from "./fmCore";
import { minify, prettify } from "../../shared/code_prettify";
import { formatWithTool, vVersion } from "./fmCodeFormat";
import { readCodeFile, saveCodeFile, saveCodeFileAs, statFiles, uploadChunk } from "./fmCodeFiles";
import { gitInfo } from "./fmCodeGit";
import { deletePreset, exportPresets, findProjectRoot, importPresets, listPresets, movePresets, recordRun, reorderPresets, savePreset, setDefaultPreset } from "./fmCodePresets";
import { FmError } from "./fmPaths";
import { findInFiles, listWorkspaceFiles } from "./fmCodeSearch";
import { loadCodeSession, updateCodeSession } from "./fmCodeSession";

export const codeOperations: Record<string, FmHandler> = {
  async "code/read"(ctx, b) {
    return { file: await readCodeFile(ctx, b.path, b.encoding) };
  },
  async "code/chunk"(ctx, b) {
    return uploadChunk(ctx, b);
  },
  async "code/save"(ctx, b) {
    return await saveCodeFile(ctx, b);
  },
  async "code/saveas"(ctx, b) {
    return await saveCodeFileAs(ctx, b);
  },
  async "code/stat"(ctx, b) {
    return { stats: await statFiles(ctx, b.paths) };
  },
  async "code/files"(ctx, b) {
    return { ...(await listWorkspaceFiles(ctx, b.root, { hidden: b.hidden === true })) };
  },
  async "code/search"(ctx, b) {
    return { ...(await findInFiles(ctx, b)) };
  },
  async "code/git"(ctx, b) {
    return await gitInfo(ctx, b);
  },
  async "code/session"(ctx, b) {
    return { session: b.set !== undefined ? await updateCodeSession(ctx, b.set) : await loadCodeSession(ctx) };
  },
  async "code/presets/list"(ctx, b) {
    return { ...(await listPresets(ctx, b)) };
  },
  async "code/presets/save"(ctx, b) {
    return { ...(await savePreset(ctx, b)) };
  },
  async "code/presets/delete"(ctx, b) {
    return { ...(await deletePreset(ctx, b)) };
  },
  async "code/presets/reorder"(ctx, b) {
    return { ...(await reorderPresets(ctx, b)) };
  },
  async "code/presets/default"(ctx, b) {
    return { ...(await setDefaultPreset(ctx, b)) };
  },
  async "code/presets/ran"(ctx, b) {
    return { ...(await recordRun(ctx, b)) };
  },
  async "code/presets/move"(ctx, b) {
    return await movePresets(ctx, b);
  },
  async "code/presets/export"(ctx) {
    return await exportPresets(ctx);
  },
  async "code/presets/import"(ctx, b) {
    return await importPresets(ctx, b);
  },
  async "code/root"(ctx, b) {
    return await findProjectRoot(ctx, b);
  },
  async "code/format"(ctx, b) {
    return { ...(await formatWithTool(ctx, b)) };
  },
  async "code/prettify"(_ctx, b) {
    if (typeof b.text !== "string") throw new FmError("BAD_REQUEST", "There is no text to format.");
    const input = { text: b.text, path: typeof b.path === "string" ? b.path : undefined, lang: typeof b.lang === "string" ? b.lang : undefined, tabWidth: typeof b.tabWidth === "number" ? b.tabWidth : undefined, useTabs: b.useTabs === true };
    // `formatted`, not `ok`: the reply envelope already uses `ok` for "the request worked".
    const { ok, error, ...rest } = b.mode === "minify" ? await minify(input) : await prettify(input);
    return { formatted: ok, problem: error, ...rest };
  },
  async "code/formatter"(ctx) {
    return await vVersion(ctx);
  },
};
