import type { Chapter } from "./fm_tutorial_types";
import { startLockDemo } from "./mysql_tutorial_env";
import { S } from "./mysql_tutorial_helpers";

let endLockDemo: (() => void) | null = null;

/** Chapter 8: the live diagnostics panes: activity and locks, replication and binary logs, query plans, raw JSON, maintenance, telemetry. */
export const diagChapters: Chapter[] = [
  {
    id: "09_diagnostics", chapter: "DIAGNOSTICS", title: "Live activity, locks, plans and maintenance",
    blurb: "The process list and lock monitor, binary logs, the query plan visualizer, raw JSON, maintenance and telemetry",
    steps: [
      {
        cap: "Live Activity & Locks: the process list",
        say: "Live activity is the server's process list: every connection, its user, database, state, time, and the statement it runs, including the studio's own sleeping connections.",
        act: async (d) => {
          await d.click(S + "#tabBtnActivity", { pause: 1500 });
          await d.hover(S + "td >> EXECUTING", 900).catch(() => {});
          await d.hover(S + "td >> Sleep", 900).catch(() => {});
        },
      },
      {
        cap: "A real lock, seen in the process list",
        say: "Now trouble, on purpose: two sessions fight over one row. The process list shows the one holding the lock, running a sleep, and the update waiting. Kill ends a process; I won't press it. The green banner reads an old lock table that new MySQL lacks, so here the list is the truth.",
        act: async (d) => {
          endLockDemo?.();
          endLockDemo = startLockDemo();
          await d.wait(3500);
          await d.click(S + "button >> Refresh", { pause: 1800 });
          await d.hover(S + "tr >> SLEEP(60)", 1500);
          await d.hover(S + "tr >> UPDATE products", 1800);
          await d.hover(S + "button >> Kill", 1000);
        },
      },
      {
        cap: "Replication & Binlog",
        say: "Replication and binary logs. This server is standalone, so no replica threads are configured. Below are the binary log files and sizes, and the current file and position. On a replica, you would watch the lag here.",
        act: async (d) => {
          endLockDemo?.(); endLockDemo = null;
          await d.click(S + "#tabBtnReplication", { pause: 1500 });
          await d.hover(S + "td >> No replica", 1000).catch(() => {});
          await d.scroll(S + "#tabBtnReplication", 0, 1).catch(() => {});
          await d.hover(S + "td >> binlog", 1500).catch(() => {});
        },
      },
      {
        cap: "Query Plan Visualizer",
        say: "The query plan visualizer. I write a join of orders and customers and press Explain Plan. It shows a tree of steps with cost, estimated and actual rows and time. A full scan is red, an index lookup green.",
        act: async (d) => {
          await d.click(S + "button >> Run Query", { pause: 1500 });
          if (!(await d.c.exists(S + "#sqlEditor"))) await d.click(S + "#btnToggleEditor", { pause: 900 });
          await d.click(S + "#sqlEditor", { pause: 400 });
          await d.key("Meta+a", "⌘ A");
          await d.type("SELECT o.order_number, c.name, o.total_amount FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'shipped';", 20);
          await d.click(S + "button >> Explain Plan", { pause: 2500 });
          await d.wait(2500);
        },
      },
      {
        cap: "Raw JSON Inspector",
        say: "The raw JSON inspector shows the last result exactly as received, ready to copy into code or a test.",
        act: async (d) => {
          await d.click(S + "#tabBtnJson", { pause: 1500 });
          await d.scroll(S + "#tabBtnJson", 0, 1).catch(() => {});
          await d.wait(2500);
        },
      },
      {
        cap: "MySQL Maintenance",
        say: "Maintenance has one click tools: inspect the buffer pool size, S Q L mode and maximum connections, and optimize all tables. I run the inspections, then optimize. The output appears below.",
        act: async (d) => {
          await d.click(S + "#tabBtnPragma", { pause: 1500 });
          await d.click(S + "button >> Inspect innodb_buffer_pool_size", { pause: 2200 });
          await d.click(S + "button >> Inspect sql_mode", { pause: 2200 });
          await d.click(S + "button >> Inspect max_connections", { pause: 2200 });
          await d.click(S + "button >> Optimize all tables", { pause: 3500 });
        },
      },
      {
        cap: "Telemetry & Audit Log",
        say: "Telemetry and audit log: what the studio did, with timestamps. A handy trail when several people share a database.",
        act: async (d) => {
          await d.click(S + "#tabBtnAudit", { pause: 1500 });
          await d.wait(3000);
        },
      },
    ],
  },
];
