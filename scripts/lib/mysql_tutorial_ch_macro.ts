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
];
