// The read-only look at one buried item in the Graveyard tab: text, a picture, the names inside a folder, or what a link
// points to. The server looks only inside the graveyard and never opens a link's target. Everything from disk goes in
// as text (never as HTML).
import { ApiError, call } from "./api.js";
import { h } from "./dom.js";
import { formatSize, plural } from "./util.js";

export function createPreview() {
  const body = h("div", { class: "grave-preview-body" }, h("p", { class: "pw-hint" }, "Click the name of a buried item to look at it here without restoring it."));
  const title = h("h3", { id: "grave-preview-title" }, "Preview");
  const el = h("section", { class: "pw-card grave-preview", "aria-labelledby": "grave-preview-title" }, title, body);
  let token = 0;

  function draw(row, p) {
    if (p.kind === "text") {
      return [h("pre", { class: "pw-out grave-text", tabindex: "0", "aria-label": `Contents of ${row.name}`, title: "The start of the file, read-only." }, p.text || "(The file is empty.)"),
        p.truncated ? h("p", { class: "pw-hint" }, `Only the first part is shown (the file is ${formatSize(p.bytes)}). Restore it to read the rest.`) : null];
    }
    if (p.kind === "image") return [h("img", { class: "grave-image", src: p.dataUrl, alt: `Picture: ${row.name}`, title: row.name }), h("p", { class: "pw-hint" }, `${formatSize(p.bytes)}`)];
    if (p.kind === "folder") {
      return [h("p", { class: "pw-hint" }, `${plural(p.total, "item")} directly inside${p.total > p.entries.length ? `; the first ${p.entries.length} are listed` : ""}.`),
        p.entries.length ? h("ul", { class: "grave-names", "aria-label": `Inside ${row.name}` }, p.entries.map((e) => h("li", {}, `${e.type === "folder" ? "📁" : e.type === "link" ? "🔗" : "📄"} ${e.name}`))) : null];
    }
    if (p.kind === "link") return [h("p", {}, `This is a link that points to “${p.target}”. It isn't opened or followed.`)];
    if (p.kind === "binary") return [h("p", { class: "pw-hint" }, `This is not a text file (${formatSize(p.bytes)}), so there is nothing to show. Restore it to open it with a program.`)];
    return [h("p", { class: "pw-hint" }, p.reason || "There is nothing to show for this item.")];
  }

  return {
    el,
    clear() {
      token++;
      title.textContent = "Preview";
      body.replaceChildren(h("p", { class: "pw-hint" }, "Click the name of a buried item to look at it here without restoring it."));
    },
    async show(row) {
      const mine = ++token;
      title.textContent = `Preview: ${row.name}`;
      body.replaceChildren(h("p", { class: "pw-hint", role: "status" }, "Opening…"));
      try {
        const { preview } = await call("grave/preview", { id: row.id });
        if (mine === token) body.replaceChildren(...draw(row, preview));
      } catch (err) {
        if (mine === token) body.replaceChildren(h("p", { role: "alert", class: "pw-bad" }, err instanceof ApiError ? err.message : "Couldn't open that."));
      }
    },
  };
}
