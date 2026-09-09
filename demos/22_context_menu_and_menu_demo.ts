#!/usr/bin/env bun
/**
 * Demo 22: Desktop Application Menu & Context Menu Studio
 *
 * Demonstrates comprehensive desktop menus, context menus, and popup controls:
 *   - Top Application Menu Bar (win.addMenuBar / win.menu_bar) with cascading dropdowns,
 *     keyboard shortcuts, and hover-triggered menu switching.
 *   - Global Right-Click Context Menu (win.setGlobalContextMenu / win.onGlobalContextMenu).
 *   - Control-Specific Right-Click Context Menus (.contextMenu(items, onSelect)) on
 *     CodeStudio, Input Fields, FilePathBar, and Drop Zone.
 *   - Standalone In-Canvas Menus: Popup Menus, Split Buttons, and Pull-Down pickers.
 *   - Application Toolbar (win.addToolBar).
 *   - Real-time action telemetry inspector, dedicated stream console, visual highlights,
 *     and zero reload interference.
 *
 * Professional layout: Sits cleanly in the desktop window with zero vertical overflow,
 * featuring a dedicated Action Inspector and an unencumbered Live Console Stream.
 *
 * Usage:
 *   bun run demo:menu
 */

import { newSimpleWindow, SimpleWindow } from "../src/simplegui";

export function createContextMenuAndMenuDemo(): SimpleWindow {
  const win = newSimpleWindow("Desktop Menu & Context Menu Studio", 1260, 820, {
    appId: "context_menu_studio",
    theme: "sonoma_emerald",
    autoSaveState: true,
  });

  // 1. Top Application Menu Bar (Cascading desktop menus)
  win.addMenuBar("main_menu_bar", [
    {
      label: "File",
      items: [
        "📄 New File  ⌘N",
        "📂 Open File...  ⌘O",
        "📁 Open Folder...  ⌘⇧O",
        "---",
        "💾 Save  ⌘S",
        "💾 Save As...  ⌘⇧S",
        "📦 Export Bundle...  ⌘E",
        "---",
        "🚪 Close Window  ⌘W",
        "🛑 Exit App  ⌘Q"
      ]
    },
    {
      label: "Edit",
      items: [
        "↩️ Undo  ⌘Z",
        "↪️ Redo  ⌘⇧Z",
        "---",
        "✂️ Cut  ⌘X",
        "📋 Copy  ⌘C",
        "📄 Paste  ⌘V",
        "---",
        "🔍 Find & Replace  ⌘F",
        "✨ Select All  ⌘A"
      ]
    },
    {
      label: "View",
      items: [
        "🔍 Zoom In  ⌘+",
        "🔎 Zoom Out  ⌘-",
        "🔄 Reset Zoom  ⌘0",
        "---",
        "🎯 Center Window",
        "🖥️ Toggle Fullscreen  ⌃⌘F",
        "📑 Toggle Sidebar  ⌘B",
        "⌨️ Command Palette...  ⌘⇧P"
      ]
    },
    {
      label: "Run",
      items: [
        "▶️ Start Debugging  F5",
        "⚡ Run Without Debugging  ⌃F5",
        "🔄 Restart Runtime  ⌘⇧F5",
        "---",
        "🧪 Run Test Suite  ⌘T",
        "📊 Benchmark Engine  ⌘B"
      ]
    },
    {
      label: "Tools",
      items: [
        "🧹 Clear Console Stream",
        "🗂️ Format Document  ⌥⇧F",
        "🩺 Diagnostics & Lint",
        "💬 Show Modal Dialog",
        "🗄️ Database Inspector",
        "💻 Terminal View",
        "---",
        "⚙️ Preferences...  ⌘,"
      ]
    },
    {
      label: "Help",
      items: [
        "📖 Bun RAD Studio Docs",
        "⌨️ Keyboard Shortcuts Cheat Sheet",
        "🌐 SimpleGUI API Reference",
        "---",
        "ℹ️ About Desktop Menu Studio"
      ]
    }
  ]);

  // 2. Window-Wide Global Context Menu (Right-click canvas background)
  win.setGlobalContextMenu([
    "🔄 Refresh Workspace",
    "📋 Copy Window Position",
    "🎨 Switch Color Theme",
    "---",
    "🔍 Inspect Element",
    "⚙️ Preferences..."
  ]);

  // 3. Compact Command Header Strip (Brand Badge + Quick Toolbar + Hotkey + Theme)
  win.beginRow();
  win.addBadge("DESKTOP MENU STUDIO v2.0", "success").tooltip("Native Desktop Parity Engine");
  win.addToolBar("app_toolbar", [
    "📄 New",
    "📂 Open",
    "💾 Save",
    "🧪 Test",
    "🧹 Clear Stream",
    "🚀 Deploy",
    "🎯 Center",
    "⚙️ Settings"
  ]).width(600);
  win.addHotkeyBadge(["Cmd", "Shift", "P"]).width(125).tooltip("Command Palette (Cmd+Shift+P)");
  win.addThemeSelector("dd_theme", "Theme:").width(180);
  win.endRow();

  // 4. Live Interaction Hint & Telemetry Banner
  win.beginRow();
  win.addStatusBanner(
    "💡 Ready: Right-click ANY target control or the background canvas, or click any menu / toolbar item",
    "info"
  ).id("banner_hint").width(1220);
  win.endRow();

  // 5. Main Side-by-Side Dashboard Layout (Fits perfectly within viewport)
  win.beginRow();

  // -------------------------------------------------------------
  // LEFT COLUMN: Interactive Context Menu Targets (Width: 600px)
  // -------------------------------------------------------------
  win.beginCard("Interactive Context Menu Targets", "Right-click on any element below to reveal its custom context menu");

  win.addLabel("1. Code Studio (Right-click editor for Code Actions):")
    .font(11, "#38bdf8", "700");

  const sampleCode = `// Right-click inside this code editor to open the Code Actions menu!
export function calculateVelocity(distance: number, time: number): number {
  if (time <= 0) throw new Error("Time must be positive");
  return distance / time;
}

console.log("Calculated:", calculateVelocity(100, 4));`;

  win.addCodeStudio("sample_code.ts", sampleCode, "typescript", { height: 105 })
    .width(560)
    .contextMenu([
      "⚡ Format TypeScript",
      "📋 Copy All Code",
      "🔍 Find References",
      "---",
      "🚀 Run with Bun",
      "🐞 Debug Current Line"
    ], (_w, action) => {
      triggerAction("Code Studio Context Menu", action, "sample_code.ts");
      if (action === "⚡ Format TypeScript") {
        logEvent("Code Studio", "Formatted sample_code.ts successfully");
      } else if (action === "🚀 Run with Bun") {
        logEvent("Code Studio", 'Executed sample_code.ts -> Output: "Calculated: 25"');
      }
    });

  win.beginRow();
  win.addLabel("2. Text Input (Clipboard Menu):")
    .font(11, "#38bdf8", "700")
    .width(275);
  win.addLabel("3. File Path (Explorer Menu):")
    .font(11, "#38bdf8", "700")
    .width(275);
  win.endRow();

  win.beginRow();
  win.addTextField("txt_clipboard", "The quick brown fox jumps over the lazy dog", "Enter text...")
    .id("txt_clipboard")
    .width(275)
    .contextMenu([
      "✂️ Cut  ⌘X",
      "📋 Copy  ⌘C",
      "📄 Paste  ⌘V",
      "---",
      "🔤 Convert to UPPERCASE",
      "🔡 Convert to lowercase",
      "🧹 Clear Input"
    ], (w, action) => {
      triggerAction("Input Context Menu", action, "txt_clipboard");
      const current = w.getValue("txt_clipboard") || "";
      if (action.includes("UPPERCASE")) {
        w.setValue("txt_clipboard", current.toUpperCase());
        logEvent("Text Input", `Transformed to uppercase: "${current.toUpperCase()}"`);
      } else if (action.includes("lowercase")) {
        w.setValue("txt_clipboard", current.toLowerCase());
        logEvent("Text Input", `Transformed to lowercase: "${current.toLowerCase()}"`);
      } else if (action.includes("Clear")) {
        w.setValue("txt_clipboard", "");
        logEvent("Text Input", "Cleared input contents");
      }
    });

  win.addFilePathBar("/Users/codecaine/bun_rad_studio/src/simplegui.ts", "fpath_demo")
    .width(275)
    .contextMenu([
      "📂 Reveal in Finder",
      "📋 Copy Absolute Path",
      "---",
      "🔍 Open in Terminal",
      "📊 Inspect File Permissions"
    ], (_w, action) => {
      triggerAction("File Path Context Menu", action, "/Users/codecaine/bun_rad_studio/src/simplegui.ts");
    });
  win.endRow();

  win.addLabel("4. Target Drop Zone (Project Context Menu):")
    .font(11, "#38bdf8", "700");

  win.addFormDropZone("zone_target", "Right-click this drop area for Project Actions")
    .width(560)
    .height(60)
    .contextMenu([
      "⭐ Star Project",
      "🏷️ Add Project Label",
      "📌 Pin to Workspace",
      "---",
      "📤 Share Project...",
      "📦 Archive to Tarball"
    ], (_w, action) => {
      triggerAction("Drop Zone Context Menu", action, "zone_target");
    });

  win.addLabel("5. In-Canvas Popup Menus, Split Buttons & Pickers:")
    .font(11, "#10b981", "700");

  win.beginRow();
  win.addPopupMenu("pm_actions", [
    "🔨 Compile Binary",
    "🧪 Run All Tests",
    "📦 Create DMG Installer",
    "---",
    "⚙️ Compiler Flags..."
  ], { width: 175 });

  win.addSplitButton("🚀 Deploy", [
    "Deploy to Staging",
    "Deploy to Production",
    "Canary Rollout (10%)",
    "---",
    "Rollback Last Release"
  ], (_w, val) => {
    triggerAction("Split Button", val, "Deploy System");
  }).width(185);

  win.addPullDown("pd_export", [
    "Export as JSON",
    "Export as CSV",
    "Export as Markdown",
    "Export as PDF"
  ], "Export as JSON", (_w, val) => {
    triggerAction("Pull-Down Menu", val, "Export Engine");
  }).width(185);
  win.endRow();

  win.endCard();

  // -------------------------------------------------------------
  // RIGHT COLUMN: Dedicated Action Inspector & Pure Live Console Stream
  // -------------------------------------------------------------
  win.beginCard("Real-Time Telemetry & Console", "Native IPC action inspector and dedicated telemetry stream");

  // A. Professional Action Inspector HUD (Pure Telemetry - ZERO Stray Buttons)
  win.beginRow();
  win.addBadge("LIVE HUD", "info");
  win.addBadge("IPC ACTIVE", "success").id("badge_ipc_status");
  win.addBadge("ZERO RELOAD", "info");
  win.addLabel("Native WebKit Event Interceptor")
    .font(10, "rgba(255,255,255,0.45)", "500")
    .width(260);
  win.endRow();

  // Prominent High-Contrast "LAST ACTION" Callout Box
  win.addLabel("⚡ LAST ACTION: [System] Ready — Click any control or menu item to inspect")
    .id("lbl_last_action")
    .font(13, "#38bdf8", "700");

  win.addLabel("Target: Standby | Event Channel: Native IPC | Latency: 0.1ms | Timestamp: Ready")
    .id("lbl_action_meta")
    .font(11, "rgba(255,255,255,0.65)", "500");

  win.addDivider();

  // B. Dedicated Pure Live Console Output Stream (100% Unencumbered - ZERO Buttons)
  win.beginRow();
  win.addBadge("● LIVE STDOUT", "success");
  win.addBadge("READ-ONLY", "info");
  win.addLabel("Unfiltered IPC event telemetry feed • Right-click inside for Copy / Clear / Export")
    .font(10, "rgba(255,255,255,0.45)", "400")
    .width(380);
  win.endRow();

  const initialLog = `[SYSTEM] Desktop Menu & Context Menu Studio v2.0 initialized.
[SYSTEM] Cascading menu bar loaded with 6 dropdowns.
[SYSTEM] Global window canvas context menu active.
[SYSTEM] 4 target context menus active (Code Studio, Input, Path, Drop Zone).
[SYSTEM] In-canvas Popup, Split Button, and Pull-Down menus loaded.
[SYSTEM] Dedicated telemetry stream connected via native Webview IPC.
[READY] Awaiting interaction...`;

  win.addTextArea("txt_event_log", initialLog, "Live console output...")
    .width(560)
    .height(265)
    .readOnly()
    .contextMenu([
      "📋 Copy Console Contents",
      "🧹 Clear Console Stream",
      "💾 Save Log to File..."
    ], (w, action) => {
      triggerAction("Console Context Menu", action, "txt_event_log");
      if (action.includes("Clear")) {
        w.setValue("txt_event_log", "[SYSTEM] Console stream cleared.\n");
        logEvent("Console", "Stream cleared via context menu");
      }
    });

  win.endCard();

  win.endRow();

  // 6. Bottom Status Dock
  win.addStatusDock([
    { icon: "🟢", label: "Menu Bar", value: "6 Menus / 39 Items" },
    { icon: "🎯", label: "Context Menus", value: "4 Target + 1 Global" },
    { icon: "⚡", label: "Last Action", value: "Standby" },
    { icon: "🚀", label: "Runtime", value: "Bun RAD v1.4" }
  ]);

  // Unified Interaction & Telemetry Dispatcher
  function triggerAction(source: string, action: string, details?: string) {
    const time = new Date().toLocaleTimeString();
    const summary = details ? `${action} (${details})` : action;

    // 1. Log to the dedicated console output
    logEvent(source, summary);

    // 2. Update prominent "LAST ACTION" visual inspector
    win.setValue("lbl_last_action", `⚡ LAST ACTION: [${source}] "${action}"`);
    win.setValue("lbl_action_meta", `Target: ${source} | Event: IPC Handled | Time: ${time}`);

    // 3. Update the top hint banner
    win.setValue("banner_hint", `🎯 ${source}: "${action}" handled successfully via Webview IPC`);

    // 4. Fire sleek animated in-window toast HUD
    win.toast(`🎯 [${source}] ${action}`, 2200);

    // 5. Update Status Dock
    win.setStatus(`[${source}] ${action}`);
  }

  function logEvent(source: string, msg: string) {
    const time = new Date().toLocaleTimeString();
    const current = win.getValue("txt_event_log") || "";
    const line = `[${time}] [${source}] ${msg}`;
    console.log(line);
    const updated = current ? `${current}\n${line}` : line;
    win.setValue("txt_event_log", updated);
  }

  // 7. Event Handlers
  win.onClick("main_menu_bar", (_w, item) => {
    triggerAction("Menu Bar", String(item));
    if (item === "File > 🛑 Exit App  ⌘Q") {
      win.close();
    } else if (item === "View > 🎯 Center Window") {
      win.center();
      logEvent("Window", "Centered on display");
    } else if (item === "Tools > 🧹 Clear Console Stream") {
      win.setValue("txt_event_log", "[SYSTEM] Console stream cleared via Menu Bar.\n");
      logEvent("Console", "Stream cleared via Tools menu");
    } else if (item === "Tools > 🗂️ Format Document  ⌥⇧F") {
      logEvent("Document", "Applied Prettier/Biome formatting rules");
    } else if (item === "Tools > 💬 Show Modal Dialog") {
      win.alert("SimpleGUI Native Desktop Modal Dialog", "Tools Menu");
    } else if (item === "Help > ℹ️ About Desktop Menu Studio") {
      win.alert("Desktop Menu & Context Menu Studio\nBuilt with Bun RAD Studio + SimpleGUI\n100% Desktop Parity with Zero Reload Interference", "About");
    }
  });

  win.onClick("app_toolbar", (_w, item) => {
    triggerAction("App Toolbar", String(item));
    if (String(item).includes("Center")) {
      win.center();
      logEvent("Window", "Centered on display");
    } else if (String(item).includes("Clear")) {
      win.setValue("txt_event_log", "[SYSTEM] Console stream cleared via Toolbar.\n");
      logEvent("Console", "Stream cleared via Toolbar");
    } else if (String(item).includes("Test")) {
      win.alert("Interactive Context Menus, Application Menu Bars, and Toolbars are operating with 100% IPC accuracy!", "Diagnostics");
      logEvent("Diagnostics", "Fired modal dialog test");
    }
  });

  win.onClick("pm_actions", (_w, item) => {
    triggerAction("Popup Menu", String(item));
  });

  win.onGlobalContextMenu((_w, item) => {
    triggerAction("Global Context Menu", String(item), "Canvas Background");
    if (item === "🔄 Refresh Workspace") {
      logEvent("Workspace", "Refreshed project tree and controls hierarchy");
    } else if (item === "📋 Copy Window Position") {
      logEvent("Window", `Dimensions: ${win.width}x${win.height}`);
    }
  });

  return win;
}

if (import.meta.main) {
  const win = createContextMenuAndMenuDemo();
  win.run();
}
