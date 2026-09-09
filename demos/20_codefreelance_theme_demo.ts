#!/usr/bin/env bun
/**
 * Demo 20: CodeFreelance Theme Showcase
 *
 * Demonstrates the official CodeFreelance theme mirroring https://www.codefreelance.net/
 * Features:
 *   - Obsidian deep black canvas (#050505)
 *   - Elevated matte panels (#121212) with subtle borders (#2a2a2a)
 *   - High-contrast neon emerald fitness green (#0fb36a) buttons with bold black text
 *   - Electric purple secondary accents (#bd00ff)
 *   - High-contrast white typography and fitness telemetry tables
 *
 * Usage:
 *   bun run demo:codefreelance
 */

import { newSimpleWindow, SimpleWindow, getTheme } from "../src/simplegui";

export function createCodeFreelanceShowcase(): SimpleWindow {
  const cf = getTheme("codefreelance");

  const win = newSimpleWindow("CodeFreelance -- Daily Workouts & High-Performance Engineering", 1140, 880, {
    appId: "codefreelance_showcase",
    theme: "codefreelance",
    autoSaveState: true,
  });

  // Header Banner
  win.beginRow();
  win.addHeading("CodeFreelance Workstation");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("Fitness | Daily Workouts, Training Plans & High-Performance Engineering (codefreelance.net)");

  // Daily Telemetry Overview Card
  win.beginCard("Daily Activity & Metric Highlights", "Key training KPIs and developer streak metrics");
  win.beginRow();
  win.addMetricCard("Daily Workouts", "142 Completed", "+18%");
  win.addMetricCard("Active Streak", "48 Days", "+100%");
  win.addMetricCard("Volume Moved", "18,450 kg", "+12.4%");
  win.addMetricCard("Code Modules", "54 Built", "Stable");
  win.endRow();
  win.endCard();

  // Training Session Planner
  win.beginGroupBox("Workout Session & Exercise Configuration");
  win.beginRow();
  win.addLabel("lbl_routine", "Training Routine:");
  win.addDropdown("dd_routine", [
    "1. Full Body Strength & Power",
    "2. High Intensity Interval Training (HIIT)",
    "3. Mobility, Joint Health & Recovery",
    "4. Core Stability & Calisthenics",
    "5. Hypertrophy Upper Body Push/Pull",
    "6. Leg Day & Sprint Intervals",
  ], "1. Full Body Strength & Power");
  win.addLabel("lbl_duration", "Duration (mins):");
  win.addInput("txt_duration", "45").width(90);
  win.addButton("btn_start", "⚡ Start Workout");
  win.endRow();

  win.beginRow();
  win.addCheckbox("chk_audio", "Voice Coach Audio", true);
  win.addCheckbox("chk_heart", "Heart Rate Monitor", true);
  win.addCheckbox("chk_sync", "Sync HealthKit / Strava", true);
  win.addCheckbox("chk_timer", "Auto-Rest Countdown (60s)", true);
  win.endRow();

  win.beginRow();
  win.addLabel("lbl_notes", "Session Focus / Notes:");
  win.addInput("txt_notes", "Focus on explosive bar speed, controlled eccentric reps, and perfect posture.").width(520);
  win.addButton("btn_log", "💾 Save Session Log");
  win.endRow();
  win.endGroupBox();

  // Exercise Execution Table
  win.beginGroupBox("Active Exercise Protocol & Target Loads");
  win.addTable("tbl_exercises", ["Exercise", "Target Sets", "Reps / Time", "Load (kg)", "RPE / Intensity", "Status"], [
    ["Barbell Back Squat", "4 Sets", "8 Reps", "125 kg", "RPE 8.0", "🟢 Ready"],
    ["Romanian Deadlift", "3 Sets", "10 Reps", "105 kg", "RPE 7.5", "🟢 Ready"],
    ["Overhead Barbell Press", "4 Sets", "6 Reps", "70 kg", "RPE 8.5", "🟢 Ready"],
    ["Pull-ups (Weighted)", "4 Sets", "8 Reps", "+15 kg", "RPE 8.0", "🟢 Ready"],
    ["Hanging Leg Raises", "3 Sets", "15 Reps", "Bodyweight", "RPE 7.0", "🟢 Ready"],
  ]);
  win.endGroupBox();

  // Diagnostics & Telemetry
  win.beginGroupBox("Session Telemetry & Biometrics Stream");
  win.addConsole("cf_console", 110);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "CodeFreelance Engine: Active  |  Theme: #050505 Obsidian Canvas  |  Accent: #0fb36a Emerald  |  Network: Connected");
  win.endRow();

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("CodeFreelance session state saved!");
  });

  win.onClick("btn_start", () => {
    const routine = win.getValue("dd_routine") || "Workout";
    const duration = win.getValue("txt_duration") || "45";
    win.appendConsole("cf_console", `[CodeFreelance] ⚡ Starting routine: ${routine} (${duration} mins)\n`, 2);
    win.appendConsole("cf_console", `[CodeFreelance] Timer initialized. Heart rate telemetry streaming.\n`, 1);
    win.setStatus(`Active Session: ${routine} in progress...`);
  });

  win.onClick("btn_log", () => {
    const notes = win.getValue("txt_notes") || "";
    win.appendConsole("cf_console", `[CodeFreelance] 💾 Session logged successfully: "${notes}"\n`, 2);
    win.toast("Workout session saved to CodeFreelance vault!");
  });

  return win;
}

if (import.meta.main) {
  const win = createCodeFreelanceShowcase();
  win.run();
}
