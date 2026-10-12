# Subprocess Pipe Pro - Enterprise User Guide

Welcome to **Subprocess Pipe Pro**, your high-performance enterprise shell process master and multi-stage stream pipeline workstation.

This guide covers everything you need to know about designing, executing, and analyzing shell pipelines safely within the Subprocess Pipe Pro UI.

---

## ⚡ Overview

Subprocess Pipe Pro lets you visually construct complex chains of shell commands. Instead of typing a long bash one-liner into a terminal where debugging is difficult, you can split your logic into independent **Stages**. 

The UI provides real-time streaming, stdout/stderr isolation, interactive Sudo management, and detailed pipeline execution reports.

## 🛠 Features at a Glance

- **Multi-Stage Processing**: Build pipelines block-by-block. Pass `stdout` of one stage directly into the `stdin` of the next.
- **Enterprise UI Layout**: Real-time Interactive DAG flow, Key Performance Indicators (KPIs), and specialized Multi-View Inspector tabs.
- **Secure Sudo Authentication**: Volatile in-memory credentials using temporary `askpass` helpers. No stdin pollution or password echo!
- **Library Persistence**: Save your configured pipelines and reload them instantly, or export/import collections as JSON.
- **Standalone Export**: Automatically generate a portable standalone `bash` script of your configured pipeline to run anywhere.

---

## 📖 Using the Workspace

### UI Controls Reference

#### Top Navigation Bar
*   **System Ready / Completed**: A status indicator showing the overall state of the pipeline engine.
*   **Sudo Ticket: Active / Inactive**: Shows whether an elevated Sudo session is currently stored securely in memory.
*   **🔒 Preflight Sudo**: Opens a secure prompt to enter your sudo password preemptively. This caches the password in volatile memory for background `askpass` injection, preventing interactive prompts from hanging the pipeline.
*   **🔒 Clear Sudo**: Instantly purges the stored sudo password from memory.
*   **Presets / Saved Pipelines Dropdowns**: Load pre-configured examples or your own saved pipelines.
*   **💾 Save / Save As...**: Save the current pipeline configuration to your browser's local storage.
*   **🗑️ (Trash Icon)**: Delete the currently loaded saved pipeline.
*   **📦 Export**: Opens the comprehensive Export dialog to export Active Pipeline JSON, Library JSON, Shell One-Liner, or Standalone Script with choices to **Copy to Clipboard** or **Download File**.
*   **📋 Copy JSON**: Instant 1-click clipboard export of the currently active pipeline JSON.
*   **📥 Import**: Import previously saved pipeline JSON collections.
*   **📜 Export Script**: Generate portable standalone bash script with options to **Copy to Clipboard** or **Download .sh**.
*   **⌨ Shortcuts**: View available keyboard shortcuts (e.g., `⌘ + Enter` to run).
*   **📖 User Guide**: Open the in-app documentation modal.

#### Stage Sequence Panel
The Stages Sequence panel organizes all steps of your pipeline. With its expanded, readable card layout and dual-width mode, you can see full commands, arguments, and status tags clearly without truncation:
*   **⇹ Wide / ⇹ Balanced**: Toggle between the spacious balanced layout (~50% width) and extra-wide layout (~62% width) to see long command strings and multi-word names with maximum screen real-estate. Your preference is automatically remembered across sessions.
*   **➕ Add Stage**: Add a new stage block into the pipeline flow.
*   **Filter stages...**: Instant real-time filter input to search stages by name or command.
*   **⬆️ (Up Arrow)**: Move the stage up (earlier) in the execution order.
*   **⬇️ (Down Arrow)**: Move the stage down (later) in the execution order.
*   **▶️ (Play Button)**: Execute *only* this specific stage. In piped mode, it uses the cached `stdout` of the previous stage as its `stdin`.
*   **📋 (Duplicate Icon)**: Clone the stage and append it below.
*   **📄 (File Icon)**: Copy the stage's raw shell command to your clipboard.
*   **🗑️ (Trash Icon)**: Delete the stage from the pipeline.

#### Stage Configuration (Inspector)
When you click a stage in the ribbon, the inspector loads its configuration:
*   **Stage Name**: A friendly label for the stage.
*   **Input Mode**: Determines where the stage gets its `stdin`.
    *   *Pass from Previous*: Pipes the previous stage's output into this stage.
    *   *Type Stdin*: Allows you to manually type or paste a static string/JSON payload as the input.
    *   *None (Ignore Stdin)*: Runs the command without piping any input.
*   **Shell Command**: The actual terminal command to run.
*   **Working Directory (CWD)**: The directory where the command executes.
*   **Timeout (MS)**: A safety limit. If the command runs longer than this, it is automatically terminated.
*   **Run With Sudo (Checkbox)**: If checked, the command is executed with `sudo`. (Requires a Preflight Sudo ticket).
*   **Active (Checkbox)**: Uncheck this to bypass the stage entirely during pipeline execution.

### 1. The Interactive Pipeline Ribbon (Visual DAG)
At the top of the interface, the **Topology Ribbon** shows the current sequence of your active stages. Click on any node in the ribbon to instantly scroll to that stage in the main view and highlight it.

### 2. Modes of Execution
- **Piped Mode (A ➔ B ➔ C)**: The default behavior. Output (stdout) of Stage N is piped into Stage N+1 (stdin).
- **Sequential Mode (A, B, C)**: Stages run in order, but independently. They do not pipe data to each other.
- **Parallel Mode (A || B || C)**: All active stages run simultaneously. Great for independent batch jobs.

### 3. Modifying a Stage
Each stage block contains configuration options. Refer to the UI Controls Reference for a detailed breakdown.

### 4. Running the Pipeline
You can run the entire pipeline at once by clicking **"▶ Run Full Pipeline"** or pressing **⌘ + Enter**. 
Alternatively, use the **Step Controls** to run one stage at a time, inspecting the data transformation step-by-step.

---

## 🛡️ Sudo Privilege Management

For enterprise environments, Subprocess Pipe Pro manages sudo privileges seamlessly without breaking piped stdin data.

1. **Preflight Sudo (Top Header)**: Click this to pre-authenticate your session. Your password is encrypted and held *only* in volatile RAM (discarded on reload).
2. **Auto-Prompting**: If you run a stage that requires sudo but haven't authenticated, the application will securely prompt you via an interactive modal.
3. **Execution Safety**: The backend creates an ephemeral, restricted permissions `askpass.sh` script, executes the sudo command via `SUDO_ASKPASS`, and automatically cleans up immediately after execution.

---

## 🔎 The Multi-View Inspector

The **Inspector Panel** on the right side provides profound visibility into your pipeline's output.

- **🎯 Final Output**: Shows the clean `stdout` of the absolute final stage of your pipeline.
- **📑 Stage Sections**: Breaks down the output of every individual stage. Copy the exact `stdin`, `stdout`, or `command` used per stage with a single click.
- **STDOUT / STDERR / STDIN**: Inspect specific data streams for the currently selected stage.
- **🔄 Stream Diff**: Compare the input data vs. output data for the selected stage.
- **Script**: Generates a valid `bash` script for your pipeline.
- **Report JSON**: See the structured execution report (duration, exit codes, process IDs).

---

## ⌨️ Keyboard Shortcuts

Speed up your workflow using the following shortcuts:

- **Run Full Pipeline**: `⌘ + Enter` or `Ctrl + Enter`
- **Step Next Stage**: `⌘ + Shift + Enter`
- **Save Pipeline**: `⌘ + S` or `Ctrl + S`
- **Copy Final Output**: `⌘ + Shift + C`
- **Shortcuts Help**: `?`
- **Close Modals**: `Esc`

---

## 💾 Saving & Library Management
 
- **Save As...**: Allows you to save the current configuration as a new pipeline.
- **Save**: Overwrites the currently loaded pipeline.
- **Import**: Located in the header. Import pipeline collection JSON files to load into your saved library.

### 📦 Export Options & Clipboard Support

Subprocess Pipe Pro offers multiple export options across both the Web Workstation and Native Desktop GUI:

1. **📦 Export Center (Web Modal)**:
   - **Active Pipeline JSON**: Export the current pipeline specification (stages, commands, mode, initial stdin) as structured JSON.
   - **Entire Library JSON**: Export all saved pipelines and presets into a single backup or shareable collection file.
   - **Shell One-Liner**: Export a ready-to-run piped shell command formatted with backslash continuations.
   - **Standalone Bash Script**: Export a fully self-contained `.sh` script with preflight headers and error trapping.
   - **Action Options**: Each format supports both **📋 Copy to Clipboard** (instant 1-click clipboard transfer) and **💾 Download File** (local file download).

2. **📋 Quick Copy JSON**:
   - Click the dedicated `📋 Copy JSON` button in the top navigation bar for immediate 1-click clipboard copying of the active pipeline without opening a modal.

3. **📜 Export Script Dialog**:
   - Both **📋 Copy to Clipboard** and **💾 Download .sh** buttons are available in the script preview modal.

4. **Desktop Native Studio Toolbar**:
   - Includes dedicated buttons for **📜 Export Script**, **📋 Copy Script**, **📦 Export Library JSON**, and **📋 Copy Library JSON** utilizing high-speed native system clipboard APIs (`writeClipboardSync`).

---
*Generated for Subprocess Pipe Pro Enterprise by Google Antigravity.*
