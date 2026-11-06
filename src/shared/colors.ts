/**
 * Terminal ANSI color and text attribute formatting helpers for CLI output.
 */
// Terminal ANSI styling helpers using standard escape codes
const ESC = "\x1b[";
const RESET = `${ESC}0m`;

/**
 * Wraps `text` in the specified ANSI SGR escape code when stdout is a TTY,
 * or returns `text` unchanged when piped/non-interactive.
 */
export function colorText(text: string, code: string): string {
  if (!process.stdout.isTTY) return text;
  return `${ESC}${code}m${text}${RESET}`;
}

/**
 * Preconfigured ANSI styling functions for standard terminal weights and colors.
 */
export const colors = {
  bold: (t: string) => colorText(t, "1"),
  dim: (t: string) => colorText(t, "2"),
  red: (t: string) => colorText(t, "31"),
  green: (t: string) => colorText(t, "32"),
  yellow: (t: string) => colorText(t, "33"),
  blue: (t: string) => colorText(t, "34"),
  magenta: (t: string) => colorText(t, "35"),
  cyan: (t: string) => colorText(t, "36"),
  gray: (t: string) => colorText(t, "90"),
};
