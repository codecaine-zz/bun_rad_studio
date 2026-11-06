// "Compare data files" & "Compare text/code/documents":
// - Data compare: two JSON, JSON5, YAML or TOML files, compared by what they say (not by how they are written).
// - Text compare: any two text, code, or document package files, compared line-by-line with Unified & Split views.
import { ApiError, call } from "./api.js";
import { copyItemButton } from "./copyclip.js";
import { openDialog } from "./dialogs.js";
import { clear, h } from "./dom.js";
import { toast } from "./menus.js";
import { refresh } from "./nav.js";
import { pushUndo, undo } from "./ops.js";
import { currentPath, state } from "./state.js";
import { extensionOf, isDocumentPackageEntry, parentOf } from "./util.js";

const COMPARABLE = new Set(["json", "jsonc", "json5", "yaml", "yml", "toml"]);

/** Exactly two ordinary files that are JSON, JSON5, YAML or TOML (by name). */
export function canCompareData(entries) {
  return (
    entries.length === 2 &&
    entries.every((e) => !e.isDir && COMPARABLE.has(extensionOf(e.name)))
  );
}

const tsv = (rows) => rows.map((r) => r.join("\t")).join("\n");

function section(title, tip, rows, columns) {
  const text = () => `${title}\n${tsv([columns, ...rows])}`;
  return h(
    "section",
    { class: "cmp-section", "data-count": String(rows.length) },
    h(
      "div",
      { class: "cmp-head" },
      h("h3", { class: "cmp-title", title: tip }, `${title} (${rows.length})`),
      copyItemButton({ label: `the list “${title}”`, getText: text }),
    ),
    h(
      "div",
      { class: "cmp-wrap" },
      h(
        "table",
        { class: "cmp-table", "data-copy": "off" },
        h("caption", { class: "sr-only" }, title),
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            columns.map((c) => h("th", { scope: "col" }, c)),
          ),
        ),
        h(
          "tbody",
          {},
          rows.map((r) =>
            h(
              "tr",
              {},
              r.map((cell, i) =>
                i === 0
                  ? h("th", { scope: "row", class: "cmp-path" }, cell)
                  : h("td", { class: "cmp-value" }, cell),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function report(r) {
  const lines = [
    `Left: ${r.left.name} (${r.left.kind})`,
    `Right: ${r.right.name} (${r.right.kind})`,
    r.identical
      ? "Same meaning."
      : `${r.total} difference${r.total === 1 ? "" : "s"}.`,
  ];
  for (const [title, list, cols] of [
    ["Changed", r.changed, (d) => [d.path, d.left, d.right]],
    ["Only in the left file", r.onlyLeft, (d) => [d.path, d.left]],
    ["Only in the right file", r.onlyRight, (d) => [d.path, d.right]],
  ]) {
    if (list.length)
      lines.push("", title, ...list.map((d) => cols(d).join("\t")));
  }
  return lines.join("\n");
}

/** Shows the comparison of the two selected files in a window. */
export async function showCompareData(entries) {
  if (!canCompareData(entries)) return;
  const [left, right] = entries;
  let r;
  try {
    r = await call("data/compare", { left: left.path, right: right.path });
  } catch (err) {
    toast(
      err instanceof ApiError ? err.message : "Couldn't compare those files.",
      { kind: "error" },
    );
    return;
  }
  const verdict = h(
    "p",
    {
      class: `cmp-verdict ${r.identical ? "cmp-same" : "cmp-diff"}`,
      role: "status",
    },
    r.identical
      ? "✔ These files mean exactly the same thing (key order, spacing and comments are ignored)."
      : `✖ The files differ: ${r.total.toLocaleString("en-US")} difference${r.total === 1 ? "" : "s"}.`,
  );
  const sections = [
    r.changed.length
      ? section(
          "Changed",
          "Settings that exist in both files but have different values. The path shows where: a.b is the key b inside a, and [2] is the third item of a list.",
          r.changed.map((d) => [
            d.path + (d.note ? ` — ${d.note}` : ""),
            d.left,
            d.right,
          ]),
          ["Where", r.left.name, r.right.name],
        )
      : null,
    r.onlyLeft.length
      ? section(
          "Only in the left file",
          `Settings that ${r.left.name} has and ${r.right.name} doesn't.`,
          r.onlyLeft.map((d) => [d.path, d.left]),
          ["Where", "Value"],
        )
      : null,
    r.onlyRight.length
      ? section(
          "Only in the right file",
          `Settings that ${r.right.name} has and ${r.left.name} doesn't.`,
          r.onlyRight.map((d) => [d.path, d.right]),
          ["Where", "Value"],
        )
      : null,
  ];
  openDialog({
    title: "Compare data files",
    wide: true,
    body: [
      h(
        "p",
        { class: "cmp-names" },
        h("strong", {}, "Left: "),
        `${r.left.name} (${r.left.kind})`,
        "  ",
        h("strong", {}, "Right: "),
        `${r.right.name} (${r.right.kind})`,
      ),
      verdict,
      r.notes.length
        ? h(
            "ul",
            { class: "cmp-notes" },
            r.notes.map((n) => h("li", {}, n)),
          )
        : null,
      ...sections,
      h(
        "div",
        { class: "cmp-all" },
        copyItemButton({
          label: "the whole comparison",
          getText: () => report(r),
          words: "Copy everything",
        }),
      ),
    ],
    buttons: [{ label: "Close", primary: true, value: true }],
  });
}

/** Exactly two files or document packages that can be compared as text/code/documents. */
export function canCompareText(entries) {
  return (
    Array.isArray(entries) &&
    entries.length === 2 &&
    entries.every((e) => e && (!e.isDir || isDocumentPackageEntry(e)))
  );
}

function buildSplitRows(rows) {
  const out = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r.type === "same") {
      out.push({
        leftLine: r.leftLine,
        leftText: r.text,
        leftType: "same",
        rightLine: r.rightLine,
        rightText: r.text,
        rightType: "same",
      });
      i++;
    } else {
      const dels = [];
      const adds = [];
      while (i < rows.length && rows[i].type !== "same") {
        if (rows[i].type === "del") dels.push(rows[i]);
        else adds.push(rows[i]);
        i++;
      }
      const maxLen = Math.max(dels.length, adds.length);
      for (let k = 0; k < maxLen; k++) {
        const d = dels[k];
        const a = adds[k];
        out.push({
          leftLine: d?.leftLine ?? "",
          leftText: d ? d.text : "",
          leftType: d ? "del" : "empty",
          rightLine: a?.rightLine ?? "",
          rightText: a ? a.text : "",
          rightType: a ? "add" : "empty",
        });
      }
    }
  }
  return out;
}

/** Shows an interactive Unified / Side-by-Side Split diff of two selected text, code, or document files. */
export async function showCompareTextFiles(entries) {
  if (!canCompareText(entries)) return;
  const [left, right] = entries;
  let r;
  try {
    r = await call("text/compare", { left: left.path, right: right.path });
  } catch (err) {
    toast(
      err instanceof ApiError
        ? err.message
        : "Couldn't compare those files as text.",
      { kind: "error" },
    );
    return;
  }

  let viewMode = "unified"; // "unified" | "split"
  let changesOnly = false;
  const diffHost = h("div", {
    class: "text-diff-host",
    tabindex: "0",
    role: "region",
    "aria-label": `Text comparison between ${r.left.name} and ${r.right.name}`,
    dataset: { textDiffHost: "" },
    style:
      "max-height: 55vh; overflow: auto; border: 1px solid var(--border, #334155); border-radius: 6px; font-family: var(--mono, monospace); font-size: 12px;",
  });

  function renderDiffTable() {
    clear(diffHost);
    const filtered = changesOnly
      ? r.rows.filter((x) => x.type !== "same")
      : r.rows;
    if (filtered.length === 0) {
      diffHost.append(
        h(
          "p",
          { class: "hint", style: "padding: 16px; margin: 0;" },
          r.identical
            ? "The two files have identical text content."
            : "No changed lines to display.",
        ),
      );
      return;
    }
    if (viewMode === "unified") {
      const thead = h(
        "thead",
        {},
        h(
          "tr",
          {
            style:
              "position: sticky; top: 0; background: var(--panel, #1e293b); border-bottom: 1px solid var(--border, #334155); z-index: 1;",
          },
          h(
            "th",
            {
              scope: "col",
              style:
                "width: 42px; text-align: right; padding: 4px 6px; color: var(--muted);",
            },
            "L",
          ),
          h(
            "th",
            {
              scope: "col",
              style:
                "width: 42px; text-align: right; padding: 4px 6px; color: var(--muted);",
            },
            "R",
          ),
          h(
            "th",
            {
              scope: "col",
              style: "width: 18px; text-align: center; padding: 4px;",
            },
            "±",
          ),
          h(
            "th",
            {
              scope: "col",
              style: "text-align: left; padding: 4px 8px; color: var(--muted);",
            },
            `${r.left.name} ↔ ${r.right.name}`,
          ),
        ),
      );
      const tbody = h("tbody", {});
      for (const row of filtered) {
        const bg =
          row.type === "add"
            ? "rgba(34, 197, 94, 0.14)"
            : row.type === "del"
              ? "rgba(239, 68, 68, 0.14)"
              : "transparent";
        const prefix =
          row.type === "add" ? "+" : row.type === "del" ? "-" : " ";
        const signColor =
          row.type === "add"
            ? "var(--good, #16a34a)"
            : row.type === "del"
              ? "var(--danger, #dc2626)"
              : "inherit";
        tbody.append(
          h(
            "tr",
            { class: `diff-row diff-${row.type}`, style: `background: ${bg};` },
            h(
              "td",
              {
                style:
                  "width: 42px; text-align: right; padding: 2px 6px; opacity: 0.65; user-select: none; border-right: 1px solid rgba(148,163,184,0.2);",
              },
              String(row.leftLine ?? ""),
            ),
            h(
              "td",
              {
                style:
                  "width: 42px; text-align: right; padding: 2px 6px; opacity: 0.65; user-select: none; border-right: 1px solid rgba(148,163,184,0.2);",
              },
              String(row.rightLine ?? ""),
            ),
            h(
              "td",
              {
                style: `width: 18px; text-align: center; padding: 2px 4px; font-weight: 700; user-select: none; color: ${signColor};`,
              },
              prefix,
            ),
            h(
              "td",
              {
                style:
                  "padding: 2px 8px; white-space: pre-wrap; word-break: break-word;",
              },
              row.text || " ",
            ),
          ),
        );
      }
      diffHost.append(
        h(
          "table",
          { style: "width: 100%; border-collapse: collapse;" },
          thead,
          tbody,
        ),
      );
    } else {
      // Build split rows from unfiltered r.rows FIRST so deletions and additions stay paired within their own hunks!
      const allSplitRows = buildSplitRows(r.rows);
      const splitRows = changesOnly
        ? allSplitRows.filter(
            (sr) => sr.leftType !== "same" || sr.rightType !== "same",
          )
        : allSplitRows;
      const thead = h(
        "thead",
        {},
        h(
          "tr",
          {
            style:
              "position: sticky; top: 0; background: var(--panel, #1e293b); border-bottom: 1px solid var(--border, #334155); z-index: 1;",
          },
          h(
            "th",
            {
              scope: "col",
              style:
                "width: 38px; text-align: right; padding: 4px 6px; color: var(--muted);",
            },
            "L",
          ),
          h(
            "th",
            {
              scope: "col",
              style:
                "width: 45%; text-align: left; padding: 4px 8px; color: var(--muted);",
            },
            `Left: ${r.left.name}`,
          ),
          h(
            "th",
            {
              scope: "col",
              style:
                "width: 38px; text-align: right; padding: 4px 6px; color: var(--muted);",
            },
            "R",
          ),
          h(
            "th",
            {
              scope: "col",
              style:
                "width: 45%; text-align: left; padding: 4px 8px; color: var(--muted);",
            },
            `Right: ${r.right.name}`,
          ),
        ),
      );
      const tbody = h("tbody", {});
      for (const sr of splitRows) {
        const bgL =
          sr.leftType === "del"
            ? "rgba(239, 68, 68, 0.14)"
            : sr.leftType === "empty"
              ? "rgba(148, 163, 184, 0.1)"
              : "transparent";
        const bgR =
          sr.rightType === "add"
            ? "rgba(34, 197, 94, 0.14)"
            : sr.rightType === "empty"
              ? "rgba(148, 163, 184, 0.1)"
              : "transparent";
        tbody.append(
          h(
            "tr",
            { class: "diff-split-row" },
            h(
              "td",
              {
                style: `width: 38px; text-align: right; padding: 2px 6px; opacity: 0.65; user-select: none; background: ${bgL}; border-right: 1px solid rgba(148,163,184,0.2);`,
              },
              String(sr.leftLine ?? ""),
            ),
            h(
              "td",
              {
                style: `width: 45%; padding: 2px 8px; white-space: pre-wrap; word-break: break-word; background: ${bgL}; border-right: 1px solid rgba(148,163,184,0.3);`,
              },
              sr.leftText || " ",
            ),
            h(
              "td",
              {
                style: `width: 38px; text-align: right; padding: 2px 6px; opacity: 0.65; user-select: none; background: ${bgR}; border-right: 1px solid rgba(148,163,184,0.2);`,
              },
              String(sr.rightLine ?? ""),
            ),
            h(
              "td",
              {
                style: `width: 45%; padding: 2px 8px; white-space: pre-wrap; word-break: break-word; background: ${bgR};`,
              },
              sr.rightText || " ",
            ),
          ),
        );
      }
      diffHost.append(
        h(
          "table",
          {
            style:
              "width: 100%; border-collapse: collapse; table-layout: fixed;",
          },
          thead,
          tbody,
        ),
      );
    }
  }

  const unifiedBtn = h(
    "button",
    {
      type: "button",
      class: "btn primary",
      "aria-pressed": "true",
      dataset: { diffMode: "unified" },
      onclick: () => {
        viewMode = "unified";
        unifiedBtn.classList.add("primary");
        unifiedBtn.setAttribute("aria-pressed", "true");
        splitBtn.classList.remove("primary");
        splitBtn.setAttribute("aria-pressed", "false");
        renderDiffTable();
      },
    },
    "Unified view",
  );
  const splitBtn = h(
    "button",
    {
      type: "button",
      class: "btn",
      "aria-pressed": "false",
      dataset: { diffMode: "split" },
      onclick: () => {
        viewMode = "split";
        splitBtn.classList.add("primary");
        splitBtn.setAttribute("aria-pressed", "true");
        unifiedBtn.classList.remove("primary");
        unifiedBtn.setAttribute("aria-pressed", "false");
        renderDiffTable();
      },
    },
    "Side-by-side split",
  );

  const changesChk = h("input", {
    type: "checkbox",
    dataset: { diffChangesOnly: "" },
    onchange: () => {
      changesOnly = changesChk.checked;
      renderDiffTable();
    },
  });

  const savePatchBtn = h(
    "button",
    {
      type: "button",
      class: "btn",
      dataset: { diffSavePatch: "" },
      title: "Save a unified .patch file in the current folder",
      onclick: async () => {
        const folder = currentPath() || parentOf(left.path, state.sep);
        const patchName = `${left.name}_vs_${right.name}.patch`.replace(
          /[^a-zA-Z0-9._-]/g,
          "_",
        );
        try {
          const res = await call("newfile", {
            parent: folder,
            name: patchName,
            content: r.unifiedPatch || "",
          });
          if (res?.path) {
            pushUndo(`save patch "${res.name || patchName}"`, async () => {
              await call("trash", { paths: [res.path] });
            });
          }
          toast(`Saved ${res?.name || patchName}`, {
            kind: "success",
            action: { label: "Undo", run: undo },
          });
          await refresh();
        } catch (err) {
          toast(
            err instanceof ApiError
              ? err.message
              : "Could not save .patch file.",
            { kind: "error" },
          );
        }
      },
    },
    "💾 Save .patch file",
  );

  renderDiffTable();

  const summaryBar = h(
    "div",
    {
      style:
        "display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 8px;",
    },
    h(
      "div",
      {
        style: "display: flex; gap: 8px; align-items: center; flex-wrap: wrap;",
      },
      h(
        "span",
        {
          class: `cmp-verdict ${r.identical ? "cmp-same" : "cmp-diff"}`,
          style: "margin: 0; padding: 4px 8px;",
        },
        r.identical
          ? "✔ Identical text (100% match)"
          : `Similarity: ${r.similarityPct}% · +${r.added} added · −${r.removed} removed · ${r.unchanged} unchanged`,
      ),
    ),
    h(
      "div",
      {
        style: "display: flex; gap: 6px; align-items: center; flex-wrap: wrap;",
      },
      unifiedBtn,
      splitBtn,
      h(
        "label",
        {
          style:
            "display: inline-flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; margin-left: 6px;",
        },
        changesChk,
        "Changes only",
      ),
    ),
  );

  openDialog({
    title: `Diff Files — ${r.left.name} ↔ ${r.right.name}`,
    wide: true,
    body: [
      h(
        "p",
        { class: "cmp-names" },
        h("strong", {}, "Left: "),
        `${r.left.name} (${r.left.lines} lines)`,
        "   ",
        h("strong", {}, "Right: "),
        `${r.right.name} (${r.right.lines} lines)`,
      ),
      summaryBar,
      r.truncated
        ? h(
            "p",
            { class: "hint" },
            "Note: Very large file truncated to the first 2,000 lines for interactive diffing.",
          )
        : null,
      diffHost,
      h(
        "div",
        {
          class: "cmp-all",
          style:
            "display: flex; gap: 8px; align-items: center; margin-top: 10px;",
        },
        copyItemButton({
          label: "the unified .diff patch",
          getText: () => r.unifiedPatch || "",
          words: "📋 Copy .diff patch",
        }),
        savePatchBtn,
      ),
    ],
    buttons: [{ label: "Close", primary: true, value: true }],
  });
}
