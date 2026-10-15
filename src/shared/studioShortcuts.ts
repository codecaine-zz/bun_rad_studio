// @ts-nocheck
/**
 * Keyboard shortcuts shared by the SQLite, MySQL and PostgreSQL studios.
 *
 *  - Visual Query Designer **Run**: Ctrl/Cmd+Enter and F5, active while the designer tab is showing (also with the
 *    cursor inside one of its fields), runs the Design/Datasheet query or, in the SQL view, the SQL as edited. The key is
 *    consumed in the capture phase, so the SQL console's own Ctrl/Cmd+Enter handler (and the browser's reload on F5) never
 *    sees it. Ctrl/Cmd+R is deliberately NOT used: webviews and browsers reload on it.
 *  - A **Keyboard shortcuts** dialog (header button, Ctrl/Cmd+/ or F1) listing every shortcut; other shared modules add
 *    theirs with StudioShortcuts.add(group, keys, description).
 *
 * The browser full-screen API is not used here.
 */

export const STUDIO_SHORTCUTS_STYLE = `
    /* ===== Keyboard shortcuts ===== */
    .ss-kbd { display: inline-block; margin-left: 6px; padding: 0 5px; min-width: 18px; text-align: center; border-radius: 4px; font: 600 10px/16px var(--font-mono, ui-monospace, monospace); letter-spacing: 0; vertical-align: 1px; border: 1px solid color-mix(in srgb, currentColor 40%, transparent); background: color-mix(in srgb, currentColor 14%, transparent); color: inherit; opacity: 0.9; }
    .ss-sc-group { margin: 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
    .ss-sc-list { display: grid; grid-template-columns: minmax(130px, auto) 1fr; gap: 6px 14px; margin: 4px 0 10px; align-items: center; }
    .ss-sc-list dt { margin: 0; white-space: nowrap; }
    .ss-sc-list dd { margin: 0; color: var(--text-main); font-size: 12px; }
    .ss-key { display: inline-block; padding: 1px 6px; margin-right: 3px; border-radius: 4px; border: 1px solid color-mix(in srgb, var(--text-main) 30%, transparent); border-bottom-width: 2px; background: color-mix(in srgb, var(--text-main) 8%, transparent); font: 600 11px/16px var(--font-mono, ui-monospace, monospace); color: var(--text-main); }
    .ss-btn { display: inline-flex; align-items: center; gap: 4px; }
    .ss-foot-btn { margin-right: 10px; padding: 1px 8px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--text-main) 22%, transparent); background: transparent; color: var(--text-muted); font: inherit; font-size: 11px; cursor: pointer; }
    .ss-foot-btn:hover { color: var(--text-main); background: color-mix(in srgb, var(--text-main) 10%, transparent); }
    .ss-foot-btn:focus-visible { outline: 2px solid var(--cyan); outline-offset: 1px; }
`;

function studioShortcutsClient() {
  if (window.StudioShortcuts) return;
  const isMac = /Mac|iPhone|iPad/i.test((navigator && (navigator.platform || navigator.userAgent)) || "");
  const MOD = isMac ? "\u2318" : "Ctrl";
  const groups = [];
  const add = (group, keys, desc) => {
    let g = groups.find((x) => x.name === group);
    if (!g) { g = { name: group, items: [] }; groups.push(g); }
    if (!g.items.some((i) => i.keys === keys)) g.items.push({ keys, desc });
  };
  const fmt = (keys) => String(keys).replace(/\bMod\b/g, MOD);

  add("Visual Query Designer", "Mod+Enter", "Run the query (Design / Datasheet) or the SQL as written (SQL view)");
  add("Visual Query Designer", "F5", "Run the query, same as Mod+Enter (the page does not reload)");
  add("SQL console", "Mod+Enter", "Run the statement in the SQL editor");
  add("Everywhere", "Mod+/", "Show this list (F1 works too)");
  add("Everywhere", "Esc", "Close the open dialog, menu or popover (only that one)");
  add("Window", "F11", "Toggle the application window's full screen");

  function dialogOpen() { return !!(window.StudioDialogs && window.StudioDialogs.isOpen && window.StudioDialogs.isOpen()); }

  // What the Run button does for the view that is showing
  window.runDesignerActive = function () {
    const st = typeof queryDesignerState !== "undefined" ? queryDesignerState : null;
    if (st && st.activeView === "sql" && typeof runCustomDesignerSql === "function") return runCustomDesignerSql();
    if (typeof runDesignerQuery === "function") return runDesignerQuery();
  };

  function designerShowing() { try { return typeof activeTab !== "undefined" && activeTab === "designer"; } catch (e) { return false; } }

  window.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const run = (mod && !e.altKey && !e.shiftKey && e.key === "Enter") || (e.key === "F5" && !mod && !e.altKey && !e.shiftKey);
    if (run && designerShowing()) {
      if (dialogOpen()) return;
      // consume: the console handler, the textarea's inline handler and the browser's reload must not run
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat || e.isComposing) return;
      window.runDesignerActive();
      return;
    }
    if ((mod && e.key === "/") || (e.key === "F1" && !mod)) {
      if (dialogOpen()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      show();
    }
  }, true);

  function show() {
    const D = window.StudioDialogs;
    if (!D) return null;
    const body = D.el("div", null, ...groups.flatMap((g) => [
      D.el("h3", { class: "ss-sc-group" }, g.name),
      D.el("dl", { class: "ss-sc-list" }, ...g.items.flatMap((i) => [
        D.el("dt", null, ...fmt(i.keys).split("+").map((k) => D.el("kbd", { class: "ss-key" }, k))),
        D.el("dd", null, fmt(i.desc)),
      ])),
    ]));
    const ctl = D.open({ title: "Keyboard shortcuts", body, buttons: [{ label: "Close", kind: "primary", id: "ssClose", onClick: (c) => c.close(null) }] });
    ctl.node.setAttribute("data-ss-dialog", "shortcuts");
    return ctl;
  }

  // The Run button shows its shortcut; the designers call StudioShortcuts.runHint() while rendering
  const runHint = () => '<span class="ss-kbd" aria-hidden="true">' + MOD + "+Enter</span>";
  const runTitle = (t) => (t || "Run query and view Datasheet") + " (" + MOD + "+Enter or F5)";

  function mountButton() {
    if (!document.querySelector || document.getElementById("btnShortcuts")) return;
    const make = (id, cls, text) => {
      const b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.className = cls;
      b.setAttribute("aria-label", "Keyboard shortcuts");
      b.setAttribute("aria-haspopup", "dialog");
      b.title = "Keyboard shortcuts (" + MOD + "+/ or F1)";
      b.textContent = text;
      b.addEventListener("click", () => show());
      return b;
    };
    const anchor = document.getElementById("btnFullscreen");
    const host = anchor ? anchor.parentNode : document.querySelector("header");
    if (host) host.insertBefore(make("btnShortcuts", "btn ss-btn", "\u2328 Shortcuts"), anchor || null);
    // the header can be wider than a narrow window: the footer always shows a way in as well
    const left = document.querySelector("footer > div") || (document.getElementById("footerClock") || {}).parentNode;
    if (left) { const f = make("btnShortcutsFooter", "ss-foot-btn", "\u2328 Shortcuts"); f.style.marginLeft = "12px"; left.appendChild(f); }
  }

  window.StudioShortcuts = { add, show, runHint, runTitle, isMac, mod: MOD, mountButton, groups };
  mountButton();
}

export const STUDIO_SHORTCUTS_SCRIPT = `(${studioShortcutsClient.toString()})();`;
