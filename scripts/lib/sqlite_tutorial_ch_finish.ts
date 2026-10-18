import type { Chapter } from "./fm_tutorial_types";
import { S, inStudio, pick, selectText, skipWelcome, studioReady, tagText, openDatabasesTool, saveFoundConnection } from "./sqlite_tutorial_helpers";

const MODAL = `${S}[class*=modal]`;

/** Chapters 10 to 15: macros, tools, export and backup, import with staging, safety, and the closing card. */
export const finishChapters: Chapter[] = [
  {
    id: "10_macros", chapter: "MACROS", title: "Building and running a macro", blurb: "A list of actions that runs in one click",
    before: (d) => studioReady(d),
    steps: [
      {
        cap: "The macro designer",
        say: "A macro is a saved list of actions, run in order. The Macro Designer lists the macros saved in this database, including Auto Exec, which ran when we opened it. Each row has an optional condition, an action, its arguments, and switches. The catalog has more than twenty actions.",
        act: async (d) => {
          await d.click(S + "#tabBtnMacros", { pause: 1500 });
          await d.hover(S + "#macroSelector", 1500);
          await d.hover(S + "#btnToggleCatalog", 1200);
        },
      },
      {
        cap: "A new macro with a RunSQL action",
        say: "New starts a macro with a comment and a message box. I name it customer report, add a Run S Q L action, and type a query: how many customers are in each tier. Conditions are optional, and make an action run only when they are true.",
        act: async (d) => {
          await d.click(S + "button >> 📄 New", { pause: 1200 });
          await d.click(S + "#macroNameInput", { pause: 400 });
          await selectText(d, "#macroNameInput");
          await d.type("Customer_Report", 60);
          await d.key("Tab");
          await d.click(S + "button >> + RunSQL", { pause: 1200 });
          await inStudio(d, `(() => { const els = [...document.querySelectorAll('input[type=text], input:not([type]), textarea')].filter((e) => e.offsetWidth > 0 && e.id !== 'catalogSearchInput' && e.id !== 'searchObjects' && e.id !== 'macroNameInput' && !(e.placeholder || '').startsWith('e.g.') && e.closest('#panelMacros, [id*=acro]')); const e = els[els.length - 1]; e.setAttribute('data-tut', 'macro-sql'); })()`);
          await d.click(S + "[data-tut=macro-sql]", { pause: 500 });
          await selectText(d, "[data-tut=macro-sql]");
          await d.type("SELECT tier, count(*) AS customers FROM customers GROUP BY tier;", 30);
          await d.wait(400);
        },
      },
      {
        cap: "Save and Run: the console traces every step",
        say: "Save stores the macro in the database. Run executes the actions in order. The message box waits for you, so I press O K, and the console below traces every step with its timing.",
        act: async (d) => {
          await d.click(S + "button >> 💾 Save", { pause: 1200 });
          await d.click(S + "#btnRunMacro", { pause: 1500 });
          await d.waitFor(S + "#msgBoxBtnOk", 15000);
          await d.wait(900);
          await d.click(S + "#msgBoxBtnOk", { pause: 2500 });
        },
      },
      {
        cap: "Dry Run, Atomic, Single Step, export",
        say: "Dry Run executes the data steps and rolls everything back. Atomic commits only if every step succeeds. Single Step pauses before each action. A macro can be duplicated, and exported as J S O N, as S Q L, or as a V B A module.",
        act: async (d) => {
          for (const t of ["#btnDryRun", "#btnAtomicRun", "#btnSingleStep", "button >> Duplicate", "button >> Export", "button >> SQL", "button >> VBA"]) await d.hover(S + t, 900);
        },
      },
    ],
  },

  {
    id: "11_tools", chapter: "TOOLS", title: "Inspect, tune and maintain", blurb: "JSON, audit, pragma, vacuum, integrity and shortcuts",
    before: (d) => studioReady(d),
    steps: [
      {
        cap: "The J S O N inspector and the audit log",
        say: "The Raw J S O N Inspector shows the current rows exactly as the studio received them, handy when you build an A P I around the same data. The Telemetry and Audit Log tab shows the studio's own activity messages. In this short session there is only one, saying the studio started.",
        act: async (d) => {
          await d.click(S + "#tabBtnJson", { pause: 3000 });
          await d.click(S + "#tabBtnAudit", { pause: 3000 });
        },
      },
      {
        cap: "PRAGMA, Vacuum and Integrity Check",
        say: "The Pragma tab is a small control room: W A L mode, foreign keys, page cache, vacuum, analyze, and the full integrity check, with the result printed below. I run Analyze and the check. Vacuum D B and Integrity Check are also in the header.",
        act: async (d) => {
          await d.click(S + "#tabBtnPragma", { pause: 1500 });
          await d.click(S + "button >> Run ANALYZE", { pause: 1800 });
          await d.click(S + "button >> Run Full PRAGMA integrity_check", { pause: 2500 });
          await d.click(S + "button >> Integrity Check", { pause: 2200 });
          if (await d.c.exists(S + "#msgBoxBtnOk")) await d.click(S + "#msgBoxBtnOk", { pause: 800 });
        },
      },
      {
        cap: "Keyboard shortcuts: F1",
        say: "Press F1, or Command and slash, for the list of shortcuts. Command and Enter runs a query, Alt and Enter focuses the section under the pointer, F eleven toggles full screen, and Escape closes any dialog.",
        act: async (d) => { await d.key("F1"); await d.wait(3500); await d.key("Escape"); },
      },
    ],
  },

  {
    id: "11b_studio_ide_v2", chapter: "STUDIO IDE V2", title: "Row inspector, FK jump, SQL worksheets, ER diagram, schema diff & codegen", blurb: "Side row inspector, foreign-key navigation, multi-tab SQL IDE, ER canvas, schema diff and five-language code generation",
    before: (d) => studioReady(d),
    steps: [
      {
        cap: "Side Row Inspector & FK ↗ Jump",
        say: "In the Data Grid, Row View opens the Side Row Inspector on the right, showing every field of the selected row with a type badge, a Null toggle, a JSON formatter, and a Save Row button. Foreign-key cells also have a jump arrow that filters the parent table in one click.",
        act: async (d) => {
          await d.click(S + "#tabBtnGrid", { pause: 600 });
          await d.click(S + ".tree-item-title >> orders", { pause: 900 });
          await d.click(S + "#btnToggleRowInspector", { pause: 900 });
          await d.click(S + "#gridBody tr", { pause: 1300 });
          await d.hover(S + "#studioRowInspector", 1200).catch(() => {});
          if (await d.c.exists(S + ".studio-fk-jump")) {
            await d.click(S + ".studio-fk-jump", { pause: 1400 });
          }
          await d.click(S + "#btnToggleRowInspector", { pause: 700 });
        },
      },
      {
        cap: "Multi-Tab SQL Worksheets, Format, History & Guards",
        say: "In the S Q L editor, the plus button opens additional worksheet tabs that stay saved across sessions. Format S Q L indents your query, History recalls past runs, and the Transaction and Read-Only Guard bar gives you Begin, Commit, Rollback, and a safety lock that blocks destructive statements.",
        act: async (d) => {
          if (!(await d.c.exists(S + "#sqlEditor"))) await d.click(S + "#btnToggleEditor", { pause: 600 });
          await d.click(S + "#btnAddWorksheet", { pause: 800 });
          await d.click(S + ".studio-ws-tab", { pause: 600 });
          await d.click(S + "#btnStudioFormatSql", { pause: 900 });
          await d.click(S + 'button[onclick="runEditorQuery()"]', { pause: 1000 });
          await d.click(S + "#btnStudioSqlHistory", { pause: 1100 });
          await d.click(S + "#btnStudioHistClose", { pause: 500 });
          await d.click(S + "#btnTxBegin", { pause: 900 });
          await d.click(S + "#btnTxCommit", { pause: 800 });
          await d.click(S + "#btnReadOnlyGuard", { pause: 800 });
          await d.click(S + "#btnReadOnlyGuard", { pause: 600 });
        },
      },
      {
        cap: "Full ER Diagram, Schema Diff & 5-Language Codegen",
        say: "In Schema Designer, E R Diagram draws every table and foreign-key relationship on an interactive canvas, and Schema Diff captures a baseline snapshot to generate migration D D L. And in the Macro Designer, the Code button compiles any macro into TypeScript, Python, Go, Rust, or C Sharp.",
        act: async (d) => {
          await d.click(S + "#tabBtnSchema", { pause: 900 });
          await d.click(S + "#btnSchemaModeEr", { pause: 1400 });
          await d.hover(S + "#studioErDiagramPane", 1100).catch(() => {});
          await d.click(S + "#btnSchemaModeDiff", { pause: 1000 });
          await d.click(S + "#btnCaptureBaseline", { pause: 900 });
          await d.click(S + "#btnRunSchemaDiff", { pause: 1100 });
          await d.click(S + "#btnSchemaModeTable", { pause: 500 });
          await d.click(S + "#tabBtnMacros", { pause: 900 });
          await d.click(S + 'button[onclick="openCodeGenForCurrentMacro()"]', { pause: 1100 });
          for (const lang of ["bun-sql", "typescript", "python", "vlang"]) {
            await d.click(S + `#macroCodeTabs button[data-target="${lang}"]`, { pause: 650 });
          }
          await d.click(S + 'button[onclick="closeCodeGenModal()"]', { pause: 500 });
        },
      },
    ],
  },

  {
    id: "12_backup", chapter: "EXPORT", title: "Export and one-click backup", blurb: "Export a table, or dump the whole database",
    before: (d) => studioReady(d),
    steps: [
      {
        cap: "Export a whole table",
        say: "The Export button above the grid exports the whole table, not only the visible page. Choose C S V, T S V for spreadsheets, J S O N, J S O N Lines, S Q L inserts, or Markdown. Then copy it to the clipboard, or save a file.",
        act: async (d) => {
          await d.click(S + "button >> 📤 Export", { pause: 1500 });
          for (const [i, t] of ["JSON", "SQL INSERTs", "Markdown", "CSV"].entries()) {
            await tagText(d, t, `chip${i}`);
            await d.click(`${S}[data-tut=chip${i}]`, { pause: 1000 });
          }
          await d.key("Escape");
        },
      },
      {
        cap: "DB Backup / Dump",
        say: "D B Backup and Dump writes the whole database as one S Q L script. Complete has the schema and the data in a safe transaction. Schema only has the definitions, data only has the inserts. Untick tables to leave them out. Copy it, download it, or open it in the editor.",
        act: async (d) => {
          await d.click(S + "#btnDbBackupDump", { pause: 2000 });
          await pick(d, "dumpModeSelect", "schema");
          await d.click(`${S}button >> Generate Dump`, { pause: 1800 });
          await pick(d, "dumpModeSelect", "all");
          await d.click(`${S}button >> Generate Dump`, { pause: 1500 });
          for (const t of ["Copy SQL", "Download .sql", "Open in SQL IDE"]) await d.hover(`${S}button >> ${t}`, 1000);
          await d.key("Escape");
        },
      },
    ],
  },

  {
    id: "13_staging", chapter: "IMPORT", title: "Import with staging, from the file list", blurb: "Check the rows first, then promote them",
    before: async (d) => { await skipWelcome(d); await d.wait(400); await openDatabasesTool(d); await saveFoundConnection(d); await d.click("#power-close", { pause: 800 }); },
    steps: [
      {
        cap: "Load into a database (staging first)",
        say: "Back in the file list, right click the C S V and choose Load into a database, staging first. Pick the saved connection, and where to open the wizard: in this tab, its own window, or your browser. The file is only read, never changed.",
        act: async (d) => {
          await d.rclick("#list .row >> new-customers.csv", { pause: 900 });
          await d.click(".menu [role^=menuitem] >> Load into a database", { pause: 1800 });
          await d.hover(".dialog select", 1500);
          await d.hover(".dialog label >> Here, in this tab", 1500);
        },
      },
      {
        cap: "Source: the file is already chosen",
        say: "Open the import wizard. The studio starts, and the wizard opens with the file already chosen, and its layout detected: commas, quotes, U T F eight, and a first row of column names. There are five steps, from source to review and promote.",
        act: async (d) => {
          await d.click(".dialog button >> Open the import wizard", { pause: 500 });
          await d.waitFor(S + "#msgBoxBtnOk", 30000);
          await d.wait(600);
          await d.click(S + "#msgBoxBtnOk", { pause: 2800 });
        },
      },
      {
        cap: "Map, then load to staging",
        say: "Map: I choose the customers table, and columns are matched by name, with clean ups and checks you can add. Next copies the rows into a staging table. Six rows copied, and the message says the customers table has not been touched.",
        act: async (d) => {
          await d.click(S + "button >> Next: choose where it goes", { pause: 1500 });
          await inStudio(d, `(() => { const s = [...document.querySelectorAll('select')].find((x) => x.textContent.includes('choose a table')); s.value = 'customers'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
          await d.wait(2200);
          await d.click(S + "button >> Next: load into staging", { pause: 3500 });
        },
      },
      {
        cap: "Check: problems before they matter",
        say: "Check the rows. The wizard counts the rows that are ready, the problems, the repeats, and which rows are new, already there, or changed. You can fix a cell, skip rows, clean a column, or download the problem rows as a C S V.",
        act: async (d) => { await d.click(S + "button >> Check the rows", { pause: 4500 }); },
      },
      {
        cap: "Review, promote, and check the table",
        say: "Review and promote. I choose add new rows only, and promote six rows in one transaction. An undo button can take the import back. Then I close the wizard, open customers, and search for Hana. She is in the real table.",
        act: async (d) => {
          await d.click(S + "button >> Next: review & promote", { pause: 1800 });
          await d.click(S + "label >> Add new rows only", { pause: 1200 });
          await d.click(S + "button >> Promote", { pause: 3500 });
          await inStudio(d, `(() => { const b = [...document.querySelectorAll('button')].filter((x) => x.offsetWidth > 0 && x.textContent.trim() === '✕'); const w = b.find((x) => x.parentElement && x.parentElement.textContent.includes('Staging area')); if (w) w.setAttribute('data-tut', 'wiz-close'); })()`);
          if (await d.c.exists(S + "[data-tut=wiz-close]")) await d.click(S + "[data-tut=wiz-close]", { pause: 1000 });
          await d.click(S + ".tree-item-title >> customers", { pause: 900 });
          await d.click(S + "#gridSearchInput", { pause: 400 });
          await d.type("Hana", 120);
          await d.wait(2500);
        },
      },
    ],
  },

  {
    id: "14_safety", chapter: "SAFETY", title: "Production connections and shortcuts", blurb: "Be asked before you touch something that matters",
    before: async (d) => { await skipWelcome(d); await d.wait(400); await openDatabasesTool(d); await saveFoundConnection(d); await d.click(".db-row >> shop.sqlite", { pause: 700 }); },
    steps: [
      {
        cap: "Mark it Production: a confirmation first",
        say: "Some databases matter more. Edit the connection and set its environment to production. Now Open in S Q Lite Studio asks first: you could change or delete data, open it anyway? The studios have no read only mode, so for a truly read only session, use a database account that can only read.",
        act: async (d) => {
          await d.click("button >> Edit…", { pause: 1200 });
          await d.eval(`(() => { const s = document.querySelector('.dialog select'); s.value = 'production'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
          await d.wait(1500);
          await d.click(".dialog button >> Save", { pause: 1800 });
          await d.click("button >> Open in SQLite Studio", { pause: 1800 });
          await d.hover(".dialog button >> Open anyway", 1500);
          await d.click(".dialog button >> Cancel", { pause: 900 });
        },
      },
      {
        cap: "Favorites, Home tiles and Shift Enter",
        say: "Mark a connection as a favorite, and the Home page shows a tile for it, together with your most recent ones, that opens it in one click. Shift and Enter on a connection in the list opens it in its own window or in your browser, as you choose in Settings.",
        act: async (d) => {
          await d.click("button >> Favorite", { pause: 1200 });
          await d.click("#view-home", { pause: 1500 });
          await d.hover(".ht-title >> shop.sqlite", 2500);
        },
      },
    ],
  },

  {
    id: "15_outro", chapter: "THANK YOU", title: "Thank you for watching", kind: "card",
    card: { kicker: "Free and open source", title: "Thank you for watching", lines: ["Guide: docs/userguides/01_sqlite_studio.md", "File Manager guide: docs/userguides/43_file_manager.md", "github.com/codecaine-zz/bun_rad_studio"] },
    steps: [{
      cap: "Docs and download",
      say: "That is S Q Lite in the Codecaine File Manager. The user guides are in the docs folder of the project. Get Bun R A D Studio free at github dot com slash codecaine dash zz slash bun underscore rad underscore studio. The same studio also opens on its own. Thanks for watching.",
    }],
  },
];
