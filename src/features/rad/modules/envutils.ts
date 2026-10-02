// Doer: Get string env variable with fallback
export function getStr(key: string, defaultVal = ""): string {
  const val = process.env[key];
  return val !== undefined ? val : defaultVal;
}

// Doer: Get integer env variable with fallback
export function getInt(key: string, defaultVal = 0): number {
  const val = process.env[key];
  if (val === undefined || val === "") return defaultVal;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

// Doer: Get float env variable with fallback
export function getFloat(key: string, defaultVal = 0.0): number {
  const val = process.env[key];
  if (val === undefined || val === "") return defaultVal;
  const parsed = parseFloat(val);
  return Number.isNaN(parsed) ? defaultVal : parsed;
}

// Doer: Get boolean env variable (1, true, yes, on)
export function getBool(key: string, defaultVal = false): boolean {
  const val = process.env[key];
  if (val === undefined) return defaultVal;
  const lower = val.toLowerCase().trim();
  return ["1", "true", "yes", "on"].includes(lower);
}

// Doer: Set environment variable
export function set(key: string, value: string | number | boolean): void {
  process.env[key] = String(value);
}

// Doer: Require env variable or throw descriptive error
export function requireEnv(key: string): string {
  const val = process.env[key];
  if (val === undefined || val.trim() === "") {
    throw new Error(`[envutils] Required environment variable "${key}" is not set`);
  }
  return val;
}

// Doer: Parse .env format string into dictionary
export function parseEnvString(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
    result[key] = val;
  }
  return result;
}

// Coordinator: Load and parse .env format text or file asynchronously
export async function loadEnv(contentOrPath: string): Promise<Record<string, string>> {
  const file = Bun.file(contentOrPath);
  if (await file.exists()) {
    const text = await file.text();
    return parseEnvString(text);
  }
  return parseEnvString(contentOrPath);
}

// Doer: Expand variables in string ($VAR or ${VAR})
export function expandVars(template: string, customEnv?: Record<string, string>): string {
  const envSource = customEnv || (process.env as Record<string, string>);
  return template.replace(/\$\{?([A-Za-z0-9_]+)\}?/g, (match, varName) => {
    return envSource[varName] !== undefined ? envSource[varName] : match;
  });
}

export const envutils = {
  getStr,
  getInt,
  getFloat,
  getBool,
  set,
  requireEnv,
  parseEnvString,
  loadEnv,
  expandVars,
};
