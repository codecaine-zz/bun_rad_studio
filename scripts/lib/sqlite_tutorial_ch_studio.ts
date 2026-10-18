import type { Chapter } from "./fm_tutorial_types";
import { S, inStudio, pick, selectActive, selectText, setValue, studioReady, tagButton, tagField } from "./sqlite_tutorial_helpers";

const MODAL = `${S}[class*=modal]`;

/** Chapters 5 to 9: the studio's data grid, editing, table design, queries and the visual designer. */
export const studioChapters: Chapter[] = [
  {
    id: "05_grid", chapter: "DATA GRID", title: "Browsing a table", blurb: "Sort, filter, totals, columns and pages",
    before: (d) => studioReady(d),
    steps: [
      {
        cap: "Click a header to sort",
        say: "Click customers, and the data grid shows its rows, one page at a time. A click on a column header sorts by that column. I click name for alphabetical order, and click again to reverse it.",
        act: async (d) => { await d.hover(S + "th >> email", 1000); await d.click(S + "th >> name", { pause: 1800 }); await d.click(S + "th >> name", { pause: 1500 }); },
      },
      {
        cap: "Filter rows: find what you need",
        say: "The Filter rows box narrows the table to the rows that contain your text, in any column. I type Canada, and only the customers in Canada are left. The record count follows along.",
        act: async (d) => {
          await d.click(S + "#gridSearchInput", { pause: 500 });
          await d.type("Canada", 110);
          await d.wait(2000);
        },
      },
      {
        cap: "Totals row and the column chooser",
        say: "The Totals button pins a footer row with a count, and under number columns a sum and an average. The Columns button lists every column with its type and marks. Untick one and it is hidden. Only keys and Reset to default act on the whole list.",
        act: async (d) => {
          await d.click(S + "#btnToggleTotals", { pause: 2200 });
          await d.click(S + "#scBtn-grid", { pause: 1200 });
          await d.click(`${S}#scPop-grid label >> company`, { pause: 1300 });
          await d.click(`${S}#scPop-grid button >> Only keys`, { pause: 1300 });
          await d.click(`${S}#scPop-grid button >> Reset to default`, { pause: 1000 });
          await d.key("Escape");
        },
      },
      {
        cap: "Pages and page size",
        say: "The grid shows twenty five rows at a time. Prev and Next move between pages, and the box in the toolbar chooses twenty five, fifty, a hundred, two hundred and fifty, or five hundred rows per page.",
        act: async (d) => {
          await d.click(S + "#btnToggleTotals", { pause: 500 });
          await setValue(d, "#gridSearchInput", "");
          await d.wait(1200);
          await d.click(S + "button >> Next ▶", { pause: 1500 });
          await d.click(S + "button >> ◀ Prev", { pause: 1200 });
          await inStudio(d, `(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === '500')); s.value = '50'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
          await d.wait(1500);
        },
      },
      {
        cap: "Report: a printable datasheet",
        say: "Report builds a print ready datasheet of the grid, with a header, the database name, the time, and clean rows. Print it, save it as a P D F, or export a standalone H T M L file.",
        act: async (d) => { await d.click(S + "#btnAccessReport", { pause: 3500 }); await d.key("Escape"); },
      },
    ],
  },

  {
    id: "06_crud", chapter: "EDIT ROWS", title: "Add, edit and delete rows without SQL", blurb: "Forms, inline editing and the right-click menu",
    before: (d) => studioReady(d),
    steps: [
      {
        cap: "New Row: a form with a field per column",
        say: "To add a customer, press New Row. The form has a field for every column, with badges for the primary key and required fields. I type a name, an email and a company, and press Save row. Then I find it with the filter box.",
        act: async (d) => {
          await d.click(S + "button >> ➕ New Row", { pause: 1200 });
          await d.type("Zed Testwell", 70);
          await d.key("Tab");
          await d.type("zed.testwell@example.com", 40);
          await d.key("Tab");
          await d.type("Testwell Labs", 55);
          await d.wait(400);
          await d.click(`${MODAL} button >> Save row`, { pause: 1500 });
          await d.click(S + "#gridSearchInput", { pause: 400 });
          await d.type("Zed", 120);
          await d.wait(1200);
        },
      },
      {
        cap: "Edit and Duplicate",
        say: "Tick the row, and Edit opens the same form, filled in. I change the company and save. Duplicate copies the row into a new form, and here the email must change, because emails are unique.",
        act: async (d) => {
          await d.click(S + "tbody input[type=checkbox]", { pause: 700 });
          await d.click(S + "button >> 📝 Edit", { pause: 1200 });
          await tagField(d, "company", "company");
          await d.click(S + "[data-tut=company]", { pause: 400 });
          await selectText(d, "[data-tut=company]");
          await d.type("Testwell Group", 55);
          await d.click(`${MODAL} button >> Save changes`, { pause: 1400 });
          await d.click(S + "tbody input[type=checkbox]", { pause: 700 });
          await d.click(S + "button >> 📄 Duplicate", { pause: 1200 });
          await tagField(d, "email", "email");
          await d.click(S + "[data-tut=email]", { pause: 400 });
          await selectText(d, "[data-tut=email]");
          await d.type("zed.copy@example.com", 45);
          await d.click(`${MODAL} button >> Save row`, { pause: 1400 });
        },
      },
      {
        cap: "Inline editing and the right-click menu",
        say: "You can also double click any cell, type, and press Enter to save. Right click a row for the row menu: edit the cell, set it to null, copy the value, edit or duplicate the row, copy it for a spreadsheet, or delete it.",
        act: async (d) => {
          await d.dblclick(S + "tbody tr >> Testwell Group", { pause: 800 });
          await selectActive(d);
          await d.type("Testwell Inc", 55);
          await d.key("Enter");
          await d.wait(900);
          await d.rclick(S + "tbody tr >> zed.copy", { pause: 2500 });
          await d.key("Escape");
        },
      },
      {
        cap: "Delete asks first",
        say: "Tick the rows you no longer need and press Delete. The studio asks first. The header checkbox ticks the whole page. These two test rows go, and the table is back as it was.",
        act: async (d) => {
          await d.click(S + "thead input[type=checkbox]", { pause: 900 });
          await d.click(S + "button >> 🗑️ Delete", { pause: 1500 });
          await d.click(`${MODAL} button >> Delete`, { pause: 1500 });
        },
      },
    ],
  },

  {
    id: "07_design", chapter: "TABLE DESIGN", title: "Designing tables visually", blurb: "New table, design table and the schema tab",
    before: (d) => studioReady(d),
    steps: [
      {
        cap: "New Table: columns without writing SQL",
        say: "To create a table, press New Table. Name it, and add columns with a type picker. Each column can be a key, required, unique, have a default, or link to another table. Quick add buttons insert common columns, and a live preview shows the create statement. Create table.",
        act: async (d) => {
          await d.click(S + "#crudHdrNew", { pause: 1200 });
          await d.type("notes", 90);
          await d.click(`${MODAL} button >> created_at`, { pause: 1300 });
          await d.hover(`${MODAL} button >> Create table`, 1500);
          await d.click(`${MODAL} button >> Create table`, { pause: 2200 });
        },
      },
      {
        cap: "Design Table: change an existing table",
        say: "Design Table on an existing table lets you rename it, add, rename, reorder and remove columns, and change types. The table is rebuilt safely in one transaction, with the rows, indexes and triggers put back. Removed columns lose their data, so it warns you.",
        act: async (d) => {
          await d.click(S + ".tree-item-title >> customers", { pause: 900 });
          await d.click(S + "button >> 🛠️ Design Table", { pause: 2200 });
          await d.hover(`${MODAL} button >> Add column`, 1500);
          await d.hover(`${MODAL} button >> Apply changes`, 1500);
          await d.click(`${MODAL} button >> Cancel`, { pause: 800 });
        },
      },
      {
        cap: "The schema designer tab",
        say: "The Schema Designer tab shows the table's types, keys and defaults, and the create statement. Cards list its indexes, relationships and triggers. Buttons on top add a column or an index, rename, import, export, empty or delete the table.",
        act: async (d) => {
          await d.click(S + "#tabBtnSchema", { pause: 1500 });
          for (const t of ["Add column", "New index", "Rename", "Import data", "Export"]) await d.hover(`${S}button >> ${t}`, 800);
          await d.scroll(`${S}button >> Rename`, 600, 8);
          await d.wait(1500);
        },
      },
    ],
  },

  {
    id: "08_sql", chapter: "SQL EDITOR", title: "The SQL editor", blurb: "Run, explain, and turn a query into a view",
    before: async (d) => {
      await studioReady(d);
      await inStudio(d, `(() => { const b = document.getElementById('editorBanner'); if (b && !b.classList.contains('collapsed')) window.toggleEditorCollapse?.(); })()`);
    },
    steps: [
      {
        cap: "Presets, Execute and the filter bar",
        say: "The S Q L editor is folded away until you need it, so press Expand. The snippet list has ready made queries. I choose All Customers, and Execute. The toolbar shows the rows and the time. Results have a Filter Bar, and I type V I P under tier.",
        act: async (d) => {
          await d.click(S + "#btnToggleEditor", { pause: 1200 });
          if (!(await d.c.exists(S + "#sqlEditor"))) await d.click(S + "#btnToggleEditor", { pause: 600 });
          await d.hover(S + "#presetSelect", 900);
          await inStudio(d, `(() => { const s = document.getElementById('presetSelect'); s.selectedIndex = 6; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
          await d.wait(900);
          await d.click(S + "button >> Execute", { pause: 2000 });
          await d.click(S + "#btnToggleFilterBar", { pause: 900 });
          await d.click(S + "input >> @tier", { pause: 400 });
          await d.type("VIP", 110);
          await d.wait(1200);
        },
      },
      {
        cap: "Write a query, run it with Command Enter",
        say: "Now my own query. I clear the editor and type one: customers per country, with the average balance. Command and Enter run it, or Control and Enter on Windows and Linux.",
        act: async (d) => {
          await d.click(S + "button >> 🧹 Clear", { pause: 800 });
          await d.click(S + "#sqlEditor", { pause: 500 });
          await d.type("SELECT country, count(*) AS customers, round(avg(balance), 2) AS avg_balance FROM customers GROUP BY country ORDER BY customers DESC;", 22);
          await d.key("Meta+Enter", "⌘ Enter");
          await d.wait(1800);
        },
      },
      {
        cap: "Explain Plan: scan or index?",
        say: "Explain Plan asks S Q Lite how it would run a query, and the Query Plan Visualizer shows each step. For the orders of one customer it says SEARCH, using the index on customer id. A SCAN would mean reading the whole table.",
        act: async (d) => {
          await d.click(S + "#sqlEditor", { pause: 400 });
          await selectText(d, "#sqlEditor");
          await d.type("SELECT * FROM orders WHERE customer_id = 7;", 35);
          await d.click(S + "button >> Explain Plan", { pause: 3500 });
        },
      },
      {
        cap: "Create view from a query",
        say: "Happy with a query? Create view saves it as a view. Name it, and Check query tests it inside a transaction that is always rolled back. Then Create view, and it appears in the sidebar under Views.",
        act: async (d) => {
          await d.click(S + "#tabBtnGrid", { pause: 500 });
          await d.click(S + "#btnCreateViewFromQuery", { pause: 1300 });
          await d.type("orders_of_customer_7", 55);
          await d.click(S + "button >> Check query", { pause: 1800 });
          await tagButton(d, "Create view", "cv-ok");
          await d.click(S + "[data-tut=cv-ok]", { pause: 2200 });
        },
      },
      {
        cap: "Export the result",
        say: "Export C S V, Export J S O N and Export S Q L save the current result as a file. S Q L inserts are handy for moving a few rows into another database.",
        act: async (d) => { for (const t of ["#btnExportCsv", "#btnExportJson", "#btnExportSql"]) await d.hover(S + t, 1200); },
      },
    ],
  },

  {
    id: "09_designer", chapter: "QUERY DESIGNER", title: "The visual query designer", blurb: "Tables on a canvas, joins and generated SQL",
    before: (d) => studioReady(d),
    steps: [
      {
        cap: "A canvas for your tables",
        say: "The Query Designer builds a query without typing one. Tables are cards on a canvas, with keys and types. It starts with the table you selected, so I close the audit log card, and add orders, order items and products from the list.",
        act: async (d) => {
          await d.click(S + "#tabBtnDesigner", { pause: 1500 });
          await d.click(S + "#qbeTableCard_audit_logs button", { pause: 900 });
          for (const t of ["orders", "order_items", "products"]) {
            await pick(d, "designerTablePicker", t);
            await d.click(`${S}.qbe-ribbon button >> Add`, { pause: 700 });
          }
          await d.wait(400);
        },
      },
      {
        cap: "Auto-Detect Joins",
        say: "Auto Detect Joins reads the foreign keys and column names and links the tables for you. Customer id joins to customers, order id to orders, product id to products. I drag the cards apart so every join pill is easy to see.",
        act: async (d) => {
          await d.click(S + "button >> Auto-Detect Joins", { pause: 1800 });
          await d.c.drag(S + "#qbeTableCard_products .qbe-table-card-header", 150, 0);
          await d.c.drag(S + "#qbeTableCard_order_items .qbe-table-card-header", 100, 0);
          await d.c.drag(S + "#qbeTableCard_orders .qbe-table-card-header", 50, 0);
        },
      },
      {
        cap: "Join Properties",
        say: "Each link has a join pill and a Properties button. Choose the column on each side, and one of five join types: inner, left, right, full, or cross. Every choice explains in plain words which rows are kept.",
        act: async (d) => {
          await d.click(`${S}.qbe-join-badge button >> Properties`, { pause: 1800 });
          await d.hover(`${S}[class*=modal] label >> ALL records from 'customers'`, 1500);
          await d.hover(`${S}[class*=modal] label >> Cartesian`, 1500);
          await d.click(`${MODAL} button >> Cancel`, { pause: 800 });
        },
      },
      {
        cap: "Run, and the generated SQL",
        say: "Run, or Command and Enter, executes the query and shows the datasheet. Press S Q L to see what the designer wrote: the select list, and every inner join with its on condition. Run it as written, copy it, or load it into the editor.",
        act: async (d) => {
          await d.click(S + "#btnDesignerRun", { pause: 3000 });
          await d.click(`${S}.qbe-view-btn >> SQL`, { pause: 2500 });
          await d.hover(S + "button >> Copy SQL", 900);
          await d.hover(S + "button >> Load into Editor", 900);
        },
      },
    ],
  },
];
