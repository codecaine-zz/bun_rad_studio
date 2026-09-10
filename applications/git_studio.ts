import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { Sys } from "../src/simplecli/sys";

export function createGitStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("Git Repository & Diff Workbench -- Enterprise Version Control GUI", 1160, 900, {
    appId: "git_studio",
    theme: options.theme || getSavedTheme() || "sonoma_emerald",
    autoSaveState: true,
    fullscreen: options.fullscreen ?? true,
  });

  // Header Title
  win.beginRow();
  win.addHeading("Git Workbench Pro");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_refresh", "🔄 Refresh Repo");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("Enterprise Git Repository Management, Visual Diff Inspector & Working Tree Controller");

  // Repo Overview Card
  win.beginCard("Active Repository Telemetry");
  win.beginRow();
  win.addLabel("lbl_branch", "Branch: main");
  win.addLabel("lbl_head", "HEAD: HEAD");
  win.addLabel("lbl_status_count", "Working Tree: Clean");
  win.endRow();
  win.endCard();

  // Commit & Working Tree Controls
  win.beginGroupBox("Working Tree Actions & Commit Dispatcher");
  win.beginRow();
  win.addLabel("lbl_msg", "Commit Message:");
  win.addInput("txt_commit_msg", "chore: enterprise updates").width(380);
  win.addButton("btn_commit", "💾 Commit All Changes");
  win.addButton("btn_stage_all", "➕ Stage All (git add)");
  win.addButton("btn_unstage", "➖ Unstage All");
  win.endRow();

  win.beginRow();
  win.addButton("btn_view_diff", "🔍 View Uncommitted Diff");
  win.addButton("btn_view_staged", "📦 View Staged Diff");
  win.addButton("btn_stash", "📥 Git Stash");
  win.addButton("btn_stash_pop", "📤 Stash Pop");
  win.addButton("btn_git_pull", "⬇️ git pull");
  win.addButton("btn_git_push", "⬆️ git push");
  win.endRow();
  win.endGroupBox();

  // Commit History Table
  win.beginGroupBox("Commit Log History (Recent 25 Commits)");
  win.addTable(
    "tbl_commits",
    ["Hash", "Author", "Date", "Summary"],
    [
      ["HEAD", "Developer", "Just now", "Enterprise application suite upgrade"],
      ["origin", "System", "1 hour ago", "Bun native system API modernization"],
    ]
  );
  win.endGroupBox();

  // Diff & Output Stream
  win.beginGroupBox("Repository Diff & File Inspection Stream");
  win.addTextarea("txt_git_diff", `[Git Workbench Initialized]\nChecking repository status...\n`);
  win.endGroupBox();

  // Console Telemetry
  win.beginGroupBox("Git Command Execution & Audit Trail");
  win.addConsole("git_console", 110);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Repository: Active  |  Remote: Connected  |  Zero Homebrew");
  win.endRow();

  // Helpers
  const refreshRepo = () => {
    const t0 = performance.now();

    // 1. Get current branch
    const [branchOut] = Sys.exec("git rev-parse --abbrev-ref HEAD 2>/dev/null");
    const branch = branchOut.trim() || "main";
    win.setText("lbl_branch", `Branch: 🌿 ${branch}`);

    // 2. Get latest commit hash
    const [headOut] = Sys.exec("git rev-parse --short HEAD 2>/dev/null");
    const head = headOut.trim() || "initial";
    win.setText("lbl_head", `HEAD: #${head}`);

    // 3. Status summary
    const [statusOut] = Sys.exec("git status --short 2>/dev/null");
    const modifiedFiles = statusOut.trim() ? statusOut.trim().split("\n") : [];
    win.setText("lbl_status_count", `Working Tree: ${modifiedFiles.length} file(s) changed`);

    // 4. Populate commit table
    const [logOut] = Sys.exec('git log -n 25 --pretty=format:"%h\t%an\t%ar\t%s" 2>/dev/null');
    if (logOut.trim()) {
      const commitRows = logOut
        .trim()
        .split("\n")
        .map((line) => line.split("\t"));
      win.setTableData("tbl_commits", ["Hash", "Author", "Date", "Summary"], commitRows);
    }

    // 5. Update diff textarea
    if (modifiedFiles.length > 0) {
      const [diffOut] = Sys.exec("git diff --stat 2>/dev/null");
      win.setText(
        "txt_git_diff",
        `[Changed Files (${modifiedFiles.length})]\n${statusOut.trim()}\n\n[Diff Summary]\n${diffOut.trim()}`
      );
    } else {
      win.setText("txt_git_diff", "Working tree clean. No uncommitted modifications.");
    }

    const elapsed = (performance.now() - t0).toFixed(1);
    win.appendConsole("git_console", `[Git Refresh] Repository telemetry updated in ${elapsed}ms\n`, 2);
    win.setText("lbl_status", `Branch: ${branch}  |  Changed: ${modifiedFiles.length}  |  Latency: ${elapsed}ms`);
    win.setStatus(`Git OK (${elapsed}ms)`);
  };

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Git Workbench configuration saved!");
  });
  win.onClick("btn_refresh", refreshRepo);

  win.onClick("btn_stage_all", () => {
    const [out, code] = Sys.exec("git add -A");
    win.appendConsole("git_console", `[git add -A] (exit ${code}) ${out}\n`, code === 0 ? 2 : 3);
    win.toast("All files staged");
    refreshRepo();
  });

  win.onClick("btn_unstage", () => {
    const [out, code] = Sys.exec("git restore --staged .");
    win.appendConsole("git_console", `[git restore --staged] (exit ${code}) ${out}\n`, code === 0 ? 2 : 3);
    win.toast("All files unstaged");
    refreshRepo();
  });

  win.onClick("btn_commit", () => {
    const msg = win.getValue("txt_commit_msg") || "chore: update application";
    const escaped = msg.replace(/"/g, '\\"');
    const [out, code] = Sys.exec(`git commit -m "${escaped}"`);
    win.appendConsole("git_console", `[git commit] (exit ${code})\n${out}\n`, code === 0 ? 2 : 3);
    win.toast(code === 0 ? "Committed successfully" : "Commit failed (check console)");
    refreshRepo();
  });

  win.onClick("btn_view_diff", () => {
    const [diffOut] = Sys.exec("git diff");
    win.setText("txt_git_diff", diffOut || "(No uncommitted differences found)");
    win.appendConsole("git_console", "[git diff] Loaded working tree diff\n", 1);
  });

  win.onClick("btn_view_staged", () => {
    const [diffOut] = Sys.exec("git diff --staged");
    win.setText("txt_git_diff", diffOut || "(No staged differences found)");
    win.appendConsole("git_console", "[git diff --staged] Loaded staged changes diff\n", 1);
  });

  win.onClick("btn_stash", () => {
    const [out, code] = Sys.exec("git stash");
    win.appendConsole("git_console", `[git stash] ${out}\n`, code === 0 ? 2 : 3);
    win.toast("Stashed working changes");
    refreshRepo();
  });

  win.onClick("btn_stash_pop", () => {
    const [out, code] = Sys.exec("git stash pop");
    win.appendConsole("git_console", `[git stash pop] ${out}\n`, code === 0 ? 2 : 3);
    win.toast("Popped stash");
    refreshRepo();
  });

  win.onClick("btn_git_pull", () => {
    win.appendConsole("git_console", "[git pull] Fetching updates from remote...\n", 1);
    const [out, code] = Sys.exec("git pull --rebase 2>&1");
    win.appendConsole("git_console", `[git pull] (exit ${code})\n${out}\n`, code === 0 ? 2 : 3);
    refreshRepo();
  });

  win.onClick("btn_git_push", () => {
    win.appendConsole("git_console", "[git push] Pushing commits to remote...\n", 1);
    const [out, code] = Sys.exec("git push 2>&1");
    win.appendConsole("git_console", `[git push] (exit ${code})\n${out}\n`, code === 0 ? 2 : 3);
    refreshRepo();
  });

  win.onClick("btn_fullscreen", (w) => {
    w.toggleFullscreen();
  });

  return win;
}

if (import.meta.main) {
  const win = createGitStudio({ fullscreen: true });
  console.log("⚡ Launching Git Workbench Pro...");
  win.run();
}
