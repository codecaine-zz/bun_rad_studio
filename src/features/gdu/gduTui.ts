import type { DiskUsageItem, GduSortBy } from "./gduTypes.ts";
import {
  deleteDiskItem,
  formatBytes,
  formatCount,
  formatRelativeBar,
  openItemInDefaultApp,
  scanItem,
  sortDiskItems,
} from "./gduDoers.ts";
import { colors } from "../../shared/colors.ts";

export interface GduTuiState {
  currentDir: DiskUsageItem;
  history: DiskUsageItem[];
  selectedIndex: number;
  scrollOffset: number;
  sortBy: GduSortBy;
  filterQuery: string;
  isFiltering: boolean;
  confirmingDelete: boolean;
  showingDetails: boolean;
  statusMessage?: string;
  shouldExit: boolean;
}

export type GduTuiAction =
  | { type: "MOVE"; delta: number }
  | { type: "ENTER" }
  | { type: "BACK" }
  | { type: "START_FILTER" }
  | { type: "FILTER_CHAR"; char: string }
  | { type: "FILTER_BACKSPACE" }
  | { type: "FILTER_CONFIRM" }
  | { type: "FILTER_CLEAR" }
  | { type: "CYCLE_SORT" }
  | { type: "PROMPT_DELETE" }
  | { type: "CONFIRM_DELETE" }
  | { type: "CANCEL_DELETE" }
  | { type: "TOGGLE_DETAILS" }
  | { type: "OPEN_ITEM" }
  | { type: "REFRESH" }
  | { type: "QUIT" }
  | { type: "NONE" };

// Doer: filter and sort visible items
export function getVisibleItems(
  dir: DiskUsageItem,
  filterQuery: string,
  sortBy: GduSortBy
): DiskUsageItem[] {
  let items = dir.children ?? [];
  if (filterQuery) {
    const q = filterQuery.toLowerCase();
    items = items.filter((item) => item.name.toLowerCase().includes(q));
  }
  return sortDiskItems(items, sortBy);
}

// Doer: translate input keypress into a semantic action
export function handleGduTuiKey(keyStr: string, state?: GduTuiState): GduTuiAction {
  if (state?.confirmingDelete) {
    if (keyStr === "y" || keyStr === "Y") return { type: "CONFIRM_DELETE" };
    return { type: "CANCEL_DELETE" };
  }

  if (state?.isFiltering) {
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
  if (keyStr === "\r" || keyStr === "\n" || keyStr === "\u001b[C" || keyStr === "l") {
    return { type: "ENTER" };
  }
  if (keyStr === "\u001b[D" || keyStr === "h" || keyStr === "\u007f" || keyStr === "\b") {
    return { type: "BACK" };
  }
  if (keyStr === "d" || keyStr === "\u001b[3~") return { type: "PROMPT_DELETE" };
  if (keyStr === "/" || keyStr === "f") return { type: "START_FILTER" };
  if (keyStr === "s") return { type: "CYCLE_SORT" };
  if (keyStr === "i") return { type: "TOGGLE_DETAILS" };
  if (keyStr === "o") return { type: "OPEN_ITEM" };
  if (keyStr === "r") return { type: "REFRESH" };
  return { type: "NONE" };
}

// Doer: update state based on action
export function applyGduTuiAction(state: GduTuiState, action: GduTuiAction): GduTuiState {
  if (action.type === "QUIT") {
    if (state.showingDetails) {
      state.showingDetails = false;
      return state;
    }
    state.shouldExit = true;
    return state;
  }

  const items = getVisibleItems(state.currentDir, state.filterQuery, state.sortBy);

  if (action.type === "MOVE") {
    const next = state.selectedIndex + action.delta;
    if (next >= 0 && next < items.length) {
      state.selectedIndex = next;
      if (state.selectedIndex < state.scrollOffset) {
        state.scrollOffset = state.selectedIndex;
      } else if (state.selectedIndex >= state.scrollOffset + 15) {
        state.scrollOffset = state.selectedIndex - 14;
      }
    }
    return state;
  }

  if (action.type === "START_FILTER") {
    state.isFiltering = true;
    state.statusMessage = "Type to filter directory contents... (Enter: save, Esc: clear)";
    return state;
  }

  if (action.type === "FILTER_CHAR") {
    state.filterQuery += action.char;
    state.selectedIndex = 0;
    return state;
  }

  if (action.type === "FILTER_BACKSPACE") {
    state.filterQuery = state.filterQuery.slice(0, -1);
    state.selectedIndex = 0;
    return state;
  }

  if (action.type === "FILTER_CONFIRM") {
    state.isFiltering = false;
    state.statusMessage = state.filterQuery ? `Filter active: "${state.filterQuery}"` : undefined;
    return state;
  }

  if (action.type === "FILTER_CLEAR") {
    state.isFiltering = false;
    state.filterQuery = "";
    state.selectedIndex = 0;
    state.statusMessage = "Filter cleared.";
    return state;
  }

  if (action.type === "CYCLE_SORT") {
    const order: GduSortBy[] = ["size", "name", "count", "mtime"];
    const curIdx = order.indexOf(state.sortBy);
    state.sortBy = order[(curIdx + 1) % order.length]!;
    state.selectedIndex = 0;
    state.statusMessage = `Sorted by ${state.sortBy.toUpperCase()}.`;
    return state;
  }

  if (action.type === "TOGGLE_DETAILS") {
    state.showingDetails = !state.showingDetails;
    return state;
  }

  if (action.type === "PROMPT_DELETE") {
    const target = items[state.selectedIndex];
    if (target) {
      state.confirmingDelete = true;
      state.statusMessage = `Are you sure you want to permanently delete "${target.name}"? [y/N]`;
    }
    return state;
  }

  if (action.type === "CANCEL_DELETE") {
    state.confirmingDelete = false;
    state.statusMessage = "Deletion cancelled.";
    return state;
  }

  if (action.type === "CONFIRM_DELETE") {
    state.confirmingDelete = false;
    const target = items[state.selectedIndex];
    if (target) {
      try {
        deleteDiskItem(target.path);
        state.statusMessage = `Deleted "${target.name}" (${formatBytes(target.size)} freed).`;
        // Optimistically remove from children & recalculate parent size
        if (state.currentDir.children) {
          state.currentDir.children = state.currentDir.children.filter((c) => c.path !== target.path);
          state.currentDir.size = Math.max(0, state.currentDir.size - target.size);
          state.currentDir.itemCount = Math.max(1, state.currentDir.itemCount - target.itemCount);
        }
        const updatedItems = getVisibleItems(state.currentDir, state.filterQuery, state.sortBy);
        if (state.selectedIndex >= updatedItems.length) {
          state.selectedIndex = Math.max(0, updatedItems.length - 1);
        }
      } catch (err: any) {
        state.statusMessage = `Failed to delete "${target.name}": ${err.message}`;
      }
    }
    return state;
  }

  if (action.type === "OPEN_ITEM") {
    const target = items[state.selectedIndex];
    if (target) {
      try {
        openItemInDefaultApp(target.path);
        state.statusMessage = `Opened "${target.name}" in system default viewer.`;
      } catch (err: any) {
        state.statusMessage = `Failed to open "${target.name}": ${err.message}`;
      }
    }
    return state;
  }

  if (action.type === "ENTER") {
    const selected = items[state.selectedIndex];
    if (selected) {
      if (selected.isDirectory) {
        state.history.push(state.currentDir);
        state.currentDir = selected;
        state.selectedIndex = 0;
        state.scrollOffset = 0;
        state.filterQuery = "";
      } else {
        // Toggle file details on Enter for files
        state.showingDetails = !state.showingDetails;
      }
    }
    return state;
  }

  if (action.type === "BACK") {
    const prev = state.history.pop();
    if (prev) {
      state.currentDir = prev;
      state.selectedIndex = 0;
      state.scrollOffset = 0;
      state.filterQuery = "";
    }
    return state;
  }

  return state;
}

// Doer: format item details inspection view
export function renderGduItemDetails(item: DiskUsageItem, parentSize: number): string {
  const pct = parentSize > 0 ? ((item.size / parentSize) * 100).toFixed(1) : "100.0";
  const mtimeStr = new Date(item.mtime).toLocaleString();

  const lines = [
    colors.bold(colors.cyan(` --- Item Inspection: ${item.name} --- `)),
    colors.dim(" [Esc / Enter / i / q: close inspection modal]"),
    "-".repeat(65),
    `${colors.bold("Name".padEnd(16))}: ${item.name}`,
    `${colors.bold("Full Path".padEnd(16))}: ${item.path}`,
    `${colors.bold("Type".padEnd(16))}: ${item.isDirectory ? "Directory" : "File"}`,
    `${colors.bold("Disk Usage".padEnd(16))}: ${formatBytes(item.size)} (${item.size.toLocaleString()} bytes)`,
    `${colors.bold("Item Count".padEnd(16))}: ${item.itemCount.toLocaleString()}`,
    `${colors.bold("Share of Parent".padEnd(16))}: ${pct}%`,
    `${colors.bold("Last Modified".padEnd(16))}: ${mtimeStr}`,
    "-".repeat(65),
  ];
  return lines.join("\n");
}

// Doer: render full TUI frame
export function renderGduTuiFrame(
  state: GduTuiState,
  maxRows: number = 20
): string {
  const items = getVisibleItems(state.currentDir, state.filterQuery, state.sortBy);
  const maxSize = items[0]?.size || 1;

  if (state.showingDetails) {
    const selected = items[state.selectedIndex];
    if (selected) {
      return renderGduItemDetails(selected, state.currentDir.size);
    }
  }

  const header = [
    colors.bold(colors.cyan(` --- gdu: ${state.currentDir.path || state.currentDir.name} --- `)),
    colors.dim(` Total: ${formatBytes(state.currentDir.size)}  Items: ${state.currentDir.itemCount}  Sort: ${state.sortBy.toUpperCase()}${state.filterQuery ? `  Filter: "${state.filterQuery}"` : ""}`),
    colors.dim(" [j/k: move] [Enter: drill/info] [h/←: up] [d: delete] [/: filter] [s: sort] [i: info] [o: open] [q: quit]"),
    state.confirmingDelete
      ? colors.bold(colors.red(` >> ${state.statusMessage} `))
      : state.isFiltering
        ? colors.bold(colors.yellow(` Filter: ${state.filterQuery}_ `)) + colors.dim("(Enter: save, Esc: clear)")
        : state.statusMessage ? colors.yellow(` ${state.statusMessage}`) : "",
    "-".repeat(70),
  ].filter(Boolean);

  const lines: string[] = [];
  const visibleItems = items.slice(state.scrollOffset, state.scrollOffset + maxRows);

  if (visibleItems.length === 0) {
    lines.push(colors.dim("  (no matching items found in directory)"));
  }

  visibleItems.forEach((item, idx) => {
    const absoluteIdx = state.scrollOffset + idx;
    const isSelected = absoluteIdx === state.selectedIndex;
    const cursor = isSelected ? colors.bold(colors.yellow("> ")) : "  ";
    const sizeStr = formatBytes(item.size);
    const countStr = formatCount(item.itemCount);
    const bar = formatRelativeBar(item.size / maxSize, 10);
    const typeIndicator = item.isDirectory ? "/" : " ";
    const nameStr = item.isDirectory
      ? colors.bold(colors.blue(item.name + typeIndicator))
      : item.name;

    const row = `${cursor}${sizeStr} ${bar} ${countStr}  ${nameStr}`;
    lines.push(isSelected ? colors.bold(row) : row);
  });

  return [...header, ...lines].join("\n");
}

// Coordinator: interactive TUI event loop for gdu
export async function runGduTui(rootItem: DiskUsageItem): Promise<void> {
  if (!process.stdin.isTTY) return;

  const state: GduTuiState = {
    currentDir: rootItem,
    history: [],
    selectedIndex: 0,
    scrollOffset: 0,
    sortBy: "size",
    filterQuery: "",
    isFiltering: false,
    confirmingDelete: false,
    showingDetails: false,
    shouldExit: false,
  };

  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdout.write("\x1b[?25l"); // Hide cursor

  const render = () => {
    process.stdout.write("\x1b[2J\x1b[0;0H"); // Clear screen
    const rows = process.stdout.rows ? Math.max(5, process.stdout.rows - 6) : 20;
    process.stdout.write(renderGduTuiFrame(state, rows) + "\n");
  };

  render();

  return new Promise<void>((resolve) => {
    const onData = async (data: Buffer) => {
      const keyStr = data.toString();
      const action = handleGduTuiKey(keyStr, state);

      if (action.type === "REFRESH") {
        try {
          const rescanned = await scanItem(state.currentDir.path, state.currentDir.name, [], false);
          state.currentDir = rescanned;
          state.statusMessage = "Directory rescanned.";
        } catch (err: any) {
          state.statusMessage = `Rescan failed: ${err.message}`;
        }
      } else {
        applyGduTuiAction(state, action);
      }

      if (state.shouldExit) {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
        process.stdout.write("\x1b[?25h\x1b[2J\x1b[0;0H"); // Restore cursor & clear
        resolve();
      } else {
        render();
      }
    };

    process.stdin.on("data", onData);
  });
}
