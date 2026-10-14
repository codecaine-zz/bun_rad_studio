// "More info": turning what was found into a report you can copy or save: plain text, JSON or Markdown. Pure functions.

/** Longest report the server will save. Longer ones are shortened with a note. */
export const MAX_REPORT_CHARS = 800_000;

/**
 * @param {{ name: string, path: string, kind?: string }} subject
 * @param {Array<{ title: string, note?: string, rows: Array<{ label: string, value: string }> }>} groups
 * @param {Date} [when]
 */
export function buildReport(subject, groups, when = new Date()) {
  return {
    name: subject.name,
    path: subject.path,
    kind: subject.kind ?? "",
    generatedAt: when.toISOString(),
    generatedBy: "File Manager: More info",
    groups: groups.filter((g) => g.rows.length || g.note).map((g) => ({ title: g.title, ...(g.note ? { note: g.note } : {}), rows: g.rows.map((r) => ({ label: r.label, value: r.value })) })),
  };
}

const oneLine = (s) => String(s).replace(/\s*\n\s*/g, " ⏎ ");

function clamp(text) {
  return text.length > MAX_REPORT_CHARS ? `${text.slice(0, MAX_REPORT_CHARS)}\n… (the report was cut because it is very long)\n` : text;
}

export function reportAsText(report) {
  const out = [`Details of “${report.name}”`, `Location: ${report.path}`, `Made by File Manager on ${report.generatedAt}`, ""];
  for (const g of report.groups) {
    out.push(`== ${g.title} ==`);
    if (g.note) out.push(`(${g.note})`);
    const width = Math.min(34, Math.max(0, ...g.rows.map((r) => r.label.length)));
    for (const r of g.rows) out.push(`${(`${r.label}:`).padEnd(width + 2)}${oneLine(r.value)}`);
    out.push("");
  }
  return clamp(out.join("\n"));
}

const mdCell = (s) => oneLine(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function reportAsMarkdown(report) {
  const out = [`# ${mdCell(report.name)}`, "", `- **Location:** \`${report.path.replace(/`/g, "'")}\``, `- **Made:** ${report.generatedAt} by File Manager`, ""];
  for (const g of report.groups) {
    out.push(`## ${mdCell(g.title)}`, "");
    if (g.note) out.push(`> ${mdCell(g.note)}`, "");
    if (!g.rows.length) continue;
    out.push("| Setting | Value |", "| --- | --- |");
    for (const r of g.rows) out.push(`| ${mdCell(r.label)} | ${mdCell(r.value)} |`);
    out.push("");
  }
  return clamp(out.join("\n"));
}

/** JSON stays valid however long it gets: long values are shortened instead of cutting the text. */
export function reportAsJson(report) {
  let text = JSON.stringify(report, null, 2);
  for (const max of [400, 120, 40]) {
    if (text.length <= MAX_REPORT_CHARS) break;
    const smaller = { ...report, groups: report.groups.map((g) => ({ ...g, rows: g.rows.map((r) => ({ label: r.label.slice(0, max), value: r.value.slice(0, max) })) })) };
    text = JSON.stringify(smaller, null, 2);
  }
  return text;
}

export const FORMATS = {
  text: { label: "Text", ext: "txt", make: reportAsText },
  json: { label: "JSON", ext: "json", make: reportAsJson },
  markdown: { label: "Markdown", ext: "md", make: reportAsMarkdown },
};

/** Does a row match what was typed? Every word must appear in the label or the value (capitals don't matter). */
export function rowMatches(row, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${row.label}\n${row.value}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
