import { colors } from "../../../shared/colors.ts";

// Doer: Render string template replacing {{key}} and {{key | fallback}}
export function renderTemplate(template: string, vars: Record<string, any>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)(?:\s*\|\s*([^}]+))?\s*\}\}/g, (_, key, fallback) => {
    const val = vars[key];
    if (val !== undefined && val !== null) {
      return String(val);
    }
    if (fallback !== undefined) {
      return fallback.trim();
    }
    return "";
  });
}

// Doer: Render Markdown string into terminal ANSI formatted text
export function renderMarkdownAnsi(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const formatted: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      formatted.push(colors.gray("----------------------------------------"));
      continue;
    }

    if (inCodeBlock) {
      formatted.push(colors.cyan(`  ${line}`));
      continue;
    }

    // Headers
    if (line.startsWith("# ")) {
      formatted.push(colors.bold(colors.magenta(`\n=== ${line.slice(2)} ===\n`)));
      continue;
    }
    if (line.startsWith("## ")) {
      formatted.push(colors.bold(colors.cyan(`\n-- ${line.slice(3)} --`)));
      continue;
    }
    if (line.startsWith("### ")) {
      formatted.push(colors.bold(colors.yellow(`   ${line.slice(4)}`)));
      continue;
    }

    let parsed = line;

    // Bullet points
    if (/^\s*[-*]\s+/.test(parsed)) {
      parsed = parsed.replace(/^\s*[-*]\s+/, " • ");
    }

    // Bold **text**
    parsed = parsed.replace(/\*\*([^*]+)\*\*/g, (_, text) => colors.bold(text));

    // Inline `code`
    parsed = parsed.replace(/`([^`]+)`/g, (_, code) => colors.yellow(` ${code} `));

    // Italic *text*
    parsed = parsed.replace(/\*([^*]+)\*/g, (_, text) => colors.dim(text));

    formatted.push(parsed);
  }

  return formatted.join("\n");
}

export const templateutils = {
  renderTemplate,
  renderMarkdownAnsi,
};
