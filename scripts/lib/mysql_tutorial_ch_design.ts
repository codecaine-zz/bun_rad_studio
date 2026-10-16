import type { Chapter } from "./fm_tutorial_types";
import { S, choose, dialogButton } from "./mysql_tutorial_helpers";

/** Chapter 7: the visual query designer, the schema designer, the ENUM and SET manager, and the partition explorer. */
export const designChapters: Chapter[] = [
  {
    id: "08_design", chapter: "DESIGNERS", title: "Design queries and schemas visually",
    blurb: "The visual query designer, schema designer and DDL, ENUM and SET types, and partition trees",
    steps: [
      {
        cap: "Visual Query Designer: tables as cards",
        say: "The visual query designer draws a query. I load the four table e-commerce template: customers, orders, order items and products appear as cards, with keys marked and data types on the right.",
        act: async (d) => {
          await d.click(S + "#tabBtnDesigner", { pause: 1200 });
          await choose(d, "#designerPresetSelect", "4-Table");
          await d.wait(3000);
        },
      },
      {
        cap: "Joins with cardinality badges",
        say: "Lines are joins. The small badges are cardinality: one at the parent, infinity at the child, so one customer has many orders. Drag fields to make joins, and headers to move cards.",
        act: async (d) => {
          await d.hover(S + ".qbe-table-card-header >> customers", 900);
          await d.hover(S + ".qbe-cardinality-badge", 900);
          await d.hover(S + ".qbe-table-card-header >> order_items", 900);
          await d.hover(S + ".qbe-table-card-header >> products", 900);
        },
      },
      {
        cap: "Join Properties: five kinds of join",
        say: "Every join is listed under the canvas. Properties opens a dialog with five choices in plain words: inner join, left or right outer, full outer, or Cartesian product. I cancel, and keep the inner join.",
        act: async (d) => {
          await d.click(S + "button >> Properties", { pause: 2000 });
          await d.wait(3000);
          await dialogButton(d, "Cancel");
        },
      },
      {
        cap: "Run it, and see the S Q L it wrote",
        say: "Run executes the design, and results arrive in the datasheet. The S Q L tab shows the statement the designer wrote, so it teaches the syntax too.",
        act: async (d) => {
          await d.click(S + "#btnDesignerRun", { pause: 2500 });
          await d.click(S + ".qbe-view-btn >> Datasheet", { pause: 2200 });
          await d.click(S + ".qbe-view-btn >> SQL", { pause: 2500 });
          await d.click(S + ".qbe-view-btn >> Design", { pause: 600 });
        },
      },
      {
        cap: "Schema Designer & DDL",
        say: "The schema designer shows a table's structure: columns, types, key, not null, default, and the exact create table statement. Buttons add a column, an index, rename, import, export, empty or delete the table.",
        act: async (d) => {
          await d.click(S + "#tabBtnSchema", { pause: 1500 });
          for (const b of ["button >> Add column", "button >> New index", "button >> Rename", "button >> Import data"]) await d.hover(S + b, 800);
          await d.scroll(S + "#tabContentSchema, .tab-content.active, body", 400, 6).catch(() => {});
          await d.wait(2500);
        },
      },
      {
        cap: "Custom Types & ENUMs",
        say: "Custom types lists every enum and set column with its allowed values. Add Value extends a list, and Add ENUM Column opens a form to add a new one, with no alter table to remember.",
        act: async (d) => {
          await d.click(S + "#tabBtnTypes", { pause: 1500 });
          await d.hover(S + "button >> Add Value", 900);
          await d.click(S + "button >> Add ENUM Column", { pause: 2000 });
          await d.wait(2500);
          await d.c.evalFrame("iframe ||| iframe", `document.querySelector('.modal-overlay.active .modal-close, .modal-overlay[style*=flex] .modal-close')?.click()`);
          await d.wait(500);
        },
      },
      {
        cap: "Partition Trees",
        say: "Partition trees: sales history is partitioned by range on the sale year. Each partition shows its bound, size and estimated rows, with a catch all for the future.",
        act: async (d) => {
          await d.click(S + "#tabBtnPartitions", { pause: 1500 });
          await d.hover(S + "td >> p2024", 900);
          await d.hover(S + "td >> p_future", 900);
        },
      },
    ],
  },
];
