/**
 * The part of the help tooltips that runs in the page. It is copied into the page as source text (see `helpTips.ts`),
 * so it may only use what is defined inside it, plus `matchTip` and `normalizeLabel`, which are copied in with it.
 */
import { matchTip, normalizeLabel, type ElementInfo } from "./helpMatch";

// Browser globals. Declared here, not through a DOM type library, so they stay local to this file.
declare const document: any;
declare const window: any;
declare const localStorage: any;
declare const innerWidth: number;
declare const innerHeight: number;
declare const MutationObserver: any;
declare const Element: any;
declare const Node: any;
type Element = any;
type ParentNode = any;
type EventTarget = any;
type HTMLInputElement = any;

/**
 * The part that runs in the page. Self-contained: it may only use what is defined inside it or passed in
 * (`normalizeLabel` and `matchTip` are copied in next to it).
 */
export function runHelpEngine(tips: Record<string, string>, selector: string): void {
  const doc = document;
  const win = window as any;
  if (win.__studioHelp) return;
  try {
    if (localStorage.getItem("studioHints") === "off") return;
  } catch {
    // storage may be blocked; hints stay on
  }
  win.__studioHelp = true;

  const bubble = doc.createElement("div");
  bubble.id = "studio-tip";
  bubble.setAttribute("role", "tooltip");
  bubble.hidden = true;
  const style = doc.createElement("style");
  style.textContent =
    "#studio-tip{position:fixed;z-index:2147483000;max-width:min(22rem,calc(100vw - 16px));padding:7px 10px;border-radius:7px;font:12.5px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;" +
    "background:var(--tip-bg,#111827);color:var(--tip-fg,#f9fafb);border:1px solid var(--tip-border,rgba(255,255,255,.22));box-shadow:0 6px 22px rgba(0,0,0,.35);pointer-events:none;white-space:normal;overflow-wrap:anywhere}" +
    "#studio-tip[hidden]{display:none}@media (prefers-reduced-motion:no-preference){#studio-tip{animation:studio-tip-in .12s ease-out}}@keyframes studio-tip-in{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}";
  const attach = () => {
    (doc.head || doc.documentElement).appendChild(style);
    (doc.body || doc.documentElement).appendChild(bubble);
  };
  if (doc.body) attach();
  else doc.addEventListener("DOMContentLoaded", attach, { once: true });

  const infoOf = (el: Element): ElementInfo => {
    const tag = el.tagName.toLowerCase();
    const input = el as HTMLInputElement;
    const isButtonInput = tag === "input" && /^(button|submit|reset)$/i.test(input.type);
    // A checkbox or radio button is named by the label around it, which also carries the id.
    const label = tag === "input" && /^(checkbox|radio)$/i.test(input.type) ? el.closest("label") : null;
    return {
      tag,
      id: el.id || (label && label.id) || "",
      classes: Array.from(el.classList),
      text: isButtonInput ? input.value : label ? (label.textContent || "") : tag === "select" || tag === "textarea" || tag === "input" ? "" : (el.textContent || ""),
      placeholder: el.getAttribute("placeholder") || "",
      aria: el.getAttribute("aria-label") || "",
      name: el.getAttribute("name") || "",
      title: el.getAttribute("title") || "",
      type: el.getAttribute("type") || "",
      role: el.getAttribute("role") || "",
    };
  };

  const prepare = (el: Element) => {
    if ((el as any).__tip !== undefined) return;
    const info = infoOf(el);
    let tip = matchTip(info, tips, normalizeLabel);
    if (!tip && info.title) tip = info.title;
    (el as any).__tip = tip || "";
    if (!tip) return;
    el.setAttribute("data-tip", tip);
    if (el.hasAttribute("title")) {
      // The native tooltip would show a second box. Keep an accessible name for controls that have no other.
      if (!info.text.trim() && !info.aria && !info.placeholder) el.setAttribute("aria-label", info.title);
      el.removeAttribute("title");
    }
  };

  const scan = (root: ParentNode) => {
    if (root instanceof Element && root.matches(selector)) prepare(root);
    root.querySelectorAll(selector).forEach(prepare);
  };

  let timer = 0;
  let current: Element | null = null;
  let keyboard = false;

  const hide = () => {
    clearTimeout(timer);
    bubble.hidden = true;
    if (current) current.removeAttribute("aria-describedby");
    current = null;
  };

  const show = (el: Element) => {
    const tip = el.getAttribute("data-tip");
    if (!tip) return;
    if (current && current !== el) current.removeAttribute("aria-describedby");
    current = el;
    bubble.textContent = tip;
    bubble.hidden = false;
    el.setAttribute("aria-describedby", "studio-tip");
    const r = el.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const pad = 8;
    let left = r.left + r.width / 2 - b.width / 2;
    left = Math.max(pad, Math.min(left, innerWidth - b.width - pad));
    let top = r.bottom + 8;
    if (top + b.height > innerHeight - pad) top = Math.max(pad, r.top - b.height - 8);
    bubble.style.left = left + "px";
    bubble.style.top = top + "px";
  };

  const tipTarget = (node: EventTarget | null): Element | null => (node instanceof Element ? node.closest("[data-tip]") : null);

  doc.addEventListener("pointerover", (e: any) => {
    const el = tipTarget(e.target);
    if (!el || el === current) return;
    clearTimeout(timer);
    timer = win.setTimeout(() => show(el), 450);
  }, true);
  doc.addEventListener("pointerout", (e: any) => {
    const el = tipTarget(e.target);
    if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) hide();
  }, true);
  doc.addEventListener("pointerdown", hide, true);
  doc.addEventListener("scroll", hide, true);
  doc.addEventListener("keydown", (e: any) => {
    keyboard = true;
    if (e.key === "Escape") hide();
  }, true);
  doc.addEventListener("focusin", (e: any) => {
    const el = tipTarget(e.target);
    if (el && keyboard) show(el);
  }, true);
  doc.addEventListener("focusout", hide, true);
  doc.addEventListener("pointermove", () => { keyboard = false; }, true);

  // Controls added later (a page that rebuilds a table, a dialog that opens) get their tips too. Nodes are queued, so
  // none is lost when many arrive within the short pause before they are looked at.
  const queue: Set<any> = new Set();
  const retext: Set<any> = new Set();
  let pending = 0;
  const flush = () => {
    pending = 0;
    const added = Array.from(queue);
    const changed = Array.from(retext);
    queue.clear();
    retext.clear();
    for (const n of added) if (n.isConnected) scan(n);
    // Text that arrives after a control is made (a label that changes) may match a different tip.
    for (const p of changed) if (p.isConnected) { p.__tip = undefined; prepare(p); }
  };
  const observer = new MutationObserver((records: any) => {
    for (const r of records) {
      r.addedNodes.forEach((n: any) => { if (n instanceof Element) queue.add(n); });
      if (r.type === "characterData" && r.target.parentElement) {
        const p = r.target.parentElement.closest(selector);
        if (p) retext.add(p);
      }
    }
    if (!pending && (queue.size || retext.size)) pending = win.setTimeout(flush, 80);
  });

  const start = () => {
    scan(doc);
    observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true, characterData: true });
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

