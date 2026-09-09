import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";

interface ProcessItem {
  pid: string;
  cpu: number;
  mem: number;
  rssMb: string;
  state: string;
  user: string;
  command: string;
}

function fetchProcesses(): ProcessItem[] {
  const [out, code] = Sys.exec("ps -axo pid,pcpu,pmem,rss,state,user,command");
  if (code !== 0) return [];

  const lines = out.trim().split("\n");
  const items: ProcessItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length >= 7) {
      const pid = parts[0] || "";
      const cpu = parseFloat(parts[1] || "0");
      const mem = parseFloat(parts[2] || "0");
      const rssKb = parseInt(parts[3] || "0", 10);
      const state = parts[4] || "";
      const user = parts[5] || "";
      const command = parts.slice(6).join(" ");
      const rssMb = (rssKb / 1024).toFixed(1) + " MB";

      items.push({ pid, cpu, mem, rssMb, state, user, command });
    }
  }

  return items.sort((a, b) => b.cpu - a.cpu);
}

export function createTaskTracker(): SimpleWindow {
  const win = newSimpleWindow("Task Manager Pro -- macOS Process & Resource Monitor", 1140, 880, {
    appId: "task_manager",
    theme: getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
  });

  const procs = fetchProcesses();

  // Header Title
  win.beginRow();
  win.addHeading("Task Manager Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save View");
  win.addButton("btn_refresh", "🔄 Refresh");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("macOS Real-Time Process & Hardware Monitor");

  // Summary Metrics Card
  win.beginCard("System Telemetry Overview");
  win.beginRow();
  win.addLabel("lbl_total_procs", `Total Processes: ${procs.length}`);
  win.addLabel("lbl_top_cpu", `Top CPU: ${procs[0]?.command.slice(0, 30) || "N/A"} (${procs[0]?.cpu || 0}%)`);
  win.addLabel("lbl_platform", `Platform: macOS (Darwin arm64)`);
  win.endRow();
  win.endCard();

  // Filter & Process Control
  win.beginGroupBox("Filter & Process Signal Dispatcher");
  win.beginRow();
  win.addLabel("lbl_filter", "Search Filter:");
  win.addInput("txt_filter", "");
  win.addLabel("lbl_target_pid", "Target PID:");
  win.addInput("txt_target_pid", procs[0]?.pid || "1");
  win.endRow();

  win.beginRow();
  win.addButton("btn_kill_term", "⚠️ Terminate (SIGTERM)");
  win.addButton("btn_kill_force", "🛑 Force Kill (SIGKILL)");
  win.endRow();
  win.endGroupBox();

  // Process Table
  win.beginGroupBox("Live Running Process Table (Sorted by CPU %)");
  const tableData = procs.slice(0, 40).map((p) => [
    p.pid,
    p.cpu.toFixed(1) + "%",
    p.mem.toFixed(1) + "%",
    p.rssMb,
    p.state,
    p.user,
    p.command.length > 60 ? p.command.slice(0, 60) + "..." : p.command,
  ]);
  win.addTable("tbl_procs", ["PID", "CPU %", "MEM %", "RSS", "State", "User", "Command"], tableData);
  win.endGroupBox();

  // Activity Log
  win.beginGroupBox("Process Signals & Telemetry Log");
  win.addConsole("task_console", 100);
  win.endGroupBox();

  // Status Row
  win.beginRow();
  win.addLabel("lbl_status", `Status: Monitoring ${procs.length} active processes`);
  win.endRow();

  // Helpers
  const refreshList = () => {
    const fresh = fetchProcesses();
    const filter = (win.getValue("txt_filter") || "").toLowerCase();
    const filtered = filter
      ? fresh.filter((p) => p.command.toLowerCase().includes(filter) || p.pid.includes(filter))
      : fresh;

    const data = filtered.slice(0, 40).map((p) => [
      p.pid,
      p.cpu.toFixed(1) + "%",
      p.mem.toFixed(1) + "%",
      p.rssMb,
      p.state,
      p.user,
      p.command.length > 60 ? p.command.slice(0, 60) + "..." : p.command,
    ]);

    win.setTableData("tbl_procs", ["PID", "CPU %", "MEM %", "RSS", "State", "User", "Command"], data);
    win.setText("lbl_total_procs", `Total Processes: ${fresh.length}`);
    win.appendConsole("task_console", `[Task Manager] Refreshed: ${filtered.length} matching processes displayed\n`, 1);
    win.setStatus(`Monitoring ${fresh.length} active processes`);
  };

  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Task Manager settings saved successfully!");
  });
  win.onClick("btn_refresh", refreshList);

  win.onClick("btn_kill_term", () => {
    const pid = win.getValue("txt_target_pid");
    if (!pid) return;
    const [out, code] = Sys.exec(`kill -15 ${pid}`);
    win.appendConsole("task_console", `[Signal] Sent SIGTERM to PID ${pid} (exit ${code})\n`, code === 0 ? 2 : 3);
    setTimeout(refreshList, 400);
  });

  win.onClick("btn_kill_force", () => {
    const pid = win.getValue("txt_target_pid");
    if (!pid) return;
    const [out, code] = Sys.exec(`kill -9 ${pid}`);
    win.appendConsole("task_console", `[Signal] Sent SIGKILL to PID ${pid} (exit ${code})\n`, code === 0 ? 2 : 3);
    setTimeout(refreshList, 400);
  });

  return win;
}

if (import.meta.main) {
  const win = createTaskTracker();
  console.log("Launching Task Manager Pro...");
  win.run();
}
