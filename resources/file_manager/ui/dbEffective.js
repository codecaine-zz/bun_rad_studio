// The "Effective settings" panel: for a connection (or an engine with none chosen) every value a studio would get,
// where each value comes from, which environment variables are being ignored, and which are no longer needed.
// Values come from the server's precedence rule; the password is only ever shown as "set" or "not set".
import { call } from "./api.js";
import { clear, h } from "./dom.js";
import { errorText } from "./dbState.js";

const KIND = {
  profile: { icon: "📌", word: "Saved connection" },
  defaults: { icon: "⚙️", word: "Your defaults" },
  env: { icon: "🌐", word: "Environment" },
  builtin: { icon: "📦", word: "Built-in default" },
  none: { icon: "—", word: "Not set" },
};

function sourceCell(src) {
  const k = KIND[src.kind] ?? KIND.none;
  return h("td", {}, h("span", { class: `db-src db-src-${src.kind}` }, h("span", { "aria-hidden": "true" }, k.icon), ` ${k.word}`), h("span", { class: "db-src-text" }, src.text));
}

function nameList(items) {
  return h("ul", { class: "db-names" }, items.map((i) => h("li", {}, h("code", {}, i.name), h("span", { class: "pw-hint" }, ` — ${i.origin}`))));
}

/** Draws the panel into `box` for a saved connection (`{ id }`) or an engine without one (`{ engine }`). */
export async function renderEffective(box, target) {
  clear(box);
  box.setAttribute("aria-busy", "true");
  box.append(h("p", { class: "pw-hint" }, "Working out the effective settings…"));
  let data;
  try {
    data = await call("db/effective", target);
  } catch (err) {
    clear(box);
    box.removeAttribute("aria-busy");
    box.append(h("p", { class: "power-error", role: "alert" }, errorText(err, "Couldn't work out the effective settings.")));
    return null;
  }
  const e = data.effective;
  clear(box);
  box.removeAttribute("aria-busy");
  box.append(
    h("h4", { class: "db-h" }, "Effective settings"),
    h("p", { class: "pw-hint" }, `The studio will use ${e.willUse}. Order: this connection, then your defaults for the engine, then environment variables, then the studio's own defaults.`),
    h("div", { class: "pw-table-wrap" },
      h("table", { class: "pw-table db-effective-table" },
        h("caption", { class: "sr-only" }, "Every setting, its value and where it comes from"),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Setting"), h("th", { scope: "col" }, "Value"), h("th", { scope: "col" }, "Comes from"))),
        h("tbody", {}, e.fields.map((f) => h("tr", {},
          h("th", { scope: "row" }, f.label),
          h("td", { class: "pw-mono" }, f.secret ? (f.present ? "•••••• (set, hidden)" : "not set") : f.value ?? "not set"),
          sourceCell(f.source),
        ))),
      ),
    ),
  );
  if (e.notes.length) box.append(h("ul", { class: "db-notes" }, e.notes.map((n) => h("li", {}, n))));
  if (e.warnings.length) box.append(h("ul", { class: "db-warnings", role: "note", "aria-label": "Things to know" }, e.warnings.map((w) => h("li", {}, h("span", { "aria-hidden": "true" }, "⚠ "), w))));
  if (e.ignored.length) {
    box.append(h("div", { class: "db-ignored" },
      h("h5", { class: "db-h2" }, data.startsWithEnvironment ? "Environment variables the studio does not read" : "Environment variables being ignored"),
      h("p", { class: "pw-hint" }, data.startsWithEnvironment ? "These are set but have no effect on this studio." : "They are set on this computer, but this connection overrides them, so the studio is started without them."),
      nameList(e.ignored),
    ));
  }
  if (e.noLongerNeeded.length) {
    const inFile = e.noLongerNeeded.some((n) => n.origin.includes(".env"));
    box.append(h("div", { class: "db-nolonger", role: "note" },
      h("h5", { class: "db-h2" }, inFile ? "These variables are no longer needed" : "These environment variables are no longer needed"),
      h("p", { class: "pw-hint" }, `This connection is saved here now, so you can remove ${inFile ? "them from the .env file or your shell profile" : "them from your shell profile"} if you like. Nothing is changed for you.`),
      nameList(e.noLongerNeeded),
    ));
  }
  if (data.files?.length) {
    const read = data.files.filter((f) => !f.skipped).map((f) => `${f.file} (${f.shown})`);
    const skipped = data.files.filter((f) => f.skipped);
    box.append(h("p", { class: "pw-hint db-files" },
      read.length ? `.env files looked at, read-only: ${read.join(", ")}. ` : "No .env files were found in the application's folders. ",
      skipped.length ? `Skipped for safety: ${skipped.map((f) => `${f.file} (${f.skipped === "link" ? "a link" : f.skipped})`).join(", ")}.` : "",
    ));
  }
  return data;
}
