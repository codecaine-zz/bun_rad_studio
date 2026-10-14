// "Format document" for V files: the server runs `v fmt` on a private temporary copy of the text and sends back the
// tidy version (or V's own error message). Nothing is written to the person's file; the editor gets the new text
// through its normal edit path, so Undo takes it back.
import { formatV } from "./codeIO.js";

/** `app`: { ed(), doc(), toast }. Does nothing when the text changed while V was working. */
export async function formatWithV(app) {
  const editor = app.ed();
  if (!editor) return;
  const before = editor.getText();
  const { start, end } = editor.getSelection();
  app.toast("Formatting with v fmt…", { kind: "info", timeout: 1500 });
  let r;
  try {
    r = await formatV(before);
  } catch (err) {
    return void app.toast(err?.message || "v fmt couldn't be run.", { kind: "error" });
  }
  if (!r.available) return void app.toast(r.message, { kind: "error", timeout: 8000 });
  if (!r.formatted) return void app.toast(`v fmt: ${r.problem}`, { kind: "error", timeout: 10000 });
  if (editor.getText() !== before) return void app.toast("The text changed while formatting, so nothing was replaced. Try again.", { kind: "info" });
  if (r.text === before) return void app.toast("Nothing needed changing.");
  editor.apply({ from: 0, to: before.length, insert: r.text, selStart: Math.min(start, r.text.length), selEnd: Math.min(end, r.text.length) });
  app.toast("Formatted with v fmt.", { kind: "success" });
}
