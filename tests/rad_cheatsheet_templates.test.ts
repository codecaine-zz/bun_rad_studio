import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { newSimpleWindow } from "../src/simplegui";
import {
  createRedisNamespace,
  newSimpleCLI,
  stdlib,
} from "../src/simplecli/index.ts";
import { rad } from "../src/features/rad/index.ts";
import { extractProcessName, parsePsOutput } from "../src/process_tools.ts";
import { parseDfOutput } from "../src/features/gdu/gduDoers.ts";
import { createFullStudioWorkspace } from "../examples/rad_tutorial/12_full_studio_workspace_template.ts";
import { createJqStudio } from "../applications/jq_studio.ts";

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
    expect(
      extractProcessName("C:\\Users\\dev\\.bun\\bin\\bun.exe run dev"),
    ).toBe("bun");
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
    const searchRef = win.addSearchInput("Filter users...").id("txtUserSearch");
    const tblRef = win
      .addTable("tblUsers", ["ID", "Full Name", "Email", "Role"], initialRows)
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

describe("Documented Cheatsheet Docs & Ergonomic Patterns", () => {
  const ROOT_DIR = path.resolve(import.meta.dir, "..");
  const DOC_CHEATSHEETS = [
    "docs/cheatsheets/index.md",
    "docs/cheatsheets/simplegui-cheatsheet.md",
    "docs/cheatsheets/simplecli-cheatsheet.md",
    "docs/cheatsheets/rad-modules-cheatsheet.md",
    "docs/cheatsheets/studios-cli-and-troubleshooting-cheatsheet.md",
  ];
  const ALL_CHEATSHEETS = [...DOC_CHEATSHEETS, "CHEATSHEET.md"];

  function inspectMarkdownStructure(markdown: string) {
    let fenceMarker: string | null = null;
    const h1Headings: string[] = [];
    for (const line of markdown.split("\n")) {
      const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
      if (fenceMatch) {
        const marker = fenceMatch[1]![0]!.repeat(3);
        if (!fenceMarker) fenceMarker = marker;
        else if (line.trim().startsWith(fenceMarker)) fenceMarker = null;
        continue;
      }
      if (fenceMarker) continue;
      if (/^#\s+/.test(line)) h1Headings.push(line.trim());
    }
    return { h1Headings, unclosedFence: fenceMarker !== null };
  }

  test("all 5 docs/cheatsheets/*.md files and CHEATSHEET.md exist with valid structure", () => {
    for (const relPath of ALL_CHEATSHEETS) {
      const absPath = path.join(ROOT_DIR, relPath);
      expect(fs.existsSync(absPath)).toBe(true);
      const raw = fs.readFileSync(absPath, "utf8");
      const { h1Headings, unclosedFence } = inspectMarkdownStructure(raw);
      expect(unclosedFence).toBe(false);
      if (relPath.startsWith("docs/")) {
        expect(h1Headings.length).toBe(1);
      }
    }

    const navRaw = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, "docs/nav.json"), "utf8"),
    ) as { sections: { title: string; pages?: { path: string }[] }[] };
    const cheatsheetSection = navRaw.sections.find(
      (s) => s.title === "RAD development cheatsheets",
    );
    expect(cheatsheetSection).toBeDefined();
    expect(
      cheatsheetSection!.pages!.some(
        (p) =>
          p.path ===
          "cheatsheets/studios-cli-and-troubleshooting-cheatsheet.md",
      ),
    ).toBe(true);
  });

  test("SimpleWindow scoped layout helpers (row, card, grid) and win.values() round-trip", () => {
    const win = newSimpleWindow("Ergonomic Layout Test", 800, 560);

    win
      .card("Account Profile", (w) => {
        w.row((r) => {
          r.addLabel("Username:");
          r.addTextInput("Enter username").id("txtUser");
        });
        w.grid(2, 12, (g) => {
          g.addCheckbox("Active", false).id("chkActive");
          g.addComboBox("cmbRole", ["Admin", "Viewer"], "Viewer");
        });
      })
      .values({
        txtUser: "ada.lovelace",
        chkActive: true,
        cmbRole: "Admin",
      });

    const snapshot = win.values();
    expect(snapshot.txtUser).toBe("ada.lovelace");
    expect(snapshot.chkActive).toBe(true);
    expect(snapshot.cmbRole).toBe("Admin");
  });

  test("rad.sqliteutils FTS5 full-text indexing, searchFts, and searchFtsRanked", () => {
    const db = rad.sqliteutils.openDb(":memory:");
    try {
      rad.sqliteutils.createFtsTable(db, "docs_fts", ["title", "body"]);
      rad.sqliteutils.indexFts(db, "docs_fts", {
        title: "Codecaine File Manager",
        body: "Dual pane commander synced terminal and rip graveyard recovery",
      });
      rad.sqliteutils.indexFts(db, "docs_fts", {
        title: "Database Workbench",
        body: "SQLite Postgres MySQL workbench with rollback and QBE queries",
      });

      const matches = rad.sqliteutils.searchFts<{
        title: string;
        body: string;
      }>(db, "docs_fts", "graveyard", 10);
      expect(matches.length).toBe(1);
      expect(matches[0]!.title).toBe("Codecaine File Manager");

      const ranked = rad.sqliteutils.searchFtsRanked<{ title: string }>(
        db,
        "docs_fts",
        "workbench",
        10,
      );
      expect(ranked.length).toBe(1);
      expect(ranked[0]!.title).toBe("Database Workbench");
      expect(typeof ranked[0]!.rank).toBe("number");
    } finally {
      rad.sqliteutils.closeDb(db);
    }
  });

  test("rad.flowutils RateLimiter, CircuitBreaker, retry, debounce, and throttle", async () => {
    const limiter = new rad.flowutils.RateLimiter(2, 0.001);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);

    const breaker = new rad.flowutils.CircuitBreaker(2, 60_000);
    expect(breaker.getState()).toBe("CLOSED");
    await expect(
      breaker.execute(async () => {
        throw new Error("boom-1");
      }),
    ).rejects.toThrow("boom-1");
    await expect(
      breaker.execute(async () => {
        throw new Error("boom-2");
      }),
    ).rejects.toThrow("boom-2");
    expect(breaker.getState()).toBe("OPEN");
    expect(breaker.canExecute()).toBe(false);

    let attempts = 0;
    const result = await rad.flowutils.retry(
      async () => {
        attempts++;
        if (attempts < 2) throw new Error("transient");
        return "recovered";
      },
      3,
      1,
      1,
      5,
    );
    expect(result).toBe("recovered");
    expect(attempts).toBe(2);

    let debouncedCount = 0;
    const debounced = rad.flowutils.debounce(() => {
      debouncedCount++;
    }, 25);
    debounced();
    debounced.cancel();

    let throttledCount = 0;
    const throttled = rad.flowutils.throttle(() => {
      throttledCount++;
    }, 50);
    throttled();
    throttled.cancel();
    expect(debouncedCount).toBe(0);
    expect(throttledCount).toBe(1);
  });

  test("SimpleCLI.parseArgs parses typed flags and positional arguments without process exit", () => {
    const cli = newSimpleCLI("rad-demo", "1.0.0", "Demo CLI")
      .addFlagString("env", "e", "dev", "Target environment")
      .addFlagInt("port", "p", 8080, "Port number")
      .addFlagBool("json", "j", false, "JSON output");

    const ok = cli.parseArgs([
      "--env",
      "staging",
      "-p",
      "9090",
      "--json",
      "deploy",
      "api",
    ]);
    expect(ok).toBe(true);
    expect(cli.getFlagString("env")).toBe("staging");
    expect(cli.getFlagInt("port")).toBe(9090);
    expect(cli.getFlagBool("json")).toBe(true);
    expect(cli.getPositionalArgs()).toEqual(["deploy", "api"]);
  });

  test("SimpleGUI headless studios, enterprise components, reactive state and dialogs work without win.run()", async () => {
    const jqWin = createJqStudio({ fullscreen: false });
    jqWin.setValue("txt_filter", ".modules | map(.name)");
    await jqWin.triggerClick("btn_execute");
    const output = jqWin.getText("txt_output_json");
    expect(output).toContain("simplegui");
    await jqWin.triggerClick("btn_reset_sample");
    expect(jqWin.getText("txt_filter").length).toBeGreaterThan(0);

    const win = newSimpleWindow("Enterprise UI Test", 900, 650, {
      fullscreen: false,
    });
    const events: string[] = [];
    win.setState("env", "dev");
    win.onStateChange("env", (_w, next) => events.push(String(next)));

    win.addTextInput("Environment").id("txtEnv").bindState("env");
    win.statistic("Users", 420, { prefix: "#", trend: "+5%" }).id("statUsers");
    win.descriptions("Info", [["OS", "macOS"]]).id("descInfo");
    win.chips(["Bun", "RAD"]).id("chipsStack");
    win
      .virtualList(["alpha", "beta", "gamma"], { itemHeight: 32 })
      .id("vlItems");
    win.addCommandPalette("cpMain", [{ label: "Run Check", id: "run" }]);
    win.addKanbanBoard("kbMain", [{ id: "todo", title: "To Do", items: [] }]);
    win.addPropertyGrid("pgMain", { host: "127.0.0.1", port: "8080" });
    win.popconfirm("Delete Item", "Confirm removal?").id("popDelete");
    win.tour([{ target: "pgMain", title: "Properties" }]).id("tourIntro");

    await win.triggerChange("txtEnv", "staging");
    expect(win.getState("env")).toBe("staging");
    expect(events).toEqual(["dev", "staging"]);
    expect(win.getControl("statUsers")).toBeDefined();
    expect(win.getControl("descInfo")).toBeDefined();
    expect(win.getControl("chipsStack")).toBeDefined();
    expect(win.getControl("vlItems")).toBeDefined();
    expect(win.getControl("cpMain")).toBeDefined();
    expect(win.getControl("kbMain")).toBeDefined();
    expect(win.getControl("pgMain")).toBeDefined();
    expect(win.getControl("popDelete")).toBeDefined();
    expect(win.getControl("tourIntro")).toBeDefined();

    let prompted = "";
    const answer = await win.showPrompt("Name?", "Ada", (v) => {
      prompted = v ?? "";
    });
    expect(answer).toBe("Ada");
    expect(prompted).toBe("Ada");
    expect(typeof win.dialogs.confirm).toBe("function");
  });

  test("SimpleCLI subcommands, stdlib helpers and NamespacedRedis memory fallback execute deterministically", async () => {
    let deployedEnv = "";
    let deployedTargets: string[] = [];

    const cli = newSimpleCLI("rad-ops", "1.0.0", "Ops CLI");
    cli.command("deploy", "Deploy service", (sub) => {
      sub.addFlagString("env", "e", "dev", "Target environment");
      sub.action((flags, pos) => {
        deployedEnv = String(flags.env ?? "");
        deployedTargets = [...pos];
      });
    });

    const ran = await cli.run(["deploy", "--env", "prod", "web", "worker"]);
    expect(ran).toBe(true);
    expect(deployedEnv).toBe("prod");
    expect(deployedTargets).toEqual(["web", "worker"]);

    const hash = stdlib.sha256("hello");
    expect(hash).toHaveLength(64);
    const enc = stdlib.aesEncrypt(
      "placeholder-secret-payload",
      "placeholder-aes-key",
    );
    expect(stdlib.aesDecrypt(enc, "placeholder-aes-key")).toBe(
      "placeholder-secret-payload",
    );
    expect(stdlib.csvParse("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(stdlib.tomlParse('[app]\nname = "rad"')).toEqual({
      app: { name: "rad" },
    });
    expect(stdlib.slugify("Hello RAD World!")).toBe("hello-rad-world");
    expect(stdlib.isSemver("1.4.4")).toBe(true);
    expect(stdlib.percentile([10, 20, 30, 40], 50)).toBe(25);

    const redis = createRedisNamespace("test_ns", {
      inMemory: true,
      fallbackToMemory: true,
    });
    try {
      expect(redis.isMemoryFallback()).toBe(true);
      await redis.set("token", "placeholder-token", 60);
      expect(await redis.get("token")).toBe("placeholder-token");
      await redis.setJson("u1", { role: "admin" });
      expect(await redis.getOrSet("u1", () => ({ role: "guest" }))).toEqual({
        role: "admin",
      });
      await redis.del("token", "u1");
      expect(await redis.get("token")).toBeNull();
    } finally {
      redis.close();
    }
  });

  test("all 6 rad utility domains cover documented cheatsheet APIs", async () => {
    const tomlDoc = rad.tomlutils.parseToml(
      '[srv]\nport = 8080\nhost = "127.0.0.1"',
    );
    expect(rad.tomlutils.getInt(tomlDoc, "srv.port", 3000)).toBe(8080);
    expect(rad.tomlutils.stringifyToml(tomlDoc)).toContain("8080");

    const zipBytes = rad.archiveutils.zipFiles([
      { name: "docs/readme.txt", data: "hello zip" },
    ]);
    const entries = await rad.archiveutils.unzipToMemory(zipBytes);
    expect(
      entries.some(
        (e) =>
          e.name === "docs/readme.txt" &&
          new TextDecoder().decode(e.data) === "hello zip",
      ),
    ).toBe(true);

    const trie = new rad.structutils.SimpleTrie();
    expect(trie.add("rad")).toBe(true);
    expect(trie.has("rad")).toBe(true);
    expect(trie.hasPrefix("ra")).toBe(true);
    const dsu = new rad.structutils.DisjointSet<string>();
    dsu.union("a", "b");
    expect(dsu.connected("a", "b")).toBe(true);
    const ring = new rad.structutils.SimpleRingBuffer<number>(2);
    ring.push(1);
    ring.push(2);
    ring.push(3);
    expect(ring.toArray()).toEqual([2, 3]);

    const graph = rad.graphutils
      .newGraph<string>({ directed: true })
      .addEdge("build", "test", 2)
      .addEdge("test", "deploy", 3);
    expect(graph.topologicalSort()).toEqual(["build", "test", "deploy"]);
    expect(graph.dijkstra("build", "deploy")?.distance).toBe(5);

    expect(
      rad.templateutils.renderTemplate("Hi {{name | User}}!", { name: "Ada" }),
    ).toBe("Hi Ada!");
    expect(rad.templateutils.templateVariables("{{a}} {{b}}")).toEqual([
      "a",
      "b",
    ]);
    const patch = rad.diffutils.unifiedDiff("a\nb\n", "a\nc\n", "f.txt");
    expect(rad.diffutils.applyPatch("a\nb\n", patch)).toBe("a\nc\n");

    const router = rad.serverutils
      .createRouter()
      .get("/users/:id", (_req, p) => Response.json(p));
    const res = await router.handle(
      new Request("http://localhost/users/42"),
      {} as any,
    );
    expect(await res.json()).toEqual({ id: "42" });

    const jwt = rad.jwtutils.signJwt(
      { sub: "u1" },
      "placeholder-jwt-secret",
      60,
    );
    const verified = rad.jwtutils.verifyJwt<{ sub: string }>(
      jwt,
      "placeholder-jwt-secret",
    );
    expect(verified?.sub).toBe("u1");
    expect(
      rad.cryptoutils.hmacSha256("msg", "placeholder-hmac-key"),
    ).toHaveLength(64);
    const pwHash = await rad.cryptoutils.hashPassword("example-password");
    expect(
      await rad.cryptoutils.verifyPassword("example-password", pwHash),
    ).toBe(true);
    expect(
      rad.urlutils.redactCredentials(
        "postgres://admin:placeholder@db.internal:5432/app",
      ),
    ).toBe("postgres://admin:***@db.internal:5432/app");

    const mapped = await rad.asyncutils.parallelMap(
      [1, 2, 3],
      2,
      async (n) => n * 2,
    );
    expect(mapped).toEqual([2, 4, 6]);
    expect(rad.validutils.isEmail("a@b.com")).toBe(true);
    expect(rad.validutils.isJson('{"ok":true}')).toBe(true);
    expect(rad.validutils.inRange(5, 1, 10)).toBe(true);

    const start = rad.timeutils.parseIso("2026-01-01T00:00:00Z");
    const end = rad.timeutils.addDays(start, 7);
    expect(rad.timeutils.diffDays(start, end)).toBe(7);
  });

  test("all 6 cheatsheet markdown files have balanced language-tagged code fences and expected coverage", () => {
    const minBlocksByDoc: Array<[string, number, boolean]> = [
      ["docs/cheatsheets/index.md", 8, true],
      ["docs/cheatsheets/simplegui-cheatsheet.md", 20, true],
      ["docs/cheatsheets/simplecli-cheatsheet.md", 15, true],
      ["docs/cheatsheets/rad-modules-cheatsheet.md", 21, true],
      [
        "docs/cheatsheets/studios-cli-and-troubleshooting-cheatsheet.md",
        8,
        true,
      ],
      ["CHEATSHEET.md", 30, false],
    ];

    for (const [relPath, minBlocks, requireSingleH1] of minBlocksByDoc) {
      const fullPath = path.join(process.cwd(), relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const raw = fs.readFileSync(fullPath, "utf8");
      const lines = raw.split(/\r?\n/);

      let inFence = false;
      let blockCount = 0;
      const h1s: string[] = [];

      for (const line of lines) {
        const fenceMatch = line.match(/^```(.*)$/);
        if (fenceMatch) {
          if (!inFence) {
            inFence = true;
            blockCount += 1;
            const lang = (fenceMatch[1] ?? "").trim();
            expect(lang.length).toBeGreaterThan(0);
          } else {
            inFence = false;
          }
          continue;
        }
        if (!inFence && /^#\s+/.test(line)) {
          h1s.push(line);
        }
      }

      expect(inFence).toBe(false);
      expect(blockCount).toBeGreaterThanOrEqual(minBlocks);
      if (requireSingleH1) {
        expect(h1s.length).toBe(1);
      }
    }
  });
});
