# 🌿 Git Workbench Pro -- User Guide

**Git Workbench Pro** is a fast, native desktop Git interface for working tree management, visual diffing, commit inspection, and staging. Powered by native `Bun.spawn` interactions with the local `git` binary, it provides sub-millisecond status updates with zero heavyweight web wrapper overhead.

---

## ⚡ Quick Start

```bash
bun run app:git
```

---

## 🖥️ User Interface Overview

1. **Repository & Branch Bar**:
   - Displays active branch name (e.g. `main`, `feature/ui-hardening`).
   - Repository root directory selector.
   - Remote tracking branch status (`↑ 2 commits ahead`, `✓ In sync`).
   - **🔄 Refresh Status**: Re-scans working tree status.
2. **Working Tree Status Table**:
   - Displays all modified (`M`), staged (`A`), untracked (`?`), and deleted (`D`) files.
   - One-click row selection to inspect file diffs.
   - Quick file actions:
     - **Stage File / Stage All**: Prepares changes for commit.
     - **Unstage File / Unstage All**: Removes changes from index without discarding edits.
     - **Discard Changes**: Reverts file to HEAD (with confirmation).
3. **Visual Diff Viewer**:
   - Unified color-coded diff pane showing modified lines:
     - Green (`+`): Additions
     - Red (`-`): Deletions
     - Gray: Unchanged context lines
   - Toggle between **Working Tree Diff** (`git diff`) and **Staged Diff** (`git diff --staged`).
4. **Commit Log History Table**:
   - Recent commit history table displaying Commit Hash, Author, Relative Time, and Commit Message.
   - Click any commit to view its full patch diff.
5. **Commit Composer & Stash Controls**:
   - **Commit Message Input**: Multi-line editor for writing concise summary and detailed body.
   - **💾 Commit Staged Changes**: Commits changes to the local branch.
   - **📦 Stash Changes**: Safely pushes uncommitted changes onto the git stash stack.
   - **Pop Stash**: Restores the most recent stash.

---

## 📖 Practical Tutorials

### 1. Reviewing Working Tree Changes Before Committing
1. Launch Git Workbench Pro:
   ```bash
   bun run app:git
   ```
2. The **Working Tree Status Table** lists all modified files.
3. Click on any file (e.g. `applications/sqlite_studio.ts`).
4. The **Visual Diff Viewer** immediately renders the exact line changes, additions, and deletions.

### 2. Staging Changes and Making a Commit
1. Click **Stage All** or select individual files to stage.
2. Toggle the diff viewer to **Staged Diff** to review the exact commit snapshot.
3. In the **Commit Message** editor, enter:
   ```text
   feat: add enterprise database query plans and CSV export
   ```
4. Click **💾 Commit Staged Changes**.
5. The commit log table updates immediately, displaying the new commit at the top of the history.

### 3. Temporarily Stashing Work to Switch Tasks
1. If you have uncommitted changes and need a clean working tree, click **📦 Stash Changes**.
2. Git Workbench saves your modifications to the stash list and resets your working tree to `HEAD`.
3. When ready to resume, click **Pop Stash** to restore your changes.

---

## 🛡️ Enterprise Resilience Features
- **Zero Third-Party Git Dependencies**: Communicates directly with the system's native git executable via high-speed `Bun.spawn` streams.
- **Diff Escaping & Clean Rendering**: Special characters, backticks, and escape sequences are safely sanitized in the diff viewer.
- **Non-Destructive Defaults**: Stash and unstage operations preserve all uncommitted code by default.
