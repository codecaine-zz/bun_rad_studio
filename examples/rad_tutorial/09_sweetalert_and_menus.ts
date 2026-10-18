/**
 * Chapter 5B — Context Menus, SweetAlert2 Dialogs, Modals & File Pickers
 *
 * Run:  bun run examples/rad_tutorial/09_sweetalert_and_menus.ts
 */
import { newSimpleWindow, SimpleWindow } from "../../src/simplegui";

export function createSweetAlertAndMenus(opts: { fullscreen?: boolean } = {}): SimpleWindow {
  const win = newSimpleWindow("Context Menus, Rich Dialogs & Pickers", 760, 560, {
    theme: "apple_dark", padding: 14, spacing: 10, ...opts,
  });

  win.setGlobalContextMenu(["🔄 Refresh Workspace", "🎨 Toggle Theme", "---", "ℹ️ About"]);

  win.beginCard("🖱️ Context Menus, Popup Menus & Split Buttons");
  win.addLabel("Right-click the input below for its custom context menu:").font(12, "#94a3b8");
  win.addTextInput("The quick brown fox", "Right-click me…").id("txtClip").width(460).contextMenu(
    ["🔤 Convert to UPPERCASE", "🔡 Convert to lowercase", "🧹 Clear Input"],
    (w, action) => {
      const cur = w.getText("txtClip");
      if (action.includes("UPPER")) w.setText("txtClip", cur.toUpperCase());
      else if (action.includes("lower")) w.setText("txtClip", cur.toLowerCase());
      else w.setText("txtClip", "");
      w.setStatusBarText("Context menu: " + action);
    },
  );

  win.beginRow();
  win.addPopupMenu("pmBuild", ["🔨 Compile Binary", "🧪 Run Tests", "📦 Package App"], { width: 175 });
  win.addSplitButton("🚀 Deploy", ["Deploy Staging", "Deploy Production", "Rollback"], (w, val) => {
    w.setText("lblResult", "Split button: " + val);
    w.toast("🚀 " + val, 1800);
  }).width(185);
  win.addHotkeyBadge(["Cmd", "K"]).tooltip("Keyboard shortcut badge");
  win.endRow();
  win.endCard();

  win.beginCard("💬 Declarative Modals, SweetAlert2 fire() & Webview File Picker");
  win.addModal(
    "cfgModal",
    "⚙️ Workspace Configuration",
    "Declarative backdrop-blur modal created with addModal() and opened with openModal().",
    false,
  );
  win.on("cfgModal", "confirm", (w) => w.setText("lblResult", "Modal: Confirmed ✅"));

  win.beginRow();
  win.addButton("🪟 Open Modal", (w) => w.openModal("cfgModal")).bg("#0284c7").color("#fff");
  win.addButton("✨ SweetAlert fire()", (w) => {
    w.fire({
      title: "Publish Release?",
      text: "Choose how to handle v1.4:",
      icon: "question",
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: "Publish",
      denyButtonText: "Save Draft",
    }, (r) => {
      w.setText("lblResult", r.isConfirmed ? "fire(): Published ✅" : r.isDenied ? "fire(): Draft saved 📝" : "fire(): Cancelled");
    });
  }).bg("#db2777").color("#fff");
  win.addButton("💬 Prompt", (w) => {
    w.prompt("Release tag:", "v1.4.3", "Tag Version", (val) => {
      if (val !== null) w.setText("lblResult", "Prompt tag: " + val);
    });
  }).bg("#7c3aed").color("#fff");
  win.addButton("🌐 File Picker", (w) => {
    w.open_webview_file_dialog("Select File", "", (p) => {
      if (p) w.setText("lblResult", "Picked: " + String(p).split(/[\\/]/).pop());
    });
  }).bg("#059669").color("#fff");
  win.endRow();

  win.addLabel("Result: waiting for interaction").id("lblResult").font(13, "#38bdf8").bold();
  win.endCard();

  win.addStatusBar("Ready — right-click the input or click any dialog button.");
  return win;
}

if (import.meta.main) createSweetAlertAndMenus({ fullscreen: false }).run();
