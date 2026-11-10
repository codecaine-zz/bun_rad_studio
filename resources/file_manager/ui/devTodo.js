// "TODO" section of the Dev tool: finds marker words (TODO, FIXME, HACK, XXX, BUG, NOTE ...) in the folder's text files
// and lists them by marker and file. Press a line to open the file in the Code editor at that line.
import { call } from "./api.js";
import { announce, h } from "./dom.js";
import { joinRoot, openInCodeAt, revealPath } from "./devActions.js";
import {
  btn,
  checkbox,
  createStatus,
  createTable,
  errorText,
  field,
  linkButton,
  num,
  runJob,
  seconds,
} from "./devCore.js";
import { plural } from "./util.js";

const DEFAULT_TAGS = "TODO, FIXME, HACK, XXX, BUG, NOTE";
const MAX_SHOWN = 300;

export function createTodo(env) {
  const status = createStatus();
  const out = h("div", { class: "dev-todo-out" });
  const tags = h("input", {
    type: "text",
    id: "dev-todo-tags",
    value: DEFAULT_TAGS,
    spellcheck: "false",
    autocomplete: "off",
    title:
      "The words to look for, separated by commas. Use capital letters, like TODO.",
  });
  const gitignore = checkbox(
    "dev-todo-gitignore",
    "Respect .gitignore",
    "Skip files the project's .gitignore files list.",
    true,
  );
  const hidden = checkbox(
    "dev-todo-hidden",
    "Include hidden files",
    "Also look in files and folders whose names start with a dot.",
    false,
  );
  const run = btn(
    "Find markers",
    "Search the text files in this folder for the marker words. Nothing is changed.",
    () => start(),
    { primary: true },
  );
  const cancel = btn(
    "Cancel",
    "Stop the search.",
    () => {
      if (!job) return;
      cancel.disabled = true;
      status.set("Stopping…");
      job.cancel();
    },
    { danger: true },
  );
  cancel.hidden = true;
  const filterInput = h("input", {
    type: "search",
    id: "dev-todo-filter",
    placeholder: "Filter by file or comment…",
    spellcheck: "false",
    autocomplete: "off",
    title: "Filter found markers by file path, tag, or comment text.",
    oninput: () => {
      if (last?.result) render(last.result);
    },
  });
  const exportRow = h(
    "div",
    { class: "pw-row", hidden: true },
    field("Filter results", filterInput),
    field(
      "Export as",
      h(
        "select",
        {
          id: "dev-todo-format",
          title:
            "CSV opens in a spreadsheet, JSON is for programs, Markdown is a table.",
        },
        h("option", { value: "csv" }, "CSV"),
        h("option", { value: "json" }, "JSON"),
        h("option", { value: "md" }, "Markdown table"),
      ),
    ),
    btn("Copy", "Copy the list to the clipboard.", () => exportList(false)),
    btn(
      "Save to folder",
      "Save the list as a new file in the scanned folder. An existing file is never replaced.",
      () => exportList(true),
    ),
  );
  let job = null;
  let seq = 0;
  let last = null;

  async function exportList(save) {
    if (!last) return;
    const format = exportRow.querySelector("select").value;
    const filter = filterInput.value.trim();
    try {
      if (save) {
        const res = await call("dev/export/save", {
          id: last.id,
          scope: "todo",
          format,
          folder: last.result.root,
          ...(filter ? { filter } : {}),
        });
        status.set(
          `Saved ${res.rows}${filter ? " filtered" : ""} rows as ${res.name} in the scanned folder.`,
        );
      } else {
        const res = await call("dev/export", {
          id: last.id,
          scope: "todo",
          format,
          ...(filter ? { filter } : {}),
        });
        if (res.text.length > 100_000)
          return status.set(
            "That is too long to copy. Use “Save to folder” instead.",
            true,
          );
        await call("copytext", { text: res.text });
        status.set(`Copied ${res.rows}${filter ? " filtered" : ""} rows.`);
      }
    } catch (err) {
      status.set(errorText(err, "That didn't work."), true);
    }
  }

  function render(r) {
    const root = r.root;
    const q = filterInput.value.trim().toLowerCase();
    const filteredItems = q
      ? r.items.filter(
          (i) =>
            i.path.toLowerCase().includes(q) ||
            i.tag.toLowerCase().includes(q) ||
            i.text.toLowerCase().includes(q),
        )
      : r.items;
    const chips = h(
      "ul",
      { class: "dev-chips", "aria-label": "Counts per marker" },
      r.tags.map((t) =>
        h("li", { class: "dev-chip" }, `${t}: ${num(r.counts[t] ?? 0)}`),
      ),
    );
    const groups = r.tags.map((tag) => {
      const items = filteredItems.filter((i) => i.tag === tag);
      if (!items.length) return null;
      const byFile = new Map();
      for (const i of items)
        byFile.set(i.path, [...(byFile.get(i.path) ?? []), i]);
      const table = createTable({
        caption: `${tag} markers`,
        columns: [
          { key: "path", label: "File", rowHeader: true },
          { key: "line", label: "Line", num: true },
          { key: "text", label: "Text" },
          { key: "go", label: "Show" },
        ],
      });
      table.render(
        items.slice(0, MAX_SHOWN).map((i) => ({
          onclick: () => openInCodeAt(joinRoot(root, i.path), i.line),
          cells: [
            i.path,
            String(i.line),
            i.text,
            linkButton(
              "Show in file list",
              `Select ${i.path} in the file list.`,
              () => revealPath(joinRoot(root, i.path)),
            ),
          ],
        })),
      );
      return h(
        "details",
        { class: "dev-todo-group", open: true },
        h(
          "summary",
          {},
          `${tag} — ${plural(items.length, "marker")} in ${plural(byFile.size, "file")}`,
        ),
        table.el,
        items.length > MAX_SHOWN
          ? h(
              "p",
              { class: "pw-hint" },
              `Showing the first ${MAX_SHOWN}. Export the list to see all.`,
            )
          : null,
      );
    });
    out.replaceChildren(
      chips,
      ...groups.filter(Boolean),
      ...(r.truncated
        ? [
            h(
              "p",
              { class: "pw-hint pw-bad" },
              "✗ There are more markers than the list can hold; the first ones are shown.",
            ),
          ]
        : []),
    );
    if (!r.items.length)
      out.append(h("p", { class: "pw-hint" }, "No markers found."));
    else if (!filteredItems.length)
      out.append(
        h("p", { class: "pw-hint" }, "No markers match the current filter."),
      );
  }

  async function start() {
    const root = env.getRoot();
    if (!root) return status.set("Choose a folder first.", true);
    const list = tags.value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (job) job.cancel();
    const mine = ++seq;
    run.disabled = true;
    cancel.disabled = false;
    cancel.hidden = false;
    exportRow.hidden = true;
    status.set("Searching…");
    try {
      job = runJob(
        "dev/todo/start",
        {
          root,
          tags: list,
          respectGitignore: gitignore.querySelector("input").checked,
          hidden: hidden.querySelector("input").checked,
        },
        (p, ms) =>
          mine === seq &&
          status.set(
            `Searching… ${num(p.files ?? 0)} files, ${num(p.found ?? 0)} markers (${seconds(ms)})`,
          ),
      );
      const done = await job.promise;
      if (mine !== seq) return;
      if (!done.result) return status.set("Cancelled.");
      last = { id: done.id, result: done.result };
      render(done.result);
      exportRow.hidden = false;
      status.set(
        `${done.state === "cancelled" ? "Stopped early. " : ""}${plural(done.result.items.length, "marker")} in ${plural(done.result.filesWithHits, "file")} (looked at ${num(done.result.filesScanned)} text files in ${seconds(done.result.elapsedMs)}).`,
      );
      announce(status.el.textContent);
    } catch (err) {
      if (mine === seq)
        status.set(errorText(err, "The search didn't work."), true);
    } finally {
      if (mine === seq) {
        run.disabled = false;
        cancel.disabled = false;
        cancel.hidden = true;
        job = null;
      }
    }
  }

  return {
    el: h(
      "div",
      { class: "dev-section" },
      h(
        "div",
        { class: "pw-card" },
        h("h3", {}, "TODO and FIXME markers"),
        h(
          "p",
          { class: "pw-hint" },
          "Looks for whole capital-letter words in the text files of the folder. Binary and very large files are skipped.",
        ),
        h(
          "div",
          { class: "pw-row" },
          field("Markers", tags),
          gitignore,
          hidden,
          run,
          cancel,
        ),
        exportRow,
        status.el,
      ),
      out,
    ),
    start,
    cancel: () => job?.cancel(),
  };
}
