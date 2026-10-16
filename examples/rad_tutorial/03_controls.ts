// RAD tutorial 3: forms, lists and dashboard controls. Run it with:  bun run examples/rad_tutorial/03_controls.ts
import { newSimpleWindow, type SimpleWindow } from "../../src/simplegui";

export function createControls(): SimpleWindow {
  const win = newSimpleWindow("Controls", 1000, 760, { theme: "catppuccin" });

  win.addHeading("Controls", "Form fields, tables and a little dashboard");

  win.beginGrid(2, 16);
  win.beginCard("📝 Form");
  win.addFormField("Full name:", "txtName", "Jane Doe");
  win.addFormDropdown("Environment:", "cmbEnv", ["Dev", "Staging", "Prod"], "Dev");
  win.addFormSlider("Volume:", "sldVol", 80);
  win.addFormSwitch("Alerts:", "swtNotify", "Enable email alerts", true);
  win.endCard();

  win.beginCard("📊 Live numbers");
  win.addCircularProgress("cprCpu", 72);
  win.addGauge("ggeDisk", "Disk usage", 64);
  win.addSparkline("spkMem", [10, 25, 40, 35, 60, 55, 80], 30);
  win.endCard();
  win.endGrid();

  win.addTable("tblLogs", ["Time", "Level", "Message"], [
    ["12:00:01", "INFO", "Server started on port 3000"],
    ["12:00:05", "WARN", "High memory load detected"],
    ["12:00:09", "INFO", "Backup finished"],
  ]);
  win.addBadge("Everything is running", "success");
  return win;
}

if (import.meta.main) createControls().run();
