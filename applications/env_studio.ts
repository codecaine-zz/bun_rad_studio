import { newSimpleWindow, SimpleWindow, getSavedTheme } from "../src/simplegui";
import { writeFileSync, existsSync } from "fs";
import { resolve, basename } from "path";

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

interface EnvVar {
  key: string;
  value: string;
  comment?: string;
}

function parseEnv(text: string): { vars: EnvVar[]; duplicates: string[]; syntaxErrors: string[] } {
  const lines = text.split("\n");
  const vars: EnvVar[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const syntaxErrors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      syntaxErrors.push(`Line ${i + 1}: Missing '=' delimiter in "${line}"`);
      continue;
    }

    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();

    // Strip quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    if (seen.has(key)) {
      duplicates.push(key);
    } else {
      seen.add(key);
    }

    vars.push({ key, value: val });
  }

  return { vars, duplicates, syntaxErrors };
}

export function createEnvStudio(options: { fullscreen?: boolean; theme?: string } = {}): SimpleWindow {
  const win = newSimpleWindow("Environment & Secret Vault Studio Pro", 1140, 880, {
    appId: "env_studio",
    theme: options.theme || getSavedTheme() || "sonoma_emerald",
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
  win.addCaption("Enterprise .env Configuration Validator, Secret Masking & Template Generator");

  // Summary Metrics Card
  win.beginCard("Environment Telemetry & Health Audit");
  win.beginRow();
  win.addLabel("lbl_total_vars", "Total Variables: 10");
  win.addLabel("lbl_duplicates", "Duplicates: 0 (Clean)");
  win.addLabel("lbl_syntax", "Syntax Status: 🟢 Valid");
  win.endRow();
  win.endCard();

  // Action Toolbar
  win.beginGroupBox("Configuration Operations & Vault Actions");
  win.beginRow();
  win.addButton("btn_validate", "⚡ Audit & Validate");
  win.addButton("btn_mask", "🔒 Mask Secrets");
  win.addButton("btn_unmask", "👁️ Unmask Secrets");
  win.addButton("btn_diff", "⚖️ Compare with .env.example");
  win.addButton("btn_gen_example", "📋 Generate .env.example");
  win.addButton("btn_export_env", "💾 Save to .env");
  win.endRow();
  win.endGroupBox();

  // Split View: Active .env vs Comparison .env.example
  win.beginGroupBox("Active Environment Configuration (.env)");
  win.addTextarea("txt_env_active", DEFAULT_ENV);
  win.endGroupBox();

  win.beginGroupBox("Comparison Template / Audit Output");
  win.addTextarea("txt_env_compare", DEFAULT_ENV_EXAMPLE);
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

  // Handlers
  win.onClick("btn_center", () => win.center());
  win.onClick("btn_save_state", (w) => {
    w.saveAppFormState();
    w.toast("Environment vault configuration saved!");
  });

  const validateEnv = () => {
    const text = win.getValue("txt_env_active") || "";
    const parsed = parseEnv(text);

    win.setText("lbl_total_vars", `Total Variables: ${parsed.vars.length}`);
    win.setText(
      "lbl_duplicates",
      `Duplicates: ${parsed.duplicates.length > 0 ? `🔴 ${parsed.duplicates.join(", ")}` : "0 (Clean)"}`
    );
    win.setText(
      "lbl_syntax",
      `Syntax Status: ${parsed.syntaxErrors.length > 0 ? `🔴 ${parsed.syntaxErrors.length} Error(s)` : "🟢 Valid"}`
    );

    if (parsed.syntaxErrors.length > 0) {
      win.appendConsole("env_console", `[Audit Warnings]\n${parsed.syntaxErrors.join("\n")}\n`, 3);
    } else {
      win.appendConsole("env_console", `[Audit Passed] ${parsed.vars.length} variables verified. No duplicates.\n`, 2);
    }

    win.setText(
      "lbl_status",
      `Total: ${parsed.vars.length} vars  |  Syntax: ${parsed.syntaxErrors.length === 0 ? "Valid" : "Errors"}`
    );
    win.setStatus(`Validated ${parsed.vars.length} variables`);
  };

  win.onClick("btn_validate", validateEnv);

  win.onClick("btn_mask", () => {
    rawUnmaskedText = win.getValue("txt_env_active") || "";
    const lines = rawUnmaskedText.split("\n");
    const masked = lines.map((l) => {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith("#")) return l;
      const eqIdx = l.indexOf("=");
      if (eqIdx === -1) return l;
      const key = l.slice(0, eqIdx);
      const val = l.slice(eqIdx + 1);
      if (/SECRET|KEY|PASSWORD|TOKEN|AUTH/i.test(key)) {
        return `${key}="••••••••••••••••"`;
      }
      return l;
    });
    isMasked = true;
    win.setText("txt_env_active", masked.join("\n"));
    win.appendConsole("env_console", "[Vault] Sensitive keys masked for display\n", 2);
    win.toast("Sensitive keys masked");
  });

  win.onClick("btn_unmask", () => {
    if (isMasked && rawUnmaskedText) {
      win.setText("txt_env_active", rawUnmaskedText);
      isMasked = false;
      win.appendConsole("env_console", "[Vault] Sensitive keys unmasked\n", 4);
      win.toast("Keys unmasked");
    }
  });

  win.onClick("btn_diff", () => {
    const activeText = win.getValue("txt_env_active") || "";
    const exampleText = win.getValue("txt_env_compare") || "";

    const parsedActive = parseEnv(activeText);
    const parsedExample = parseEnv(exampleText);

    const activeKeys = new Set(parsedActive.vars.map((v) => v.key));
    const exampleKeys = new Set(parsedExample.vars.map((v) => v.key));

    const missingInActive = Array.from(exampleKeys).filter((k) => !activeKeys.has(k));
    const extraInActive = Array.from(activeKeys).filter((k) => !exampleKeys.has(k));

    const report = [
      `========================================================================`,
      `ENVIRONMENT AUDIT & DIFF REPORT`,
      `========================================================================`,
      `Active Vars:      ${activeKeys.size}`,
      `Template Vars:    ${exampleKeys.size}`,
      ``,
      `🔴 Missing in Active Environment (Present in template):`,
      missingInActive.length > 0 ? missingInActive.map((k) => `  - ${k}`).join("\n") : `  (None - All template variables satisfied)`,
      ``,
      `🟡 Extra in Active Environment (Not documented in template):`,
      extraInActive.length > 0 ? extraInActive.map((k) => `  + ${k}`).join("\n") : `  (None)`,
    ].join("\n");

    win.setText("txt_env_compare", report);
    win.appendConsole("env_console", `[Audit Diff] Missing: ${missingInActive.length} | Extra: ${extraInActive.length}\n`, 2);
    win.toast(`Diff: ${missingInActive.length} missing, ${extraInActive.length} extra`);
  });

  win.onClick("btn_gen_example", () => {
    const text = win.getValue("txt_env_active") || "";
    const parsed = parseEnv(text);
    const exampleLines = [
      `# Generated .env.example Template`,
      `# Auto-generated by Bun RAD Studio Environment & Secret Vault`,
      ``,
    ];

    for (const v of parsed.vars) {
      if (/PORT|NODE_ENV|HOST/i.test(v.key)) {
        exampleLines.push(`${v.key}=${v.value}`);
      } else {
        exampleLines.push(`${v.key}=""`);
      }
    }

    win.setText("txt_env_compare", exampleLines.join("\n"));
    win.appendConsole("env_console", `[Template Generator] Generated clean .env.example with ${parsed.vars.length} variables\n`, 2);
    win.toast("Generated .env.example");
  });

  win.onClick("btn_export_env", () => {
    const text = isMasked ? rawUnmaskedText : win.getValue("txt_env_active") || "";
    const outPath = resolve(process.cwd(), ".env.local");
    try {
      writeFileSync(outPath, text, "utf8");
      win.appendConsole("env_console", `[Export] Environment successfully written to ${outPath}\n`, 2);
      win.toast(`Saved to ${basename(outPath)}`);
    } catch (e: any) {
      win.appendConsole("env_console", `[Export Error] ${e.message}\n`, 3);
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
