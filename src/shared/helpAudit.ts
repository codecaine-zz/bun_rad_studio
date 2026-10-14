/**
 * Finds the controls on a page that would have no tooltip. Used by the tests and by `scripts/help_controls.ts`, so
 * what is checked is what the page's script would do (it runs the same `matchTip`).
 */
import { INTERACTIVE_SELECTOR, isSkipped, matchTip, normalizeLabel, type ElementInfo, type HelpTips, type SkipRule } from "./helpMatch";

export interface AuditedControl extends ElementInfo {
  /** The tip it would get, or null. */
  tip: string | null;
}

/** Every control in the page's own HTML (controls made later by script are not in it). */
export async function auditHtml(html: string, tips: HelpTips): Promise<AuditedControl[]> {
  const found: AuditedControl[] = [];
  const stack: Array<{ info: ElementInfo; index: number }> = [];
  const tipOf = (info: ElementInfo) => matchTip(info, tips, normalizeLabel) ?? (info.title || null);
  // Checkboxes and radio buttons are named by the label around them (the label carries the id and the text).
  const labels: Array<{ id: string; text: string; inputs: number[] }> = [];
  const rewriter = new HTMLRewriter().on("label", {
    element(el) {
      const entry = { id: el.getAttribute("id") ?? "", text: "", inputs: [] as number[] };
      labels.push(entry);
      el.onEndTag(() => {
        labels.pop();
        for (const i of entry.inputs) {
          const c = found[i]!;
          c.id = c.id || entry.id;
          c.text = entry.text;
          c.tip = tipOf(c);
        }
      });
    },
    text(chunk) {
      for (const l of labels) l.text += chunk.text;
    },
  }).on(INTERACTIVE_SELECTOR, {
    element(el) {
      const attr = (n: string) => el.getAttribute(n) ?? "";
      const tag = el.tagName.toLowerCase();
      const type = attr("type");
      const info: ElementInfo = {
        tag, id: attr("id"), classes: attr("class").split(/\s+/).filter(Boolean),
        text: tag === "input" ? (/^(button|submit|reset)$/i.test(type) ? attr("value") : "") : "",
        placeholder: attr("placeholder"), aria: attr("aria-label"), name: attr("name"), title: attr("title"), type, role: attr("role"),
      };
      found.push({ ...info, tip: null });
      if (tag === "input") {
        const open = labels[labels.length - 1];
        if (open && /^(checkbox|radio)$/i.test(type)) open.inputs.push(found.length - 1);
        found[found.length - 1]!.tip = tipOf(info);
        return;
      }
      const entry = { info, index: found.length - 1 };
      stack.push(entry);
      el.onEndTag(() => {
        stack.pop();
        found[entry.index]!.text = entry.info.text;
        found[entry.index]!.tip = tipOf(entry.info);
      });
    },
    text(chunk) {
      const top = stack[stack.length - 1];
      if (top && top.info.tag !== "select" && top.info.tag !== "textarea") top.info.text += chunk.text;
    },
  });
  await rewriter.transform(new Response(html)).text();
  return found;
}

/** Controls whose tip is missing, minus the ones the app's skip rules say need none. */
export function uncovered(controls: AuditedControl[], skip: SkipRule[] = []): AuditedControl[] {
  return controls.filter((c) => !c.tip && !isSkipped(c, skip, normalizeLabel));
}

/** A short description for a report. */
export function describe(c: ElementInfo): string {
  const label = normalizeLabel(c.text) || c.placeholder || c.aria || c.name || c.id || c.classes[0] || "";
  return `<${c.tag}${c.type ? ` type=${c.type}` : ""}${c.id ? ` #${c.id}` : ""}> ${JSON.stringify(label.slice(0, 50))}`;
}
