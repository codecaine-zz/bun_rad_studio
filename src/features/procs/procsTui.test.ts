import { describe, expect, it } from "bun:test";
import {
  applyProcsTuiAction,
  handleProcsTuiKey,
  renderProcsDetails,
  renderProcsTuiFrame,
  type ProcsTuiState,
} from "./procsTui.ts";
import type { ProcessInfo } from "./procsTypes.ts";

describe("procs TUI module", () => {
  const sampleProcs: ProcessInfo[] = [
    { pid: 101, ppid: 1, user: "alice", cpu: 5.2, mem: 1.8, stat: "S", time: "0:01", command: "bun test" },
    { pid: 102, ppid: 1, user: "bob", cpu: 0.1, mem: 0.5, stat: "S", time: "0:00", command: "zsh" },
    { pid: 103, ppid: 101, user: "alice", cpu: 12.0, mem: 4.2, stat: "R", time: "0:15", command: "node server.js" },
  ];

  function createTestState(overrides?: Partial<ProcsTuiState>): ProcsTuiState {
    return {
      allProcesses: [...sampleProcs],
      filteredProcesses: [...sampleProcs],
      selectedIndex: 0,
      scrollOffset: 0,
      sortBy: "cpu",
      filterQuery: "",
      isFiltering: false,
      isPaused: false,
      showingDetails: false,
      shouldExit: false,
      ...overrides,
    };
  }

  it("translates keypresses to actions in normal and filtering modes", () => {
    // Normal mode
    expect(handleProcsTuiKey("j").type).toBe("MOVE");
    expect(handleProcsTuiKey("k").type).toBe("MOVE");
    expect(handleProcsTuiKey("r").type).toBe("REFRESH");
    expect(handleProcsTuiKey("x").type).toBe("KILL");
    expect(handleProcsTuiKey("9").type).toBe("KILL");
    expect(handleProcsTuiKey("/").type).toBe("START_FILTER");
    expect(handleProcsTuiKey("c").type).toBe("SET_SORT");
    expect(handleProcsTuiKey("m").type).toBe("SET_SORT");
    expect(handleProcsTuiKey("p").type).toBe("SET_SORT");
    expect(handleProcsTuiKey("u").type).toBe("SET_SORT");
    expect(handleProcsTuiKey(" ").type).toBe("TOGGLE_PAUSE");
    expect(handleProcsTuiKey("d").type).toBe("TOGGLE_DETAILS");
    expect(handleProcsTuiKey("q").type).toBe("QUIT");

    // Filtering mode
    expect(handleProcsTuiKey("a", true)).toEqual({ type: "FILTER_CHAR", char: "a" });
    expect(handleProcsTuiKey("\b", true).type).toBe("FILTER_BACKSPACE");
    expect(handleProcsTuiKey("\r", true).type).toBe("FILTER_CONFIRM");
    expect(handleProcsTuiKey("\u001b", true).type).toBe("FILTER_CLEAR");
  });

  it("applies move actions with boundary checks", () => {
    const state = createTestState();

    applyProcsTuiAction(state, { type: "MOVE", delta: 1 });
    expect(state.selectedIndex).toBe(1);

    applyProcsTuiAction(state, { type: "MOVE", delta: 1 });
    expect(state.selectedIndex).toBe(2);

    // Cannot move beyond length
    applyProcsTuiAction(state, { type: "MOVE", delta: 1 });
    expect(state.selectedIndex).toBe(2);

    applyProcsTuiAction(state, { type: "MOVE", delta: -1 });
    expect(state.selectedIndex).toBe(1);
  });

  it("filters processes live as characters are typed", () => {
    const state = createTestState();
    expect(state.filteredProcesses.length).toBe(3);

    // Start filtering
    applyProcsTuiAction(state, { type: "START_FILTER" });
    expect(state.isFiltering).toBe(true);

    // Type "node"
    applyProcsTuiAction(state, { type: "FILTER_CHAR", char: "n" });
    applyProcsTuiAction(state, { type: "FILTER_CHAR", char: "o" });
    applyProcsTuiAction(state, { type: "FILTER_CHAR", char: "d" });
    applyProcsTuiAction(state, { type: "FILTER_CHAR", char: "e" });

    expect(state.filterQuery).toBe("node");
    expect(state.filteredProcesses.length).toBe(1);
    expect(state.filteredProcesses[0]?.command).toBe("node server.js");

    // Backspace
    applyProcsTuiAction(state, { type: "FILTER_BACKSPACE" });
    expect(state.filterQuery).toBe("nod");

    // Clear filter
    applyProcsTuiAction(state, { type: "FILTER_CLEAR" });
    expect(state.filterQuery).toBe("");
    expect(state.filteredProcesses.length).toBe(3);
    expect(state.isFiltering).toBe(false);
  });

  it("switches sorting between CPU, MEM, PID, and USER", () => {
    const state = createTestState();

    applyProcsTuiAction(state, { type: "SET_SORT", sortBy: "mem" });
    expect(state.sortBy).toBe("mem");
    expect(state.filteredProcesses[0]?.mem).toBe(4.2); // node server.js

    applyProcsTuiAction(state, { type: "SET_SORT", sortBy: "pid" });
    expect(state.sortBy).toBe("pid");
    expect(state.filteredProcesses[0]?.pid).toBe(101);

    applyProcsTuiAction(state, { type: "SET_SORT", sortBy: "user" });
    expect(state.sortBy).toBe("user");
    expect(state.filteredProcesses[0]?.user).toBe("alice");
  });

  it("toggles pause of live auto-refresh", () => {
    const state = createTestState();
    expect(state.isPaused).toBe(false);

    applyProcsTuiAction(state, { type: "TOGGLE_PAUSE" });
    expect(state.isPaused).toBe(true);

    applyProcsTuiAction(state, { type: "TOGGLE_PAUSE" });
    expect(state.isPaused).toBe(false);
  });

  it("renders process details card modal", () => {
    const state = createTestState({ showingDetails: true });
    const frame = renderProcsTuiFrame(state, 15);
    expect(frame).toContain("Process Details: PID 101");
    expect(frame).toContain("bun test");
    expect(frame).toContain("Child PIDs");

    // Can also test renderProcsDetails directly
    const details = renderProcsDetails(sampleProcs[0]!, sampleProcs);
    expect(details).toContain("Child PIDs      : 103");
  });

  it("auto-refreshes processes state upon KILL action", () => {
    const originalKill = process.kill;
    let killedPid: number | undefined;
    let killedSignal: string | undefined;
    (process as any).kill = (pid: number, signal: string) => {
      killedPid = pid;
      killedSignal = signal;
    };

    try {
      const state = createTestState();

      // Initially index 0 is PID 101
      applyProcsTuiAction(state, { type: "KILL", force: false });
      expect(killedPid).toBe(101);
      expect(killedSignal).toBe("SIGTERM");
      expect(state.statusMessage).toContain("Sent SIGTERM to PID 101");
      expect(state.allProcesses.length).toBe(2);
      expect(state.filteredProcesses.length).toBe(2);

      // Remaining are [102, 103], sorted by CPU: PID 103 (12%) is now at index 0
      applyProcsTuiAction(state, { type: "KILL", force: true });
      expect(killedPid).toBe(103);
      expect(killedSignal).toBe("SIGKILL");
      expect(state.statusMessage).toContain("Sent SIGKILL to PID 103");
      expect(state.allProcesses.length).toBe(1);
    } finally {
      process.kill = originalKill;
    }
  });
});
