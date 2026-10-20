/**
 * God-Mode Tutorial 03 — Menus, Context Menus, SweetAlert2 fire(), Busy State & SQLite Fleet App
 *
 * Run:  bun run examples/god_mode_tutorial/03_dialogs_sqlite_capstone.ts
 */
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";
import { rad } from "../../src/features/rad/index.ts";

export function createDialogsSqliteCapstone(dbPath = ":memory:"): SimpleWindow {
  const db = rad.sqliteutils.openDb(dbPath);
  rad.sqliteutils.execSql(
    db,
    "CREATE TABLE IF NOT EXISTS rigs (id INTEGER PRIMARY KEY, hostname TEXT, platform TEXT, specs TEXT)",
  );
  if (!rad.sqliteutils.queryValue(db, "SELECT COUNT(*) FROM rigs")) {
    rad.sqliteutils.insertRow(db, "rigs", {
      hostname: "mac-studio-xdr", platform: "macOS Tahoe", specs: "M4 Ultra 80c GPU · 192GB · 6K XDR",
    });
    rad.sqliteutils.insertRow(db, "rigs", {
      hostname: "win11-rtx5090-pro", platform: "Windows 11 Pro", specs: "Threadripper 7995WX · Dual RTX 5090",
    });
    rad.sqliteutils.insertRow(db, "rigs", {
      hostname: "linux-wayland-96c", platform: "Linux HiDPI", specs: "96-Core / 192-Thread · 256GB ECC",
    });
  }

  const win = newSimpleWindow("Flagship Fleet Manager — SQLite + SweetAlert2", 860, 650, {
    theme: "apple_dark", padding: 12, spacing: 8,
  });

  win.addMenuBar("mainMenu", [
    { label: "File", items: ["Export SQLite Snapshot", "---", "Exit"] },
    { label: "Fleet", items: ["Audit All Nodes", "Benchmark 120Hz"] },
  ]);
  win.onClick("mainMenu", (w, item) => w.toast(`Menu action: ${item}`, 1800));

  const refreshTable = (w: SimpleWindow) => {
    const q = `%${w.getText("txtSearch")}%`;
    const rows = rad.sqliteutils.queryAll<any>(
      db,
      "SELECT id, hostname, platform, specs FROM rigs WHERE hostname LIKE ? OR platform LIKE ? ORDER BY id",
      [q, q],
    );
    w.setTableRows("tblRigs", rows.map((r) => [String(r.id), r.hostname, r.platform, r.specs]));
    w.setStatusBarText(`SQLite Fleet: ${rows.length} flagship workstations online`);
  };

  win.beginRow();
  win.addSearchInput("Filter rigs by hostname or OS...", (w) => refreshTable(w)).id("txtSearch").width(340);
  win.addButton("✨ SweetAlert fire()", (w) => {
    w.fire({
      title: "Run Cluster Benchmark?",
      text: "Execute 120Hz shader & SQLite stress test across all 3 platforms?",
      icon: "question",
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Run Benchmark",
      denyButtonText: "Dry Run",
    }, (res) => {
      w.setStatusBarText(res.isConfirmed ? "fire(): 120Hz Benchmark Passed ✅" : "fire(): Dry run complete");
    });
  }).bg("#db2777").color("#ffffff").bold();
  win.addButton("☁️ Sync Telemetry", async (w) => {
    await w.withBusyState(["btnSync"], "⏳ Syncing fleet telemetry...", async (ctx) => {
      await ctx.sleep(900);
      ctx.info("Telemetry Synced", "All 3 flagship workstation nodes reported zero dropped frames.");
    });
  }).id("btnSync").bg("#059669").color("#ffffff");
  win.endRow();

  win.addTable("tblRigs", ["ID", "Hostname", "Platform", "Hardware Specs"], [], (w, id) => {
    w.setState("selectedId", String(id));
  });

  win.beginCard("➕ Register New Flagship Workstation (Right-Click Hostname for Context Menu)");
  win.addFormField("Hostname:", "txtHost", "").contextMenu(
    ["🔤 UPPERCASE HOST", "🔡 lowercase host", "🧹 Clear"],
    (w, act) => {
      const cur = w.getText("txtHost");
      w.setText("txtHost", act.includes("UPPER") ? cur.toUpperCase() : act.includes("lower") ? cur.toLowerCase() : "");
    },
  );
  win.addFormField("Platform & Specs:", "txtSpecs", "Linux Arch Wayland · RTX 4090 24GB");

  win.beginRow();
  win.addButton("➕ Add Workstation", (w) => {
    const host = w.getText("txtHost").trim();
    if (!host) return void w.warn("Hostname required", "Enter a workstation hostname first.");
    rad.sqliteutils.insertRow(db, "rigs", {
      hostname: host, platform: "Custom Flagship", specs: w.getText("txtSpecs").trim(),
    });
    w.setText("txtHost", "");
    refreshTable(w);
    w.toast(`Added ${host} to SQLite`);
  }).bg("#0284c7").color("#ffffff").bold();
  win.addButton("🗑 Delete Selected", async (w) => {
    const id = w.getStateOr("selectedId", "");
    if (!id) return void w.info("Select a row", "Click a workstation row in the table first.");
    if (await w.ask("Remove this workstation from the SQLite registry?", "Confirm Delete")) {
      rad.sqliteutils.execSql(db, "DELETE FROM rigs WHERE id = ?", [Number(id)]);
      w.removeState("selectedId");
      refreshTable(w);
    }
  }).bg("#dc2626").color("#ffffff");
  win.endRow();
  win.endCard();

  win.addStatusBar("Ready");
  refreshTable(win);
  return win;
}

if (import.meta.main) createDialogsSqliteCapstone().run();
