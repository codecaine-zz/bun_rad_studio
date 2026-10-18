// The open documents of the Code tab: what is open, what changed, saving, and the remembered session
// (open tabs, cursor positions, settings, recent files, bookmarks). No page code: the editor and tabs are drawn elsewhere.
import { detectIndent, detectLanguage } from "./codeLogic.js";
import { loadSession, readFile, saveSession, statFiles, writeText } from "./codeIO.js";

export const MAX_DOCS = 40;
export const DEFAULT_SETTINGS = { theme: "auto", fontSize: 14, wrap: false, lineNumbers: true, minimap: false, whitespace: false, indentGuides: true, ruler: false, wordHighlight: true, autosave: false, autosaveDelay: 1500, autosaveOnBlur: true, tabSize: 2, showHidden: false, explorer: true, completion: true, autoOpen: true, recentsEnabled: true };

let nextId = 1;
let untitled = 0;

function recordSnapshot(doc, label = "Saved") {
  if (!doc || doc.kind === "diff") return null;
  doc.history ??= [];
  const last = doc.history[doc.history.length - 1];
  if (last && last.text === doc.text && label !== "Manual snapshot") return last;
  const now = new Date();
  const timeLabel = now.toTimeString().slice(0, 8);
  const snap = {
    id: `${Date.now()}-${doc.history.length + 1}`,
    label,
    text: doc.text,
    at: now.toISOString(),
    timeLabel,
  };
  doc.history.push(snap);
  if (doc.history.length > 30) doc.history.shift();
  return snap;
}

function fromFile(file) {
  const doc = {
    id: nextId++, kind: "file", path: file.path, name: file.name, text: file.text, savedText: file.text, encoding: file.encoding, savedEncoding: file.encoding, savedEol: file.eol, guessed: file.guessed, eol: file.eol, mixedEol: file.mixedEol,
    mtimeMs: file.mtimeMs, size: file.size, truncated: file.truncated, symlink: file.symlink, writable: file.writable, readOnly: file.truncated,
    lang: detectLanguage(file.name, file.text.slice(0, 200)), indent: indentFor(detectLanguage(file.name, file.text.slice(0, 200)), file.text), line: 1, col: 1, scrollTop: 0, bookmarks: [], history: [], editor: null, external: "", langPinned: false,
  };
  if (file.path) recordSnapshot(doc, "Initial open");
  return doc;
}

export const isDirty = (doc) => doc.kind !== "diff" && (doc.text !== doc.savedText || doc.eol !== doc.savedEol || doc.encoding !== doc.savedEncoding);

/** V's own formatter indents with tabs, so a V file with no indentation yet starts out using tabs. */
export function indentFor(lang, text) {
  const found = detectIndent(text);
  return lang === "v" && found.size === null ? { useTabs: true, size: null } : found;
}

/** The folder part of a path (works for both kinds of separators). */
export const folderOf = (path) => path.slice(0, Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")));

export function createDocs() {
  const docs = [];
  const listeners = new Set();
  let activeId = 0;
  let session = { version: 1, root: "", tabs: [], active: "", settings: { ...DEFAULT_SETTINGS }, recents: [], bookmarks: {} };
  let persistTimer = 0;
  const reading = new Map();

  const emit = (kind) => listeners.forEach((fn) => fn(kind));
  const byId = (id) => docs.find((d) => d.id === id);

  function remember(path) {
    if (session.settings.recentsEnabled === false) return;
    session.recents = [{ path, at: new Date().toISOString() }, ...session.recents.filter((r) => r.path !== path)].slice(0, 30);
  }

  const api = {
    list: () => docs,
    get: byId,
    byPath: (path) => docs.find((d) => d.path === path),
    get active() { return byId(activeId) ?? null; },
    get session() { return session; },
    get settings() { return session.settings; },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit,
    anyDirty: () => docs.some(isDirty),
    snapshot(doc = api.active, label = "Manual snapshot") {
      const snap = recordSnapshot(doc, label);
      if (snap) emit("meta");
      return snap;
    },

    activate(id) {
      if (!byId(id) || id === activeId) return;
      activeId = id;
      emit("active");
      api.persist();
    },

    /** Opens a file (or switches to it when it is already open). Throws an ApiError with a plain message when it can't be read. */
    async openPath(path, { line = 1, col = 1 } = {}) {
      const open = api.byPath(path);
      if (open) {
        open.line = line;
        open.col = col;
        api.activate(open.id);
        emit("goto");
        return open;
      }
      if (docs.length >= MAX_DOCS) throw Object.assign(new Error(`${MAX_DOCS} files are already open. Close some first.`), { friendly: true });
      if (reading.has(path)) {
        await reading.get(path).catch(() => {});
        return api.openPath(path, { line, col });
      }
      const pending = readFile(path);
      reading.set(path, pending);
      let file;
      try {
        file = await pending;
      } finally {
        reading.delete(path);
      }
      const doc = fromFile(file);
      doc.line = line;
      doc.col = col;
      doc.bookmarks = [...(session.bookmarks[path] ?? [])];
      docs.push(doc);
      remember(path);
      activeId = doc.id;
      emit("tabs");
      emit("goto");
      api.persist();
      return doc;
    },

    newUntitled(text = "") {
      const doc = { ...fromFile({ path: "", name: `Untitled-${++untitled}`, text, encoding: "utf-8", guessed: false, eol: "lf", mixedEol: false, mtimeMs: 0, size: 0, truncated: false, symlink: false, writable: true }), kind: "untitled", savedText: "", history: [] };
      if (text) recordSnapshot(doc, "Initial draft");
      docs.push(doc);
      activeId = doc.id;
      emit("tabs");
      return doc;
    },

    /** A read-only view (like a Git diff) that isn't a file. */
    openView(title, text, lang) {
      const existing = docs.find((d) => d.kind === "diff" && d.name === title);
      if (existing) {
        existing.text = existing.savedText = text;
        existing.reloadView = true;
        activeId = existing.id;
        emit("tabs");
        emit("reload");
        return existing;
      }
      const doc = { ...fromFile({ path: "", name: title, text, encoding: "utf-8", guessed: false, eol: "lf", mixedEol: false, mtimeMs: 0, size: 0, truncated: false, symlink: false, writable: false }), kind: "diff", lang, readOnly: true };
      docs.push(doc);
      activeId = doc.id;
      emit("tabs");
      return doc;
    },

    close(id) {
      const i = docs.findIndex((d) => d.id === id);
      if (i < 0) return;
      const [doc] = docs.splice(i, 1);
      doc.editor?.destroy();
      doc.editor = null;
      if (activeId === id) activeId = (docs[i] ?? docs[i - 1])?.id ?? 0;
      emit("tabs");
      emit("active");
      api.persist();
    },

    /** Saves a file opened from disk. `force` writes even if the file changed on disk. Throws ApiError (code CHANGED_ON_DISK, GONE, IS_LINK ...). */
    async save(doc, { force = false, auto = false } = {}) {
      const { text, eol, encoding } = doc;
      const r = await writeText("code/save", { path: doc.path, text, encoding, eol, expected: { mtimeMs: doc.mtimeMs, size: doc.size }, force });
      // An autosave is marked in the same step as the save itself, so the status line never shows "Saved" in between.
      Object.assign(doc, { savedText: text, savedEol: eol, savedEncoding: encoding, mtimeMs: r.mtimeMs, size: r.size, external: "", mixedEol: false, guessed: false }, auto ? { autoSavedText: text } : {});
      recordSnapshot(doc, auto ? "Autosaved" : "Saved");
      emit("saved");
      return r;
    },

    /** Saves to a typed path and turns the document into that file. Throws ApiError (code EXISTS when it would replace something). */
    async saveAs(doc, path, { overwrite = false } = {}) {
      const { text, eol, encoding } = doc;
      const r = await writeText("code/saveas", { path, text, encoding, eol, overwrite });
      const was = doc.path;
      doc.path = r.path;
      doc.name = r.path.slice(Math.max(r.path.lastIndexOf("/"), r.path.lastIndexOf("\\")) + 1);
      doc.kind = "file";
      Object.assign(doc, { savedText: text, savedEol: eol, savedEncoding: encoding, mtimeMs: r.mtimeMs, size: r.size, external: "", truncated: false, readOnly: false, mixedEol: false, guessed: false });
      if (!doc.langPinned) doc.lang = detectLanguage(doc.name, text.slice(0, 200));
      doc.indent = indentFor(doc.lang, text);
      recordSnapshot(doc, "Saved as");
      remember(r.path);
      emit("tabs");
      emit("saved");
      api.persist();
      return { ...r, was };
    },

    /** Reads the file again (optionally as another encoding), dropping unsaved changes. */
    async reload(doc, encoding) {
      const file = await readFile(doc.path, encoding);
      Object.assign(doc, { text: file.text, savedText: file.text, encoding: file.encoding, savedEncoding: file.encoding, savedEol: file.eol, guessed: file.guessed, eol: file.eol, mixedEol: file.mixedEol, mtimeMs: file.mtimeMs, size: file.size, truncated: file.truncated, readOnly: file.truncated, external: "" });
      recordSnapshot(doc, "Reloaded from disk");
      emit("reload");
      emit("saved");
    },

    /** A file or folder was renamed or moved: open documents under it follow. Returns the documents that changed. */
    pathMoved(from, to) {
      const changed = [];
      for (const d of docs) {
        if (d.path === from || (d.path.startsWith(from) && /[\\/]/.test(d.path[from.length] ?? ""))) {
          const old = d.path;
          d.path = to + d.path.slice(from.length);
          d.name = d.path.slice(Math.max(d.path.lastIndexOf("/"), d.path.lastIndexOf("\\")) + 1);
          if (!d.langPinned) d.lang = detectLanguage(d.name, d.text.slice(0, 200));
          if (session.bookmarks[old]) {
            session.bookmarks[d.path] = session.bookmarks[old];
            delete session.bookmarks[old];
          }
          changed.push(d);
        }
      }
      if (changed.length) {
        emit("tabs");
        api.persist();
      }
      return changed;
    },

    /** Compares open files with the disk. Clean files that changed are reloaded quietly; the rest are marked. */
    async checkExternal() {
      const files = docs.filter((d) => d.kind === "file" && d.path);
      let stats;
      try {
        stats = await statFiles(files.map((d) => d.path));
      } catch {
        return { reloaded: [], changed: [], deleted: [] };
      }
      const out = { reloaded: [], changed: [], deleted: [] };
      for (const s of stats) {
        const d = files.find((x) => x.path === s.path);
        if (!d) continue;
        if (!s.exists) {
          if (d.external !== "deleted") out.deleted.push(d);
          d.external = "deleted";
        } else if (Math.abs(s.mtimeMs - d.mtimeMs) > 1 || s.size !== d.size) {
          if (!isDirty(d) && !d.truncated) {
            try {
              await api.reload(d);
              out.reloaded.push(d);
            } catch {
              d.external = "changed";
            }
          } else if (d.external !== "changed") {
            d.external = "changed";
            out.changed.push(d);
          }
        } else if (d.external === "deleted") d.external = "";
      }
      if (out.deleted.length || out.changed.length) emit("meta");
      return out;
    },

    // -- the remembered session --------------------------------------------------------------------------------

    async loadSession() {
      try {
        session = { ...session, ...(await loadSession()) };
        session.settings = { ...DEFAULT_SETTINGS, ...session.settings };
      } catch {
        // a first run, or the server has no saved session: defaults are fine
      }
      return session;
    },

    /** Opens the tabs the last session had open (files that are gone are skipped). Returns how many could not be opened. */
    async restoreTabs() {
      let failed = 0;
      for (const t of session.tabs) {
        try {
          const doc = await api.openPath(t.path, { line: t.line, col: t.col });
          doc.scrollTop = t.scrollTop;
        } catch {
          failed++;
        }
      }
      const active = api.byPath(session.active);
      if (active) api.activate(active.id);
      return failed;
    },

    setSetting(key, value) {
      session.settings = { ...session.settings, [key]: value };
      api.persist();
      emit("settings");
    },

    setRoot(root) {
      session.root = root;
      api.persist();
    },

    removeRecent(path) {
      const before = session.recents.length;
      session.recents = session.recents.filter((r) => r.path !== path);
      if (session.recents.length !== before) {
        api.persist();
        emit("recents");
      }
    },

    clearRecents() {
      if (!session.recents.length) return;
      session.recents = [];
      api.persist();
      emit("recents");
    },

    setRecentsEnabled(enabled) {
      session.settings = { ...session.settings, recentsEnabled: Boolean(enabled) };
      api.persist();
      emit("settings");
      emit("recents");
    },

    setBookmarks(doc, list) {
      doc.bookmarks = list;
      if (doc.path) {
        if (list.length) session.bookmarks[doc.path] = list;
        else delete session.bookmarks[doc.path];
        api.persist();
      }
      emit("bookmarks");
    },

    /** Writes the session soon (many changes in a row become one write). */
    persist() {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => api.persistNow(), 800);
    },

    persistNow() {
      clearTimeout(persistTimer);
      const tabs = docs.filter((d) => d.kind === "file" && d.path).map((d) => ({ path: d.path, line: d.line, col: d.col, scrollTop: Math.round(d.scrollTop) }));
      const active = api.active?.path ?? "";
      return saveSession({ root: session.root, tabs, active, settings: session.settings, recents: session.recents, bookmarks: session.bookmarks }).catch(() => {});
    },
  };
  return api;
}
