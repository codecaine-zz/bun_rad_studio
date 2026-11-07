import { describe, expect, test } from "bun:test";
import { newSimpleWindow } from "../src/simplegui";
import { newSimpleCLI } from "../src/simplecli/index.ts";
import { rad } from "../src/features/rad/index.ts";
import { extractProcessName, parsePsOutput } from "../src/process_tools.ts";
import { parseDfOutput } from "../src/features/gdu/gduDoers.ts";
import { createFullStudioWorkspace } from "../examples/rad_tutorial/12_full_studio_workspace_template.ts";

describe("RAD Cheatsheets, Full Studio Workspace Template & Cross-Platform QA", () => {
  test("12_full_studio_workspace_template builds, filters SQLite tasks, switches tabs, and updates telemetry", async () => {
    const win = createFullStudioWorkspace(":memory:");
    expect(win.title).toContain("OmniStudio");

    // Verify initial 5 SQLite rows loaded into tblTasks
    expect(win.tableRowCount("tblTasks")).toBe(5);
    expect(win.getText("bdgCount")).toBe("5 matching");

    // Verify initial tab visibility ("🗂 Tasks & Search" active)
    expect(win.getControlVisible("cardSearch")).toBe(true);
    expect(win.getControlVisible("tblTasks")).toBe(true);
    expect(win.getControlVisible("cardEditor")).toBe(true);
    expect(win.getControlVisible("cardKpis")).toBe(false);
    expect(win.getControlVisible("cardSettings")).toBe(false);

    // Live search filtering by text
    win.setText("txtSearch", "WAL");
    await win.triggerChange("txtSearch", "WAL");
    expect(win.tableRowCount("tblTasks")).toBe(1);
    expect(win.getText("bdgCount")).toBe("1 matching");

    // Reset filter
    win.setText("txtSearch", "");
    await win.triggerChange("txtSearch", "");
    expect(win.tableRowCount("tblTasks")).toBe(5);

    // Filter by category dropdown
    win.setValue("cmbCatFilter", "Frontend");
    await win.triggerChange("cmbCatFilter", "Frontend");
    expect(win.tableRowCount("tblTasks")).toBe(2);

    // Reset category filter
    win.setValue("cmbCatFilter", "All");
    await win.triggerChange("cmbCatFilter", "All");
    expect(win.tableRowCount("tblTasks")).toBe(5);

    // Switch tab to "📊 Telemetry & Charts"
    await win.triggerChange("workspaceTabs", "📊 Telemetry & Charts");
    expect(win.getControlVisible("cardSearch")).toBe(false);
    expect(win.getControlVisible("cardKpis")).toBe(true);
    expect(win.getControlVisible("cardCharts")).toBe(true);
    expect(win.getControlVisible("cardFeed")).toBe(true);

    // Verify HTML generation includes responsive layout cards and hidden state
    const html = win.generateHtml();
    expect(html).toContain("OmniStudio");
    expect(html).toContain("cardSearch");
    expect(html).toContain("crtThroughput");
  });

  test("SimpleWindow.bindTabViews and SimpleControlRef.bindViews switch tab view groups in 1 line", async () => {
    const win = newSimpleWindow("Tab Views Helper Test", 800, 600);
    const changes: Array<{ tab: string; idx: number }> = [];

    win.beginCard("Overview Card").id("cardOverview");
    win.addLabel("Overview metric");
    win.endCard();

    win.beginCard("Analytics Card").id("cardAnalytics");
    win.addChart("crtMetrics", "line", 120);
    win.endCard();

    win.beginCard("Settings Card").id("cardSettings");
    win.addSwitch("Enable Alerts", true).id("swtAlerts");
    win.endCard();

    win
      .addTabs(["Overview", "Analytics", "Settings"], 0)
      .id("mainTabs")
      .bindViews(
        {
          Overview: ["cardOverview"],
          Analytics: ["cardAnalytics"],
          Settings: ["cardSettings"],
        },
        (_w, activeTab, activeIndex) => {
          changes.push({ tab: activeTab, idx: activeIndex });
        },
      );

    // Initial state: Overview visible, Analytics & Settings hidden
    expect(win.getControlVisible("cardOverview")).toBe(true);
    expect(win.getControlVisible("cardAnalytics")).toBe(false);
    expect(win.getControlVisible("cardSettings")).toBe(false);

    // Switch to Analytics
    await win.triggerChange("mainTabs", "Analytics");
    expect(win.getControlVisible("cardOverview")).toBe(false);
    expect(win.getControlVisible("cardAnalytics")).toBe(true);
    expect(win.getControlVisible("cardSettings")).toBe(false);
    expect(changes).toEqual([{ tab: "Analytics", idx: 1 }]);

    // Switch to Settings
    await win.triggerChange("mainTabs", "Settings");
    expect(win.getControlVisible("cardOverview")).toBe(false);
    expect(win.getControlVisible("cardAnalytics")).toBe(false);
    expect(win.getControlVisible("cardSettings")).toBe(true);
    expect(changes.length).toBe(2);
  });

  test("SimpleWindow.bindTableFilter live-filters static and dynamic table rows in 1 line", async () => {
    const win = newSimpleWindow("Live Table Filter Test", 800, 600);
    const rows = [
      ["1", "api-gateway", "Running", "12ms"],
      ["2", "auth-worker", "Running", "8ms"],
      ["3", "billing-cron", "Degraded", "195ms"],
    ];

    win.addSearchInput("Filter services...").id("txtFilter");
    win.addBadge("3 / 3 rows", "info").id("bdgMatches");
    win.addTable("tblServices", ["ID", "Service", "Status", "Latency"], rows);

    win.bindTableFilter("txtFilter", "tblServices", () => rows, {
      countControlId: "bdgMatches",
      countFormat: (matched, total) => `${matched} of ${total} matching`,
    });

    expect(win.tableRowCount("tblServices")).toBe(3);
    expect(win.getText("bdgMatches")).toBe("3 of 3 matching");

    await win.triggerChange("txtFilter", "degraded");
    expect(win.tableRowCount("tblServices")).toBe(1);
    expect(win.getText("bdgMatches")).toBe("1 of 3 matching");

    await win.triggerChange("txtFilter", "running");
    expect(win.tableRowCount("tblServices")).toBe(2);
    expect(win.getText("bdgMatches")).toBe("2 of 3 matching");

    await win.triggerChange("txtFilter", "");
    expect(win.tableRowCount("tblServices")).toBe(3);
  });

  test("SimpleWindow O(1) controlIndex, .id() form store hygiene, getFormValues(ids), and resetForm(defaults)", () => {
    const win = newSimpleWindow("Form & Control Index Test", 640, 480);
    win.addButton("Static Button Label").id("btnAction");
    win.addFormField("Host:", "txtHost", "localhost");
    win.addFormField("Port:", "txtPort", "5432");

    // Calling .id() on a button should NOT pollute formValuesStore with the button caption
    expect(win.getFormValues().btnAction).toBeUndefined();

    // Subset getFormValues(ids)
    expect(win.getFormValues(["txtHost", "txtPort"])).toEqual({
      txtHost: "localhost",
      txtPort: "5432",
    });

    // Fast findControl lookup for both controls and cards
    win.beginCard("Database Config").id("cardDb");
    win.endCard();
    expect(win.findControl("cardDb")?.id).toBe("cardDb");
    expect(win.findControl("btnAction")?.id).toBe("btnAction");

    // Reset form with custom defaults dictionary
    win.setValue("txtHost", "prod.db.internal");
    win.resetForm({ txtHost: "127.0.0.1", txtPort: "6379" });
    expect(win.getFormValues(["txtHost", "txtPort"])).toEqual({
      txtHost: "127.0.0.1",
      txtPort: "6379",
    });
  });

  test("Cross-platform path, glob, process, and CRLF line handling across Windows/macOS/Linux", () => {
    // 1. globutils normalizes Windows backslashes
    expect(rad.globutils.globMatch("src/*.ts", "src\\simplegui.ts")).toBe(true);
    expect(
      rad.globutils.globFilter("src/**/*.ts", [
        "src\\features\\rad\\index.ts",
        "README.md",
      ]),
    ).toEqual(["src\\features\\rad\\index.ts"]);

    // 2. flowutils debounce & throttle expose .cancel()
    let calls = 0;
    const debounced = rad.flowutils.debounce(() => {
      calls++;
    }, 50);
    debounced();
    debounced.cancel();
    expect(calls).toBe(0);

    // 3. process_tools handles Windows executable paths and CRLF ps output
    expect(extractProcessName("C:\\Users\\dev\\.bun\\bin\\bun.exe run dev")).toBe(
      "bun",
    );
    const crlfPs =
      "  PID  PPID %CPU %MEM    RSS STAT USER     ELAPSED COMMAND\r\n" +
      " 1234     1  2.5  1.0  51200 S    dev        05:12 C:\\Program Files\\nodejs\\node.exe server.js\r\n";
    const parsed = parsePsOutput(crlfPs, new Map(), "dev");
    expect(parsed.length).toBe(1);
    expect(parsed[0]?.name).toBe("node");

    // 4. SimpleCLI handles CRLF diffs and sparklines without spread overflow
    const app = newSimpleCLI("qa", "QA Test", "1.0.0");
    const diff = app.diffText("line1\r\nline2", "line1\r\nline3");
    expect(diff).not.toContain("\r");
    expect(app.sparkline([10, 20, 30, 40])).toHaveLength(4);

    // 5. gdu parseDfOutput handles CRLF output cleanly
    const dfOut =
      "Filesystem 1024-blocks Used Available Capacity Mounted on\r\n" +
      "/dev/disk3s1 488245288 244122644 244122644 50% /\r\n";
    const disks = parseDfOutput(dfOut);
    expect(disks.length).toBe(1);
    expect(disks[0]?.mountPoint).toBe("/");
  });

  test("Round 2 RAD helpers: bindMasterDetail, validateForm, exportTableCsv/exportTableJson, and .filterTable", async () => {
    const win = newSimpleWindow("Round 2 RAD Helpers Test", 800, 600);
    const initialRows = [
      ["101", "Ada Lovelace", "ada@engine.io", "Admin"],
      ["102", "Alan Turing", "alan@bletchley.uk", "Architect"],
    ];

    win.addTextInput("ID").id("txtId");
    win.addTextInput("Name").id("txtName");
    win.addTextInput("Email").id("txtEmail");
    win.addDropdown(["Admin", "Architect", "Viewer"], "Viewer").id("cmbRole");

    // Chain .filterTable directly on search input and .bindDetail directly on table
    const searchRef = win
      .addSearchInput("Filter users...")
      .id("txtUserSearch");
    const tblRef = win
      .addTable(
        "tblUsers",
        ["ID", "Full Name", "Email", "Role"],
        initialRows,
      )
      .bindDetail(["txtId", "txtName", "txtEmail", "cmbRole"]);

    searchRef.filterTable("tblUsers", () => initialRows);
    expect(win.getRef("txtUserSearch")?.spec.id).toBe("txtUserSearch");

    // Simulate clicking row "102" (Alan Turing) -> master-detail populates form controls
    await tblRef.triggerClick("102");
    expect(win.getText("txtId")).toBe("102");
    expect(win.getText("txtName")).toBe("Alan Turing");
    expect(win.getText("txtEmail")).toBe("alan@bletchley.uk");
    expect(win.getText("cmbRole")).toBe("Architect");

    // Table inspection and CSV / JSON export
    expect(win.getTableHeaders("tblUsers")).toEqual([
      "ID",
      "Full Name",
      "Email",
      "Role",
    ]);
    expect(win.getTableObjects("tblUsers")).toEqual([
      {
        ID: "101",
        "Full Name": "Ada Lovelace",
        Email: "ada@engine.io",
        Role: "Admin",
      },
      {
        ID: "102",
        "Full Name": "Alan Turing",
        Email: "alan@bletchley.uk",
        Role: "Architect",
      },
    ]);
    const csv = win.exportTableCsv("tblUsers");
    expect(csv).toContain("ID,Full Name,Email,Role");
    expect(csv).toContain("101,Ada Lovelace,ada@engine.io,Admin");
    const json = JSON.parse(win.exportTableJson("tblUsers"));
    expect(json).toHaveLength(2);
    expect(json[1].Email).toBe("alan@bletchley.uk");

    // Declarative validateForm
    win.setText("txtName", "A");
    win.setText("txtEmail", "not-an-email");
    const invalidRes = win.validateForm({
      txtName: { required: true, minLength: 2, label: "Name" },
      txtEmail: {
        required: true,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: "Valid email required",
      },
    });
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.firstInvalidId).toBe("txtName");
    expect(Object.keys(invalidRes.errors)).toEqual(["txtName", "txtEmail"]);

    win.setText("txtName", "Grace Hopper");
    win.setText("txtEmail", "grace@navy.mil");
    const validRes = win.validateForm({
      txtName: { required: true, minLength: 2, label: "Name" },
      txtEmail: {
        required: true,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: "Valid email required",
      },
    });
    expect(validRes.valid).toBe(true);
    expect(validRes.errors).toEqual({});
  });
});
