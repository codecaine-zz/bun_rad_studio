import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { basename } from "path";
import { auditEnv, diffEnv, formatDiff, makeExample, maskEnv, unmaskEnv } from "../src/shared/env_vault";

const DEFAULT_ENV = `# Bun RAD Studio - Environment Configuration
PORT=3000
NODE_ENV=production
DATABASE_URL="sqlite:///data/prod.db"
API_KEY="sk_live_9948572019485710293485"
JWT_SECRET="super_secret_enterprise_jwt_token_2026"
CORS_ORIGINS="http://localhost:3000,https://app.example.com"
ENABLE_TELEMETRY=true
CACHE_TTL_SECONDS=3600
REDIS_HOST="127.0.0.1"
REDIS_PORT=6379
`;

const DEFAULT_ENV_EXAMPLE = `# Example Environment Template
PORT=3000
NODE_ENV=development
DATABASE_URL=""
API_KEY=""
JWT_SECRET=""
CORS_ORIGINS=""
ENABLE_TELEMETRY=false
CACHE_TTL_SECONDS=3600
STRIPE_WEBHOOK_SECRET=""
`;

const MAX_FILE_BYTES = 1024 * 1024;

/** Reads a settings file for the editor, with a sentence (naming the file) when it can't be used. */
function readSettingsFile(path: string): string {
  if (!existsSync(path)) throw new Error(`${path} does not exist.`);
  const st = statSync(path);
  if (!st.isFile()) throw new Error(`${path} is not a file.`);
  if (st.size > MAX_FILE_BYTES) throw new Error(`${basename(path)} is ${(st.size / 1024 / 1024).toFixed(1)} MB. Settings files are small; this does not look like one (the limit is 1 MB).`);
  const buf = readFileSync(path);
  if (buf.includes(0)) throw new Error(`${basename(path)} is a binary file, not a text settings file.`);
  return buf.toString("utf8");
}

export function createEnvStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("Environment & Secret Vault Studio Pro", 1140, 960, {
    appId: "env_studio",
    theme: options.theme || getSavedTheme() || "midnight",
    autoSaveState: true,
    fullscreen: options.fullscreen ?? true,
  });

  // Header Title
  win.beginRow();
  win.addHeading("Environment & Secret Vault");
  win.addThemeSelector("dd_theme", "Theme:");
  win.addButton("btn_fullscreen", "⛶ Fullscreen");
  win.addButton("btn_save_state", "💾 Save State");
  win.addButton("btn_center", "Center Window");
  win.endRow();
  win.addCaption("Check a .env file, hide its secrets, and make a safe example file to share.");
  win.addCaption("How it works:  1 Open your .env (or paste it)  →  2 Check it  →  3 Make an example  →  4 Copy or save the example.  Your real values are never changed or sent anywhere.");

  // Summary Metrics Card
  win.beginCard("Environment Telemetry & Health Audit");
  win.beginRow();
  win.addLabel("lbl_total_vars", "Total Variables: 10");
  win.addLabel("lbl_duplicates", "Duplicates: 0 (Clean)");
  win.addLabel("lbl_syntax", "Syntax Status: 🟢 Valid");
  win.endRow();
  win.addLabel("lbl_file", "File: sample settings (not saved anywhere yet)");
  win.endCard();

  // Your settings
  win.beginGroupBox("Your settings (.env)");
  win.beginRow();
  win.addButton("btn_open_env", "📂 Open .env…");
  win.addButton("btn_validate", "⚡ Audit & Validate");
  win.addButton("btn_mask", "🔒 Mask Secrets");
  win.addButton("btn_unmask", "👁️ Unmask Secrets");
  win.addButton("btn_copy_env", "📋 Copy .env");
  win.addButton("btn_export_env", "💾 Save .env…");
  win.addButton("btn_clear_env", "🧹 Clear");
  win.endRow();
  win.addTextarea("txt_env_active", DEFAULT_ENV, "NAME=value, one per line. Paste your settings here or press Open .env.");
  win.endGroupBox();

  // The shareable example
  win.beginGroupBox("Example file (.env.example): safe to share");
  win.beginRow();
  win.addButton("btn_gen_example", "✨ Generate .env.example");
  win.addButton("btn_copy_example", "📋 Copy example");
  win.addButton("btn_save_example", "💾 Save example…");
  win.addButton("btn_open_template", "📂 Open example…");
  win.addButton("btn_diff", "⚖️ Compare with .env.example");
  win.endRow();
  win.addTextarea("txt_env_compare", DEFAULT_ENV_EXAMPLE, "The example file: names without secret values. Generate it from your settings, or open one.");
  win.endGroupBox();

  win.beginGroupBox("Comparison report");
  win.addTextarea("txt_env_report", "", "Press Compare to see which names are missing, extra or empty.");
  win.endGroupBox();

  // Telemetry Console
  win.beginGroupBox("Vault Activity & Validation Telemetry");
  win.addConsole("env_console", 110);
  win.endGroupBox();

  // Status Bar
  win.beginRow();
  win.addLabel("lbl_status", "Status: Ready  |  Vars: 10  |  Zero Homebrew");
  win.endRow();

  let isMasked = false;
  let rawUnmaskedText = DEFAULT_ENV;
  let currentPath = "";

  /** What is really in the settings, even while the secrets are shown as dots. */
  const realText = (): string => {
    const shown = win.getValue("txt_env_active") || "";
    return isMasked ? unmaskEnv(shown, rawUnmaskedText) : shown;
  };
  const say = (msg: string, level = 2) => win.appendConsole("env_console", `${msg}\n`, level);
  const showFile = () => win.setText("lbl_file", currentPath ? `File: ${currentPath}` : "File: not saved anywhere yet");

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Environment vault configuration saved!");
  });

  const validateEnv = () => {
    const audit = auditEnv(realText());
    win.setText("lbl_total_vars", `Total Variables: ${audit.total}`);
    win.setText("lbl_duplicates", `Duplicates: ${audit.duplicates.length > 0 ? `🔴 ${audit.duplicates.join(", ")}` : "0 (Clean)"}`);
    win.setText("lbl_syntax", `Syntax Status: ${audit.errors.length > 0 ? `🔴 ${audit.errors.length} Error(s)` : "🟢 Valid"}`);

    if (audit.errors.length > 0) say(`[Audit Errors]\n${audit.errors.join("\n")}`, 3);
    else say(`[Audit Passed] ${audit.total} variables verified.${audit.duplicates.length ? "" : " No duplicates."}`, 2);
    if (audit.warnings.length > 0) say(`[Audit Notes] ${audit.warnings.length} thing(s) to look at:\n${audit.warnings.join("\n")}`, 4);

    win.setText("lbl_status", `Total: ${audit.total} vars  |  Syntax: ${audit.errors.length === 0 ? "Valid" : "Errors"}  |  Notes: ${audit.warnings.length}`);
    win.setStatus(`Validated ${audit.total} variables`);
  };
  win.onClick("btn_validate", validateEnv);

  win.onClick("btn_open_env", async () => {
    const path = await win.openFileDialog("Open a .env file");
    if (!path) return;
    try {
      const text = readSettingsFile(path);
      isMasked = false;
      rawUnmaskedText = text;
      win.setText("txt_env_active", text);
      currentPath = path;
      showFile();
      say(`[Open] Loaded ${path}`);
      validateEnv();
    } catch (e: any) {
      say(`[Open Error] ${e.message}`, 3);
      win.toast(`Could not open ${basename(path)}`);
    }
  });

  win.onClick("btn_open_template", async () => {
    const path = await win.openFileDialog("Open an example file (.env.example)");
    if (!path) return;
    try {
      win.setText("txt_env_compare", readSettingsFile(path));
      say(`[Open] Example loaded from ${path}`);
    } catch (e: any) {
      say(`[Open Error] ${e.message}`, 3);
      win.toast(`Could not open ${basename(path)}`);
    }
  });

  win.onClick("btn_mask", () => {
    if (isMasked) {
      win.toast("Secrets are already masked");
      return;
    }
    rawUnmaskedText = win.getValue("txt_env_active") || "";
    isMasked = true;
    win.setText("txt_env_active", maskEnv(rawUnmaskedText));
    say("[Vault] Sensitive keys masked for display. Copy and Save still use the real values.");
    win.toast("Sensitive keys masked");
  });

  win.onClick("btn_unmask", () => {
    if (!isMasked) {
      win.toast("Nothing is masked");
      return;
    }
    win.setText("txt_env_active", realText());
    isMasked = false;
    say("[Vault] Sensitive keys unmasked", 4);
    win.toast("Keys unmasked");
  });

  win.onClick("btn_copy_env", () => {
    const text = realText();
    if (!text.trim()) return win.toast("There is nothing to copy");
    win.copyToClipboard(text);
    say(`[Copy] .env copied (${text.split("\n").length} lines, real values: paste it only where it is safe).`, 4);
    win.toast("Copied .env to the clipboard");
  });

  win.onClick("btn_export_env", async () => {
    const text = realText();
    if (!text.trim()) return win.toast("There is nothing to save");
    const path = await win.saveFileDialog("Save .env", currentPath ? basename(currentPath) : ".env");
    if (!path) return;
    try {
      // Owner-only permissions: this file holds secrets.
      writeFileSync(path, text, { encoding: "utf8", mode: 0o600 });
      currentPath = path;
      showFile();
      say(`[Export] Environment written to ${path}`);
      win.toast(`Saved ${basename(path)}`);
    } catch (e: any) {
      say(`[Export Error] Could not write ${path}: ${e.message}`, 3);
      win.toast("Could not save the file");
    }
  });

  win.onClick("btn_clear_env", async () => {
    if (!realText().trim()) return;
    if (!(await win.showConfirm("Clear the settings box? (A file you opened is not changed.)", "Clear"))) return;
    isMasked = false;
    rawUnmaskedText = "";
    currentPath = "";
    win.setText("txt_env_active", "");
    showFile();
    say("[Vault] Settings box cleared", 4);
  });

  win.onClick("btn_diff", () => {
    const d = diffEnv(realText(), win.getValue("txt_env_compare") || "");
    win.setText("txt_env_report", formatDiff(d));
    say(`[Audit Diff] Missing: ${d.missing.length} | Extra: ${d.extra.length} | Empty: ${d.empty.length}`);
    win.toast(`Diff: ${d.missing.length} missing, ${d.extra.length} extra`);
  });

  win.onClick("btn_gen_example", () => {
    const ex = makeExample(realText());
    win.setText("txt_env_compare", ex.text);
    say(`[Template Generator] Generated clean .env.example with ${ex.count} variables (${ex.kept} plain settings such as ports kept, every secret blanked)`);
    win.toast("Generated .env.example. Use Copy or Save example below it.");
  });

  win.onClick("btn_copy_example", () => {
    const text = win.getValue("txt_env_compare") || "";
    if (!text.trim()) return win.toast("The example is empty: press Generate first");
    win.copyToClipboard(text);
    say("[Copy] Example file copied to the clipboard.");
    win.toast("Copied the example to the clipboard");
  });

  win.onClick("btn_save_example", async () => {
    const text = win.getValue("txt_env_compare") || "";
    if (!text.trim()) return win.toast("The example is empty: press Generate first");
    const path = await win.saveFileDialog("Save .env.example", ".env.example");
    if (!path) return;
    try {
      writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`, "utf8");
      say(`[Export] Example written to ${path}`);
      win.toast(`Saved ${basename(path)}`);
    } catch (e: any) {
      say(`[Export Error] Could not write ${path}: ${e.message}`, 3);
      win.toast("Could not save the file");
    }
  });

  win.onClick("btn_fullscreen", (w) => {
    w.toggleFullscreen();
  });

  return win;
}

if (import.meta.main) {
  const win = createEnvStudio({ fullscreen: true });
  console.log("⚡ Launching Environment & Secret Vault Studio...");
  win.run();
}
