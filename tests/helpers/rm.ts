import { rmSync } from "fs";

/**
 * Removes a throw-away test folder. On Windows a database or log file that a test's server still holds open makes the
 * removal fail with EBUSY; that leftover lives in the temporary folder and must not fail a test that already passed.
 */
export function rmDir(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (err) {
    if (process.platform !== "win32") throw err;
  }
}
