/**
 * ⚡ Bun RAD Studio Demo 14: SimpleGUI Fluent User Form Demo
 * 
 * Demonstrates:
 * - SimpleGUI declarative window & theme setup
 * - Fluent control creation with method chaining (.font, .bg, .color, .bold, .onClick)
 * - Row & Grid layout containers for clean positioning
 * - Form values reading, submission, clearing, and interactive alerts
 */

import { simplegui } from "../index.ts";

const win = simplegui.createWindow("SimpleGUI - User Registration & Account Setup", 840, 660, {
    theme: "apple_dark"
});

// Title Header
win.addLabel("👤 User Account & Profile Setup")
    .font(20, "#38bdf8", "700");

win.addLabel("Fill out your developer profile details below:")
    .font(13, "#94a3b8");

win.addDivider();

// User Input Card Container
win.beginCard("Personal Details");

win.beginRow();
win.addLabel("Full Name:").width(120);
win.addTextInput("e.g. Alex Mercer").id("txtName").width(280);
win.endRow();

win.beginRow();
win.addLabel("Email Address:").width(120);
win.addTextInput("alex@example.com").id("txtEmail").width(280);
win.endRow();

win.beginRow();
win.addLabel("Account Plan:").width(120);
win.addDropdown(["Developer (Free)", "Pro ($19/mo)", "Enterprise ($99/mo)"], "Pro").id("cmbPlan").width(280);
win.endRow();

win.beginRow();
win.addLabel("Notifications:").width(120);
win.addSwitch("Enable Email Alerts", true).id("swtNotify");
win.endRow();

win.endCard();

// Preferences & Experience Card Container
win.beginCard("Preferences & Experience");

win.beginRow();
win.addLabel("Role / Title:").width(120);
win.addSegmentedControl(["Frontend", "Backend", "Fullstack", "DevOps"], 2).id("segRole").width(340);
win.endRow();

win.beginRow();
win.addLabel("Experience Level:").width(120);
const sldExp = win.addSlider(1, 20, 5).id("sldExp").width(260);
win.endRow();

win.endCard();

// Output Result Panel
win.beginCard("Live Form Status");
const lblStatus = win.addLabel("Status: Ready for user input")
    .id("lblStatus")
    .font(13, "#38bdf8", "600");
win.endCard();

// Form Action Buttons
win.beginRow();
win.addButton("🚀 Submit Profile", (w) => {
    const vals = w.getFormValues();
    const name = vals.txtName || "Anonymous";
    const email = vals.txtEmail || "None";
    const plan = vals.cmbPlan || "Free";
    
    const msg = `✅ Profile Created Successfully!\nName: ${name}\nEmail: ${email}\nPlan: ${plan}`;
    w.setText("lblStatus", `Submitted: ${name} (${email}) - Plan: ${plan}`);
    w.showAlert(msg, "Registration Success");
}).bg("#0284c7").color("#ffffff").bold().width(180).height(40);

win.addButton("↺ Clear Inputs", (w) => {
    w.clearForm();
    w.setText("lblStatus", "Status: Form reset back to default states.");
}).bg("#334155").color("#f8fafc").width(140).height(40);

win.addButton("🎨 Toggle Theme", (w) => {
    const nextTheme = w.theme === "apple_dark" ? "apple_light" : "apple_dark";
    w.setTheme(nextTheme);
    w.setText("lblStatus", `Theme switched to: ${nextTheme}`);
}).bg("#475569").color("#ffffff").width(150).height(40);

win.endRow();

console.log("⚡ Launching SimpleGUI Demo 14...");
win.run();
