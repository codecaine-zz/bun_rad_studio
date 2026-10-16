import type { Chapter } from "./fm_tutorial_types";
import { S, chooseAnywhere } from "./mysql_tutorial_helpers";

/** Chapter 10: a CSV file in the file list goes into MySQL through the import wizard with staging, opened from its right-click menu. */
export const importChapters: Chapter[] = [
  {
    id: "11_import", chapter: "IMPORT", title: "Load a CSV file with staging, from the file list",
    blurb: "Right-click a file, check it in a staging table, then promote it into a real table",
    steps: [
      {
        cap: "Right-click a CSV: Load into a database",
        say: "Back in the file list, a small C S V: new products. Right click it: Load into a database, staging first. It works for C S V, T S V, JSON and JSON lines.",
        act: async (d) => {
          await d.rclick("#list .row >> new_products.csv", { pause: 900 });
          await d.hover(".menu [role^=menuitem] >> Load into a database", 1500);
        },
      },
      {
        cap: "Choose the connection and where to open",
        say: "It asks which saved connection, and where to open the wizard: this tab, its own window, or my browser. The file is only read, never changed, and goes to a studio on this computer only.",
        act: async (d) => {
          await d.click(".menu [role^=menuitem] >> Load into a database", { pause: 2000 });
          await d.hover(".dialog select", 1000);
          await d.wait(2500);
        },
      },
      {
        cap: "The wizard opens with the file already chosen",
        say: "The wizard opens with the file already chosen. It detected comma separated, U T F eight, a header row, five columns with guessed types, and shows the first rows to check.",
        act: async (d) => {
          await d.click(".dialog button >> Open the import wizard", { pause: 1500 });
          await d.waitFor(S + "#msgBoxBtnOk", 30000);
          await d.click(S + "#msgBoxBtnOk", { pause: 1000 });
          await d.click("#focus-toggle", { pause: 1200 });
          await d.wait(3000);
        },
      },
      {
        cap: "Map the columns to a table",
        say: "Next, I pick the products table, and the columns line up by name: S K U, name, category, price, stock. Missing ones use their defaults. The real table is untouched.",
        act: async (d) => {
          await d.click(S + "button >> Next: choose where it goes", { pause: 2000 });
          await chooseAnywhere(d, "products");
          await d.wait(3000);
        },
      },
      {
        cap: "Load to staging",
        say: "The rows are copied into a staging table, a holding area in the database. Five rows copied, and it says your table has not been touched.",
        act: async (d) => {
          await d.click(S + "button >> Next: load into staging", { pause: 3500 });
          await d.wait(3500);
        },
      },
      {
        cap: "Check the rows",
        say: "Now the check: invalid values, duplicates of existing keys, rows to skip. Here: five rows, five ready, no problems, five new to the table.",
        act: async (d) => {
          await d.click(S + "button >> Check the rows", { pause: 3500 });
          await d.wait(3500);
        },
      },
      {
        cap: "Review: choose how rows are added",
        say: "Review and promote asks how rows go in: add new only, upsert, update only, all or nothing, or append. The counts say five will be added.",
        act: async (d) => {
          await d.click(S + "button >> Next: review", { pause: 3000 });
          await d.wait(3500);
        },
      },
      {
        cap: "Promote: one transaction, with an undo",
        say: "Promote runs in one transaction. Five rows added, recorded in an import batches table, and the staging table is kept for seven days. There is an undo, and the file was never changed.",
        act: async (d) => {
          await d.click(S + "button >> Promote 5 rows", { pause: 3500 });
          await d.wait(3000);
        },
      },
    ],
  },
];
