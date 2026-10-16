// "Format document" and "Minify" for the Code tab. The server does the work (Prettier, sql-formatter, or the language's own
// formatter when it is installed) on the text it is sent; nothing is written to the person's file. The editor gets the new text
// through its normal edit path, so Undo takes it back. If the server can't be reached, the older built-in tidy-up runs instead.
import { prettifyCode } from "./codeIO.js";

/** `app`: { ed(), doc(), unit(), toast }. mode: "prettify" or "minify". `fallback` runs when the server can't be asked. */
export async function prettifyDoc(app, mode, fallback) {
  const editor = app.ed();
  const doc = app.doc();
  if (!editor || !doc) return;
  const before = editor.getText();
  const { start, end } = editor.getSelection();
  const unit = app.unit();
  const useTabs = unit.includes("\t");
  const word = mode === "minify" ? "Minifying" : "Formatting";
  app.toast(`${word}…`, { kind: "info", timeout: 1200 });
  let r;
  try {
    r = await prettifyCode({ mode, text: before, path: doc.path || doc.name || "", lang: doc.lang, useTabs, tabWidth: useTabs ? 4 : unit.length || 2 });
  } catch (err) {
    if (fallback) return fallback();
    return void app.toast(err?.message || `${word} didn't work.`, { kind: "error" });
  }
  if (!r.formatted) {
    const e = r.problem || { message: `${word} didn't work.` };
    app.toast(`${e.message}${e.line ? ` (line ${e.line}, column ${e.col ?? 1})` : ""}`, { kind: "error", timeout: 9000 });
    if (e.line) editor.goTo(e.line, Math.max(1, e.col ?? 1));
    return;
  }
  if (editor.getText() !== before) return void app.toast("The text changed while it was being worked on, so nothing was replaced. Try again.", { kind: "info" });
  if (r.text === before) return void app.toast(mode === "minify" ? "It is already as small as it gets." : "Nothing needed changing.");
  editor.apply({ from: 0, to: before.length, insert: r.text, selStart: Math.min(start, r.text.length), selEnd: Math.min(end, r.text.length) });
  app.toast(r.basic ? r.message : `${mode === "minify" ? "Minified" : "Formatted"} with ${r.engine}.`, { kind: r.basic ? "info" : "success", timeout: r.basic ? 8000 : 2500 });
}
