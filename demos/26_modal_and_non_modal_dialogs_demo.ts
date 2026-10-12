import { createWindow } from "../src/simplegui.ts";

export function createDialogsShowcase() {
    const win = createWindow("Modal & Non-Modal Dialogs Showcase", 920, 780, {
        theme: "apple_dark"
    });

    // Card 1: Declarative Modal Dialog Control
    win.beginCard("1. Declarative Modal Dialog Control (addModal)", "In-window popup with dark backdrop blur, pop-in animation, and action buttons");
    win.beginRow();

    win.addButton("btn_open_modal", "🪟 Open Modal Dialog", (w) => {
        w.openModal("demo_modal");
    }).bg("#0284c7").color("#ffffff").bold().width(200).height(40);

    win.addLabel("lbl_modal_status", "Modal status: Idle").width(350);

    win.endRow();
    win.endCard();

    // Declarative Modal definition (initially hidden)
    win.addModal(
        "demo_modal",
        "⚙️ Workspace Configuration",
        "This is a native SimpleGUI modal dialog.\n\n• It renders with a backdrop blur overlay.\n• It captures focus and dims the background.\n• Dismiss it with 'Cancel', the top-right (×) button, or the Escape key.\n• Click 'Confirm' to trigger the onConfirm handler.",
        false
    );

    win.on("demo_modal", "confirm", (w) => {
        w.setText("lbl_modal_status", "Modal status: Confirmed by user! ✅");
        w.toast("Modal action confirmed!");
    });

    win.on("demo_modal", "cancel", (w) => {
        w.setText("lbl_modal_status", "Modal status: Cancelled by user ❌");
    });

    // Card 2: Dynamic In-Window Async Modal Dialogs
    win.beginCard("2. Dynamic In-Window Dialogs (Async Promises)", "On-demand modal dialogs via IPC that return values without blocking the UI thread");
    win.beginRow();

    win.addButton("btn_test_confirm", "❓ Ask Confirmation", (w) => {
        w.confirm("Do you want to proceed with this operation?", "Confirm Action", (ok) => {
            w.setText("lbl_async_result", `Confirm result: ${ok ? "User clicked OK ✅" : "User clicked Cancel ❌"}`);
        });
    }).bg("#6366f1").color("#ffffff").width(180).height(38);

    win.addButton("btn_test_prompt", "💬 Prompt Text Input", (w) => {
        w.prompt("Enter your project name:", "my-bun-app", "Project Setup", (val) => {
            w.setText("lbl_async_result", val !== null ? `Prompt entered: "${val}"` : "Prompt cancelled by user.");
        });
    }).bg("#8b5cf6").color("#ffffff").width(180).height(38);

    win.addButton("btn_test_fire", "✨ Custom fire()", (w) => {
        w.fire({
            title: "Delete project?",
            text: "This cannot be undone.",
            icon: "warning",
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: "Delete",
            denyButtonText: "Archive",
            confirmButtonColor: "#dc2626",
        }, (r) => {
            w.setText("lbl_async_result", r.isConfirmed ? "Deleted ✅" : r.isDenied ? "Archived 📦" : "Dismissed (" + r.dismiss + ")");
        });
    }).bg("#db2777").color("#ffffff").width(170).height(38);

    win.addButton("btn_test_alert", "ℹ️ Info Alert", (w) => {
        w.info("System Ready", "All background worker threads are operating normally.");
    }).bg("#10b981").color("#ffffff").width(140).height(38);

    win.addButton("btn_test_error", "❌ Error Alert", (w) => {
        w.error("Database Error", "Unable to establish connection to localhost:5432.");
    }).bg("#ef4444").color("#ffffff").width(140).height(38);

    win.endRow();

    win.beginRow();
    win.addLabel("lbl_async_result", "Dynamic dialog result: (awaiting input)").bold().width(600);
    win.endRow();
    win.endCard();

    // Card 3: Non-Modal (Modeless) Overlays & Notifications
    win.beginCard("3. Non-Modal (Modeless) Overlays", "UI elements that do NOT block interaction with background content");
    win.beginRow();

    win.addButton("btn_toast_1", "🍞 Trigger Toast (3s)", (w) => {
        w.toast("⚡ Non-modal toast notification: Task completed!", 3000);
    }).bg("#d97706").color("#ffffff").width(190).height(38);

    win.addButton("btn_toast_2", "🍞 Quick Toast (1.5s)", (w) => {
        w.toast("💾 Quick save complete.", 1500);
    }).bg("#ca8a04").color("#ffffff").width(180).height(38);

    win.addButton("btn_toast_3", "🍞 Long Toast (5s)", (w) => {
        w.toast("🚀 Background compilation finished in 42ms.", 5000);
    }).bg("#0284c7").color("#ffffff").width(180).height(38);

    win.endRow();

    win.beginRow();
    win.addCalloutPanel("Notice", "This callout panel and toasts are modeless: you can freely click other controls while they are visible.", "info");
    win.endRow();
    win.endCard();

    // Card 4: Webview & Native File Dialogs
    win.beginCard("4. Cross-Platform File & Folder Dialogs", "Guaranteed in-webview file explorer modal (works anywhere) + Native OS pickers with fallback");
    win.beginRow();

    const showPath = (w: any, label: string) => (p: any) => {
        w.setText("lbl_file_result", p ? `${label}: ${Array.isArray(p) ? p.join(", ") : p}` : `${label}: (cancelled)`);
        if (p) w.toast(String(Array.isArray(p) ? p[0] : p).split(/[\\/]/).pop() || "", 2500, "success");
    };

    win.addButton("btn_wv_file", "🌐 Webview File Picker", (w) => {
        w.open_webview_file_dialog("Select Project File", "", showPath(w, "Selected file"));
    }).bg("#0284c7").color("#ffffff").bold().width(190).height(38);

    win.addButton("btn_wv_folder", "📁 Webview Folder Picker", (w) => {
        w.open_webview_folder_dialog("Select Working Directory", showPath(w, "Selected folder"));
    }).bg("#0d9488").color("#ffffff").bold().width(200).height(38);

    win.addButton("btn_wv_save", "💾 Webview Save File", (w) => {
        w.save_webview_file_dialog("Save Report", "summary_report.md", showPath(w, "Save target"));
    }).bg("#7c3aed").color("#ffffff").width(170).height(38);

    win.addButton("btn_wv_multi", "🗂 Pick Many (webview)", (w) => {
        w.openFiles({ title: "Select files", native: "never" }, showPath(w, "Selected files"));
    }).bg("#9333ea").color("#ffffff").width(190).height(38);

    win.addButton("btn_file_dialog", "📂 Native OS Picker", (w) => {
        // Cancelling the native dialog does NOT open a webview one; fallback happens only if native is unavailable.
        w.open_file_dialog("Select Any File", "", showPath(w, "Selected"));
    }).bg("#059669").color("#ffffff").width(160).height(38);

    win.endRow();
    win.beginRow();
    win.addLabel("lbl_file_result", "Path selected: (none)").bold().width(700);
    win.endRow();
    win.endCard();

    return win;
}

if (import.meta.main) {
    const win = createDialogsShowcase();
    console.log("✨ Launching Modal & Non-Modal Dialogs Demo...");
    win.run();
}
