/**
 * RAD Tutorial 12 — Full-Featured Studio Workspace Template
 * Combines: Menu Bar, Toolbar, Theme Selector, Multi-Tab Navigation,
 * Live Keystroke Search + Category Filtering, SQLite CRUD, Charts/Donut/Activity Rings/Sparkline/Timer,
 * Context Menus, SweetAlert2 fire(), Webview File Picker, and Reactive State.
 *
 * Run:  bun run examples/rad_tutorial/12_full_studio_workspace_template.ts
 */
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";
import { rad } from "../../src/features/rad/index.ts";

export function createFullStudioWorkspace(dbPath = ":memory:"): SimpleWindow {
  // 1. Initialize Embedded SQLite Database (WAL mode via rad.sqliteutils)
  const db = rad.sqliteutils.openDb(dbPath);
  rad.sqliteutils.execSql(
    db,
    `CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL
    )`,
  );

  if (rad.sqliteutils.countRows(db, "tasks") === 0) {
    rad.sqliteutils.insertMany(db, "tasks", [
      {
        title: "Configure WAL checkpoints",
        category: "Database",
        priority: "High",
        status: "Done",
      },
      {
        title: "Add multi-tab workspace switcher",
        category: "Frontend",
        priority: "High",
        status: "Done",
      },
      {
        title: "Wire real-time keystroke search filter",
        category: "Frontend",
        priority: "Medium",
        status: "In Progress",
      },
      {
        title: "Benchmark wyhash & BloomFilter",
        category: "Backend",
        priority: "Low",
        status: "Todo",
      },
      {
        title: "Deploy production binary build",
        category: "DevOps",
        priority: "High",
        status: "In Progress",
      },
    ]);
  }

  // 2. Create Desktop Window
  const win = newSimpleWindow("⚡ OmniStudio RAD Workspace", 1080, 780, {
    theme: "apple_dark",
    padding: 16,
    spacing: 10,
  });

  // 3. Top Menu Bar & Quick Action Toolbar
  win.addMenuBar("mainMenu", [
    {
      label: "File",
      items: ["📄 New Task", "💾 Export JSON...", "---", "🚪 Exit"],
    },
    {
      label: "View",
      items: ["🗂 Tasks & Search", "📊 Telemetry & Charts", "⚙️ Settings"],
    },
    { label: "Help", items: ["ℹ️ About OmniStudio"] },
  ]);

  win.addToolBar("mainToolbar", [
    "➕ Quick Task",
    "🔄 Refresh",
    "📊 Pulse Check",
    "💾 Export JSON",
  ]);

  // 4. Header Row with Live Theme Switcher
  win.beginRow();
  win.addHeading(
    "⚡ OmniStudio Workspace",
    "Tabs, Live Search, SQLite CRUD, Charts & Rich Dialogs",
  );
  win.addThemeSelector("dd_theme", "Theme:");
  win.endRow();

  // 5. Tab Bar Navigation (Switches visible workspace sections)
  const TAB_GROUPS: Record<string, string[]> = {
    "🗂 Tasks & Search": ["cardSearch", "tblTasks", "cardEditor"],
    "📊 Telemetry & Charts": ["cardKpis", "cardCharts", "cardFeed"],
    "⚙️ Settings": ["cardSettings"],
  };

  function activateTab(w: SimpleWindow, tabName: string) {
    for (const [tab, ids] of Object.entries(TAB_GROUPS)) {
      if (tab === tabName) w.showControls(ids);
      else w.hideControls(ids);
    }
    w.setState("active_tab", tabName);
    w.setStatusBarText(
      `View: ${tabName} | Total tasks: ${rad.sqliteutils.countRows(db, "tasks")}`,
    );
  }

  win
    .addTabs(["🗂 Tasks & Search", "📊 Telemetry & Charts", "⚙️ Settings"], 0)
    .id("workspaceTabs")
    .bindViews(TAB_GROUPS, (w, tabName) => {
      w.setState("active_tab", tabName);
      w.setStatusBarText(
        `View: ${tabName} | Total tasks: ${rad.sqliteutils.countRows(db, "tasks")}`,
      );
    });

  // ============================================================================
  // TAB 1: LIVE SEARCH FILTERING + SQLITE DATA TABLE + CRUD EDITOR
  // ============================================================================
  const refreshTable = (w: SimpleWindow) => {
    const q = (w.getText("txtSearch") || "").trim();
    const cat = w.getText("cmbCatFilter") || "All";
    const clauses: string[] = [];
    const params: any[] = [];

    if (q) {
      clauses.push("(title LIKE ? OR priority LIKE ? OR status LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (cat && cat !== "All") {
      clauses.push("category = ?");
      params.push(cat);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = rad.sqliteutils.queryAll<any>(
      db,
      `SELECT id, title, category, priority, status FROM tasks ${whereSql} ORDER BY id DESC`,
      params,
    );

    w.setTableRows(
      "tblTasks",
      rows.map((r) => [
        String(r.id),
        r.title,
        r.category,
        r.priority,
        r.status,
      ]),
    );
    w.setText("bdgCount", `${rows.length} matching`);
    w.setStatusBarText(`Showing ${rows.length} task(s)`);
  };

  win.beginCard("🔍 Live Search & Multi-Facet Filter").id("cardSearch");
  win.beginRow();
  win
    .addSearchInput("Filter by title, priority, or status...", (w) =>
      refreshTable(w),
    )
    .id("txtSearch")
    .width(340);
  win
    .addDropdown(
      ["All", "Database", "Frontend", "Backend", "DevOps"],
      "All",
      (w) => refreshTable(w),
    )
    .id("cmbCatFilter")
    .width(160);
  win
    .addButton("🧹 Reset", (w) => {
      w.setText("txtSearch", "");
      w.setValue("cmbCatFilter", "All");
      refreshTable(w);
    })
    .width(95);
  win.addBadge("5 matching", "info").id("bdgCount");
  win.endRow();
  win.endCard();

  win
    .addTable(
      "tblTasks",
      ["ID", "Task Title", "Category", "Priority", "Status"],
      [],
      (w, rowId) => {
        w.setState("selected_task_id", String(rowId));
        w.setStatusBarText(
          `Selected task #${rowId} (Double-click row to toggle Done)`,
        );
      },
    )
    .onDoubleClick((w, rowId) => {
      const row = rad.sqliteutils.selectOne<any>(db, "tasks", "id = ?", [
        Number(rowId),
      ]);
      if (!row) return;
      const nextStatus = row.status === "Done" ? "In Progress" : "Done";
      rad.sqliteutils.updateRows(
        db,
        "tasks",
        { status: nextStatus },
        "id = ?",
        [Number(rowId)],
      );
      refreshTable(w);
      w.toast(`Task #${rowId} marked ${nextStatus}`, 1600, "success");
    });

  win.beginCard("✏️ Add / Manage Tasks").id("cardEditor");
  win.beginRow();
  win
    .addTextInput("New task title...", "")
    .id("txtNewTitle")
    .width(300)
    .contextMenu(["🔤 UPPERCASE", "🔡 lowercase", "🧹 Clear"], (w, act) => {
      const cur = w.getText("txtNewTitle");
      if (act.includes("UPPER")) w.setText("txtNewTitle", cur.toUpperCase());
      else if (act.includes("lower"))
        w.setText("txtNewTitle", cur.toLowerCase());
      else w.setText("txtNewTitle", "");
    });
  win
    .addDropdown(["Database", "Frontend", "Backend", "DevOps"], "Frontend")
    .id("cmbNewCat")
    .width(140);
  win.addDropdown(["High", "Medium", "Low"], "Medium").id("cmbNewPrio").width(120);
  win
    .addButton("➕ Add Task", (w) => {
      const title = w.getText("txtNewTitle").trim();
      if (!title)
        return void w.warn("Title Required", "Enter a task title first.");
      rad.sqliteutils.insertRow(db, "tasks", {
        title,
        category: w.getText("cmbNewCat") || "Frontend",
        priority: w.getText("cmbNewPrio") || "Medium",
        status: "Todo",
      });
      w.setText("txtNewTitle", "");
      refreshTable(w);
      w.addActivityFeedItem(
        "feedAudit",
        new Date().toLocaleTimeString(),
        `Added task "${title}"`,
      );
      w.toast(`Added "${title}"`, 1800, "success");
    })
    .bg("#0284c7")
    .color("#ffffff")
    .bold()
    .width(130);

  win
    .addButton("🗑 Delete Selected", (w) => {
      const id = w.getStateOr("selected_task_id", "");
      if (!id)
        return void w.info(
          "No Selection",
          "Click a task row in the table first.",
        );
      w.fire(
        {
          title: `Delete Task #${id}?`,
          text: "This will remove the record from SQLite.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Delete",
          confirmButtonColor: "#dc2626",
        },
        (res) => {
          if (res.isConfirmed) {
            rad.sqliteutils.deleteRows(db, "tasks", "id = ?", [Number(id)]);
            w.removeState("selected_task_id");
            refreshTable(w);
            w.toast(`Deleted task #${id}`, 1600, "error");
          }
        },
      );
    })
    .bg("#dc2626")
    .color("#ffffff")
    .width(150);
  win.endRow();
  win.endCard();

  // ============================================================================
  // TAB 2: CHARTS, GAUGES, RINGS & REAL-TIME TELEMETRY
  // ============================================================================
  win.beginCard("📈 Cluster KPIs & Activity Rings").id("cardKpis");
  win.beginRow();
  win.addScoreCard("SLA Uptime", 99.98, "30-day rolling window", "A+").width(190);
  win
    .addDonutChart("donutStorage", "SQLite Pages", 62, "WAL Checkpoint OK")
    .width(185);
  win
    .addActivityRings("ringsHealth", [
      { label: "CPU", percent: 74, color: "#fa114f" },
      { label: "RAM", percent: 58, color: "#a1ff00" },
      { label: "I/O", percent: 89, color: "#00f0ff" },
    ])
    .width(175);
  win.addCircularProgress("cprCache", 84);
  win.addGauge("ggeLatency", "P95 Latency (ms)", 14);
  win.endRow();
  win.endCard();

  win.beginCard("📊 Live Throughput Chart & Sparkline").id("cardCharts");
  win.beginRow();
  win.addChart("crtThroughput", "line", 130).width(420);
  win.addSparkline("spkTrend", [20, 35, 28, 45, 60, 52, 75, 68], 40);
  win
    .addButton("⚡ Simulate Load Spike", async (w) => {
      await w.withBusyState(
        ["btnSpike"],
        "⏳ Running load generator...",
        async (ctx) => {
          await ctx.sleep(800);
          const spike = [45, 62, 78, 95, 88, 92, 99, 85];
          ctx.setChartData("crtThroughput", spike);
          ctx.setSparklineData("spkTrend", spike);
          ctx.setCircularProgress("cprCache", 96);
          ctx.setGaugeValue("ggeLatency", 42);
          ctx.toast("Load spike telemetry captured!", 1800, "info");
        },
      );
    })
    .id("btnSpike")
    .bg("#7c3aed")
    .color("#ffffff")
    .width(190);
  win.endRow();
  win.endCard();

  win.beginCard("📋 Live Activity Audit Stream").id("cardFeed");
  win.addActivityFeed("feedAudit", 110);
  win.addActivityFeedItem(
    "feedAudit",
    new Date().toLocaleTimeString(),
    "OmniStudio workspace initialized.",
  );
  win.endCard();

  // ============================================================================
  // TAB 3: WORKSPACE SETTINGS & REACTIVE STATE BINDING
  // ============================================================================
  win.beginCard("⚙️ Workspace Preferences & Persistence").id("cardSettings");
  win.addFormField("Workspace Name:", "txtWsName", "Production Ops");
  win.bindState("txtWsName", "workspace_name");
  win.addFormSlider("Telemetry Poll Rate (s):", "sldPoll", 5);
  win.addFormSwitch(
    "Auto-Save Session:",
    "swtAutoSave",
    "Persist form & window state on close",
    true,
  );

  win.beginRow();
  win
    .addButton("💾 Save Workspace JSON", (w) => {
      w.save_webview_file_dialog(
        "Export Workspace Settings",
        "workspace_settings.json",
        (dest) => {
          if (dest) {
            w.saveValuesToFile(String(dest));
            w.toast(`Saved to ${dest}`, 2000, "success");
          }
        },
      );
    })
    .bg("#059669")
    .color("#ffffff")
    .width(200);

  win
    .addButton("📂 Load Workspace JSON", (w) => {
      w.open_webview_file_dialog(
        "Load Workspace Settings",
        ".json",
        (src) => {
          if (src) {
            w.loadValuesFromFile(String(src));
            w.toast(`Loaded ${src}`, 2000, "info");
          }
        },
      );
    })
    .width(200);
  win.endRow();
  win.endCard();

  // Wire Menu & Toolbar handlers
  win.onClick("mainMenu", (w, item) => {
    if (item.includes("Exit")) w.quit();
    else if (item.includes("Tasks & Search"))
      activateTab(w, "🗂 Tasks & Search");
    else if (item.includes("Telemetry & Charts"))
      activateTab(w, "📊 Telemetry & Charts");
    else if (item.includes("Settings")) activateTab(w, "⚙️ Settings");
    else if (item.includes("About"))
      w.info("About OmniStudio", "Built with Bun RAD Studio & SimpleGUI.");
  });

  win.onClick("mainToolbar", (w, action) => {
    if (action.includes("Refresh")) refreshTable(w);
    else if (action.includes("Pulse"))
      activateTab(w, "📊 Telemetry & Charts");
    else if (action.includes("Quick Task")) {
      w.prompt("Task title:", "Review PR #42", "Quick Task", (title) => {
        if (title) {
          rad.sqliteutils.insertRow(db, "tasks", {
            title,
            category: "DevOps",
            priority: "Medium",
            status: "Todo",
          });
          refreshTable(w);
          w.toast(`Created "${title}"`, 1500, "success");
        }
      });
    }
  });

  // Live 2-second heartbeat timer for telemetry
  const telemetryHistory = [32, 40, 38, 50, 46, 62, 58, 65];
  win.addTimer(
    2000,
    (w) => {
      const next = Math.floor(35 + Math.random() * 45);
      telemetryHistory.push(next);
      if (telemetryHistory.length > 8) telemetryHistory.shift();
      w.setChartData("crtThroughput", telemetryHistory);
      w.setSparklineData("spkTrend", telemetryHistory);
    },
    { id: "pulseTimer" },
  );

  win.addStatusBar("Ready");
  refreshTable(win);
  activateTab(win, "🗂 Tasks & Search");

  return win;
}

if (import.meta.main) createFullStudioWorkspace().run();
