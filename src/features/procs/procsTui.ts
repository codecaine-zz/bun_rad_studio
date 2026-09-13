import type { ProcessInfo, SortField } from "./procsTypes.ts";
import {
  fetchListeningPorts,
  fetchRawProcessList,
  filterProcesses,
  parsePsOutput,
  sortProcesses,
} from "./procsDoers.ts";
import { colors } from "../../shared/colors.ts";

export interface ProcsTuiState {
  allProcesses: ProcessInfo[];
  filteredProcesses: ProcessInfo[];
  selectedIndex: number;
  scrollOffset: number;
  sortBy: SortField;
  filterQuery: string;
  isFiltering: boolean;
  isPaused: boolean;
  showingDetails: boolean;
  statusMessage?: string;
  shouldExit: boolean;
}

export type ProcsTuiAction =
  | { type: "MOVE"; delta: number }
  | { type: "KILL"; force?: boolean }
  | { type: "START_FILTER" }
  | { type: "FILTER_CHAR"; char: string }
  | { type: "FILTER_BACKSPACE" }
  | { type: "FILTER_CONFIRM" }
  | { type: "FILTER_CLEAR" }
  | { type: "SET_SORT"; sortBy: SortField }
  | { type: "TOGGLE_PAUSE" }
  | { type: "TOGGLE_DETAILS" }
  | { type: "REFRESH" }
  | { type: "QUIT" }
  | { type: "NONE" };

// Doer: filter and sort process list based on current query and sort field
export function recalculateFiltered(
  all: ProcessInfo[],
  query: string,
  sortBy: SortField
): ProcessInfo[] {
  const filtered = filterProcesses(all, query);
  return sortProcesses(filtered, sortBy);
}

// Doer: parse input keypress into a semantic TUI action
export function handleProcsTuiKey(keyStr: string, isFiltering = false): ProcsTuiAction {
  if (isFiltering) {
    if (keyStr === "\r" || keyStr === "\n") return { type: "FILTER_CONFIRM" };
    if (keyStr === "\u001b") return { type: "FILTER_CLEAR" };
    if (keyStr === "\u007f" || keyStr === "\b") return { type: "FILTER_BACKSPACE" };
    if (keyStr.length === 1 && keyStr.charCodeAt(0) >= 32) {
      return { type: "FILTER_CHAR", char: keyStr };
    }
    return { type: "NONE" };
  }

  if (keyStr === "q" || keyStr === "\u0003") return { type: "QUIT" };
  if (keyStr === "\u001b[A" || keyStr === "k") return { type: "MOVE", delta: -1 };
  if (keyStr === "\u001b[B" || keyStr === "j") return { type: "MOVE", delta: 1 };
  if (keyStr === "\u001b[5~") return { type: "MOVE", delta: -10 };
  if (keyStr === "\u001b[6~") return { type: "MOVE", delta: 10 };
  if (keyStr === "/" || keyStr === "f") return { type: "START_FILTER" };
  if (keyStr === "\u001b") return { type: "FILTER_CLEAR" };
  if (keyStr === "x" || keyStr === "K") return { type: "KILL", force: false };
  if (keyStr === "9" || keyStr === "X") return { type: "KILL", force: true };
  if (keyStr === "c") return { type: "SET_SORT", sortBy: "cpu" };
  if (keyStr === "m") return { type: "SET_SORT", sortBy: "mem" };
  if (keyStr === "p") return { type: "SET_SORT", sortBy: "pid" };
  if (keyStr === "u") return { type: "SET_SORT", sortBy: "user" };
  if (keyStr === " ") return { type: "TOGGLE_PAUSE" };
  if (keyStr === "\r" || keyStr === "\n" || keyStr === "d") return { type: "TOGGLE_DETAILS" };
  if (keyStr === "r") return { type: "REFRESH" };
  return { type: "NONE" };
}

// Doer: update state based on action
export function applyProcsTuiAction(state: ProcsTuiState, action: ProcsTuiAction): ProcsTuiState {
  if (action.type === "QUIT") {
    if (state.showingDetails) {
      state.showingDetails = false;
      return state;
    }
    state.shouldExit = true;
    return state;
  }

  if (action.type === "START_FILTER") {
    state.isFiltering = true;
    state.statusMessage = "Type to filter processes... (Enter: confirm, Esc: clear)";
    return state;
  }

  if (action.type === "FILTER_CHAR") {
    state.filterQuery += action.char;
    state.filteredProcesses = recalculateFiltered(state.allProcesses, state.filterQuery, state.sortBy);
    state.selectedIndex = 0;
    return state;
  }

  if (action.type === "FILTER_BACKSPACE") {
    state.filterQuery = state.filterQuery.slice(0, -1);
    state.filteredProcesses = recalculateFiltered(state.allProcesses, state.filterQuery, state.sortBy);
    state.selectedIndex = 0;
    return state;
  }

  if (action.type === "FILTER_CONFIRM") {
    state.isFiltering = false;
    state.statusMessage = state.filterQuery ? `Filter set to "${state.filterQuery}".` : undefined;
    return state;
  }

  if (action.type === "FILTER_CLEAR") {
    state.isFiltering = false;
    state.filterQuery = "";
    state.filteredProcesses = recalculateFiltered(state.allProcesses, "", state.sortBy);
    state.selectedIndex = 0;
    state.statusMessage = "Filter cleared.";
    return state;
  }

  if (action.type === "SET_SORT") {
    state.sortBy = action.sortBy;
    state.filteredProcesses = recalculateFiltered(state.allProcesses, state.filterQuery, state.sortBy);
    state.selectedIndex = 0;
    state.statusMessage = `Sorted by ${action.sortBy.toUpperCase()} descending.`;
    return state;
  }

  if (action.type === "TOGGLE_PAUSE") {
    state.isPaused = !state.isPaused;
    state.statusMessage = state.isPaused ? "Paused live auto-refresh." : "Resumed live auto-refresh.";
    return state;
  }

  if (action.type === "TOGGLE_DETAILS") {
    state.showingDetails = !state.showingDetails;
    return state;
  }

  if (action.type === "MOVE") {
    const next = state.selectedIndex + action.delta;
    if (next >= 0 && next < state.filteredProcesses.length) {
      state.selectedIndex = next;
      if (state.selectedIndex < state.scrollOffset) {
        state.scrollOffset = state.selectedIndex;
      } else if (state.selectedIndex >= state.scrollOffset + 15) {
        state.scrollOffset = state.selectedIndex - 14;
      }
    }
    return state;
  }

  if (action.type === "KILL") {
    const target = state.filteredProcesses[state.selectedIndex];
    if (target) {
      const sig = action.force ? "SIGKILL" : "SIGTERM";
      try {
        process.kill(target.pid, sig);
        state.statusMessage = `Sent ${sig} to PID ${target.pid} (${target.command.slice(0, 20)})`;
        state.allProcesses = state.allProcesses.filter((p) => p.pid !== target.pid);
        state.filteredProcesses = recalculateFiltered(state.allProcesses, state.filterQuery, state.sortBy);
        if (state.selectedIndex >= state.filteredProcesses.length) {
          state.selectedIndex = Math.max(0, state.filteredProcesses.length - 1);
        }
      } catch (err: any) {
        state.statusMessage = `Failed to kill PID ${target.pid}: ${err.message}`;
      }
    }
    return state;
  }

  return state;
}

// Doer: format detailed process inspection card
export function renderProcsDetails(proc: ProcessInfo, all: ProcessInfo[]): string {
  const children = all.filter((p) => p.ppid === proc.pid).map((p) => p.pid);
  const childStr = children.length > 0 ? children.join(", ") : "None";
  const portsStr = proc.ports && proc.ports.length > 0 ? proc.ports.join(", ") : "None";

  const lines = [
    colors.bold(colors.cyan(` --- Process Details: PID ${proc.pid} --- `)),
    colors.dim(" [Esc / Enter / d / q: close details modal]"),
    "-".repeat(60),
    `${colors.bold("PID".padEnd(16))}: ${proc.pid}`,
    `${colors.bold("PPID (Parent)".padEnd(16))}: ${proc.ppid}`,
    `${colors.bold("User".padEnd(16))}: ${proc.user}`,
    `${colors.bold("CPU Usage".padEnd(16))}: ${proc.cpu.toFixed(1)}%`,
    `${colors.bold("Memory Usage".padEnd(16))}: ${proc.mem.toFixed(1)}%`,
    `${colors.bold("Process State".padEnd(16))}: ${proc.stat}`,
    `${colors.bold("Elapsed Time".padEnd(16))}: ${proc.time}`,
    `${colors.bold("Listening Ports".padEnd(16))}: ${portsStr}`,
    `${colors.bold("Child PIDs".padEnd(16))}: ${childStr}`,
    "-".repeat(60),
    colors.bold("Command Line:"),
    `  ${proc.command}`,
    "-".repeat(60),
  ];
  return lines.join("\n");
}

// Doer: render full TUI frame with controls, filter bar, and process table
export function renderProcsTuiFrame(
  state: ProcsTuiState,
  maxRows: number = 15
): string {
  if (state.showingDetails) {
    const selected = state.filteredProcesses[state.selectedIndex];
    if (selected) {
      return renderProcsDetails(selected, state.allProcesses);
    }
  }

  const pauseBadge = state.isPaused ? colors.yellow(" [PAUSED]") : colors.green(" [LIVE]");
  const header = [
    colors.bold(colors.cyan(" --- procs: Interactive Process Monitor --- ")) + pauseBadge,
    colors.dim(" [j/k: move] [/: filter] [c/m/p/u: sort] [Space: pause] [Enter: details] [x: kill] [9: SIGKILL] [q: quit]"),
    state.isFiltering
      ? colors.bold(colors.yellow(` Filter: ${state.filterQuery}_ `)) + colors.dim("(Enter: save, Esc: clear)")
      : state.statusMessage ? colors.yellow(` ${state.statusMessage}`) : "",
    colors.dim(` Showing: ${state.filteredProcesses.length}/${state.allProcesses.length} | Sort: ${state.sortBy.toUpperCase()} | Filter: "${state.filterQuery || "none"}"`),
    "-".repeat(70),
    `${colors.bold("   PID".padEnd(8))} ${colors.bold("USER".padEnd(10))} ${colors.bold("%CPU".padStart(6))} ${colors.bold("%MEM".padStart(6))}  ${colors.bold("COMMAND")}`,
    "-".repeat(70),
  ].filter(Boolean);

  const visibleProcs = state.filteredProcesses.slice(state.scrollOffset, state.scrollOffset + maxRows);
  const rows = visibleProcs.map((p, idx) => {
    const absoluteIdx = state.scrollOffset + idx;
    const isSelected = absoluteIdx === state.selectedIndex;
    const cursor = isSelected ? colors.bold(colors.yellow("> ")) : "  ";
    const pidStr = p.pid.toString().padEnd(6);
    const userStr = p.user.slice(0, 9).padEnd(10);
    const cpuStr = p.cpu.toFixed(1).padStart(6);
    const memStr = p.mem.toFixed(1).padStart(6);
    const cmdStr = p.command.slice(0, 35);

    const line = `${cursor}${pidStr} ${userStr} ${cpuStr} ${memStr}  ${cmdStr}`;
    return isSelected ? colors.bold(line) : line;
  });

  return [...header, ...rows].join("\n");
}

// Coordinator: orchestrate the interactive process TUI session
export async function runProcsTui(
  sortBy: SortField = "cpu",
  initialFilter?: string
): Promise<void> {
  if (!process.stdin.isTTY) return;

  const refreshList = async (): Promise<ProcessInfo[]> => {
    const [raw, portMap] = await Promise.all([
      fetchRawProcessList(),
      fetchListeningPorts(),
    ]);
    const parsed = parsePsOutput(raw);
    return parsed.map((p) => {
      const ports = portMap.get(p.pid);
      return ports && ports.length > 0 ? { ...p, ports } : p;
    });
  };

  const initialAll = await refreshList();
  const filterQuery = initialFilter ?? "";
  const initialFiltered = recalculateFiltered(initialAll, filterQuery, sortBy);

  const state: ProcsTuiState = {
    allProcesses: initialAll,
    filteredProcesses: initialFiltered,
    selectedIndex: 0,
    scrollOffset: 0,
    sortBy,
    filterQuery,
    isFiltering: false,
    isPaused: false,
    showingDetails: false,
    shouldExit: false,
  };

  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdout.write("\x1b[?25l"); // Hide cursor

  const render = () => {
    process.stdout.write("\x1b[2J\x1b[0;0H");
    const rows = process.stdout.rows ? Math.max(5, process.stdout.rows - 8) : 15;
    process.stdout.write(renderProcsTuiFrame(state, rows) + "\n");
  };

  render();

  return new Promise<void>((resolve) => {
    // Periodic auto-refresh every 2 seconds (when not paused and not typing filter)
    const intervalTimer = setInterval(async () => {
      if (state.shouldExit) {
        clearInterval(intervalTimer);
        return;
      }
      if (!state.isPaused && !state.isFiltering && !state.showingDetails) {
        state.allProcesses = await refreshList();
        state.filteredProcesses = recalculateFiltered(state.allProcesses, state.filterQuery, state.sortBy);
        if (state.selectedIndex >= state.filteredProcesses.length) {
          state.selectedIndex = Math.max(0, state.filteredProcesses.length - 1);
        }
        render();
      }
    }, 2000);

    const cleanup = () => {
      clearInterval(intervalTimer);
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdout.write("\x1b[?25h\x1b[2J\x1b[0;0H");
      resolve();
    };

    const onData = async (data: Buffer) => {
      const keyStr = data.toString();
      const action = handleProcsTuiKey(keyStr, state.isFiltering);

      if (action.type === "REFRESH") {
        state.allProcesses = await refreshList();
        state.filteredProcesses = recalculateFiltered(state.allProcesses, state.filterQuery, state.sortBy);
        state.statusMessage = "Refreshed process list.";
      } else {
        applyProcsTuiAction(state, action);
      }

      if (state.shouldExit) {
        cleanup();
        return;
      }

      render();

      // Auto-refresh from OS after killing a process to ensure sync
      if (action.type === "KILL") {
        setTimeout(async () => {
          if (!state.shouldExit) {
            state.allProcesses = await refreshList();
            state.filteredProcesses = recalculateFiltered(state.allProcesses, state.filterQuery, state.sortBy);
            if (state.selectedIndex >= state.filteredProcesses.length) {
              state.selectedIndex = Math.max(0, state.filteredProcesses.length - 1);
            }
            render();
          }
        }, 300);
      }
    };

    process.stdin.on("data", onData);
  });
}
