// The colour converter: type any CSS colour and see it, with every common way to write it, each with its own Copy button.
import { call } from "./api.js";
import { clear, h } from "./dom.js";
import { actionButton, attempt, card, copyCell, lineBox, statusLine } from "./crypto_ui.js";

const SAMPLE = "rebeccapurple";

/** Builds the colour converter card. Returns { cards, clear() }. */
export function buildColorCards(env) {
  const text = lineBox({ label: "Colour", tip: "Type a colour the way a web page writes it: a name (tomato), hex (#ff6347 or #f63), rgb(255 99 71), hsl(9 100% 64%), lab() or oklch(). Capitals and extra spaces are fine.", placeholder: SAMPLE, width: "crypto-wide" });
  const status = statusLine();
  // The colour is applied with the CSS object model (not by writing a style attribute), so the swatch follows what the browser really understands.
  const swatch = h("div", { class: "crypto-swatch-colour", "aria-hidden": "true", title: "The colour you typed. A chequered background shows through when it is partly transparent." });
  const preview = h("div", { class: "crypto-swatch", role: "img", "aria-label": "Colour preview", hidden: true }, swatch);
  const notes = h("ul", { class: "crypto-list pw-hint", "data-copy": "Colour notes", hidden: true });
  const table = h("div", { class: "crypto-colortable" });

  function draw(r) {
    swatch.style.setProperty("background-color", r.swatch);
    preview.hidden = false;
    preview.setAttribute("aria-label", `Colour preview: ${r.input}`);
    clear(notes).append(...r.notes.map((n) => h("li", {}, n)));
    notes.hidden = r.notes.length === 0;
    clear(table).append(h("div", { class: "pw-table-wrap" },
      h("table", { class: "pw-table crypto-colors" },
        h("caption", { class: "crypto-caption" }, `${r.input} written in every common form`),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Form"), h("th", { scope: "col" }, "Value"), h("th", { scope: "col", "data-copy-ui": "" }, "Copy"))),
        h("tbody", {}, r.rows.map((row) => h("tr", {},
          h("th", { scope: "row", title: row.hint }, row.label),
          h("td", { class: "pw-mono crypto-digest" }, row.value),
          copyCell(`the ${row.label} form`, () => row.value)))))));
  }

  const show = actionButton("Show all forms", "Read the colour and show it in every common form: CSS, hex, rgb, hsl, lab, a number, code objects and terminal colours.", async () => {
    const r = await attempt(show, status, () => call("crypto/color", { text: text.input.value || SAMPLE }));
    if (!r) {
      preview.hidden = true;
      clear(table);
      notes.hidden = true;
      return env.log("Colour converter", "failed");
    }
    draw(r);
    env.setLast(r.rows.map((x) => `${x.label}  ${x.value}`).join("\n"));
    status.set(`Read “${r.input}”: ${r.rows.length} forms are shown below.`, "ok");
    env.log("Colour converter", `${r.rows.length} forms`);
  }, { primary: true });
  text.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      show.click();
    }
  });

  const colorCard = card("Colour converter", "Type any colour you could use on a web page and see it in every form other tools ask for: the shortest CSS, hex, rgb, hsl, lab, a plain number, code objects and terminal colour codes. It is worked out on your computer with Bun's built-in colour reader.",
    text.el, h("div", { class: "pw-row" }, show), status.el, preview, notes, table);

  return {
    cards: [colorCard],
    clear() {
      text.input.value = "";
      status.set("");
      preview.hidden = true;
      notes.hidden = true;
      clear(table);
      swatch.style.removeProperty("background-color");
    },
  };
}
