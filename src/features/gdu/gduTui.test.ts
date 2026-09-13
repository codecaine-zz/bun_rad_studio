import { describe, expect, it } from "bun:test";
import {
  applyGduTuiAction,
  handleGduTuiKey,
  renderGduItemDetails,
  renderGduTuiFrame,
  type GduTuiState,
} from "./gduTui.ts";
import type { DiskUsageItem } from "./gduTypes.ts";

describe("gdu TUI module", () => {
  const mockChildDir: DiskUsageItem = {
    name: "src",
    path: "root/src",
    size: 2048,
    itemCount: 2,
    isDirectory: true,
    mtime: new Date("2026-01-01"),
    children: [
      {
        name: "index.ts",
        path: "root/src/index.ts",
        size: 1024,
        itemCount: 1,
        isDirectory: false,
        mtime: new Date("2026-01-02"),
      },
    ],
  };

  const mockFile: DiskUsageItem = {
    name: "package.json",
    path: "root/package.json",
    size: 512,
    itemCount: 1,
    isDirectory: false,
    mtime: new Date("2026-01-03"),
  };

  function createMockRoot(): DiskUsageItem {
    return {
      name: "root",
      path: "root",
      size: 5120,
      itemCount: 5,
      isDirectory: true,
      mtime: new Date(),
      children: [mockChildDir, mockFile],
    };
  }

  function createTestState(overrides?: Partial<GduTuiState>): GduTuiState {
    return {
      currentDir: createMockRoot(),
      history: [],
      selectedIndex: 0,
      scrollOffset: 0,
      sortBy: "size",
      filterQuery: "",
      isFiltering: false,
      confirmingDelete: false,
      showingDetails: false,
      shouldExit: false,
      ...overrides,
    };
  }

  it("translates keypresses to semantic actions", () => {
    const state = createTestState();

    expect(handleGduTuiKey("j", state).type).toBe("MOVE");
    expect(handleGduTuiKey("k", state).type).toBe("MOVE");
    expect(handleGduTuiKey("\r", state).type).toBe("ENTER");
    expect(handleGduTuiKey("h", state).type).toBe("BACK");
    expect(handleGduTuiKey("d", state).type).toBe("PROMPT_DELETE");
    expect(handleGduTuiKey("/", state).type).toBe("START_FILTER");
    expect(handleGduTuiKey("s", state).type).toBe("CYCLE_SORT");
    expect(handleGduTuiKey("i", state).type).toBe("TOGGLE_DETAILS");
    expect(handleGduTuiKey("o", state).type).toBe("OPEN_ITEM");
    expect(handleGduTuiKey("q", state).type).toBe("QUIT");

    // Deletion confirmation mode
    const deleteState = createTestState({ confirmingDelete: true });
    expect(handleGduTuiKey("y", deleteState).type).toBe("CONFIRM_DELETE");
    expect(handleGduTuiKey("n", deleteState).type).toBe("CANCEL_DELETE");
  });

  it("applies actions to navigate hierarchy", () => {
    const state = createTestState();

    applyGduTuiAction(state, { type: "ENTER" });
    expect(state.currentDir.name).toBe("src");
    expect(state.history.length).toBe(1);

    applyGduTuiAction(state, { type: "BACK" });
    expect(state.currentDir.name).toBe("root");
    expect(state.history.length).toBe(0);

    applyGduTuiAction(state, { type: "QUIT" });
    expect(state.shouldExit).toBe(true);
  });

  it("filters directory items live as search is typed", () => {
    const state = createTestState();

    applyGduTuiAction(state, { type: "START_FILTER" });
    expect(state.isFiltering).toBe(true);

    applyGduTuiAction(state, { type: "FILTER_CHAR", char: "p" });
    applyGduTuiAction(state, { type: "FILTER_CHAR", char: "a" });
    applyGduTuiAction(state, { type: "FILTER_CHAR", char: "c" });

    expect(state.filterQuery).toBe("pac");

    const frame = renderGduTuiFrame(state, 10);
    expect(frame).toContain("package.json");
    expect(frame).not.toContain("src/");

    // Clear filter
    applyGduTuiAction(state, { type: "FILTER_CLEAR" });
    expect(state.filterQuery).toBe("");
    expect(state.isFiltering).toBe(false);
  });

  it("cycles sort orders between size, name, count, and mtime", () => {
    const state = createTestState();
    expect(state.sortBy).toBe("size");

    applyGduTuiAction(state, { type: "CYCLE_SORT" });
    expect(state.sortBy).toBe("name");

    applyGduTuiAction(state, { type: "CYCLE_SORT" });
    expect(state.sortBy).toBe("count");

    applyGduTuiAction(state, { type: "CYCLE_SORT" });
    expect(state.sortBy).toBe("mtime");

    applyGduTuiAction(state, { type: "CYCLE_SORT" });
    expect(state.sortBy).toBe("size");
  });

  it("supports delete file prompt, cancel, and optimistic removal", () => {
    const state = createTestState();
    expect(state.currentDir.children?.length).toBe(2);

    // Prompt delete
    applyGduTuiAction(state, { type: "PROMPT_DELETE" });
    expect(state.confirmingDelete).toBe(true);

    // Cancel delete
    applyGduTuiAction(state, { type: "CANCEL_DELETE" });
    expect(state.confirmingDelete).toBe(false);
    expect(state.currentDir.children?.length).toBe(2);

    // Prompt and confirm delete
    applyGduTuiAction(state, { type: "PROMPT_DELETE" });
    // Note: mock path does not exist on disk, but deleteDiskItem is called
    applyGduTuiAction(state, { type: "CONFIRM_DELETE" });
    expect(state.confirmingDelete).toBe(false);
    expect(state.statusMessage).toContain("Deleted");
    expect(state.currentDir.children?.length).toBe(1);
  });

  it("renders TUI frame and item details modal accurately", () => {
    const state = createTestState();

    const frame = renderGduTuiFrame(state, 10);
    expect(frame).toContain("gdu: root");
    expect(frame).toContain("src/");
    expect(frame).toContain("Total:");

    const details = renderGduItemDetails(mockFile, 5120);
    expect(details).toContain("Item Inspection: package.json");
    expect(details).toContain("File");
    expect(details).toContain("Share of Parent");
  });
});
