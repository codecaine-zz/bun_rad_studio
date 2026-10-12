import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  SubprocessPipelineController,
  PipelineLibrary,
  executePipelineStage,
  executePipeline,
  isSudoRequired,
  isDestructiveCommand,
  checkSudoPreflight,
  prepareElevatedCommand,
  withAskpass,
  generatePipelineShellCommand,
  generateShellScript,
  getDefaultPipelinePresets,
  createSubprocessPipeStudio,
  type SubprocessStage,
  type NamedPipeline,
} from "../applications/subprocess_pipe_studio";
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Subprocess Pipe Pro - Shell Process Master & Multi-Stage Pipelining", () => {
  const testStoragePath = join(tmpdir(), `test_saved_pipelines_${Date.now()}.json`);

  afterEach(() => {
    try {
      if (existsSync(testStoragePath)) {
        unlinkSync(testStoragePath);
      }
    } catch {}
  });

  describe("1. Named Pipeline Library & Multi-Pipeline Management", () => {
    it("initializes PipelineLibrary with default presets and lists names", () => {
      const library = new PipelineLibrary(testStoragePath);
      const names = library.listNames();
      expect(names.length).toBeGreaterThanOrEqual(4);
      expect(names).toContain("Process Filter & Telemetry");
      expect(names).toContain("JSON Stream Filter & Sort");
      expect(names).toContain("Word Frequency & Text Analytics");
    });

    it("saves multiple named pipelines with custom stages and configurations", () => {
      const library = new PipelineLibrary(testStoragePath);

      const custom1: NamedPipeline = {
        id: "pipe_audit_1",
        name: "Security Log Auditor",
        description: "Scans authorization logs for failed attempts",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mode: "piped",
        initialStdin: "user=root status=failed\nuser=admin status=ok\nuser=guest status=failed",
        stages: [
          {
            id: "s1",
            name: "Grep Failed",
            command: "grep 'status=failed'",
            inputMode: "initial",
            enabled: true,
            stopOnError: true,
            timeoutMs: 5000,
          },
          {
            id: "s2",
            name: "Extract User",
            command: "awk '{print $1}'",
            inputMode: "piped",
            enabled: true,
            stopOnError: true,
            timeoutMs: 5000,
          },
        ],
      };

      const custom2: NamedPipeline = {
        id: "pipe_bench_2",
        name: "Memory Benchmark Pipeline",
        description: "Telemetry check on system memory",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mode: "sequential",
        initialStdin: "",
        stages: [
          {
            id: "m1",
            name: "Check Memory",
            command: process.platform === "darwin" ? "vm_stat" : "free -m",
            inputMode: "none",
            enabled: true,
            stopOnError: false,
            timeoutMs: 5000,
          },
        ],
      };

      library.savePipeline(custom1);
      library.savePipeline(custom2);

      expect(library.hasPipeline("Security Log Auditor")).toBe(true);
      expect(library.hasPipeline("Memory Benchmark Pipeline")).toBe(true);

      const retrieved1 = library.getPipeline("Security Log Auditor");
      expect(retrieved1).toBeDefined();
      expect(retrieved1?.stages.length).toBe(2);
      expect(retrieved1?.stages[0]?.command).toBe("grep 'status=failed'");

      const retrieved2 = library.getPipeline("Memory Benchmark Pipeline");
      expect(retrieved2).toBeDefined();
      expect(retrieved2?.mode).toBe("sequential");
    });

    it("persists named pipelines to disk and reloads them accurately", () => {
      const library1 = new PipelineLibrary(testStoragePath);
      library1.savePipeline({
        id: "p_persist",
        name: "Disk Persistence Test",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mode: "piped",
        initialStdin: "hello persistent world",
        stages: [
          {
            id: "s_p",
            name: "Uppercase Stage",
            command: "tr a-z A-Z",
            inputMode: "piped",
            enabled: true,
            stopOnError: true,
            timeoutMs: 5000,
          },
        ],
      });

      expect(existsSync(testStoragePath)).toBe(true);

      // Create a new instance pointing to the same file
      const library2 = new PipelineLibrary(testStoragePath);
      expect(library2.hasPipeline("Disk Persistence Test")).toBe(true);

      const loaded = library2.getPipeline("Disk Persistence Test");
      expect(loaded?.initialStdin).toBe("hello persistent world");
      expect(loaded?.stages[0]?.command).toBe("tr a-z A-Z");
    });

    it("clones and deletes named pipelines cleanly", () => {
      const library = new PipelineLibrary(testStoragePath);
      const cloned = library.clonePipeline("Process Filter & Telemetry", "Process Filter (Duplicate)");
      expect(cloned).not.toBeNull();
      expect(cloned?.name).toBe("Process Filter (Duplicate)");
      expect(library.hasPipeline("Process Filter (Duplicate)")).toBe(true);

      const deleted = library.deletePipeline("Process Filter (Duplicate)");
      expect(deleted).toBe(true);
      expect(library.hasPipeline("Process Filter (Duplicate)")).toBe(false);
    });

    it("exports and imports entire pipeline library JSON collections", () => {
      const library1 = new PipelineLibrary(testStoragePath);
      const exportedJson = library1.exportJson();
      expect(typeof exportedJson).toBe("string");
      expect(exportedJson).toContain("Process Filter & Telemetry");

      const importStorage = join(tmpdir(), `test_import_${Date.now()}.json`);
      const library2 = new PipelineLibrary(importStorage);
      const count = library2.importJson(exportedJson);
      expect(count).toBeGreaterThanOrEqual(4);
      expect(library2.hasPipeline("Process Filter & Telemetry")).toBe(true);

      try {
        if (existsSync(importStorage)) unlinkSync(importStorage);
      } catch {}
    });
  });

  describe("2. Subprocess Execution & Stream Pipelining", () => {
    it("executes a single subprocess stage in isolation", async () => {
      const stage: SubprocessStage = {
        id: "test_isolated",
        name: "Uppercase Test",
        command: "tr a-z A-Z",
        inputMode: "piped",
        enabled: true,
        stopOnError: true,
        timeoutMs: 5000,
      };

      const result = await executePipelineStage(stage, "bun rad studio");
      expect(result.status).toBe("success");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("BUN RAD STUDIO");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stdinUsed).toBe("bun rad studio");
    });

    it("pipes data sequentially through multiple subprocess stages in exact order", async () => {
      const stages: SubprocessStage[] = [
        {
          id: "stage_gen",
          name: "Generate Words",
          command: "echo 'Apple Banana Cherry Date'",
          inputMode: "none",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "stage_split",
          name: "Split Lines",
          command: "tr ' ' '\\n'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "stage_filter",
          name: "Filter with B",
          command: "grep 'B'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ];

      const report = await executePipeline(stages, "", { mode: "piped" });
      expect(report.status).toBe("success");
      expect(report.stagesCompleted).toBe(3);
      expect(report.finalStdout.trim()).toBe("Banana");

      const genRes = report.stageResults["stage_gen"];
      const splitRes = report.stageResults["stage_split"];
      const filterRes = report.stageResults["stage_filter"];

      expect(genRes?.stdout.trim()).toBe("Apple Banana Cherry Date");
      expect(splitRes?.stdout.trim()).toBe("Apple\nBanana\nCherry\nDate");
      expect(filterRes?.stdout.trim()).toBe("Banana");
    });

    it("steps through pipeline one stage at a time in order (Step-by-Step Testing)", async () => {
      const stages: SubprocessStage[] = [
        {
          id: "step_1",
          name: "Step 1: Input",
          command: "printf '42\\n10\\n99\\n5'",
          inputMode: "none",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "step_2",
          name: "Step 2: Numeric Sort",
          command: "sort -n",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "step_3",
          name: "Step 3: Head Top 2",
          command: "head -n 2",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ];

      const controller = new SubprocessPipelineController(stages);
      expect(controller.getCurrentStepIndex()).toBe(0);

      // Step 1
      const step1 = await controller.stepNext();
      expect(step1).not.toBeNull();
      expect(step1?.stage.id).toBe("step_1");
      expect(step1?.result.stdout.trim()).toBe("42\n10\n99\n5");
      expect(controller.getCurrentStepIndex()).toBe(1);

      // Step 2
      const step2 = await controller.stepNext();
      expect(step2).not.toBeNull();
      expect(step2?.stage.id).toBe("step_2");
      expect(step2?.result.stdout.trim()).toBe("5\n10\n42\n99");
      expect(controller.getCurrentStepIndex()).toBe(2);

      // Step 3
      const step3 = await controller.stepNext();
      expect(step3).not.toBeNull();
      expect(step3?.stage.id).toBe("step_3");
      expect(step3?.result.stdout.trim()).toBe("5\n10");
      expect(controller.getCurrentStepIndex()).toBe(3);

      // Finished
      const stepDone = await controller.stepNext();
      expect(stepDone).toBeNull();
    });

    it("handles errors and respects stopOnError flag", async () => {
      const stages: SubprocessStage[] = [
        {
          id: "s_ok",
          name: "Good Stage",
          command: "echo 'hello'",
          inputMode: "none",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "s_fail",
          name: "Failing Stage",
          command: "exit 42",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "s_skipped",
          name: "Should Be Skipped",
          command: "echo 'should not run'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ];

      const report = await executePipeline(stages);
      expect(report.status).toBe("error");
      expect(report.errorStageId).toBe("s_fail");
      expect(report.stageResults["s_fail"]?.exitCode).toBe(42);
      expect(report.stageResults["s_skipped"]?.status).toBe("skipped");
    });
  });

  describe("3. Sudo Detection, Privilege Elevation & Security Guard", () => {
    it("accurately detects commands that require sudo elevation", () => {
      expect(isSudoRequired("sudo apt-get update")).toBe(true);
      expect(isSudoRequired("sudo dmesg")).toBe(true);
      expect(isSudoRequired("cat /var/log/syslog | sudo tee /tmp/log")).toBe(true);
      expect(isSudoRequired("echo 1 && sudo sysctl -p")).toBe(true);
      expect(isSudoRequired("ls -la")).toBe(false);
      expect(isSudoRequired("ps aux | grep bun")).toBe(false);
    });

    it("detects destructive root commands to prevent accidental system damage", () => {
      const danger1 = isDestructiveCommand("rm -rf /");
      expect(danger1.isDestructive).toBe(true);
      expect(danger1.warning).toContain("CRITICAL");

      const danger2 = isDestructiveCommand("sudo dd of=/dev/sda");
      expect(danger2.isDestructive).toBe(true);

      const danger3 = isDestructiveCommand("chmod -R 777 /");
      expect(danger3.isDestructive).toBe(true);

      const safe = isDestructiveCommand("rm -rf ./tmp_cache");
      expect(safe.isDestructive).toBe(false);
    });

    it("blocks destructive commands before spawning child process", async () => {
      const badStage: SubprocessStage = {
        id: "bad_stage",
        name: "Destructive Root Command",
        command: "rm -rf /",
        inputMode: "none",
        enabled: true,
        stopOnError: true,
        timeoutMs: 5000,
      };

      const result = await executePipelineStage(badStage, "");
      expect(result.status).toBe("error");
      expect(result.exitCode).toBe(126);
      expect(result.stderr).toContain("Security Guard Blocked Execution");
    });

    it("prepares elevated command with non-interactive and askpass wrappers", () => {
      const nonInteractive = prepareElevatedCommand("dmesg", {
        runWithSudo: true,
        elevationMode: "non_interactive",
      });
      expect(nonInteractive.isElevated).toBe(true);
      expect(nonInteractive.command).toContain("sudo -n");

      const askpass = prepareElevatedCommand("dmesg", {
        runWithSudo: true,
        elevationMode: "askpass",
        askpassScriptPath: "/tmp/askpass.sh",
      });
      expect(askpass.isElevated).toBe(true);
      expect(askpass.command).toContain("sudo -A");

      if (process.platform === "darwin") {
        const macPrompt = prepareElevatedCommand("dmesg", {
          runWithSudo: true,
          elevationMode: "macos_prompt",
        });
        expect(macPrompt.isElevated).toBe(true);
        expect(macPrompt.command).toContain("osascript");
        expect(macPrompt.command).toContain("with administrator privileges");
      }
    });

    it("creates, exercises, and safely unlinks temporary askpass helper scripts", async () => {
      let scriptExistedDuringRun = false;
      const res = await withAskpass("test_secret_123", async (askpassPath, env) => {
        const { existsSync } = await import("fs");
        scriptExistedDuringRun = existsSync(askpassPath);
        expect(env.BUN_RAD_SUDO_PASS).toBe("test_secret_123");
        expect(env.SUDO_ASKPASS).toBe(askpassPath);

        const proc = Bun.spawn([askpassPath], { env: { ...process.env, ...env }, stdout: "pipe" });
        const out = await new Response(proc.stdout).text();
        await proc.exited;
        expect(out.trim()).toBe("test_secret_123");

        return "askpass_success";
      });

      expect(res).toBe("askpass_success");
      expect(scriptExistedDuringRun).toBe(true);
    });

    it("runs preflight diagnostics for sudo environment", async () => {
      const diag = await checkSudoPreflight();
      expect(typeof diag.hasSudoBinary).toBe("boolean");
      expect(typeof diag.isCached).toBe("boolean");
      expect(typeof diag.user).toBe("string");
      expect(typeof diag.osPlatform).toBe("string");
    });
  });

  describe("4. Shell Script & One-Liner Exporters", () => {
    it("generates multi-stage piped one-liner command", () => {
      const stages: SubprocessStage[] = [
        {
          id: "s1",
          name: "Cat File",
          command: "cat server.log",
          inputMode: "none",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "s2",
          name: "Grep Error",
          command: "grep -i 'error'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "s3",
          name: "Count Lines",
          command: "wc -l",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ];

      const oneLiner = generatePipelineShellCommand(stages, { mode: "piped" });
      expect(oneLiner).toContain("cat server.log");
      expect(oneLiner).toContain("| grep -i 'error'");
      expect(oneLiner).toContain("| wc -l");
    });

    it("generates standalone executable shell script with error traps and comments", () => {
      const stages: SubprocessStage[] = [
        {
          id: "s1",
          name: "List",
          command: "ls -la",
          inputMode: "none",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
        {
          id: "s2",
          name: "Filter",
          command: "grep '.ts'",
          inputMode: "piped",
          enabled: true,
          stopOnError: true,
          timeoutMs: 5000,
        },
      ];

      const script = generateShellScript(stages, {
        name: "Test Build Pipeline",
        mode: "piped",
      });

      expect(script).toContain("#!/usr/bin/env bash");
      expect(script).toContain("set -euo pipefail");
      expect(script).toContain("Test Build Pipeline");
      expect(script).toContain("ls -la");
      expect(script).toContain("grep '.ts'");
    });
  });

  describe("5. Complete GUI Interface Event & State Simulation", () => {
    it("constructs SimpleWindow with all controls, cards, and tables initialized", () => {
      const win = createSubprocessPipeStudio({ fullscreen: false });
      expect(win).toBeDefined();

      const controls = (win as any).controls as any[];
      expect(controls.length).toBeGreaterThan(25);

      // Verify controls exist
      expect(controls.find((c) => c.id === "txt_pipeline_name")).toBeDefined();
      expect(controls.find((c) => c.id === "btn_save_named_pipeline")).toBeDefined();
      expect(controls.find((c) => c.id === "btn_save_as_new")).toBeDefined();
      expect(controls.find((c) => c.id === "dd_saved_pipelines")).toBeDefined();
      expect(controls.find((c) => c.id === "btn_load_named_pipeline")).toBeDefined();
      expect(controls.find((c) => c.id === "btn_delete_named_pipeline")).toBeDefined();
      expect(controls.find((c) => c.id === "tbl_stages")).toBeDefined();
      expect(controls.find((c) => c.id === "btn_run_all")).toBeDefined();
      expect(controls.find((c) => c.id === "btn_step_next")).toBeDefined();
      expect(controls.find((c) => c.id === "btn_test_selected")).toBeDefined();
      expect(controls.find((c) => c.id === "btn_check_sudo")).toBeDefined();
      expect(controls.find((c) => c.id === "btn_auth_sudo")).toBeDefined();
      expect(controls.find((c) => c.id === "txt_inspector_content")).toBeDefined();
    });

    function triggerEvent(win: any, controlId: string, eventName = "click", val?: any) {
      const map = win.eventHandlersMap as Map<string, any>;
      const cb =
        map.get(`${controlId}:${eventName.toLowerCase()}`) ||
        map.get(`${controlId}:on${eventName.toLowerCase()}`);
      if (!cb) throw new Error(`Handler not found for ${controlId}:${eventName}`);
      return cb(win, val);
    }

    it("simulates saving a new named pipeline through the GUI buttons", () => {
      const win = createSubprocessPipeStudio({ fullscreen: false });

      // Change pipeline name in GUI
      win.setValue("txt_pipeline_name", "Enterprise Log Sifter");

      // Trigger 'Save Pipeline' button
      triggerEvent(win, "btn_save_named_pipeline", "click");

      // Verify dropdown list was updated to include the new pipeline name
      const listItems = win.getListItems("dd_saved_pipelines");
      expect(listItems).toContain("Enterprise Log Sifter");
      expect(win.getValue("dd_saved_pipelines")).toBe("Enterprise Log Sifter");
    });

    it("simulates 'Save As New...' button through the GUI", () => {
      const win = createSubprocessPipeStudio({ fullscreen: false });
      win.setValue("txt_pipeline_name", "Data Ingestion Pipeline");

      triggerEvent(win, "btn_save_as_new", "click");

      const listItems = win.getListItems("dd_saved_pipelines");
      const currentName = win.getValue("txt_pipeline_name");
      expect(currentName).toMatch(/^Data Ingestion Pipeline \(Copy/);
      expect(listItems).toContain(currentName);
    });

    it("simulates loading a selected named pipeline from library dropdown", () => {
      const win = createSubprocessPipeStudio({ fullscreen: false });

      // Select 'JSON Stream Filter & Sort' and click Load
      win.setValue("dd_saved_pipelines", "JSON Stream Filter & Sort");
      triggerEvent(win, "btn_load_named_pipeline", "click");

      expect(win.getValue("txt_pipeline_name")).toBe("JSON Stream Filter & Sort");
      expect(win.getValue("txt_pipeline_stdin")).toContain("services");
    });

    it("simulates deleting a saved pipeline through the GUI", () => {
      const win = createSubprocessPipeStudio({ fullscreen: false });

      // First save a disposable pipeline
      win.setValue("txt_pipeline_name", "Disposable Pipeline");
      triggerEvent(win, "btn_save_named_pipeline", "click");

      expect(win.getListItems("dd_saved_pipelines")).toContain("Disposable Pipeline");

      // Select it and click delete
      win.setValue("dd_saved_pipelines", "Disposable Pipeline");
      triggerEvent(win, "btn_delete_named_pipeline", "click");

      expect(win.getListItems("dd_saved_pipelines")).not.toContain("Disposable Pipeline");
    });

    it("simulates stage manipulation controls (Add, Move, Duplicate, Remove, Apply)", () => {
      const win = createSubprocessPipeStudio({ fullscreen: false });

      triggerEvent(win, "btn_add_stage", "click");
      triggerEvent(win, "btn_clone_stage", "click");
      triggerEvent(win, "btn_move_up", "click");
      triggerEvent(win, "btn_move_down", "click");

      win.setValue("txt_stage_name", "Replaced Stage Name");
      triggerEvent(win, "btn_apply_stage", "click");

      triggerEvent(win, "btn_remove_stage", "click");
    });

    it("simulates full execution and step next triggers through the GUI", async () => {
      const win = createSubprocessPipeStudio({ fullscreen: false });

      // Run All
      await triggerEvent(win, "btn_run_all", "click");

      const statusText = win.getText("lbl_telemetry_status");
      expect(statusText).toContain("SUCCESS");

      // Reset
      triggerEvent(win, "btn_reset", "click");
      expect(win.getText("lbl_telemetry_status")).toContain("IDLE");

      // Step Next
      await triggerEvent(win, "btn_step_next", "click");
      expect(win.getText("lbl_telemetry_status")).toContain("Passed");
    });

    it("simulates Sudo Manager interactions (check sudo, clear password, mode switch)", async () => {
      const win = createSubprocessPipeStudio({ fullscreen: false });

      await triggerEvent(win, "btn_check_sudo", "click");
      expect(win.getText("lbl_sudo_state")).toBeDefined();

      win.setValue("txt_sudo_password", "my_session_pw");
      triggerEvent(win, "btn_clear_sudo_password", "click");
      expect(win.getValue("txt_sudo_password")).toBe("");

      triggerEvent(win, "dd_sudo_elevation_mode", "change", "Askpass Helper (Session Memory Password)");
    });

    it("simulates Stdin samples and Export buttons", () => {
      const win = createSubprocessPipeStudio({ fullscreen: false });

      triggerEvent(win, "btn_clear_stdin", "click");
      expect(win.getValue("txt_pipeline_stdin")).toBe("");

      triggerEvent(win, "btn_load_sample_json", "click");
      expect(win.getValue("txt_pipeline_stdin")).toContain("services");

      triggerEvent(win, "btn_load_sample_text", "click");
      expect(win.getValue("txt_pipeline_stdin")).toContain("Bun");

      triggerEvent(win, "btn_export_script", "click");
      triggerEvent(win, "btn_copy_script", "click");
      triggerEvent(win, "btn_export_library", "click");
      triggerEvent(win, "btn_copy_library_json", "click");
      triggerEvent(win, "btn_copy_output", "click");
      triggerEvent(win, "btn_save_output_file", "click");
    });
  });
});
