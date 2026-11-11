import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  promises as fsp,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import * as os from "os";
import * as path from "path";
// @ts-ignore
import { JSDOM } from "jsdom";
import {
  exportFolderInventory,
  generateChecksums,
  verifyChecksums,
} from "../src/features/filemanager/fmClipboardOps";
import {
  createContext,
  type FmContext,
} from "../src/features/filemanager/fmCore";
import {
  compareTextFiles,
  computeLineDiff,
} from "../src/features/filemanager/fmDataCompare";
import { planBulkRename } from "../src/features/filemanager/fmOps";
import { startFileManagerServer } from "../src/features/filemanager/fmServer";
import {
  loadSettings,
  sanitizeSettings,
  updateSettings,
} from "../src/features/filemanager/fmSettings";
import { extractArchive } from "../src/features/filemanager/fmExtract";
import { createZip } from "../src/features/filemanager/fmZip";
import {
  compareHash,
  normalizeHash,
} from "../src/features/filemanager/fmInfoTasks";
import { parseTypedPath } from "../src/features/filemanager/fmPaths";
import { inspectRichPreview } from "../src/features/filemanager/fmPreview";
import { lanAddress } from "../src/features/filemanager/fmServeStatic";
import {
  matchesTaskQuery,
  type TaskProcessItem,
} from "../src/features/filemanager/fmTaskManager";
import {
  isSecretEnvEntry,
  renderEnvPreview,
} from "../resources/file_manager/ui/codePreview.js";
import { entryMatchesQuickFilter } from "../resources/file_manager/ui/nav.js";
import {
  baseName,
  parentOf,
  splitPath,
} from "../resources/file_manager/ui/util.js";

describe("Codecaine File Manager — Wave 2 Flagship Enhancements (Backend + Cross-Platform UI)", () => {
  let tmpDir: string;
  let ctx: FmContext;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "fm-wave2-test-"));
    ctx = createContext({
      home: tmpDir,
      sandboxRoot: tmpDir,
      dataDir: path.join(tmpDir, ".fm-data"),
    });
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test("1. Sticky Notes & File Annotations: settings persistence, sanitization, and quick-filter queries across platforms", async () => {
    const fileA = path.join(tmpDir, "roadmap.md");
    const fileB = path.join(tmpDir, "budget.xlsx");
    await updateSettings(ctx, {
      notes: {
        [fileA]: "TODO: Review Q4 architecture before Friday\x00",
        "relative/bad": "should be stripped",
      },
    });
    const loaded = await loadSettings(ctx);
    expect(loaded.notes[fileA]).toBe(
      "TODO: Review Q4 architecture before Friday",
    );
    expect(loaded.notes["relative/bad"]).toBeUndefined();

    // Verify sanitizeSettings for darwin, linux, and win32 contexts
    const winCtx = createContext({
      platform: "win32",
      home: "C:\\Users\\dev",
      dataDir: "C:\\Users\\dev\\.fm",
    });
    const winSanitized = sanitizeSettings(
      {
        notes: {
          "C:\\Users\\dev\\project\\main.ts": "Windows sticky note",
          "relative\\path.ts": "rejected",
        },
      },
      winCtx,
    );
    expect(winSanitized.notes["C:\\Users\\dev\\project\\main.ts"]).toBe(
      "Windows sticky note",
    );
    expect(winSanitized.notes["relative\\path.ts"]).toBeUndefined();

    const linuxCtx = createContext({
      platform: "linux",
      home: "/home/dev",
      dataDir: "/home/dev/.fm",
    });
    const linuxSanitized = sanitizeSettings(
      {
        notes: {
          "/home/dev/project/main.ts": "Linux sticky note",
        },
      },
      linuxCtx,
    );
    expect(linuxSanitized.notes["/home/dev/project/main.ts"]).toBe(
      "Linux sticky note",
    );

    const entryA = {
      name: "roadmap.md",
      path: fileA,
      isDir: false,
      label: "Markdown",
    };
    const entryB = {
      name: "budget.xlsx",
      path: fileB,
      isDir: false,
      label: "Spreadsheet",
    };
    const notesMap = loaded.notes;

    expect(
      entryMatchesQuickFilter(entryA, "is:noted", {}, Date.now(), notesMap),
    ).toBe(true);
    expect(
      entryMatchesQuickFilter(entryB, "is:noted", {}, Date.now(), notesMap),
    ).toBe(false);
    expect(
      entryMatchesQuickFilter(entryA, "note:any", {}, Date.now(), notesMap),
    ).toBe(true);
    expect(
      entryMatchesQuickFilter(entryB, "note:none", {}, Date.now(), notesMap),
    ).toBe(true);
    expect(
      entryMatchesQuickFilter(
        entryA,
        "note:architecture",
        {},
        Date.now(),
        notesMap,
      ),
    ).toBe(true);
    expect(
      entryMatchesQuickFilter(
        entryA,
        "note:missingword",
        {},
        Date.now(),
        notesMap,
      ),
    ).toBe(false);
    expect(
      entryMatchesQuickFilter(entryA, "friday", {}, Date.now(), notesMap),
    ).toBe(true);
  });

  test("2. Universal 2-File Text & Code Diff Viewer: line-by-line LCS diff, similarity %, and unified patch", async () => {
    const leftFile = path.join(tmpDir, "config.v1.ts");
    const rightFile = path.join(tmpDir, "config.v2.ts");
    await fsp.writeFile(
      leftFile,
      "export const PORT = 3000;\nexport const HOST = 'localhost';\nexport const DEBUG = false;\n",
      "utf8",
    );
    await fsp.writeFile(
      rightFile,
      "export const PORT = 8080;\nexport const HOST = 'localhost';\nexport const DEBUG = true;\nexport const METRICS = true;\n",
      "utf8",
    );

    const res = await compareTextFiles(ctx, leftFile, rightFile);
    expect(res.identical).toBe(false);
    expect(res.added).toBe(3);
    expect(res.removed).toBe(2);
    expect(res.unchanged).toBe(2);
    expect(res.similarityPct).toBeGreaterThan(0);
    expect(res.unifiedPatch).toContain("--- a/config.v1.ts");
    expect(res.unifiedPatch).toContain("+++ b/config.v2.ts");
    expect(res.unifiedPatch).toContain("-export const PORT = 3000;");
    expect(res.unifiedPatch).toContain("+export const PORT = 8080;");

    const rows = computeLineDiff(["a", "b", "c"], ["a", "x", "c"]);
    expect(rows.map((r) => `${r.type}:${r.text}`)).toEqual([
      "same:a",
      "del:b",
      "add:x",
      "same:c",
    ]);
  });

  test("3. Power Bulk Rename 2.0 across darwin, linux, and win32: Regex capture groups, case styles, tokens & OS rules", () => {
    for (const plat of ["darwin", "linux", "win32"] as const) {
      const existing = new Set<string>(["Existing.jpg"]);
      const regexRows = planBulkRename(
        ["IMG_2026_01.jpg", "IMG_2026_02.jpg"],
        {
          mode: "replace",
          find: "^IMG_(\\d+)_(\\d+)$",
          replace: "Photo-$2 ($1)",
          useRegex: true,
          matchCase: true,
        },
        existing,
        plat,
      );
      expect(regexRows.map((r) => r.to)).toEqual([
        "Photo-01 (2026).jpg",
        "Photo-02 (2026).jpg",
      ]);

      // Case-sensitivity difference between Linux (case-sensitive) and macOS/Windows (case-insensitive)
      const clashRows = planBulkRename(
        ["test.jpg"],
        { mode: "replace", find: "test", replace: "existing" },
        existing,
        plat,
      );
      if (plat === "linux") {
        expect(clashRows[0]?.error).toBeNull();
      } else {
        expect(clashRows[0]?.error).toBe(
          "An item with this name already exists.",
        );
      }

      // Windows reserved filename validation on win32
      const reservedRows = planBulkRename(
        ["readme.txt"],
        { mode: "replace", find: "readme", replace: "CON" },
        existing,
        plat,
      );
      if (plat === "win32") {
        expect(reservedRows[0]?.error).toBeTruthy();
      } else {
        expect(reservedRows[0]?.error).toBeNull();
      }
    }

    const existing = new Set<string>();
    const badRegex = planBulkRename(
      ["test.txt"],
      { mode: "replace", find: "[unclosed", replace: "x", useRegex: true },
      existing,
      "darwin",
    );
    expect(badRegex[0]?.error).toBe("Invalid regular expression.");

    expect(
      planBulkRename(
        ["My Hero Banner.png"],
        { mode: "case", style: "snake" },
        existing,
        "darwin",
      )[0]?.to,
    ).toBe("my_hero_banner.png");
    expect(
      planBulkRename(
        ["My Hero Banner.png"],
        { mode: "case", style: "kebab" },
        existing,
        "darwin",
      )[0]?.to,
    ).toBe("my-hero-banner.png");
    expect(
      planBulkRename(
        ["My Hero Banner.png"],
        { mode: "case", style: "camel" },
        existing,
        "darwin",
      )[0]?.to,
    ).toBe("myHeroBanner.png");

    const yyyy = String(new Date().getFullYear());
    const tokenRows = planBulkRename(
      ["draft.md", "notes.md"],
      {
        mode: "number",
        pattern: "{year}-{alpha}-{name}-{ext}-{n}",
        start: 1,
        padding: 2,
      },
      existing,
      "darwin",
    );
    expect(tokenRows.map((r) => r.to)).toEqual([
      `${yyyy}-A-draft-md-01.md`,
      `${yyyy}-B-notes-md-02.md`,
    ]);
  });

  test("4. 1-Click Checksum Manifest Generator & Verifier: .sha256 sidecar, SHA256SUMS, and mismatch detection", async () => {
    const f1 = path.join(tmpDir, "alpha.txt");
    const f2 = path.join(tmpDir, "beta.txt");
    await fsp.writeFile(f1, "hello codecaine\n", "utf8");
    await fsp.writeFile(f2, "second payload\n", "utf8");

    const gen = await generateChecksums(ctx, {
      paths: [f1, f2],
      algorithm: "sha256",
      saveFile: true,
    });
    expect(gen.savedName).toBe("SHA256SUMS");
    expect(gen.items.length).toBe(2);
    expect(gen.savedPath).toBeTruthy();

    const verOk = await verifyChecksums(ctx, { path: gen.savedPath! });
    expect(verOk.passed).toBe(2);
    expect(verOk.failed).toBe(0);
    expect(verOk.missing).toBe(0);

    await fsp.writeFile(f2, "tampered payload\n", "utf8");
    const verFail = await verifyChecksums(ctx, { path: gen.savedPath! });
    expect(verFail.passed).toBe(1);
    expect(verFail.failed).toBe(1);
    expect(verFail.results.find((r) => r.name === "beta.txt")?.status).toBe(
      "mismatch",
    );

    const singleVer = await verifyChecksums(ctx, {
      path: f1,
      expectedHash: gen.items[0]!.hash,
    });
    expect(singleVer.passed).toBe(1);
    expect(singleVer.failed).toBe(0);
  });

  test("5. Folder Inventory & Directory Tree Exporter: ASCII Tree, Markdown Table, CSV, and JSON", async () => {
    const sub = path.join(tmpDir, "src");
    await fsp.mkdir(sub, { recursive: true });
    await fsp.writeFile(path.join(tmpDir, "README.md"), "# Hello\n", "utf8");
    await fsp.writeFile(
      path.join(sub, "index.ts"),
      "console.log(1);\n",
      "utf8",
    );

    const treeRes = await exportFolderInventory(ctx, {
      path: tmpDir,
      format: "tree",
      maxDepth: 3,
      saveFile: false,
    });
    expect(treeRes.totalFolders).toBe(1);
    expect(treeRes.totalFiles).toBe(2);
    expect(treeRes.content).toContain("├── src/");
    expect(treeRes.content).toContain("└── README.md");

    const mdRes = await exportFolderInventory(ctx, {
      path: tmpDir,
      format: "markdown",
      maxDepth: 3,
      saveFile: true,
    });
    expect(mdRes.content).toContain("| `src/` | Folder |");
    expect(mdRes.content).toContain("| `src/index.ts` | File |");
    expect(mdRes.savedPath).toBeTruthy();

    const csvRes = await exportFolderInventory(ctx, {
      path: tmpDir,
      format: "csv",
      maxDepth: 3,
      saveFile: false,
    });
    expect(csvRes.content).toContain('"Path","Name","Type"');
    expect(csvRes.content).toContain('"src/index.ts","index.ts","File"');

    const jsonRes = await exportFolderInventory(ctx, {
      path: tmpDir,
      format: "json",
      maxDepth: 3,
      saveFile: false,
    });
    const parsed = JSON.parse(jsonRes.content);
    expect(parsed.totalFiles).toBe(3);
    expect(parsed.totalFolders).toBe(1);
  });

  test("6. Cross-Platform UI Helpers (darwin, linux, win32): baseName, parentOf, and splitPath", () => {
    // baseName works both with explicit sep and auto-detected sep
    expect(baseName("/Users/alice/notes.md")).toBe("notes.md");
    expect(baseName("/home/alice/notes.md", "/")).toBe("notes.md");
    expect(baseName("C:\\Users\\alice\\notes.md")).toBe("notes.md");
    expect(baseName("C:\\Users\\alice\\notes.md", "\\")).toBe("notes.md");

    expect(parentOf("/Users/alice/notes.md", "/")).toBe("/Users/alice");
    expect(parentOf("C:\\Users\\alice\\notes.md", "\\")).toBe(
      "C:\\Users\\alice",
    );
    expect(splitPath("C:\\Users\\alice", "\\").map((x) => x.name)).toEqual([
      "C:",
      "Users",
      "alice",
    ]);
    expect(splitPath("/home/alice", "/").map((x) => x.name)).toEqual([
      "Computer",
      "home",
      "alice",
    ]);
  });

  test("7. Live UI End-to-End across darwin, linux, and win32 (Sticky Notes, Diff Viewer, Checksums, Inventory, Quick Look Image Inspector)", async () => {
    const GLOBALS = [
      "document",
      "window",
      "Node",
      "Element",
      "HTMLElement",
      "HTMLInputElement",
      "HTMLTextAreaElement",
      "HTMLSelectElement",
      "navigator",
      "location",
      "fetch",
      "ResizeObserver",
    ] as const;
    const saved = new Map<string, PropertyDescriptor | undefined>();
    const uiRoot = mkdtempSync(path.join(os.tmpdir(), "fm-wave2-ui-"));
    const home = path.join(uiRoot, "home");
    const work = path.join(home, "work");
    mkdirSync(work, { recursive: true });

    const PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    writeFileSync(path.join(work, "logo.png"), PNG);
    writeFileSync(
      path.join(work, "v1.ts"),
      "export const x = 1;\nexport const y = 2;\n",
    );
    writeFileSync(
      path.join(work, "v2.ts"),
      "export const x = 1;\nexport const y = 99;\nexport const z = 3;\n",
    );

    mock.module("../resources/file_manager/ui/terminal.js", () => ({
      terminalShell: () => "posix",
      terminalWsl: () => ({}),
      terminalAvailable: () => false,
      typeInTerminal: () => false,
      showTerminal() {},
      hideTerminal() {},
      toggleTerminal() {},
      wireTerminal() {},
      isTerminalOpen: () => false,
    }));

    const server = startFileManagerServer({
      port: 0,
      token: "wave2-token",
      context: {
        home,
        sandboxRoot: home,
        dataDir: path.join(uiRoot, "data"),
        launch: async () => {},
      },
    });

    try {
      const base = `http://127.0.0.1:${server.port}`;
      const html = readFileSync(
        path.join(
          import.meta.dir,
          "..",
          "resources",
          "file_manager",
          "index.html",
        ),
        "utf8",
      )
        .replace(/__FM_TOKEN__/g, "wave2-token")
        .replace(/__FM_PLATFORM__/g, process.platform)
        .replace(/__FM_NONCE__/g, "n")
        .replace(/__FM_START__/g, "");
      const dom = new JSDOM(html, { url: `${base}/`, pretendToBeVisual: true });
      const win = dom.window as any;
      const g = globalThis as any;
      for (const k of GLOBALS)
        if (!saved.has(k)) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
      for (const k of GLOBALS.filter(
        (x) => x !== "fetch" && x !== "ResizeObserver",
      )) {
        Object.defineProperty(g, k, {
          value: win[k],
          configurable: true,
          writable: true,
        });
      }
      Object.defineProperty(g, "ResizeObserver", {
        value: class {
          observe() {}
          disconnect() {}
          unobserve() {}
        },
        configurable: true,
        writable: true,
      });
      const realFetch = saved.get("fetch")!.value as typeof fetch;
      Object.defineProperty(g, "fetch", {
        value: async (u: any, o: any) =>
          realFetch(
            typeof u === "string" && u.startsWith("/") ? base + u : u,
            o,
          ),
        configurable: true,
        writable: true,
      });

      const doc = win.document as Document;
      const { state } =
        (await import("../resources/file_manager/ui/state.js")) as any;
      const { goTo, saveSettings } =
        (await import("../resources/file_manager/ui/nav.js")) as any;
      const { renderList } =
        (await import("../resources/file_manager/ui/list.js")) as any;
      const { renderInfo } =
        (await import("../resources/file_manager/ui/info.js")) as any;
      const { renderSelectionBar } =
        (await import("../resources/file_manager/ui/quickbar.js")) as any;
      const { selectKeys } =
        (await import("../resources/file_manager/ui/selection.js")) as any;
      const { setNoteForPath, noteForPath } =
        (await import("../resources/file_manager/ui/tags.js")) as any;
      const { showCompareTextFiles } =
        (await import("../resources/file_manager/ui/datacompare.js")) as any;
      const {
        generateChecksumManifest,
        verifyChecksumFile,
        showFolderInventoryDialog,
      } = (await import("../resources/file_manager/ui/ops.js")) as any;
      const { openQuickLook, closeQuickLook } =
        (await import("../resources/file_manager/ui/quicklook.js")) as any;
      const { showEntryMenu } =
        (await import("../resources/file_manager/ui/contextmenu.js")) as any;
      const { buildPaletteCatalog } =
        (await import("../resources/file_manager/ui/commandPalette.js")) as any;

      // Test UI behavior across all 3 target platforms: darwin, linux, win32
      for (const plat of ["darwin", "linux", "win32"] as const) {
        state.platform = plat;
        state.sep = plat === "win32" ? "\\" : "/";
        state.home = home;
        state.workspace = "single";
        state.active = "left";
        state.query = "";
        state.filterKind = "all";
        state.filterAnnotatedOnly = false;
        await saveSettings({
          showInfoPanel: true,
          view: "details",
          workspace: "single",
        });
        await goTo(work);

        // Verify context menu & Command Palette build cleanly on each platform without errors
        const v1Entry = state.entries.find((e: any) => e.name === "v1.ts")!;
        const v2Entry = state.entries.find((e: any) => e.name === "v2.ts")!;
        const logoEntry = state.entries.find(
          (e: any) => e.name === "logo.png",
        )!;
        expect(v1Entry).toBeTruthy();
        expect(v2Entry).toBeTruthy();
        expect(logoEntry).toBeTruthy();

        showEntryMenu([v1Entry, v2Entry], { x: 10, y: 10 });
        const menuText = doc.querySelector(".menu")?.textContent ?? "";
        expect(menuText).toContain("Compare / Diff text & code…");
        expect(menuText).toContain("Generate SHA256SUMS manifest");
        doc.querySelector(".menu")?.remove();

        const catalog = buildPaletteCatalog();
        expect(catalog.some((i: any) => i.id === "act.stickyNote")).toBe(true);
        expect(catalog.some((i: any) => i.id === "act.diffTextFiles")).toBe(
          true,
        );
        expect(catalog.some((i: any) => i.id === "act.folderInventory")).toBe(
          true,
        );

        // 1. Sticky Note badge & Details Panel note card
        await setNoteForPath(v1Entry.path, `Important note on ${plat}`);
        expect(noteForPath(v1Entry.path)).toBe(`Important note on ${plat}`);
        renderList();
        const badge = doc.querySelector(
          "[data-note-badge]",
        ) as HTMLElement | null;
        expect(badge).toBeTruthy();
        expect(badge?.getAttribute("title")).toContain(
          `Important note on ${plat}`,
        );

        selectKeys([v1Entry.path]);
        await renderInfo();
        const noteCard = doc.querySelector("[data-info-note-card]");
        expect(noteCard?.textContent).toContain(`Important note on ${plat}`);

        // 2. Selection Bar with 2 files -> Diff Text modal + Split View + Save .patch file
        selectKeys([v1Entry.path, v2Entry.path]);
        renderSelectionBar();
        const diffBtn = doc.querySelector(
          '[data-sb-action="diff-text"]',
        ) as HTMLButtonElement | null;
        expect(diffBtn).toBeTruthy();

        await showCompareTextFiles([v1Entry, v2Entry]);
        const diffHost = doc.querySelector("[data-text-diff-host]");
        expect(diffHost).toBeTruthy();
        expect(diffHost?.textContent).toContain("export const y = 99;");

        const splitBtn = doc.querySelector(
          '[data-diff-mode="split"]',
        ) as HTMLButtonElement | null;
        splitBtn?.click();
        expect(doc.querySelectorAll(".diff-split-row").length).toBeGreaterThan(
          0,
        );

        const savePatchBtn = doc.querySelector(
          "[data-diff-save-patch]",
        ) as HTMLButtonElement | null;
        savePatchBtn?.click();
        const patchTarget = path.join(work, "v1.ts_vs_v2.ts.patch");
        for (
          let attempt = 0;
          attempt < 25 && !existsSync(patchTarget);
          attempt++
        ) {
          await new Promise((r) => setTimeout(r, 40));
        }
        expect(existsSync(patchTarget)).toBe(true);
        doc.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());

        // 3. Checksum Manifest Generation & Verification dialog
        const sumRes = await generateChecksumManifest([v1Entry], "sha256");
        expect(sumRes?.savedPath).toBeTruthy();
        await verifyChecksumFile(sumRes!.savedPath);
        const dlgText =
          doc.querySelector(".modal-backdrop .dialog")?.textContent ?? "";
        expect(dlgText).toContain("all checksums match");
        doc.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());

        // 4. Folder Inventory & Directory Tree Exporter dialog
        await showFolderInventoryDialog(work);
        const invPreview = doc.querySelector("[data-inventory-preview]");
        expect(invPreview?.textContent).toContain("v1.ts");
        doc.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());

        // 5. Quick Look Interactive Image Inspector Bar
        await openQuickLook(logoEntry);
        await new Promise((r) => setTimeout(r, 80));
        const inspector = doc.querySelector("[data-ql-img-inspector]");
        expect(inspector).toBeTruthy();
        const zoomInBtn = doc.querySelector(
          "[data-ql-img-zoom-in]",
        ) as HTMLButtonElement | null;
        const rotRightBtn = doc.querySelector(
          "[data-ql-img-rot-right]",
        ) as HTMLButtonElement | null;
        const flipHBtn = doc.querySelector(
          "[data-ql-img-flip-h]",
        ) as HTMLButtonElement | null;
        const backdropBtn = doc.querySelector(
          "[data-ql-img-backdrop]",
        ) as HTMLButtonElement | null;
        const qlImg = doc.querySelector(".ql-image") as HTMLImageElement | null;
        const qlStage = doc.querySelector(
          "[data-ql-img-stage]",
        ) as HTMLElement | null;

        zoomInBtn?.click();
        rotRightBtn?.click();
        flipHBtn?.click();
        expect(qlImg?.style.transform).toContain("rotate(90deg) scale(-1, 1)");
        expect(doc.querySelector("[data-ql-img-zoom-reset]")?.textContent).toBe(
          "125%",
        );

        expect(qlStage?.dataset.backdrop).toBe("grid");
        backdropBtn?.click();
        expect(qlStage?.dataset.backdrop).toBe("dark");
        backdropBtn?.click();
        expect(qlStage?.dataset.backdrop).toBe("light");
        closeQuickLook();

        // Clean up generated artifacts before testing next platform iteration
        await setNoteForPath(v1Entry.path, "");
        await fsp
          .rm(path.join(work, "v1.ts_vs_v2.ts.patch"), { force: true })
          .catch(() => {});
        if (sumRes?.savedPath)
          await fsp.rm(sumRes.savedPath, { force: true }).catch(() => {});
      }
    } finally {
      const g = globalThis as any;
      for (const k of GLOBALS) {
        const d = saved.get(k);
        if (d) Object.defineProperty(g, k, d);
        else delete g[k];
      }
      server.stop(true);
      rmSync(uiRoot, { recursive: true, force: true });
    }
  });

  test("8. QA Hardening: Cross-Platform Paths, Smart Archive Extraction, >64 KiB Gzip/Zstd Preview, Hash Formats, LAN/Port Scoring & .env Secret Masking", async () => {
    // (A) Simulated win32 context with POSIX host temp dir must never create backslash dirs in cwd
    const winCtx = createContext({
      platform: "win32",
      home: tmpDir,
      sandboxRoot: tmpDir,
      dataDir: path.join(tmpDir, ".win-data"),
    });
    const posixSimWinCtx = createContext({
      platform: "win32",
      home: "/var/folders/posix-sim",
      sandboxRoot: "/var/folders/posix-sim",
      dataDir: path.join(tmpDir, ".win-sim-data"),
    });
    expect(posixSimWinCtx.home).toBe("/var/folders/posix-sim");
    expect(winCtx.home).toBe(path.resolve(tmpDir));
    expect(existsSync(path.join(process.cwd(), "\\var"))).toBe(false);

    // %TEMP% expansion on win32 with non-host Windows home must NOT leak macOS/Linux TMPDIR (/var/folders/...)
    const winTemp = parseTypedPath(
      "%TEMP%\\build.log",
      "C:\\Users\\Alice\\Work",
      "C:\\Users\\Alice",
      "win32",
    );
    expect(winTemp).toBe("C:\\Users\\Alice\\AppData\\Local\\Temp\\build.log");

    // (B) Case-insensitive collision safety in Smart Archive Extraction (Archive.zip vs existing archive.zip sibling)
    const stageSingle = path.join(tmpDir, "stage-single", "Bundle");
    await fsp.mkdir(stageSingle, { recursive: true });
    await fsp.writeFile(path.join(stageSingle, "Archive.zip"), "inner-payload");
    const destExtract = path.join(tmpDir, "extract-dest");
    await fsp.mkdir(destExtract, { recursive: true });
    await fsp.writeFile(
      path.join(destExtract, "archive.zip"),
      "existing-sibling",
    );
    const createdZip = await createZip(ctx, [stageSingle], "bundle.zip");
    const outerZip = path.join(destExtract, "bundle.zip");
    await fsp.copyFile(createdZip.zipPath, outerZip);
    const extracted = await extractArchive(
      winCtx,
      outerZip,
      destExtract,
      "smart",
    );
    expect(extracted.files + extracted.folders).toBeGreaterThanOrEqual(1);
    // Existing sibling must remain untouched even on case-insensitive APFS/NTFS
    expect(
      await fsp.readFile(path.join(destExtract, "archive.zip"), "utf8"),
    ).toBe("existing-sibling");

    // (C) >64 KiB .gz / .zst streaming decompressPrefix preview without ERR_BUFFER_TOO_LARGE
    const largeText =
      "Line of log output for streaming preview verification.\n".repeat(2000); // ~110 KiB (>64 KiB)
    const gzPath = path.join(tmpDir, "large-stream.log.gz");
    await fsp.writeFile(gzPath, Bun.gzipSync(Buffer.from(largeText, "utf8")));
    const gzStat = await fsp.stat(gzPath);
    const gzHandle = await fsp.open(gzPath, "r");
    try {
      const head = Buffer.alloc(Math.min(4096, gzStat.size));
      await gzHandle.read(head, 0, head.length, 0);
      const rich = await inspectRichPreview(
        gzHandle,
        gzPath,
        gzStat.size,
        head,
        null,
        false,
      );
      expect(rich?.kind).toBe("archive");
      if (rich?.kind === "archive") {
        expect(rich.innerText).toContain(
          "Line of log output for streaming preview verification.",
        );
      }
    } finally {
      await gzHandle.close();
    }

    // (D) OpenSSL/BSD SHA256(file)=... & multi-line SHA256SUMS compareHash disambiguation
    const sampleSha =
      "cf4f73021e54410e41970964878f3c572d4f03436dd2bc013a0b6acc2b82bf09";
    const otherSha = "a".repeat(64);
    expect(normalizeHash(`SHA256(app.zip)=${sampleSha}`)).toEqual({
      hex: sampleSha,
      named: "sha256",
    });
    const multiSums = [
      `${otherSha}  other-installer.dmg`,
      `${sampleSha} *target-app.zip`,
    ].join("\n");
    const cmp = compareHash(
      multiSums,
      [{ id: "sha256", value: sampleSha }],
      "target-app.zip",
    );
    expect(cmp.matched).toBe("sha256");

    // (E) Physical Wi-Fi/Ethernet LAN scoring above virtual utun/docker & 169.254.* link-local
    const chosenLan = lanAddress({
      utun0: [
        {
          address: "10.8.0.2",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "10.8.0.2/24",
        },
      ],
      docker0: [
        {
          address: "172.17.0.1",
          netmask: "255.255.0.0",
          family: "IPv4",
          mac: "02:42:ac:11:00:01",
          internal: false,
          cidr: "172.17.0.1/16",
        },
      ],
      en0: [
        {
          address: "169.254.12.34",
          netmask: "255.255.0.0",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "169.254.12.34/16",
        },
        {
          address: "192.168.1.42",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "aa:bb:cc:dd:ee:ff",
          internal: false,
          cidr: "192.168.1.42/24",
        },
      ],
    });
    expect(chosenLan).toBe("192.168.1.42");

    // (F) Task Manager :port token boundary (:80 matches port 80 / 127.0.0.1:80, NOT :8080)
    const makeProc = (ports: string[], command: string): TaskProcessItem => ({
      pid: "1234",
      ppid: "1",
      name: "node",
      command,
      exePath: "/usr/local/bin/node",
      user: "dev",
      state: "R",
      stateText: "Running",
      cpu: 1.2,
      mem: 0.5,
      rssKb: 51200,
      rssMb: "50.0 MB",
      ports,
      uptime: "5m",
      isUserApp: false,
      isDevServer: true,
      isCritical: false,
    });
    expect(
      matchesTaskQuery(
        makeProc(["8080"], "node server.js --addr 127.0.0.1:8080"),
        ":80",
      ),
    ).toBe(false);
    expect(
      matchesTaskQuery(makeProc(["80"], "nginx -g 0.0.0.0:80"), ":80"),
    ).toBe(true);

    // (G) .env Secret Masking precision + DOM state persistence across live edits
    expect(isSecretEnvEntry("PUBLIC_KEY", "pk_live_123")).toBe(false);
    expect(isSecretEnvEntry("NEXT_PUBLIC_API_TOKEN", "pub_123")).toBe(false);
    expect(isSecretEnvEntry("PWD", "/Users/dev/app")).toBe(false);
    expect(isSecretEnvEntry("AUTH_ENABLED", "true")).toBe(false);
    expect(isSecretEnvEntry("TOKEN_TIMEOUT", "3600")).toBe(false);
    expect(
      isSecretEnvEntry(
        "DATABASE_URL",
        "postgres://admin:secret@db.internal:5432/app",
      ),
    ).toBe(true);
    expect(isSecretEnvEntry("DB_PWD", "s3cr3t")).toBe(true);
    expect(
      isSecretEnvEntry("CUSTOM_ENDPOINT", "redis://user:pass@cache:6379"),
    ).toBe(true);

    const dom = new JSDOM(
      "<!doctype html><html><body><div id='pv'></div></body></html>",
    );
    const g = globalThis as any;
    const prevGlobals = {
      document: g.document,
      Node: g.Node,
      Event: g.Event,
    };
    g.document = dom.window.document;
    g.Node = dom.window.Node;
    g.Event = dom.window.Event;
    try {
      const host = dom.window.document.getElementById("pv")!;
      renderEnvPreview(
        host,
        "PUBLIC_KEY=pk_123\nDATABASE_URL=postgres://u:p@h/db\nEMPTY_VAR=\n",
        { docKey: "/tmp/.env" },
      );
      expect(
        host.querySelector(".code-env-table")?.getAttribute("data-copy"),
      ).toBe("off");
      const filterEl = host.querySelector("input.code-in") as HTMLInputElement;
      filterEl.value = "DATABASE";
      filterEl.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      const showBtn = [
        ...host.querySelectorAll(".code-env-actions button"),
      ].find((b) => b.textContent?.includes("Show")) as HTMLButtonElement;
      showBtn.click();
      // Re-render same docKey after an edit -> filterEl, filter value & reveal state persist!
      renderEnvPreview(
        host,
        "PUBLIC_KEY=pk_123\nDATABASE_URL=postgres://u:p@h/db\nNEW_VAR=42\n",
        { docKey: "/tmp/.env" },
      );
      expect(host.querySelector("input.code-in")).toBe(filterEl);
      expect(
        (host.querySelector("input.code-in") as HTMLInputElement).value,
      ).toBe("DATABASE");
      expect(
        host.querySelector(".code-env-table tbody tr td")?.textContent,
      ).toContain("postgres://u:p@h/db");
    } finally {
      for (const [k, v] of Object.entries(prevGlobals)) {
        if (v === undefined) delete g[k];
        else g[k] = v;
      }
    }
  });
});
