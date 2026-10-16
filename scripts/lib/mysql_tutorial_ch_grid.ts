import type { Chapter } from "./fm_tutorial_types";
import { S, choose, dialogButton, tagField } from "./mysql_tutorial_helpers";

/** Chapters 5 and 6: the data grid with its GUI editing, and the S Q L editor with its backup and dump generator. */
export const gridChapters: Chapter[] = [
  {
    id: "06_grid", chapter: "DATA GRID", title: "The data grid: browse, filter, total and edit rows",
    blurb: "Sorting, the filter bar, a totals row, new, edit, duplicate and delete rows, and a printable report",
    steps: [
      {
        cap: "Pick a table, sort by a column",
        say: "The data grid is the first pane. Pick a table in the sidebar: customers, twelve rows, in pages of twenty five, the key marked. Click a header to sort. I sort by balance, then back to id.",
        act: async (d) => {
          await d.click(S + ".tree-item-title >> customers", { pause: 1200 });
          await d.click(S + "th[data-col=balance]", { pause: 1500 });
          await d.click(S + "th[data-col=balance]", { pause: 1500 });
          await d.click(S + "th[data-col=id]", { pause: 1000 });
        },
      },
      {
        cap: "The filter bar",
        say: "The Filter Bar puts a box under every column. I type V I P under tier, and only matching rows stay, as I type. Clear it, and all the rows return.",
        act: async (d) => {
          await d.click(S + "#btnToggleFilterBar", { pause: 1000 });
          await d.click(S + ".access-filter-input >> @filter tier", { pause: 500 });
          await d.type("VIP", 140);
          await d.wait(2500);
          await d.key("Meta+a", "⌘ A");
          await d.key("Delete", "Delete");
          await d.wait(1500);
          await d.click(S + "#btnToggleFilterBar", { pause: 800 });
        },
      },
      {
        cap: "A pinned Totals row",
        say: "Totals pins a row at the bottom with sums, averages, counts, minimums and maximums, calculated by the database for the whole table.",
        act: async (d) => {
          await d.click(S + "#btnToggleTotals", { pause: 1800 });
          await d.wait(4500);
          await d.click(S + "#btnToggleTotals", { pause: 800 });
        },
      },
      {
        cap: "New Row: a form built from the table",
        say: "New Row opens a form built from the table's own columns: an auto numbered key, required columns marked, defaults shown, and the tier is an enum. I type a name and an email, and Save row.",
        act: async (d) => {
          await d.click(S + "button >> New Row", { pause: 1500 });
          await d.type("Mary Shelley", 70);
          await d.key("Tab", "Tab");
          await d.type("mary@shelley.example", 50);
          await d.wait(900);
          await d.click(S + "button >> Save row", { pause: 2200 });
        },
      },
      {
        cap: "Edit a cell, duplicate a row, delete a row",
        say: "Double click a cell to edit it in place: I give Mary a company. Right click a row for edit, duplicate, copy or delete. Duplicating needs a new unique email, and Now for the creation time, which MySQL rejects in the copied format.",
        act: async (d) => {
          await d.dblclick(S + "tbody tr:last-child td[data-col=company]", { pause: 700 });
          await d.type("Frankenstein Press", 60);
          await d.key("Enter", "Enter");
          await d.wait(1200);
          await d.rclick(S + "tbody tr >> Mary Shelley", { pause: 900 });
          await d.click(S + ".crud-mi >> Duplicate row", { pause: 1500 });
          await tagField(d, "email");
          await d.click(S + "[data-vid=f]", { pause: 400 });
          await d.key("Meta+a", "⌘ A");
          await d.type("mary.copy@shelley.example", 40);
          await tagField(d, "created_at");
          await d.click(S + "[data-vid=f]", { pause: 300 });
          await d.key("Meta+a", "⌘ A");
          await d.click(S + "button >> Now", { pause: 600 });
          await d.click(S + "button >> Save row", { pause: 2000 });
        },
      },
      {
        cap: "Delete asks first",
        say: "To delete, right click the copy and choose Delete row. The studio asks first, and warns it cannot be undone. I confirm.",
        act: async (d) => {
          await d.rclick(S + "tbody tr:last-child", { pause: 900 });
          await d.click(S + ".crud-mi >> Delete row", { pause: 1800 });
          await d.wait(2200);
          await dialogButton(d, "Delete");
        },
      },
      {
        cap: "Publication report",
        say: "And Report makes a print ready report of the grid: print it, save a P D F, or export H T M L.",
        act: async (d) => {
          await d.click(S + "#btnAccessReport", { pause: 2500 });
          await d.wait(2500);
          await d.click(S + ".modal-close", { pause: 800 });
        },
      },
    ],
  },
];

/** Chapter 6: the S Q L editor, the preset queries, and the one-click backup and dump generator. */
export const sqlChapters: Chapter[] = [
  {
    id: "07_sql", chapter: "S Q L EDITOR", title: "The S Q L editor, presets, and one-click backup",
    blurb: "Run queries, ready-made snippets, export results, and a complete S Q L dump",
    steps: [
      {
        cap: "Run Query opens the S Q L editor",
        say: "Run Query opens the S Q L editor with a select on the current table. Results land in the same grid, with the time and the row count above.",
        act: async (d) => {
          await d.click(S + "button >> Run Query", { pause: 2500 });
          await d.hover(S + "#queryTiming", 1200);
        },
      },
      {
        cap: "Ready-made snippets",
        say: "The Snippet menu has eleven ready made queries, from four table joins to a low stock alert. Choosing one runs it at once. Here, high value orders: a join of orders and customers.",
        act: async (d) => {
          await d.click(S + "#presetSelect", { pause: 500 });
          await choose(d, "#presetSelect", "High-Value Orders");
          await d.wait(2800);
        },
      },
      {
        cap: "Write your own query",
        say: "Or write your own. I type a query that groups orders by status, press Command Enter, and the answer appears.",
        act: async (d) => {
          if (!(await d.c.exists(S + "#sqlEditor"))) await d.click(S + "#btnToggleEditor", { pause: 900 });
          await d.click(S + "#sqlEditor", { pause: 500 });
          await d.key("Meta+a", "⌘ A");
          await d.type("SELECT status, COUNT(*) AS orders, SUM(total_amount) AS revenue FROM orders GROUP BY status ORDER BY revenue DESC;", 22);
          await d.key("Meta+Enter", "⌘ Enter");
          await d.wait(2500);
        },
      },
      {
        cap: "Export, explain, create a view",
        say: "Under the editor: Explain Plan, Export C S V, Export JSON, Export S Q L, and Create view, which turns a query into a view.",
        act: async (d) => {
          for (const b of ["button >> Explain Plan", "button >> Export CSV", "button >> Export JSON", "button >> Export SQL", "button >> Create view"]) await d.hover(S + b, 900);
        },
      },
      {
        cap: "DB Backup / Dump",
        say: "DB Backup and Dump writes a full S Q L dump in one click. Choose complete, schema only, or data only, tick the tables, and generate. You get the create table statements and every insert.",
        act: async (d) => {
          await d.click(S + "#btnDbBackupDump", { pause: 2500 });
          await d.scroll(S + "pre, .dump-preview, textarea", 300, 5).catch(() => {});
          await d.wait(2000);
        },
      },
      {
        cap: "Copy it, download it, or open it in the editor",
        say: "Copy S Q L, Download dot sql, or Open in S Q L I D E, which loads the dump into the editor to read or run. It is plain S Q L that you own.",
        act: async (d) => {
          await d.hover(S + "button >> Copy SQL", 800);
          await d.hover(S + "button >> Download .sql", 800);
          await d.click(S + "button >> Open in SQL IDE", { pause: 2500 });
        },
      },
    ],
  },
];
