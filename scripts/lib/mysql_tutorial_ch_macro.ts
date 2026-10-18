import type { Chapter } from "./fm_tutorial_types";
import { S, inStudio } from "./mysql_tutorial_helpers";

/** Chapter 9: build a macro in the macro designer and run it. */
export const macroChapters: Chapter[] = [
  {
    id: "10_macros", chapter: "MACROS", title: "Automate it: build and run a macro",
    blurb: "The macro designer: actions, conditions, a dry run, and the execution trace",
    steps: [
      {
        cap: "The Macro Designer",
        say: "The macro designer automates steps in a grid of actions. This is AutoExec: comment, message box, open a table, filter, refresh. Each row has a condition, an action, arguments, and switches.",
        act: async (d) => {
          await d.click(S + "#tabBtnMacros", { pause: 1500 });
          await d.hover(S + ".macro-action-select", 900);
          await d.hover(S + ".macro-condition-input", 900);
        },
      },
      {
        cap: "A new macro, from the action catalog",
        say: "I make a new macro, top customers. The catalog lists every action: run S Q L, insert, update, delete, make a table, and more. I turn the second row into a Run S Q L action.",
        act: async (d) => {
          await d.click(S + ".sidebar-mini-btn >> 📄 New", { pause: 1500 });
          await d.click(S + "#macroNameInput", { pause: 400 });
          await d.key("Meta+a", "⌘ A");
          await d.type("Top customers", 60);
          await d.hover(S + ".sidebar-mini-btn >> + Add", 800);
          await inStudio(d, `(() => { const s = document.querySelectorAll('.macro-action-select')[1]; s.value = 'RunSQL'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
          await d.wait(1500);
        },
      },
      {
        cap: "Give the action its S Q L",
        say: "Run S Q L takes a statement. I type a query for the five biggest balances. Conditions can guard a row, and on error decides whether the macro stops or continues.",
        act: async (d) => {
          await inStudio(d, `(() => { document.querySelectorAll('[data-vid]').forEach((e) => e.removeAttribute('data-vid')); let row = document.querySelectorAll('.macro-action-select')[1]; while (row && !row.querySelector('.macro-param-input')) row = row.parentElement; row.querySelector('.macro-param-input').setAttribute('data-vid', 'f'); })()`);
          await d.click(S + "[data-vid=f]", { pause: 400 });
          await d.key("Meta+a", "⌘ A");
          await d.type("SELECT name, tier, balance FROM customers ORDER BY balance DESC LIMIT 5", 35);
          await d.wait(800);
          await d.hover(S + "#macroOnErrorSelect", 900);
        },
      },
      {
        cap: "Save, dry run, run",
        say: "Save keeps it. Dry Run goes through the steps in a transaction that rolls back, and reports what would happen. Run does it for real, and the console traces every step and its time. Macros also export as S Q L or code.",
        act: async (d) => {
          await d.click(S + "button >> 💾 Save", { pause: 1500 });
          await d.click(S + "#btnDryRun", { pause: 2500 });
          await d.click(S + "#btnRunMacro", { pause: 3000 });
          await d.hover(S + ".sidebar-mini-btn >> 📜 SQL", 800);
          await d.hover(S + ".sidebar-mini-btn >> 🧬 Code", 800);
        },
      },
    ],
  },

  {
    id: "10b_studio_ide_v2", chapter: "STUDIO IDE V2", title: "Row inspector, FK jump, SQL worksheets, ER diagram, schema diff & codegen",
    blurb: "Side row inspector, foreign-key navigation, multi-tab SQL IDE, ER canvas, schema diff and five-language code generation",
    steps: [
      {
        cap: "Side Row Inspector & FK ↗ Jump",
        say: "In the Data Grid, Row View opens the Side Row Inspector on the right, showing every column of the selected row with a type badge, a Null toggle, a JSON formatter, and a Save Row button. Foreign-key cells also have a jump arrow that filters the parent table in one click.",
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
        say: "In Table Design, E R Diagram draws every table and foreign-key relationship on an interactive canvas, and Schema Diff captures a baseline snapshot to generate migration D D L. And in the Macro Designer, the Code button compiles any macro into TypeScript, Python, Go, Rust, or C Sharp.",
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
];

