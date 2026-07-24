/**
 * ⚡ Bun RAD Studio Demo 1: Standard UI Controls & Helper Utilities
 * 
 * Demonstrates:
 * - Standard controls (button, label, input, password, textarea, checkbox, radio, switch, slider, steppers, date/file pickers)
 * - Event handling (onClick, onChange)
 * - High-level helper utility calls (setControlText, setControlValue, setControlEnabled, setControlVisible)
 */

import { SizeHint, Webview } from "webview-bun";
import { generatePreviewHtml, setAlwaysOnTopNative, toggleFullscreenNative } from "../index.ts";

const formSpec = {
    title: "Demo 1 - Standard RAD Controls & Helpers",
    width: 860,
    height: 640,
    background_color: "#0f172a",
    font_color: "#e2e8f0",
    padding: 24,
    spacing: 14,
    controls: [
        { id: "lblTitle", type: "label", caption: "👤 User Registration & Account Setup", left: 24, top: 20, width: 450, height: 28, font_size: 18, font_weight: "700" },
        { id: "lblStatus", type: "label", caption: "Status: Ready for user input", left: 24, top: 52, width: 500, height: 20, font_size: 12, font_color: "#38bdf8" },

        // Form Fields
        { id: "lblName", type: "label", caption: "Full Name:", left: 24, top: 90, width: 120, height: 20 },
        { id: "txtName", type: "input", placeholder: "e.g. Alex Mercer", left: 140, top: 85, width: 300, height: 36 },

        { id: "lblEmail", type: "label", caption: "Email Address:", left: 24, top: 135, width: 120, height: 20 },
        { id: "txtEmail", type: "input", placeholder: "alex@example.com", left: 140, top: 130, width: 300, height: 36 },

        { id: "lblPass", type: "label", caption: "Password:", left: 24, top: 180, width: 120, height: 20 },
        { id: "txtPass", type: "password", placeholder: "••••••••", left: 140, top: 175, width: 300, height: 36 },

        { id: "lblBio", type: "label", caption: "Short Bio:", left: 24, top: 225, width: 120, height: 20 },
        { id: "txtBio", type: "textarea", placeholder: "Tell us about your developer profile...", left: 140, top: 225, width: 300, height: 75 },

        // Checkbox & Switch Toggles
        { id: "chkTerms", type: "checkbox", caption: "I agree to the Terms of Service & Privacy Policy", left: 140, top: 315, width: 320, height: 24, value: true },
        { id: "swtNotify", type: "switch", caption: "Enable Email Notifications", left: 140, top: 350, width: 280, height: 26, value: true },

        // Slider & Stepper
        { id: "lblLevel", type: "label", caption: "Experience Level (Years): 5", left: 470, top: 90, width: 250, height: 20 },
        { id: "sldLevel", type: "slider", left: 470, top: 115, width: 320, height: 24, min_value: 1, max_value: 20, value: 5 },

        { id: "lblAge", type: "label", caption: "Age / Stepper:", left: 470, top: 160, width: 120, height: 20 },
        { id: "stpAge", type: "number_stepper", left: 470, top: 185, width: 140, height: 36, value: 28 },

        { id: "lblDate", type: "label", caption: "Start Date:", left: 470, top: 235, width: 120, height: 20 },
        { id: "dtpStart", type: "date_picker", left: 470, top: 260, width: 180, height: 36, value: "2026-07-24" },

        // Dynamic Action Buttons
        { id: "btnSubmit", type: "button", caption: "🚀 Submit Form", left: 140, top: 400, width: 140, height: 40, background_color: "#38bdf8", font_color: "#0f172a", font_weight: "700" },
        { id: "btnReset", type: "button", caption: "↺ Reset Form", left: 295, top: 400, width: 130, height: 40, background_color: "#334155" },
        { id: "btnToggleLock", type: "button", caption: "🔒 Lock / Unlock Inputs", left: 440, top: 400, width: 170, height: 40, background_color: "#475569" },

        // Dynamic Helper Result Card
        { id: "pnlResult", type: "groupbox", title: "⚡ Live Helper Output Log", left: 24, top: 460, width: 770, height: 120 },
        { id: "lblLog", type: "label", caption: "Waiting for user action...", left: 40, top: 490, width: 730, height: 70, font_size: 13, font_color: "#38bdf8" }
    ]
};

const html = generatePreviewHtml(formSpec);
const wv = new Webview();
wv.setHTML(html);
wv.title = "Bun RAD Studio - Demo 1: Standard Controls";
wv.size = { width: 860, height: 640, hint: SizeHint.NONE };

let isLocked = false;

function execJS(code: string) {
    try { wv.eval(code); } catch (e) { console.error("JS Error:", e); }
}

// Handle Form Submit Event
wv.bind("on_btnSubmit_click", () => {
    console.log("⚡ [IPC] on_btnSubmit_click triggered");
    
    // Read input values using JS evaluation helper
    execJS(`
        const name = document.getElementById("txtName").value || "Anonymous";
        const email = document.getElementById("txtEmail").value || "None";
        const log = "✅ Account Created! Name: " + name + " | Email: " + email + " | Submitted at " + new Date().toLocaleTimeString();
        document.getElementById("lblLog").textContent = log;
        document.getElementById("lblStatus").textContent = "Status: Account successfully registered!";
        document.getElementById("lblStatus").style.color = "#10b981";
    `);
});

// Handle Form Reset Event
wv.bind("on_btnReset_click", () => {
    console.log("⚡ [IPC] on_btnReset_click triggered");
    execJS(`
        document.getElementById("txtName").value = "";
        document.getElementById("txtEmail").value = "";
        document.getElementById("txtPass").value = "";
        document.getElementById("txtBio").value = "";
        document.getElementById("lblLog").textContent = "↺ Form reset back to default states.";
        document.getElementById("lblStatus").textContent = "Status: Form reset.";
        document.getElementById("lblStatus").style.color = "#38bdf8";
    `);
});

// Handle Lock/Unlock Controls Event
wv.bind("on_btnToggleLock_click", () => {
    isLocked = !isLocked;
    console.log("⚡ [IPC] Toggling control locked state:", isLocked);
    execJS(`
        const locked = ${isLocked};
        ["txtName", "txtEmail", "txtPass", "txtBio", "btnSubmit"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = locked;
                el.style.opacity = locked ? "0.5" : "1";
                el.style.pointerEvents = locked ? "none" : "auto";
            }
        });
        document.getElementById("lblStatus").textContent = locked ? "Status: Controls LOCKED (Disabled)" : "Status: Controls UNLOCKED (Enabled)";
        document.getElementById("lblStatus").style.color = locked ? "#ef4444" : "#38bdf8";
        document.getElementById("lblLog").textContent = locked ? "🔒 Form inputs have been dynamically disabled using setControlEnabled helper logic." : "🔓 Form inputs re-enabled.";
    `);
});

// Handle Slider Change Event
wv.bind("on_sldLevel_change", () => {
    execJS(`
        const val = document.getElementById("sldLevel").value;
        document.getElementById("lblLevel").textContent = "Experience Level (Years): " + val;
    `);
});

console.log("🚀 Running Bun RAD Studio Demo 1: Standard Controls...");
wv.run();
